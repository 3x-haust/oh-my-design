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

test('a resolution names the prior id and every viewport it still owes', () => {
  const both = { ...finding, viewport: 'both' as const };
  const mobileOnly = { id: both.id, evidence: [{ ...captures[1], observation: 'The action fits on one line.' }] };
  assert.throws(() => parseFirstRenderReview(handback({ resolvedFindings: [mobileOnly] }), bindings, [both], captures),
    /resolution coverage: primary-action needs exactly one evidence row for each of desktop and mobile/);
  const complete = { id: both.id, evidence: [
    { ...captures[0], observation: 'The action fits on one line.' }, mobileOnly.evidence[0]] };
  assert.equal(parseFirstRenderReview(handback({ resolvedFindings: [complete] }), bindings, [both], captures).decision, 'retain');
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
  }), bindings, [], captures, undefined, false, previousCaptures), /progress capture coverage: .*one desktop and one mobile/);
  // A volunteered row comparing a scroll-section frame is set aside; the two fixed-viewport rows still decide.
  const extra = { viewport: 'desktop', previousCaptureSha256: 'f'.repeat(64), currentCaptureSha256: 'e'.repeat(64), observation: 'Section at scroll 900.' };
  assert.equal(parseFirstRenderReview(handback({ progress: { ...progress, comparisons: [...progress.comparisons, extra] } }), bindings, [], captures,
    undefined, false, previousCaptures).progress?.comparisons.length, 2);
  assert.throws(() => parseFirstRenderReview(handback({
    progress: { ...progress, comparisons: [progress.comparisons[0], extra, extra] },
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

test('designer judgments must each be answered and a violation must cite a current finding', () => {
  const withJudgments = { ...bindings, designerJudgmentsSha256: 'f'.repeat(64) };
  const ids = ['emphasis-budget', 'hero-states-the-offer'];
  const parse = (value: unknown) => parseFirstRenderReview(value, withJudgments, [], captures,
    undefined, false, undefined, FIRST_RENDER_REVIEW_HANDBACK, ids);
  const check = (judgmentId: string, verdict: string, findingIds: string[] = []) => ({
    judgmentId, verdict, viewport: 'both', observation: 'Checked against the current captures.', findingIds,
  });
  const retained = handback({ fixedBindings: withJudgments,
    judgmentChecks: [check(ids[0]!, 'holds'), check(ids[1]!, 'not-applicable')] });
  assert.equal(parse(retained).judgmentChecks?.length, 2);

  const failing = DESIGN_QUALITY_AXES.flatMap(axis => captures.map(capture => ({
    axis, ...capture, verdict: axis === 'usability' && capture.viewport === 'mobile' ? 'fail' : 'pass',
    observation: 'Observed.', consequence: 'Consequence.',
  })));
  const revised = handback({ fixedBindings: withJudgments, decision: 'revise', qualityAssessments: failing,
    findings: [finding], judgmentChecks: [check(ids[0]!, 'violated', [finding.id]), check(ids[1]!, 'holds')] });
  assert.equal(parse(revised).judgmentChecks?.[0]?.verdict, 'violated');
  // Quiet checks carry no prose; a violation still names where and what.
  const quiet = (judgmentId: string, verdict: string) => ({ judgmentId, verdict, viewport: null, observation: null, findingIds: [] });
  assert.deepEqual(parse({ ...retained, judgmentChecks: [quiet(ids[0]!, 'holds'), quiet(ids[1]!, 'not-applicable')] })
    .judgmentChecks?.map(row => row.observation), [null, null]);
  assert.throws(() => parse({ ...revised, judgmentChecks: [{ ...quiet(ids[0]!, 'violated'), findingIds: [finding.id] }, quiet(ids[1]!, 'holds')] }),
    /judgment check viewport/);
  assert.throws(() => parse({ ...revised, judgmentChecks: [{ ...quiet(ids[0]!, 'violated'), viewport: 'mobile', findingIds: [finding.id] }, quiet(ids[1]!, 'holds')] }));
  // A judgment a measured template tell bears on is never answered quietly, even when it holds.
  const attested = (value: unknown) => parseFirstRenderReview(value, withJudgments, [], captures,
    undefined, false, undefined, FIRST_RENDER_REVIEW_HANDBACK, ids, [ids[0]!]);
  // An attested judgment left without a note is read as a quiet answer rather than voiding the whole review.
  assert.equal(attested({ ...retained, judgmentChecks: [quiet(ids[0]!, 'holds'), quiet(ids[1]!, 'not-applicable')] })
    .judgmentChecks?.[0]?.observation, null);
  assert.equal(attested({ ...retained, judgmentChecks: [check(ids[0]!, 'holds'), quiet(ids[1]!, 'not-applicable')] })
    .judgmentChecks?.[0]?.observation, 'Checked against the current captures.');
  // A written observation whose viewport was left empty speaks for both screens rather than voiding the review.
  assert.equal(attested({ ...retained, judgmentChecks: [{ ...check(ids[0]!, 'holds'), viewport: null }, quiet(ids[1]!, 'not-applicable')] })
    .judgmentChecks?.[0]?.viewport, 'both');

  const missing = { ...retained } as Record<string, unknown>;
  delete missing.judgmentChecks;
  assert.throws(() => parse(missing), /judgment check coverage/);
  assert.throws(() => parse({ ...retained, judgmentChecks: [check(ids[0]!, 'holds')] }), /judgment check coverage/);
  assert.throws(() => parse({ ...retained, judgmentChecks: [check(ids[0]!, 'holds'), check(ids[0]!, 'holds')] }), /judgment check coverage/);
  assert.throws(() => parse({ ...retained, judgmentChecks: [check(ids[0]!, 'holds'), check('invented', 'holds')] }), /judgment check coverage/);
  assert.throws(() => parse({ ...retained, judgmentChecks: [check(ids[0]!, 'maybe'), check(ids[1]!, 'holds')] }), /judgment check verdict/);
  // A violation without a localized finding cannot slip through a retain.
  assert.throws(() => parse({ ...retained, judgmentChecks: [check(ids[0]!, 'violated'), check(ids[1]!, 'holds')] }), /finding binding/);
  assert.throws(() => parse({ ...retained, judgmentChecks: [check(ids[0]!, 'violated', ['ghost']), check(ids[1]!, 'holds')] }), /finding binding/);
  assert.throws(() => parse({ ...revised, judgmentChecks: [check(ids[0]!, 'holds', [finding.id]), check(ids[1]!, 'holds')] }), /finding binding/);
  assert.throws(() => parseFirstRenderReview(retained, withJudgments, [], captures), /judgment check source bindings/);
  // Records without a judgment binding keep their earlier shape.
  assert.throws(() => parseFirstRenderReview(handback({ judgmentChecks: [] }), bindings, [], captures), /unexpected or missing fields/);
});

test('a page the last review retained stays retained unless this review finds it regressed', () => {
  const progress = (verdict: string, findingIds: string[] = []) => ({
    verdict,
    comparisons: captures.map(capture => ({
      viewport: capture.viewport,
      previousCaptureSha256: previousCaptures.find(previous => previous.viewport === capture.viewport)?.captureSha256,
      currentCaptureSha256: capture.captureSha256,
      observation: 'The header is now opaque; the rest of the entry is unchanged.',
    })),
    findingIds,
  });
  const qualityAssessments = assessments().map(row => row.axis === 'usability' && row.viewport === 'mobile'
    ? { ...row, verdict: 'fail' } : row);
  const revised = (verdict: string, findingIds: string[] = []) => handback({ decision: 'revise', qualityAssessments, findings: [finding], progress: progress(verdict, findingIds) });
  const parse = (value: unknown, previous?: 'retain' | 'revise' | 'reframe') => parseFirstRenderReview(value, bindings, [], captures,
    undefined, false, previousCaptures, FIRST_RENDER_REVIEW_HANDBACK, undefined, undefined, previous);
  // Judged the same (or better) as the retained page, a fresh look at what already passed cannot withdraw it.
  assert.throws(() => parse(revised('same'), 'retain'), /previous review retained this page and progress says same/);
  assert.throws(() => parse(revised('improved'), 'retain'), /progress says improved/);
  // Changed but not better is not a claim that it got worse either.
  assert.throws(() => parse(revised('different-not-better'), 'retain'), /progress says different-not-better/);
  assert.equal(parse(handback({ progress: progress('same') }), 'retain').decision, 'retain');
  // A change that made it worse is said as regressed with findings that localize it.
  assert.equal(parse(revised('regressed', [finding.id]), 'retain').decision, 'revise');
  // After a revise, the same verdicts may keep revising.
  assert.equal(parse(revised('same'), 'revise').decision, 'revise');
});
