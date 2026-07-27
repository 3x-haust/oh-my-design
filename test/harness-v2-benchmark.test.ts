import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalLegalCellManifest, createAliasResolver, createEvaluatorHoldout, evaluateHarness, projectHoldoutBrief, scoreBrief, validateDevelopmentCorpus } from '../core/eval-harness/holdout-projection.ts';
import type { HoldoutBrief, RaterVote } from '../core/eval-harness/holdout-projection.ts';
import { materializeEvidenceLock, readEvidenceSnapshotBytes, readEvidenceSnapshotPayload, requireEvidenceLockSnapshot, validateEvidenceSnapshot } from '../scripts/benchmark/materialize-evidence-lock.ts';
import { validateEvidenceLock } from '../scripts/benchmark/validate-evidence-lock.ts';
import { computeUnsignedHarnessRun, createUnsignedUsageComputation, computeUnsignedUsage, prepareHarnessV2 } from '../scripts/benchmark/run-harness-v2.ts';
import type { IsolatedHarnessHost, UnsignedUsageComputation, ReviewerLane } from '../scripts/benchmark/run-harness-v2.ts';
import { SIGNED_EVIDENCE_ARTIFACT_BYTES, SIGNED_EVIDENCE_DECLARATIONS } from './fixtures/harness-v2-signed-authority.ts';
import { createReviewerMcpAdapter, reviewerEvidenceSha256 } from '../adapters/reviewer-mcp.ts';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const budget = { rounds: 0, elapsedMinutes: 0, browserLaunches: 0, tokens: 0, usd: 0 };

