export const EVIDENCE_CLAIM_PUBLICATION_SCHEMA = 'evidence-claim-publication-v1';

export type EvidenceClaimStatus = 'confirmed' | 'hypothesis' | 'temporary-decision';
export type EvidenceClaimErrorCode =
  | 'MALFORMED_EVIDENCE_CLAIM_PUBLICATION'
  | 'UNEXPECTED_EVIDENCE_CLAIM_FIELD'
  | 'INVALID_EVIDENCE_CLAIM_STATUS'
  | 'EMPTY_EVIDENCE_CLAIM_FIELD'
  | 'DUPLICATE_EVIDENCE_CLAIM'
  | 'MISSING_USER_EVIDENCE'
  | 'DUPLICATE_USER_EVIDENCE'
  | 'UNKNOWN_EVIDENCE_CLAIM_REFERENCE'
  | 'DUPLICATE_EVIDENCE_CLAIM_PUBLICATION'
  | 'UNROUTED_EVIDENCE_CLAIM'
  | 'UNCONFIRMED_USER_FACT';

export class EvidenceClaimError extends Error {
  readonly code: EvidenceClaimErrorCode;

  constructor(code: EvidenceClaimErrorCode) {
    super(code);
    this.name = 'EvidenceClaimError';
    this.code = code;
  }
}

export type ExplicitUserEvidence = Readonly<{
  kind: 'explicit-user-evidence';
  source: 'user-message' | 'user-provided-artifact';
  reference: string;
  excerpt: string;
}>;

export type ConfirmedEvidenceClaim = Readonly<{
  id: string;
  text: string;
  status: 'confirmed';
  userEvidence: readonly ExplicitUserEvidence[];
}>;

export type HypothesisEvidenceClaim = Readonly<{
  id: string;
  text: string;
  status: 'hypothesis';
  basis: string;
}>;

export type TemporaryDecisionEvidenceClaim = Readonly<{
  id: string;
  text: string;
  status: 'temporary-decision';
  basis: string;
}>;

export type EvidenceClaim = ConfirmedEvidenceClaim | HypothesisEvidenceClaim | TemporaryDecisionEvidenceClaim;

export type EvidenceClaimPublication = Readonly<{
  schema: typeof EVIDENCE_CLAIM_PUBLICATION_SCHEMA;
  claims: readonly EvidenceClaim[];
  userFacts: readonly string[];
  workingContext: readonly string[];
}>;

const PUBLICATION_KEYS: readonly string[] = ['schema', 'claims', 'userFacts', 'workingContext'];
const CONFIRMED_KEYS: readonly string[] = ['id', 'text', 'status', 'userEvidence'];
const NON_FACT_KEYS: readonly string[] = ['id', 'text', 'status', 'basis'];
const USER_EVIDENCE_KEYS: readonly string[] = ['kind', 'source', 'reference', 'excerpt'];

function fail(code: EvidenceClaimErrorCode): never {
  throw new EvidenceClaimError(code);
}

function objectValue(value: unknown): object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  }
  return value;
}

function dataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !('value' in descriptor)) {
    return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  }
  return descriptor.value;
}

function exactKeys(value: object, expected: readonly string[]): void {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return fail('UNEXPECTED_EVIDENCE_CLAIM_FIELD');
  }
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  }
}

function arrayValues(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  const length = dataValue(value, 'length');
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
    return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  }
  const expected = ['length', ...Array.from({ length }, (_, index) => String(index))];
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return fail('UNEXPECTED_EVIDENCE_CLAIM_FIELD');
  }
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  }
  return Array.from({ length }, (_, index) => dataValue(value, String(index)));
}

function text(value: unknown): string {
  if (typeof value !== 'string') return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  const normalized = value.trim();
  if (normalized.length === 0) return fail('EMPTY_EVIDENCE_CLAIM_FIELD');
  return normalized;
}

