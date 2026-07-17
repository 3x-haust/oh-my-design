import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, sha256, type JsonValue } from '../scripts/benchmark/contracts.ts';
import { buildSyntheticOnlyDenySet, type SyntheticRecord } from '../scripts/benchmark/build-synthetic-only-deny-set.ts';
import { validateSyntheticOnly } from '../scripts/benchmark/validate-synthetic-only.ts';
import { archiveLayout, createSealClaim, writeLauncherVerdict, type LauncherVerdict, type SealClaim, type SnapshotReceipt } from '../scripts/benchmark/seal-protocol.ts';

function put(root: string, path: string, value: string): void { mkdirSync(join(root, ...path.split('/').slice(0, -1)), { recursive: true }); writeFileSync(join(root, path), value); }
function identity(root: string, path: string, capabilityKind = 'runtime', schemaId?: string): SyntheticRecord { const base: SyntheticRecord = { path, sha256: sha256(readFileSync(join(root, path))), mediaType: path.endsWith('.json') ? 'application/json' : 'application/octet-stream', capabilityKind }; return schemaId ? { ...base, schemaId } : base; }
function clean(root: string): void { rmSync(root, { recursive: true, force: true }); }
let sealNumber = 0;
function publishedSeal(root: string): { archiveRoot: string; snapshotId: string } {
  const archiveRoot = 'records/seal', snapshotId = `snapshot-${++sealNumber}`, claimantRecord = { actor: 'candidate' };
  const claim: SealClaim = { schemaVersion: 'dependency-seal-claim-v1', snapshotId, path: 'claim.json', finalizationPath: 'shared/final.json', finalizationSha256: 'a'.repeat(64), finalizationDomain: 'bundle-v1', sealRunId: 'run', launcherInputSha256: 'b'.repeat(64), claimantRecord, claimantRecordSha256: sha256(canonicalJson(claimantRecord)), claimantNonce: 'a'.repeat(64) };
  assert.equal(createSealClaim(join(root, archiveRoot), claim).created, true);
  const layout = archiveLayout(join(root, archiveRoot), snapshotId), receipt: SnapshotReceipt = { schemaVersion: 'dependency-snapshot-v1.receipt-v1', state: 'PENDING_LAUNCHER', snapshotId, sealRunId: 'run', claimantNonce: claim.claimantNonce, claimPath: 'claim.json', claimSha256: sha256(canonicalJson(claim as unknown as JsonValue)), snapshotSha256: 'b'.repeat(64) };
  writeFileSync(layout.snapshot, canonicalJson(receipt as unknown as JsonValue));
  const verdict: LauncherVerdict = { schemaVersion: 'dependency-seal-launch-v1.receipt-v1', status: 'ACCEPTED', snapshotId, claimPath: 'claim.json', claimSha256: receipt.claimSha256, claimantNonce: claim.claimantNonce, pendingReceiptSha256: sha256(canonicalJson(receipt as unknown as JsonValue)), permit: '../.permit', buildEvidenceRoot: 'c'.repeat(64), commitEvidenceRoot: 'd'.repeat(64), observedScope: { directChild: true, pgid: 1 }, finalization: { path: claim.finalizationPath, device: 1, inode: 1, modes: ['read-only'], treeSha256: 'e'.repeat(64), readbackSha256: 'f'.repeat(64), toolIdentities: ['test'] }, reason: 'accepted' };
  assert.equal(writeLauncherVerdict(join(root, archiveRoot), verdict, claimantRecord).created, true);
  return { archiveRoot, snapshotId };
}
function fixture(): { root: string; deny: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-gate-r-'));
  put(root, 'synthetic/policy.json', '{"allow":false}'); put(root, 'synthetic/key.bin', 'key');
  put(root, 'synthetic/manifest.json', JSON.stringify({ schemaVersion: 'gate-r-synthetic-test-manifest-v1', denySetOutputPath: 'synthetic/deny.json', capabilityInputs: [{ path: 'synthetic/policy.json', kind: 'policy', schemaId: 'policy-v1' }] }));
  put(root, 'synthetic/custody.json', JSON.stringify({ schemaVersion: 'gate-r-key-custody-v1', privateKey: { path: 'synthetic/key.bin', kind: 'private-key' } }));
  buildSyntheticOnlyDenySet(root, 'synthetic/manifest.json', 'synthetic/custody.json', 'synthetic/deny.json'); return { root, deny: 'synthetic/deny.json' };
}
function graph(root: string, mutate?: (value: Record<string, unknown>) => void): string {
  put(root, 'shared/final.json', canonicalJson({ schemaVersion: 'source-finalization-v1', status: 'ACCEPTED', domainSha256: 'd'.repeat(64) })); put(root, 'shared/copy.json', 'copy'); put(root, 'shared/ok.json', '{}');
  const snapshot = publishedSeal(root);
  const value: Record<string, unknown> = { schemaVersion: 'gate-r-synthetic-only-live-manifest-v1', sourceFinalization: { path: 'shared/final.json', sha256: sha256(readFileSync(join(root, 'shared/final.json'))), domainSha256: 'd'.repeat(64) }, snapshot, provenanceCopy: { path: 'shared/copy.json', sha256: sha256(readFileSync(join(root, 'shared/copy.json'))), rootSha256: 'b'.repeat(64) }, artifactRecords: [identity(root, 'shared/final.json'), identity(root, 'shared/copy.json'), identity(root, 'shared/ok.json')] };
  mutate?.(value); put(root, 'live-manifest.json', canonicalJson(value as JsonValue)); return 'live-manifest.json';
}

