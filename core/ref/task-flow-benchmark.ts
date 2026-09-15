import { createHash } from 'node:crypto';

export const TASK_FLOW_BENCHMARK_SCHEMA =
  'task-flow-benchmark-v1' as const;
export const TASK_FLOW_BENCHMARK_PROJECTION_SCHEMA =
  'task-flow-benchmark-projection-v1' as const;
// Editorial reading, section navigation and saved-reading flows retain their
// reading grammar while satisfying a route-selected task-flow benchmark.
export const TASK_FLOW_BENCHMARK_SURFACES = ['product', 'mixed', 'editorial'] as const;
type BenchmarkSurface = typeof TASK_FLOW_BENCHMARK_SURFACES[number];
export const TASK_FLOW_BENCHMARK_KEYS = [
  'schema',
  'surface',
  'domain',
  'sourceContractSha256',
  'sources',
  'taskSteps',
  'counterexamples',
] as const;
export const TASK_FLOW_BENCHMARK_SOURCE_KEYS = [
  'id',
  'url',
  'observedAt',
  'observedPatterns',
  'forbiddenTransfers',
] as const;
export const TASK_FLOW_BENCHMARK_TASK_KEYS = [
  'id',
  'intent',
  'dependsOn',
  'evidenceSourceIds',
] as const;
export const TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_KEYS = [
  'id',
  'reason',
  'evidenceSourceIds',
] as const;
const TASK_FLOW_BENCHMARK_PROJECTION_KEYS = [
  'schema',
  'benchmarkSha256',
  'sourceContractSha256',
  'surface',
  'domain',
  'taskSteps',
  'counterexamples',
] as const;
const TASK_FLOW_BENCHMARK_PROJECTION_TASK_KEYS = ['id', 'intent', 'dependsOn'] as const;
const TASK_FLOW_BENCHMARK_PROJECTION_COUNTEREXAMPLE_KEYS = ['id', 'reason'] as const;

type BenchmarkSource = Readonly<{
  id: string;
  url: string;
  observedAt: string;
  observedPatterns: readonly string[];
  forbiddenTransfers: readonly string[];
}>;

type BenchmarkTaskStep = Readonly<{
  id: string;
  intent: string;
  dependsOn: readonly string[];
  evidenceSourceIds: readonly string[];
}>;

type BenchmarkCounterexample = Readonly<{
  id: string;
  reason: string;
  evidenceSourceIds: readonly string[];
}>;

export type TaskFlowBenchmark = Readonly<{
  schema: typeof TASK_FLOW_BENCHMARK_SCHEMA;
  surface: BenchmarkSurface;
  domain: string;
  sourceContractSha256: string;
  sources: readonly BenchmarkSource[];
  taskSteps: readonly BenchmarkTaskStep[];
  counterexamples: readonly BenchmarkCounterexample[];
}>;

export type TaskFlowBenchmarkProjection = Readonly<{
  schema: typeof TASK_FLOW_BENCHMARK_PROJECTION_SCHEMA;
  benchmarkSha256: string;
  sourceContractSha256: string;
  surface: BenchmarkSurface;
  domain: string;
  taskSteps: readonly Omit<BenchmarkTaskStep, 'evidenceSourceIds'>[];
  counterexamples: readonly Omit<
    BenchmarkCounterexample,
    'evidenceSourceIds'
  >[];
}>;

type ParseOptions = Readonly<{
  expectedSourceContractSha256?: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(code: string): never {
  throw new Error(code);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(code);
  }
}

function text(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function texts(value: unknown, code: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) fail(code);
  const parsed = value.map((entry) => text(entry, code));
  if (new Set(parsed).size !== parsed.length) fail(`${code}_DUPLICATE`);
  return parsed;
}

function uniqueIds(
  values: readonly Readonly<{ id: string }>[],
  code: string,
): void {
  if (new Set(values.map(({ id }) => id)).size !== values.length) fail(code);
}

function parseSource(value: unknown): BenchmarkSource {
  const input = record(value, 'TASK_FLOW_BENCHMARK_SOURCE_INVALID');
  exactKeys(
    input,
    TASK_FLOW_BENCHMARK_SOURCE_KEYS,
    'TASK_FLOW_BENCHMARK_SOURCE_KEYS',
  );
  const url = text(input.url, 'TASK_FLOW_BENCHMARK_SOURCE_URL');
  try {
    if (new URL(url).protocol !== 'https:') fail('TASK_FLOW_BENCHMARK_SOURCE_URL');
  } catch {
    fail('TASK_FLOW_BENCHMARK_SOURCE_URL');
  }
  const observedAt = text(
    input.observedAt,
    'TASK_FLOW_BENCHMARK_OBSERVED_AT',
  );
  if (!DATE.test(observedAt)) fail('TASK_FLOW_BENCHMARK_OBSERVED_AT');
  return {
    id: text(input.id, 'TASK_FLOW_BENCHMARK_SOURCE_ID'),
    url,
    observedAt,
    observedPatterns: texts(
      input.observedPatterns,
      'TASK_FLOW_BENCHMARK_OBSERVED_PATTERN',
    ),
    forbiddenTransfers: texts(
      input.forbiddenTransfers,
      'TASK_FLOW_BENCHMARK_TRANSFER_LIMIT',
    ),
  };
}

