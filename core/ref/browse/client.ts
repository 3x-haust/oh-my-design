import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectRunInvocation } from '../../runtime/invocation.ts';
import { recordConfidenceDebt } from '../../brief/confidence-debt.ts';
import { browseDebtToConfidenceDebt } from './confidence-debt.ts';
import { requireProjectWriteInvocation } from '../../runtime/invocation.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../../runtime/project-write.ts';
import { readContainedRegularFile } from '../reference-selection.ts';
import { canonicalJson, sha256 } from './json.ts';
import { referenceServiceFamily } from '../design-discovery-sources.ts';
import { authorizeBrowseConsent } from './safety.ts';
import { issueBrowseCommandTicket } from './authority.ts';
import type { DriverRequest } from './driver.ts';
import { parseCanonical, signed, traceBytes, tracePath, verifySigned } from './trace.ts';
import { publishBrowseRetentions } from './retention.ts';
import { publishBrowseFlowProjection } from './flow.ts';
import { recoverInterruptedBrowse } from './recovery.ts';
import { browseFail, type Binding, type BrowseBudget, type BrowseCommand, type BrowseEvent, type BrowseResult, type BrowseSummary, type DriverReply, type Receipt } from './contract.ts';

export type BrowseConnection = Readonly<{ endpoint: string; capability: string; challenge: string; pid: number }>;
type State = Readonly<{ schema: 'reference-browse-private-v1'; binding: Binding; host: string; pid: number; connection: BrowseConnection | null;
  head: string | null; checkpoint: Receipt | null; seal: Receipt | null }>;
