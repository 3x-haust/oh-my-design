import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { publishCandidatePacket, publishCandidateSelection, readCurrentCandidateSelection, candidateDirectionState } from '../core/brief/candidate-choice.ts';
import { candidateReviewPayload } from '../core/brief/candidate-review.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { digest, jsonBytes, fileReceipt, readReceipt } from '../core/brief/candidate-data.ts';
import { fixture, renderedSet, snapshot, userChoice, write } from './helpers/phase6-process.ts';
import { pack } from './helpers/phase6-process.ts';
import { publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { STAGES, contractSha256, deliveryReceipt } from '../core/stage/contract.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { MAX_EVIDENCE_REPLANS } from '../core/stage/evidence-budget.ts';

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
  assert.equal(packet.schema, 'candidate-review-packet-v2');
  const qualityAssessments = packet.candidates[0].previews.flatMap((preview: { viewId: string }) =>
    ['aesthetic-desirability', 'content-shaped-composition', 'control-craft'].map(axis => ({
      axis, viewId: preview.viewId, verdict: 'pass' as const,
      observation: 'The exact candidate pixels show deliberate hierarchy and resolved control treatment.',
      consequence: 'This view independently qualifies for current selection.',
    })));
  const review = { schema: 'candidate-eye-review-v2' as const, packet: publication.packet,
    observations: publication.aliases.map(a => ({ alias: a.alias, feasibility: 'pass' as const, structureRelationship: 'Cause and effect are legible.', densityTypeFit: 'Shared content fits.', responsiveFit: 'Both actual views remain readable.', qualityAssessments, findings: [] })), winner, limitations: ['Model visual proxy, not human usability.'], execution: { kind: 'isolated' as const, launchId: 'test-isolated-eye', outputSha256: digest({ winner }) } };
  const payload = candidateReviewPayload(review), payloadSha256 = digest(payload);
  write(f.root, '.omd/.cache/eye-review.json', jsonBytes({ ...review, attestation: { kind: 'native-observation-v1', payloadSha256, signature: signNativeObservation(f.root, 'candidate-eye-review-v2', payloadSha256) } }));
  const input = { schema: 'candidate-selection-input-v2', candidateSet: publication.candidateSet, selectedId: 'B', inputDigest: packet.inputDigest,
    decision: { decidedBy: 'agent', autonomyGrant: f.route.sourceContract.processPolicy!.autonomyGrant, eyeReview: fileReceipt(f.root, '.omd/.cache/eye-review.json'), reviewIndependence: 'isolated' } };
  const before = snapshot(f.root);
  assert.throws(() => publishCandidateSelection(f.root, { ...input, selectedId: 'A' }, f.writer, f.invocation), /differs from the isolated Eye winner/);
  assert.deepEqual(snapshot(f.root), before);
  const legacy = { ...review, schema: 'candidate-eye-review-v1' as const,
    observations: review.observations.map(({ qualityAssessments: _quality, ...observation }) => observation) };
  const legacyPayload = candidateReviewPayload(legacy), legacyDigest = digest(legacyPayload);
  write(f.root, '.omd/.cache/eye-review-v1.json', jsonBytes({ ...legacy,
    attestation: { kind: 'native-observation-v1', payloadSha256: legacyDigest,
      signature: signNativeObservation(f.root, 'candidate-eye-review-v1', legacyDigest) } }));
  assert.throws(() => publishCandidateSelection(f.root, { ...input, decision: {
    ...input.decision, eyeReview: fileReceipt(f.root, '.omd/.cache/eye-review-v1.json'),
  } }, f.writer, f.invocation), /historical candidate review/);
  publishCandidateSelection(f.root, input, f.writer, f.invocation);
  assert.equal(readCurrentCandidateSelection(f.root).decision.decidedBy, 'agent');
  const evidence = [{ status: 'user-provided', reference: 'request' }];
  const statement = (text: string) => ({ text, disposition: 'non-factual-working-decision' });
  write(f.root, '.omd/domain-brief.json', JSON.stringify({
    schema: 'domain-brief-v1', request: f.route.request, domain: 'Instrument launch', summary: 'Explain supplied patching.',
    surfaces: [{ name: 'Main', purpose: 'Inspect patching', evidence }], coreObjects: [{ name: 'Patch', evidence }],
    audience: { description: 'Instrument players', evidence },
    referenceQueries: { component: ['patch workspace'], craft: ['readable type'], mood: ['work context'] },
    planning: { businessGoal: statement('Explain patching'), successSignal: statement('Reach details'),
      nonGoals: [{ text: 'No invented commercial terms', disposition: 'omit-from-production-claims' }] },
  }));
  write(f.root, '.omd/delivery.jsonl', STAGES.filter(stage => f.route.strategy.stages.includes(stage.id))
    .flatMap(stage => stage.requiredContracts.map(contract => JSON.stringify(deliveryReceipt(
      stage.id, contract, contractSha256(pack, contract, stage.id), '2026-09-26T00:00:00Z')))).join('\n') + '\n');
  publishCandidatePlan(f.root, { ...f.plan, countReason: 'A changed declared exploration decision requires fresh binding.',
    candidates: f.plan.candidates.map((candidate, index) => ({ ...candidate, id: index === 0 ? 'C' : 'D' })),
  }, f.writer, f.invocation);
  assert.throws(() => readCurrentCandidateSelection(f.root), /candidate set does not bind the committed plan/);
  let work = nextStageWork(f.root, pack, f.invocation);
  for (let n = 0; n < 20 && work.stage !== 'candidate-generation'; n++) work = nextStageWork(f.root, pack, f.invocation);
  assert.equal(work.stage, 'candidate-generation');
  const staleBytes = snapshot(f.root);
  for (let n = 0; n < MAX_EVIDENCE_REPLANS + 2; n++) {
    work = nextStageWork(f.root, pack, f.invocation);
    assert.equal(work.stage, 'candidate-generation');
    assert.equal(work.action, 'repair-output');
    assert.ok(work.problems.some(problem => problem.includes('candidate set does not bind the committed plan')));
    assert.ok(!work.deferredStages.includes('candidate-generation'));
    assert.ok(!work.confidenceDebt.some(item => item.stage === 'candidate-generation'));
  }
  assert.deepEqual(snapshot(f.root), staleBytes);
});
