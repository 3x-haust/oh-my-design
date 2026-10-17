import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBuildIdentityFromSource } from '../adapters/build.ts';
import { parseEntrySurfaceContract } from '../core/frame/entry-surface-contract.ts';
import { writeFrame } from '../core/frame/write.ts';
import { publishAdaptiveRoute, readPersistedRoute, adaptiveRouteRecordSha256 } from '../core/route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { modelLedRouteInput } from '../core/schema/candidate-selection.ts';
import { recordModelLedExecution } from '../core/runtime/model-led-execution.ts';
import { checkRouteMeasuredSlopReview } from '../core/slop/measured-review.ts';
import { parseMeasuredTerminal } from '../core/evidence/final-v2-measured-contract.ts';
import { assertMeasurementPacketsGreen } from '../core/evidence/final-v2-measurement.ts';
import { loadReviewPolicy } from '../core/measure/review-policy.ts';
import { validateDecisionGraph } from '../core/deliberation/contracts.ts';
import { captureDesignExecutionPolicy } from '../core/config/design-execution.ts';
import { capturePiRequest } from '../extensions/omd-request-source.ts';
import { observePiReviewPurpose } from '../extensions/omd-review-purpose.ts';
import { runNativeEvaluation } from '../core/runtime/native-evaluation.ts';
import { createTestNativePiInvocation, getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { readCurrentObservationV2, observationV2Sha256 } from '../core/runtime/observation.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { parseTrustedBrowserReceipt } from '../core/runtime/trusted-browser-receipt.ts';
import { deriveTrustedEvaluationIdentity } from '../core/runtime/trusted-evaluation-contract.ts';
import { deriveTrustedEvaluationPlanFromProject } from '../core/runtime/trusted-evaluation-plan.ts';
import { writeTrustedEvaluationObservation } from '../core/runtime/trusted-evaluation-observation.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import { nativeCompletionWork } from '../core/stage/native-completion.ts';
import { makerEvaluationLineage } from '../core/runtime/native-maker-evaluation.ts';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { checkFirstRenderEvidence, publishFirstRenderCheck } from '../core/design/first-render-evidence.ts';
import { firstRenderReviewPacket, runFirstRenderReview } from '../core/design/first-render-review.ts';
import { finalRenderReviewerPacket } from '../core/runtime/final-render-review.ts';
import type { DeveloperEvaluationSnapshot } from '../core/coach/developer-evaluation-contract.ts';
import { calibrationFixture } from './helpers/developer-calibration.ts';
import { loadMeasuredObservationBindings } from '../core/evidence/final-v2-browser-observations.ts';
import { validateTrustedOutcomeEvidence } from '../core/evidence/final-v2-outcome-gate.ts';
import { nativeOutcomeExecutionEvidence } from '../core/runtime/native-outcome-review.ts';
import { makerVisuals } from '../core/runtime/native-maker-visuals.ts';
import { installNativeFidelityReferences } from './helpers/native-reference-fidelity.ts';
import { nativeReframeWork, requireResolvedNativeReframe } from '../core/runtime/native-reframe.ts';
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';

const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
const packRoot = join(runtimeRoot, 'core');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const request = 'Build a shipment evidence review workspace';

function fixture(t: TestContext, options: Readonly<{
  broken?: boolean; mixedPhases?: boolean; unrelatedOutcome?: boolean; composition?: boolean;
  calibration?: DeveloperEvaluationSnapshot; modelLed?: boolean; reviewer?: boolean;
}> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-evaluation-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const local = createTestProjectRunInvocation(root, request);
  const build = createBuildIdentityFromSource(runtimeRoot);
  const cliPath = options.composition || options.reviewer
    ? fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url))
    : join(runtimeRoot, 'bin/omd.mjs');
  const invocation = createTestNativePiInvocation({ root,
    ...(options.modelLed ? { designPolicy: captureDesignExecutionPolicy({}) } : {}),
    ...(options.calibration === undefined ? {} : { calibration: options.calibration }), current: {
    ...local.current, buildSha256: build.buildSha256, loadedSkillSha256: build.sourceSkillSha256,
    ...(options.modelLed ? { briefSha256: hash(request) } : {}),
  }, host: { nodePath: process.execPath, nodeSha256: hash(readFileSync(process.execPath)),
    cliPath, cliSha256: hash(readFileSync(cliPath)), provider: 'openai-codex', model: 'gpt-6-luna',
    thinkingLevel: 'medium', parentSessionId: 'native-evaluation-fixture' } });
  const writer = createTestProjectWriteAdapter(root, invocation);
  const skeleton = structuredClone((options.modelLed
    ? modelLedRouteInput(inputSkeleton('product-route-input')) : inputSkeleton('product-route-input')).skeleton);
  assert.ok(typeof skeleton === 'object' && skeleton !== null && !Array.isArray(skeleton));
  const strategy = Reflect.get(skeleton, 'strategyDecision') as { methods: string[]; skips: { id: string }[] };
  for (const id of options.modelLed ? [] : ['design-strategy-balanced-delivery', 'model-capability-probe']) {
    if (!strategy.methods.includes(id)) strategy.methods.push(id);
    strategy.skips = strategy.skips.filter(skip => skip.id !== id);
  }
  if (options.composition) {
    const stages = Reflect.get(strategy, 'stages') as string[];
    const roles = Reflect.get(strategy, 'roles') as string[];
    const executionWaves = Reflect.get(strategy, 'executionWaves') as { id: string; mode: string; roles: string[] }[];
    const attributionCategories = Reflect.get(strategy, 'attributionCategories') as string[];
    const production = stages.indexOf('production');
    if (!stages.includes('copy')) {
      stages.splice(production < 0 ? stages.length : production, 0, 'copy');
    }
    if (!stages.includes('composition')) {
      stages.splice(stages.indexOf('production'), 0, 'composition');
    }
    if (!roles.includes('omd-writer')) roles.push('omd-writer');
    if (!roles.includes('omd-composer')) roles.push('omd-composer');
    const productionWave = executionWaves.findIndex((wave) => wave.id === 'production');
    executionWaves.splice(productionWave < 0 ? executionWaves.length : productionWave, 0,
      { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
      { id: 'composition', mode: 'concurrent', roles: ['omd-composer'] });
    if (!attributionCategories.includes('composition')) attributionCategories.push('composition');
    strategy.skips = strategy.skips.filter(skip => skip.id !== 'copy' && skip.id !== 'composition');
  }
  const purposePayload = {
    schema: 'review-purpose-origin-v1' as const, projectRoot: root, purpose: 'ordinary' as const,
    requestSha256: hash(request), source: 'host-user-input' as const, observedAt: '2026-09-27T00:00:00.000Z',
  };
  const purposeOrigin = { ...purposePayload,
    signature: signNativeObservation(root, purposePayload.schema, hash(canonicalRouteJson(purposePayload))) };
  const purposeBytes = Buffer.from(`${canonicalRouteJson(purposeOrigin)}\n`);
  const purposeSha256 = hash(purposeBytes);
  const reviewPurposeAuthority = {
    path: `.omd/review-purpose-authorities/sha256-${purposeSha256}.json`, sha256: purposeSha256,
  };
  mkdirSync(join(root, '.omd/review-purpose-authorities'), { recursive: true });
  writeFileSync(join(root, reviewPurposeAuthority.path), purposeBytes);
  if (options.modelLed) {
    const run = getNativePiRun(invocation, root);
    mkdirSync(join(root, '.omd/native-pi'), { recursive: true });
    writeFileSync(join(root, '.omd/native-pi/run.json'), canonicalRouteJson({
      schema: 'native-pi-run-v1', run,
      signature: signNativeObservation(root, 'pi-run', hash(canonicalRouteJson(run))),
    }));
    capturePiRequest(root, request);
    observePiReviewPurpose(root, request, 'pi-rpc');
  }
  publishAdaptiveRoute(root, { ...skeleton, request, reviewPurpose: 'ordinary', reviewPurposeAuthority,
    taskOutcome: { schema: 'task-outcome-contract-v1', goal: 'Review shipment evidence',
      mustHave: [options.unrelatedOutcome ? 'Revoke helper access and retain the applicant record'
        : options.mixedPhases ? 'Evidence reviewed' : 'Review shipment evidence'], mustNotHave: ['Invented approval'],
      completionEvidence: ['Evidence reviewed'], strategyFreedom: ['Choose a readable layout'] },
  }, writer, invocation);
  const route = readPersistedRoute(root, invocation);
  writeFrame(root, {
    ...(options.calibration === undefined ? {} : { uxSurface: 'product', uxTask: request }),
    entrySurface: parseEntrySurfaceContract({
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

function decisionGraphAt(path: string) {
  const checked = validateDecisionGraph(JSON.parse(readFileSync(path, 'utf8')));
  assert.ok(checked.value, JSON.stringify(checked.findings));
  return checked.value;
}

test('model-led first render reaches isolated review without authored design documents or a browser plan', async t => {
  const value = fixture(t, { modelLed: true, reviewer: true });
  rmSync(join(value.root, '.omd/frame.md'));
  rmSync(join(value.root, '.omd/task-flow-benchmark-projection.json'));
  const source = readFileSync(join(value.root, 'index.html'));
  const checked = await publishFirstRenderCheck(value.root, 'index.html', undefined, value.writer, value.invocation);
  assert.equal(checked.schema, 'first-render-check-v4');
  assert.throws(() => checkFirstRenderEvidence(value.root, 'review'), /authenticated model-led invocation/);
  assert.throws(() => checkFirstRenderEvidence(value.root, 'review', value.local), /hypothesis|native|authority/i);
  const packet = JSON.parse(firstRenderReviewPacket(value.root, value.invocation).packet.toString('utf8'));
  assert.equal(packet.evidence.hypothesis, undefined);
  assert.equal(packet.evidence.taskContext.sourceContractSha256, value.route.sourceContractSha256);
  assert.deepEqual(packet.evidence.renders.map((row: { viewport: string }) => row.viewport), ['desktop', 'mobile']);
  const previous = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-revise';
  t.after(() => {
    if (previous === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = previous;
  });
  const review = await runFirstRenderReview(value.root, value.invocation, t.signal);
  assert.equal(review.decision, 'revise');
  for (const path of ['frame.md', 'design-judgment.json', '.cache/trusted-lifecycle-manifest.json', 'final-v2.json']) {
    assert.equal(existsSync(join(value.root, '.omd', path)), false, path);
  }
  assert.deepEqual(readFileSync(join(value.root, 'index.html')), source);
  const pointer = readFileSync(join(value.root, '.omd/first-render/review.json'));
  value.writer.write('index.html', `${source.toString('utf8')}\n<!-- changed after review -->`);
  await assert.rejects(() => runFirstRenderReview(value.root, value.invocation, t.signal), /changed|stale/i);
  assert.deepEqual(readFileSync(join(value.root, '.omd/first-render/review.json')), pointer);
});

function shipmentOutcomeManifest() {
  return {
    schema: 'trusted-lifecycle-manifest-v1', entryPath: 'index.html', scripts: [
      { outcomeRef: 'mustHave:0', actions: [],
        assertions: [{ kind: 'visible-text', selector: '[data-omd-purpose]', text: 'Review shipment evidence' }] },
      { outcomeRef: 'mustNotHave:0', actions: [],
        assertions: [{ kind: 'absent-text', selector: 'body', text: 'Invented approval' }] },
      { outcomeRef: 'completionEvidence:0', actions: [{ kind: 'click', selector: 'button' }],
        assertions: [{ kind: 'visible-text', selector: '[data-omd-consequence-for]', text: 'Evidence reviewed' }] },
    ],
  };
}

test('model-led reframe permits direct repair but refuses behavior until independent re-review', async t => {
  const value = fixture(t, { modelLed: true, reviewer: true });
  rmSync(join(value.root, '.omd/frame.md'));
  const previous = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-reframe';
  t.after(() => {
    if (previous === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = previous;
  });
  await publishFirstRenderCheck(value.root, 'index.html', undefined, value.writer, value.invocation);
  const rejected = await runFirstRenderReview(value.root, value.invocation, t.signal);
  assert.equal(rejected.decision, 'reframe');
  assert.equal(rejected.next, 'repair-model-led-source-and-recapture');
  assert.deepEqual(rejected.repairOwners, ['coordinator']);
  const work = nativeReframeWork(value.root, value.invocation);
  assert.equal(work?.action, 'repair-model-led-render');
  const ready = checkProductionReadiness(value.root, value.invocation, value.packRoot, 'index.html');
  assert.equal(ready.ok, true, ready.blockers.join('; '));
  await assert.rejects(() => runNativeEvaluation({ ...value, manifest: shipmentOutcomeManifest() }), /NATIVE_REFRAME_UNRESOLVED/);
  assert.equal(existsSync(join(value.root, '.omd/observation-v2.json')), false);
  const source = readFileSync(join(value.root, 'index.html'), 'utf8');
  value.writer.write('index.html', `${source}<style>body{max-width:70rem}</style>`);
  await publishFirstRenderCheck(value.root, 'index.html', undefined, value.writer, value.invocation);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'success';
  const repaired = await runFirstRenderReview(value.root, value.invocation, t.signal);
  assert.equal(repaired.decision, 'retain');
  assert.equal(nativeReframeWork(value.root, value.invocation), null);
  assert.doesNotThrow(() => requireResolvedNativeReframe(value.root, value.invocation));
  for (const path of ['frame.md', 'design-judgment.json', 'candidate-selection.json', 'final-v2.json']) {
    assert.equal(existsSync(join(value.root, '.omd', path)), false, path);
  }
});

test('model-led evaluation records execution automatically without inventing a design judgment', async t => {
  const value = fixture(t, { modelLed: true });
  const manifest = shipmentOutcomeManifest();
  rmSync(join(value.root, '.omd/decision-graph.json'));
  rmSync(join(value.root, '.omd/frame.md'));
  rmSync(join(value.root, '.omd/task-flow-benchmark-projection.json'));
  const source = readFileSync(join(value.root, 'index.html'));
  const result = await runNativeEvaluation({ ...value, manifest });
  assert.equal(result.ok, true);
  const graph = decisionGraphAt(join(value.root, '.omd/decision-graph.json'));
  assert.equal(graph.decisions.length, 1);
  const execution = graph.decisions[0];
  assert.ok(execution?.origin);
  assert.equal(execution.origin.kind, 'harness-execution-v1');
  assert.equal(execution.origin.entryPath, manifest.entryPath);
  assert.equal(execution.origin.runId, getNativePiRun(value.invocation, value.root).runId);
  assert.equal(execution.origin.productionRevisionSha256, result.receipt.productionRevisionSha256);
  assert.equal(execution.alternatives.length, 1);
  assert.equal(result.receipt.outcomeResults.length, 3);
  assert.deepEqual(readFileSync(join(value.root, 'index.html')), source);
  const next = nativeCompletionWork(value.root, value.invocation);
  assert.equal(next.action, 'author-browser-plan', JSON.stringify(next));
});

test('model-led finish repairs a failed real execution and completes without intermediate design paperwork', { timeout: 240_000 }, async t => {
  const { runModelLedCompletion } = await import('../bin/model-led-completion-command.ts');
  const { checkFinalEvidenceV2 } = await import('../core/evidence/final-v2.ts');
  const { validateAdaptiveFinalEvidenceV2Graph } = await import('../core/evidence/final-v2-adaptive-contract.ts');
  const value = fixture(t, { modelLed: true, reviewer: true });
  for (const path of ['.omd/decision-graph.json', '.omd/frame.md', '.omd/task-flow-benchmark-projection.json']) {
    rmSync(join(value.root, path));
  }
  const source = readFileSync(join(value.root, 'index.html'), 'utf8');
  value.writer.write('index.html', source.replace("textContent='Evidence reviewed'", "textContent='Awaiting evidence'"));
  const failed = await runModelLedCompletion({ ...value, manifest: shipmentOutcomeManifest() });
  assert.equal(failed.ok, false);
  assert.equal(failed.phase, 'browser');
  assert.ok(failed.evaluation);
  const failedReceipt = readFileSync(join(value.root, failed.evaluation.receiptPath));
  assert.equal(existsSync(join(value.root, '.omd/final-evidence-v2.json')), false);
  value.writer.write('index.html', source);
  const result = await runModelLedCompletion({ ...value, manifest: shipmentOutcomeManifest() });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.phase, 'complete');
  assert.deepEqual(readFileSync(join(value.root, failed.evaluation.receiptPath)), failedReceipt);
  const graph = validateAdaptiveFinalEvidenceV2Graph(checkFinalEvidenceV2(value.root, value.invocation).graph);
  assert.equal(graph.route.executionStyle, 'model-led');
  assert.equal(parseMeasuredTerminal(graph.measuredTerminal).slopPolicy, 'integrated-final-review-v1');
  for (const path of ['.omd/frame.md', '.omd/composition.md', '.omd/slop/latest.json',
    '.omd/functional-requirements.json', '.omd/completeness-current.json']) {
    assert.equal(existsSync(join(value.root, path)), false, path);
  }
});

test('model-led finish returns early visual rejection before full behavior execution', { timeout: 60_000 }, async t => {
  const { runModelLedCompletion } = await import('../bin/model-led-completion-command.ts');
  const value = fixture(t, { modelLed: true, reviewer: true });
  rmSync(join(value.root, '.omd/frame.md'));
  const previous = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-revise';
  t.after(() => {
    if (previous === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = previous;
  });
  const source = readFileSync(join(value.root, 'index.html'));
  const result = await runModelLedCompletion({ ...value, manifest: shipmentOutcomeManifest() });
  assert.equal(result.ok, false);
  assert.equal(result.phase, 'review');
  assert.equal(result.diagnostic?.code, 'FIRST_RENDER_VISUAL_REPAIR');
  assert.equal(result.evaluation, undefined);
  assert.equal(existsSync(join(value.root, '.omd/observation-v2.json')), false);
  assert.equal(existsSync(join(value.root, '.omd/final-evidence-v2.json')), false);
  assert.deepEqual(readFileSync(join(value.root, 'index.html')), source);
});

test('model-led host automatically finishes changed inputs but does not repeat an unchanged failure', async t => {
  const { finishModelLedTurn } = await import('../extensions/omd-model-led-completion.ts');
  const { OmdCommandError } = await import('../extensions/omd-runtime.ts');
  const { nextStageWork } = await import('../core/stage/next.ts');
  const value = fixture(t, { modelLed: true });
  rmSync(join(value.root, '.omd/frame.md'));
  assert.equal(nextStageWork(value.root, value.packRoot, value.invocation).action, 'author-browser-plan');
  mkdirSync(join(value.root, '.omd/.cache'), { recursive: true });
  writeFileSync(join(value.root, '.omd/.cache/trusted-lifecycle-manifest.json'), JSON.stringify(shipmentOutcomeManifest()));
  assert.equal(nextStageWork(value.root, value.packRoot, value.invocation).action, 'finish-model-led');
  let calls = 0, prompts = 0;
  const task = { cwd: value.root, interrupted: () => false,
    run: async () => {
      calls++;
      const text = JSON.stringify({ schema: 'model-led-completion-result-v1', meaning: 'native-completion', ok: calls > 1,
        diagnostic: { category: 'behavior-or-proposal', message: 'x'.repeat(60_000) } });
      if (calls === 1) throw new OmdCommandError('bounded display', text, '', 1, false);
      return { text, details: { code: 0, killed: false } };
    },
    pi: { registerCommand() {}, sendMessage() { prompts++; } },
  };
  assert.ok((await finishModelLedTurn(task)).includes('x'.repeat(60_000)));
  await finishModelLedTurn(task);
  assert.equal(calls, 1);
  assert.equal(prompts, 1);
  value.writer.write('index.html', `${readFileSync(join(value.root, 'index.html'), 'utf8')}\n<footer>Repaired</footer>`);
  await finishModelLedTurn(task);
  assert.equal(calls, 2);
  assert.equal(prompts, 1);
});

test('model-led package failure stops before browser execution or approval', async t => {
  const { runModelLedCompletion } = await import('../bin/model-led-completion-command.ts');
  const value = fixture(t, { modelLed: true });
  value.writer.write('package.json', JSON.stringify({ scripts: { test: 'node -e \"process.exit(7)\"' } }));
  const result = await runModelLedCompletion({ ...value, manifest: shipmentOutcomeManifest() });
  assert.equal(result.ok, false);
  assert.equal(result.phase, 'verification');
  assert.equal(result.verification.at(-1)?.code, 7);
  assert.equal(result.evaluation, undefined);
  assert.equal(existsSync(join(value.root, '.omd/observation-v2.json')), false);
  assert.equal(existsSync(join(value.root, '.omd/final-evidence-v2.json')), false);
});

test('model-led finish preserves actual behavior failure and never starts approval', { timeout: 60_000 }, async t => {
  const { runModelLedCompletion } = await import('../bin/model-led-completion-command.ts');
  const value = fixture(t, { modelLed: true, reviewer: true, broken: true });
  rmSync(join(value.root, '.omd/decision-graph.json'));
  const result = await runModelLedCompletion({ ...value, manifest: shipmentOutcomeManifest() });
  assert.equal(result.ok, false);
  assert.equal(result.phase, 'browser');
  assert.equal(result.diagnostic?.category, 'behavior-or-proposal');
  assert.equal(existsSync(join(value.root, '.omd/observation-v2.json')), true);
  assert.equal(existsSync(join(value.root, '.omd/final-review/native-current.json')), false);
  assert.equal(existsSync(join(value.root, '.omd/final-evidence-v2.json')), false);
});

test('model-led finish refuses malformed plans, cancellation and structured authority without source mutation', async t => {
  const { runModelLedCompletion } = await import('../bin/model-led-completion-command.ts');
  const value = fixture(t, { modelLed: true });
  const original = readFileSync(join(value.root, 'index.html'));
  rmSync(join(value.root, '.omd/decision-graph.json'));
  const invalid = await runModelLedCompletion({ ...value, manifest: { schema: 'not-a-browser-plan' } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostic?.category, 'proposal');
  assert.equal(existsSync(join(value.root, '.omd/decision-graph.json')), false);
  const controller = new AbortController();
  controller.abort();
  const cancelled = await runModelLedCompletion({ ...value, manifest: shipmentOutcomeManifest(), signal: controller.signal });
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.diagnostic?.category, 'cancelled');
  const structured = fixture(t);
  const refused = await runModelLedCompletion({ ...structured, manifest: shipmentOutcomeManifest() });
  assert.equal(refused.ok, false);
  assert.equal(refused.diagnostic?.category, 'authority');
  assert.deepEqual(readFileSync(join(value.root, 'index.html')), original);
  assert.equal(existsSync(join(value.root, '.omd/final-evidence-v2.json')), false);
});

test('model-led execution retains authored decisions, is idempotent and rejects invalid present graphs', t => {
  const value = fixture(t, { modelLed: true });
  const path = join(value.root, '.omd/decision-graph.json');
  const authored = decisionGraphAt(path).decisions;
  recordModelLedExecution(value.root, value.invocation, 'index.html');
  const first = readFileSync(path);
  const graph = decisionGraphAt(path);
  assert.deepEqual(graph.decisions.filter(d => d.origin === undefined), authored);
  recordModelLedExecution(value.root, value.invocation, 'index.html');
  assert.deepEqual(readFileSync(path), first);
  value.writer.write('index.html', `${readFileSync(join(value.root, 'index.html'), 'utf8')}\n<footer>Updated production record</footer>`);
  recordModelLedExecution(value.root, value.invocation, 'index.html');
  const updated = decisionGraphAt(path);
  assert.equal(updated.decisions.length, graph.decisions.length);
  const currentExecution = updated.decisions.at(-1), previousExecution = graph.decisions.at(-1);
  assert.ok(currentExecution?.origin && previousExecution?.origin);
  assert.notEqual(currentExecution.origin.productionRevisionSha256, previousExecution.origin.productionRevisionSha256);
  const invalid = '{"schema":"decision-graph-v1","decisions":[]}';
  writeFileSync(path, invalid);
  assert.throws(() => recordModelLedExecution(value.root, value.invocation, 'index.html'), /NATIVE_EVALUATION_DECISION_GRAPH_INVALID/);
  assert.equal(readFileSync(path, 'utf8'), invalid);
  assert.equal(existsSync(join(value.root, '.omd/final-evidence-v2.json')), false);
});

test('model-led craft review is integrated, never a missing or malformed evidence waiver', t => {
  const value = fixture(t, { modelLed: true });
  const packet = { path: `.omd/visual-measurements/sha256-${hash('packet')}.json`, sha256: hash('packet') };
  const terminal = { schema: 'measured-terminal-graph-v1', measurements: [packet],
    reviewPolicy: loadReviewPolicy(value.root, value.invocation), lanes: {},
    slopPolicy: 'integrated-final-review-v1' as const };
  assert.equal(parseMeasuredTerminal(terminal).slopPolicy, terminal.slopPolicy);
  assert.equal(checkRouteMeasuredSlopReview(value.root, value.invocation, terminal), null);
  assert.throws(() => assertMeasurementPacketsGreen(value.root, [packet]));
  const { slopPolicy: _policy, ...missing } = terminal;
  assert.throws(() => parseMeasuredTerminal(missing));
  assert.throws(() => parseMeasuredTerminal({ ...terminal, slop: { checkpoint: packet, review: packet } }));
  mkdirSync(join(value.root, '.omd/slop'), { recursive: true });
  writeFileSync(join(value.root, '.omd/slop/latest.json'), '{}');
  assert.throws(() => checkRouteMeasuredSlopReview(value.root, value.invocation, terminal));
  assert.equal(readFileSync(join(value.root, '.omd/slop/latest.json'), 'utf8'), '{}');
  const strict = fixture(t);
  assert.throws(() => checkRouteMeasuredSlopReview(strict.root, strict.invocation, terminal));
  assert.equal(existsSync(join(value.root, '.omd/final-evidence-v2.json')), false);
});

test('native completion routes missing and empty decision ledgers to the owning publisher without mutation', t => {
  const value = fixture(t);
  const source = readFileSync(join(value.root, 'index.html'));
  const graphPath = join(value.root, '.omd/decision-graph.json');
  const original = readFileSync(graphPath);
  for (const bytes of [undefined, Buffer.from('{"schema":"decision-graph-v1","decisions":[]}')]) {
    if (bytes === undefined) rmSync(graphPath); else writeFileSync(graphPath, bytes);
    const next = nativeCompletionWork(value.root, value.invocation);
    assert.equal(next.action, 'author-evaluation-decision');
    assert.equal(next.owner, 'omd-hand');
    assert.equal(next.next, 'omd schema decision-entry --json');
    assert.deepEqual(readFileSync(join(value.root, 'index.html')), source);
    assert.equal(existsSync(graphPath), bytes !== undefined);
    if (bytes !== undefined) assert.deepEqual(readFileSync(graphPath), bytes);
  }
  writeFileSync(graphPath, original);
  assert.equal(nativeCompletionWork(value.root, value.invocation).action, 'evaluate-production');
});

test('composition-selected native evaluation refuses missing retained visual review before publication', async t => {
  const value = fixture(t, { composition: true });
  const sourceBefore = readFileSync(join(value.root, 'index.html'));

  await assert.rejects(runNativeEvaluation(value), /FIRST_RENDER|review/i);

  assert.deepEqual(readFileSync(join(value.root, 'index.html')), sourceBefore);
  assert.equal(existsSync(join(value.root, '.omd/build.json')), false);
  assert.equal(existsSync(join(value.root, '.omd/evaluation-runs')), false);
  assert.equal(readCurrentObservationV2(value.root), undefined);
});

test('composition-selected native evaluation accepts a current authentic retained visual review', { timeout: 30_000 }, async t => {
  const value = fixture(t, { composition: true });
  const oldMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  t.after(() => {
    if (oldMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = oldMode;
  });
  process.env.PI_REVIEWER_FIXTURE_MODE = 'success';
  publishDesignJudgment(value.root, {
    schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: { schema: 'design-judgment-v1', feelsLike: 'A focused shipment evidence workspace',
      dominantObject: 'shipment evidence', subordinate: ['navigation'], densityIntent: 'one shipment record',
      trustSource: 'visible shipment status', twoSecondRead: 'Review shipment evidence' },
    judgments: [{ id: 'shipment', observation: 'The shipment record is the primary work object.',
      whyItWorksThere: 'The review action stays attached to the evidence.', relevance: 'high',
      adopt: ['Evidence-local action'], reject: ['Source branding'],
      interpretation: 'Keep shipment evidence dominant.', scope: 'surface' }],
  }, value.writer);
  await publishFirstRenderCheck(value.root, 'index.html', undefined, value.writer, value.invocation);
  assert.equal((await runFirstRenderReview(value.root, value.invocation, t.signal)).decision, 'retain');

  const result = await runNativeEvaluation(value);

  assert.equal(result.ok, true);
  assert.deepEqual(readCurrentObservationV2(value.root), result.observation);
});

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
  const next = nativeCompletionWork(value.root, value.invocation);
  assert.equal(next.action, 'author-surface-coverage');
  assert.equal(next.owner, 'omd-hand');
  assert.equal(next.next, 'omd schema surface-captures --json');
  assert.ok('procedure' in next);
  assert.deepEqual(next.procedure?.steps, [
    'omd schema surface-captures --json',
    'omd lifecycle surface-captures --input .omd/.cache/surface-captures-input.json --json',
  ]);
  assert.match(next.problems.join('\n'), /DIRECTION_CONTRACT: current selected Frame requires native surface coverage/);
});

test('blind reviewer consumes pinned developer calibration after real browser evaluation', async t => {
  const calibration = calibrationFixture({
    route: '/index.html', surface: 'product', task: hash(request),
  });
  const value = fixture(t, { calibration });
  const result = await runNativeEvaluation(value);
  assert.equal(result.ok, true);
  const bytes = finalRenderReviewerPacket({
    root: value.root, invocation: value.invocation,
    packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1',
      observationSha256s: [observationV2Sha256(result.observation)] },
  });
  const packet = JSON.parse(bytes.toString('utf8'));
  const consumed = packet.evidence.context.developerCalibration;
  assert.equal(consumed.snapshotSha256, calibration.digest);
  assert.equal(consumed.cases.length, 1);
  assert.deepEqual(consumed.cases[0].developerSignal, { comparisonChoice: 'b', satisfaction: 'satisfied' });
  assert.equal(consumed.cases[0].advisorySource, 'model-interpretation');
  assert.equal(packet.evidence.renders.length > 0, true);
  assert.equal(Object.hasOwn(packet.evidence, 'references'), false);
  assert.equal(Object.hasOwn(packet.evidence, 'source'), false);
});

test('native evaluation accepts a complete outcome-bound browser plan without frame or benchmark documents', async t => {
  const value = fixture(t);
  const { entrySurface: _entrySurface, ...manifest } = deriveTrustedEvaluationPlanFromProject(value);
  rmSync(join(value.root, '.omd/frame.md'));
  rmSync(join(value.root, '.omd/task-flow-benchmark-projection.json'));
  assert.throws(() => deriveTrustedEvaluationPlanFromProject(value));
  const result = await runNativeEvaluation({ ...value, manifest });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.entrySurface, undefined);
  assert.equal(result.receipt.outcomeResults.length, 3);
  assert.ok(result.receipt.captures.length > 0);
  const before = readFileSync(join(value.root, '.omd/observation-v2.json'));
  assert.equal(loadMeasuredObservationBindings(value.root, value.invocation,
    [observationV2Sha256(result.observation)]).length, result.receipt.captures.length);
  assert.throws(() => validateTrustedOutcomeEvidence({
    root: value.root, invocation: value.invocation, branch: 'adaptive-omission', required: true,
    observations: [result.observation],
    expected: { routeSha256: adaptiveRouteRecordSha256(value.route),
      sourceContractSha256: value.route.sourceContractSha256, sourceContract: value.route.sourceContract,
      buildSha256: value.invocation.current.buildSha256, entrySurfaceRequired: true },
  }), /FINAL_ACCESS_FAILED/);
  assert.deepEqual(readFileSync(join(value.root, '.omd/observation-v2.json')), before);
});

for (const selection of ['reviewed', 'missing-option'] as const) {
test(`native select ${selection} is executed without changing application source`, async t => {
  const value = fixture(t);
  const { entrySurface: _entrySurface, ...plan } = deriveTrustedEvaluationPlanFromProject(value);
  rmSync(join(value.root, '.omd/frame.md'));
  rmSync(join(value.root, '.omd/task-flow-benchmark-projection.json'));
  const html = readFileSync(join(value.root, 'index.html'), 'utf8')
    .replace('<button data-omd-task-id="inspect-evidence">Inspect evidence</button>',
      '<label>Evidence status <select data-omd-task-id="inspect-evidence" style="min-height:44px;width:240px;font:inherit"><option value="pending">Awaiting evidence</option><option value="reviewed">Evidence reviewed</option></select></label>')
    .replace("document.querySelector('button').onclick=()=>{",
      "document.querySelector('select').onchange=()=>{");
  value.writer.write('index.html', html);
  const manifest = { ...plan, scripts: plan.scripts.map(script => ({
    ...script, actions: script.actions.map(action => action.kind === 'click'
      ? { kind: 'fill' as const, selector: '[data-omd-task-id="inspect-evidence"]', value: selection }
      : action),
  })) };
  const result = await runNativeEvaluation({ ...value, manifest });
  assert.equal(result.ok, selection === 'reviewed');
  assert.equal(result.acceptanceStatus, 'review-required');
  if (selection === 'reviewed') {
    assert.ok(result.receipt.outcomeResults.every(outcome => outcome.status === 'pass'));
  } else {
    assert.ok(result.receipt.outcomeResults.some(outcome =>
      outcome.findings.includes('required-action-unavailable')));
  }
  assert.equal(readFileSync(join(value.root, 'index.html'), 'utf8'), html);
});
}

test('native keyboard activation and navigation retain actual focus evidence', async t => {
  const value = fixture(t);
  const { entrySurface: _entrySurface, ...plan } = deriveTrustedEvaluationPlanFromProject(value);
  rmSync(join(value.root, '.omd/frame.md'));
  rmSync(join(value.root, '.omd/task-flow-benchmark-projection.json'));
  const html = readFileSync(join(value.root, 'index.html'), 'utf8')
    .replace('</button>', '</button><input id="keyboard-next" aria-label="Evidence note">');
  value.writer.write('index.html', html);
  const manifest = { ...plan, scripts: plan.scripts.map(script => ({
    ...script, actions: script.actions.flatMap(action => action.kind === 'click'
      ? [{ kind: 'press' as const, selector: action.selector, key: 'Enter' as const },
        { kind: 'press' as const, selector: action.selector, key: 'Tab' as const }]
      : [action]),
  })) };
  const result = await runNativeEvaluation({ ...value, manifest });
  assert.equal(result.ok, true);
  assert.equal(result.acceptanceStatus, 'review-required');
  const witnesses = result.receipt.transcript.filter(line => line.startsWith('keyboard-focus:'))
    .map(line => JSON.parse(line.slice('keyboard-focus:'.length)) as {
      key: string; viewport: { width: number; height: number };
      after: { tagName: string; idSha256: string | null };
    });
  for (const width of [1280, 390]) {
    assert.ok(witnesses.some(row => row.viewport.width === width && row.key === 'Enter'));
    assert.ok(witnesses.some(row => row.viewport.width === width && row.key === 'Tab'
      && row.after.tagName === 'INPUT' && row.after.idSha256 === hash('keyboard-next')));
  }
  assert.equal(readFileSync(join(value.root, 'index.html'), 'utf8'), html);
  const review = nativeOutcomeExecutionEvidence(value.root, value.invocation, result.observationSha256);
  assert.equal(review.receiptSha256, result.receiptSha256);
  assert.deepEqual(review.transcript, result.receipt.transcript);
  assert.ok(review.outcomes.some(outcome => outcome.actions.some(action => action.kind === 'press')));
  for (const invalid of [
    'action-press:Meta+Q:' + hash('body'),
    'keyboard-focus:' + JSON.stringify({ ...witnesses[0], extra: 'untrusted' }),
    'keyboard-focus:' + JSON.stringify({ ...witnesses[0],
      after: { tagName: 'INPUT', idSha256: 'keyboard-next' } }),
  ]) {
    assert.throws(() => parseTrustedBrowserReceipt({
      ...result.receipt, transcript: [...result.receipt.transcript, invalid],
    }), /MALFORMED_TRUSTED_BROWSER_RECEIPT/);
  }
});

test('unsupported native keyboard shortcuts refuse before browser evidence mutation', async t => {
  const value = fixture(t);
  const { entrySurface: _entrySurface, ...plan } = deriveTrustedEvaluationPlanFromProject(value);
  rmSync(join(value.root, '.omd/frame.md'));
  rmSync(join(value.root, '.omd/task-flow-benchmark-projection.json'));
  const before = readFileSync(join(value.root, 'index.html'));
  const manifest = { ...plan, scripts: plan.scripts.map(script => ({
    ...script, actions: [{ kind: 'press', selector: 'body', key: 'Meta+Q' }],
  })) };
  await assert.rejects(() => runNativeEvaluation({ ...value, manifest }),
    /MALFORMED_TRUSTED_LIFECYCLE_MANIFEST/);
  assert.deepEqual(readFileSync(join(value.root, 'index.html')), before);
  assert.equal(existsSync(join(value.root, '.omd/observation-v2.json')), false);
});

test('native evaluation cannot certify an unimplemented outcome from an unrelated entry label', async t => {
  const value = fixture(t, { unrelatedOutcome: true });
  const result = await runNativeEvaluation(value);
  assert.equal(result.ok, true, 'the authored text assertions executed successfully');
  assert.equal(Reflect.get(result, 'acceptanceStatus'), 'review-required',
    'executed text assertions cannot certify that helper access can be revoked');
});

test('native evaluation binds the executed outcome plan to its receipt', async t => {
  const value = fixture(t);
  const result = await runNativeEvaluation(value);
  const planSha256 = Reflect.get(result.receipt, 'executionPlanSha256');
  assert.equal(typeof planSha256, 'string');
  const unbound = structuredClone(result.receipt);
  Reflect.deleteProperty(unbound, 'executionPlanSha256');
  for (const capture of unbound.captures) Reflect.deleteProperty(capture, 'measurement');
  assert.throws(() => parseTrustedBrowserReceipt(unbound), /MALFORMED_TRUSTED_BROWSER_RECEIPT/);
  assert.doesNotThrow(() => parseTrustedBrowserReceipt({ ...unbound, schema: 'trusted-browser-receipt-v1' }));
  const bytes = readFileSync(join(value.root, `.omd/evaluation-plans/sha256-${String(planSha256)}.json`));
  assert.equal(hash(bytes), planSha256);
  const executed = JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(executed.scripts.map((script: { outcomeRef: string }) => script.outcomeRef),
    result.receipt.outcomeResults.map(row => row.outcomeRef));
  assert.ok(executed.scripts.some((script: { actions: unknown[] }) => script.actions.length > 0));
});

for (const recordMode of ['retained', 'missing-before', 'deleted-after'] as const) {
test(`an authored behavior plan checks revocation with ${recordMode} applicant record`, async t => {
  const value = fixture(t, { unrelatedOutcome: true });
  value.writer.write('index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>Applicant record</title><style>body{font:18px Arial;margin:24px}button{padding:16px}</style></head>
    <body><main><h1>Applicant record</h1><p id="record">${recordMode === 'missing-before' ? '' : 'Applicant CX-204 retained'}</p>
    <p id="helper">Helper access active</p><button id="revoke">Revoke helper access</button>
    <p id="review">Awaiting review</p></main><script>
    document.querySelector('#revoke').onclick=()=>{
      document.querySelector('#helper').textContent='Helper access revoked';
      document.querySelector('#review').textContent='Evidence reviewed';
      document.querySelector('#record').textContent=${JSON.stringify(recordMode === 'deleted-after' ? '' : 'Applicant CX-204 retained')};
    };</script></body></html>`);
  const result = await runNativeEvaluation({ ...value, manifest: {
    schema: 'trusted-lifecycle-manifest-v1', entryPath: 'index.html',
    scripts: [
      { outcomeRef: 'mustHave:0', actions: [{ kind: 'click', selector: '#revoke' }],
        assertions: [
          { kind: 'visible-text', selector: '#helper', text: 'Helper access revoked' },
          { kind: 'preserved-text', selector: '#record', text: 'Applicant CX-204 retained' },
        ] },
      { outcomeRef: 'mustNotHave:0', actions: [],
        assertions: [{ kind: 'absent-text', selector: 'body', text: 'Invented approval' }] },
      { outcomeRef: 'completionEvidence:0', actions: [],
        assertions: [{ kind: 'visible-text', selector: '#review', text: 'Evidence reviewed' }] },
    ],
  } });
  assert.equal(result.executionStatus, recordMode === 'retained' ? 'pass' : 'fail', JSON.stringify({
    outcomes: result.receipt.outcomeResults, floors: result.receipt.hardFloors, transcript: result.receipt.transcript,
  }));
  assert.equal(result.acceptanceStatus, 'review-required');
  const executionPlan = JSON.parse(readFileSync(join(value.root,
    `.omd/evaluation-plans/sha256-${result.receipt.executionPlanSha256}.json`), 'utf8'));
  assert.equal(executionPlan.scripts[0].actions[0].selector, '#revoke');
  assert.equal(executionPlan.scripts[0].assertions.length, 2);
  assert.ok(result.receipt.transcript.some(entry => entry.startsWith('action-click:')));
});
}

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
  const sourceBefore = readFileSync(join(value.root, 'index.html'));
  const pointerBefore = readFileSync(join(value.root, '.omd/observation-v2.json'));
  const receiptBefore = readFileSync(join(value.root, result.receiptPath));
  const next = nativeCompletionWork(value.root, value.invocation);
  assert.equal(next.action, 'repair-browser-evidence');
  assert.equal(next.owner, 'omd-hand');
  assert.equal(next.next, 'omd brief browser-evidence --json');
  assert.ok('procedure' in next && next.procedure);
  assert.deepEqual(next.procedure.steps,
    ['omd brief browser-evidence --json', 'omd schema trusted-lifecycle-manifest --json']);
  assert.deepEqual(readFileSync(join(value.root, 'index.html')), sourceBefore);
  assert.deepEqual(readFileSync(join(value.root, '.omd/observation-v2.json')), pointerBefore);
  assert.deepEqual(readFileSync(join(value.root, result.receiptPath)), receiptBefore);

  value.writer.write('index.html', `${sourceBefore.toString('utf8')}\n`);
  assert.equal(nativeCompletionWork(value.root, value.invocation).action, 'evaluate-production',
    'a stale failed evaluation requests fresh evidence rather than authorizing repair from it');
  assert.deepEqual(readFileSync(join(value.root, '.omd/observation-v2.json')), pointerBefore);
});

test('a current clipped control routes to evidence repair without promoting successful behavior', async t => {
  const value = fixture(t);
  const html = readFileSync(join(value.root, 'index.html'), 'utf8')
    .replace('<button data-omd-task-id="inspect-evidence">',
      '<button id="clipped-action" style="width:40px;overflow:hidden;white-space:nowrap" data-omd-task-id="inspect-evidence">');
  value.writer.write('index.html', html);
  const result = await runNativeEvaluation(value);
  assert.equal(result.receipt.hardFloors.behavior, 'pass');
  assert.equal(result.receipt.hardFloors.access, 'fail');
  const detailPrefix = 'access-finding:interactive-label-detail:';
  const targets: unknown[] = result.receipt.transcript.filter(line => line.startsWith(detailPrefix))
    .map(line => JSON.parse(line.slice(detailPrefix.length)) as unknown);
  assert.ok(targets.some(target => typeof target === 'object' && target !== null
    && Reflect.get(target, 'selector') === '#clipped-action' && Reflect.get(target, 'view') === '390x844'
    && Reflect.get(target, 'clipped') === true));
  const next = nativeCompletionWork(value.root, value.invocation);
  assert.equal(next.action, 'repair-browser-evidence');
  assert.deepEqual(next.problems, ['FINAL_ACCESS_FAILED']);
  assert.equal(readFileSync(join(value.root, 'index.html'), 'utf8'), html);
  assert.deepEqual(readCurrentObservationV2(value.root), result.observation);
});

for (const scenario of [
  { overflow: 'auto', oversized: false },
  { overflow: 'hidden', oversized: false },
  { overflow: 'auto', oversized: true },
] as const) {
test(`partially clipped labels inside nested ${scenario.overflow}${scenario.oversized ? ' oversized' : ''} content retain real recoverability checks`, async t => {
  const value = fixture(t);
  const { entrySurface: _entrySurface, ...plan } = deriveTrustedEvaluationPlanFromProject(value);
  rmSync(join(value.root, '.omd/frame.md'));
  rmSync(join(value.root, '.omd/task-flow-benchmark-projection.json'));
  const html = readFileSync(join(value.root, 'index.html'), 'utf8')
    .replace('</style>', 'html,body{height:100%;overflow:hidden}</style>')
    .replace('</section>', `</section>
      <div style="position:absolute;top:400px;left:20px;width:200px;height:50px;overflow:hidden">
        <div id="nested-port" style="height:50px;overflow-y:${scenario.overflow}">
          <button style="display:block;width:180px;height:35px;padding:0;border:0;font:14px/20px sans-serif;white-space:nowrap">First action</button>
          <button id="nested-second" style="display:block;width:180px;height:${scenario.oversized ? 75 : 35}px;padding:0;border:0;font:14px/20px sans-serif;white-space:nowrap">${scenario.oversized ? 'Second<br>action<br>label' : 'Second action'}</button>
        </div>
      </div><p id="nested-proof"></p>`)
    .replace('</script>', `document.querySelector('#nested-port').addEventListener('scroll',()=>{
      const port=document.querySelector('#nested-port').getBoundingClientRect();
      const range=document.createRange();range.selectNodeContents(document.querySelector('#nested-second'));
      const label=range.getBoundingClientRect();
      if(label.top>=port.top&&label.bottom<=port.bottom)
        document.querySelector('#nested-proof').textContent='Nested scroll exposed the complete label';
    });</script>`);
  value.writer.write('index.html', html);
  const recoverable = scenario.overflow === 'auto' && !scenario.oversized;
  const manifest = { ...plan, scripts: plan.scripts.map(script => ({
    ...script,
    actions: [...script.actions, ...(script.actions.some(action => action.kind === 'click') ? [{
      kind: 'press' as const, selector: '#nested-second', key: 'Enter' as const,
    }] : [])],
    assertions: [...script.assertions, ...(recoverable && script.actions.some(action => action.kind === 'click') ? [{
      kind: 'visible-text' as const, selector: '#nested-proof', text: 'Nested scroll exposed the complete label',
    }] : [])],
  })) };
  const result = await runNativeEvaluation({ ...value, manifest });
  assert.equal(result.receipt.hardFloors.behavior, 'pass', JSON.stringify(result.receipt.outcomeResults));
  assert.equal(result.receipt.hardFloors.access, recoverable ? 'pass' : 'fail');
  assert.equal(result.ok, recoverable);
  assert.equal(readFileSync(join(value.root, 'index.html'), 'utf8'), html);
});
}

for (const overflow of ['auto', 'visible'] as const) {
test(`control outside ${overflow} scroll port preserves actual visibility checks`, async t => {
  const value = fixture(t);
  const html = readFileSync(join(value.root, 'index.html'), 'utf8')
    .replace('</style>', 'html{height:100%;overflow:hidden}body{height:calc(100vh - 48px);overflow:hidden}</style>')
    .replace('</section>', `</section><section style="height:100px;overflow-y:${overflow}">
      <div id="spacer"></div><button id="outside-port" style="height:100px">Unavailable action</button></section>`)
    .replace('</script>', `const spacer=document.querySelector('#spacer');
      spacer.style.height=(innerHeight-30-spacer.getBoundingClientRect().top)+'px';</script>`);
  value.writer.write('index.html', html);
  const result = await runNativeEvaluation(value);
  assert.equal(result.receipt.hardFloors.behavior, 'pass');
  assert.equal(result.receipt.hardFloors.access, overflow === 'auto' ? 'pass' : 'fail');
  assert.equal(result.ok, overflow === 'auto');
  assert.equal(result.acceptanceStatus, 'review-required');
  assert.equal(readFileSync(join(value.root, 'index.html'), 'utf8'), html);
});
}

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

test('maker repair projection retains failed native evaluator results and exact execution lineage', async t => {
  // Given a real failed browser evaluation, not a fabricated publisher receipt.
  const value = fixture(t, { broken: true });
  const result = await runNativeEvaluation(value);
  // When the maker host projects its complete evaluator lineage.
  const lineage = makerEvaluationLineage(value.root, value.invocation);
  // Then source repair receives every measured failure, capture and executed plan binding.
  assert.equal(lineage.length, 1);
  assert.equal(lineage[0]?.observationSha256, result.observationSha256);
  assert.equal(lineage[0]?.executionPlanSha256, result.receipt.executionPlanSha256);
  assert.deepEqual(lineage[0]?.outcomeResults, result.receipt.outcomeResults);
  assert.deepEqual(lineage[0]?.captures, result.receipt.captures);
  assert.equal(lineage[0]?.hardFloors.behavior, 'fail');
  installNativeFidelityReferences(t, value.root);
  const visual = makerVisuals({
    root: value.root, invocation: value.invocation,
    route: readPersistedRoute(value.root, value.invocation),
    maker: { schema: 'native-maker-input-v1', role: 'omd-hand', candidateId: null,
      paths: ['index.html'], readPaths: [], axis: null },
  });
  const renders = visual.renders.filter(render => render.role === 'first-party-browser-execution');
  const distinct = new Set(result.receipt.captures.map(capture => capture.sha256));
  assert.ok(result.receipt.captures.length > distinct.size, 'the real evaluator repeats identical captures');
  assert.equal(renders.length, distinct.size, 'deliver identical whole images once while preserving every lineage capture');
  assert.deepEqual(new Set(renders.map(render => render.captureSha256)), distinct);
  for (const render of renders) {
    assert.equal(hash(Buffer.from(render.pngBase64, 'base64')), render.captureSha256);
  }
  assert.deepEqual(visual.lineage.filter(row => typeof row === 'object' && row !== null
    && Reflect.get(row, 'kind') === 'browser-execution'), lineage);
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
