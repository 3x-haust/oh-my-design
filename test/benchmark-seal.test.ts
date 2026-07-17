import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { archiveLayout, FrameDecoder, SealStateMachine, TRANSITION_TIMEOUT_MS, claimSha256, createSealClaim, encodeFrame, evaluateEligibility, writeLauncherVerdict, type LauncherVerdict, type SealClaim, type SealMessage, type SnapshotReceipt } from '../scripts/benchmark/seal-protocol.ts';
import { canonicalJson, sha256 } from '../scripts/benchmark/contracts.ts';

const nonce = 'a'.repeat(64);
const snapshotId = 'snapshot-1';
const message = (sequence: number, type: SealMessage['type'], ack?: 'exit-build' | 'abort-build'): SealMessage => ({ schemaVersion: 'seal-protocol-v1', sealRunId: 'run-1', channelNonce: nonce, sequence, type, ...(ack ? { ack } : {}) });
function fixture(root: string, id = snapshotId): { claim: SealClaim; snapshot: SnapshotReceipt; verdict: LauncherVerdict } {
  const layout = archiveLayout(root, id);
  const claimantRecord = { actor: 'candidate', input: 'x'.repeat(64) };
  const claim: SealClaim = { schemaVersion: 'dependency-seal-claim-v1', snapshotId: id, path: 'claim.json', finalizationPath: 'final/result.json', finalizationSha256: 'b'.repeat(64), finalizationDomain: 'bundle-v1', sealRunId: 'run-1', launcherInputSha256: 'c'.repeat(64), claimantRecord, claimantRecordSha256: sha256(canonicalJson(claimantRecord)), claimantNonce: nonce };
  assert.equal(createSealClaim(root, claim).created, true);
  const snapshot: SnapshotReceipt = { schemaVersion: 'dependency-snapshot-v1.receipt-v1', state: 'PENDING_LAUNCHER', snapshotId: id, sealRunId: 'run-1', claimantNonce: nonce, claimPath: 'claim.json', claimSha256: claimSha256(claim), snapshotSha256: 'd'.repeat(64) };
  writeFileSync(layout.snapshot, canonicalJson(snapshot as unknown as import('../scripts/benchmark/contracts.ts').JsonValue));
  const verdict: LauncherVerdict = { schemaVersion: 'dependency-seal-launch-v1.receipt-v1', status: 'ACCEPTED', snapshotId: id, claimPath: 'claim.json', claimSha256: claimSha256(claim), claimantNonce: nonce, pendingReceiptSha256: sha256(canonicalJson(snapshot as unknown as import('../scripts/benchmark/contracts.ts').JsonValue)), permit: 'permit-1', buildEvidenceRoot: 'e'.repeat(64), commitEvidenceRoot: 'f'.repeat(64), observedScope: { directChild: true, pgid: 12 }, finalization: { path: 'final/result.json', device: 1, inode: 2, modes: ['0600'], treeSha256: '1'.repeat(64), readbackSha256: 'b'.repeat(64), toolIdentities: ['node@22'] }, reason: 'complete evidence accepted' };
  return { claim, snapshot, verdict };
}
function archive(): string { return mkdtempSync(join(tmpdir(), 'seal-protocol-')); }

test('schemas strictly declare snapshot, verdict, and conflict records', () => {
  for (const name of ['dependency-snapshot-v1.receipt.schema.json', 'dependency-seal-launch-v1.receipt.schema.json', 'dependency-seal-claim-conflict-v1.schema.json']) {
    const schema = JSON.parse(readFileSync(new URL(`../evals/product-ux/harness/bundle-v1/${name}`, import.meta.url), 'utf8')) as { additionalProperties: boolean };
    assert.equal(schema.additionalProperties, false);
  }
});