function parseTaskStep(value: unknown): BenchmarkTaskStep {
  const input = record(value, 'TASK_FLOW_BENCHMARK_TASK_INVALID');
  exactKeys(
    input,
    TASK_FLOW_BENCHMARK_TASK_KEYS,
    'TASK_FLOW_BENCHMARK_TASK_KEYS',
  );
  return {
    id: text(input.id, 'TASK_FLOW_BENCHMARK_TASK_ID'),
    intent: text(input.intent, 'TASK_FLOW_BENCHMARK_TASK_INTENT'),
    dependsOn: Array.isArray(input.dependsOn)
      ? input.dependsOn.map((entry) =>
          text(entry, 'TASK_FLOW_BENCHMARK_TASK_DEPENDENCY'),
        )
      : fail('TASK_FLOW_BENCHMARK_TASK_DEPENDENCY'),
    evidenceSourceIds: texts(
      input.evidenceSourceIds,
      'TASK_FLOW_BENCHMARK_EVIDENCE_REF',
    ),
  };
}

function parseCounterexample(value: unknown): BenchmarkCounterexample {
  const input = record(value, 'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_INVALID');
  exactKeys(
    input,
    TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_KEYS,
    'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_KEYS',
  );
  return {
    id: text(input.id, 'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_ID'),
    reason: text(input.reason, 'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_REASON'),
    evidenceSourceIds: texts(
      input.evidenceSourceIds,
      'TASK_FLOW_BENCHMARK_EVIDENCE_REF',
    ),
  };
}

