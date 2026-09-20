import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  parseTaskFlowBenchmark,
  parseTaskFlowBenchmarkProjection,
  projectTaskFlowBenchmark,
  taskFlowBenchmarkSha256,
  validateTaskFlowBenchmarkEvidence,
} from '../core/ref/task-flow-benchmark.ts';

const SHA = 'a'.repeat(64);
const evidence = (path: string, digest = 'b'.repeat(64)) => ({ path: `.omd/refs/${path}`, sha256: digest });

function exploredSource(id: string, origin: string, suffix: string) {
  const entry = `${id}-entry`;
  const review = `${id}-review`;
  return {
    id,
    url: origin,
    kind: 'same-domain-service',
    observedAt: '2026-08-25',
    coverage: {
      scope: 'public pre-auth task flow',
      status: 'complete',
      discoveredTargetCount: 2,
      entryScreenIds: [entry],
      inspectedScreenIds: [entry, review],
      excludedTargets: [],
    },
    screens: [
      {
        id: entry, name: 'Entry', url: origin, state: 'initial controls visible',
        reachedBy: { fromScreenId: null, action: 'open the entry URL', result: 'entry controls appear' },
        evidence: evidence(`${suffix}-screen-entry.png`),
      },
      {
        id: review, name: 'Review', url: `${origin}/review`, state: 'review visible',
        reachedBy: { fromScreenId: entry, action: 'continue with safe test data', result: 'review appears' },
        evidence: evidence(`${suffix}-screen-review.png`),
      },
    ],
    features: [{ id: `${id}-feature`, name: 'Review', behavior: 'preserves input before commitment', screenIds: [entry, review] }],
    flows: [{
      id: `${id}-flow`, intent: 'review before commitment', status: 'completed', limitation: null,
      steps: [
        { order: 1, screenId: entry, action: 'open entry', result: 'initial controls appear', evidence: evidence(`${suffix}-flow-1.png`) },
        { order: 2, screenId: review, action: 'continue safely', result: 'review appears', evidence: evidence(`${suffix}-flow-2.png`) },
      ],
    }],
  };
}

function benchmark(): any {
  return {
    schema: 'task-flow-benchmark-v2',
    surface: 'product',
    domain: 'residential-field-service',
    sourceContractSha256: SHA,
    sources: [
      {
        ...exploredSource('source-a', 'https://example.com/field-service-a', 'a'),
        observedPatterns: ['issue capture precedes scheduling'],
        forbiddenTransfers: ['pricing', 'response-time promises'],
      },
      {
        ...exploredSource('source-b', 'https://example.org/field-service-b', 'b'),
        observedPatterns: ['unknown remains a valid answer'],
        forbiddenTransfers: ['provider identity', 'availability'],
      },
    ],
    taskSteps: [
      {
        id: 'observe',
        intent: 'capture observable symptoms without diagnosis',
        dependsOn: [],
        evidenceSourceIds: ['source-a', 'source-b'],
      },
      {
        id: 'evidence',
        intent: 'attach optional evidence after symptom capture',
        dependsOn: ['observe'],
        evidenceSourceIds: ['source-b'],
      },
      {
        id: 'availability',
        intent: 'collect preferred availability after minimum scope',
        dependsOn: ['observe'],
        evidenceSourceIds: ['source-a'],
      },
    ],
    counterexamples: [
      {
        id: 'schedule-first',
        reason: 'asks for availability before minimum issue scope',
        evidenceSourceIds: ['source-a'],
      },
      {
        id: 'false-completion',
        reason: 'calls a request a completed service',
        evidenceSourceIds: ['source-b'],
      },
    ],
  };
}

test('task-flow benchmark binds multiple observed services to task order', () => {
  const parsed = parseTaskFlowBenchmark(benchmark(), {
    expectedSourceContractSha256: SHA,
  });

  assert.equal(parsed.sources.length, 2);
  assert.deepEqual(parsed.taskSteps.map((step) => step.id), [
    'observe',
    'evidence',
    'availability',
  ]);
  assert.match(taskFlowBenchmarkSha256(parsed), /^[a-f0-9]{64}$/);
});

test('an editorial task-flow preserves its grammar through projection with unchanged evidence obligations', () => {
  const input = { ...benchmark(), surface: 'editorial', domain: 'editorial-reading-and-saving' };
  const parsed = parseTaskFlowBenchmark(input, { expectedSourceContractSha256: SHA });
  const projection = projectTaskFlowBenchmark(parsed);
  assert.equal(parsed.surface, 'editorial');
  assert.equal(projection.surface, 'editorial');
  assert.equal(projection.domain, input.domain);
  assert.deepEqual(parseTaskFlowBenchmarkProjection(projection, { expectedSourceContractSha256: SHA }), projection);
  assert.throws(() => parseTaskFlowBenchmark({ ...input, sources: input.sources.slice(0, 1) }), /TASK_FLOW_BENCHMARK_SOURCE_COVERAGE/);
  assert.throws(() => parseTaskFlowBenchmarkProjection(projection, { expectedSourceContractSha256: 'b'.repeat(64) }), /TASK_FLOW_BENCHMARK_SOURCE_STALE/);
  for (const surface of ['marketing', 'reading-app', '', null]) {
    assert.throws(() => parseTaskFlowBenchmark({ ...input, surface }), /TASK_FLOW_BENCHMARK_SURFACE/);
    assert.throws(() => parseTaskFlowBenchmarkProjection({ ...projection, surface }), /TASK_FLOW_BENCHMARK_SURFACE/);
  }
});

