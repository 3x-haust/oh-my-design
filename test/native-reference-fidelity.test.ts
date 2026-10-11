import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, readReferenceBoardArtifacts, referenceBoardProjectSha256, sha256 } from '../core/ref/board-artifacts.ts';
import { collectSelectedReferenceOriginals, referenceFidelityExpectations,
  validateNativeReferenceFidelityAssessments, validateCurrentReferenceFidelityAssessments } from '../core/runtime/native-reference-fidelity.ts';
import { nativeFinalLanePacket } from '../core/runtime/native-final-packet.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import { installNativeFidelityReferences } from './helpers/native-reference-fidelity.ts';
import { referenceFidelityRequired } from '../core/runtime/native-reference-fidelity.ts';
import { parseReferenceClassification, referenceClassificationSha256 } from '../core/ref/reference-classification.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { selectReferenceCandidateV2 } from '../core/ref/reference-selection.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';

const sha = (character: string) => character.repeat(64);
const targets = [{ captureSha256: sha('b'), viewport: 'desktop' as const },
  { captureSha256: sha('c'), viewport: 'mobile' as const }];
const expectations = () => referenceFidelityExpectations([
  { slotId: 'work-object', sha256: sha('a') }, { slotId: 'context', sha256: sha('d') },
], targets);
const assessments = () => expectations().map(binding => ({
  ...binding, verdict: 'pass', recognizable: true,
  sourceVisualCharacter: 'Inset work canvas with uninterrupted grouped rows and narrow supporting context.',
  targetVisualCharacter: 'The local work canvas keeps the inset and uninterrupted groups at the captured viewport.',
  preservedTraits: ['Inset framing, unruled grouping, and the dominant canvas proportions remain visibly related.'],
  departures: [{ sourceTrait: 'Adjacent context pane', targetTreatment: 'Context moves above the work canvas on mobile.',
    destinationConstraint: 'The narrow viewport must preserve readable task content.',
    rationale: 'The inset canvas and unruled group rhythm remain recognizable after reflow.' }],
  rationale: 'The visible family relationship survives the destination content and responsive adaptation.',
}));

test('adaptive reference-board selection requires fidelity without a separate legacy selection stage', () => {
  assert.equal(referenceFidelityRequired({ stages: ['reference-board', 'candidate-generation'], skips: [] }), true);
  assert.equal(referenceFidelityRequired({ stages: ['reference-board'], skips: [{ id: 'reference-board' }] }), false);
  assert.equal(referenceFidelityRequired({ stages: ['production'], skips: [] }), false);
});

test('each reference viewport uses its observed counterpart, not every unrelated application state', () => {
  const choices = referenceFidelityExpectations([
    { slotId: 'work-object', sha256: sha('a') }, { slotId: 'context', sha256: sha('d') },
  ], [...targets, { captureSha256: sha('e'), viewport: 'desktop' }]);
  assert.deepEqual(validateNativeReferenceFidelityAssessments(assessments(), choices), assessments());
  assert.throws(() => validateNativeReferenceFidelityAssessments(assessments().slice(1), choices), /coverage/);
});

test('fidelity assessments cover every selected used slot and exact target capture, without ordering or unique-image quotas', () => {
  const expected = expectations();
  assert.equal(expected.length, 4);
  assert.deepEqual(validateNativeReferenceFidelityAssessments(assessments().reverse(), expected), assessments());
  assert.equal(referenceFidelityExpectations([{ slotId: 'one', sha256: sha('a') },
    { slotId: 'two', sha256: sha('a') }], [...targets, targets[0]!]).length, 4);
  for (const input of [undefined, [], assessments().slice(1), [...assessments(), assessments()[0]],
    [assessments()[0], assessments()[0], ...assessments().slice(2)]]) {
    assert.throws(() => validateNativeReferenceFidelityAssessments(input, expected), /fidelity.*coverage/i);
  }
  for (const change of [
    { verdict: 'fail' }, { verdict: 'insufficient' }, { verdict: 'justified-departure' },
    { recognizable: false }, { sourceVisualCharacter: ' ' }, { targetVisualCharacter: '' },
    { preservedTraits: [] }, { rationale: '' }, { slotId: 'rejected-slot' },
    { referenceSha256: sha('e') }, { targetCaptureSha256: sha('f') }, { viewport: 'mobile' },
    { departures: [{ rationale: 'Caller says every departure is justified.' }] },
    { callerApproved: true },
  ]) assert.throws(() => validateNativeReferenceFidelityAssessments(
    assessments().map((row, index) => index === 0 ? { ...row, ...change } : row), expected));
});

test('reference-free fidelity needs no assessments and cannot smuggle an unrelated visual claim', () => {
  assert.deepEqual(validateNativeReferenceFidelityAssessments(undefined, []), []);
  assert.deepEqual(validateNativeReferenceFidelityAssessments([], []), []);
  assert.deepEqual(referenceFidelityExpectations([], []), []);
  assert.throws(() => validateNativeReferenceFidelityAssessments(assessments(), []));
});

