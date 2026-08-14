import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import {
  digest,
  fields,
  oneOf,
  receipt,
  sameReceipts,
  text,
  values,
  type ArtifactReceipt,
} from './proof-primitives.ts';
import {
  DESIGN_REVIEW_SCHEMA,
  normalizeReviewInputs,
  parseDesignReviewIdentity,
  reviewIdentityIsFresh,
  structureReviewSha256,
  validateStructureReviewShape,
  type DesignReviewFinding,
  type DesignReviewIdentity,
  type DesignReviewSeverity,
  type StructureReview,
} from './structure-review.ts';

export const EXPRESSION_REVIEW_AXES = Object.freeze([
  'typography', 'color', 'media', 'material', 'motion', 'craft', 'structure-regression',
] as const);
export type ExpressionReviewAxis = (typeof EXPRESSION_REVIEW_AXES)[number];
export type ExpressionReview = Readonly<{
  schema: typeof DESIGN_REVIEW_SCHEMA;
  lens: 'expression';
  planSha256: string;
  structureReview: ArtifactReceipt<typeof DESIGN_REVIEW_SCHEMA> | null;
  reviewer: DesignReviewIdentity & Readonly<{ actor: 'independent-reviewer' }>;
  inputs: readonly ArtifactReceipt[];
  verdict: 'pass' | 'revise';
  findings: readonly DesignReviewFinding<ExpressionReviewAxis>[];
  invalidatesStructureReviewSha256: string | null;
  authority: 'workflow-support-only';
  cannotSubstitute: readonly ['final-v2'];
}>;
type CurrentStructureReview = Readonly<{
  receipt: ArtifactReceipt<typeof DESIGN_REVIEW_SCHEMA>;
  value: StructureReview;
}>;
type ExpressionReviewCurrentBase = Readonly<{
  planSha256: string;
  producer: DesignReviewIdentity;
  inputs: readonly ArtifactReceipt[];
  usedReviewerIdentities: readonly DesignReviewIdentity[];
}>;
export type ExpressionReviewCurrent = ExpressionReviewCurrentBase & (
  | Readonly<{ structureReviewSelected: true; structureReview: CurrentStructureReview }>
  | Readonly<{ structureReviewSelected: false; structureReview?: never }>
);
export type DesignExpressionReviewErrorCode =
  | 'EXPRESSION_REVIEW_MALFORMED'
  | 'EXPRESSION_REVIEW_STALE_PLAN'
  | 'EXPRESSION_REVIEW_STALE_INPUT'
  | 'EXPRESSION_REVIEW_STRUCTURE_REQUIRED'
  | 'EXPRESSION_REVIEW_STALE_STRUCTURE'
  | 'EXPRESSION_REVIEW_STRUCTURE_NOT_PASSED'
  | 'EXPRESSION_REVIEW_REUSED_IDENTITY'
  | 'EXPRESSION_REVIEW_VERDICT_MISMATCH'
  | 'EXPRESSION_REVIEW_INVALIDATION_REQUIRED'
  | 'EXPRESSION_REVIEW_INVALIDATION_MISMATCH';

export class DesignExpressionReviewError extends Error {
  override readonly name = 'DesignExpressionReviewError';
  readonly code: DesignExpressionReviewErrorCode;

