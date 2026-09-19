import {
  UX_POLICY_SCHEMA,
  parseUxPolicy,
  type RecommendedMethodDecision,
} from '../ux/policy.ts';

export const DESIGN_AXIS_INPUT_SCHEMA = 'design-axis-input-v1';
export const DESIGN_AXIS_ROUTING_SCHEMA = 'design-axis-routing-v1';

export type TaskSize = 'small' | 'medium' | 'large';
export type FailureRisk = 'low' | 'moderate' | 'high';
export type UxNeed = 'baseline' | 'focused' | 'rigorous';
export type ExpressiveDesignNeed = 'restrained' | 'balanced' | 'showpiece';

export type DesignAxisInput = Readonly<{
  schema: typeof DESIGN_AXIS_INPUT_SCHEMA;
  taskSize: TaskSize;
  failureRisk: FailureRisk;
  uxNeed: UxNeed;
  expressiveDesignNeed: ExpressiveDesignNeed;
}>;

export type DesignAxisRoutingErrorCode =
  | 'MALFORMED_DESIGN_AXIS_INPUT'
  | 'UNEXPECTED_DESIGN_AXIS_FIELD'
  | 'INVALID_TASK_SIZE'
  | 'INVALID_FAILURE_RISK'
  | 'INVALID_UX_NEED'
  | 'INVALID_EXPRESSIVE_DESIGN_NEED'
  | 'CONTRADICTORY_DESIGN_AXIS_STATE';

export class DesignAxisRoutingError extends Error {
  override readonly name = 'DesignAxisRoutingError';
  readonly code: DesignAxisRoutingErrorCode;

  constructor(code: DesignAxisRoutingErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.code = code;
  }
}

export type DesignStrategyMethod =
  | 'balanced-delivery'
  | 'operational-ux'
  | 'safety-recovery'
  | 'expressive-campaign';

export type TaskExecutionStrategy = 'focused' | 'coordinated' | 'system-scale';
export type FailureHandlingStrategy =
  | 'standard-review'
  | 'error-prevention-and-recovery'
  | 'safety-critical-recovery-validation';
export type UxRigorStrategy =
  | 'accessible-baseline'
  | 'task-flow-validation'
  | 'rigorous-task-accessibility-validation';
export type ExpressiveDirectionStrategy =
  | 'restrained-system'
  | 'purpose-fit-craft'
  | 'showpiece-with-accessible-motion';

export type DesignAxisRouting = Readonly<{
  schema: typeof DESIGN_AXIS_ROUTING_SCHEMA;
  axes: Readonly<{
    taskSize: TaskSize;
    failureRisk: FailureRisk;
    uxNeed: UxNeed;
    expressiveDesignNeed: ExpressiveDesignNeed;
  }>;
  strategy: Readonly<{
    owner: 'user-selected-model';
    method: DesignStrategyMethod;
    taskExecution: TaskExecutionStrategy;
    failureHandling: FailureHandlingStrategy;
    uxRigor: UxRigorStrategy;
    expressiveDirection: ExpressiveDirectionStrategy;
    accessibility: 'required';
    recommendation: RecommendedMethodDecision;
  }>;
}>;

const INPUT_KEYS = [
  'schema',
  'taskSize',
  'failureRisk',
  'uxNeed',
  'expressiveDesignNeed',
];
const INPUT_KEY_SET = new Set<string>(INPUT_KEYS);

function fail(code: DesignAxisRoutingErrorCode): never {
  throw new DesignAxisRoutingError(code);
}

function objectValue(input: unknown): object {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail('MALFORMED_DESIGN_AXIS_INPUT');
  }
  return input;
}

function requireExactKeys(input: object): void {
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== 'string' || !INPUT_KEY_SET.has(key))) {
    return fail('UNEXPECTED_DESIGN_AXIS_FIELD');
  }
  if (keys.length !== INPUT_KEYS.length || INPUT_KEYS.some((key) => !Object.hasOwn(input, key))) {
    throw new DesignAxisRoutingError('MALFORMED_DESIGN_AXIS_INPUT', `designAxes requires ${INPUT_KEYS.join(', ')}; schema must be "design-axis-input-v1"`);
  }
}

function dataValue(input: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (descriptor === undefined || !('value' in descriptor)) {
    return fail('MALFORMED_DESIGN_AXIS_INPUT');
  }
  return descriptor.value;
}

function taskSize(input: unknown): TaskSize {
  switch (input) {
    case 'small': return input;
    case 'medium': return input;
    case 'large': return input;
    default: return fail('INVALID_TASK_SIZE');
  }
}

function failureRisk(input: unknown): FailureRisk {
  switch (input) {
    case 'low': return input;
    case 'moderate': return input;
    case 'high': return input;
    default: return fail('INVALID_FAILURE_RISK');
  }
}

function uxNeed(input: unknown): UxNeed {
  switch (input) {
    case 'baseline': return input;
    case 'focused': return input;
    case 'rigorous': return input;
    default: return fail('INVALID_UX_NEED');
  }
}

