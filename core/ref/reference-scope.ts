// The two reference axes and what each combination may claim.
//
// The reference system previously distinguished references by a growing list of roles, which made
// "what may this evidence support?" a matter of which module happened to read it. It is really two
// questions, and both have two answers:
//
//   scope    — did we capture a whole page, or a part of one?
//   evidence — did we measure it, or only look at it?
//
// The four combinations do different jobs and carry different permissions. Keeping this as one
// closed table means a downstream module asks this file rather than re-deriving the answer, and a
// new permission is a change in one place with one test.
//
// The load-bearing restriction is that a *visual-only* capture may never support a structural claim.
// A screenshot of a nice card does not measure that the card's padding is 16px, and a design built
// from "the spacing looks 8-ish" is the derivative failure the transfer boundary exists to prevent.
// That is enforced here by refusing the claim, and downstream by `measurementCoverage`.

export const REFERENCE_SCOPE_SCHEMA = 'reference-scope-v1' as const;

/** Whole page or part of one. */
export const REFERENCE_SCOPES = ['whole', 'part'] as const;
export type ReferenceScope = (typeof REFERENCE_SCOPES)[number];

/** Measured by DOM/geometry, or judged from the image alone. */
export const REFERENCE_EVIDENCE_KINDS = ['measured', 'visual-only'] as const;
export type ReferenceEvidenceKind = (typeof REFERENCE_EVIDENCE_KINDS)[number];

export type ReferenceGrade = Readonly<{
  scope: ReferenceScope;
  evidence: ReferenceEvidenceKind;
}>;

/**
 * What each combination is for and what it may transfer. `pixelsInProduction` is the hard rights
 * line: an unmeasured capture is study material for direction, never shipped bytes.
 */
export type ReferenceGradeRule = Readonly<{
  purpose: string;
  structuralClaims: boolean;
  transfers: readonly string[];
  pixelsInProduction: boolean;
  roles: readonly ReferenceRole[];
}>;

export const REFERENCE_ROLES = ['component', 'craft', 'mood'] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];

export const REFERENCE_GRADE_RULES: Readonly<Record<string, ReferenceGradeRule>> = Object.freeze({
  'whole:visual-only': Object.freeze({
    purpose: 'direction and mood, read from a whole rendered artifact',
    structuralClaims: false,
    transfers: Object.freeze(['declared visual qualities', 'palette direction', 'material impression']),
    pixelsInProduction: false,
    roles: Object.freeze(['mood'] as const),
  }),
  'whole:measured': Object.freeze({
    purpose: 'whole-page structure where the page itself is the unit of study',
    structuralClaims: true,
    transfers: Object.freeze(['measured invariants', 'page-level composition']),
    pixelsInProduction: false,
    roles: Object.freeze(['component'] as const),
  }),
  'part:measured': Object.freeze({
    purpose: 'the component anatomy and geometry a build can be held to',
    structuralClaims: true,
    transfers: Object.freeze(['measured invariants', 'geometry', 'component anatomy']),
    pixelsInProduction: false,
    roles: Object.freeze(['component', 'craft'] as const),
  }),
  'part:visual-only': Object.freeze({
    purpose: 'detail and treatment read from a crop or supplied image',
    structuralClaims: false,
    transfers: Object.freeze(['geometry', 'principles']),
    pixelsInProduction: false,
    roles: Object.freeze(['craft', 'mood'] as const),
  }),
});

export type ReferenceScopeErrorCode =
  | 'MALFORMED_REFERENCE_GRADE'
  | 'VISUAL_ONLY_STRUCTURAL_CLAIM'
  | 'REFERENCE_ROLE_NOT_PERMITTED';

export class ReferenceScopeError extends Error {
  override readonly name = 'ReferenceScopeError';
  readonly code: ReferenceScopeErrorCode;
  constructor(code: ReferenceScopeErrorCode, reason: string) {
    super(`reference scope is invalid: ${reason}`);
    this.code = code;
  }
}

const fail = (code: ReferenceScopeErrorCode, reason: string): never => { throw new ReferenceScopeError(code, reason); };
export const gradeKey = (grade: ReferenceGrade): string => `${grade.scope}:${grade.evidence}`;

export function parseReferenceGrade(value: unknown): ReferenceGrade {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('MALFORMED_REFERENCE_GRADE', 'a grade must be an object');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('scope') || !keys.includes('evidence')) {
    return fail('MALFORMED_REFERENCE_GRADE', 'a grade has exactly scope and evidence');
  }
  const { scope, evidence } = record;
  if (!REFERENCE_SCOPES.includes(scope as ReferenceScope)) {
    return fail('MALFORMED_REFERENCE_GRADE', 'scope must be whole or part');
  }
  if (!REFERENCE_EVIDENCE_KINDS.includes(evidence as ReferenceEvidenceKind)) {
    return fail('MALFORMED_REFERENCE_GRADE', 'evidence must be measured or visual-only');
  }
  return Object.freeze({ scope: scope as ReferenceScope, evidence: evidence as ReferenceEvidenceKind });
}

export function referenceGradeRule(grade: ReferenceGrade): ReferenceGradeRule {
  const rule = REFERENCE_GRADE_RULES[gradeKey(grade)];
  if (rule === undefined) return fail('MALFORMED_REFERENCE_GRADE', `no rule for ${gradeKey(grade)}`);
  return rule;
}

/**
 * The guard a downstream module calls before it writes a structural statement. Called with the
 * grade of the evidence and the field being claimed, so the failure names both.
 */
export function requireStructuralClaim(grade: ReferenceGrade, claim: string): void {
  if (!referenceGradeRule(grade).structuralClaims) {
    return fail(
      'VISUAL_ONLY_STRUCTURAL_CLAIM',
      `${gradeKey(grade)} evidence cannot support the structural claim "${claim}": a ${grade.evidence} capture records appearance, not measurement. Measure the specific component with a selector-bound capture, or state the property as a declared quality instead`,
    );
  }
}

export function requireRole(grade: ReferenceGrade, role: ReferenceRole): void {
  const rule = referenceGradeRule(grade);
  if (!rule.roles.includes(role)) {
    return fail(
      'REFERENCE_ROLE_NOT_PERMITTED',
      `${gradeKey(grade)} evidence cannot serve the ${role} role; permitted roles are ${rule.roles.join(', ')}`,
    );
  }
}

/**
 * A mood capture is study material by construction: `omd ref mood` keeps the bytes in the mood
 * store and downstream code refuses any mood path or digest in production.
 */
export function isStudyOnly(grade: ReferenceGrade): boolean {
  return grade.evidence === 'visual-only' || grade.scope === 'whole';
}

export function parseReferenceRole(value: unknown): ReferenceRole {
  if (!REFERENCE_ROLES.includes(value as ReferenceRole)) {
    return fail('REFERENCE_ROLE_NOT_PERMITTED', `role must be one of ${REFERENCE_ROLES.join(', ')}`);
  }
  return value as ReferenceRole;
}
