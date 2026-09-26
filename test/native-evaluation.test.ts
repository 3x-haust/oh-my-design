import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBuildIdentityFromSource } from '../adapters/build.ts';
import { parseEntrySurfaceContract } from '../core/frame/entry-surface-contract.ts';
import { writeFrame } from '../core/frame/write.ts';
import { publishAdaptiveRoute, readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { runNativeEvaluation } from '../core/runtime/native-evaluation.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { readCurrentObservationV2 } from '../core/runtime/observation.ts';
import { parseTrustedBrowserReceipt } from '../core/runtime/trusted-browser-receipt.ts';
import { deriveTrustedEvaluationIdentity } from '../core/runtime/trusted-evaluation-contract.ts';
import { deriveTrustedEvaluationPlanFromProject } from '../core/runtime/trusted-evaluation-plan.ts';
import { writeTrustedEvaluationObservation } from '../core/runtime/trusted-evaluation-observation.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import { nativeCompletionWork } from '../core/stage/native-completion.ts';

const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
const packRoot = join(runtimeRoot, 'core');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const request = 'Build a shipment evidence review workspace';

function fixture(t: TestContext, options: Readonly<{ broken?: boolean; mixedPhases?: boolean }> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-evaluation-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const local = createTestProjectRunInvocation(root, request);
  const build = createBuildIdentityFromSource(runtimeRoot);
  const cliPath = join(runtimeRoot, 'bin/omd.mjs');
  const invocation = createTestNativePiInvocation({ root, current: {
    ...local.current, buildSha256: build.buildSha256, loadedSkillSha256: build.sourceSkillSha256,
  }, host: { nodePath: process.execPath, nodeSha256: hash(readFileSync(process.execPath)),
    cliPath, cliSha256: hash(readFileSync(cliPath)), provider: 'openai-codex', model: 'gpt-6-luna',
    thinkingLevel: 'medium', parentSessionId: 'native-evaluation-fixture' } });
  const writer = createTestProjectWriteAdapter(root, invocation);
  const skeleton = inputSkeleton('product-route-input').skeleton;
  assert.ok(typeof skeleton === 'object' && skeleton !== null && !Array.isArray(skeleton));
  publishAdaptiveRoute(root, { ...skeleton, request,
    taskOutcome: { schema: 'task-outcome-contract-v1', goal: 'Review shipment evidence',
      mustHave: [options.mixedPhases ? 'Evidence reviewed' : 'Review shipment evidence'], mustNotHave: ['Invented approval'],
      completionEvidence: ['Evidence reviewed'], strategyFreedom: ['Choose a readable layout'] },
  }, writer, invocation);
  const route = readPersistedRoute(root, invocation);
  writeFrame(root, { entrySurface: parseEntrySurfaceContract({
    schema: 'entry-surface-contract-v1', entryPath: 'index.html',
    prerequisiteTaskId: 'inspect-evidence', dependentTaskId: 'request-review',
    purposeText: 'Review shipment evidence', workObjectAnchorText: 'Shipment CX-204', nextActionName: null,
    beforeText: 'Awaiting evidence', afterText: 'Evidence reviewed', outcomeWitnesses: [
      { kind: 'mustHave', index: 0, phase: options.mixedPhases ? 'after-prerequisite' : 'initial',
        assertion: 'visible-text', target: options.mixedPhases ? 'consequence' : 'purpose' },
      { kind: 'mustNotHave', index: 0, phase: 'initial', assertion: 'absent-text', target: 'body' },
      { kind: 'completionEvidence', index: 0, phase: 'after-prerequisite', assertion: 'visible-text', target: 'consequence' },
    ],
  }) }, '', writer);
  writer.write('.omd/task-flow-benchmark-projection.json', JSON.stringify({
    schema: 'task-flow-benchmark-projection-v1', benchmarkSha256: 'a'.repeat(64),
    sourceContractSha256: route.sourceContractSha256, surface: 'product', domain: 'shipment-review',
    taskSteps: [
      { id: 'inspect-evidence', intent: 'Inspect evidence', dependsOn: [] },
      { id: 'request-review', intent: 'Request review', dependsOn: ['inspect-evidence'] },
    ], counterexamples: [
      { id: 'action-first', reason: 'Acts before reviewing evidence' },
      { id: 'hidden-work', reason: 'Hides the shipment below the entry viewport' },
    ],
  }));
  writeBrowserDecisionFixture(root);
  writer.write('index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>Shipment review</title><style>body{margin:24px;font:16px Arial}button{padding:12px}
    [data-omd-work-object]{padding:20px;border:1px solid #666}</style></head><body>
    <h1 data-omd-purpose>Review shipment evidence</h1><section data-omd-work-object>
    <h2 data-omd-work-anchor>Shipment CX-204</h2>
    <button data-omd-task-id="inspect-evidence">Inspect evidence</button>
    <p data-omd-consequence-for="request-review">Awaiting evidence</p></section>
    ${options.mixedPhases ? '<p id="initial-violation">Invented approval</p>' : ''}
    <script>document.querySelector('button').onclick=()=>{
    document.querySelector('#initial-violation')?.remove();
    document.querySelector('[data-omd-consequence-for]').textContent='${options.broken ? 'Awaiting evidence' : 'Evidence reviewed'}';};</script></body></html>`);
  return { root, packRoot, invocation, writer, local, route };
}

test('native evaluation executes the project-derived plan and publishes source-bound live evidence', async t => {
  // Given a native run and a real local prerequisite-to-consequence interface.
  const value = fixture(t);
  const manifest = deriveTrustedEvaluationPlanFromProject(value);

  // When the trusted browser executes the exact derived manifest.
  const result = await runNativeEvaluation({ ...value, manifest });

  // Then the receipt proves real actions and captures at both fixed viewports.
  const receipt = parseTrustedBrowserReceipt(JSON.parse(readFileSync(join(value.root, result.receiptPath), 'utf8')));
  const expected = deriveTrustedEvaluationIdentity({
    sourceContractSha256: value.route.sourceContractSha256, taskOutcome: value.route.sourceContract.taskOutcome,
    evidenceClaims: value.route.sourceContract.evidenceClaims, allowedPaths: value.route.allowedPaths, entryPath: 'index.html',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(receipt.outcomeResults.map(row => row.outcomeRef), expected.requiredOutcomeRefs);
  assert.ok(receipt.outcomeResults.every(row => row.status === 'pass'));
  assert.deepEqual(new Set(receipt.captures.map(row => `${row.width}x${row.height}`)), new Set(['1280x900', '390x844']));
  assert.ok(receipt.transcript.some(row => row.startsWith('action-click:')));
  assert.deepEqual(readCurrentObservationV2(value.root), result.observation);
  assert.equal(nativeCompletionWork(value.root, value.invocation).action, 'review-rendered-findings');
});

test('a serialized browser receipt cannot replace the observation after native evaluation', async t => {
  // Given a real observation and its serialized public receipt.
  const value = fixture(t);
  const result = await runNativeEvaluation(value);
  const receipt = parseTrustedBrowserReceipt(JSON.parse(readFileSync(join(value.root, result.receiptPath), 'utf8')));
  const before = readFileSync(join(value.root, '.omd/observation-v2.json'));

  // When a caller reconstructs a result from public JSON rather than the live capability.
  assert.throws(() => writeTrustedEvaluationObservation({ ...value,
    evaluation: { receipt, receiptSha256: result.receiptSha256, actionLog: [] },
    currentArtifactPath: '.omd/build.json', productionArtifactPath: 'index.html', requireDecisionGraph: true,
  }), /UNAUTHORIZED_TRUSTED_BROWSER_RECEIPT/);

  // Then the accepted observation remains untouched.
  assert.deepEqual(readFileSync(join(value.root, '.omd/observation-v2.json')), before);
});

test('native evaluation records the measured failure when a prerequisite has no consequence', async t => {
  // Given a real interface whose click fails to produce the required state.
  const value = fixture(t, { broken: true });

  // When the derived evaluator runs at both viewports.
  const result = await runNativeEvaluation(value);

  // Then failure remains observable rather than being promoted to completion.
  assert.equal(result.ok, false);
  assert.equal(result.receipt.hardFloors.behavior, 'fail');
  assert.equal(result.receipt.entrySurface?.status, 'fail');
  assert.ok(result.receipt.outcomeResults.some(row => row.status === 'fail'));
  assert.deepEqual(readCurrentObservationV2(value.root), result.observation);
  assert.equal(nativeCompletionWork(value.root, value.invocation).action, 'evaluate-production');
});

test('initial violations cannot pass when a preceding outcome requires a later prerequisite state', async t => {
  // Given an initial violation that disappears when the prerequisite is completed.
  const value = fixture(t, { mixedPhases: true });

  // When canonical outcome order mixes initial and after-prerequisite witnesses.
  const result = await runNativeEvaluation(value);

  // Then the initial prohibition is evaluated before its evidence disappears.
  assert.equal(result.ok, false);
  const initial = result.receipt.outcomeResults.find(row => row.outcomeRef.includes(':mustNotHave:0:'));
  assert.ok(initial);
  assert.equal(initial.status, 'fail');
});

for (const kind of ['manifest', 'graph', 'local', 'serialized'] as const) {
  test(`native evaluation refuses ${kind} substitution before publishing artifacts`, async t => {
    // Given a current project with one substituted authority or evaluation input.
    const value = fixture(t);
    const manifest = deriveTrustedEvaluationPlanFromProject(value);
    if (kind === 'graph') value.writer.write('.omd/decision-graph.json', '{"schema":"decision-graph-v1","decisions":[]}');
    const invocation = kind === 'local' ? value.local
      : kind === 'serialized' ? structuredClone(value.invocation) : value.invocation;

    // When evaluation is requested, invalid inputs cannot reach browser publication.
    await assert.rejects(runNativeEvaluation({ ...value, invocation,
      ...(kind === 'manifest' ? { manifest: { ...manifest, scripts: [] } } : {}),
    }), kind === 'manifest' ? /NATIVE_EVALUATION_MANIFEST_MISMATCH/
      : kind === 'graph' ? /NATIVE_EVALUATION_DECISION_GRAPH_INVALID/ : /native|invocation|authority/i);

    // Then no new build receipt, screenshot directory or observation is written.
    assert.equal(existsSync(join(value.root, '.omd/build.json')), false);
    assert.equal(existsSync(join(value.root, '.omd/evaluation-runs')), false);
    assert.equal(readCurrentObservationV2(value.root), undefined);
  });
}
