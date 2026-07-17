import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { allocateSourceFinalization } from '../scripts/benchmark/allocate-source-finalization.ts';
import { canonicalJson, sha256, type JsonValue } from '../scripts/benchmark/contracts.ts';
import { assertSourceFinalizationInput, sourceFinalizationDomain, writeSourceFinalization, type SourceFinalizationInput } from '../scripts/benchmark/write-source-finalization.ts';
import { archiveLayout, createSealClaim, writeLauncherVerdict, writeSealConflict, type LauncherVerdict, type SealClaim, type SnapshotReceipt } from '../scripts/benchmark/seal-protocol.ts';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = { sealArchiveRoot: 'records/seal', finalizationClaimRoot: 'records/finalization/claims', finalizationReceiptRoot: 'records/finalization/receipts' } as const;
function digest(root: string, path: string): string { return sha256(readFileSync(join(root, path))); }
function publishedSeal(root: string, snapshotId: string): void {
  const claimantRecord = { actor: 'candidate', snapshotId };
  const claim: SealClaim = { schemaVersion: 'dependency-seal-claim-v1', snapshotId, path: 'claim.json', finalizationPath: 'final/result.json', finalizationSha256: 'b'.repeat(64), finalizationDomain: 'bundle-v1', sealRunId: `run-${snapshotId}`, launcherInputSha256: 'c'.repeat(64), claimantRecord, claimantRecordSha256: sha256(canonicalJson(claimantRecord)), claimantNonce: 'a'.repeat(64) };
  assert.equal(createSealClaim(join(root, roots.sealArchiveRoot), claim).created, true);
  const layout = archiveLayout(join(root, roots.sealArchiveRoot), snapshotId);
  const receipt: SnapshotReceipt = { schemaVersion: 'dependency-snapshot-v1.receipt-v1', state: 'PENDING_LAUNCHER', snapshotId, sealRunId: claim.sealRunId, claimantNonce: claim.claimantNonce, claimPath: 'claim.json', claimSha256: sha256(canonicalJson(claim as unknown as JsonValue)), snapshotSha256: 'd'.repeat(64) };
  writeFileSync(layout.snapshot, canonicalJson(receipt as unknown as JsonValue));
  const verdict: LauncherVerdict = { schemaVersion: 'dependency-seal-launch-v1.receipt-v1', status: 'ACCEPTED', snapshotId, claimPath: 'claim.json', claimSha256: receipt.claimSha256, claimantNonce: claim.claimantNonce, pendingReceiptSha256: sha256(canonicalJson(receipt as unknown as JsonValue)), permit: '../.permit', buildEvidenceRoot: 'e'.repeat(64), commitEvidenceRoot: 'f'.repeat(64), observedScope: { directChild: true, pgid: 1 }, finalization: { path: claim.finalizationPath, device: 1, inode: 1, modes: ['read-only'], treeSha256: '0'.repeat(64), readbackSha256: '1'.repeat(64), toolIdentities: ['test'] }, reason: 'accepted' };
  assert.equal(writeLauncherVerdict(join(root, roots.sealArchiveRoot), verdict, claimantRecord).created, true);
}
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-finalization-'));
  for (const path of Object.values(roots)) mkdirSync(join(root, path), { recursive: true });
  for (const path of ['scripts/benchmark', 'evals/product-ux/harness/bundle-v1', 'evidence', 'artifacts']) mkdirSync(join(root, path), { recursive: true });
  for (const path of ['scripts/benchmark/allocate-source-finalization.ts', 'scripts/benchmark/write-source-finalization.ts', 'evals/product-ux/harness/bundle-v1/source-finalization-input-v1.schema.json', 'evals/product-ux/harness/bundle-v1/source-finalization-v1.schema.json']) cpSync(join(project, path), join(root, path));
  writeFileSync(join(root, 'scripts/benchmark/tool.ts'), 'tool-v1'); writeFileSync(join(root, 'artifacts/a.txt'), 'artifact');
  return root;
}
function done(root: string): void { rmSync(root, { recursive: true, force: true }); }
let claimNumber = 0;
function claim(root: string) { return allocateSourceFinalization(root, { schemaVersion: 'source-finalization-allocation-request-v1', claimPath: `records/finalization/claims/claim-${claimNumber++}.json`, roots }); }
function input(root: string, allocation = claim(root), predecessor: { path: string; hash: string } | null = null): SourceFinalizationInput {
  return { schemaVersion: 'source-finalization-input-v1', id: allocation.id, allocationClaimPath: allocation.claimPath, allocationClaimSha256: digest(root, allocation.claimPath), allocatorSha256: digest(root, 'scripts/benchmark/allocate-source-finalization.ts'), producerSha256: digest(root, 'scripts/benchmark/write-source-finalization.ts'), inputSchemaSha256: digest(root, 'evals/product-ux/harness/bundle-v1/source-finalization-input-v1.schema.json'), receiptSchemaSha256: digest(root, 'evals/product-ux/harness/bundle-v1/source-finalization-v1.schema.json'), toolPath: 'scripts/benchmark/tool.ts', toolSha256: digest(root, 'scripts/benchmark/tool.ts'), receiptRoot: roots.finalizationReceiptRoot, previousReceiptPath: predecessor?.path ?? null, previousReceiptSha256: predecessor?.hash ?? null, artifacts: [{ path: 'artifacts/a.txt', class: 'source', sha256: digest(root, 'artifacts/a.txt') }], denySetRootSha256: '1'.repeat(64), projections: { projection: 'v1' }, platformAssertion: { platform: 'darwin' }, toolchainAssertion: { node: 'test' }, gateAssertion: { gate: 1 }, architectReview: { path: `evidence/architect-${allocation.id}.json`, sha256: '0'.repeat(64), claimId: allocation.id }, criticReview: { path: `evidence/critic-${allocation.id}.json`, sha256: '0'.repeat(64), claimId: allocation.id } };
}
function bindReviews(root: string, value: SourceFinalizationInput): void {
  const domain = sourceFinalizationDomain(value);
  writeFileSync(join(root, value.architectReview.path), canonicalJson({ claimId: value.id, domainSha256: domain, verdict: 'APPROVE' }));
  writeFileSync(join(root, value.criticReview.path), canonicalJson({ claimId: value.id, domainSha256: domain, verdict: 'OKAY' }));
  value.architectReview.sha256 = digest(root, value.architectReview.path); value.criticReview.sha256 = digest(root, value.criticReview.path);
}
function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === 'object' && Object.values(value).every(isJsonValue);
}
function inputJson(value: SourceFinalizationInput): string {
  assertSourceFinalizationInput(value);
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isJsonValue(parsed)) throw new Error('source-finalization input is not JSON');
  return canonicalJson(parsed);
}
function publish(root: string, value: SourceFinalizationInput, name: string): void { bindReviews(root, value); writeFileSync(join(root, `${name}.input.json`), inputJson(value)); writeSourceFinalization(root, `${name}.input.json`, `${roots.finalizationReceiptRoot}/${name}.json`); }

