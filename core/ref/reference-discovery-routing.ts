import {
  UX_POLICY_SCHEMA,
  parseUxPolicy,
  type RecommendedMethodDecision,
} from '../ux/policy.ts';

export const REFERENCE_DISCOVERY_INPUT_SCHEMA = 'reference-discovery-input-v1';
export const REFERENCE_DISCOVERY_ROUTING_SCHEMA = 'reference-discovery-routing-v1';

export type ReferenceDiscoveryTaskNeed =
  | 'new-product'
  | 'new-marketing'
  | 'existing-product-change'
  | 'copy-only-edit';
export type ReferenceDiscoveryUncertainty = 'unresolved' | 'resolved';
export type ReferenceDiscoveryEvidence = 'none' | 'insufficient' | 'sufficient';
export type ReferenceDiscoveryDecision = 'discover' | 'skip';

export type ReferenceDiscoveryInput = Readonly<{
  schema: typeof REFERENCE_DISCOVERY_INPUT_SCHEMA;
  taskNeed: ReferenceDiscoveryTaskNeed;
  uncertainty: ReferenceDiscoveryUncertainty;
  existingEvidence: ReferenceDiscoveryEvidence;
  intendedUse: string;
  existingEvidenceUse: string | null;
  skipReason: string | null;
}>;

export type ReferenceDiscoveryRoutingErrorCode =
  | 'MALFORMED_REFERENCE_DISCOVERY_INPUT'
  | 'UNEXPECTED_REFERENCE_DISCOVERY_FIELD'
  | 'EMPTY_REFERENCE_DISCOVERY_FIELD'
  | 'REFERENCE_DISCOVERY_SKIP_REASON_REQUIRED'
  | 'CONTRADICTORY_REFERENCE_DISCOVERY_STATE';

export class ReferenceDiscoveryRoutingError extends Error {
  override readonly name = 'ReferenceDiscoveryRoutingError';
  readonly code: ReferenceDiscoveryRoutingErrorCode;

  constructor(code: ReferenceDiscoveryRoutingErrorCode) {
    super(code);
    this.code = code;
  }
}

export type ReferenceDiscoveryActualUse =
  | Readonly<{
    status: 'pending-discovery';
    description: 'No discovered references have been used yet.';
  }>
  | Readonly<{
    status: 'existing-evidence';
    description: string;
  }>;

export type ReferenceDiscoveryRouting = Readonly<{
  schema: typeof REFERENCE_DISCOVERY_ROUTING_SCHEMA;
  decision: ReferenceDiscoveryDecision;
  taskNeed: ReferenceDiscoveryTaskNeed;
  uncertainty: ReferenceDiscoveryUncertainty;
  evidence: Readonly<{ availability: ReferenceDiscoveryEvidence }>;
  references: Readonly<{
    intended: string;
    actual: ReferenceDiscoveryActualUse;
  }>;
  recommendation: RecommendedMethodDecision;
}>;

const INPUT_KEYS = [
  'schema',
  'taskNeed',
  'uncertainty',
  'existingEvidence',
  'intendedUse',
  'existingEvidenceUse',
  'skipReason',
];
const INPUT_KEY_SET = new Set<string>(INPUT_KEYS);

function fail(code: ReferenceDiscoveryRoutingErrorCode): never {
  throw new ReferenceDiscoveryRoutingError(code);
}

function objectValue(input: unknown): object {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  }
  return input;
}

function dataValue(input: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (descriptor === undefined || !('value' in descriptor)) {
    return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  }
  return descriptor.value;
}

function requireExactKeys(input: object): void {
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== 'string' || !INPUT_KEY_SET.has(key))) {
    return fail('UNEXPECTED_REFERENCE_DISCOVERY_FIELD');
  }
  if (!Object.hasOwn(input, 'skipReason')) {
    return fail('REFERENCE_DISCOVERY_SKIP_REASON_REQUIRED');
  }
  if (keys.length !== INPUT_KEYS.length || INPUT_KEYS.some((key) => !Object.hasOwn(input, key))) {
    return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  }
}

function text(input: unknown): string {
  if (typeof input !== 'string') return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  const normalized = input.trim();
  if (normalized.length === 0) return fail('EMPTY_REFERENCE_DISCOVERY_FIELD');
  return normalized;
}

function taskNeed(input: unknown): ReferenceDiscoveryTaskNeed {
  switch (input) {
    case 'new-product': return input;
    case 'new-marketing': return input;
    case 'existing-product-change': return input;
    case 'copy-only-edit': return input;
    default: return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  }
}