test('task-flow benchmark rejects component-only or unbound evidence', () => {
  const oneSource = benchmark();
  oneSource.sources = oneSource.sources.slice(0, 1);
  assert.throws(
    () => parseTaskFlowBenchmark(oneSource),
    /TASK_FLOW_BENCHMARK_SOURCE_COVERAGE/,
  );

  const missingEvidence = benchmark();
  missingEvidence.taskSteps[0]!.evidenceSourceIds = ['missing'];
  assert.throws(
    () => parseTaskFlowBenchmark(missingEvidence),
    /TASK_FLOW_BENCHMARK_EVIDENCE_REF/,
  );

  assert.throws(
    () =>
      parseTaskFlowBenchmark(benchmark(), {
        expectedSourceContractSha256: 'b'.repeat(64),
      }),
    /TASK_FLOW_BENCHMARK_SOURCE_STALE/,
  );
});

test('task-flow benchmark requires every discovered screen to be inspected, reachable, and organized by feature or flow', () => {
  const missingTarget = benchmark();
  missingTarget.sources[0]!.coverage.discoveredTargetCount = 3;
  assert.throws(() => parseTaskFlowBenchmark(missingTarget), /TASK_FLOW_BENCHMARK_DISCOVERED_TARGET_COUNT/);

  const missingInspection = benchmark();
  missingInspection.sources[0]!.coverage.inspectedScreenIds = ['source-a-entry'];
  assert.throws(() => parseTaskFlowBenchmark(missingInspection), /TASK_FLOW_BENCHMARK_INSPECTED_SCREEN_COVERAGE/);

  const unreachable = benchmark();
  unreachable.sources[0]!.screens[1]!.reachedBy.fromScreenId = 'missing';
  assert.throws(() => parseTaskFlowBenchmark(unreachable), /TASK_FLOW_BENCHMARK_REACHED_BY_SOURCE/);

  const unorganized = benchmark();
  unorganized.sources[0]!.features[0]!.screenIds = ['source-a-entry'];
  unorganized.sources[0]!.flows[0]!.steps = [unorganized.sources[0]!.flows[0]!.steps[0]!];
  assert.throws(() => parseTaskFlowBenchmark(unorganized), /TASK_FLOW_BENCHMARK_SCREEN_USE_COVERAGE/);
});

test('bounded gaps are explicit and complete coverage cannot hide unreachable targets', () => {
  const hiddenGap = benchmark();
  hiddenGap.sources[0]!.coverage.excludedTargets = [{
    id: 'account', url: 'https://example.com/account', category: 'authentication', reason: 'requires a customer account',
  }];
  hiddenGap.sources[0]!.coverage.discoveredTargetCount = 3;
  assert.throws(() => parseTaskFlowBenchmark(hiddenGap), /TASK_FLOW_BENCHMARK_COVERAGE_STATUS/);

  hiddenGap.sources[0]!.coverage.status = 'bounded-gap';
  assert.doesNotThrow(() => parseTaskFlowBenchmark(hiddenGap));
});

test('same-domain services remain the basis instead of adjacent products or guidance', () => {
  const adjacent = benchmark();
  adjacent.sources[1]!.kind = 'adjacent-domain-service';
  assert.throws(() => parseTaskFlowBenchmark(adjacent), /TASK_FLOW_BENCHMARK_SAME_DOMAIN_COVERAGE/);
});

test('current local browser evidence is required for every screen and flow step', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-task-flow-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = benchmark();
  const bytes = Buffer.from('current browser evidence');
  const digest = createHash('sha256').update(bytes).digest('hex');
  for (const source of input.sources) {
    for (const item of [
      ...source.screens.map((screen: any) => screen.evidence),
      ...source.flows.flatMap((flow: any) => flow.steps.map((step: any) => step.evidence)),
    ]) {
      item.sha256 = digest;
      const target = join(root, item.path);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, bytes);
    }
  }
  const parsed = parseTaskFlowBenchmark(input);
  const strength = validateTaskFlowBenchmarkEvidence(root, parsed);
  assert.equal(strength.liveFlowVerified, false, 'matching file hashes cannot attest a browser action');
  assert.ok(strength.observations.every(row => row.grade === 'artifact-only' && row.actionVerified === false));
  writeFileSync(join(root, input.sources[0]!.screens[0]!.evidence.path), 'stale');
  assert.throws(() => validateTaskFlowBenchmarkEvidence(root, parsed), /TASK_FLOW_BENCHMARK_EVIDENCE_STALE/);
});

test('task-flow benchmark rejects invented alias fields at every boundary', () => {
  const extraRoot = { ...benchmark(), observedAt: '2026-08-25' };
  assert.throws(
    () => parseTaskFlowBenchmark(extraRoot),
    /TASK_FLOW_BENCHMARK_KEYS/,
  );

  const extraSource = benchmark();
  Object.assign(extraSource.sources[0]!, {
    observedSequence: ['intake', 'schedule'],
  });
  assert.throws(
    () => parseTaskFlowBenchmark(extraSource),
    /TASK_FLOW_BENCHMARK_SOURCE_KEYS/,
  );
});

test('task-flow projection preserves and validates direct dependency edges', () => {
  const projection = projectTaskFlowBenchmark(parseTaskFlowBenchmark(benchmark()));
  const parsed = parseTaskFlowBenchmarkProjection(projection, {
    expectedSourceContractSha256: SHA,
  });
  assert.deepEqual(parsed.taskSteps[1]?.dependsOn, ['observe']);

  assert.throws(
    () => parseTaskFlowBenchmarkProjection({
      ...projection,
      taskSteps: projection.taskSteps.map((step) => step.id === 'evidence'
        ? { ...step, dependsOn: ['missing'] }
        : step),
    }),
    /TASK_FLOW_BENCHMARK_EVIDENCE_REF/,
  );
});
