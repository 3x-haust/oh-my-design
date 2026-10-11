import assert from 'node:assert/strict';
import { realpathSync, rmSync } from 'node:fs';
import test from 'node:test';
import { parseSourceStudyPacket } from '../adapters/pi-study-contract.ts';
import { sourceStudyPackets } from '../core/art-direction/source-study-packet.ts';
import { SOURCE_STUDY_INPUT_SCHEMA } from '../core/art-direction/source-study-input.ts';
import { selectReferenceCandidateV2 } from '../core/ref/reference-selection.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import { installNativeFidelityReferences } from './helpers/native-reference-fidelity.ts';

test('source studies bind actual selected originals and isolated hypotheses without claiming approved content', t => {
  const fixture = prepareFinalRenderReviewFixture('synth-marketing');
  const root = realpathSync(fixture.root);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  installNativeFidelityReferences(t, root);
  const invocation = createTestProjectRunInvocation(root);
  selectReferenceCandidateV2(root, 'selected', [
    { slotId: 'hero-card', obligationDisposition: 'used', obligationReason: 'Collection context.' },
    { slotId: 'rejected-slot', obligationDisposition: 'used', obligationReason: 'Record context.' },
  ], invocation);
  const input = {
    schema: SOURCE_STUDY_INPUT_SCHEMA,
    reason: 'Two unresolved work-object relationships.',
    primaryAction: 'Save the current page.',
    destinationContent: [{ path: 'books.json', content: '{"title":"산책의 문장들","current":86,"total":248}' }],
    variants: [
      { id: 'attached', relationship: 'Edit within the collection.', observableConsequence: 'The collection remains visible.' },
      { id: 'focused', relationship: 'Open a dedicated record.', observableConsequence: 'The record becomes the work surface.' },
    ],
  };
  const result = sourceStudyPackets(root, invocation, input);
  assert.equal(result.packets.length, 2);
  const first = result.packets[0];
  const second = result.packets[1];
  assert.ok(first && second);
  const attached = parseSourceStudyPacket(first.bytes);
  const focused = parseSourceStudyPacket(second.bytes);
  assert.equal(attached.evidence.study.contentStatus, 'provisional');
  assert.deepEqual(attached.evidence.destinationContent, input.destinationContent);
  assert.equal(attached.evidence.referenceRenders.length, 1);
  const context = JSON.parse(attached.evidence.study.source);
  assert.equal(context.referenceRoles.length, 1);
  assert.equal(context.referenceRoles[0].parts.length, 2);
  assert.deepEqual(attached.evidence.referenceRenders, focused.evidence.referenceRenders);
  assert.equal(attached.evidence.study.relationship, input.variants[0]?.relationship);
  assert.equal(focused.evidence.study.relationship, input.variants[1]?.relationship);
  assert.notEqual(attached.evidenceSha256, focused.evidenceSha256);
  assert.notEqual(sourceStudyPackets(root, invocation, { ...input, primaryAction: 'Read the note.' }).contextSha256,
    result.contextSha256);
});
