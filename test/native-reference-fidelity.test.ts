import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { publishConsultedReferences } from '../core/design/consulted-references.ts';
import { nativeFinalLanePacket } from '../core/runtime/native-final-packet.ts';
import {
  referenceFidelityExpectations,
  validateNativeReferenceFidelityAssessments,
} from '../core/runtime/native-reference-fidelity.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

const sha = (character: string) => character.repeat(64);

test('measured reference fidelity validates exact selected-original and target-capture coverage', () => {
  const expected = referenceFidelityExpectations(
    [{ slotId: 'work-object', sha256: sha('a') }],
    [
      { captureSha256: sha('b'), viewport: 'desktop' },
      { captureSha256: sha('c'), viewport: 'mobile' },
    ],
  );
  const assessments = expected.map(binding => ({
    ...binding,
    verdict: 'pass',
    recognizable: true,
    sourceVisualCharacter: 'Inset work canvas with grouped rows.',
    targetVisualCharacter: 'The measured render preserves the inset grouped canvas.',
    preservedTraits: ['Inset framing and grouped row rhythm remain recognizable.'],
    departures: [],
    rationale: 'The visual family remains recognizable in both measured captures.',
  }));

  assert.deepEqual(validateNativeReferenceFidelityAssessments(assessments, expected), assessments);
  assert.throws(
    () => validateNativeReferenceFidelityAssessments(assessments.slice(1), expected),
    /coverage/i,
  );
  assert.throws(
    () => validateNativeReferenceFidelityAssessments(
      assessments.map((row, index) => index === 0 ? { ...row, recognizable: false } : row),
      expected,
    ),
  );
});

test('reference-free measured review requires no legacy selected-original assessment', async t => {
  const fixture = await prepareFinalRenderReviewFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  assert.deepEqual(validateNativeReferenceFidelityAssessments(undefined, []), []);
  const packet = JSON.parse(nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }).toString('utf8'));
  assert.equal(packet.schema, 'measured-final-reviewer-transport-v1');
  assert.deepEqual(packet.evidence.referenceRenders, []);
  assert.equal(packet.outputContract.reviewerFields.includes('referenceFidelityAssessments'), false);
});

test('reported consulted originals reach only measured fidelity and remain byte-bound', async t => {
  const fixture = await prepareFinalRenderReviewFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const originalPacket = JSON.parse(nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }).toString('utf8'));
  const source = Buffer.from(originalPacket.evidence.renders[0].pngBase64, 'base64');
  mkdirSync(join(fixture.root, '.omd/.cache'), { recursive: true });
  writeFileSync(join(fixture.root, '.omd/.cache/original.png'), source);
  const digest = (await import('node:crypto')).createHash('sha256').update(source).digest('hex');
  publishConsultedReferences(fixture.root, {
    schema: 'consulted-references-input-v1',
    requestSha256: (await import('node:crypto')).createHash('sha256')
      .update('Fix the approved confirmation sentence on one existing screen.').digest('hex'),
    images: [{
      path: '.omd/.cache/original.png',
      sha256: digest,
      sourceUrl: 'https://example.com/original',
      role: 'primary',
    }],
  }, createTestProjectWriteAdapter(fixture.root, fixture.invocation));

  const fidelity = JSON.parse(nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }).toString('utf8'));
  const protocol = JSON.parse(nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }).toString('utf8'));
  assert.equal(fidelity.evidence.referenceRenders[0].pngBase64, source.toString('base64'));
  assert.equal(JSON.stringify(fidelity).includes('example.com'), false);
  assert.deepEqual(protocol.evidence.referenceRenders, []);
});