export type BrowseClientDependencies = Readonly<{ launch?: (binding: Binding) => Promise<BrowseConnection> }>;
const currentPath = '.omd/.cache/ref-browse/current.json';
const statePath = (id: string) => `.omd/.cache/ref-browse/${id}/state.json`;
function readState(root: string, id: string): State {
  if (!/^[a-f0-9]{32}$/.test(id)) browseFail('BROWSE_SESSION_ID', 'invalid session id', 2);
  return parseCanonical<State>(readContainedRegularFile(root, statePath(id), 'private browse state'));
}
export function readBrowsePointer(root: string): { sessionId: string } | null {
  if (!existsSync(resolve(root, currentPath))) return null;
  return parseCanonical(readContainedRegularFile(root, currentPath, 'browse session pointer'));
}
async function launchDaemon(binding: Binding): Promise<BrowseConnection> {
  const child = fork(fileURLToPath(new URL('./daemon.ts', import.meta.url)), [], { cwd: binding.root, detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
  const ready = new Promise<BrowseConnection>((resolveReady, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('BROWSE_DRIVER_READY_TIMEOUT')); }, 20_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`BROWSE_DRIVER_EXIT: ${code}`)); });
    child.once('message', message => {
      clearTimeout(timer);
      const value = message as BrowseConnection & { ready: boolean };
      if (!value.ready) { reject(new Error('BROWSE_DRIVER_START_FAILED')); return; }
      resolveReady({ endpoint: value.endpoint, capability: value.capability, challenge: value.challenge, pid: value.pid });
    });
  });
  child.send(binding); const result = await ready; child.unref(); return result;
}
async function rpc<T>(state: State, args: DriverRequest, invocation: ProjectRunInvocation, writer: ProjectWriteAdapter, requestId = randomBytes(16).toString('hex')): Promise<T> {
  if (!state.connection) browseFail('BROWSE_DRIVER_LOST', 'driver is unavailable; end interrupted or start a new session', 2);
  const endpoint = new URL(state.connection.endpoint);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/' || !endpoint.port) browseFail('BROWSE_RPC_ENDPOINT', 'invalid private driver endpoint', 2);
  const ticket = issueBrowseCommandTicket(state.binding, state.connection.challenge, requestId, args, invocation, writer);
  const response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${state.connection.capability}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ticket, args }), redirect: 'error', signal: AbortSignal.timeout(60_000) });
  const text = await response.text(); if (text.length > 360 * 1024 * 1024) browseFail('BROWSE_RPC_SIZE', 'reply exceeds session bound', 2);
  const value = JSON.parse(text);
  if (!response.ok) browseFail(value.code ?? 'BROWSE_RPC_FAILED', value.message ?? 'driver failed', value.exitCode ?? 2);
  return value as T;
}
function publish(root: string, state: State, reply: DriverReply, invocation: ProjectRunInvocation, writer: ProjectWriteAdapter): State {
  if (!reply.events.length && !reply.seal) return state;
  if (reply.checkpoint) verifySigned(root, reply.checkpoint);
  if (reply.seal) verifySigned(root, reply.seal);
  const release = acquireProjectMutationLock(root, invocation);
  try {
    const disk = readState(root, state.binding.sessionId);
    if (disk.head !== state.head && disk.head !== reply.result.head) browseFail('BROWSE_PUBLICATION_RACE', 'disk head changed', 2);
    let events: BrowseEvent[] = existsSync(resolve(root, tracePath(state.binding.sessionId)))
      ? readContainedRegularFile(root, tracePath(state.binding.sessionId), 'browse trace').toString('utf8').trimEnd().split('\n').filter(Boolean).map(line => parseCanonical<BrowseEvent>(Buffer.from(`${line}\n`))) : [];
    for (const event of reply.events) {
      const { hash, ...unsigned } = event;
      if (sha256(canonicalJson(unsigned)) !== hash || event.sessionId !== state.binding.sessionId) browseFail('BROWSE_REPLY_INTEGRITY', 'event identity/digest differs', 2);
      if (events[event.seq]) { if (canonicalJson(events[event.seq]) !== canonicalJson(event)) browseFail('BROWSE_PREFIX_CHANGED', 'published prefix differs', 2); }
      else { if (event.seq !== events.length || event.prevHash !== (events.at(-1)?.hash ?? null)) browseFail('BROWSE_PREFIX_CHANGED', 'event does not extend published prefix', 2); events.push(event); }
    }
    if (reply.checkpoint && (reply.checkpoint.traceSha256 !== sha256(traceBytes(events)) || reply.checkpoint.terminalHash !== events.at(-1)?.hash)) browseFail('BROWSE_CHECKPOINT', 'checkpoint does not bind proposed prefix', 2);
    for (const item of reply.assets) {
      const bytes = Buffer.from(item.base64, 'base64');
      if (sha256(bytes) !== item.receipt.sha256 || !item.receipt.path.startsWith(`.omd/discovery/browse/${state.binding.sessionId}/`)) browseFail('BROWSE_REPLY_ASSET', 'asset identity/digest differs', 2);
      writer.writeContentAddressed(item.receipt.path, bytes);
    }
    for (const event of events) writer.writeContentAddressed(`.omd/discovery/browse/${state.binding.sessionId}/events/${event.hash}.json`, `${canonicalJson(event)}\n`);
    replaceProjectFileAtomically({ projectRoot: root, relativePath: tracePath(state.binding.sessionId), content: traceBytes(events), invocation });
    let checkpointReceipt = disk.checkpoint, sealReceipt = disk.seal;
    for (const [directory, value] of [['checkpoints', reply.checkpoint], ['seals', reply.seal]] as const) if (value) {
      const bytes = `${canonicalJson(value)}\n`, sha = sha256(bytes), receipt = { path: `.omd/discovery/browse/${state.binding.sessionId}/${directory}/${sha}.json`, sha256: sha };
      writer.writeContentAddressed(receipt.path, bytes); if (directory === 'checkpoints') checkpointReceipt = receipt; else sealReceipt = receipt;
    }
    const next = { ...disk, head: reply.result.head, checkpoint: checkpointReceipt, seal: sealReceipt, binding: { ...disk.binding, budget: reply.result.budget } };
    replaceProjectFileAtomically({ projectRoot: root, relativePath: statePath(state.binding.sessionId), content: `${canonicalJson(next)}\n`, invocation, mode: 0o600 });
    const cycle = signed(root, { schema: 'reference-browse-budget-v1', sourceContractSha256: state.binding.sourceContractSha256, budget: reply.result.budget });
    replaceProjectFileAtomically({ projectRoot: root, relativePath: `.omd/.cache/ref-browse/budget-${state.binding.sourceContractSha256}.json`, content: `${canonicalJson(cycle)}\n`, invocation, mode: 0o600 });
    return next;
  } finally { release(); }
}
function finish(root: string, state: State, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation, currentSourceContractSha256: string): BrowseSummary {
  if (!state.seal) browseFail('BROWSE_SEAL_REQUIRED', 'session not finalized', 2);
  const retained = publishBrowseRetentions(root, state.seal, writer), flows = publishBrowseFlowProjection(root, state.seal, writer);
  const { verifyBrowseSession } = verification;
  const { seal } = verifyBrowseSession(root, state.seal);
  const summary: BrowseSummary = { schema: 'reference-browse-summary-v1', session: state.seal, sessionId: seal.sessionId, lane: seal.lane,
    sourceContractSha256: seal.sourceContractSha256, stopReason: seal.stopReason,
    counts: { actions: seal.budget.actions, keeps: seal.keeps.length, families: new Set(seal.keeps.map(keep => referenceServiceFamily(keep.source))).size },
    retained, flows, confidenceDebt: seal.confidenceDebt, researchStatus: seal.keeps.length ? 'partial' : 'unavailable', productionEntryBlocking: false };
  writer.write(`.omd/discovery/browse/${seal.sessionId}/summary.json`, `${canonicalJson(summary)}\n`);
  if (seal.sourceContractSha256 === currentSourceContractSha256) recordConfidenceDebt(root, seal.sourceContractSha256, seal.confidenceDebt.map(browseDebtToConfidenceDebt), invocation);
  return summary;
}
import * as verification from './verification.ts';
export async function executeBrowseCommand(rootInput: string, command: BrowseCommand, route: { sourceContractSha256: string; request: string },
  invocation: ProjectRunInvocation, writer: ProjectWriteAdapter, dependencies: BrowseClientDependencies = {}): Promise<BrowseResult> {
  const root = realpathSync(rootInput); requireProjectWriteInvocation(invocation); requireProjectWriteAdapterForInvocation(root, writer, invocation);
  let state: State;
  if (command.action.verb === 'start') {
    const start = command.action, now = Date.now();
    const consent = authorizeBrowseConsent(start, route.request, route.sourceContractSha256, now);
    const sessionId = randomBytes(16).toString('hex'), release = acquireProjectMutationLock(root, invocation);
    try {
      const existing = readBrowsePointer(root);
      if (existing && !readState(root, existing.sessionId).seal) browseFail('BROWSE_SESSION_BUSY', 'end the existing live/interrupted session first', 2);
      const cyclePath = `.omd/.cache/ref-browse/budget-${route.sourceContractSha256}.json`;
      let budget: BrowseBudget = { startedAt: new Date(now).toISOString(), deadline: new Date(now + start.budgetMinutes * 60_000).toISOString(), maxActions: start.budgetActions, actions: 0, metadataEvents: 0 };
      if (existsSync(resolve(root, cyclePath))) {
        const cycle = parseCanonical<{ schema: string; sourceContractSha256: string; budget: BrowseBudget; signature: string }>(readContainedRegularFile(root, cyclePath, 'browse cycle budget')); verifySigned(root, cycle); budget = cycle.budget;
        if (start.budgetActions > budget.maxActions || now >= Date.parse(budget.deadline) || budget.actions >= budget.maxActions || budget.metadataEvents >= 128) browseFail('BROWSE_CYCLE_BUDGET', 'research-cycle allowance exhausted; restarting cannot grant a new budget', 3);
      }
      const binding: Binding = { root, sessionId, sourceContractSha256: route.sourceContractSha256, buildSha256: invocation.current.buildSha256, consent, start, budget };
      // A fresh random session directory is created by the guarded writer under a restrictive
      // umask. This synchronous section restores process policy before any browser/network await.
      const previousMask = process.umask(0o077);
      try { writer.mkdir(`.omd/.cache/ref-browse/${sessionId}`); } finally { process.umask(previousMask); }
      state = { schema: 'reference-browse-private-v1', binding, host: hostname(), pid: process.pid, connection: null, head: null, checkpoint: null, seal: null };
      replaceProjectFileAtomically({ projectRoot: root, relativePath: statePath(sessionId), content: `${canonicalJson(state)}\n`, invocation, mode: 0o600 });
      replaceProjectFileAtomically({ projectRoot: root, relativePath: currentPath, content: `${canonicalJson({ sessionId })}\n`, invocation, mode: 0o600 });
    } finally { release(); }
    const { endpoint, capability, challenge, pid } = await (dependencies.launch ?? launchDaemon)(state.binding);
    state = { ...state, pid, connection: { endpoint, capability, challenge, pid } };
    replaceProjectFileAtomically({ projectRoot: root, relativePath: statePath(state.binding.sessionId), content: `${canonicalJson(state)}\n`, invocation, mode: 0o600 });
  } else {
    const id = command.session ?? readBrowsePointer(root)?.sessionId ?? browseFail('BROWSE_SESSION_MISSING', 'start a recorded browser session', 2);
    state = readState(root, id);
  }
  if ((state.binding.sourceContractSha256 !== route.sourceContractSha256 || state.binding.buildSha256 !== invocation.current.buildSha256)
    && !['end', 'status'].includes(command.action.verb)) browseFail('BROWSE_CONTRACT_STALE', 'route/build changed; historical session cannot acquire new evidence', 2);
  if (state.seal) {
    if (!['end', 'status'].includes(command.action.verb)) browseFail('BROWSE_ENDED', 'session already sealed', 2);
    const summary = command.action.verb === 'end' ? finish(root, state, writer, invocation, route.sourceContractSha256) : null;
    const { seal } = verification.verifyBrowseSession(root, state.seal);
    return { ok: true, outcome: 'sealed', sessionId: seal.sessionId, head: seal.terminalHash, observation: null, budget: seal.budget,
      stopReason: seal.stopReason, nextAllowed: ['status', 'end'], tray: seal.keeps, snapshotStale: true, seal: state.seal,
      confidenceDebt: seal.confidenceDebt, ...(summary ? { retained: summary.retained } : {}) };
  }
  if (command.action.verb === 'end' && command.action.reason === 'interrupted' && state.host === hostname() && state.checkpoint) {
    let dead = false;
    try { process.kill(state.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') dead = true; else throw error; }
    if (dead) {
      const reply = recoverInterruptedBrowse(state.binding, state.checkpoint, randomBytes(16).toString('hex'));
      state = publish(root, state, reply, invocation, writer);
      const summary = finish(root, state, writer, invocation, route.sourceContractSha256);
      return { ...reply.result, seal: state.seal!, retained: summary.retained, confidenceDebt: summary.confidenceDebt };
    }
  }
  const pending = await rpc<{ id: string; reply: DriverReply } | null>(state, { operation: 'pending' }, invocation, writer);
  if (pending) {
    state = publish(root, state, pending.reply, invocation, writer);
    const summary = state.seal ? finish(root, state, writer, invocation, route.sourceContractSha256) : null;
    await rpc(state, { operation: 'ack', requestId: pending.id, head: pending.reply.result.head }, invocation, writer);
    if (summary) return { ...pending.reply.result, seal: summary.session, retained: summary.retained, confidenceDebt: summary.confidenceDebt };
  }
  const requestId = randomBytes(16).toString('hex');
  const reply = await rpc<DriverReply>(state, { operation: 'action', action: command.action, expectHead: command.expectHead ?? state.head }, invocation, writer, requestId);
  state = publish(root, state, reply, invocation, writer);
  let result = reply.result;
  if (state.seal) { const summary = finish(root, state, writer, invocation, route.sourceContractSha256); result = { ...result, seal: state.seal, retained: summary.retained, confidenceDebt: summary.confidenceDebt }; }
  if (reply.events.length || reply.seal) await rpc(state, { operation: 'ack', requestId, head: reply.result.head }, invocation, writer);
  return result;
}