function expressiveDesignNeed(input: unknown): ExpressiveDesignNeed {
  switch (input) {
    case 'restrained': return input;
    case 'balanced': return input;
    case 'showpiece': return input;
    default: return fail('INVALID_EXPRESSIVE_DESIGN_NEED');
  }
}

function parse(input: unknown): DesignAxisInput {
  const record = objectValue(input);
  requireExactKeys(record);
  if (dataValue(record, 'schema') !== DESIGN_AXIS_INPUT_SCHEMA) {
    return fail('MALFORMED_DESIGN_AXIS_INPUT');
  }

  const size = taskSize(dataValue(record, 'taskSize'));
  const risk = failureRisk(dataValue(record, 'failureRisk'));
  const ux = uxNeed(dataValue(record, 'uxNeed'));
  const expression = expressiveDesignNeed(dataValue(record, 'expressiveDesignNeed'));
  if (risk === 'high' && ux !== 'rigorous') {
    return fail('CONTRADICTORY_DESIGN_AXIS_STATE');
  }

  return Object.freeze({
    schema: DESIGN_AXIS_INPUT_SCHEMA,
    taskSize: size,
    failureRisk: risk,
    uxNeed: ux,
    expressiveDesignNeed: expression,
  });
}

/** Parses untrusted axis input into a detached, immutable four-axis snapshot. */
export function parseDesignAxisInput(input: unknown): DesignAxisInput {
  try {
    return parse(input);
  } catch (error) {
    if (error instanceof DesignAxisRoutingError) throw error;
    return fail('MALFORMED_DESIGN_AXIS_INPUT');
  }
}

function taskExecution(size: TaskSize): TaskExecutionStrategy {
  switch (size) {
    case 'small': return 'focused';
    case 'medium': return 'coordinated';
    case 'large': return 'system-scale';
  }
}

function failureHandling(risk: FailureRisk): FailureHandlingStrategy {
  switch (risk) {
    case 'low': return 'standard-review';
    case 'moderate': return 'error-prevention-and-recovery';
    case 'high': return 'safety-critical-recovery-validation';
  }
}

function uxRigor(need: UxNeed): UxRigorStrategy {
  switch (need) {
    case 'baseline': return 'accessible-baseline';
    case 'focused': return 'task-flow-validation';
    case 'rigorous': return 'rigorous-task-accessibility-validation';
  }
}

function expressiveDirection(need: ExpressiveDesignNeed): ExpressiveDirectionStrategy {
  switch (need) {
    case 'restrained': return 'restrained-system';
    case 'balanced': return 'purpose-fit-craft';
    case 'showpiece': return 'showpiece-with-accessible-motion';
  }
}

function method(input: DesignAxisInput): DesignStrategyMethod {
  if (input.failureRisk === 'high') return 'safety-recovery';
  if (input.expressiveDesignNeed === 'showpiece') return 'expressive-campaign';
  if (input.uxNeed === 'focused' || input.uxNeed === 'rigorous') return 'operational-ux';
  return 'balanced-delivery';
}

function recommendation(selected: DesignStrategyMethod): RecommendedMethodDecision {
  let reason: string;
  switch (selected) {
    case 'balanced-delivery':
      reason = 'Use balanced delivery while preserving the accessibility floor.';
      break;
    case 'operational-ux':
      reason = 'Prioritize task completion and UX rigor without requiring showpiece expression.';
      break;
    case 'safety-recovery':
      reason = 'Prioritize safety-critical validation, error prevention, and recovery while retaining the requested visual register.';
      break;
    case 'expressive-campaign':
      reason = 'Elevate expressive craft and accessible motion while retaining the independently required UX rigor.';
      break;
  }
  const value: RecommendedMethodDecision = Object.freeze({
    id: `design-strategy-${selected}`,
    kind: 'recommended_method',
    status: 'selected',
    reason,
  });
  parseUxPolicy({ schema: UX_POLICY_SCHEMA, decisions: [value] });
  return value;
}

/** Routes explicit axes without averaging UX and expressive quality into a scalar. */
export function routeDesignAxes(input: unknown): DesignAxisRouting {
  const parsed = parseDesignAxisInput(input);
  const selected = method(parsed);
  const axes = Object.freeze({
    taskSize: parsed.taskSize,
    failureRisk: parsed.failureRisk,
    uxNeed: parsed.uxNeed,
    expressiveDesignNeed: parsed.expressiveDesignNeed,
  });
  const strategy = Object.freeze({
    owner: 'user-selected-model',
    method: selected,
    taskExecution: taskExecution(parsed.taskSize),
    failureHandling: failureHandling(parsed.failureRisk),
    uxRigor: uxRigor(parsed.uxNeed),
    expressiveDirection: expressiveDirection(parsed.expressiveDesignNeed),
    accessibility: 'required',
    recommendation: recommendation(selected),
  });
  return Object.freeze({
    schema: DESIGN_AXIS_ROUTING_SCHEMA,
    axes,
    strategy,
  });
}
