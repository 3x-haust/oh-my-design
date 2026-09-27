import { readContainedRegularFile } from '../reference-selection.ts';
import { canonicalJson, sha256 } from './json.ts';
import { checkpoint, nativeEvent, parseCanonical, readBrowseBytes, replayBrowseKeeps, signed, traceBytes, tracePath, verifySigned } from './trace.ts';
import { browseConfidenceDebt } from './budget.ts';
import { browseFail, type Binding, type BrowseEvent, type BrowseObservation, type Checkpoint, type DriverReply, type Receipt } from './contract.ts';

/** Called only after the client proves its same-host native driver PID is dead. Recovery certifies
 * the last authenticated prefix, not an unknown action or resumed DOM/history. */
export function recoverInterruptedBrowse(binding: Binding, receipt: Receipt, requestId: string): DriverReply {
  const prefix = parseCanonical<Checkpoint>(readBrowseBytes(binding.root, receipt)); verifySigned(binding.root, prefix);
  if (prefix.schema !== 'reference-browse-checkpoint-v1' || prefix.sessionId !== binding.sessionId
    || prefix.sourceContractSha256 !== binding.sourceContractSha256 || prefix.buildSha256 !== binding.buildSha256) browseFail('BROWSE_RECOVERY_BINDING', 'checkpoint does not belong to this session', 2);
  const bytes = readContainedRegularFile(binding.root, tracePath(binding.sessionId), 'checkpointed trace');
  if (sha256(bytes) !== prefix.traceSha256) browseFail('BROWSE_RECOVERY_PREFIX', 'uncheckpointed or changed trace tail; preserve evidence for inspection', 2);
  const events = bytes.toString('utf8').trimEnd().split('\n').map(line => parseCanonical<BrowseEvent>(Buffer.from(`${line}\n`)));
  if (events.length !== prefix.eventCount || events.at(-1)?.hash !== prefix.terminalHash) browseFail('BROWSE_RECOVERY_PREFIX', 'checkpoint count/head differ', 2);
  const observations = new Map<string, BrowseObservation>();
  for (const asset of prefix.assets) {
    const bytes = readBrowseBytes(binding.root, asset);
    if (asset.path.includes('/observations/')) observations.set(asset.sha256, parseCanonical(bytes));
  }
  const keeps = replayBrowseKeeps(events, observations, prefix.mode), time = new Date().toISOString();
  const end = nativeEvent({ schema: 'reference-browse-event-v1', sessionId: binding.sessionId, lane: binding.start.lane,
    seq: events.length, prevHash: prefix.terminalHash, requestId, actor: 'runtime', time,
    elapsedMs: Math.max(events.at(-1)!.elapsedMs, Date.now() - Date.parse(prefix.budget.startedAt)), action: { verb: 'end', reason: 'interrupted' },
    url: null, finalUrl: null, documentId: null, predecessorObservation: events.findLast(event => event.observation)?.observation?.sha256 ?? null,
    target: null, outcome: 'observed', screenshot: null, observation: null, error: null });
  events.push(end);
  const confidenceDebt = browseConfidenceDebt({ sourceContractSha256: binding.sourceContractSha256, lane: binding.start.lane, keeps,
    stopReason: 'interrupted', evidence: [receipt], failures: 1 });
  const seal = signed(binding.root, { schema: 'reference-browse-session-v1' as const, sessionId: binding.sessionId, lane: binding.start.lane,
    sourceContractSha256: binding.sourceContractSha256, buildSha256: prefix.buildSha256, mode: prefix.mode, consent: prefix.consent,
    startedAt: prefix.budget.startedAt, endedAt: time, eventCount: events.length, terminalHash: end.hash,
    trace: { path: tracePath(binding.sessionId), sha256: sha256(traceBytes(events)) }, assets: prefix.assets, keeps, budget: prefix.budget,
    stopReason: 'interrupted' as const, confidenceDebt, recovery: receipt,
    limitations: ['Recovered-interrupted: only the last native checkpoint is certified. Any unacknowledged/unrecorded browser action is unknown; a new session is required for further browsing.'] });
  return { result: { ok: true, outcome: 'recovered-interrupted', sessionId: binding.sessionId, head: end.hash,
    observation: null, budget: prefix.budget, stopReason: 'interrupted', nextAllowed: ['status', 'end'], tray: keeps, snapshotStale: true },
    events: [end], assets: [], checkpoint: checkpoint({ ...binding, budget: prefix.budget }, events, prefix.assets), seal };
}