export function parseTaskFlowBenchmark(
  value: unknown,
  options: ParseOptions = {},
): TaskFlowBenchmark {
  const input = record(value, 'TASK_FLOW_BENCHMARK_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_KEYS, 'TASK_FLOW_BENCHMARK_KEYS');
  if (input.schema !== TASK_FLOW_BENCHMARK_SCHEMA) {
    fail('TASK_FLOW_BENCHMARK_SCHEMA');
  }
  if (!TASK_FLOW_BENCHMARK_SURFACES.includes(input.surface as BenchmarkSurface)) {
    fail('TASK_FLOW_BENCHMARK_SURFACE');
  }
  const sourceContractSha256 = text(
    input.sourceContractSha256,
    'TASK_FLOW_BENCHMARK_SOURCE_SHA',
  );
  if (!SHA256.test(sourceContractSha256)) {
    fail('TASK_FLOW_BENCHMARK_SOURCE_SHA');
  }
  if (
    options.expectedSourceContractSha256 &&
    sourceContractSha256 !== options.expectedSourceContractSha256
  ) {
    fail('TASK_FLOW_BENCHMARK_SOURCE_STALE');
  }

  if (!Array.isArray(input.sources)) fail('TASK_FLOW_BENCHMARK_SOURCE_COVERAGE');
  const sources = input.sources.map(parseSource);
  if (sources.length < 2 || sources.length > 6) {
    fail('TASK_FLOW_BENCHMARK_SOURCE_COVERAGE');
  }
  uniqueIds(sources, 'TASK_FLOW_BENCHMARK_SOURCE_DUPLICATE');

  if (!Array.isArray(input.taskSteps) || input.taskSteps.length < 2) {
    fail('TASK_FLOW_BENCHMARK_TASK_COVERAGE');
  }
  const taskSteps = input.taskSteps.map(parseTaskStep);
  uniqueIds(taskSteps, 'TASK_FLOW_BENCHMARK_TASK_DUPLICATE');

  if (
    !Array.isArray(input.counterexamples) ||
    input.counterexamples.length < 2
  ) {
    fail('TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_COVERAGE');
  }
  const counterexamples = input.counterexamples.map(parseCounterexample);
  uniqueIds(
    counterexamples,
    'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_DUPLICATE',
  );

  const sourceIds = new Set(sources.map(({ id }) => id));
  const taskIds = new Set(taskSteps.map(({ id }) => id));
  for (const step of taskSteps) {
    if (
      step.evidenceSourceIds.some((id) => !sourceIds.has(id)) ||
      step.dependsOn.some((id) => !taskIds.has(id) || id === step.id)
    ) {
      fail('TASK_FLOW_BENCHMARK_EVIDENCE_REF');
    }
  }
  for (const counterexample of counterexamples) {
    if (counterexample.evidenceSourceIds.some((id) => !sourceIds.has(id))) {
      fail('TASK_FLOW_BENCHMARK_EVIDENCE_REF');
    }
  }

  return {
    schema: TASK_FLOW_BENCHMARK_SCHEMA,
    surface: input.surface as BenchmarkSurface,
    domain: text(input.domain, 'TASK_FLOW_BENCHMARK_DOMAIN'),
    sourceContractSha256,
    sources,
    taskSteps,
    counterexamples,
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
}

function sha256(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function taskFlowBenchmarkSha256(
  benchmark: TaskFlowBenchmark,
): string {
  return sha256(benchmark);
}

export function parseTaskFlowBenchmarkProjection(
  value: unknown,
  options: ParseOptions = {},
): TaskFlowBenchmarkProjection {
  const input = record(value, 'TASK_FLOW_BENCHMARK_PROJECTION_INVALID');
  exactKeys(
    input,
    TASK_FLOW_BENCHMARK_PROJECTION_KEYS,
    'TASK_FLOW_BENCHMARK_PROJECTION_KEYS',
  );
  if (input.schema !== TASK_FLOW_BENCHMARK_PROJECTION_SCHEMA) {
    fail('TASK_FLOW_BENCHMARK_PROJECTION_SCHEMA');
  }
  const benchmarkSha256 = text(
    input.benchmarkSha256,
    'TASK_FLOW_BENCHMARK_PROJECTION_SHA',
  );
  const sourceContractSha256 = text(
    input.sourceContractSha256,
    'TASK_FLOW_BENCHMARK_SOURCE_SHA',
  );
  if (!SHA256.test(benchmarkSha256) || !SHA256.test(sourceContractSha256)) {
    fail('TASK_FLOW_BENCHMARK_PROJECTION_SHA');
  }
  if (options.expectedSourceContractSha256
    && sourceContractSha256 !== options.expectedSourceContractSha256) {
    fail('TASK_FLOW_BENCHMARK_SOURCE_STALE');
  }
  if (!TASK_FLOW_BENCHMARK_SURFACES.includes(input.surface as BenchmarkSurface)) {
    fail('TASK_FLOW_BENCHMARK_SURFACE');
  }
  if (!Array.isArray(input.taskSteps) || input.taskSteps.length < 2) {
    fail('TASK_FLOW_BENCHMARK_TASK_COVERAGE');
  }
  const taskSteps = input.taskSteps.map((candidate) => {
    const step = record(candidate, 'TASK_FLOW_BENCHMARK_TASK_INVALID');
    exactKeys(
      step,
      TASK_FLOW_BENCHMARK_PROJECTION_TASK_KEYS,
      'TASK_FLOW_BENCHMARK_TASK_KEYS',
    );
    return Object.freeze({
      id: text(step.id, 'TASK_FLOW_BENCHMARK_TASK_ID'),
      intent: text(step.intent, 'TASK_FLOW_BENCHMARK_TASK_INTENT'),
      dependsOn: Array.isArray(step.dependsOn)
        ? step.dependsOn.map((dependency) =>
          text(dependency, 'TASK_FLOW_BENCHMARK_TASK_DEPENDENCY'))
        : fail('TASK_FLOW_BENCHMARK_TASK_DEPENDENCY'),
    });
  });
  uniqueIds(taskSteps, 'TASK_FLOW_BENCHMARK_TASK_DUPLICATE');
  const taskIds = new Set(taskSteps.map(({ id }) => id));
  for (const step of taskSteps) {
    if (step.dependsOn.some((id) => !taskIds.has(id) || id === step.id)) {
      fail('TASK_FLOW_BENCHMARK_EVIDENCE_REF');
    }
  }
  if (!Array.isArray(input.counterexamples) || input.counterexamples.length < 2) {
    fail('TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_COVERAGE');
  }
  const counterexamples = input.counterexamples.map((candidate) => {
    const counterexample = record(
      candidate,
      'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_INVALID',
    );
    exactKeys(
      counterexample,
      TASK_FLOW_BENCHMARK_PROJECTION_COUNTEREXAMPLE_KEYS,
      'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_KEYS',
    );
    return Object.freeze({
      id: text(counterexample.id, 'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_ID'),
      reason: text(counterexample.reason, 'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_REASON'),
    });
  });
  uniqueIds(counterexamples, 'TASK_FLOW_BENCHMARK_COUNTEREXAMPLE_DUPLICATE');
  return Object.freeze({
    schema: TASK_FLOW_BENCHMARK_PROJECTION_SCHEMA,
    benchmarkSha256,
    sourceContractSha256,
    surface: input.surface as BenchmarkSurface,
    domain: text(input.domain, 'TASK_FLOW_BENCHMARK_DOMAIN'),
    taskSteps: Object.freeze(taskSteps),
    counterexamples: Object.freeze(counterexamples),
  });
}

export function projectTaskFlowBenchmark(
  benchmark: TaskFlowBenchmark,
): TaskFlowBenchmarkProjection {
  return {
    schema: TASK_FLOW_BENCHMARK_PROJECTION_SCHEMA,
    benchmarkSha256: taskFlowBenchmarkSha256(benchmark),
    sourceContractSha256: benchmark.sourceContractSha256,
    surface: benchmark.surface,
    domain: benchmark.domain,
    taskSteps: benchmark.taskSteps.map(({ id, intent, dependsOn }) => ({
      id,
      intent,
      dependsOn,
    })),
    counterexamples: benchmark.counterexamples.map(({ id, reason }) => ({
      id,
      reason,
    })),
  };
}
