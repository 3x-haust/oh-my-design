import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { publishCandidatePacket, publishCandidateSelection, readCurrentCandidateSelection, candidateDirectionState } from '../core/brief/candidate-choice.ts';
import { candidateReviewPayload } from '../core/brief/candidate-review.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { digest, jsonBytes, fileReceipt, readReceipt } from '../core/brief/candidate-data.ts';
import { fixture, renderedSet, snapshot, userChoice, write } from './helpers/phase6-process.ts';

test('verbatim host user choice refuses forged, ambiguous, wrong-option and stale answers before pointer mutation', async t => {
  const f = fixture(t), set = await renderedSet(f), publication = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  for (const invalid of [
    { ...userChoice(f, publication), selectedId: 'C' },
    userChoice(f, publication, 'B', 'continue'),
    userChoice(f, publication, 'B', 'A or B'),
    { ...userChoice(f, publication), inputDigest: '0'.repeat(64) },
    { ...userChoice(f, publication), userInputObservation: { ...userChoice(f, publication).userInputObservation, signature: 'forged' } },
    { ...userChoice(f, publication), decision: { decidedBy: 'agent', autonomyGrant: publication.candidateSet, eyeReview: publication.packet, reviewIndependence: 'isolated' } },
  ]) {
    const before = snapshot(f.root);
    assert.throws(() => publishCandidateSelection(f.root, invalid, f.writer, f.invocation));
    assert.deepEqual(snapshot(f.root), before);
    publishCandidateSelection(f.root, userChoice(f, publication, 'B', '  I choose B.\n'), f.writer, f.invocation);
    const selected = readCurrentCandidateSelection(f.root);
    assert.equal(selected.decision.decidedBy, 'user');
    assert.equal(selected.decision.decidedBy === 'user' && selected.decision.userMessage, '  I choose B.\n');
  }
  // All displayed previews, including the rejected option, are selection inputs.
  const path = join(f.root, set.candidates[0]!.source.path), bytes = readFileSync(path);
  writeFileSync(path, Buffer.concat([bytes, Buffer.from('\nchanged source')]));
  const before = snapshot(f.root);
  assert.throws(() => publishCandidateSelection(f.root, userChoice(f, publication), f.writer, f.invocation));
  assert.deepEqual(snapshot(f.root), before);
  assert.equal(candidateDirectionState(f.root).selectionStatus, 'stale');
  writeFileSync(path, bytes);
  publishCandidateSelection(f.root, userChoice(f, publication), f.writer, f.invocation);
  assert.equal(candidateDirectionState(f.root).selectionStatus, 'current');
});

test('autonomous choice requires the explicit grant and exact isolated anonymous Eye result, never user approval', async t => {
  const f = fixture(t, true), set = await renderedSet(f), publication = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  assert.equal(publication.pending, null);
  const packet = JSON.parse(readReceipt(f.root, publication.packet).toString('utf8'));
  assert.equal(JSON.stringify(packet).includes('layoutStrategy'), false);
  assert.equal(JSON.stringify(packet).includes('rationale'), false);
  const winner = publication.aliases.find(a => a.id === 'B')!.alias;
  const review = { schema: 'candidate-eye-review-v1' as const, packet: publication.packet,
    observations: publication.aliases.map(a => ({ alias: a.alias, feasibility: 'pass' as const, structureRelationship: 'Cause and effect are legible.', densityTypeFit: 'Shared content fits.', responsiveFit: 'Both actual views remain readable.', findings: [] })), winner, limitations: ['Model visual proxy, not human usability.'], execution: { kind: 'isolated' as const, launchId: 'test-isolated-eye', outputSha256: digest({ winner }) } };
  const payload = candidateReviewPayload(review), payloadSha256 = digest(payload);
  write(f.root, '.omd/.cache/eye-review.json', jsonBytes({ ...review, attestation: { kind: 'native-observation-v1', payloadSha256, signature: signNativeObservation(f.root, 'candidate-eye-review-v1', payloadSha256) } }));
  const input = { schema: 'candidate-selection-input-v2', candidateSet: publication.candidateSet, selectedId: 'B', inputDigest: packet.inputDigest,
    decision: { decidedBy: 'agent', autonomyGrant: f.route.sourceContract.processPolicy!.autonomyGrant, eyeReview: fileReceipt(f.root, '.omd/.cache/eye-review.json'), reviewIndependence: 'isolated' } };
  const before = snapshot(f.root);
  assert.throws(() => publishCandidateSelection(f.root, { ...input, selectedId: 'A' }, f.writer, f.invocation), /differs from the isolated Eye winner/);
  assert.deepEqual(snapshot(f.root), before);
  publishCandidateSelection(f.root, input, f.writer, f.invocation);
  assert.equal(readCurrentCandidateSelection(f.root).decision.decidedBy, 'agent');
});
