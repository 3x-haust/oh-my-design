import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import {
  FUNCTIONAL_REQUIREMENTS_V2_SCHEMA,
  parseFunctionalRequirements,
} from '../core/completeness/index.ts';
import {
  checkCompletionPublicationPrerequisites,
  checkTerminalCompletion,
} from '../core/completion/preflight.ts';
import { validateFinalProductionEvidence } from '../core/evidence/final-v2-graph.ts';
import { MODEL_LED_STRATEGY_DECISION } from '../core/route/adaptive-flow-domain.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { buildNativeMeasuredFinalDraft } from '../core/runtime/native-final-manifest.ts';
import { nodeStableProjectFileSystem } from '../core/runtime/stable-project-file.ts';
import { nativeCompletionWork } from '../core/stage/native-completion.ts';
import { createAdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import { validateSourceSeal } from '../core/source-seal/index.ts';
import {
  modelLedMeasuredTerminalFixture,
  reviewedModelLedGraph,
} from './helpers/model-led.ts';

const CLI = new URL('../bin/omd.ts', import.meta.url);
let shared!: Awaited<ReturnType<typeof modelLedMeasuredTerminalFixture>>;
let cleanupShared: () => void = () => undefined;
before(async () => {
  shared = await modelLedMeasuredTerminalFixture({
    after(cleanup) { cleanupShared = cleanup; },
  });
});
after(() => cleanupShared());
const requirementsV1 = {
  schema: 'functional-requirements-v1',
  requirements: [{ id: 'R-1', kind: 'action', statement: 'Open the repository', label: 'Open' }],
} as const;
const requirementsV2 = {
  schema: FUNCTIONAL_REQUIREMENTS_V2_SCHEMA,
  requirements: [{ id: 'R-1', kind: 'action', statement: 'Open the repository', label: 'Open' }],
  evidence: {
    states: ['ready'],
    viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
  },
} as const;

test('legacy functional requirements remain readable while v2 keeps its strict evidence shape', () => {
  assert.equal(parseFunctionalRequirements(requirementsV1).schema, 'functional-requirements-v1');
  assert.equal(parseFunctionalRequirements(requirementsV2).schema, 'functional-requirements-v2');
  assert.throws(() => parseFunctionalRequirements({
    ...requirementsV2,
    evidence: { states: [], viewports: requirementsV2.evidence.viewports },
  }), /at least one evidence state/);
  assert.deepEqual(
    parseFunctionalRequirements({ ...requirementsV2, extra: true }),
    parseFunctionalRequirements(requirementsV2),
  );
  const inherited = Object.create(requirementsV2) as object;
  assert.throws(() => parseFunctionalRequirements(inherited), /must not inherit input properties/);
});

test('retired completeness publishers are absent while guard completion reaches native authority', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-completion-cli-'));
  try {
    const removed = spawnSync(process.execPath, [CLI.pathname, 'complete', 'set', '--json'], {
      cwd: root, encoding: 'utf8',
    });
    assert.equal(removed.status, 1);
    assert.match(`${removed.stdout}\n${removed.stderr}`, /unknown command complete/i);
    const retained = spawnSync(process.execPath, [CLI.pathname, 'guard', 'completion', '--json'], {
      cwd: root, encoding: 'utf8',
    });
    assert.equal(retained.status, 1);
    assert.doesNotMatch(`${retained.stdout}\n${retained.stderr}`, /unknown command/i);
    assert.match(`${retained.stdout}\n${retained.stderr}`, /NATIVE_PI_AUTHORITY|ROUTE_UNCLASSIFIED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('terminal preflight is read-only before measured final publication', async t => {
  const fixture = await modelLedMeasuredTerminalFixture(t);
  reviewedModelLedGraph(fixture);
  const source = readFileSync(join(fixture.root, fixture.entry));
  const observation = readFileSync(join(fixture.root, '.omd/observation-v2.json'));
  assert.throws(() => checkTerminalCompletion(fixture.root, fixture.invocation),
    /final evidence pointer|final-evidence-v2|measured terminal|FINAL_EVIDENCE/i);
  assert.deepEqual(readFileSync(join(fixture.root, fixture.entry)), source);
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/observation-v2.json')), observation);
});

test('model-led completion refuses a legacy graph without immutable measured terminal evidence', async t => {
  const fixture = await modelLedMeasuredTerminalFixture(t);
  const graph = reviewedModelLedGraph(fixture);
  const { measuredTerminal: _measuredTerminal, ...legacy } = graph;
  assert.throws(() => checkCompletionPublicationPrerequisites(
    fixture.root,
    { graph: legacy },
    fixture.invocation,
  ), /measured terminal/i);
});

test('completion route persists the fixed model-led strategy', () => {
  assert.deepEqual(
    readPersistedRoute(shared.root, shared.invocation).strategy,
    MODEL_LED_STRATEGY_DECISION,
  );
});

test('completion source seal records model-led execution', () => {
  assert.equal(
    createAdaptiveSourceSealRoute(shared.root, shared.invocation).executionStyle,
    'model-led',
  );
});

test('completion source seal does not select deleted structured stages', () => {
  assert.ok(
    createAdaptiveSourceSealRoute(shared.root, shared.invocation)
      .stages.every(stage => stage.status === 'not-selected'),
  );
});

test('reviewed completion graph uses measured terminal evidence', () => {
  assert.equal(
    reviewedModelLedGraph(shared).measuredTerminal.schema,
    'measured-terminal-graph-v1',
  );
});

test('reviewed completion graph binds exact measurement receipts', () => {
  assert.deepEqual(
    reviewedModelLedGraph(shared).measuredTerminal.measurements,
    shared.measurements,
  );
});

test('reviewed completion graph binds the complete observation chain', () => {
  assert.deepEqual(
    reviewedModelLedGraph(shared).observations.map(observation => observation.sha256),
    shared.observationSha256s,
  );
});

test('ordinary model-led completion selects one blind reviewer', () => {
  assert.deepEqual(
    reviewedModelLedGraph(shared).measuredTerminal.reviewPolicy.lanes,
    { blind: 1, fidelity: 0, protocol: 0 },
  );
});

test('reviewed completion graph omits legacy review lane fields', () => {
  const graph = reviewedModelLedGraph(shared);
  assert.equal(Object.hasOwn(graph, 'blindLane'), false);
  assert.equal(Object.hasOwn(graph, 'fidelityLane'), false);
  assert.equal(Object.hasOwn(graph, 'protocolLane'), false);
});

test('measured completion draft retains current build and source seal receipts', () => {
  const graph = reviewedModelLedGraph(shared);
  const draft = buildNativeMeasuredFinalDraft(
    shared.root,
    shared.invocation,
    '.omd/activation-record.json',
  );
  assert.deepEqual(draft.graph.buildIdentity, graph.buildIdentity);
  assert.deepEqual(draft.graph.sourceSeal, graph.sourceSeal);
});

test('reviewed completion graph passes current production evidence validation', () => {
  assert.doesNotThrow(() => validateFinalProductionEvidence(
    shared.root,
    reviewedModelLedGraph(shared),
    nodeStableProjectFileSystem(),
    shared.invocation,
  ));
});

test('current completion source seal is valid without workflow artifacts', () => {
  assert.deepEqual(validateSourceSeal(shared.root, shared.invocation), []);
  assert.equal(nativeCompletionWork(shared.root, shared.invocation).action, 'author-browser-plan');
});