test('builder emits an acyclic, sorted capability raw-byte set after all inputs exist', () => {
  const item = fixture(); try {
    const deny = JSON.parse(readFileSync(join(item.root, item.deny), 'utf8'));
    assert.deepEqual(deny.records.map((record: SyntheticRecord) => record.path), ['synthetic/key.bin', 'synthetic/policy.json']);
    assert.deepEqual(Object.keys(deny.records[0]).sort(), ['capabilityKind', 'mediaType', 'path', 'sha256']);
    assert.equal(deny.records.some((record: SyntheticRecord) => /manifest|custody|deny/.test(record.path)), false);
    assert.throws(() => buildSyntheticOnlyDenySet(item.root, 'synthetic/manifest.json', 'synthetic/custody.json', item.deny), /already exists/);
  } finally { clean(item.root); }
});

test('validator derives authority from a complete read-back graph and permits independent shared artifacts', () => {
  const item = fixture(); try {
    const path = graph(item.root); const evidence = validateSyntheticOnly(item.root, item.deny, path);
    assert.equal(evidence.checkedArtifactCount, 3); assert.match(evidence.evidenceRootSha256, /^[a-f0-9]{64}$/);
    const cases: Array<[string, (value: Record<string, unknown>) => void, RegExp]> = [
      ['spoofed eligibility', value => { (value as { eligible?: boolean }).eligible = true; }, /unexpected/],
      ['root mismatch', value => { (value.provenanceCopy as { rootSha256: string }).rootSha256 = 'c'.repeat(64); }, /root mismatch/],
      ['snapshot mismatch', value => { (value.snapshot as { snapshotId: string }).snapshotId = 'snapshot-missing'; }, /accepted/],
      ['archive mismatch', value => { (value.snapshot as { archiveRoot: string }).archiveRoot = 'records/missing'; }, /ENOENT|archive/],
      ['unlisted finalization', value => { value.artifactRecords = (value.artifactRecords as SyntheticRecord[]).filter(record => record.path !== 'shared/final.json'); }, /not enumerated/],
      ['nested secret', value => { (value.snapshot as { nested?: unknown }).nested = { privateKey: 'secret' }; }, /inline capability/],
    ];
    for (const [, mutate, expected] of cases) { const changed = graph(item.root, mutate); assert.throws(() => validateSyntheticOnly(item.root, item.deny, changed), expected); }
  } finally { clean(item.root); }
});

test('validator rejects path, schema, and relocated SHA matches but accepts shared identities', () => {
  const item = fixture(); try {
    const deny = JSON.parse(readFileSync(join(item.root, item.deny), 'utf8')) as { records: SyntheticRecord[] };
    put(item.root, 'shared/relocated.json', readFileSync(join(item.root, 'synthetic/policy.json'), 'utf8'));
    let path = graph(item.root, value => { (value.artifactRecords as SyntheticRecord[]).push(identity(item.root, 'shared/relocated.json')); });
    assert.throws(() => validateSyntheticOnly(item.root, item.deny, path), /matches/);
    put(item.root, 'shared/schema.json', '{}'); path = graph(item.root, value => { (value.artifactRecords as SyntheticRecord[]).push({ ...identity(item.root, 'shared/schema.json', 'runtime', 'policy-v1'), sha256: sha256('{}') }); });
    assert.throws(() => validateSyntheticOnly(item.root, item.deny, path), /matches/);
    put(item.root, 'synthetic/policy.json', '{}'); path = graph(item.root, value => { (value.artifactRecords as SyntheticRecord[]).push({ ...identity(item.root, 'synthetic/policy.json', 'policy', 'other-v1'), sha256: sha256('{}') }); });
    assert.throws(() => validateSyntheticOnly(item.root, item.deny, path), /matches/);
    const first = deny.records[0];
    assert.ok(first);
    assert.equal(first.capabilityKind, 'private-key');
  } finally { clean(item.root); }
});