test('source-finalization domain is deterministic and every semantic class changes it', () => {
  const root = fixture(); try {
    const value = input(root); const baseline = sourceFinalizationDomain(value);
    assert.equal(baseline, sourceFinalizationDomain(JSON.parse(JSON.stringify(value))));
    for (const mutate of [
      (x: SourceFinalizationInput) => x.allocationClaimSha256 = '2'.repeat(64),
      (x: SourceFinalizationInput) => x.allocatorSha256 = '2'.repeat(64),
      (x: SourceFinalizationInput) => x.producerSha256 = '2'.repeat(64),
      (x: SourceFinalizationInput) => x.inputSchemaSha256 = '2'.repeat(64),
      (x: SourceFinalizationInput) => x.receiptSchemaSha256 = '2'.repeat(64),
      (x: SourceFinalizationInput) => x.toolSha256 = '2'.repeat(64),
      (x: SourceFinalizationInput) => x.artifacts[0]!.class = 'docs',
      (x: SourceFinalizationInput) => x.artifacts[0]!.path = 'artifacts/b.txt',
      (x: SourceFinalizationInput) => x.artifacts[0]!.sha256 = '2'.repeat(64),
      (x: SourceFinalizationInput) => x.denySetRootSha256 = '2'.repeat(64),
      (x: SourceFinalizationInput) => x.projections = { projection: 'v2' },
      (x: SourceFinalizationInput) => x.platformAssertion = { platform: 'linux' },
      (x: SourceFinalizationInput) => x.toolchainAssertion = { node: 'other' },
      (x: SourceFinalizationInput) => x.gateAssertion = { gate: 2 },
    ]) { const changed = JSON.parse(JSON.stringify(value)) as SourceFinalizationInput; mutate(changed); assert.notEqual(sourceFinalizationDomain(changed), baseline); }
  } finally { done(root); }
});

test('allocator derives ids from real published seal archives, rejects malformed archives, and uses O_EXCL', () => {
  const root = fixture(); try {
    publishedSeal(root, 'snapshot-7');
    publishedSeal(root, 'snapshot-8');
    const first = claim(root); assert.equal(first.id, 9); assert.throws(() => allocateSourceFinalization(root, { schemaVersion: 'source-finalization-allocation-request-v1', claimPath: first.claimPath, roots }), /exists|EEXIST/);
    publishedSeal(root, 'snapshot-14');
    assert.ok(writeSealConflict(join(root, roots.sealArchiveRoot), 'snapshot-14', { actor: 'competing' }, 'EEXIST_CLAIM'));
    const next = allocateSourceFinalization(root, { schemaVersion: 'source-finalization-allocation-request-v1', claimPath: 'records/finalization/claims/next.json', roots }); assert.equal(next.id, 15);
    mkdirSync(join(root, roots.sealArchiveRoot, 'snapshot-16'), { recursive: true });
    assert.throws(() => claim(root), /archive|ENOENT|malformed/);
    rmSync(join(root, roots.sealArchiveRoot, 'snapshot-16'), { recursive: true, force: true });
    mkdirSync(join(root, roots.sealArchiveRoot, 'unrecognized'), { recursive: true });
    assert.throws(() => claim(root), /snapshot id|archive/);
  } finally { done(root); }
});