  constructor(code: DesignExpressionReviewErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}

const fail = (code: DesignExpressionReviewErrorCode, message?: string): never => { throw new DesignExpressionReviewError(code, message); };
const malformed = (message: string): never => fail('EXPRESSION_REVIEW_MALFORMED', message);

function parseFinding(value: unknown, index: number): DesignReviewFinding<ExpressionReviewAxis> {
  const label = `findings[${index}]`;
  const item = fields(value, ['axis', 'severity', 'evidence'], label, malformed);
  return Object.freeze({
    axis: oneOf(item.get('axis'), EXPRESSION_REVIEW_AXES, `${label}.axis`, malformed),
    severity: oneOf(item.get('severity'), ['blocking', 'advisory'] as const, `${label}.severity`, malformed) as DesignReviewSeverity,
    evidence: text(item.get('evidence'), `${label}.evidence`, malformed),
  });
}

function supportingAuthority(authority: unknown, cannotSubstitute: unknown): readonly ['final-v2'] {
  if (authority !== 'workflow-support-only') malformed('expression review cannot hold final publication authority');
  const blocked = values(cannotSubstitute, 'cannotSubstitute', malformed);
  if (blocked.length !== 1 || blocked[0] !== 'final-v2') malformed('expression review must declare that it cannot substitute final-v2');
  return Object.freeze(['final-v2'] as const);
}

function bindStructureReview(
  raw: unknown,
  current: ExpressionReviewCurrent,
  planSha256: string,
): { receipt: ArtifactReceipt<typeof DESIGN_REVIEW_SCHEMA> | null; review?: StructureReview } {
  if (!current.structureReviewSelected) {
    if (raw !== null) fail('EXPRESSION_REVIEW_STALE_STRUCTURE');
    return { receipt: null };
  }
  if (raw === null) fail('EXPRESSION_REVIEW_STRUCTURE_REQUIRED');
  const bound = receipt(raw, 'structureReview', malformed);
  if (bound.schema !== DESIGN_REVIEW_SCHEMA) fail('EXPRESSION_REVIEW_STALE_STRUCTURE');
  let review: StructureReview;
  try { review = validateStructureReviewShape(current.structureReview.value); } catch {
    return fail('EXPRESSION_REVIEW_STRUCTURE_NOT_PASSED');
  }
  if (review.verdict !== 'pass') fail('EXPRESSION_REVIEW_STRUCTURE_NOT_PASSED');
  const expected = receipt(current.structureReview.receipt, 'current.structureReview.receipt', malformed);
  if (expected.schema !== DESIGN_REVIEW_SCHEMA
    || expected.sha256 !== structureReviewSha256(review)
    || review.planSha256 !== planSha256
    || bound.path !== expected.path
    || bound.schema !== expected.schema
    || bound.sha256 !== expected.sha256) {
    fail('EXPRESSION_REVIEW_STALE_STRUCTURE');
  }
  return { receipt: bound as ArtifactReceipt<typeof DESIGN_REVIEW_SCHEMA>, review };
}

export function parseExpressionReview(value: unknown, current: ExpressionReviewCurrent): ExpressionReview {
  try {
    const root = fields(value, [
      'schema', 'lens', 'planSha256', 'structureReview', 'reviewer', 'inputs', 'verdict', 'findings',
      'invalidatesStructureReviewSha256', 'authority', 'cannotSubstitute',
    ], 'expression review', malformed);
    if (root.get('schema') !== DESIGN_REVIEW_SCHEMA || root.get('lens') !== 'expression') malformed('expression review identity is invalid');
    const planSha256 = digest(root.get('planSha256'), 'planSha256', malformed);
    if (planSha256 !== digest(current.planSha256, 'current.planSha256', malformed)) fail('EXPRESSION_REVIEW_STALE_PLAN');
    const structure = bindStructureReview(root.get('structureReview'), current, planSha256);
    const reviewer = parseDesignReviewIdentity(root.get('reviewer'), 'reviewer', malformed);
    if (reviewer.actor !== 'independent-reviewer') fail('EXPRESSION_REVIEW_REUSED_IDENTITY');
    const producer = parseDesignReviewIdentity(current.producer, 'current.producer', malformed);
    const prior = current.usedReviewerIdentities.map((item, index) => parseDesignReviewIdentity(item, `current.usedReviewerIdentities[${index}]`, malformed));
    const identities = structure.review === undefined ? [producer, ...prior] : [producer, structure.review.reviewer, ...prior];
    if (!reviewIdentityIsFresh(reviewer, identities)) fail('EXPRESSION_REVIEW_REUSED_IDENTITY');
    const inputs = normalizeReviewInputs(root.get('inputs'), 'inputs', malformed);
    const expectedInputs = normalizeReviewInputs(current.inputs, 'current.inputs', malformed);
    if (!sameReceipts(inputs, expectedInputs)) fail('EXPRESSION_REVIEW_STALE_INPUT');
    const findings = Object.freeze(values(root.get('findings'), 'findings', malformed).map(parseFinding));
    const verdict = oneOf(root.get('verdict'), ['pass', 'revise'], 'verdict', malformed);
    const hasBlocking = findings.some((item) => item.severity === 'blocking');
    if ((verdict === 'pass' && hasBlocking) || (verdict === 'revise' && !hasBlocking)) fail('EXPRESSION_REVIEW_VERDICT_MISMATCH');
    const regression = findings.some((item) => item.axis === 'structure-regression' && item.severity === 'blocking');
    const rawInvalidation = root.get('invalidatesStructureReviewSha256');
    const invalidation = rawInvalidation === null ? null : digest(rawInvalidation, 'invalidatesStructureReviewSha256', malformed);
    if (regression) {
      const structureReceipt = structure.receipt ?? fail('EXPRESSION_REVIEW_INVALIDATION_REQUIRED');
      if (invalidation === null) fail('EXPRESSION_REVIEW_INVALIDATION_REQUIRED');
      if (invalidation !== structureReceipt.sha256) fail('EXPRESSION_REVIEW_INVALIDATION_MISMATCH');
    } else if (invalidation !== null) {
      fail('EXPRESSION_REVIEW_INVALIDATION_MISMATCH');
    }
    const cannotSubstitute = supportingAuthority(root.get('authority'), root.get('cannotSubstitute'));
    return Object.freeze({
      schema: DESIGN_REVIEW_SCHEMA,
      lens: 'expression',
      planSha256,
      structureReview: structure.receipt,
      reviewer: reviewer as ExpressionReview['reviewer'],
      inputs,
      verdict,
      findings,
      invalidatesStructureReviewSha256: invalidation,
      authority: 'workflow-support-only',
      cannotSubstitute,
    });
  } catch (error) {
    if (error instanceof DesignExpressionReviewError) throw error;
    return fail('EXPRESSION_REVIEW_MALFORMED', 'expression review input could not be inspected safely');
  }
}

export function expressionReviewSha256(value: ExpressionReview): string {
  return sha256(canonicalJson(value));
}
