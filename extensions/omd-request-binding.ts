import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../core/runtime/stable-project-file.ts';
import { capturePiRequest, PiRequestBindingError, readPiRequest, requestDigest, type PiRequestSource } from './omd-request-source.ts';
import { parseOmdWorkflowPrompt } from './omd-request-prompt.ts';
import { routeValidationArgs } from './omd-route-bootstrap.ts';
import type { PortablePiEvent } from './omd-runtime.ts';
import { PiDirectionInputs } from './omd-direction.ts';
import { observePiReviewPurpose, readPiReviewPurpose } from './omd-review-purpose.ts';
import { isWorkflowResumePrompt, isExplicitWorkflowResumePrompt } from './omd-workflow-resume.ts';

export type PiRequestBindingInfo = Readonly<{ source: 'pi-user-input'; sha256: string; characters: number; authoredRequestReplaced: boolean }>;
export type PiBoundRouteInput = Readonly<{ args: readonly string[]; info?: PiRequestBindingInfo; dispose(): void }>;
const fs = nodeStableProjectFileSystem();

/** User input is pending until Pi starts that exact prompt; queued and repair text cannot replace it. */
export class PiRequestBindings {
  readonly directions = new PiDirectionInputs();
  private readonly pending = new Map<string, Array<{ text: string; source: 'pi-interactive' | 'pi-rpc'; request?: string; direction?: boolean }>>();
  private readonly active = new Map<string, PiRequestSource>();
  private readonly suspended = new Set<string>();
  private readonly failures = new Map<string, PiRequestBindingError>();
  private readonly fullWorkflows = new Set<string>();
  clear(): void { this.directions.clear(); this.pending.clear(); this.active.clear(); this.suspended.clear(); this.failures.clear(); this.fullWorkflows.clear(); }
  classificationGranted(cwd: string): boolean {
    return this.fullWorkflows.has(cwd) && this.active.has(cwd) && !this.suspended.has(cwd) && !this.failures.has(cwd);
  }
  receive(cwd: string, event: PortablePiEvent): void {
    if ((event.source !== 'interactive' && event.source !== 'rpc') || typeof event.text !== 'string') return;
    const parsed = parseOmdWorkflowPrompt(event.text);
    if (parsed?.kind === 'full-build' || isExplicitWorkflowResumePrompt(event.text)) this.directions.renew(cwd);
    const direction = parsed?.kind !== 'full-build' && this.directions.receive(cwd, event);
    const pending = this.pending.get(cwd) ?? [];
    pending.push({ text: event.text, source: event.source === 'rpc' ? 'pi-rpc' : 'pi-interactive', ...(parsed?.kind === 'full-build' ? { request: parsed.request } : {}), ...(direction ? { direction: true } : {}) });
    this.pending.set(cwd, pending);
  }
  activate(cwd: string, prompt: string): boolean {
    const parsed = parseOmdWorkflowPrompt(prompt);
    const pending = this.pending.get(cwd);
    // Pi's documented /skill expansion trims its argument; preserve the earlier real input bytes.
    const index = pending?.findIndex(candidate => candidate.text === prompt || (parsed?.kind === 'full-build'
      && (candidate.request === parsed.request || candidate.request?.trim() === parsed.request)));
    if (pending === undefined || index === undefined || index < 0) return false;
    const candidate = pending[index];
    if (candidate === undefined) return false;
    pending.splice(index, 1);
    if (candidate.direction) {
      const valid = this.directions.activate(cwd, prompt);
      if (valid) { const source = readPiRequest(cwd); if (source) this.active.set(cwd, source); this.suspended.delete(cwd); }
      return valid;
    }
    if (candidate.request !== undefined && parsed?.kind === 'full-build') {
      try {
        this.active.set(cwd, capturePiRequest(cwd, candidate.request));
        observePiReviewPurpose(cwd, candidate.request, candidate.source);
      }
      catch (error) {
        const failure = error instanceof PiRequestBindingError ? error : new PiRequestBindingError('the current user request could not be captured');
        this.failures.set(cwd, failure);
        throw failure;
      }
      this.failures.delete(cwd);
      this.fullWorkflows.add(cwd);
      this.suspended.delete(cwd);
    } else if (parsed?.kind === 'skill-only' || isWorkflowResumePrompt(prompt)) {
      if (isExplicitWorkflowResumePrompt(prompt)) { const source = readPiRequest(cwd); if (source) this.active.set(cwd, source); }
      this.suspended.delete(cwd);
    }
    else { this.suspended.add(cwd); this.fullWorkflows.delete(cwd); }
    return false;
  }
  pin(cwd: string, args: readonly string[]): PiRequestSource | undefined {
    if (args[0] !== 'route' || !['validate', 'classify'].includes(args[1] ?? '')) return;
    const failure = this.failures.get(cwd);
    if (failure) throw failure;
    const current = readPiRequest(cwd);
    if (current?.workflow?.status === 'cancelled') throw new PiRequestBindingError('workflow was cancelled; explicitly resume the build or start a new full request');
    if (current && this.suspended.has(cwd)) throw new PiRequestBindingError('a different user task cannot reuse the previous request; start /skill:omd-ultradesign with the complete new request');
    const previous = this.active.get(cwd);
    if (previous && previous.recordSha256 !== current?.recordSha256) throw new PiRequestBindingError('source is missing or changed during the active task');
    if (current && routeValidationArgs(args) === undefined) throw new PiRequestBindingError('bound route commands require one --input and only supported route options');
    return current;
  }
  async verifyRestored(cwd: string, source: PiRequestSource | undefined, readRoute: () => Promise<{ text: string }>): Promise<void> {
    if (source === undefined || this.active.has(cwd)) return;
    if (existsSync(join(cwd, '.omd/route.json'))) {
      const response: unknown = JSON.parse((await readRoute()).text);
      let digest: string | undefined;
      if (typeof response === 'object' && response !== null) {
        if ('request' in response && typeof response.request === 'string') digest = requestDigest(response.request);
        else if ('schema' in response && response.schema === 'omd-route-summary-v1' && 'requestSource' in response
          && typeof response.requestSource === 'object' && response.requestSource !== null
          && 'sha256' in response.requestSource && typeof response.requestSource.sha256 === 'string') digest = response.requestSource.sha256;
      }
      if (digest !== source.requestSha256) throw new PiRequestBindingError('restored source differs from the authenticated current route');
    }
    this.active.set(cwd, source);
  }
  materialize(cwd: string, args: readonly string[], source: PiRequestSource | undefined): PiBoundRouteInput {
    const direction = args[0] === 'candidate' && args[1] === 'select' && this.directions.isPending(cwd);
    if (source === undefined && !direction) return { args, dispose() {} };
    if (source && readPiRequest(cwd)?.recordSha256 !== source.recordSha256) throw new PiRequestBindingError('queued command belongs to a stale request');
    const command = direction ? routeValidationArgs(['route', 'validate', ...args.slice(2)]) : routeValidationArgs(args);
    if (command === undefined) throw new PiRequestBindingError('bound route input command changed');
    const bytes = readStableProjectFile({ root: cwd, path: resolve(cwd, command.inputPath), label: 'authored route input', fs });
    const input: unknown = JSON.parse(bytes.toString('utf8'));
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new PiRequestBindingError('authored route input must be an object');
    const authoredRequestReplaced = source !== undefined && (!('request' in input) || input.request !== source.request);
    const currentProcess = 'processPolicy' in input && input.processPolicy !== undefined;
    const purpose = !direction && currentProcess ? readPiReviewPurpose(cwd, source!.request) : undefined;
    if (purpose && 'reviewPurpose' in input && input.reviewPurpose !== 'ordinary' && input.reviewPurpose !== purpose.reviewPurpose) throw new PiRequestBindingError('authored review purpose differs from the genuine user/host origin');
    const boundInput = direction ? this.directions.bind(cwd, input) : { ...input, request: source!.request, ...purpose };
    const directory = mkdtempSync(join(tmpdir(), 'omd-bound-route-'));
    const path = join(directory, 'input.json');
    try { writeFileSync(path, JSON.stringify(boundInput), { flag: 'wx', mode: 0o600 }); }
    catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
    const inputIndex = args.indexOf('--input') + 1;
    return { args: args.map((arg, index) => index === inputIndex ? path : arg),
      ...(source === undefined ? {} : { info: { source: 'pi-user-input' as const, sha256: source.requestSha256, characters: source.request.length, authoredRequestReplaced } }),
      dispose() { rmSync(directory, { recursive: true, force: true }); } };
  }
}
