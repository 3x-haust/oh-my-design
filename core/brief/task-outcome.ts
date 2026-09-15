import { parseExecutionRequirements, type ExecutionRequirement } from './execution-requirements.ts';

export const TASK_OUTCOME_CONTRACT_SCHEMA = 'task-outcome-contract-v1' as const;

export type TaskOutcomeContractErrorCode =
  | 'MALFORMED_TASK_OUTCOME_CONTRACT'
  | 'UNEXPECTED_TASK_OUTCOME_FIELD'
  | 'EMPTY_TASK_OUTCOME_FIELD'
  | 'DUPLICATE_TASK_OUTCOME_ITEM'
  | 'CONFLICTING_TASK_OUTCOME_ITEM';

export class TaskOutcomeContractError extends Error {
  readonly code: TaskOutcomeContractErrorCode;

  constructor(code: TaskOutcomeContractErrorCode) {
    super(code);
    this.name = 'TaskOutcomeContractError';
    this.code = code;
  }
}

export type TaskOutcomeContract = Readonly<{
  schema: typeof TASK_OUTCOME_CONTRACT_SCHEMA;
  goal: string;
  mustHave: readonly string[];
  mustNotHave: readonly string[];
  completionEvidence: readonly string[];
  strategyFreedom: readonly string[];
  executionRequirements?: readonly ExecutionRequirement[];
}>;

const CONTRACT_KEYS = [
  'schema',
  'goal',
  'mustHave',
  'mustNotHave',
  'completionEvidence',
  'strategyFreedom',
] as const;
const CONTRACT_KEY_SET = new Set<string>([...CONTRACT_KEYS, 'executionRequirements']);

function fail(code: TaskOutcomeContractErrorCode): never {
  throw new TaskOutcomeContractError(code);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !('value' in descriptor)) return fail('MALFORMED_TASK_OUTCOME_CONTRACT');
  return descriptor.value;
}

function requireExactContractKeys(value: object): void {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string' || !CONTRACT_KEY_SET.has(key))) {
    return fail('UNEXPECTED_TASK_OUTCOME_FIELD');
  }
  const expectedLength = CONTRACT_KEYS.length + (Object.hasOwn(value, 'executionRequirements') ? 1 : 0);
  if (ownKeys.length !== expectedLength || CONTRACT_KEYS.some((key) => !Object.hasOwn(value, key))) {
    return fail('MALFORMED_TASK_OUTCOME_CONTRACT');
  }
}

function text(value: unknown): string {
  if (typeof value !== 'string') return fail('MALFORMED_TASK_OUTCOME_CONTRACT');
  const normalized = value.trim();
  if (normalized.length === 0) return fail('EMPTY_TASK_OUTCOME_FIELD');
  return normalized;
}

function textList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return fail('MALFORMED_TASK_OUTCOME_CONTRACT');

  const expectedKeys = new Set<string>(['length']);
  for (let index = 0; index < value.length; index++) expectedKeys.add(String(index));
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))) {
    return fail('UNEXPECTED_TASK_OUTCOME_FIELD');
  }
  if (ownKeys.length !== expectedKeys.size) return fail('MALFORMED_TASK_OUTCOME_CONTRACT');
  if (value.length === 0) return fail('EMPTY_TASK_OUTCOME_FIELD');

  const items: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const item = text(dataValue(value, String(index)));
    if (seen.has(item)) return fail('DUPLICATE_TASK_OUTCOME_ITEM');
    seen.add(item);
    items.push(item);
  }
  return Object.freeze(items);
}

function parse(input: unknown): TaskOutcomeContract {
  if (!isObject(input)) return fail('MALFORMED_TASK_OUTCOME_CONTRACT');
  requireExactContractKeys(input);

  if (dataValue(input, 'schema') !== TASK_OUTCOME_CONTRACT_SCHEMA) {
    return fail('MALFORMED_TASK_OUTCOME_CONTRACT');
  }

  const goal = text(dataValue(input, 'goal'));
  const mustHave = textList(dataValue(input, 'mustHave'));
  const mustNotHave = textList(dataValue(input, 'mustNotHave'));
  const completionEvidence = textList(dataValue(input, 'completionEvidence'));
  const strategyFreedom = textList(dataValue(input, 'strategyFreedom'));
  const executionRequirements = Object.hasOwn(input, 'executionRequirements')
    ? parseExecutionRequirements(dataValue(input, 'executionRequirements')) : undefined;
  const exclusions = new Set(mustNotHave);
  if (mustHave.some((item) => exclusions.has(item))) return fail('CONFLICTING_TASK_OUTCOME_ITEM');

  return Object.freeze({
    schema: TASK_OUTCOME_CONTRACT_SCHEMA,
    goal,
    mustHave,
    mustNotHave,
    completionEvidence,
    strategyFreedom,
    ...(executionRequirements === undefined ? {} : { executionRequirements }),
  });
}

/** Parses untrusted task-card input into a closed, detached, deeply immutable runtime value. */
export function parseTaskOutcomeContract(input: unknown): TaskOutcomeContract {
  try {
    return parse(input);
  } catch (error) {
    if (error instanceof TaskOutcomeContractError) throw error;
    return fail('MALFORMED_TASK_OUTCOME_CONTRACT');
  }
}

/** A visual/browser review gets every surface outcome, never host execution instructions. */
export function browserTaskOutcomeContract(contract: TaskOutcomeContract): Omit<TaskOutcomeContract, 'executionRequirements'> {
  const { executionRequirements: _executionRequirements, ...surface } = contract;
  return Object.freeze(surface);
}
