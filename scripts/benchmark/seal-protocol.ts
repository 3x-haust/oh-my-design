import { constants, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, closeSync, writeSync, lstatSync, fstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { canonicalJson, sha256, type JsonValue } from './contracts.ts';

export const MAX_FRAME_BYTES = 1024 * 1024;
export const TRANSITION_TIMEOUT_MS = 30_000;
export const ARCHIVE_VERSION = 'dependency-seal-archive-v1';
export type SealMessageType = 'candidate-complete' | 'exit-build' | 'abort-build' | 'exit-ack' | 'shutdown';
export interface SealMessage { schemaVersion: 'seal-protocol-v1'; sealRunId: string; channelNonce: string; sequence: number; type: SealMessageType; ack?: 'exit-build' | 'abort-build'; }
export type SealState = 'CANDIDATE_COMPLETE' | 'AWAITING_EXIT_ACK' | 'SHUTDOWN_WRITE' | 'SHUTDOWN_DRAIN' | 'CLOSED';

function fail(message: string): never { throw new Error(`seal protocol: ${message}`); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('message must be an object'); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, keys: string[]): void { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail('unknown or missing message field'); }
export function validateMessage(value: unknown): SealMessage {
  const item = object(value); if (item.type === 'exit-ack') exactKeys(item, ['schemaVersion', 'sealRunId', 'channelNonce', 'sequence', 'type', 'ack']); else exactKeys(item, ['schemaVersion', 'sealRunId', 'channelNonce', 'sequence', 'type']);
  const { schemaVersion, sealRunId, channelNonce, sequence, type } = item;
  if (schemaVersion !== 'seal-protocol-v1' || typeof sealRunId !== 'string' || !sealRunId) fail('invalid protocol identity');
  if (typeof channelNonce !== 'string' || !/^[0-9a-f]{64}$/.test(channelNonce) || typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0) fail('invalid message fields');
  if (!['candidate-complete', 'exit-build', 'abort-build', 'exit-ack', 'shutdown'].includes(type as string)) fail('unknown message type');
  if (type === 'exit-ack') { if (item.ack !== 'exit-build' && item.ack !== 'abort-build') fail('invalid exit acknowledgement'); return { schemaVersion, sealRunId, channelNonce, sequence, type, ack: item.ack }; }
  return { schemaVersion, sealRunId, channelNonce, sequence, type: type as SealMessageType };
}
export function encodeFrame(message: SealMessage): Buffer { validateMessage(message); const json = Buffer.from(canonicalJson(message as unknown as JsonValue)); if (json.length > MAX_FRAME_BYTES) fail('frame exceeds maximum size'); const frame = Buffer.allocUnsafe(4 + json.length); frame.writeUInt32BE(json.length, 0); json.copy(frame, 4); return frame; }
export class FrameDecoder {
  #pending = Buffer.alloc(0);
  push(chunk: Uint8Array): SealMessage[] { this.#pending = Buffer.concat([this.#pending, Buffer.from(chunk)]); const messages: SealMessage[] = []; while (this.#pending.length >= 4) { const size = this.#pending.readUInt32BE(0); if (size > MAX_FRAME_BYTES) fail('frame exceeds maximum size'); if (this.#pending.length < size + 4) break; const bytes = this.#pending.subarray(4, size + 4); this.#pending = this.#pending.subarray(size + 4); let parsed: unknown; try { parsed = JSON.parse(bytes.toString('utf8')); } catch { fail('invalid JSON frame'); } if (canonicalJson(parsed as JsonValue) !== bytes.toString('utf8')) fail('frame JSON is not canonical'); messages.push(validateMessage(parsed)); } return messages; }
  eof(): void { if (this.#pending.length) fail('partial or trailing frame at EOF'); }
}
export class SealStateMachine {
  #state: SealState = 'CANDIDATE_COMPLETE'; #stateSince: number; #nextSequenceByDirection = { launcher: 0, candidate: 0 }; #exit?: 'exit-build' | 'abort-build';
  readonly sealRunId: string; readonly channelNonce: string; readonly now: () => number;
  constructor(sealRunId: string, channelNonce: string, now: () => number = Date.now) { if (!sealRunId || !/^[0-9a-f]{64}$/.test(channelNonce)) fail('invalid session identity'); this.sealRunId = sealRunId; this.channelNonce = channelNonce; this.now = now; this.#stateSince = now(); }
  get state(): SealState { return this.#state; }
  private transition(state: SealState): void { this.#state = state; this.#stateSince = this.now(); }
  receive(message: SealMessage, direction: 'candidate' | 'launcher'): void {
    if (this.now() - this.#stateSince >= TRANSITION_TIMEOUT_MS) fail('transition timed out'); validateMessage(message);
    if (message.sealRunId !== this.sealRunId || message.channelNonce !== this.channelNonce || message.sequence !== this.#nextSequenceByDirection[direction]) fail('message identity or sequence mismatch');
    const expected = this.#state === 'CANDIDATE_COMPLETE' ? direction === 'candidate' && message.type === 'candidate-complete' : this.#state === 'AWAITING_EXIT_ACK' ? direction === 'launcher' && (message.type === 'exit-build' || message.type === 'abort-build') : this.#state === 'SHUTDOWN_WRITE' ? direction === 'candidate' && message.type === 'exit-ack' && message.ack === this.#exit : this.#state === 'SHUTDOWN_DRAIN' ? direction === 'launcher' && message.type === 'shutdown' : false;
    if (!expected) fail('message is invalid in current state');
    this.#nextSequenceByDirection[direction]++;
    if (this.#state === 'CANDIDATE_COMPLETE') this.transition('AWAITING_EXIT_ACK'); else if (this.#state === 'AWAITING_EXIT_ACK') { this.#exit = message.type as 'exit-build' | 'abort-build'; this.transition('SHUTDOWN_WRITE'); } else if (this.#state === 'SHUTDOWN_WRITE') this.transition('SHUTDOWN_DRAIN'); else this.transition('CLOSED');
  }
  eof(): void { if (this.now() - this.#stateSince >= TRANSITION_TIMEOUT_MS) fail('transition timed out'); if (this.#state !== 'CLOSED') fail('EOF before finite shutdown'); }
}

export interface ArchiveLayout { directory: string; claim: string; snapshot: string; verdict: string; conflicts: string; }
export function archiveLayout(archiveRoot: string, snapshotId: string): ArchiveLayout {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(snapshotId)) fail('invalid snapshot id');
  const directory = join(archiveRoot, snapshotId); return { directory, claim: join(directory, 'claim.json'), snapshot: join(directory, 'snapshot.receipt.json'), verdict: join(directory, 'launcher-verdict.json'), conflicts: join(directory, 'conflicts') };
}
export interface SealClaim { schemaVersion: 'dependency-seal-claim-v1'; snapshotId: string; path: string; finalizationPath: string; finalizationSha256: string; finalizationDomain: string; sealRunId: string; launcherInputSha256: string; claimantRecord: JsonValue; claimantRecordSha256: string; claimantNonce: string; }
export interface SnapshotReceipt { schemaVersion: 'dependency-snapshot-v1.receipt-v1'; state: 'PENDING_LAUNCHER'; snapshotId: string; sealRunId: string; claimantNonce: string; claimPath: string; claimSha256: string; snapshotSha256: string; }
export interface LauncherVerdict { schemaVersion: 'dependency-seal-launch-v1.receipt-v1'; status: 'ACCEPTED' | 'REJECTED'; snapshotId: string; claimPath: string; claimSha256: string; claimantNonce: string; pendingReceiptSha256: string; permit: string; buildEvidenceRoot: string; commitEvidenceRoot: string; observedScope: { directChild: boolean; pgid: number }; finalization: { path: string; device: number; inode: number; modes: string[]; treeSha256: string; readbackSha256: string; toolIdentities: string[] }; reason: string; }
export interface ConflictRecord { schemaVersion: 'dependency-seal-claim-conflict-v1'; snapshotId: string; path: string; claimantRecordSha256: string; reason: 'EEXIST_CLAIM' | 'EEXIST_VERDICT'; }
const hash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const pathFor = (layout: ArchiveLayout, path: string): string => relative(layout.directory, path).replaceAll('\\', '/');
export function claimSha256(claim: SealClaim): string { return sha256(canonicalJson(claim as unknown as JsonValue)); }
function validClaim(value: unknown, layout: ArchiveLayout, snapshotId: string): value is SealClaim { try { const x = object(value); exactKeys(x, ['schemaVersion', 'snapshotId', 'path', 'finalizationPath', 'finalizationSha256', 'finalizationDomain', 'sealRunId', 'launcherInputSha256', 'claimantRecord', 'claimantRecordSha256', 'claimantNonce']); return x.schemaVersion === 'dependency-seal-claim-v1' && x.snapshotId === snapshotId && x.path === pathFor(layout, layout.claim) && typeof x.finalizationPath === 'string' && !!x.finalizationPath && hash(x.finalizationSha256) && typeof x.finalizationDomain === 'string' && !!x.finalizationDomain && typeof x.sealRunId === 'string' && !!x.sealRunId && hash(x.launcherInputSha256) && !!x.claimantRecord && typeof x.claimantRecord === 'object' && hash(x.claimantRecordSha256) && x.claimantRecordSha256 === sha256(canonicalJson(x.claimantRecord as JsonValue)) && hash(x.claimantNonce); } catch { return false; } }
export function validSealClaim(value: unknown, archiveRoot: string, snapshotId: string): value is SealClaim { return validClaim(value, archiveLayout(archiveRoot, snapshotId), snapshotId); }
function validSnapshot(value: unknown, claim: SealClaim, layout: ArchiveLayout, snapshotId: string): value is SnapshotReceipt { try { const x = object(value); exactKeys(x, ['schemaVersion', 'state', 'snapshotId', 'sealRunId', 'claimantNonce', 'claimPath', 'claimSha256', 'snapshotSha256']); return x.schemaVersion === 'dependency-snapshot-v1.receipt-v1' && x.state === 'PENDING_LAUNCHER' && x.snapshotId === snapshotId && x.sealRunId === claim.sealRunId && x.claimantNonce === claim.claimantNonce && x.claimPath === pathFor(layout, layout.claim) && x.claimSha256 === claimSha256(claim) && hash(x.snapshotSha256); } catch { return false; } }
export function validSnapshotReceipt(value: unknown, claim: SealClaim, archiveRoot: string, snapshotId: string): value is SnapshotReceipt { return validSnapshot(value, claim, archiveLayout(archiveRoot, snapshotId), snapshotId); }
function validVerdict(value: unknown, claim: SealClaim, snapshot: SnapshotReceipt, layout: ArchiveLayout, snapshotId: string): value is LauncherVerdict { try { const x = object(value); exactKeys(x, ['schemaVersion', 'status', 'snapshotId', 'claimPath', 'claimSha256', 'claimantNonce', 'pendingReceiptSha256', 'permit', 'buildEvidenceRoot', 'commitEvidenceRoot', 'observedScope', 'finalization', 'reason']); const scope = object(x.observedScope); const finalization = object(x.finalization); exactKeys(scope, ['directChild', 'pgid']); exactKeys(finalization, ['path', 'device', 'inode', 'modes', 'treeSha256', 'readbackSha256', 'toolIdentities']); return x.schemaVersion === 'dependency-seal-launch-v1.receipt-v1' && (x.status === 'ACCEPTED' || x.status === 'REJECTED') && x.snapshotId === snapshotId && x.claimPath === pathFor(layout, layout.claim) && x.claimSha256 === claimSha256(claim) && x.claimantNonce === claim.claimantNonce && x.pendingReceiptSha256 === sha256(canonicalJson(snapshot as unknown as JsonValue)) && typeof x.permit === 'string' && !!x.permit && hash(x.buildEvidenceRoot) && hash(x.commitEvidenceRoot) && scope.directChild === true && typeof scope.pgid === 'number' && Number.isSafeInteger(scope.pgid) && scope.pgid > 0 && finalization.path === claim.finalizationPath && typeof finalization.device === 'number' && Number.isSafeInteger(finalization.device) && finalization.device >= 0 && typeof finalization.inode === 'number' && Number.isSafeInteger(finalization.inode) && finalization.inode >= 0 && Array.isArray(finalization.modes) && finalization.modes.every((mode) => typeof mode === 'string' && mode.length > 0) && hash(finalization.treeSha256) && hash(finalization.readbackSha256) && Array.isArray(finalization.toolIdentities) && finalization.toolIdentities.length > 0 && finalization.toolIdentities.every((tool) => typeof tool === 'string' && tool.length > 0) && typeof x.reason === 'string' && !!x.reason; } catch { return false; } }
export function validLauncherVerdict(value: unknown, claim: SealClaim, snapshot: SnapshotReceipt, archiveRoot: string, snapshotId: string): value is LauncherVerdict { return validVerdict(value, claim, snapshot, archiveLayout(archiveRoot, snapshotId), snapshotId); }
export function validConflictRecord(value: unknown, archiveRoot: string, snapshotId: string, name?: string): value is ConflictRecord {
  try {
    const layout = archiveLayout(archiveRoot, snapshotId); const x = object(value); exactKeys(x, ['schemaVersion', 'snapshotId', 'path', 'claimantRecordSha256', 'reason']);
    const file = name ?? `${x.claimantRecordSha256}.json`;
    return x.schemaVersion === 'dependency-seal-claim-conflict-v1' && x.snapshotId === snapshotId && typeof x.claimantRecordSha256 === 'string' && hash(x.claimantRecordSha256) && x.path === `conflicts/${file}` && (x.reason === 'EEXIST_CLAIM' || x.reason === 'EEXIST_VERDICT') && join(layout.conflicts, file) === join(layout.directory, x.path);
  } catch { return false; }
}
export interface SealArchiveRecords { snapshotId: string; claim: SealClaim; snapshot: SnapshotReceipt; verdict: LauncherVerdict; conflicts: ConflictRecord[]; }
/** Reads every complete flat archive directory and validates its producer record bindings. */
export function readSealArchiveRecords(archiveRoot: string): SealArchiveRecords[] {
  return readdirSync(archiveRoot).sort().map(snapshotId => {
    const layout = archiveLayout(archiveRoot, snapshotId);
    const names = readdirSync(layout.directory).sort();
    if (names.join(',') !== 'claim.json,conflicts,launcher-verdict.json,snapshot.receipt.json') fail(`archive ${snapshotId} layout is malformed`);
    if (!lstatSync(layout.directory).isDirectory() || lstatSync(layout.directory).isSymbolicLink() || !lstatSync(layout.conflicts).isDirectory() || lstatSync(layout.conflicts).isSymbolicLink()) fail(`archive ${snapshotId} contains a symlink`);
    const claim = canonicalFile(layout.claim); if (!validSealClaim(claim, archiveRoot, snapshotId)) fail(`archive ${snapshotId} claim is malformed`);
    const snapshot = canonicalFile(layout.snapshot); if (!validSnapshotReceipt(snapshot, claim, archiveRoot, snapshotId)) fail(`archive ${snapshotId} snapshot is malformed`);
    const verdict = canonicalFile(layout.verdict); if (!validLauncherVerdict(verdict, claim, snapshot, archiveRoot, snapshotId)) fail(`archive ${snapshotId} verdict is malformed`);
    const conflicts = readdirSync(layout.conflicts).sort().map(name => {
      if (!/^[0-9a-f]{64}\.json$/.test(name)) fail(`archive ${snapshotId} conflict layout is malformed`);
      const record = canonicalFile(join(layout.conflicts, name));
      if (!validConflictRecord(record, archiveRoot, snapshotId, name)) fail(`archive ${snapshotId} conflict is malformed`);
      return record;
    });
    return { snapshotId, claim, snapshot, verdict, conflicts };
  });
}
function canonicalFile(path: string): unknown {
  const before = lstatSync(path); if (!before.isFile() || before.isSymbolicLink()) fail(`durable record is not a regular file: ${path}`);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: string; try { const after = fstatSync(fd); if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino) fail(`durable record changed while opening: ${path}`); bytes = readFileSync(fd, 'utf8'); } finally { closeSync(fd); }
  const parsed = JSON.parse(bytes) as JsonValue; if (canonicalJson(parsed) !== bytes) fail(`noncanonical durable record: ${path}`); return parsed;
}
function durableWrite(path: string, record: JsonValue): void { mkdirSync(join(path, '..'), { recursive: true }); const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); try { writeSync(fd, canonicalJson(record)); fsyncSync(fd); } finally { closeSync(fd); } const directory = openSync(join(path, '..'), constants.O_RDONLY); try { fsyncSync(directory); } finally { closeSync(directory); } }
export function writeSealConflict(archiveRoot: string, snapshotId: string, claimantRecord: JsonValue, reason: ConflictRecord['reason']): ConflictRecord | undefined { const layout = archiveLayout(archiveRoot, snapshotId); const claimantRecordSha256 = sha256(canonicalJson(claimantRecord)); const record: ConflictRecord = { schemaVersion: 'dependency-seal-claim-conflict-v1', snapshotId, path: `conflicts/${claimantRecordSha256}.json`, claimantRecordSha256, reason }; try { durableWrite(join(layout.directory, record.path), record as unknown as JsonValue); return record; } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return record; return undefined; } }
export function createSealClaim(archiveRoot: string, claim: SealClaim): { created: boolean; conflict?: ConflictRecord } { const layout = archiveLayout(archiveRoot, claim.snapshotId); if (!validClaim(claim, layout, claim.snapshotId)) fail('invalid claim'); mkdirSync(layout.conflicts, { recursive: true }); try { durableWrite(layout.claim, claim as unknown as JsonValue); return { created: true }; } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; const conflict = writeSealConflict(archiveRoot, claim.snapshotId, claim.claimantRecord, 'EEXIST_CLAIM'); return conflict ? { created: false, conflict } : { created: false }; } }
export function writeLauncherVerdict(archiveRoot: string, verdict: LauncherVerdict, claimantRecord: JsonValue): { created: boolean; conflict?: ConflictRecord } { const layout = archiveLayout(archiveRoot, verdict.snapshotId); try { durableWrite(layout.verdict, verdict as unknown as JsonValue); return { created: true }; } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; const conflict = writeSealConflict(archiveRoot, verdict.snapshotId, claimantRecord, 'EEXIST_VERDICT'); return conflict ? { created: false, conflict } : { created: false }; } }
export function evaluateEligibility(archiveRoot: string, snapshotId: string): { eligible: boolean; permanent: boolean; reason: string } {
  const reject = (reason: string) => ({ eligible: false, permanent: true, reason }); let layout: ArchiveLayout; try { layout = archiveLayout(archiveRoot, snapshotId); const names = readdirSync(layout.directory).sort(); if (!names.every((name) => ['claim.json', 'conflicts', 'launcher-verdict.json', 'snapshot.receipt.json'].includes(name))) return reject('archive layout is malformed or preexisting'); const conflictNames = readdirSync(layout.conflicts).sort(); if (conflictNames.length) { for (const name of conflictNames) { if (!/^[0-9a-f]{64}\.json$/.test(name)) return reject('conflict layout is malformed'); const conflict = object(canonicalFile(join(layout.conflicts, name))); exactKeys(conflict, ['schemaVersion', 'snapshotId', 'path', 'claimantRecordSha256', 'reason']); if (conflict.schemaVersion !== 'dependency-seal-claim-conflict-v1' || conflict.snapshotId !== snapshotId || conflict.path !== `conflicts/${name}` || conflict.claimantRecordSha256 !== name.slice(0, -5) || (conflict.reason !== 'EEXIST_CLAIM' && conflict.reason !== 'EEXIST_VERDICT')) return reject('conflict record is malformed'); } return reject('durable conflict exists'); } if (names.join(',') !== 'claim.json,conflicts,launcher-verdict.json,snapshot.receipt.json') return reject('archive layout is malformed or preexisting'); const claim = canonicalFile(layout.claim); if (!validClaim(claim, layout, snapshotId)) return reject('claim is malformed'); const snapshot = canonicalFile(layout.snapshot); if (!validSnapshot(snapshot, claim, layout, snapshotId)) return reject('snapshot receipt does not bind claim'); const verdict = canonicalFile(layout.verdict); if (!validVerdict(verdict, claim, snapshot, layout, snapshotId)) return reject('launcher verdict is missing or malformed'); if (verdict.status !== 'ACCEPTED') return reject('launcher rejected claim'); return { eligible: true, permanent: false, reason: 'accepted claim is fully bound' }; } catch { return reject('durable archive is missing or malformed'); }
}
