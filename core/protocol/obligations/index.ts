import {
  EXECUTABLE_OBLIGATION_TEST_CASES,
  OBLIGATION_PROJECTION_DEFINITIONS,
  type ExecutableObligationTestCase,
  type ObligationProjectionDefinition,
} from './targets.ts';
export const REQUIRED_OBLIGATION_IDS = [
  'explicit-user-motion-lock',
  'silent-marketing-three-direction-comparison',
  'none-one-motion-eligibility',
  'pre-composition-decision-timing',
  'no-user-prompt',
  'critical-floors',
  'exact-final-artifact-cardinality',
  'activation',
  'guarded-writes',
  'isolated-lanes',
  'sole-v2-publication',
] as const;

export type ObligationId = typeof REQUIRED_OBLIGATION_IDS[number];

export interface ProtocolObligation {
  readonly id: ObligationId;
  readonly owner: string;
  readonly testIds: readonly string[];
  readonly projectionIds: readonly string[];
}

function requiredId(value: string): value is ObligationId {
  return (REQUIRED_OBLIGATION_IDS as readonly string[]).includes(value);
}

function nonEmptyIds(ids: readonly string[], label: string, obligation: string): void {
  if (ids.length === 0) throw new Error(`obligation ${obligation} is missing ${label}`);
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.trim().length === 0) throw new Error(`obligation ${obligation} has an empty ${label} id`);
    if (seen.has(id)) throw new Error(`obligation ${obligation} duplicates ${label} id: ${id}`);
    seen.add(id);
  }
}

function targetIndex<T extends { readonly id: string; readonly applicableTo: readonly string[] }>(
  targets: readonly T[],
  kind: string,
): ReadonlyMap<string, T> {
  const indexed = new Map<string, T>();
  for (const target of targets) {
    if (target.id.trim().length === 0) throw new Error(`${kind} target has an empty id`);
    if (target.applicableTo.length === 0) throw new Error(`${kind} target ${target.id} is missing applicability`);
    const applicable = new Set<string>();
    for (const obligationId of target.applicableTo) {
      if (!requiredId(obligationId)) throw new Error(`${kind} target ${target.id} has unknown applicability: ${obligationId}`);
      if (applicable.has(obligationId)) throw new Error(`${kind} target ${target.id} duplicates applicability: ${obligationId}`);
      applicable.add(obligationId);
    }
    if (indexed.has(target.id)) throw new Error(`duplicate ${kind} target: ${target.id}`);
    indexed.set(target.id, target);
  }
  return indexed;
}

/** Validates fixed executable test and projection declarations before they can authorize obligations. */
export function validateObligationTargets(
  testCases: readonly ExecutableObligationTestCase[] = EXECUTABLE_OBLIGATION_TEST_CASES,
  projections: readonly ObligationProjectionDefinition[] = OBLIGATION_PROJECTION_DEFINITIONS,
): void {
  for (const testCase of testCases) {
    if (testCase.file.trim().length === 0 || testCase.title.trim().length === 0) {
      throw new Error(`test case target ${testCase.id} is missing an executable declaration`);
    }
  }
  for (const projection of projections) {
    if (projection.file.trim().length === 0 || projection.definition.trim().length === 0) {
      throw new Error(`projection target ${projection.id} is missing a definition`);
    }
  }
  targetIndex(testCases, 'test case');
  targetIndex(projections, 'projection');
}

