import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import {
  digest,
  fields,
  oneOf,
  receipts,
  sameReceipts,
  text,
  token,
  values,
  type ArtifactReceipt,
} from './proof-primitives.ts';

export const DESIGN_REVIEW_SCHEMA = 'design-review-v1' as const;
export const STRUCTURE_REVIEW_AXES = Object.freeze([
  'task-flow', 'hierarchy', 'content-accommodation', 'state-reachability', 'responsive-order', 'semantics',
  'benchmark-fit', 'domain-specificity',
] as const);
export type StructureReviewAxis = (typeof STRUCTURE_REVIEW_AXES)[number];
export type DesignReviewSeverity = 'blocking' | 'advisory';
export type DesignReviewIdentity = Readonly<{
  actor: 'artifact-producer' | 'independent-reviewer';
  id: string;
  processId: string;
  sessionId: string;
  nonce: string;
  configurationSha256: string;
}>;
export type DesignReviewFinding<A extends string> = Readonly<{
  axis: A;
  severity: DesignReviewSeverity;
  evidence: string;
}>;
export type StructureReview = Readonly<{
  schema: typeof DESIGN_REVIEW_SCHEMA;
  lens: 'structure';
  planSha256: string;
  reviewer: DesignReviewIdentity & Readonly<{ actor: 'independent-reviewer' }>;
  inputs: readonly ArtifactReceipt[];
  verdict: 'pass' | 'revise';
  findings: readonly DesignReviewFinding<StructureReviewAxis>[];
  authority: 'workflow-support-only';
  cannotSubstitute: readonly ['final-v2'];
}>;
export type StructureReviewCurrent = Readonly<{
  planSha256: string;
  producer: DesignReviewIdentity;
  inputs: readonly ArtifactReceipt[];
  usedReviewerIdentities: readonly DesignReviewIdentity[];
}>;
export type DesignStructureReviewErrorCode =
  | 'STRUCTURE_REVIEW_MALFORMED'
  | 'STRUCTURE_REVIEW_STALE_PLAN'
  | 'STRUCTURE_REVIEW_STALE_INPUT'
  | 'STRUCTURE_REVIEW_EXPRESSION_INPUT'
  | 'STRUCTURE_REVIEW_EXPRESSION_AXIS'
  | 'STRUCTURE_REVIEW_REUSED_IDENTITY'
  | 'STRUCTURE_REVIEW_VERDICT_MISMATCH';

export class DesignStructureReviewError extends Error {
  override readonly name = 'DesignStructureReviewError';
  readonly code: DesignStructureReviewErrorCode;