function uncertainty(input: unknown): ReferenceDiscoveryUncertainty {
  switch (input) {
    case 'unresolved': return input;
    case 'resolved': return input;
    default: return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  }
}

function evidence(input: unknown): ReferenceDiscoveryEvidence {
  switch (input) {
    case 'none': return input;
    case 'insufficient': return input;
    case 'sufficient': return input;
    default: return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  }
}

function nullableText(input: unknown): string | null {
  return input === null ? null : text(input);
}

function assertConsistentState(
  need: ReferenceDiscoveryTaskNeed,
  uncertaintyState: ReferenceDiscoveryUncertainty,
  evidenceState: ReferenceDiscoveryEvidence,
): void {
  if ((uncertaintyState === 'unresolved' && evidenceState === 'sufficient')
    || (uncertaintyState === 'resolved' && evidenceState !== 'sufficient')
    || ((need === 'new-product' || need === 'new-marketing') && uncertaintyState === 'resolved')) {
    return fail('CONTRADICTORY_REFERENCE_DISCOVERY_STATE');
  }
}

function recommendation(
  decision: ReferenceDiscoveryDecision,
  reason: string,
): RecommendedMethodDecision {
  const value: RecommendedMethodDecision = Object.freeze({
    id: 'reference-discovery',
    kind: 'recommended_method',
    status: decision === 'discover' ? 'selected' : 'skipped',
    reason,
  });
  parseUxPolicy({ schema: UX_POLICY_SCHEMA, decisions: [value] });
  return value;
}

function parse(input: unknown): ReferenceDiscoveryRouting {
  const record = objectValue(input);
  requireExactKeys(record);
  if (dataValue(record, 'schema') !== REFERENCE_DISCOVERY_INPUT_SCHEMA) {
    return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  }

  const need = taskNeed(dataValue(record, 'taskNeed'));
  const uncertaintyState = uncertainty(dataValue(record, 'uncertainty'));
  const evidenceState = evidence(dataValue(record, 'existingEvidence'));
  assertConsistentState(need, uncertaintyState, evidenceState);

  const intended = text(dataValue(record, 'intendedUse'));
  const existingUse = nullableText(dataValue(record, 'existingEvidenceUse'));
  const reasonInput = dataValue(record, 'skipReason');
  const decision: ReferenceDiscoveryDecision = need === 'new-product'
    || need === 'new-marketing'
    || uncertaintyState === 'unresolved'
    ? 'discover'
    : 'skip';

  if (decision === 'discover') {
    if (existingUse !== null || reasonInput !== null) {
      return fail('CONTRADICTORY_REFERENCE_DISCOVERY_STATE');
    }
    const reason = need === 'new-product'
      ? 'A new product needs reference discovery before its direction is established.'
      : need === 'new-marketing'
        ? 'A new marketing surface needs reference discovery before its direction is established.'
      : 'Unresolved task uncertainty requires reference discovery before production.';
    const actual: ReferenceDiscoveryActualUse = Object.freeze({
      status: 'pending-discovery',
      description: 'No discovered references have been used yet.',
    });
    return Object.freeze({
      schema: REFERENCE_DISCOVERY_ROUTING_SCHEMA,
      decision,
      taskNeed: need,
      uncertainty: uncertaintyState,
      evidence: Object.freeze({ availability: evidenceState }),
      references: Object.freeze({ intended, actual }),
      recommendation: recommendation(decision, reason),
    });
  }

  if (typeof reasonInput !== 'string' || reasonInput.trim().length === 0) {
    return fail('REFERENCE_DISCOVERY_SKIP_REASON_REQUIRED');
  }
  if (existingUse === null) return fail('CONTRADICTORY_REFERENCE_DISCOVERY_STATE');
  const actual: ReferenceDiscoveryActualUse = Object.freeze({
    status: 'existing-evidence',
    description: existingUse,
  });
  return Object.freeze({
    schema: REFERENCE_DISCOVERY_ROUTING_SCHEMA,
    decision,
    taskNeed: need,
    uncertainty: uncertaintyState,
    evidence: Object.freeze({ availability: evidenceState }),
    references: Object.freeze({ intended, actual }),
    recommendation: recommendation(decision, reasonInput.trim()),
  });
}

/** Routes untrusted task evidence into a detached optional reference-discovery recommendation. */
export function routeReferenceDiscovery(input: unknown): ReferenceDiscoveryRouting {
  try {
    return parse(input);
  } catch (error) {
    if (error instanceof ReferenceDiscoveryRoutingError) throw error;
    return fail('MALFORMED_REFERENCE_DISCOVERY_INPUT');
  }
}
