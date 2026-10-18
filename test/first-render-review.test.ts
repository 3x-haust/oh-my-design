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
const previousCaptures = [
  { viewport: 'desktop' as const, captureSha256: '3'.repeat(64) },
  { viewport: 'mobile' as const, captureSha256: '4'.repeat(64) },
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

test('consulted originals cannot be retained without a capture-bound reference comparison', () => {
  const withReferences = { ...bindings, consultedReferencesSha256: 'f'.repeat(64) };
  assert.throws(() => parseFirstRenderReview(
    handback({ fixedBindings: withReferences }), withReferences, [], captures,
  ), /reference comparison/);
});

test('primary comparison binds both captures and unresolved fidelity prevents retain', () => {
  const withReferences = { ...bindings, consultedReferencesSha256: 'f'.repeat(64) };
  const references = [{ captureSha256: '3'.repeat(64), referenceRole: 'primary' as const },
    { captureSha256: '4'.repeat(64), referenceRole: 'supplemental' as const }];
  const comparisons = captures.map(capture => ({
    ...capture, referenceSha256: references[0]?.captureSha256, verdict: 'pass',
    sourceIdentity: 'Light sans-serif type and inset horizontal article groups.',
    preservedTraits: ['Type character, inset grouping and relative scale'], departures: [], findingIds: [],
  }));
  const input = handback({ fixedBindings: withReferences, referenceComparisons: comparisons });
  const parse = (value: unknown) => parseFirstRenderReview(value, withReferences, [], captures, references);
  assert.equal(parse(input).decision, 'retain');
  assert.throws(() => parse({ ...input, referenceComparisons: comparisons.slice(1) }), /reference comparison/);
  assert.throws(() => parse({ ...input, referenceComparisons: [comparisons[0], comparisons[0]] }), /capture binding/);
  assert.throws(() => parse({ ...input, referenceComparisons: comparisons.map(row => ({
    ...row, referenceSha256: references[1]?.captureSha256,
  })) }), /capture binding/);
  assert.throws(() => parse({ ...input, referenceComparisons: comparisons.map(row => ({
    ...row, captureSha256: '9'.repeat(64),
  })) }), /capture binding/);
  for (const verdict of ['fail', 'insufficient']) {
    assert.throws(() => parse({ ...input, referenceComparisons: comparisons.map(row => ({
      ...row, verdict,
    })) }), /unresolved finding/);
  }
  const qualityAssessments = assessments().map(row => row.axis === 'hierarchyComposition'
    ? { ...row, verdict: 'fail' } : row);
  const mismatch = { ...finding, id: 'source-system-lost', viewport: 'both',
    axis: 'hierarchyComposition', repairScope: 'composition' };
  const failed = { ...input, decision: 'reframe', qualityAssessments, findings: [mismatch],
    referenceComparisons: comparisons.map(row => ({
      ...row, verdict: 'fail', findingIds: [mismatch.id], departures: ['Heavy serif type replaces the source system.'],
    })) };
  assert.equal(parse(failed).decision, 'reframe');
  assert.throws(() => parse({ ...failed, decision: 'retain' }), /contradicts/);
  assert.throws(() => parse({ ...failed, referenceComparisons: comparisons.map(row => ({
    ...row, verdict: 'fail', findingIds: ['unrelated'],
  })) }), /finding binding/);
});

test('historical v2 handback remains readable only through explicit legacy parsing', () => {
  const input = handback({ schema: 'first-render-reviewer-handback-v2' });
  assert.throws(() => parseFirstRenderReview(input, bindings, [], captures));
  assert.equal(parseFirstRenderReview(input, bindings, [], captures, undefined, true).decision, 'retain');
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

test('progress is required only with a previous iteration and binds both capture pairs', () => {
  const progress = {
    verdict: 'improved',
    comparisons: captures.map(capture => ({
      viewport: capture.viewport,
      previousCaptureSha256: previousCaptures.find(previous => previous.viewport === capture.viewport)?.captureSha256,
      currentCaptureSha256: capture.captureSha256,
      observation: 'The current hierarchy is clearer at the same fixed viewport.',
    })),
    findingIds: [],
  };
  assert.throws(() => parseFirstRenderReview(handback({}), bindings, [], captures, undefined, false,
    previousCaptures), /missing fields/);
  assert.equal(parseFirstRenderReview(handback({ progress }), bindings, [], captures, undefined, false,
    previousCaptures).progress?.verdict, 'improved');
  assert.throws(() => parseFirstRenderReview(handback({
    progress: { ...progress, verdict: 'better' },
  }), bindings, [], captures, undefined, false, previousCaptures), /progress verdict/);
  assert.throws(() => parseFirstRenderReview(handback({
    progress: { ...progress, comparisons: progress.comparisons.slice(1) },
  }), bindings, [], captures, undefined, false, previousCaptures), /progress capture coverage/);
  assert.throws(() => parseFirstRenderReview(handback({ progress }), bindings, [], captures),
    /unexpected or missing fields/);
});

test('regressed progress requires a localized current finding', () => {
  const progress = {
    verdict: 'regressed',
    comparisons: captures.map(capture => ({
      viewport: capture.viewport,
      previousCaptureSha256: previousCaptures.find(previous => previous.viewport === capture.viewport)?.captureSha256,
      currentCaptureSha256: capture.captureSha256,
      observation: 'The current action is less legible at the same fixed viewport.',
    })),
    findingIds: [],
  };
  assert.throws(() => parseFirstRenderReview(handback({ progress }), bindings, [], captures,
    undefined, false, previousCaptures), /localized finding/);
  const qualityAssessments = assessments().map(row => row.axis === 'usability' && row.viewport === 'mobile'
    ? { ...row, verdict: 'fail' } : row);
  assert.equal(parseFirstRenderReview(handback({
    decision: 'revise',
    qualityAssessments,
    findings: [finding],
    progress: { ...progress, findingIds: [finding.id] },
  }), bindings, [], captures, undefined, false, previousCaptures).progress?.verdict, 'regressed');
});
