/** Execution constraints bind existing host gates, never caller-supplied verdicts or DOM text. */
export const EXECUTION_REQUIREMENT_GATES = Object.freeze([
  'scope-lock',
  'project-write-boundary',
  'activation',
  'source-seal',
  'independent-review',
  'final-evidence-v2',
  'user-selected-model-ownership',
  'completion-preflight',
] as const);

export type ExecutionRequirementGate = (typeof EXECUTION_REQUIREMENT_GATES)[number];
export type ExecutionRequirement = Readonly<{
  requirement: string;
  enforcedBy: readonly ExecutionRequirementGate[];
}>;

function fail(): never { throw new Error('INVALID_EXECUTION_REQUIREMENT'); }

function data(value: object, key: string): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return fail();
  return descriptor.value;
}

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return fail();
  const expected = Array.from({ length: value.length }, (_, index) => String(index));
  const own = Reflect.ownKeys(value);
  if (own.length !== expected.length + 1
    || own.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) return fail();
  return expected.map((key) => data(value, key));
}

export function parseExecutionRequirements(value: unknown): readonly ExecutionRequirement[] {
  const requirements = array(value).map((candidate): ExecutionRequirement => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)
      || Reflect.getPrototypeOf(candidate) !== Object.prototype) return fail();
    const keys = Reflect.ownKeys(candidate);
    if (keys.length !== 2 || keys.some((key) => key !== 'requirement' && key !== 'enforcedBy')) return fail();
    const requirement = data(candidate, 'requirement');
    if (typeof requirement !== 'string' || requirement.trim() === '') return fail();
    const enforcedBy = array(data(candidate, 'enforcedBy'));
    if (enforcedBy.length === 0 || new Set(enforcedBy).size !== enforcedBy.length
      || enforcedBy.some((gate) => !EXECUTION_REQUIREMENT_GATES.includes(gate as ExecutionRequirementGate))) return fail();
    return Object.freeze({
      requirement: requirement.trim(),
      enforcedBy: Object.freeze(enforcedBy as ExecutionRequirementGate[]),
    });
  });
  if (new Set(requirements.map(({ requirement }) => requirement)).size !== requirements.length) return fail();
  return Object.freeze(requirements);
}
