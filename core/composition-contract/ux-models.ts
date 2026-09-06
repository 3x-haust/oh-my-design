import { createHash } from 'node:crypto';

export const UX_MODEL_SET_SCHEMA = 'ux-model-set-v1' as const;

const MODEL_KEYS = new Set([
  'id',
  'macroLayoutFamily',
  'flowTopology',
  'dominantWorkObject',
  'taskIds',
  'benchmarkPatternIds',
  'decisionSupportSequence',
  'domainBindings',
  'observableConsequences',
  'costliestErrorRecovery',
  'mobileRecomposition',
  'rejectionCondition',
]);
const SHA256 = /^[a-f0-9]{64}$/;

type UxModelInput = Readonly<{
  id: string;
  macroLayoutFamily: string;
  flowTopology: string;
  dominantWorkObject: string;
  taskIds: readonly string[];
  benchmarkPatternIds: readonly string[];
  decisionSupportSequence: readonly string[];
  domainBindings: readonly string[];
  observableConsequences: readonly string[];
  costliestErrorRecovery: string;
  mobileRecomposition: string;
  rejectionCondition: string;
}>;

export type UxModel = UxModelInput &
  Readonly<{
    topologySha256: string;
  }>;

export type UxModelSet = Readonly<{
  schema: typeof UX_MODEL_SET_SCHEMA;
  benchmarkProjectionSha256: string;
  models: readonly UxModel[];
}>;

type ParseOptions = Readonly<{
  expectedBenchmarkProjectionSha256?: string;
  frameTaskIds?: readonly string[];
}>;

function fail(code: string): never {
  throw new Error(code);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function text(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function texts(value: unknown, code: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) fail(code);
  const result = value.map((entry) => text(entry, code));
  if (new Set(result).size !== result.length) fail(`${code}_DUPLICATE`);
  return result;
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

function parseModel(value: unknown): UxModel {
  const input = record(value, 'UX_MODEL_INVALID');
  for (const key of Object.keys(input)) {
    if (!MODEL_KEYS.has(key)) fail('UX_MODEL_FIELD_UNKNOWN');
  }
  for (const key of MODEL_KEYS) {
    if (!(key in input)) fail('UX_MODEL_FIELD_MISSING');
  }
  const model: UxModelInput = {
    id: text(input.id, 'UX_MODEL_ID'),
    macroLayoutFamily: text(
      input.macroLayoutFamily,
      'UX_MODEL_MACRO_FAMILY',
    ),
    flowTopology: text(input.flowTopology, 'UX_MODEL_FLOW_TOPOLOGY'),
    dominantWorkObject: text(
      input.dominantWorkObject,
      'UX_MODEL_WORK_OBJECT',
    ),
    taskIds: texts(input.taskIds, 'UX_MODEL_TASK'),
    benchmarkPatternIds: texts(
      input.benchmarkPatternIds,
      'UX_MODEL_BENCHMARK_PATTERN',
    ),
    decisionSupportSequence: texts(
      input.decisionSupportSequence,
      'UX_MODEL_DECISION_SUPPORT',
    ),
    domainBindings: texts(input.domainBindings, 'UX_MODEL_DOMAIN_BINDING'),
    observableConsequences: texts(
      input.observableConsequences,
      'UX_MODEL_CONSEQUENCE',
    ),
    costliestErrorRecovery: text(
      input.costliestErrorRecovery,
      'UX_MODEL_COSTLY_ERROR',
    ),
    mobileRecomposition: text(
      input.mobileRecomposition,
      'UX_MODEL_MOBILE',
    ),
    rejectionCondition: text(
      input.rejectionCondition,
      'UX_MODEL_REJECTION',
    ),
  };
  return {
    ...model,
    topologySha256: sha256({
      macroLayoutFamily: model.macroLayoutFamily,
      flowTopology: model.flowTopology,
      dominantWorkObject: model.dominantWorkObject,
      taskIds: model.taskIds,
      decisionSupportSequence: model.decisionSupportSequence,
      costliestErrorRecovery: model.costliestErrorRecovery,
      mobileRecomposition: model.mobileRecomposition,
    }),
  };
}

function assertDistinct(models: readonly UxModel[]): void {
  for (let left = 0; left < models.length; left += 1) {
    for (let right = left + 1; right < models.length; right += 1) {
      const a = models[left]!;
      const b = models[right]!;
      if (
        a.macroLayoutFamily === b.macroLayoutFamily &&
        a.flowTopology === b.flowTopology &&
        a.dominantWorkObject === b.dominantWorkObject
      ) {
        fail('UX_MODEL_STRUCTURAL_DUPLICATE');
      }
    }
  }
}

export function parseUxModelSet(
  value: unknown,
  options: ParseOptions = {},
): UxModelSet {
  const input = record(value, 'UX_MODEL_SET_INVALID');
  if (input.schema !== UX_MODEL_SET_SCHEMA) fail('UX_MODEL_SET_SCHEMA');
  const benchmarkProjectionSha256 = text(
    input.benchmarkProjectionSha256,
    'UX_MODEL_BENCHMARK_SHA',
  );
  if (!SHA256.test(benchmarkProjectionSha256)) {
    fail('UX_MODEL_BENCHMARK_SHA');
  }
  if (
    options.expectedBenchmarkProjectionSha256 &&
    benchmarkProjectionSha256 !==
      options.expectedBenchmarkProjectionSha256
  ) {
    fail('UX_MODEL_BENCHMARK_STALE');
  }
  if (!Array.isArray(input.models)) fail('UX_MODEL_COVERAGE');
  const models = input.models.map(parseModel);
  if (models.length < 2 || models.length > 3) fail('UX_MODEL_COVERAGE');
  if (new Set(models.map(({ id }) => id)).size !== models.length) {
    fail('UX_MODEL_ID_DUPLICATE');
  }
  assertDistinct(models);

  if (options.frameTaskIds) {
    const expected = new Set(options.frameTaskIds);
    const covered = new Set(models.flatMap(({ taskIds }) => taskIds));
    if (
      [...covered].some((id) => !expected.has(id)) ||
      [...expected].some((id) => !covered.has(id))
    ) {
      fail('UX_MODEL_TASK_COVERAGE');
    }
  }

  return {
    schema: UX_MODEL_SET_SCHEMA,
    benchmarkProjectionSha256,
    models,
  };
}

export function uxModelSetSha256(value: UxModelSet): string {
  return sha256(value);
}