  constructor(code: DesignStructureReviewErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}

const fail = (code: DesignStructureReviewErrorCode, message?: string): never => { throw new DesignStructureReviewError(code, message); };
const malformed = (message: string): never => fail('STRUCTURE_REVIEW_MALFORMED', message);
const STRUCTURAL_INPUT_SCHEMAS = new Set([
  'content-state-model-v1',
  'design-development-content-state-model-v1',
  'structural-wireframe-v1',
  'design-development-structural-wireframe-v1',
  'component-stress-proof-v1',
  'design-development-component-stress-proof-v1',
  'semantic-tree-v1',
  'monochrome-structural-render-v1',
]);
const EXPRESSION_AXES = new Set(['typography', 'color', 'media', 'material', 'motion', 'craft', 'structure-regression']);
const IDENTITY_FIELDS = ['id', 'processId', 'sessionId', 'nonce', 'configurationSha256'] as const;

export function parseDesignReviewIdentity(value: unknown, label: string, onMalformed: (message: string) => never): DesignReviewIdentity {
  const item = fields(value, ['actor', 'id', 'processId', 'sessionId', 'nonce', 'configurationSha256'], label, onMalformed);
  return Object.freeze({
    actor: oneOf(item.get('actor'), ['artifact-producer', 'independent-reviewer'], `${label}.actor`, onMalformed),
    id: token(item.get('id'), `${label}.id`, onMalformed),
    processId: token(item.get('processId'), `${label}.processId`, onMalformed),
    sessionId: token(item.get('sessionId'), `${label}.sessionId`, onMalformed),
    nonce: token(item.get('nonce'), `${label}.nonce`, onMalformed),
    configurationSha256: digest(item.get('configurationSha256'), `${label}.configurationSha256`, onMalformed),
  });
}

export function reviewIdentityIsFresh(reviewer: DesignReviewIdentity, identities: readonly DesignReviewIdentity[]): boolean {
  return identities.every((identity) => IDENTITY_FIELDS.every((field) => reviewer[field] !== identity[field]));
}

function parseFinding(value: unknown, index: number): DesignReviewFinding<StructureReviewAxis> {
  const label = `findings[${index}]`;
  const item = fields(value, ['axis', 'severity', 'evidence'], label, malformed);
  const rawAxis = text(item.get('axis'), `${label}.axis`, malformed);
  if (EXPRESSION_AXES.has(rawAxis)) fail('STRUCTURE_REVIEW_EXPRESSION_AXIS');
  if (!STRUCTURE_REVIEW_AXES.includes(rawAxis as StructureReviewAxis)) malformed(`${label}.axis is invalid`);
  return Object.freeze({
    axis: rawAxis as StructureReviewAxis,
    severity: oneOf(item.get('severity'), ['blocking', 'advisory'], `${label}.severity`, malformed),
    evidence: text(item.get('evidence'), `${label}.evidence`, malformed),
  });
}

function supportingAuthority(authority: unknown, cannotSubstitute: unknown): readonly ['final-v2'] {
  if (authority !== 'workflow-support-only') malformed('review cannot hold final publication authority');
  const blocked = values(cannotSubstitute, 'cannotSubstitute', malformed);
  if (blocked.length !== 1 || blocked[0] !== 'final-v2') malformed('review must declare that it cannot substitute final-v2');
  return Object.freeze(['final-v2'] as const);
}

export function normalizeReviewInputs(value: unknown, label: string, onMalformed: (message: string) => never): readonly ArtifactReceipt[] {
  return receipts(value, label, onMalformed);
}

export function validateStructureReviewShape(value: unknown): StructureReview {
  const root = fields(value, ['schema', 'lens', 'planSha256', 'reviewer', 'inputs', 'verdict', 'findings', 'authority', 'cannotSubstitute'], 'structure review', malformed);
  if (root.get('schema') !== DESIGN_REVIEW_SCHEMA || root.get('lens') !== 'structure') malformed('structure review identity is invalid');
  const planSha256 = digest(root.get('planSha256'), 'planSha256', malformed);
  const reviewer = parseDesignReviewIdentity(root.get('reviewer'), 'reviewer', malformed);
  if (reviewer.actor !== 'independent-reviewer') fail('STRUCTURE_REVIEW_REUSED_IDENTITY');
  const inputs = normalizeReviewInputs(root.get('inputs'), 'inputs', malformed);
  if (inputs.some((item) => !STRUCTURAL_INPUT_SCHEMAS.has(item.schema))) fail('STRUCTURE_REVIEW_EXPRESSION_INPUT');
  const findings = Object.freeze(values(root.get('findings'), 'findings', malformed).map(parseFinding));
  const verdict = oneOf(root.get('verdict'), ['pass', 'revise'], 'verdict', malformed);
  const hasBlocking = findings.some((item) => item.severity === 'blocking');
  if ((verdict === 'pass' && hasBlocking) || (verdict === 'revise' && !hasBlocking)) fail('STRUCTURE_REVIEW_VERDICT_MISMATCH');
  const cannotSubstitute = supportingAuthority(root.get('authority'), root.get('cannotSubstitute'));
  return Object.freeze({
    schema: DESIGN_REVIEW_SCHEMA,
    lens: 'structure',
    planSha256,
    reviewer: reviewer as StructureReview['reviewer'],
    inputs,
    verdict,
    findings,
    authority: 'workflow-support-only',
    cannotSubstitute,
  });
}

export function parseStructureReview(value: unknown, current: StructureReviewCurrent): StructureReview {
  try {
    const parsed = validateStructureReviewShape(value);
    if (parsed.planSha256 !== digest(current.planSha256, 'current.planSha256', malformed)) fail('STRUCTURE_REVIEW_STALE_PLAN');
    const producer = parseDesignReviewIdentity(current.producer, 'current.producer', malformed);
    const prior = current.usedReviewerIdentities.map((item, index) => parseDesignReviewIdentity(item, `current.usedReviewerIdentities[${index}]`, malformed));
    if (!reviewIdentityIsFresh(parsed.reviewer, [producer, ...prior])) fail('STRUCTURE_REVIEW_REUSED_IDENTITY');
    const expectedInputs = normalizeReviewInputs(current.inputs, 'current.inputs', malformed);
    if (!sameReceipts(parsed.inputs, expectedInputs)) fail('STRUCTURE_REVIEW_STALE_INPUT');
    return parsed;
  } catch (error) {
    if (error instanceof DesignStructureReviewError) throw error;
    return fail('STRUCTURE_REVIEW_MALFORMED', 'structure review input could not be inspected safely');
  }
}

export function structureReviewSha256(value: StructureReview): string {
  return sha256(canonicalJson(value));
}
