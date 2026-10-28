import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { buildNativeMeasuredFinalDraft } from '../core/runtime/native-final-manifest.ts';
import { validateFinalProductionEvidence } from '../core/evidence/final-v2-graph.ts';
import { nodeStableProjectFileSystem } from '../core/runtime/stable-project-file.ts';
import { nativeCompletionWork } from '../core/stage/native-completion.ts';
import { MODEL_LED_STRATEGY_DECISION } from '../core/route/adaptive-flow-domain.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { createAdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import { validateSourceSeal } from '../core/source-seal/index.ts';
import {
  modelLedMeasuredTerminalFixture,
  reviewedModelLedGraph,
} from './helpers/model-led.ts';

let shared!: Awaited<ReturnType<typeof modelLedMeasuredTerminalFixture>>;
let cleanupShared: () => void = () => undefined;
before(async () => {
  shared = await modelLedMeasuredTerminalFixture({
    after(cleanup) { cleanupShared = cleanup; },
  });
});
after(() => cleanupShared());

test('model-led adaptive evidence builds a measured native final draft without structured workflow records', async t => {
  const fixture = await modelLedMeasuredTerminalFixture(t);
  const graph = reviewedModelLedGraph(fixture);
  validateFinalProductionEvidence(
    fixture.root,
    graph,
    nodeStableProjectFileSystem(),
    fixture.invocation,
  );
  const draft = buildNativeMeasuredFinalDraft(
    fixture.root,
    fixture.invocation,
    '.omd/activation-record.json',
  );
  assert.equal(draft.schema, 'final-evidence-v2');
  assert.equal(draft.graph.schema, 'final-evidence-v2-adaptive-omission-graph');
  assert.ok(draft.graph.measuredTerminal);
  assert.deepEqual(draft.graph.measuredTerminal.measurements, fixture.measurements);
  assert.equal(Object.hasOwn(draft.graph, 'blindLane'), false);
  assert.equal(nativeCompletionWork(fixture.root, fixture.invocation).action, 'author-browser-plan');
  assert.equal(
    nativeCompletionWork(fixture.root, fixture.invocation).next,
    'omd schema trusted-lifecycle-manifest --json',
  );
});

test('measured adaptive draft binds the complete current observation chain', async t => {
  const fixture = await modelLedMeasuredTerminalFixture(t);
  const graph = reviewedModelLedGraph(fixture);
  const draft = buildNativeMeasuredFinalDraft(
    fixture.root,
    fixture.invocation,
    '.omd/activation-record.json',
  );
  assert.deepEqual(
    draft.graph.observations.map(observation => observation.sha256),
    graph.observations.map(observation => observation.sha256),
  );
  assert.equal(draft.graph.buildIdentity.sha256, graph.buildIdentity.sha256);
  assert.equal(draft.graph.sourceSeal.sha256, graph.sourceSeal.sha256);
});

test('measured adaptive draft refuses changed production source without mutating evidence', async t => {
  const fixture = await modelLedMeasuredTerminalFixture(t);
  reviewedModelLedGraph(fixture);
  const observationPointer = readFileSync(join(fixture.root, '.omd/observation-v2.json'));
  const sourceSeal = readFileSync(join(fixture.root, '.omd/source-seal.json'));
  writeFileSync(join(fixture.root, fixture.entry), `${readFileSync(join(fixture.root, fixture.entry), 'utf8')}\n<!-- changed -->`);
  assert.throws(() => buildNativeMeasuredFinalDraft(
    fixture.root,
    fixture.invocation,
    '.omd/activation-record.json',
  ), /source changed|build changed|stale/i);
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/observation-v2.json')), observationPointer);
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/source-seal.json')), sourceSeal);
});

test('model-led adaptive route refuses a missing measured slop review before final draft', async t => {
  const fixture = await modelLedMeasuredTerminalFixture(t, { reviewSlop: false });
  assert.throws(() => buildNativeMeasuredFinalDraft(
    fixture.root,
    fixture.invocation,
    '.omd/activation-record.json',
  ), /slop|review|measured/i);
});

test('fresh route input persists only the canonical model-led strategy', () => {
  assert.deepEqual(
    readPersistedRoute(shared.root, shared.invocation).strategy,
    MODEL_LED_STRATEGY_DECISION,
  );
});

test('model-led source seal carries no selected structured stages', () => {
  const route = createAdaptiveSourceSealRoute(shared.root, shared.invocation);
  assert.equal(route.executionStyle, 'model-led');
  assert.ok(route.stages.every(stage => stage.status === 'not-selected'));
});

test('measured draft omits legacy blind, fidelity, and protocol lane fields', () => {
  const draft = buildNativeMeasuredFinalDraft(
    shared.root,
    shared.invocation,
    '.omd/activation-record.json',
  );
  assert.equal(Object.hasOwn(draft.graph, 'blindLane'), false);
  assert.equal(Object.hasOwn(draft.graph, 'fidelityLane'), false);
  assert.equal(Object.hasOwn(draft.graph, 'protocolLane'), false);
});

test('measured draft binds the persisted source contract claims', () => {
  const route = readPersistedRoute(shared.root, shared.invocation);
  const draft = buildNativeMeasuredFinalDraft(
    shared.root,
    shared.invocation,
    '.omd/activation-record.json',
  );
  assert.deepEqual(draft.claimPublication, route.sourceContract.evidenceClaims);
});

test('native completion requests a browser plan before terminal publication', () => {
  const work = nativeCompletionWork(shared.root, shared.invocation);
  assert.equal(work.action, 'author-browser-plan');
  assert.equal(work.next, 'omd schema trusted-lifecycle-manifest --json');
});

test('reviewed model-led graph passes production evidence validation', () => {
  assert.doesNotThrow(() => validateFinalProductionEvidence(
    shared.root,
    reviewedModelLedGraph(shared),
    nodeStableProjectFileSystem(),
    shared.invocation,
  ));
});

test('forged embedded route identity is refused by production validation', () => {
  const graph = structuredClone(reviewedModelLedGraph(shared));
  Reflect.set(graph.route.selectedModel, 'revision', 'forged-model-revision');
  assert.throws(() => validateFinalProductionEvidence(
    shared.root,
    graph,
    nodeStableProjectFileSystem(),
    shared.invocation,
  ), /canonical route|MODEL_IDENTITY_MISMATCH|SOURCE_CONTRACT_MISMATCH/i);
});

test('current model-led source seal validates without legacy workflow artifacts', () => {
  assert.deepEqual(validateSourceSeal(shared.root, shared.invocation), []);
});