/** Validates the single ownership map used to project harness-v2 policy into executable tests and projections. */
export function validateObligationRegistry(obligations: readonly ProtocolObligation[]): readonly ProtocolObligation[] {
  validateObligationTargets();
  const testCases = targetIndex(EXECUTABLE_OBLIGATION_TEST_CASES, 'test case');
  const projections = targetIndex(OBLIGATION_PROJECTION_DEFINITIONS, 'projection');
  const obligationOwners = new Map<string, string>();
  const testOwners = new Map<string, string>();
  const projectionOwners = new Map<string, string>();

  for (const obligation of obligations) {
    if (!requiredId(obligation.id)) throw new Error(`unknown obligation id: ${obligation.id}`);
    if (obligation.owner.trim().length === 0) throw new Error(`obligation ${obligation.id} is missing an owner`);
    if (obligationOwners.has(obligation.id)) {
      throw new Error(`conflicting ownership for ${obligation.id}: ${obligationOwners.get(obligation.id)} and ${obligation.owner}`);
    }
    obligationOwners.set(obligation.id, obligation.owner);
    nonEmptyIds(obligation.testIds, 'test', obligation.id);
    nonEmptyIds(obligation.projectionIds, 'projection', obligation.id);

    for (const testId of obligation.testIds) {
      const testCase = testCases.get(testId);
      if (testCase === undefined) throw new Error(`obligation ${obligation.id} references missing executable test case: ${testId}`);
      const owner = testOwners.get(testId);
      if (owner !== undefined) throw new Error(`test id ${testId} is owned by both ${owner} and ${obligation.id}`);
      if (!(testCase.applicableTo as readonly string[]).includes(obligation.id)) throw new Error(`executable test case ${testId} is missing applicability for ${obligation.id}`);
      testOwners.set(testId, obligation.id);
    }
    for (const projectionId of obligation.projectionIds) {
      const projection = projections.get(projectionId);
      if (projection === undefined) throw new Error(`obligation ${obligation.id} references missing projection definition: ${projectionId}`);
      const owner = projectionOwners.get(projectionId);
      if (owner !== undefined) throw new Error(`projection id ${projectionId} is owned by both ${owner} and ${obligation.id}`);
      if (!(projection.applicableTo as readonly string[]).includes(obligation.id)) throw new Error(`projection ${projectionId} is missing applicability for ${obligation.id}`);
      projectionOwners.set(projectionId, obligation.id);
    }
  }

  for (const id of REQUIRED_OBLIGATION_IDS) {
    if (!obligationOwners.has(id)) throw new Error(`missing required obligation: ${id}`);
  }
  return obligations;
}

export const OBLIGATION_REGISTRY = validateObligationRegistry([
  { id: 'explicit-user-motion-lock', owner: 'art-direction', testIds: ['art-direction-motion-lock'], projectionIds: ['art-direction-motion-lock'] },
  { id: 'silent-marketing-three-direction-comparison', owner: 'art-direction', testIds: ['art-direction-three-directions'], projectionIds: ['art-direction-three-directions'] },
  { id: 'none-one-motion-eligibility', owner: 'art-direction', testIds: ['art-direction-motion-eligibility'], projectionIds: ['art-direction-motion-eligibility'] },
  { id: 'pre-composition-decision-timing', owner: 'protocol', testIds: ['prompt-pre-composition-decision'], projectionIds: ['human-design-loop-pre-composition'] },
  { id: 'no-user-prompt', owner: 'protocol', testIds: ['prompt-no-user-prompt'], projectionIds: ['human-design-loop-no-prompt'] },
  { id: 'critical-floors', owner: 'quality', testIds: ['harness-v2-critical-floors'], projectionIds: ['harness-v2-quality-floors'] },
  { id: 'exact-final-artifact-cardinality', owner: 'final-evidence-v2', testIds: ['final-evidence-v2-cardinality'], projectionIds: ['final-evidence-v2-cardinality'] },
  { id: 'activation', owner: 'art-direction', testIds: ['art-direction-activation'], projectionIds: ['art-direction-activation'] },
  { id: 'guarded-writes', owner: 'final-evidence-v2', testIds: ['final-evidence-v2-guarded-writes'], projectionIds: ['final-evidence-v2-guarded-writes'] },
  { id: 'isolated-lanes', owner: 'protocol', testIds: ['prompt-isolated-lanes'], projectionIds: ['human-design-loop-isolated-lanes'] },
  { id: 'sole-v2-publication', owner: 'final-evidence-v2', testIds: ['final-evidence-v2-sole-publisher'], projectionIds: ['final-evidence-v2-sole-publisher'] },
] as const);
