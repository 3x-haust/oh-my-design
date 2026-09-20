import { createHash } from 'node:crypto';
import { isAbsolute, resolve, sep } from 'node:path';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';

export const TASK_FLOW_BENCHMARK_SCHEMA =
  'task-flow-benchmark-v2' as const;
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
  'kind',
  'observedAt',
  'coverage',
  'screens',
  'features',
  'flows',
  'observedPatterns',
  'forbiddenTransfers',
] as const;
export const TASK_FLOW_BENCHMARK_COVERAGE_KEYS = [
  'scope',
  'status',
  'discoveredTargetCount',
  'entryScreenIds',
  'inspectedScreenIds',
  'excludedTargets',
] as const;
export const TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_KEYS = [
  'id',
  'url',
  'category',
  'reason',
] as const;
export const TASK_FLOW_BENCHMARK_SCREEN_KEYS = [
  'id',
  'name',
  'url',
  'state',
  'reachedBy',
  'evidence',
] as const;
export const TASK_FLOW_BENCHMARK_REACHED_BY_KEYS = [
  'fromScreenId',
  'action',
  'result',
] as const;
export const TASK_FLOW_BENCHMARK_EVIDENCE_KEYS = ['path', 'sha256'] as const;
export const TASK_FLOW_BENCHMARK_FEATURE_KEYS = [
  'id',
  'name',
  'behavior',
  'screenIds',
] as const;
export const TASK_FLOW_BENCHMARK_FLOW_KEYS = [
  'id',
  'intent',
  'status',
  'limitation',
  'steps',
] as const;
export const TASK_FLOW_BENCHMARK_FLOW_STEP_KEYS = [
  'order',
  'screenId',
  'action',
  'result',
  'evidence',
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

const SOURCE_KINDS = [
  'same-domain-service',
  'adjacent-domain-service',
  'authoritative-guidance',
] as const;
type BenchmarkSourceKind = typeof SOURCE_KINDS[number];
const COVERAGE_STATUSES = ['complete', 'bounded-gap'] as const;
type CoverageStatus = typeof COVERAGE_STATUSES[number];
const EXCLUSION_CATEGORIES = [
  'authentication',
  'payment',
  'destructive-action',
  'rate-limit',
  'blocked',
  'out-of-scope',
  'unavailable',
] as const;
type ExclusionCategory = typeof EXCLUSION_CATEGORIES[number];

type BenchmarkEvidence = Readonly<{ path: string; sha256: string }>;
type BenchmarkReachedBy = Readonly<{
  fromScreenId: string | null;
  action: string;
  result: string;
}>;
type BenchmarkScreen = Readonly<{
  id: string;
  name: string;
  url: string;
  state: string;
  reachedBy: BenchmarkReachedBy;
  evidence: BenchmarkEvidence;
}>;
type BenchmarkFeature = Readonly<{
  id: string;
  name: string;
  behavior: string;
  screenIds: readonly string[];
}>;
type BenchmarkFlowStep = Readonly<{
  order: number;
  screenId: string;
  action: string;
  result: string;
  evidence: BenchmarkEvidence;
}>;
type BenchmarkFlow = Readonly<{
  id: string;
  intent: string;
  status: 'completed' | 'blocked';
  limitation: string | null;
  steps: readonly BenchmarkFlowStep[];
}>;
type BenchmarkExcludedTarget = Readonly<{
  id: string;
  url: string;
  category: ExclusionCategory;
  reason: string;
}>;
type BenchmarkCoverage = Readonly<{
  scope: string;
  status: CoverageStatus;
  discoveredTargetCount: number;
  entryScreenIds: readonly string[];
  inspectedScreenIds: readonly string[];
  excludedTargets: readonly BenchmarkExcludedTarget[];
}>;

export type BenchmarkSource = Readonly<{
  id: string;
  url: string;
  kind: BenchmarkSourceKind;
  observedAt: string;
  coverage: BenchmarkCoverage;
  screens: readonly BenchmarkScreen[];
  features: readonly BenchmarkFeature[];
  flows: readonly BenchmarkFlow[];
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

function integer(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code);
  return value as number;
}

function nullableText(value: unknown, code: string): string | null {
  return value === null ? null : text(value, code);
}

function httpsUrl(value: unknown, code: string): string {
  const parsed = text(value, code);
  try {
    if (new URL(parsed).protocol !== 'https:') fail(code);
  } catch {
    fail(code);
  }
  return parsed;
}

function parseEvidence(value: unknown): BenchmarkEvidence {
  const input = record(value, 'TASK_FLOW_BENCHMARK_EVIDENCE_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_EVIDENCE_KEYS, 'TASK_FLOW_BENCHMARK_EVIDENCE_KEYS');
  const path = text(input.path, 'TASK_FLOW_BENCHMARK_EVIDENCE_PATH');
  if (isAbsolute(path)
    || path.includes('\\')
    || path.split('/').includes('..')
    || !path.startsWith('.omd/refs/')) {
    fail('TASK_FLOW_BENCHMARK_EVIDENCE_PATH');
  }
  const digest = text(input.sha256, 'TASK_FLOW_BENCHMARK_EVIDENCE_SHA');
  if (!SHA256.test(digest)) fail('TASK_FLOW_BENCHMARK_EVIDENCE_SHA');
  return { path, sha256: digest };
}

function parseReachedBy(value: unknown): BenchmarkReachedBy {
  const input = record(value, 'TASK_FLOW_BENCHMARK_REACHED_BY_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_REACHED_BY_KEYS, 'TASK_FLOW_BENCHMARK_REACHED_BY_KEYS');
  return {
    fromScreenId: nullableText(input.fromScreenId, 'TASK_FLOW_BENCHMARK_REACHED_BY_SOURCE'),
    action: text(input.action, 'TASK_FLOW_BENCHMARK_REACHED_BY_ACTION'),
    result: text(input.result, 'TASK_FLOW_BENCHMARK_REACHED_BY_RESULT'),
  };
}

function parseScreen(value: unknown): BenchmarkScreen {
  const input = record(value, 'TASK_FLOW_BENCHMARK_SCREEN_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_SCREEN_KEYS, 'TASK_FLOW_BENCHMARK_SCREEN_KEYS');
  return {
    id: text(input.id, 'TASK_FLOW_BENCHMARK_SCREEN_ID'),
    name: text(input.name, 'TASK_FLOW_BENCHMARK_SCREEN_NAME'),
    url: httpsUrl(input.url, 'TASK_FLOW_BENCHMARK_SCREEN_URL'),
    state: text(input.state, 'TASK_FLOW_BENCHMARK_SCREEN_STATE'),
    reachedBy: parseReachedBy(input.reachedBy),
    evidence: parseEvidence(input.evidence),
  };
}

function parseFeature(value: unknown): BenchmarkFeature {
  const input = record(value, 'TASK_FLOW_BENCHMARK_FEATURE_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_FEATURE_KEYS, 'TASK_FLOW_BENCHMARK_FEATURE_KEYS');
  return {
    id: text(input.id, 'TASK_FLOW_BENCHMARK_FEATURE_ID'),
    name: text(input.name, 'TASK_FLOW_BENCHMARK_FEATURE_NAME'),
    behavior: text(input.behavior, 'TASK_FLOW_BENCHMARK_FEATURE_BEHAVIOR'),
    screenIds: texts(input.screenIds, 'TASK_FLOW_BENCHMARK_FEATURE_SCREEN'),
  };
}

function parseFlowStep(value: unknown): BenchmarkFlowStep {
  const input = record(value, 'TASK_FLOW_BENCHMARK_FLOW_STEP_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_FLOW_STEP_KEYS, 'TASK_FLOW_BENCHMARK_FLOW_STEP_KEYS');
  const order = integer(input.order, 'TASK_FLOW_BENCHMARK_FLOW_STEP_ORDER');
  if (order < 1) fail('TASK_FLOW_BENCHMARK_FLOW_STEP_ORDER');
  return {
    order,
    screenId: text(input.screenId, 'TASK_FLOW_BENCHMARK_FLOW_STEP_SCREEN'),
    action: text(input.action, 'TASK_FLOW_BENCHMARK_FLOW_STEP_ACTION'),
    result: text(input.result, 'TASK_FLOW_BENCHMARK_FLOW_STEP_RESULT'),
    evidence: parseEvidence(input.evidence),
  };
}

function parseFlow(value: unknown): BenchmarkFlow {
  const input = record(value, 'TASK_FLOW_BENCHMARK_FLOW_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_FLOW_KEYS, 'TASK_FLOW_BENCHMARK_FLOW_KEYS');
  const status = text(input.status, 'TASK_FLOW_BENCHMARK_FLOW_STATUS');
  if (status !== 'completed' && status !== 'blocked') fail('TASK_FLOW_BENCHMARK_FLOW_STATUS');
  if (!Array.isArray(input.steps) || input.steps.length === 0) fail('TASK_FLOW_BENCHMARK_FLOW_COVERAGE');
  const steps = input.steps.map(parseFlowStep);
  if (steps.some((step, index) => step.order !== index + 1)) fail('TASK_FLOW_BENCHMARK_FLOW_STEP_ORDER');
  const evidence = steps.map((step) => `${step.evidence.path}:${step.evidence.sha256}`);
  if (new Set(evidence).size !== evidence.length) fail('TASK_FLOW_BENCHMARK_FLOW_EVIDENCE_REUSED');
  const limitation = nullableText(input.limitation, 'TASK_FLOW_BENCHMARK_FLOW_LIMITATION');
  if ((status === 'blocked') !== (limitation !== null)) fail('TASK_FLOW_BENCHMARK_FLOW_LIMITATION');
  return {
    id: text(input.id, 'TASK_FLOW_BENCHMARK_FLOW_ID'),
    intent: text(input.intent, 'TASK_FLOW_BENCHMARK_FLOW_INTENT'),
    status,
    limitation,
    steps,
  };
}

function parseExcludedTarget(value: unknown): BenchmarkExcludedTarget {
  const input = record(value, 'TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_KEYS, 'TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_KEYS');
  const category = text(input.category, 'TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_CATEGORY');
  if (!EXCLUSION_CATEGORIES.includes(category as ExclusionCategory)) {
    fail('TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_CATEGORY');
  }
  return {
    id: text(input.id, 'TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_ID'),
    url: httpsUrl(input.url, 'TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_URL'),
    category: category as ExclusionCategory,
    reason: text(input.reason, 'TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_REASON'),
  };
}

function parseCoverage(value: unknown): BenchmarkCoverage {
  const input = record(value, 'TASK_FLOW_BENCHMARK_COVERAGE_INVALID');
  exactKeys(input, TASK_FLOW_BENCHMARK_COVERAGE_KEYS, 'TASK_FLOW_BENCHMARK_COVERAGE_KEYS');
  const status = text(input.status, 'TASK_FLOW_BENCHMARK_COVERAGE_STATUS');
  if (!COVERAGE_STATUSES.includes(status as CoverageStatus)) fail('TASK_FLOW_BENCHMARK_COVERAGE_STATUS');
  const excludedTargets = Array.isArray(input.excludedTargets)
    ? input.excludedTargets.map(parseExcludedTarget)
    : fail('TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_COVERAGE');
  uniqueIds(excludedTargets, 'TASK_FLOW_BENCHMARK_EXCLUDED_TARGET_DUPLICATE');
  if ((status === 'bounded-gap') !== (excludedTargets.length > 0)) {
    fail('TASK_FLOW_BENCHMARK_COVERAGE_STATUS');
  }
  return {
    scope: text(input.scope, 'TASK_FLOW_BENCHMARK_COVERAGE_SCOPE'),
    status: status as CoverageStatus,
    discoveredTargetCount: integer(input.discoveredTargetCount, 'TASK_FLOW_BENCHMARK_DISCOVERED_TARGET_COUNT'),
    entryScreenIds: texts(input.entryScreenIds, 'TASK_FLOW_BENCHMARK_ENTRY_SCREEN'),
    inspectedScreenIds: texts(input.inspectedScreenIds, 'TASK_FLOW_BENCHMARK_INSPECTED_SCREEN'),
    excludedTargets,
  };
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
  const url = httpsUrl(input.url, 'TASK_FLOW_BENCHMARK_SOURCE_URL');
  const kind = text(input.kind, 'TASK_FLOW_BENCHMARK_SOURCE_KIND');
  if (!SOURCE_KINDS.includes(kind as BenchmarkSourceKind)) fail('TASK_FLOW_BENCHMARK_SOURCE_KIND');
  const observedAt = text(
    input.observedAt,
    'TASK_FLOW_BENCHMARK_OBSERVED_AT',
  );
  if (!DATE.test(observedAt)) fail('TASK_FLOW_BENCHMARK_OBSERVED_AT');
  if (!Array.isArray(input.screens) || input.screens.length === 0) {
    fail('TASK_FLOW_BENCHMARK_SCREEN_COVERAGE');
  }
  const screens = input.screens.map(parseScreen);
  uniqueIds(screens, 'TASK_FLOW_BENCHMARK_SCREEN_DUPLICATE');
  if (!Array.isArray(input.features) || input.features.length === 0) {
    fail('TASK_FLOW_BENCHMARK_FEATURE_COVERAGE');
  }
  const features = input.features.map(parseFeature);
  uniqueIds(features, 'TASK_FLOW_BENCHMARK_FEATURE_DUPLICATE');
  if (!Array.isArray(input.flows) || input.flows.length === 0) {
    fail('TASK_FLOW_BENCHMARK_FLOW_COVERAGE');
  }
  const flows = input.flows.map(parseFlow);
  uniqueIds(flows, 'TASK_FLOW_BENCHMARK_FLOW_DUPLICATE');
  const coverage = parseCoverage(input.coverage);

  const screenIds = new Set(screens.map((screen) => screen.id));
  const inspectedIds = new Set(coverage.inspectedScreenIds);
  if (inspectedIds.size !== screenIds.size
    || [...screenIds].some((id) => !inspectedIds.has(id))) {
    fail('TASK_FLOW_BENCHMARK_INSPECTED_SCREEN_COVERAGE');
  }
  if (coverage.discoveredTargetCount !== screens.length + coverage.excludedTargets.length) {
    fail('TASK_FLOW_BENCHMARK_DISCOVERED_TARGET_COUNT');
  }
  if (coverage.entryScreenIds.some((id) => !screenIds.has(id))) {
    fail('TASK_FLOW_BENCHMARK_ENTRY_SCREEN');
  }
  const entryIds = new Set(coverage.entryScreenIds);
  for (const screen of screens) {
    const parent = screen.reachedBy.fromScreenId;
    if (entryIds.has(screen.id) !== (parent === null)) {
      fail('TASK_FLOW_BENCHMARK_REACHED_BY_SOURCE');
    }
    if (parent !== null && (!screenIds.has(parent) || parent === screen.id)) {
      fail('TASK_FLOW_BENCHMARK_REACHED_BY_SOURCE');
    }
  }
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  for (const screen of screens) {
    const seen = new Set<string>();
    let current: BenchmarkScreen | undefined = screen;
    while (current !== undefined && !entryIds.has(current.id)) {
      if (seen.has(current.id)) fail('TASK_FLOW_BENCHMARK_SCREEN_REACHABILITY');
      seen.add(current.id);
      const parent: string | null = current.reachedBy.fromScreenId;
      current = parent === null ? undefined : byId.get(parent);
    }
    if (current === undefined) fail('TASK_FLOW_BENCHMARK_SCREEN_REACHABILITY');
  }

  const coveredScreens = new Set<string>();
  for (const feature of features) {
    if (feature.screenIds.some((id) => !screenIds.has(id))) fail('TASK_FLOW_BENCHMARK_FEATURE_SCREEN');
    feature.screenIds.forEach((id) => coveredScreens.add(id));
  }
  for (const flow of flows) {
    if (flow.steps.some((step) => !screenIds.has(step.screenId))) {
      fail('TASK_FLOW_BENCHMARK_FLOW_STEP_SCREEN');
    }
    flow.steps.forEach((step) => coveredScreens.add(step.screenId));
  }
  if ([...screenIds].some((id) => !coveredScreens.has(id))) {
    fail('TASK_FLOW_BENCHMARK_SCREEN_USE_COVERAGE');
  }
  if (kind !== 'authoritative-guidance' && !flows.some((flow) => flow.status === 'completed')) {
    fail('TASK_FLOW_BENCHMARK_FLOW_COMPLETION');
  }
  return {
    id: text(input.id, 'TASK_FLOW_BENCHMARK_SOURCE_ID'),
    url,
    kind: kind as BenchmarkSourceKind,
    observedAt,
    coverage,
    screens,
    features,
    flows,
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
  const sameDomain = sources.filter((source) => source.kind === 'same-domain-service').length;
  const adjacent = sources.filter((source) => source.kind === 'adjacent-domain-service').length;
  if (sameDomain < 2 || sameDomain <= adjacent) {
    fail('TASK_FLOW_BENCHMARK_SAME_DOMAIN_COVERAGE');
  }

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

function evidenceRecords(benchmark: TaskFlowBenchmark): readonly BenchmarkEvidence[] {
  return benchmark.sources.flatMap((source) => [
    ...source.screens.map((screen) => screen.evidence),
    ...source.flows.flatMap((flow) => flow.steps.map((step) => step.evidence)),
  ]);
}

/**
 * Proves artifact currentness, NOT that the prose action actually occurred. In particular, a PNG
 * hash or a sequence of independent navigations cannot authenticate a live multi-screen flow.
 * The private evidence remains under `.omd/refs/`; the source-free projection carries none of it.
 */
export function validateTaskFlowBenchmarkEvidence(
  root: string,
  benchmark: TaskFlowBenchmark,
) {
  const projectRoot = resolve(root);
  const observations: { path: string; sha256: string; grade: 'artifact-only'; actionVerified: false }[] = [];
  for (const evidence of evidenceRecords(benchmark)) {
    const path = resolve(projectRoot, evidence.path);
    if (path === projectRoot || !path.startsWith(`${projectRoot}${sep}`)) {
      fail('TASK_FLOW_BENCHMARK_EVIDENCE_PATH');
    }
    let bytes: Buffer;
    try {
      bytes = readStableProjectFile({ root: projectRoot, path, label: evidence.path, fs: nodeStableProjectFileSystem() });
    } catch {
      fail('TASK_FLOW_BENCHMARK_EVIDENCE_MISSING');
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== evidence.sha256) fail('TASK_FLOW_BENCHMARK_EVIDENCE_STALE');
    observations.push({ ...evidence, grade: 'artifact-only', actionVerified: false });
  }
  return { schema: 'task-flow-evidence-strength-v1' as const, benchmarkSha256: taskFlowBenchmarkSha256(benchmark),
    observations, liveFlowVerified: false as const,
    limitation: 'Current files and author-declared action/result sequences are not executed browser-transition receipts. Do not claim that every control or flow was tested.' };
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
