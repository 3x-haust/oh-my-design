import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFirstRenderReview, FIRST_RENDER_REVIEW_HANDBACK } from '../core/design/first-render-review-contract.ts';
import { DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-design-quality.ts';

const bindings = {
  buildSha256: 'a'.repeat(64), briefSha256: 'b'.repeat(64), evidenceSha256: 'c'.repeat(64),
  browserSha256: 'd'.repeat(64), captureReportSha256: 'e'.repeat(64), previousReviewSha256: null,
};
const finding = {
  id: 'primary-action', viewport: 'mobile' as const,
  axis: 'usability' as const, repairScope: 'surface' as const,
  observation: 'The primary control wraps into three short lines.',
  consequence: 'The action becomes difficult to read.',
  repairCriterion: 'Keep the complete action label readable without token-internal wrapping.',
};
const captures = [
  { viewport: 'desktop' as const, captureSha256: '1'.repeat(64) },
  { viewport: 'mobile' as const, captureSha256: '2'.repeat(64) },
];
const assessments = () => DESIGN_QUALITY_AXES.flatMap(axis => captures.map(capture => ({
  axis, ...capture, verdict: 'pass',
  observation: 'The work object has clear grouping and readable controls.',
  consequence: 'The task and next action remain visible.',
})));
const handback = (fields: object) => ({
  schema: FIRST_RENDER_REVIEW_HANDBACK, fixedBindings: bindings, decision: 'retain',
  qualityAssessments: assessments(), findings: [], resolvedFindings: [], ...fields,
});

test('an empty finding list cannot stand in for actual quality assessment', () => {
  assert.throws(() => parseFirstRenderReview({
    schema: FIRST_RENDER_REVIEW_HANDBACK, fixedBindings: bindings, decision: 'retain',
    findings: [], resolvedFindingIds: [],
  }, bindings, [], captures));
});

test('an early semantic review can request a concrete repair independently of advisory scores', () => {
  const qualityAssessments = assessments();
  Object.assign(qualityAssessments.find(row => row.axis === 'usability' && row.viewport === 'mobile') ?? {}, { verdict: 'fail' });
  const review = parseFirstRenderReview(handback({ decision: 'revise', findings: [finding], qualityAssessments }), bindings, [], captures);
  assert.equal(review.decision, 'revise');
  assert.deepEqual(review.findings, [finding]);
});

test('fresh review explicitly resolves prior findings and cannot silently forget them', () => {
  assert.throws(() => parseFirstRenderReview(handback({}), bindings, [finding], captures), /reconciled/);
  const resolved = { id: finding.id, evidence: [{
    ...captures[1], observation: 'The complete action now fits on one readable line.',
  }] };
  assert.equal(parseFirstRenderReview(handback({ resolvedFindings: [resolved] }), bindings, [finding], captures).decision, 'retain');
  assert.throws(() => parseFirstRenderReview(handback({ resolvedFindings: [{ ...resolved, id: 'invented' }] }), bindings, [finding], captures), /reconciled/);
  assert.throws(() => parseFirstRenderReview(handback({ resolvedFindings: [{ id: finding.id, evidence: [] }] }), bindings, [finding], captures), /resolution/);
});

test('retain cannot carry unresolved findings or use different capture evidence', () => {
  assert.throws(() => parseFirstRenderReview(handback({ findings: [finding] }), bindings, [], captures), /contradicts/);
  assert.throws(() => parseFirstRenderReview(handback({
    fixedBindings: { ...bindings, captureReportSha256: 'f'.repeat(64) },
  }), bindings, [], captures), /bindings/);
});

test('every quality axis needs both current captures and cannot use unrelated pixels', () => {
  assert.equal(parseFirstRenderReview(handback({}), bindings, [], captures).decision, 'retain');
  const incomplete = assessments();
  incomplete.pop();
  assert.throws(() => parseFirstRenderReview(handback({ qualityAssessments: incomplete }), bindings, [], captures), /quality/);
  const wrong = assessments();
  Object.assign(wrong[0] ?? {}, { captureSha256: '9'.repeat(64) });
  assert.throws(() => parseFirstRenderReview(handback({ qualityAssessments: wrong }), bindings, [], captures), /quality/);
});

test('aesthetic failure cannot be compensated by passing functional dimensions', () => {
  const qualityAssessments = assessments();
  Object.assign(qualityAssessments.find(row => row.axis === 'beautyDesirability' && row.viewport === 'desktop') ?? {}, { verdict: 'fail' });
  const beauty = { ...finding, id: 'fragmented-work', axis: 'beautyDesirability',
    viewport: 'desktop', repairScope: 'composition' };
  assert.throws(() => parseFirstRenderReview(handback({ qualityAssessments }), bindings, [], captures));
  assert.throws(() => parseFirstRenderReview(handback({ qualityAssessments, findings: [beauty], decision: 'revise' }), bindings, [], captures), /reframe/);
  assert.equal(parseFirstRenderReview(handback({ qualityAssessments, findings: [beauty], decision: 'reframe' }), bindings, [], captures).decision, 'reframe');
});
