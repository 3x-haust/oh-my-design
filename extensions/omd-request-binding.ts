import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../core/runtime/stable-project-file.ts';
import { capturePiRequest, PiRequestBindingError, readPiRequest, requestDigest, type PiRequestSource } from './omd-request-source.ts';
import { parseOmdWorkflowPrompt } from './omd-request-prompt.ts';
import { routeValidationArgs } from './omd-route-bootstrap.ts';
import type { PortablePiEvent } from './omd-runtime.ts';
import { isWorkflowResumePrompt } from './omd-workflow-resume.ts';

export type PiRequestBindingInfo = Readonly<{ source: 'pi-user-input'; sha256: string; characters: number; authoredRequestReplaced: boolean }>;
export type PiBoundRouteInput = Readonly<{ args: readonly string[]; info?: PiRequestBindingInfo; dispose(): void }>;
const fs = nodeStableProjectFileSystem();

/** User input is pending until Pi starts that exact prompt; queued and repair text cannot replace it. */
export class PiRequestBindings {
  private readonly pending = new Map<string, Array<{ text: string; request?: string }>>();
  private readonly active = new Map<string, PiRequestSource>();
  private readonly suspended = new Set<string>();
  private readonly failures = new Map<string, PiRequestBindingError>();
  private readonly fullWorkflows = new Set<string>();
  clear(): void { this.pending.clear(); this.active.clear(); this.suspended.clear(); this.failures.clear(); this.fullWorkflows.clear(); }
  classificationGranted(cwd: string): boolean {
    return this.fullWorkflows.has(cwd) && this.active.has(cwd) && !this.suspended.has(cwd) && !this.failures.has(cwd);
  }
  receive(cwd: string, event: PortablePiEvent): void {
    if ((event.source !== 'interactive' && event.source !== 'rpc') || typeof event.text !== 'string') return;
    const parsed = parseOmdWorkflowPrompt(event.text);
    const pending = this.pending.get(cwd) ?? [];
    pending.push({ text: event.text, ...(parsed?.kind === 'full-build' ? { request: parsed.request } : {}) });
    this.pending.set(cwd, pending);
  }
  activate(cwd: string, prompt: string): void {
    const parsed = parseOmdWorkflowPrompt(prompt);
    const pending = this.pending.get(cwd);
    // Pi's documented /skill expansion trims its argument; preserve the earlier real input bytes.
    const index = pending?.findIndex(candidate => candidate.text === prompt || (parsed?.kind === 'full-build'
      && (candidate.request === parsed.request || candidate.request?.trim() === parsed.request)));
    if (pending === undefined || index === undefined || index < 0) return;
    const candidate = pending[index];
    if (candidate === undefined) return;
    pending.splice(index, 1);
    if (candidate.request !== undefined && parsed?.kind === 'full-build') {
      try { this.active.set(cwd, capturePiRequest(cwd, candidate.request)); }
      catch (error) {
        const failure = error instanceof PiRequestBindingError ? error : new PiRequestBindingError('the current user request could not be captured');
        this.failures.set(cwd, failure);
        throw failure;
      }
      this.failures.delete(cwd);
      this.fullWorkflows.add(cwd);
      this.suspended.delete(cwd);
    } else if (parsed?.kind === 'skill-only' || isWorkflowResumePrompt(prompt)) this.suspended.delete(cwd);
    else { this.suspended.add(cwd); this.fullWorkflows.delete(cwd); }
  }
  pin(cwd: string, args: readonly string[]): PiRequestSource | undefined {
    if (args[0] !== 'route' || !['validate', 'classify'].includes(args[1] ?? '')) return;
    const failure = this.failures.get(cwd);
    if (failure) throw failure;
    const current = readPiRequest(cwd);
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
    if (source === undefined) return { args, dispose() {} };
    if (readPiRequest(cwd)?.recordSha256 !== source.recordSha256) throw new PiRequestBindingError('queued command belongs to a stale request');
    const command = routeValidationArgs(args);
    if (command === undefined) throw new PiRequestBindingError('bound route input command changed');
    const bytes = readStableProjectFile({ root: cwd, path: resolve(cwd, command.inputPath), label: 'authored route input', fs });
    const input: unknown = JSON.parse(bytes.toString('utf8'));
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new PiRequestBindingError('authored route input must be an object');
    const authoredRequestReplaced = !('request' in input) || input.request !== source.request;
    const directory = mkdtempSync(join(tmpdir(), 'omd-bound-route-'));
    const path = join(directory, 'input.json');
    try { writeFileSync(path, JSON.stringify({ ...input, request: source.request }), { flag: 'wx', mode: 0o600 }); }
    catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
    const inputIndex = args.indexOf('--input') + 1;
    return { args: args.map((arg, index) => index === inputIndex ? path : arg),
      info: { source: 'pi-user-input', sha256: source.requestSha256, characters: source.request.length, authoredRequestReplaced },
      dispose() { rmSync(directory, { recursive: true, force: true }); } };
  }
}
