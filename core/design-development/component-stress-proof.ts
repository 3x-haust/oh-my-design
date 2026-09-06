import { createHash } from 'node:crypto';
import { decodePng } from '../motion/energy.ts';
import {
  booleanValue,
  digest,
  fields,
  integer,
  oneOf,
  receipt,
  receipts,
  safePath,
  sameReceipts,
  text,
  token,
  values,
  type ArtifactReceipt,
  type ProofFail,
} from './proof-primitives.ts';

export const COMPONENT_STRESS_PROOF_SCHEMA = 'component-stress-proof-v1' as const;
export type StressViewport = 'desktop' | 'mobile';
export type StressContext = 'isolated' | 'representative-page';
export type StressMetric = 'overflow' | 'clipping' | 'order' | 'visibility' | 'focus-reach' | 'target-size' | 'line-count';
export type ComponentStressProofErrorCode =
  | 'COMPONENT_STRESS_MALFORMED'
  | 'COMPONENT_STRESS_STALE_PLAN'
  | 'COMPONENT_STRESS_STALE_INPUT'
  | 'COMPONENT_STRESS_STALE_COMPONENT'
  | 'COMPONENT_STRESS_INAPPLICABLE_CASE'
  | 'COMPONENT_STRESS_INCOMPLETE_COVERAGE'
  | 'COMPONENT_STRESS_STALE_RENDER'
  | 'COMPONENT_STRESS_INVALID_RENDER'
  | 'COMPONENT_STRESS_RENDER_DIMENSIONS'
  | 'COMPONENT_STRESS_RENDER_REUSED'
  | 'COMPONENT_STRESS_MISSING_ASSERTION'
  | 'COMPONENT_STRESS_ASSERTION_FAILED';

export class ComponentStressProofError extends Error {
  override readonly name = 'ComponentStressProofError';
  readonly code: ComponentStressProofErrorCode;

