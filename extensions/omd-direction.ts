import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { candidateDirectionState, directionRoute, type PendingDirection } from '../core/brief/candidate-choice.ts';
import { chosenDirectionId, type DirectionUserInput } from '../core/brief/candidate-authority.ts';
import { digest, hash, jsonBytes, object, type Receipt } from '../core/brief/candidate-data.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { capturePiRequest, readPiRequest, PiRequestBindingError } from './omd-request-source.ts';
import type { PortablePiEvent } from './omd-runtime.ts';
import { isWorkflowCancellationPrompt, isExplicitWorkflowResumePrompt } from './omd-workflow-resume.ts';

/** Focused direction transport, not another approval workflow. Only the input hook can observe
 * answer bytes; CLI JSON, assistant messages and followups cannot create this capability. */
export class PiDirectionInputs {
  private readonly observed = new Map<string, { prompt: string; input: DirectionUserInput; selectedId: string }>();
  private readonly activated = new Map<string, { input: DirectionUserInput; selectedId: string }>();
  private readonly shown = new Map<string, string>();
  private readonly cancelled = new Set<string>();
  clear(): void { this.observed.clear(); this.activated.clear(); this.shown.clear(); this.cancelled.clear(); }
  isPending(cwd: string): boolean {
    return existsSync(join(cwd, '.omd/route-source.json')) && candidateDirectionState(cwd).pending !== null;
  }
  present(cwd: string, pending: PendingDirection): boolean {
    const first = this.shown.get(cwd) !== pending.id; this.shown.set(cwd, pending.id); return first;
  }
  receive(cwd: string, event: PortablePiEvent): boolean {
    if ((event.source !== 'interactive' && event.source !== 'rpc') || typeof event.text !== 'string') return false;
    this.observed.delete(cwd); this.activated.delete(cwd);
    if (isWorkflowCancellationPrompt(event.text)) {
      this.cancelled.add(cwd);
      const source = readPiRequest(cwd);
      if (source) capturePiRequest(cwd, source.request, { status: 'cancelled', userMessage: event.text });
      return false;
    }
    if (isExplicitWorkflowResumePrompt(event.text)) {
      const source = readPiRequest(cwd);
      if (source?.workflow?.status === 'cancelled') capturePiRequest(cwd, source.request, { status: 'active', userMessage: event.text });
      this.cancelled.delete(cwd);
    }
    if (!this.isPending(cwd)) return false;
    const state = candidateDirectionState(cwd), pending = state.pending;
    if (!pending?.presentedSet) return false;
    const selectedId = chosenDirectionId(event.text, pending.optionIds);
    // Ambiguous real answers still preserve the full request. They do not schedule a retry.
    if (selectedId === null) return true;
    const source = readPiRequest(cwd), route = directionRoute(cwd);
    if (!source || source.requestSha256 !== hash(route.request)) throw new PiRequestBindingError('pending direction cannot restore the original authenticated workflow');
    if (source.workflow?.status === 'cancelled') return true;
    const resumeAuthority: Receipt = { path: `.omd/request-sources/sha256-${source.recordSha256}.json`, sha256: source.recordSha256 };
    const payload = { schema: 'direction-user-input-v1' as const, projectRoot: realpathSync(cwd), requestSha256: source.requestSha256,
      sourceContractSha256: route.sourceContractSha256, inputDigest: pending.inputDigest, displayedSet: pending.presentedSet, pendingId: pending.id,
      userMessage: event.text, source: event.source === 'rpc' ? 'pi-rpc' as const : 'pi-interactive' as const, resumeAuthority };
    this.observed.set(cwd, { prompt: event.text, selectedId, input: { ...payload, signature: signNativeObservation(realpathSync(cwd), 'direction-user-input-v1', digest(payload)) } });
    return true;
  }
  activate(cwd: string, prompt: string): boolean {
    const answer = this.observed.get(cwd);
    if (!answer || answer.prompt !== prompt || this.cancelled.has(cwd) || readPiRequest(cwd)?.workflow?.status === 'cancelled') return false;
    const pending = candidateDirectionState(cwd).pending;
    if (pending?.id !== answer.input.pendingId) { this.observed.delete(cwd); return false; }
    this.activated.set(cwd, answer); this.observed.delete(cwd); return true;
  }
  /** Cancellation requires an explicit renewed full workflow/resume, never a queued old repair. */
  renew(cwd: string): void { this.cancelled.delete(cwd); }
  bind(cwd: string, value: unknown): unknown {
    const input = object(value), answer = this.activated.get(cwd);
    if (!answer) throw new PiRequestBindingError('candidate select needs an activated actual user direction answer; continue, tools and assistant text cannot choose');
    const source = readPiRequest(cwd);
    if (source?.workflow?.status === 'cancelled' || source?.recordSha256 !== answer.input.resumeAuthority?.sha256) throw new PiRequestBindingError('direction answer has lost its original workflow/resume authority');
    const pending = candidateDirectionState(cwd).pending;
    if (pending?.id !== answer.input.pendingId || input.selectedId !== answer.selectedId || input.inputDigest !== answer.input.inputDigest) throw new PiRequestBindingError('answer belongs to different options/inputs or a different selected ID');
    const sha256 = hash(jsonBytes(answer.input));
    return { ...input, decision: { decidedBy: 'user', userMessage: answer.input.userMessage, userInputReceipt: { path: `.omd/.cache/sketches/authority/sha256-${sha256}.json`, sha256 }, displayedSet: answer.input.displayedSet }, userInputObservation: answer.input };
  }
}