test('producer writes a valid successor and rejects competing output, fork, cycle, and two heads', () => {
  const root = fixture(); try {
    const first = input(root); publish(root, first, 'one'); const firstPath = `${roots.finalizationReceiptRoot}/one.json`; const secondAllocation = allocateSourceFinalization(root, { schemaVersion: 'source-finalization-allocation-request-v1', claimPath: 'records/finalization/claims/two.json', roots }); const second = input(root, secondAllocation, { path: firstPath, hash: digest(root, firstPath) }); publish(root, second, 'two');
    assert.throws(() => writeSourceFinalization(root, 'two.input.json', `${roots.finalizationReceiptRoot}/two.json`), /EEXIST/);
    const forkAllocation = allocateSourceFinalization(root, { schemaVersion: 'source-finalization-allocation-request-v1', claimPath: 'records/finalization/claims/fork.json', roots }); const fork = input(root, forkAllocation, { path: firstPath, hash: digest(root, firstPath) }); bindReviews(root, fork); writeFileSync(join(root, 'fork.input.json'), inputJson(fork)); assert.throws(() => writeSourceFinalization(root, 'fork.input.json', `${roots.finalizationReceiptRoot}/fork.json`), /head|fork/);
    const receiptPath = join(root, firstPath); const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')); receipt.previousReceiptPath = firstPath; receipt.previousReceiptSha256 = digest(root, firstPath); chmodSync(receiptPath, 0o644); writeFileSync(receiptPath, canonicalJson(receipt)); assert.throws(() => writeSourceFinalization(root, 'two.input.json', `${roots.finalizationReceiptRoot}/other.json`), /cyclic|predecessor|genesis/);
  } finally { done(root); }
});

test('producer fails closed for review, hash, schema, path, and symlink violations', () => {
  const root = fixture(); try {
    const value = input(root); bindReviews(root, value); value.criticReview.sha256 = 'f'.repeat(64); writeFileSync(join(root, 'bad.input.json'), inputJson(value)); assert.throws(() => writeSourceFinalization(root, 'bad.input.json', `${roots.finalizationReceiptRoot}/bad.json`), /review hash/);
    const hashBad = input(root); bindReviews(root, hashBad); hashBad.toolSha256 = 'e'.repeat(64); writeFileSync(join(root, 'hash.input.json'), inputJson(hashBad)); assert.throws(() => writeSourceFinalization(root, 'hash.input.json', `${roots.finalizationReceiptRoot}/hash.json`), /hash mismatch/);
    const allocatorBad = input(root); bindReviews(root, allocatorBad); allocatorBad.allocatorSha256 = 'e'.repeat(64); writeFileSync(join(root, 'allocator.input.json'), inputJson(allocatorBad)); assert.throws(() => writeSourceFinalization(root, 'allocator.input.json', `${roots.finalizationReceiptRoot}/allocator.json`), /hash mismatch/);
    const producerBad = input(root); bindReviews(root, producerBad); producerBad.producerSha256 = 'e'.repeat(64); writeFileSync(join(root, 'producer.input.json'), inputJson(producerBad)); assert.throws(() => writeSourceFinalization(root, 'producer.input.json', `${roots.finalizationReceiptRoot}/producer.json`), /hash mismatch/);
    writeFileSync(join(root, 'schema.input.json'), '{}'); assert.throws(() => writeSourceFinalization(root, 'schema.input.json', `${roots.finalizationReceiptRoot}/schema.json`), /schema|missing/);
    assert.throws(() => writeSourceFinalization(root, 'hash.input.json', '../escape.json'), /unsafe|under/);
    symlinkSync(join(root, 'artifacts/a.txt'), join(root, 'artifacts/link.txt')); const link = input(root); link.artifacts = [{ path: 'artifacts/link.txt', class: 'source', sha256: digest(root, 'artifacts/a.txt') }]; bindReviews(root, link); writeFileSync(join(root, 'link.input.json'), inputJson(link)); assert.throws(() => writeSourceFinalization(root, 'link.input.json', `${roots.finalizationReceiptRoot}/link.json`), /regular|symlink/);
    const ownBytes = input(root); bindReviews(root, ownBytes); writeFileSync(join(root, 'scripts/benchmark/allocate-source-finalization.ts'), 'tampered allocator'); writeFileSync(join(root, 'own-bytes.input.json'), inputJson(ownBytes)); assert.throws(() => writeSourceFinalization(root, 'own-bytes.input.json', `${roots.finalizationReceiptRoot}/own-bytes.json`), /hash mismatch/);
  } finally { done(root); }
});