test('selected nonvisual supporting content does not become an original-image obligation', t => {
  const fixture = prepareFinalRenderReviewFixture('synth-marketing');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  installNativeFidelityReferences(t, fixture.root);
  const source = 'https://evidence.example/voice';
  const principles = ['content-only: Preserve approved vocabulary.'];
  writeFileSync(join(fixture.root, '.omd/refs/voice.json'), JSON.stringify({
    source, component: 'voice', kind: 'page', capturedAt: '2026-08-13T00:00:00.000Z',
    invariants: null, principles,
  }));
  const path = join(fixture.root, '.omd/reference-board.json');
  const board = JSON.parse(readFileSync(path, 'utf8'));
  board.schemaVersion = 'reference-board-v2';
  const frame = '# Reference coverage fixture\n';
  writeFileSync(join(fixture.root, '.omd/frame.md'), frame);
  board.frameSha256 = sha256(frame);
  board.projectSha256 = referenceBoardProjectSha256(fixture.root);
  const candidate = board.candidates.find((row: { id: string }) => row.id === 'selected');
  assert.ok(candidate);
  candidate.pieces.push({
    slotId: 'voice', sourceKind: 'classified-reference', referenceId: refIdentity(source, 'voice'),
    targetComponent: 'ProductVoice', targetSelector: '[data-zone="voice"]', taskIds: ['T1'],
    reason: 'Preserve vocabulary.', take: ['content', 'voice'], avoid: 'Do not infer pixels.',
    adaptation: 'Apply approved terms.', grid: { column: 1, span: 12, order: 2 },
    evidenceAxes: { rights: 'lawful', signal: 'supporting-content', staticAxis: 'absent', motionAxis: 'absent' },
    classification: { kind: 'content-only', sha256: referenceClassificationSha256(parseReferenceClassification({ principles })) },
  });
  writeFileSync(path, canonicalJson(board));
  selectReferenceCandidateV2(fixture.root, 'selected', [
    { slotId: 'hero-card', obligationDisposition: 'used', obligationReason: 'Visual direction.' },
    { slotId: 'rejected-slot', obligationDisposition: 'rejected', obligationReason: 'Alternative.' },
    { slotId: 'voice', obligationDisposition: 'used', obligationReason: 'Approved vocabulary only.' },
  ], createTestProjectRunInvocation(fixture.root));
  assert.deepEqual(collectSelectedReferenceOriginals(fixture.root).map(row => row.slotId), ['hero-card']);
});

test('selected original collection follows current settled used slots, retains whole bytes, and rejects changed originals', t => {
  const fixture = prepareFinalRenderReviewFixture('synth-marketing');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  installNativeFidelityReferences(t, fixture.root);
  const originals = collectSelectedReferenceOriginals(fixture.root);
  assert.deepEqual(originals.map(row => row.slotId), ['hero-card']);
  const piece = readReferenceBoardArtifacts(fixture.root).raw.candidates.find(row => row.id === 'selected')!.pieces[0]!;
  assert.notEqual(piece.evidence.kind, 'classified-reference');
  if (piece.evidence.kind === 'classified-reference') throw new Error('image fixture required');
  const bytes = readFileSync(join(fixture.root, piece.evidence.imagePath));
  assert.deepEqual(Buffer.from(originals[0]!.pngBase64, 'base64'), bytes);
  assert.equal(originals[0]!.sha256, piece.evidence.imageSha256);
  assert.doesNotMatch(JSON.stringify(originals), /visual\.example|reference\.example|imagePath|referenceId/);
  const settledPath = join(fixture.root, '.omd/reference-selection-v2.json');
  const settled = JSON.parse(readFileSync(settledPath, 'utf8'));
  settled.slots[0].obligationDisposition = 'rejected';
  settled.slots[1].obligationDisposition = 'used';
  writeFileSync(settledPath, canonicalJson(settled));
  assert.deepEqual(collectSelectedReferenceOriginals(fixture.root).map(row => row.slotId), ['rejected-slot']);
  writeFileSync(join(fixture.root, piece.evidence.imagePath), Buffer.concat([bytes, Buffer.from('changed')]));
  assert.throws(() => collectSelectedReferenceOriginals(fixture.root), /hash|changed|capture/i);
});

test('native packet and persisted assessment validation bind selected originals to the authenticated final render captures', t => {
  const fixture = prepareFinalRenderReviewFixture('synth-marketing');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  installNativeFidelityReferences(t, fixture.root);
  const packet = JSON.parse(nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }).toString());
  const expected = packet.evidence.referenceFidelityExpectations;
  assert.equal(expected.length, packet.evidence.renders.length);
  assert.ok(packet.outputContract.reviewerFields.includes('referenceFidelityAssessments'));
  const valid = expected.map((binding: Record<string, unknown>) => ({ ...assessments()[0], ...binding }));
  assert.doesNotThrow(() => validateCurrentReferenceFidelityAssessments(
    fixture.root, fixture.invocation, fixture.observationSha256s, valid));
  for (const input of [undefined, [], valid.slice(1), valid.map((row: Record<string, unknown>) => ({
    ...row, targetCaptureSha256: sha('e'),
  })), valid.map((row: Record<string, unknown>) => ({ ...row, verdict: 'insufficient' }))]) {
    assert.throws(() => validateCurrentReferenceFidelityAssessments(
      fixture.root, fixture.invocation, fixture.observationSha256s, input));
  }
  const production = readFileSync(join(fixture.root, '.omd/final-desktop.png'));
  writeFileSync(join(fixture.root, '.omd/final-desktop.png'), Buffer.concat([production, Buffer.from('changed')]));
  assert.throws(() => validateCurrentReferenceFidelityAssessments(
    fixture.root, fixture.invocation, fixture.observationSha256s, valid));
});

test('explicitly skipped references ignore historical board files without requiring visual assessments', t => {
  const fixture = prepareFinalRenderReviewFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  writeFileSync(join(fixture.root, '.omd/reference-board.json'), 'historical invalid board');
  assert.doesNotThrow(() => validateCurrentReferenceFidelityAssessments(
    fixture.root, fixture.invocation, fixture.observationSha256s, undefined));
  const packet = JSON.parse(nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }).toString());
  assert.deepEqual(packet.evidence.referenceRenders, []);
  assert.equal(packet.outputContract.reviewerFields.includes('referenceFidelityAssessments'), false);
});
