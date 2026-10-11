import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCandidateReferenceReview, CANDIDATE_REFERENCE_REVIEW_HANDBACK } from '../core/brief/candidate-reference-contract.ts';

const bindings = {
  buildSha256: 'a'.repeat(64), briefSha256: 'b'.repeat(64), evidenceSha256: 'c'.repeat(64),
  browserSha256: 'd'.repeat(64), candidateSha256: 'e'.repeat(64), referenceSha256: 'f'.repeat(64),
};
const expected = [
  { slotId: 'list', referenceSha256: '1'.repeat(64), targetCaptureSha256: '2'.repeat(64), viewport: 'desktop' as const },
  { slotId: 'list', referenceSha256: '1'.repeat(64), targetCaptureSha256: '3'.repeat(64), viewport: 'mobile' as const },
];
const response = () => ({
  schema: CANDIDATE_REFERENCE_REVIEW_HANDBACK, fixedBindings: bindings, decision: 'retain',
  referenceFidelityAssessments: expected.map(row => ({
    ...row, verdict: 'pass', recognizable: true, sourceVisualCharacter: 'Grouped unruled rows under an inset context panel.',
    targetVisualCharacter: 'The destination retains the panel and unruled groups.',
    preservedTraits: ['Inset context and grouped unruled rows'], departures: [], rationale: 'The visual relationship survives.',
  })),
  repairCriteria: [],
  continuity: [],
});

test('candidate fidelity cannot retain incomplete, wrong-image or unrecognizable evidence', () => {
  assert.equal(parseCandidateReferenceReview(response(), bindings, expected).decision, 'retain');
  for (const change of [{ recognizable: false }, { verdict: 'insufficient' }, { targetCaptureSha256: '9'.repeat(64) }]) {
    const input = response();
    Object.assign(input.referenceFidelityAssessments[0] ?? {}, change);
    assert.throws(() => parseCandidateReferenceReview(input, bindings, expected));
  }
  const missing = response();
  missing.referenceFidelityAssessments.pop();
  assert.throws(() => parseCandidateReferenceReview(missing, bindings, expected));
});

test('a rejected candidate returns scoped repair criteria without approving the target', () => {
  const input = { ...response(), decision: 'revise', repairCriteria: [{
    slotId: 'list', viewport: 'mobile', observation: 'Repeated outlined rows replace the unruled groups.',
    repairCriterion: 'Restore grouped unruled rows and the inset context relationship.',
  }] };
  Object.assign(input.referenceFidelityAssessments[1] ?? {}, { verdict: 'fail', recognizable: false, preservedTraits: [] });
  assert.equal(parseCandidateReferenceReview(input, bindings, expected).decision, 'revise');
  assert.throws(() => parseCandidateReferenceReview({ ...input, repairCriteria: [] }, bindings, expected));
  assert.throws(() => parseCandidateReferenceReview({ ...input, decision: 'retain' }, bindings, expected));
  assert.throws(() => parseCandidateReferenceReview({
    ...input, repairCriteria: [{ ...input.repairCriteria[0], slotId: 'unselected' }],
  }, bindings, expected));
  assert.throws(() => parseCandidateReferenceReview({
    ...input, repairCriteria: [{ ...input.repairCriteria[0], repairCriterion: 'Use https://source.example/original.png' }],
  }, bindings, expected));
});

test('distinct slots choose one matching state per viewport instead of every alternative', () => {
  const alternatives = ['list', 'editor'].flatMap(slotId => expected.flatMap(row => [
    { ...row, slotId }, { ...row, slotId, targetCaptureSha256: '4'.repeat(64) },
  ]));
  const input = response();
  input.referenceFidelityAssessments = ['list', 'editor'].flatMap(slotId =>
    response().referenceFidelityAssessments.map(row => ({
      ...row, slotId, ...(slotId === 'editor' ? { targetCaptureSha256: '4'.repeat(64) } : {}),
    })));
  assert.equal(parseCandidateReferenceReview(input, bindings, alternatives).assessments.length, 4);
  const duplicate = structuredClone(input);
  duplicate.referenceFidelityAssessments.push({ ...duplicate.referenceFidelityAssessments[0]!, targetCaptureSha256: '4'.repeat(64) });
  assert.throws(() => parseCandidateReferenceReview(duplicate, bindings, alternatives), /coverage/);
});

test('candidate refinement cannot silently discard previously reviewed criteria', () => {
  const previous = parseCandidateReferenceReview(response(), bindings, expected);
  const current = response();

  assert.throws(
    () => parseCandidateReferenceReview(current, bindings, expected, previous.assessments),
    /continuity/,
  );
});

test('candidate continuity binds every previous and current counterpart without hiding regressions', () => {
  const previous = parseCandidateReferenceReview(response(), bindings, expected);
  const current = {
    ...response(),
    continuity: previous.assessments.map(row => ({
      slotId: row.slotId, viewport: row.viewport, previousCaptureSha256: row.targetCaptureSha256,
      currentCaptureSha256: row.targetCaptureSha256, disposition: 'preserved',
      observation: 'The inset work area and unruled groups remain visible.',
    })),
  };
  assert.equal(parseCandidateReferenceReview(current, bindings, expected, previous.assessments).continuity.length, 2);
  for (const change of [{ disposition: 'resolved' }, { previousCaptureSha256: '9'.repeat(64) },
    { currentCaptureSha256: '9'.repeat(64) }, { slotId: 'unselected' }]) {
    const invalid = structuredClone(current);
    Object.assign(invalid.continuity[0] ?? {}, change);
    assert.throws(() => parseCandidateReferenceReview(invalid, bindings, expected, previous.assessments), /continuity/);
  }
  const regressed = {
    ...current, decision: 'revise',
    repairCriteria: [{ slotId: 'list', viewport: 'mobile', observation: 'The work area is fragmented.',
      repairCriterion: 'Restore the continuous inset work area.' }],
  };
  Object.assign(regressed.referenceFidelityAssessments[1] ?? {}, { verdict: 'fail', recognizable: false });
  assert.throws(() => parseCandidateReferenceReview(regressed, bindings, expected, previous.assessments), /continuity disposition/);
  Object.assign(regressed.continuity[1] ?? {}, { disposition: 'regressed' });
  assert.equal(parseCandidateReferenceReview(regressed, bindings, expected, previous.assessments).decision, 'revise');
});
