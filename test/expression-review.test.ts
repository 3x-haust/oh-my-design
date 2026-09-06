import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  DESIGN_REVIEW_SCHEMA,
  parseStructureReview,
  structureReviewSha256,
  type DesignReviewIdentity,
} from '../core/design-development/structure-review.ts';
import {
  DesignExpressionReviewError,
  expressionReviewSha256,
  parseExpressionReview,
  type DesignExpressionReviewErrorCode,
} from '../core/design-development/expression-review.ts';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const identity = (id: string, actor: 'artifact-producer' | 'independent-reviewer') => ({
  actor, id, processId: `process:${id}`, sessionId: `session:${id}`, nonce: `nonce:${id}`,
  configurationSha256: sha(`configuration:${id}`),
});
const planSha256 = sha('workflow-plan');
const structuralInputs = () => [{ path: '.omd/workflow/structure.json', schema: 'structural-wireframe-v1', sha256: sha('structure') }];
const structureValue = () => parseStructureReview({
  schema: DESIGN_REVIEW_SCHEMA, lens: 'structure', planSha256,
  reviewer: identity('structure-reviewer', 'independent-reviewer'), inputs: structuralInputs(), verdict: 'pass', findings: [],
  authority: 'workflow-support-only', cannotSubstitute: ['final-v2'],
}, {
  planSha256, producer: identity('structure-producer', 'artifact-producer'), inputs: structuralInputs(), usedReviewerIdentities: [],
});
const structureReceipt = () => ({
  path: '.omd/workflow/structure-review.json', schema: DESIGN_REVIEW_SCHEMA,
  sha256: structureReviewSha256(structureValue()),
});
const inputs = () => [
  { path: '.omd/workflow/styled-desktop.png', schema: 'styled-render-v1', sha256: sha('styled desktop') },
  { path: '.omd/workflow/type-proof.json', schema: 'typography-proof-v1', sha256: sha('type proof') },
];
const current = () => ({
  planSha256, producer: identity('expression-producer', 'artifact-producer'), inputs: inputs(),
  structureReviewSelected: true as const,
  structureReview: { receipt: structureReceipt(), value: structureValue() },
  usedReviewerIdentities: [] as DesignReviewIdentity[],
});
const valid = () => ({
  schema: DESIGN_REVIEW_SCHEMA, lens: 'expression', planSha256,
  structureReview: structureReceipt(), reviewer: identity('expression-reviewer', 'independent-reviewer'),
  inputs: inputs(), verdict: 'pass',
  findings: [{ axis: 'typography', severity: 'advisory', evidence: 'The production-like tail content remains legible without hierarchy loss.' }],
  invalidatesStructureReviewSha256: null as string | null,
  authority: 'workflow-support-only', cannotSubstitute: ['final-v2'],
});

function throwsCode(run: () => unknown, code: DesignExpressionReviewErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof DesignExpressionReviewError);
    assert.equal(error.code, code);
    return true;
  });
}

test('selected expression review requires the exact current passing structure review', () => {
  const parsed = parseExpressionReview(valid(), current());
  assert.equal(parsed.structureReview?.sha256, structureReceipt().sha256);
  assert.match(expressionReviewSha256(parsed), /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(parsed), true);

  const missing = valid();
  missing.structureReview = null as never;
  throwsCode(() => parseExpressionReview(missing, current()), 'EXPRESSION_REVIEW_STRUCTURE_REQUIRED');

  const stale = valid();
  stale.structureReview.sha256 = sha('stale structure review');
  throwsCode(() => parseExpressionReview(stale, current()), 'EXPRESSION_REVIEW_STALE_STRUCTURE');

  const reviseValue = { ...structureValue(), verdict: 'revise' as const, findings: [{ axis: 'task-flow' as const, severity: 'blocking' as const, evidence: 'Task flow is blocked.' }] };
  throwsCode(() => parseExpressionReview(valid(), {
    ...current(), structureReview: { receipt: { ...structureReceipt(), sha256: structureReviewSha256(reviseValue) }, value: reviseValue },
  }), 'EXPRESSION_REVIEW_STRUCTURE_NOT_PASSED');
});

test('expression review does not require a structure receipt when structure review was not selected', () => {
  const source = { ...valid(), structureReview: null };
  const parsed = parseExpressionReview(source, {
    planSha256, producer: identity('expression-producer', 'artifact-producer'), inputs: inputs(),
    structureReviewSelected: false as const, usedReviewerIdentities: [],
  });
  assert.equal(parsed.structureReview, null);
});

test('expression can issue an exact structure-regression invalidation but cannot silently pass it', () => {
  const regression = valid();
  regression.verdict = 'revise';
  regression.findings = [{
    axis: 'structure-regression', severity: 'blocking',
    evidence: 'Styled type expansion moves the primary action before required scope context.',
  }];
  regression.invalidatesStructureReviewSha256 = structureReceipt().sha256;
  const parsed = parseExpressionReview(regression, current());
  assert.equal(parsed.invalidatesStructureReviewSha256, structureReceipt().sha256);

  const silent = { ...regression, invalidatesStructureReviewSha256: null };
  throwsCode(() => parseExpressionReview(silent, current()), 'EXPRESSION_REVIEW_INVALIDATION_REQUIRED');

  const invented = valid();
  invented.invalidatesStructureReviewSha256 = structureReceipt().sha256;
  throwsCode(() => parseExpressionReview(invented, current()), 'EXPRESSION_REVIEW_INVALIDATION_MISMATCH');
});

test('expression reviewer is fresh from the producer, structure reviewer, and every prior reviewer identity', () => {
  const structureReviewer = structureValue().reviewer;
  for (const field of ['id', 'processId', 'sessionId', 'nonce', 'configurationSha256'] as const) {
    const reused = valid();
    reused.reviewer[field] = structureReviewer[field];
    throwsCode(() => parseExpressionReview(reused, current()), 'EXPRESSION_REVIEW_REUSED_IDENTITY');
  }

  const prior = identity('prior-reviewer', 'independent-reviewer');
  const reusedPrior = valid();
  reusedPrior.reviewer.nonce = prior.nonce;
  throwsCode(() => parseExpressionReview(reusedPrior, { ...current(), usedReviewerIdentities: [prior] }), 'EXPRESSION_REVIEW_REUSED_IDENTITY');
});

test('expression review binds current full-expression inputs and remains supporting-only, never final-v2', () => {
  const stale = valid();
  stale.inputs[0]!.sha256 = sha('stale styled render');
  throwsCode(() => parseExpressionReview(stale, current()), 'EXPRESSION_REVIEW_STALE_INPUT');

  const falsePass = valid();
  falsePass.findings[0]!.severity = 'blocking';
  throwsCode(() => parseExpressionReview(falsePass, current()), 'EXPRESSION_REVIEW_VERDICT_MISMATCH');

  const authority = valid();
  authority.cannotSubstitute = [];
  throwsCode(() => parseExpressionReview(authority, current()), 'EXPRESSION_REVIEW_MALFORMED');
});

test('expression review can block greenfield concept theatre as authenticity evidence', () => {
  const reality = valid();
  reality.verdict = 'revise';
  reality.findings = [{
    axis: 'authenticity',
    severity: 'blocking',
    evidence: 'The sharp product render invents a case number and documentary annotation absent from the brief.',
  }];
  const parsed = parseExpressionReview(reality, current());
  assert.equal(parsed.findings[0]?.axis, 'authenticity');
  assert.equal(parsed.verdict, 'revise');
});