function parseUserEvidence(value: unknown): readonly ExplicitUserEvidence[] {
  const inputs = arrayValues(value);
  if (inputs.length === 0) return fail('MISSING_USER_EVIDENCE');
  const evidence: ExplicitUserEvidence[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const item = objectValue(input);
    exactKeys(item, USER_EVIDENCE_KEYS);
    if (dataValue(item, 'kind') !== 'explicit-user-evidence') {
      return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
    }
    const source = dataValue(item, 'source');
    if (source !== 'user-message' && source !== 'user-provided-artifact') {
      return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
    }
    const reference = text(dataValue(item, 'reference'));
    const excerpt = text(dataValue(item, 'excerpt'));
    const identity = `${source}\u0000${reference}\u0000${excerpt}`;
    if (seen.has(identity)) return fail('DUPLICATE_USER_EVIDENCE');
    seen.add(identity);
    evidence.push(Object.freeze({ kind: 'explicit-user-evidence', source, reference, excerpt }));
  }
  return Object.freeze(evidence);
}

function parseClaim(value: unknown): EvidenceClaim {
  const claim = objectValue(value);
  const status = dataValue(claim, 'status');
  if (status !== 'confirmed' && status !== 'hypothesis' && status !== 'temporary-decision') {
    return fail('INVALID_EVIDENCE_CLAIM_STATUS');
  }
  if (status === 'confirmed' && !Object.hasOwn(claim, 'userEvidence')) {
    const keys = Reflect.ownKeys(claim);
    if (keys.some((key) => typeof key !== 'string' || !CONFIRMED_KEYS.some((expected) => expected === key))) {
      return fail('UNEXPECTED_EVIDENCE_CLAIM_FIELD');
    }
    return fail('MISSING_USER_EVIDENCE');
  }
  exactKeys(claim, status === 'confirmed' ? CONFIRMED_KEYS : NON_FACT_KEYS);
  const id = text(dataValue(claim, 'id'));
  const claimText = text(dataValue(claim, 'text'));
  if (status === 'confirmed') {
    return Object.freeze({ id, text: claimText, status, userEvidence: parseUserEvidence(dataValue(claim, 'userEvidence')) });
  }
  const basis = text(dataValue(claim, 'basis'));
  return Object.freeze({ id, text: claimText, status, basis });
}

function claimReferences(value: unknown): readonly string[] {
  const references = arrayValues(value).map(text);
  if (new Set(references).size !== references.length) {
    return fail('DUPLICATE_EVIDENCE_CLAIM_PUBLICATION');
  }
  return Object.freeze(references);
}

function parse(value: unknown): EvidenceClaimPublication {
  const publication = objectValue(value);
  exactKeys(publication, PUBLICATION_KEYS);
  if (dataValue(publication, 'schema') !== EVIDENCE_CLAIM_PUBLICATION_SCHEMA) {
    return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  }

  const inputs = arrayValues(dataValue(publication, 'claims'));
  if (inputs.length === 0) return fail('EMPTY_EVIDENCE_CLAIM_FIELD');
  const claims = inputs.map(parseClaim);
  const byId = new Map<string, EvidenceClaim>();
  for (const claim of claims) {
    if (byId.has(claim.id)) return fail('DUPLICATE_EVIDENCE_CLAIM');
    byId.set(claim.id, claim);
  }

  const userFacts = claimReferences(dataValue(publication, 'userFacts'));
  const workingContext = claimReferences(dataValue(publication, 'workingContext'));
  const routed = new Set<string>();
  for (const reference of [...userFacts, ...workingContext]) {
    const claim = byId.get(reference);
    if (claim === undefined) return fail('UNKNOWN_EVIDENCE_CLAIM_REFERENCE');
    if (routed.has(reference)) return fail('DUPLICATE_EVIDENCE_CLAIM_PUBLICATION');
    if (userFacts.includes(reference) && claim.status !== 'confirmed') return fail('UNCONFIRMED_USER_FACT');
    routed.add(reference);
  }
  if (routed.size !== claims.length) return fail('UNROUTED_EVIDENCE_CLAIM');

  return Object.freeze({
    schema: EVIDENCE_CLAIM_PUBLICATION_SCHEMA,
    claims: Object.freeze(claims),
    userFacts,
    workingContext,
  });
}

/** Validates untrusted claims into a detached immutable publication projection. */
export function parseEvidenceClaimPublication(input: unknown): EvidenceClaimPublication {
  try {
    return parse(input);
  } catch (error) {
    if (error instanceof EvidenceClaimError) throw error;
    return fail('MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  }
}