  constructor(code: ComponentStressProofErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}

export type StressComponentIdentity = Readonly<{
  sourcePath: string;
  selector: string;
  contractSha256: string;
}>;
export type ApplicableStressCase = Readonly<{
  id: string;
  contentProfileId: string;
  stateId: string;
  viewport: Readonly<{ name: StressViewport; width: number; height: number }>;
  requiredAssertions: readonly StressMetric[];
}>;
export type ComponentStressProofCurrent = Readonly<{
  planSha256: string;
  inputs: readonly ArtifactReceipt[];
  component: StressComponentIdentity;
  applicableCases: readonly ApplicableStressCase[];
  readRender: (path: string) => Uint8Array;
}>;
export type StressAssertion = Readonly<{
  metric: StressMetric;
  expected: string;
  observed: string;
  pass: boolean;
}>;
export type ComponentStressCase = Readonly<{
  id: string;
  evidenceId: string;
  context: StressContext;
  contentProfileId: string;
  stateId: string;
  viewport: StressViewport;
  render: ArtifactReceipt<'png'>;
  assertions: readonly StressAssertion[];
}>;
export type ComponentStressProof = Readonly<{
  schema: typeof COMPONENT_STRESS_PROOF_SCHEMA;
  planSha256: string;
  inputs: readonly ArtifactReceipt[];
  component: StressComponentIdentity;
  cases: readonly ComponentStressCase[];
}>;

const VIEWPORTS: readonly StressViewport[] = ['desktop', 'mobile'];
const CONTEXTS: readonly StressContext[] = ['isolated', 'representative-page'];
const METRICS: readonly StressMetric[] = ['overflow', 'clipping', 'order', 'visibility', 'focus-reach', 'target-size', 'line-count'];
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function parseComponent(value: unknown, label: string, malformed: ProofFail): StressComponentIdentity {
  const item = fields(value, ['sourcePath', 'selector', 'contractSha256'], label, malformed);
  return Object.freeze({
    sourcePath: safePath(item.get('sourcePath'), `${label}.sourcePath`, malformed),
    selector: text(item.get('selector'), `${label}.selector`, malformed),
    contractSha256: digest(item.get('contractSha256'), `${label}.contractSha256`, malformed),
  });
}

function sameComponent(left: StressComponentIdentity, right: StressComponentIdentity): boolean {
  return left.sourcePath === right.sourcePath && left.selector === right.selector && left.contractSha256 === right.contractSha256;
}

function parseRequiredMetrics(value: unknown, label: string, malformed: ProofFail): readonly StressMetric[] {
  const parsed = values(value, label, malformed).map((metric, index) => oneOf(metric, METRICS, `${label}[${index}]`, malformed));
  if (parsed.length === 0 || new Set(parsed).size !== parsed.length) malformed(`${label} must be non-empty and duplicate-free`);
  return Object.freeze([...parsed].sort((left, right) => METRICS.indexOf(left) - METRICS.indexOf(right)));
}

function parseApplicable(value: unknown, malformed: ProofFail): readonly ApplicableStressCase[] {
  const parsed = values(value, 'current stress evidence.applicableCases', malformed).map((caseValue, index): ApplicableStressCase => {
    const label = `current stress evidence.applicableCases[${index}]`;
    const item = fields(caseValue, ['id', 'contentProfileId', 'stateId', 'viewport', 'requiredAssertions'], label, malformed);
    const viewportValue = fields(item.get('viewport'), ['name', 'width', 'height'], `${label}.viewport`, malformed);
    return Object.freeze({
      id: token(item.get('id'), `${label}.id`, malformed),
      contentProfileId: token(item.get('contentProfileId'), `${label}.contentProfileId`, malformed),
      stateId: token(item.get('stateId'), `${label}.stateId`, malformed),
      viewport: Object.freeze({
        name: oneOf(viewportValue.get('name'), VIEWPORTS, `${label}.viewport.name`, malformed),
        width: integer(viewportValue.get('width'), `${label}.viewport.width`, malformed, 1),
        height: integer(viewportValue.get('height'), `${label}.viewport.height`, malformed, 1),
      }),
      requiredAssertions: parseRequiredMetrics(item.get('requiredAssertions'), `${label}.requiredAssertions`, malformed),
    });
  });
  if (parsed.length === 0 || new Set(parsed.map(({ id }) => id)).size !== parsed.length) malformed('applicable stress evidence must be non-empty and uniquely identified');
  return Object.freeze([...parsed].sort((left, right) => left.id.localeCompare(right.id)));
}

function parseAssertion(value: unknown, label: string, malformed: ProofFail): StressAssertion {
  const item = fields(value, ['metric', 'expected', 'observed', 'pass'], label, malformed);
  return Object.freeze({
    metric: oneOf(item.get('metric'), METRICS, `${label}.metric`, malformed),
    expected: text(item.get('expected'), `${label}.expected`, malformed),
    observed: text(item.get('observed'), `${label}.observed`, malformed),
    pass: booleanValue(item.get('pass'), `${label}.pass`, malformed),
  });
}

function parse(value: unknown, currentValue: ComponentStressProofCurrent): ComponentStressProof {
  const malformed: ProofFail = (message) => { throw new ComponentStressProofError('COMPONENT_STRESS_MALFORMED', message); };
  const current = fields(currentValue, ['planSha256', 'inputs', 'component', 'applicableCases', 'readRender'], 'current stress evidence', malformed);
  const expectedPlan = digest(current.get('planSha256'), 'current stress evidence.planSha256', malformed);
  const expectedInputs = receipts(current.get('inputs'), 'current stress evidence.inputs', malformed);
  const expectedComponent = parseComponent(current.get('component'), 'current stress evidence.component', malformed);
  const applicableCases = parseApplicable(current.get('applicableCases'), malformed);
  const readRenderValue = current.get('readRender');
  if (typeof readRenderValue !== 'function') malformed('current stress evidence.readRender must be a function');
  const readRender = readRenderValue as (path: string) => Uint8Array;

  const item = fields(value, ['schema', 'planSha256', 'inputs', 'component', 'cases'], 'component stress proof', malformed);
  if (item.get('schema') !== COMPONENT_STRESS_PROOF_SCHEMA) malformed('component stress proof schema is invalid');
  const planSha256 = digest(item.get('planSha256'), 'component stress proof.planSha256', malformed);
  if (planSha256 !== expectedPlan) throw new ComponentStressProofError('COMPONENT_STRESS_STALE_PLAN');
  const inputs = receipts(item.get('inputs'), 'component stress proof.inputs', malformed);
  if (!sameReceipts(inputs, expectedInputs)) throw new ComponentStressProofError('COMPONENT_STRESS_STALE_INPUT');
  const component = parseComponent(item.get('component'), 'component stress proof.component', malformed);
  if (!sameComponent(component, expectedComponent)) throw new ComponentStressProofError('COMPONENT_STRESS_STALE_COMPONENT');

  const evidenceById = new Map(applicableCases.map((entry) => [entry.id, entry]));
  const cases = values(item.get('cases'), 'component stress proof.cases', malformed).map((caseValue, index): ComponentStressCase => {
    const label = `component stress proof.cases[${index}]`;
    const stressCase = fields(caseValue, ['id', 'evidenceId', 'context', 'contentProfileId', 'stateId', 'viewport', 'render', 'assertions'], label, malformed);
    const id = token(stressCase.get('id'), `${label}.id`, malformed);
    const evidenceId = token(stressCase.get('evidenceId'), `${label}.evidenceId`, malformed);
    const context = oneOf(stressCase.get('context'), CONTEXTS, `${label}.context`, malformed);
    const contentProfileId = token(stressCase.get('contentProfileId'), `${label}.contentProfileId`, malformed);
    const stateId = token(stressCase.get('stateId'), `${label}.stateId`, malformed);
    const viewport = oneOf(stressCase.get('viewport'), VIEWPORTS, `${label}.viewport`, malformed);
    const evidence = evidenceById.get(evidenceId);
    if (evidence === undefined || evidence.contentProfileId !== contentProfileId || evidence.stateId !== stateId || evidence.viewport.name !== viewport) {
      throw new ComponentStressProofError('COMPONENT_STRESS_INAPPLICABLE_CASE');
    }
    const parsedRender = receipt(stressCase.get('render'), `${label}.render`, malformed);
    if (parsedRender.schema !== 'png') malformed(`${label}.render.schema must be png`);
    const render: ArtifactReceipt<'png'> = Object.freeze({ path: parsedRender.path, schema: 'png', sha256: parsedRender.sha256 });
    const assertions = values(stressCase.get('assertions'), `${label}.assertions`, malformed)
      .map((assertion, assertionIndex) => parseAssertion(assertion, `${label}.assertions[${assertionIndex}]`, malformed));
    if (assertions.length === 0 || new Set(assertions.map(({ metric }) => metric)).size !== assertions.length) malformed(`${label}.assertions must be non-empty and duplicate-free`);
    const assertedMetrics = new Set(assertions.map(({ metric }) => metric));
    if (evidence.requiredAssertions.some((metric) => !assertedMetrics.has(metric))) {
      throw new ComponentStressProofError('COMPONENT_STRESS_MISSING_ASSERTION');
    }
    if (assertions.some((assertion) => !assertion.pass)) throw new ComponentStressProofError('COMPONENT_STRESS_ASSERTION_FAILED');

    return Object.freeze({
      id,
      evidenceId,
      context,
      contentProfileId,
      stateId,
      viewport,
      render,
      assertions: Object.freeze([...assertions].sort((left, right) => METRICS.indexOf(left.metric) - METRICS.indexOf(right.metric))),
    });
  });
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) malformed('component stress case IDs must be unique');
  if (new Set(cases.map(({ render }) => render.path)).size !== cases.length) throw new ComponentStressProofError('COMPONENT_STRESS_RENDER_REUSED');

