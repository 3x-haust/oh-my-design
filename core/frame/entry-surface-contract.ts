import type { TaskOutcomeContract } from '../brief/task-outcome.ts';

export const ENTRY_SURFACE_CONTRACT_SCHEMA = 'entry-surface-contract-v1' as const;

export type EntrySurfaceOutcomeKind = 'mustHave' | 'mustNotHave' | 'completionEvidence';
export type EntrySurfaceWitnessTarget =
  | 'purpose'
  | 'workObjectAnchor'
  | 'nextAction'
  | 'consequence'
  | 'body';

export type EntrySurfaceOutcomeWitness = Readonly<{
  kind: EntrySurfaceOutcomeKind;
  index: number;
  phase: 'initial' | 'after-prerequisite';
  assertion: 'visible-text' | 'absent-text';
  target: EntrySurfaceWitnessTarget;
}>;

export type EntrySurfaceContract = Readonly<{
  schema: typeof ENTRY_SURFACE_CONTRACT_SCHEMA;
  entryPath: string;
  prerequisiteTaskId: string;
  dependentTaskId: string;
  purposeText: string;
  workObjectAnchorText: string;
  nextActionName: string | null;
  beforeText: string;
  afterText: string;
  outcomeWitnesses: readonly EntrySurfaceOutcomeWitness[];
}>;

export class EntrySurfaceContractError extends Error {
  override readonly name = 'EntrySurfaceContractError';
  readonly code:
    | 'MALFORMED_ENTRY_SURFACE_CONTRACT'
    | 'INCOMPLETE_ENTRY_SURFACE_OUTCOME_COVERAGE';

  constructor(code: EntrySurfaceContractError['code']) {
    super(code);
    this.code = code;
  }
}

const CONTRACT_KEYS = [
  'schema',
  'entryPath',
  'prerequisiteTaskId',
  'dependentTaskId',
  'purposeText',
  'workObjectAnchorText',
  'nextActionName',
  'beforeText',
  'afterText',
  'outcomeWitnesses',
] as const;
const WITNESS_KEYS = ['kind', 'index', 'phase', 'assertion', 'target'] as const;
const TASK_ID = /^(?:T[1-9]\d*|[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;

/** Preserve canonical frame task IDs and existing semantic IDs without admitting selectors. */
export function isEntrySurfaceTaskId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && TASK_ID.test(value);
}
const OUTCOME_KINDS = new Set<EntrySurfaceOutcomeKind>(['mustHave', 'mustNotHave', 'completionEvidence']);
const TARGETS = new Set<EntrySurfaceWitnessTarget>([
  'purpose', 'workObjectAnchor', 'nextAction', 'consequence', 'body',
]);

function fail(code: EntrySurfaceContractError['code']): never {
  throw new EntrySurfaceContractError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) {
    return fail('MALFORMED_ENTRY_SURFACE_CONTRACT');
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return fail('MALFORMED_ENTRY_SURFACE_CONTRACT');
  }
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 240) {
    return fail('MALFORMED_ENTRY_SURFACE_CONTRACT');
  }
  return value.trim();
}

function taskId(value: unknown): string {
  const parsed = text(value);
  if (!isEntrySurfaceTaskId(parsed)) return fail('MALFORMED_ENTRY_SURFACE_CONTRACT');
  return parsed;
}

function witness(value: unknown): EntrySurfaceOutcomeWitness {
  const input = record(value);
  exact(input, WITNESS_KEYS);
  const kind = input.kind;
  const phase = input.phase;
  const assertion = input.assertion;
  const target = input.target;
  if (!OUTCOME_KINDS.has(kind as EntrySurfaceOutcomeKind)
    || (phase !== 'initial' && phase !== 'after-prerequisite')
    || (assertion !== 'visible-text' && assertion !== 'absent-text')
    || !TARGETS.has(target as EntrySurfaceWitnessTarget)
    || !Number.isSafeInteger(input.index) || (input.index as number) < 0
    || (kind === 'mustNotHave'
      ? assertion !== 'absent-text' || target !== 'body'
      : assertion !== 'visible-text' || target === 'body')) {
    return fail('MALFORMED_ENTRY_SURFACE_CONTRACT');
  }
  return Object.freeze({
    kind: kind as EntrySurfaceOutcomeKind,
    index: input.index as number,
    phase,
    assertion,
    target: target as EntrySurfaceWitnessTarget,
  });
}

export function parseEntrySurfaceContract(value: unknown): EntrySurfaceContract {
  try {
    const input = record(value);
    exact(input, CONTRACT_KEYS);
    if (input.schema !== ENTRY_SURFACE_CONTRACT_SCHEMA
      || !Array.isArray(input.outcomeWitnesses) || input.outcomeWitnesses.length === 0) {
      return fail('MALFORMED_ENTRY_SURFACE_CONTRACT');
    }
    const prerequisiteTaskId = taskId(input.prerequisiteTaskId);
    const dependentTaskId = taskId(input.dependentTaskId);
    const nextActionName = input.nextActionName === null ? null : text(input.nextActionName);
    const beforeText = text(input.beforeText);
    const afterText = text(input.afterText);
    const outcomeWitnesses = input.outcomeWitnesses.map(witness);
    const identities = outcomeWitnesses.map(({ kind, index }) => `${kind}:${index}`);
    if (prerequisiteTaskId === dependentTaskId || beforeText === afterText
      || (nextActionName === null
        && outcomeWitnesses.some(({ target }) => target === 'nextAction'))
      || new Set(identities).size !== identities.length) {
      return fail('MALFORMED_ENTRY_SURFACE_CONTRACT');
    }
    return Object.freeze({
      schema: ENTRY_SURFACE_CONTRACT_SCHEMA,
      entryPath: text(input.entryPath),
      prerequisiteTaskId,
      dependentTaskId,
      purposeText: text(input.purposeText),
      workObjectAnchorText: text(input.workObjectAnchorText),
      nextActionName,
      beforeText,
      afterText,
      outcomeWitnesses: Object.freeze(outcomeWitnesses),
    });
  } catch (error) {
    if (error instanceof EntrySurfaceContractError) throw error;
    return fail('MALFORMED_ENTRY_SURFACE_CONTRACT');
  }
}

export function requireEntrySurfaceOutcomeCoverage(
  contract: EntrySurfaceContract,
  taskOutcome: TaskOutcomeContract,
): void {
  const expected = (['mustHave', 'mustNotHave', 'completionEvidence'] as const)
    .flatMap((kind) => taskOutcome[kind].map((_, index) => `${kind}:${index}`));
  const actual = contract.outcomeWitnesses.map(({ kind, index }) => `${kind}:${index}`);
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    return fail('INCOMPLETE_ENTRY_SURFACE_OUTCOME_COVERAGE');
  }
}