test('FD3 requires candidate-complete, directional sequences, finite shutdown and EOF', () => {
  const frame = encodeFrame(message(0, 'candidate-complete'));
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(frame.subarray(0, 2)), []); assert.deepEqual(decoder.push(frame.subarray(2)), [message(0, 'candidate-complete')]); decoder.eof();
  const nonCanonical = Buffer.from('{"type":"candidate-complete","schemaVersion":"seal-protocol-v1","sealRunId":"run-1","channelNonce":"' + nonce + '","sequence":0}'); const bad = Buffer.alloc(4 + nonCanonical.length); bad.writeUInt32BE(nonCanonical.length); nonCanonical.copy(bad, 4); assert.throws(() => new FrameDecoder().push(bad), /canonical/);
  let now = 0; const machine = new SealStateMachine('run-1', nonce, () => now);
  assert.throws(() => machine.receive(message(0, 'exit-build'), 'launcher'), /current state/);
  machine.receive(message(0, 'candidate-complete'), 'candidate'); machine.receive(message(0, 'exit-build'), 'launcher'); assert.throws(() => machine.receive(message(1, 'exit-ack', 'abort-build'), 'candidate'), /current state/); machine.receive(message(1, 'exit-ack', 'exit-build'), 'candidate'); machine.receive(message(1, 'shutdown'), 'launcher'); machine.eof();
  assert.equal(machine.state, 'CLOSED'); assert.throws(() => encodeFrame({ ...message(0, 'candidate-complete'), future: true } as unknown as SealMessage), /unknown/);
  now = 0; const timed = new SealStateMachine('run-1', nonce, () => now); now = TRANSITION_TIMEOUT_MS; assert.throws(() => timed.receive(message(0, 'candidate-complete'), 'candidate'), /timed out/);
});

test('strict durable records bind claim, pending receipt, and complete accepted evidence', () => {
  const root = archive(); try { const { claim, verdict } = fixture(root); assert.equal(writeLauncherVerdict(root, verdict, claim.claimantRecord).created, true); assert.deepEqual(evaluateEligibility(root, snapshotId), { eligible: true, permanent: false, reason: 'accepted claim is fully bound' }); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('claim and verdict EEXIST create durable conflicts and competing claimants stay rejected', () => {
  const root = archive(); try {
    const { claim, verdict } = fixture(root); const competing = { ...claim, claimantRecord: { actor: 'other' }, claimantRecordSha256: sha256(canonicalJson({ actor: 'other' })), claimantNonce: 'b'.repeat(64) };
    const claimCollision = createSealClaim(root, competing); assert.equal(claimCollision.created, false); assert.ok(claimCollision.conflict); assert.equal(evaluateEligibility(root, snapshotId).reason, 'durable conflict exists');
    const second = archive(); try { const ready = fixture(second); assert.equal(writeLauncherVerdict(second, ready.verdict, ready.claim.claimantRecord).created, true); const collision = writeLauncherVerdict(second, ready.verdict, ready.claim.claimantRecord); assert.equal(collision.created, false); assert.ok(collision.conflict); assert.equal(evaluateEligibility(second, snapshotId).permanent, true); } finally { rmSync(second, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing, malformed, rejected, and future durable records are permanently ineligible', () => {
  const root = archive(); try {
    const { claim, verdict } = fixture(root); assert.equal(evaluateEligibility(root, snapshotId).permanent, true);
    assert.equal(writeLauncherVerdict(root, verdict, claim.claimantRecord).created, true); const layout = archiveLayout(root, snapshotId); writeFileSync(layout.verdict, canonicalJson({ ...verdict, status: 'REJECTED' } as unknown as import('../scripts/benchmark/contracts.ts').JsonValue)); assert.equal(evaluateEligibility(root, snapshotId).reason, 'launcher rejected claim');
    writeFileSync(layout.verdict, canonicalJson(verdict as unknown as import('../scripts/benchmark/contracts.ts').JsonValue)); writeFileSync(join(layout.directory, 'future.json'), '{}'); assert.equal(evaluateEligibility(root, snapshotId).permanent, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
  const malformed = archive(); try { const layout = archiveLayout(malformed, snapshotId); mkdirSync(layout.directory, { recursive: true }); writeFileSync(layout.claim, '{}'); mkdirSync(layout.conflicts); writeFileSync(layout.snapshot, '{}'); writeFileSync(layout.verdict, '{}'); assert.equal(evaluateEligibility(malformed, snapshotId).permanent, true); } finally { rmSync(malformed, { recursive: true, force: true }); }
});
