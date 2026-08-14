export const UX_POLICY_SCHEMA = 'ux-policy-v1';

export type UxPolicyErrorCode =
  | 'MALFORMED_POLICY'
  | 'DUPLICATE_POLICY_ID'
  | 'HARD_SAFETY_RAIL_REQUIRED'
  | 'REQUIRED_OUTCOME_REQUIRED'
  | 'RECOMMENDATION_REASON_REQUIRED';

export class UxPolicyError extends Error {
  readonly code: UxPolicyErrorCode;

  constructor(code: UxPolicyErrorCode) {
    super(code);
    this.name = 'UxPolicyError';
    this.code = code;
  }
}

export type HardSafetyRailDecision = Readonly<{
  id: string;
  kind: 'hard_safety_rail';
  status: 'enforced';
}>;

export type RequiredOutcomeDecision = Readonly<{
  id: string;
  kind: 'required_outcome';
  status: 'required';
}>;

export type RecommendedMethodDecision = Readonly<{
  id: string;
  kind: 'recommended_method';
  status: 'selected' | 'skipped';
  reason: string;
}>;

export type FreeChoiceDecision = Readonly<{
  id: string;
  kind: 'free_choice';
  status: 'selected' | 'skipped';
}>;

export type UxPolicyDecision =
  | HardSafetyRailDecision
  | RequiredOutcomeDecision
  | RecommendedMethodDecision
  | FreeChoiceDecision;

export type UxPolicy = Readonly<{
  schema: typeof UX_POLICY_SCHEMA;
  decisions: readonly UxPolicyDecision[];
}>;

export type UxPolicyCheck = Readonly<{
  status: 'accepted';
  enforcedRailIds: readonly string[];
  requiredOutcomeIds: readonly string[];
  recommendations: readonly Readonly<Pick<RecommendedMethodDecision, 'id' | 'status' | 'reason'>>[];
  freeChoices: readonly Readonly<Pick<FreeChoiceDecision, 'id' | 'status'>>[];
}>;

function fail(code: UxPolicyErrorCode): never {
  throw new UxPolicyError(code);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function parseDecision(input: unknown): UxPolicyDecision {
  if (!isObject(input) || !('id' in input) || !('kind' in input) || !('status' in input)) {
    return fail('MALFORMED_POLICY');
  }
  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    return fail('MALFORMED_POLICY');
  }

  switch (input.kind) {
    case 'hard_safety_rail':
      if (!hasExactKeys(input, ['id', 'kind', 'status'])) return fail('MALFORMED_POLICY');
      if (input.status !== 'enforced') return fail('HARD_SAFETY_RAIL_REQUIRED');
      return Object.freeze({ id: input.id, kind: input.kind, status: input.status });

    case 'required_outcome':
      if (!hasExactKeys(input, ['id', 'kind', 'status'])) return fail('MALFORMED_POLICY');
      if (input.status !== 'required') return fail('REQUIRED_OUTCOME_REQUIRED');
      return Object.freeze({ id: input.id, kind: input.kind, status: input.status });

    case 'recommended_method':
      if (input.status !== 'selected' && input.status !== 'skipped') return fail('MALFORMED_POLICY');
      if (!('reason' in input) || typeof input.reason !== 'string' || input.reason.trim().length === 0) {
        return fail('RECOMMENDATION_REASON_REQUIRED');
      }
      if (!hasExactKeys(input, ['id', 'kind', 'status', 'reason'])) return fail('MALFORMED_POLICY');
      return Object.freeze({ id: input.id, kind: input.kind, status: input.status, reason: input.reason });

    case 'free_choice':
      if (!hasExactKeys(input, ['id', 'kind', 'status'])) return fail('MALFORMED_POLICY');
      if (input.status !== 'selected' && input.status !== 'skipped') return fail('MALFORMED_POLICY');
      return Object.freeze({ id: input.id, kind: input.kind, status: input.status });

    default:
      return fail('MALFORMED_POLICY');
  }
}

export function parseUxPolicy(input: unknown): UxPolicy {
  if (!isObject(input) || !hasExactKeys(input, ['schema', 'decisions'])
    || !('schema' in input) || input.schema !== UX_POLICY_SCHEMA
    || !('decisions' in input) || !Array.isArray(input.decisions)) {
    return fail('MALFORMED_POLICY');
  }

  const ids = new Set<string>();
  const decisions: UxPolicyDecision[] = [];
  for (const inputDecision of input.decisions) {
    const decision = parseDecision(inputDecision);
    if (ids.has(decision.id)) return fail('DUPLICATE_POLICY_ID');
    ids.add(decision.id);
    decisions.push(decision);
  }

  return Object.freeze({ schema: UX_POLICY_SCHEMA, decisions: Object.freeze(decisions) });
}

function assertNever(value: never): never {
  throw new UxPolicyError('MALFORMED_POLICY');
}

export function checkUxPolicy(policy: UxPolicy): UxPolicyCheck {
  const enforcedRailIds: string[] = [];
  const requiredOutcomeIds: string[] = [];
  const recommendations: Array<Readonly<Pick<RecommendedMethodDecision, 'id' | 'status' | 'reason'>>> = [];
  const freeChoices: Array<Readonly<Pick<FreeChoiceDecision, 'id' | 'status'>>> = [];

  for (const decision of policy.decisions) {
    switch (decision.kind) {
      case 'hard_safety_rail':
        enforcedRailIds.push(decision.id);
        break;
      case 'required_outcome':
        requiredOutcomeIds.push(decision.id);
        break;
      case 'recommended_method':
        recommendations.push(Object.freeze({ id: decision.id, status: decision.status, reason: decision.reason }));
        break;
      case 'free_choice':
        freeChoices.push(Object.freeze({ id: decision.id, status: decision.status }));
        break;
      default:
        assertNever(decision);
    }
  }

  return Object.freeze({
    status: 'accepted',
    enforcedRailIds: Object.freeze(enforcedRailIds),
    requiredOutcomeIds: Object.freeze(requiredOutcomeIds),
    recommendations: Object.freeze(recommendations),
    freeChoices: Object.freeze(freeChoices),
  });
}