function brief(id: string, expectedDecision: 'one' | 'none', surface: HoldoutBrief['surface'], domain: HoldoutBrief['domain'], language: HoldoutBrief['language'], kind: HoldoutBrief['kind'] = 'silent-evidence'): HoldoutBrief {
  return { id, expectedDecision, surface, domain, language, kind, evidence: [`fixture/${id}.json`] };
}
function corpus() {
  const briefs = canonicalLegalCellManifest().map((cell, index) => brief(`cell-${index}-${cell.expectedDecision}`, cell.expectedDecision, cell.surface, cell.domain, cell.language, index % 17 === 0 ? 'showpiece' : index % 19 === 0 ? 'quiet' : 'silent-evidence'));
  return { briefs, routeMap: Object.fromEntries(briefs.map(item => [item.id, item.surface])) };
}
function lockFixture(mutation = '') {
  const root = mkdtempSync(join(tmpdir(), 'omd-lock-'));
  const bytes: Record<string, string> = { ...SIGNED_EVIDENCE_ARTIFACT_BYTES };
  const declarations = SIGNED_EVIDENCE_DECLARATIONS.map(entry => ({ ...entry }));
  if (mutation) {
    const artifact = JSON.parse(bytes.E1!) as { payload: Record<string, unknown>; digest: string };
    artifact.payload.mutation = mutation;
    artifact.digest = digest(artifact.payload);
    bytes.E1 = JSON.stringify(artifact);
    declarations.find(entry => entry.id === 'E1')!.sha256 = createHash('sha256').update(bytes.E1).digest('hex');
  }
  try {
    for (const declaration of declarations) {
      mkdirSync(join(root, declaration.path, '..'), { recursive: true });
      writeFileSync(join(root, declaration.path), bytes[declaration.id]!);
    }
    return { root, lock: materializeEvidenceLock(root, declarations) };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
const portableHelper = resolve('test/fixtures/harness-v2-subprocess.mjs');
function canonicalCliInput(evidence: ReturnType<typeof lockFixture>) {
  const developmentCorpus = JSON.parse(SIGNED_EVIDENCE_ARTIFACT_BYTES.E1!).payload.briefs;
  const developmentRouteMap = JSON.parse(SIGNED_EVIDENCE_ARTIFACT_BYTES.E2!).payload.routeMap;
  return {
    developmentCorpus, developmentRouteMap, holdouts: developmentCorpus, projectionSalt: 'fixture-salt',
    evidenceRoot: evidence.root, evidenceLock: evidence.lock, budget: { rounds: 1, browserLaunches: 128, elapsedMinutes: 0, tokens: 0, usd: 0 },
    hostCommand: portableHelper, hostArgs: ['host'], browserCommand: portableHelper, browserArgs: ['browser'],
    reviewerCommands: ['a', 'b', 'c'].map((raterId, index) => ({ command: portableHelper, args: ['reviewer', `lane-${index}`], laneId: `lane-${index}`, raterId })),
    usageSidecarCommand: portableHelper, usageSidecarArgs: ['observer'],
  };
}
function runCanonicalCli(input: object, root: string) {
  const inputPath = join(root, 'harness-v2-cli-input.json');
  writeFileSync(inputPath, JSON.stringify(input));
  return spawnSync(process.execPath, ['scripts/benchmark/run-harness-v2.ts', inputPath], { cwd: resolve('.'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}
const unsignedUsage = createUnsignedUsageComputation('fixture-parent-observer', () => ({ tokens: 0, usd: 0 }));
function host(consume = true): IsolatedHarnessHost {
  return { identity: 'tested-host', executeBuild(projected, aliases) {
    const evidence = consume ? projected.evidenceAliases.map(alias => aliases.resolve(alias).bytes) : [];
    const artifactBytes = new TextEncoder().encode(JSON.stringify({ projected, evidence: evidence.map(bytes => Buffer.from(bytes).toString('base64')) }));
    return { laneId: 'build', artifactHash: createHash('sha256').update(artifactBytes).digest('hex'), artifactBytes };
  } };
}
const browser = { laneId: 'observed-browser', observe: (projected: object, build: object) => ({ observationBytes: new TextEncoder().encode(JSON.stringify({ projected, build, observer: 'runner-owned' })) }) };
function reviewers(vote: (id: string) => RaterVote, reuseConfig = false): ReviewerLane[] {
  return ['a', 'b', 'c'].map((raterId, index) => ({ laneId: `lane-${index}`, raterId, session: { sessionId: `sandbox-session-${index}`, executableSha256: digest({ executable: 'shared' }), processIdentity: digest({ process: index }), configIdentity: digest({ config: reuseConfig ? 'shared' : index }), handshake: digest({ handshake: index }) }, review: projected => ({ vote: vote(projected.id) }) }));
}
function runUnsignedFixture(overrides: object = {}) {
  const { briefs, routeMap } = corpus();
  const prepared = prepareHarnessV2(briefs, routeMap, briefs, 'fixture-salt');
  const expectedVotes = new Map(prepared.projectedBriefs.map((projected, index) => [projected.id, briefs[index]!.expectedDecision]));
  return computeUnsignedHarnessRun({ ...prepared, host: host(), browser, reviewerLanes: reviewers(id => expectedVotes.get(id)!), usageComputation: unsignedUsage, budget, ...overrides });
}

test('alias resolver is evaluator-owned, scoped, expiring, byte-limited, and one-shot', () => {
  const source = brief('secret', 'one', 'marketing', 'commerce', 'en'); const projected = projectHoldoutBrief(source, 'salt'); const authority = projected.evidenceAliases.map((alias, index) => { const bytes = new TextEncoder().encode(source.evidence[index]!); return { alias, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }; }); const aliases = createAliasResolver(projected, source.evidence, authority, Date.now(), 60_000, 100);
  aliases.resolve(projected.evidenceAliases[0]!); assert.throws(() => aliases.resolve(projected.evidenceAliases[0]!), /consumed/);
  assert.throws(() => createAliasResolver(projected, ['fixture/substituted.json'], authority, Date.now()), /immutable alias authority/);
});
test('the development corpus and holdouts are the exact crossed 128-cell authority', () => {
  const { briefs, routeMap } = corpus(); assert.equal(briefs.length, 128); assert.deepEqual(briefs.map(({ surface, domain, language, expectedDecision }) => ({ surface, domain, language, expectedDecision })), canonicalLegalCellManifest());
  assert.doesNotThrow(() => validateDevelopmentCorpus(briefs, routeMap)); assert.throws(() => validateDevelopmentCorpus(briefs.slice(1), Object.fromEntries(briefs.slice(1).map(item => [item.id, item.surface]))), /canonical crossed legal-cell manifest/);
});

test('signed E5 binds the exact interpreter and target bytes for every subprocess role', () => {
  const e5 = JSON.parse(SIGNED_EVIDENCE_ARTIFACT_BYTES.E5!).payload as {
    host: Record<string, string>;
    browser: Record<string, string>;
    observer: Record<string, string>;
    reviewers: Record<string, string>[];
  };
  const interpreterSha256 = createHash('sha256').update(readFileSync(process.execPath)).digest('hex');
  const targetSha256 = createHash('sha256').update(readFileSync(portableHelper)).digest('hex');
  for (const authority of [e5.host, e5.browser, e5.observer, ...e5.reviewers]) {
    assert.equal(authority.interpreterSha256, interpreterSha256);
    assert.equal(authority.targetSha256, targetSha256);
    assert.equal(authority.executableSha256, targetSha256);
  }
});
test('unsigned computation reaches host evidence consumption without producing an authoritative report', () => {
  const output = runUnsignedFixture();
  assert.equal(output.result.pass, true);
  assert.equal(Object.values(output.receipts).every(receipt => receipt.build.consumptionReceiptHashes.length === 1), true);
  assert.equal('report' in output, false);
});
test('unsigned computation reaches scoring divergence and returns the failed result', () => {
  const output = runUnsignedFixture({ reviewerLanes: reviewers(() => 'one') });
  assert.equal(output.result.pass, false);
});
test('unsigned computation reaches host-consumption and reviewer-independence rejection branches', () => {
  assert.throws(() => runUnsignedFixture({ host: host(false), reviewerLanes: reviewers(() => 'one') }), /complete immutable artifact and observed evidence consumption/);
  assert.throws(() => runUnsignedFixture({ reviewerLanes: reviewers(() => 'one', true) }), /reviewer session is reused, unobserved, or non-independent/);
});
test('process-bound reviewer evidence is one-shot and held only in live transport memory', () => {
  const adapter = createReviewerMcpAdapter();
  const payload = new Uint8Array(8 * 1024 * 1024 + 1);
  try {
    assert.throws(() => adapter.launch({ host: 'codex', buildSha256: digest('build'), loadedSkillSha256: digest('skill'), briefSha256: digest('brief'), evidence: 'forged', processBinding: { parentPid: 1 } }), /parent process binding must be host-observed/);
    const receipt = adapter.launch({ host: 'codex', buildSha256: digest('build'), loadedSkillSha256: digest('skill'), briefSha256: digest('brief'), evidence: payload, alias: { scope: 'fixture', expiresAt: new Date(Date.now() + 60_000).toISOString(), byteLimit: payload.byteLength } });
    assert.equal(receipt.evidence.sha256, createHash('sha256').update(payload).digest('hex'));
    assert.throws(() => reviewerEvidenceSha256(receipt), /verified child\/process\/configuration\/capability handshake/);
    assert.equal(JSON.stringify(receipt).includes(Buffer.from(payload).toString('base64')), false);
  } finally {
    adapter.dispose();
  }
});
test('fixed signed E13 rejects schema-valid mutations', () => {
  const approved = lockFixture();
  try {
    validateEvidenceLock(approved.root, approved.lock);
    assert.throws(() => lockFixture('unrelated-but-valid-schema'), /typed lineage mismatch/);
  } finally {
    rmSync(approved.root, { recursive: true, force: true });
  }
});
test('sparse, language-only, domain-only, imbalanced, and constant raters cannot collapse balanced outcomes', () => {
  const { briefs } = corpus(); const holdouts = briefs.map(createEvaluatorHoldout); const decisions = Object.fromEntries(holdouts.map(item => [item.id, [{ raterId: 'a', vote: item.expectedDecision }, { raterId: 'b', vote: item.expectedDecision }, { raterId: 'c', vote: item.expectedDecision }]]));
  for (const mutate of [() => ({}), () => Object.fromEntries(holdouts.filter(item => item.language === 'en').map(item => [item.id, decisions[item.id]])), () => Object.fromEntries(holdouts.filter(item => item.domain === 'commerce').map(item => [item.id, decisions[item.id]])), () => Object.fromEntries(holdouts.map(item => [item.id, item.expectedDecision === 'one' ? decisions[item.id] : [{ raterId: 'a', vote: 'one' }, { raterId: 'b', vote: 'one' }, { raterId: 'c', vote: 'none' }]])), () => Object.fromEntries(holdouts.map(item => [item.id, [{ raterId: 'a', vote: 'one' }, { raterId: 'b', vote: 'one' }, { raterId: 'c', vote: 'one' }]]))]) assert.equal(evaluateHarness(holdouts, mutate(), budget).pass, false);
  const tiedHoldout = holdouts[0]!; const tiedBrief: HoldoutBrief & typeof tiedHoldout = { ...tiedHoldout, evidence: briefs.find(brief => brief.id === tiedHoldout.id)!.evidence }; const tied = scoreBrief(tiedBrief, [{ raterId: 'a', vote: 'one' }, { raterId: 'b', vote: 'none' }, { raterId: 'c', vote: 'abstain' }]); assert.deepEqual([tied.complete, tied.winner], [false, false]);
});
test('unsigned computation reaches telemetry shape and cap rejection branches', () => {
  const scenarios: readonly [UnsignedUsageComputation, RegExp][] = [
    [createUnsignedUsageComputation('fixture-parent-observer', () => undefined as unknown as { tokens: number; usd: number }), /unsigned computation/],
    [createUnsignedUsageComputation('fixture-parent-observer', () => ({ tokens: -1, usd: 0 })), /unsigned computation/],
    [createUnsignedUsageComputation('fixture-parent-observer', () => ({ tokens: 1, usd: 0 })), /unsigned parent-observed usage exceeds input cap/],
  ];
  for (const [usageComputation, expected] of scenarios) {
    assert.throws(() => runUnsignedFixture({ usageComputation }), expected);
  }
});
test('public callbacks only drive unsigned telemetry and cannot mint an authoritative report', () => {
  assert.deepEqual(computeUnsignedUsage(unsignedUsage, [{ runnerId: 'r', hostIdentity: 'h', kind: 'host', laneId: 'l' }]), { tokens: 0, usd: 0 });
  const output = runUnsignedFixture({ usageComputation: { identity: 'forged', observe: () => ({ tokens: 0, usd: 0 }) } });
  assert.equal('report' in output, false);
  assert.equal('signedE5Digest' in output, false);
});
test('genuine evidence bytes override forged caller-decoded snapshot payloads', () => {
  const evidence = lockFixture();
  try {
    const forgedSnapshot = evidence.lock.entries.map(declaration => ({
      declaration,
      bytes: readFileSync(join(evidence.root, declaration.path)),
      payload: { runnerId: 'forged-caller-payload' },
    }));
    const snapshot = validateEvidenceSnapshot(evidence.lock, forgedSnapshot);
    assert.equal(readEvidenceSnapshotPayload(snapshot, 'E5').runnerId, JSON.parse(SIGNED_EVIDENCE_ARTIFACT_BYTES.E5!).payload.runnerId);
    assert.notEqual(readEvidenceSnapshotPayload(snapshot, 'E5').runnerId, 'forged-caller-payload');
  } finally { rmSync(evidence.root, { recursive: true, force: true }); }
});
test('structurally forged evidence snapshots lack validated provenance', () => {
  const evidence = lockFixture();
  try {
    const genuine = validateEvidenceLock(evidence.root, evidence.lock);
    assert.throws(
      () => requireEvidenceLockSnapshot({ lock: evidence.lock }, evidence.lock),
      /validated immutable provenance/,
    );
  } finally { rmSync(evidence.root, { recursive: true, force: true }); }
});
test('validated snapshots retain private immutable authority after caller mutation', () => {
  const evidence = lockFixture();
  try {
    const supplied = evidence.lock.entries.map(declaration => ({
      declaration,
      bytes: new Uint8Array(readFileSync(join(evidence.root, declaration.path))),
    }));
    const snapshot = validateEvidenceSnapshot(evidence.lock, supplied);
    for (const entry of supplied) entry.bytes[0] = 0;
    assert.equal(readEvidenceSnapshotPayload(snapshot, 'E5').runnerId, JSON.parse(SIGNED_EVIDENCE_ARTIFACT_BYTES.E5!).payload.runnerId);
    assert.equal(createHash('sha256').update(readEvidenceSnapshotBytes(snapshot, 'E5')).digest('hex'), snapshot.lock.entries.find(entry => entry.id === 'E5')!.sha256);
    evidence.lock.entries.find(entry => entry.id === 'E13')!.sha256 = '0'.repeat(64);
    assert.throws(() => requireEvidenceLockSnapshot(snapshot, evidence.lock), /validated immutable provenance/);
  } finally { rmSync(evidence.root, { recursive: true, force: true }); }
});
test('canonical CLI subprocess matches the signed E6-E11 authoritative projection', () => {
  const evidence = lockFixture();
  try {
    validateEvidenceLock(evidence.root, evidence.lock);
    const child = runCanonicalCli(canonicalCliInput(evidence), evidence.root);
    assert.equal(child.status, 0, child.stderr);
    const report = JSON.parse(child.stdout).report;
    for (const [id, fields] of ['E6', 'E7', 'E8', 'E9', 'E10', 'E11'].map(id => [id, Object.keys(JSON.parse(SIGNED_EVIDENCE_ARTIFACT_BYTES[id]!).payload).filter(field => field !== 'lineage')] as const)) for (const field of fields) assert.deepEqual(report[field], JSON.parse(SIGNED_EVIDENCE_ARTIFACT_BYTES[id]!).payload[field], `${id}.${field}`);
    assert.match(report.executionReceiptDigest, /^[a-f0-9]{64}$/);
    assert.notEqual(report.executionReceiptDigest, digest([]));
  } finally { rmSync(evidence.root, { recursive: true, force: true }); }
});
test('CLI child-spawn authority negatives fail at their named boundaries after evidence-lock validation', () => {
  const scenarios = [
    [(input: ReturnType<typeof canonicalCliInput>) => { input.hostArgs = ['host', 'forged']; }, /host interpreter, target, or config does not match signed E5/],
    [(input: ReturnType<typeof canonicalCliInput>) => { input.usageSidecarCommand = ''; }, /CLI input requires host, browser, reviewers, evidence root, and parent usage sidecar/],
    [(input: ReturnType<typeof canonicalCliInput>) => { input.reviewerCommands[0]!.laneId = 'forged-lane'; }, /reviewer is not authorized by signed E5/],
    [(input: ReturnType<typeof canonicalCliInput>) => { input.usageSidecarArgs = ['observer', 'forged-accounting']; }, /usage sidecar interpreter, target, or config does not match signed E5/],
    [(input: ReturnType<typeof canonicalCliInput>) => { input.usageSidecarArgs = []; }, /usage sidecar interpreter, target, or config does not match signed E5/],
    [(input: ReturnType<typeof canonicalCliInput>) => { input.reviewerCommands[1]!.args = ['reviewer', 'forged']; }, /reviewer lane-1 interpreter, target, or config does not match signed E5/],
  ] as const;
  for (const [mutate, expected] of scenarios) {
    const evidence = lockFixture();
    try {
      validateEvidenceLock(evidence.root, evidence.lock);
      const input = canonicalCliInput(evidence);
      mutate(input);
      const child = runCanonicalCli(input, evidence.root);
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, expected);
    } finally { rmSync(evidence.root, { recursive: true, force: true }); }
  }
});
