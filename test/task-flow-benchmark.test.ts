import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseTaskFlowBenchmark,
  parseTaskFlowBenchmarkProjection,
  projectTaskFlowBenchmark,
  taskFlowBenchmarkSha256,
} from '../core/ref/task-flow-benchmark.ts';

const SHA = 'a'.repeat(64);

function benchmark() {
  return {
    schema: 'task-flow-benchmark-v1',
    surface: 'product',
    domain: 'residential-field-service',
    sourceContractSha256: SHA,
    sources: [
      {
        id: 'source-a',
        url: 'https://example.com/field-service-a',
        observedAt: '2026-08-25',
        observedPatterns: ['issue capture precedes scheduling'],
        forbiddenTransfers: ['pricing', 'response-time promises'],
      },
      {
        id: 'source-b',
        url: 'https://example.org/field-service-b',
        observedAt: '2026-08-25',
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
