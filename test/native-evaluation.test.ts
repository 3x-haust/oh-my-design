import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { createBuildIdentityFromSource } from '../adapters/build.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { runNativeEvaluation } from '../core/runtime/native-evaluation.ts';
import { recordModelLedExecution } from '../core/runtime/model-led-execution.ts';
import { readCurrentObservationV2 } from '../core/runtime/observation.ts';
import { parseTrustedBrowserReceipt } from '../core/runtime/trusted-browser-receipt.ts';
import { nativeCompletionWork } from '../core/stage/native-completion.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

const packRoot = fileURLToPath(new URL('../core', import.meta.url));
const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
const request = 'Build a shipment evidence review workspace';

function manifest() {
  return {
    schema: 'trusted-lifecycle-manifest-v1',
    entryPath: 'index.html',
    scripts: [
      { outcomeRef: 'mustHave:0', actions: [], assertions: [
        { kind: 'visible-text', selector: '[data-omd-purpose]', text: 'Review shipment evidence' },
      ] },
      { outcomeRef: 'mustNotHave:0', actions: [], assertions: [
        { kind: 'absent-text', selector: 'body', text: 'Invented approval' },
      ] },
      { outcomeRef: 'completionEvidence:0', actions: [
        { kind: 'click', selector: '[data-omd-task-id="inspect-evidence"]' },
      ], assertions: [
        { kind: 'visible-text', selector: '[data-omd-consequence-for]', text: 'Evidence reviewed' },
      ] },
    ],
  };
}

function fixture(t: TestContext, options: Readonly<{ broken?: boolean; taskNeed?: string }> = {}) {
  const input = modelLedInput(request);
  if (options.taskNeed) (input.referenceDiscovery as Record<string, unknown>).taskNeed = options.taskNeed;
  input.taskOutcome = {
    schema: 'task-outcome-contract-v1',
    goal: 'Review shipment evidence.',
    mustHave: ['Review shipment evidence'],
    mustNotHave: ['Invented approval'],
    completionEvidence: ['Evidence reviewed'],
    strategyFreedom: ['Choose a readable implementation.'],
  };
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-evaluation-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const build = createBuildIdentityFromSource(runtimeRoot);
  const { invocation, writer } = createModelLedRouteContext(temporary, request, {
    current: {
      buildSha256: build.buildSha256,
      loadedSkillSha256: build.sourceSkillSha256,
      briefSha256: valueHash(request),
    },
  });
  publishAdaptiveRoute(temporary, input, writer, invocation);
  writer.write('index.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Shipment evidence</title>
  <style>body{font:18px Arial;margin:24px}button{min-height:44px;padding:10px 16px}</style>
  <main><h1 data-omd-purpose>Review shipment evidence</h1>
  <button data-omd-task-id="inspect-evidence">Inspect evidence</button>
  <p data-omd-consequence-for="inspect-evidence">Awaiting review</p></main>
  <script>${options.broken ? '' : "document.querySelector('button').onclick=()=>document.querySelector('[data-omd-consequence-for]').textContent='Evidence reviewed';"}</script></html>`);
  return { root: temporary, invocation, writer, packRoot };
}

function valueHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

test('model-led evaluation executes an outcome-bound browser plan and publishes live evidence', async t => {
  const value = fixture(t);
  const result = await runNativeEvaluation({ ...value, manifest: manifest() });
  assert.equal(result.ok, true);
  assert.equal(result.executionStatus, 'pass');
  assert.equal(result.acceptanceStatus, 'review-required');
  assert.deepEqual(new Set(result.receipt.captures.map(capture => `${capture.width}x${capture.height}`)), new Set(['1280x900', '390x844']));
  assert.ok(result.receipt.transcript.some(entry => entry.startsWith('action-click:')));
  assert.deepEqual(readCurrentObservationV2(value.root), result.observation);
  const parsed = parseTrustedBrowserReceipt(JSON.parse(readFileSync(join(value.root, result.receiptPath), 'utf8')));
  assert.equal(parsed.executionPlanSha256, result.receipt.executionPlanSha256);
});

test('model-led evaluation preserves a real behavior failure as review-required evidence', async t => {
  const value = fixture(t, { broken: true });
  const result = await runNativeEvaluation({ ...value, manifest: manifest() });
  assert.equal(result.ok, false);
  assert.equal(result.executionStatus, 'fail');
  assert.equal(result.acceptanceStatus, 'review-required');
  assert.equal(result.receipt.hardFloors.behavior, 'fail');
  assert.ok(result.receipt.outcomeResults.some(outcome => outcome.status === 'fail'));
  assert.deepEqual(readCurrentObservationV2(value.root), result.observation);
});

test('model-led evaluation refuses incomplete outcome coverage without publishing evidence', async t => {
  const value = fixture(t);
  await assert.rejects(() => runNativeEvaluation({
    ...value,
    manifest: { ...manifest(), scripts: [] },
  }), /NATIVE_EVALUATION_MANIFEST_MISMATCH/);
  assert.equal(readCurrentObservationV2(value.root), undefined);
  assert.equal(existsSync(join(value.root, '.omd/build.json')), false);
});

test('model-led evaluation refuses an invalid current decision graph before browser publication', async t => {
  const value = fixture(t);
  recordModelLedExecution(value.root, value.invocation, 'index.html');
  writeFileSync(join(value.root, '.omd/decision-graph.json'), '{"schema":"decision-graph-v1","decisions":[]}');
  await assert.rejects(() => runNativeEvaluation({ ...value, manifest: manifest() }),
    /NATIVE_EVALUATION_DECISION_GRAPH_INVALID/);
  assert.equal(readCurrentObservationV2(value.root), undefined);
});

test('serialized invocation data cannot replace live native authority', async t => {
  const value = fixture(t);
  await assert.rejects(() => runNativeEvaluation({
    ...value,
    invocation: structuredClone(value.invocation),
    manifest: manifest(),
  }), /native|invocation|authority/i);
  assert.equal(readCurrentObservationV2(value.root), undefined);
});

test('native completion distinguishes an uncached browser proposal from a cached lifecycle finish', async t => {
  const value = fixture(t);
  await runNativeEvaluation({ ...value, manifest: manifest() });
  const uncached = nativeCompletionWork(value.root, value.invocation);
  assert.equal(uncached.action, 'author-browser-plan');
  assert.equal(uncached.next, 'omd schema trusted-lifecycle-manifest --json');
  mkdirSync(join(value.root, '.omd/.cache'), { recursive: true });
  writeFileSync(join(value.root, '.omd/.cache/trusted-lifecycle-manifest.json'), JSON.stringify(manifest()));
  const cached = nativeCompletionWork(value.root, value.invocation);
  assert.equal(cached.action, 'finish-model-led');
  assert.equal(cached.next, 'omd lifecycle finish --json');
});

test('lifecycle finish reports a failing browser check before spending an isolated visual review', async t => {
  const { runModelLedCompletion } = await import('../bin/model-led-completion-command.ts');
  const value = fixture(t, { broken: true, taskNeed: 'copy-only-edit' });
  const started = Date.now();
  const result = await runModelLedCompletion({ ...value, manifest: manifest() });
  assert.equal(result.phase, 'browser', JSON.stringify(result.diagnostic));
  assert.equal(result.diagnostic?.code, 'FINAL_BEHAVIOR_FAILED');
  assert.equal(result.firstRender, undefined, 'no first-render review ran');
  assert.ok(Date.now() - started < 120_000);
});
