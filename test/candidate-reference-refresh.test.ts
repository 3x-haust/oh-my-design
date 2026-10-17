import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, renderedSet, write, snapshot } from './helpers/phase6-process.ts';
import { publishCandidatePacket, currentCandidateReview, publishCandidateSelection, readCurrentCandidateSelection } from '../core/brief/candidate-choice.ts';
import { publishReferenceAnalysis } from '../core/ref/reference-analysis.ts';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { CANDIDATE_QUALITY_AXES, candidateReviewPayload } from '../core/brief/candidate-review.ts';
import { digest, jsonBytes, fileReceipt, readReceipt, readBytes } from '../core/brief/candidate-data.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';

test('same valid captured set can refresh an authenticated reference-free analysis context', async t => {
  const f = fixture(t, true), set = await renderedSet(f);
  const before = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  const packet = JSON.parse(readReceipt(f.root, before.packet).toString('utf8'));
  const winner = before.aliases[0]!.alias;
  const review = { schema: 'candidate-eye-review-v2' as const, packet: before.packet,
    observations: before.aliases.map(alias => ({ alias: alias.alias, feasibility: 'pass' as const,
      structureRelationship: 'Supplied patch relationships remain visible.', densityTypeFit: 'The supplied strings fit.',
      responsiveFit: 'Both actual views are present.', findings: [],
      qualityAssessments: set.candidates[0]!.previews.flatMap(preview => CANDIDATE_QUALITY_AXES.map(axis => ({
        axis, viewId: preview.viewId, verdict: 'pass' as const,
        observation: 'Fixture review of this exact captured candidate.',
        consequence: 'The initial packet is qualified by this fixture review.',
      }))) })), winner, limitations: ['Synthetic test review, not human quality evidence.'],
    execution: { kind: 'isolated' as const, launchId: 'test-isolated-reference-refresh', outputSha256: digest({ winner }) } };
  const payloadSha256 = digest(candidateReviewPayload(review));
  write(f.root, '.omd/.cache/refresh-review.json', jsonBytes({ ...review,
    attestation: { kind: 'native-observation-v1', payloadSha256,
      signature: signNativeObservation(f.root, review.schema, payloadSha256) } }));
  const choice = { schema: 'candidate-selection-input-v2', candidateSet: before.candidateSet,
    selectedId: before.aliases[0]!.id, inputDigest: packet.inputDigest,
    decision: { decidedBy: 'agent', autonomyGrant: f.route.sourceContract.processPolicy!.autonomyGrant,
      eyeReview: fileReceipt(f.root, '.omd/.cache/refresh-review.json'), reviewIndependence: 'isolated' } };
  publishCandidateSelection(f.root, choice, f.writer, f.invocation);
  assert.equal(readCurrentCandidateSelection(f.root).decision.decidedBy, 'agent');
  const evidence = [{ status: 'user-provided', reference: 'request' }];
  const domain = JSON.stringify({ schema: 'domain-brief-v1', request: f.route.request,
    domain: 'Instrument launch', summary: 'Inspect supplied work',
    surfaces: [{ name: 'home', purpose: 'Inspect supplied work', evidence }],
    coreObjects: [{ name: 'Patch', evidence }], audience: { description: 'Instrument players', evidence },
    referenceQueries: { component: ['patch workspace'], craft: ['state feedback'], mood: ['work context'] },
    planning: { businessGoal: { text: 'Explore work', disposition: 'non-factual-working-decision' },
      successSignal: { text: 'Find work', disposition: 'non-factual-working-decision' },
      nonGoals: [{ text: 'No transactions', disposition: 'omit-from-production-claims' }] } });
  write(f.root, '.omd/domain-brief.json', domain);
  const gap = { referenceIds: [], coverage: 'brief-derived', gap: 'No admitted visual direction.',
    application: 'Preserve supplied task.', doNotTransfer: 'No unobserved capability.',
    reason: 'Only the supplied task is authoritative.' };
  publishReferenceAnalysis(f.root, { schema: 'reference-analysis-v1',
    sourceContractSha256: f.route.sourceContractSha256, domainBriefSha256: sha256(domain),
    references: [], selectedReferenceIds: [], patterns: [],
    screens: [{ surface: 'home', target: { route: '/', state: 'initial' },
      domain: gap, design: gap, checks: ['Inspect task hierarchy.'] }] },
  { sourceContractSha256: f.route.sourceContractSha256, request: f.route.request }, f.writer);
  assert.throws(() => currentCandidateReview(f.root, f.invocation), /current reference evidence differs/);
  const after = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  assert.deepEqual(after.candidateSet, before.candidateSet);
  assert.notDeepEqual(after.packet, before.packet);
  currentCandidateReview(f.root, f.invocation);
  assert.deepEqual(publishCandidatePacket(f.root, set, f.writer, f.invocation), after);
  let unchanged = snapshot(f.root);
  assert.throws(() => publishCandidateSelection(f.root, choice, f.writer, f.invocation), /exact host-attested isolated Eye output/);
  assert.throws(() => readCurrentCandidateSelection(f.root));
  assert.deepEqual(snapshot(f.root), unchanged);

  const analysis = readBytes(f.root, '.omd/reference-analysis.json');
  write(f.root, '.omd/reference-analysis.json', '{}');
  unchanged = snapshot(f.root);
  assert.throws(() => publishCandidatePacket(f.root, set, f.writer, f.invocation));
  assert.deepEqual(snapshot(f.root), unchanged);
  write(f.root, '.omd/reference-analysis.json', analysis.toString('utf8'));

  const pointerPath = '.omd/.cache/sketches/set.json', originalPointer = readBytes(f.root, pointerPath);
  const pointer = JSON.parse(originalPointer.toString('utf8'));
  pointer.aliases[0].alias = pointer.aliases[1].alias;
  write(f.root, pointerPath, jsonBytes(pointer));
  unchanged = snapshot(f.root);
  assert.throws(() => publishCandidatePacket(f.root, set, f.writer, f.invocation));
  assert.deepEqual(snapshot(f.root), unchanged);
  write(f.root, pointerPath, originalPointer.toString('utf8'));
  assert.deepEqual(publishCandidatePacket(f.root, set, f.writer, f.invocation), after);
});