  const observedCoverage = new Set(cases.map(({ evidenceId, context }) => `${evidenceId}\u0000${context}`));
  const requiredCoverage = applicableCases.flatMap(({ id }) => CONTEXTS.map((context) => `${id}\u0000${context}`));
  if (cases.length !== requiredCoverage.length || observedCoverage.size !== requiredCoverage.length
    || requiredCoverage.some((key) => !observedCoverage.has(key))) {
    throw new ComponentStressProofError('COMPONENT_STRESS_INCOMPLETE_COVERAGE');
  }

  for (const stressCase of cases) {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(readRender(stressCase.render.path));
    } catch {
      throw new ComponentStressProofError('COMPONENT_STRESS_STALE_RENDER');
    }
    if (hash(bytes) !== stressCase.render.sha256) throw new ComponentStressProofError('COMPONENT_STRESS_STALE_RENDER');
    let decoded: ReturnType<typeof decodePng>;
    try {
      decoded = decodePng(bytes);
    } catch {
      throw new ComponentStressProofError('COMPONENT_STRESS_INVALID_RENDER');
    }
    const evidence = evidenceById.get(stressCase.evidenceId);
    if (evidence === undefined) throw new ComponentStressProofError('COMPONENT_STRESS_INAPPLICABLE_CASE');
    if (decoded.width !== evidence.viewport.width || decoded.height !== evidence.viewport.height) {
      throw new ComponentStressProofError('COMPONENT_STRESS_RENDER_DIMENSIONS');
    }
  }

  return Object.freeze({
    schema: COMPONENT_STRESS_PROOF_SCHEMA,
    planSha256,
    inputs,
    component,
    cases: Object.freeze([...cases].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)
      || CONTEXTS.indexOf(left.context) - CONTEXTS.indexOf(right.context) || left.id.localeCompare(right.id))),
  });
}

/** Parses a stress proof against current applicable evidence and verifies every referenced PNG render. */
export function parseComponentStressProof(value: unknown, current: ComponentStressProofCurrent): ComponentStressProof {
  try {
    return parse(value, current);
  } catch (error) {
    if (error instanceof ComponentStressProofError) throw error;
    throw new ComponentStressProofError('COMPONENT_STRESS_MALFORMED');
  }
}
