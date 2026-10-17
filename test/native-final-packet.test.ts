import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as packets from '../core/runtime/native-final-packet.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import {
  nativeOutcomeExecutionEvidence,
  validateCurrentOutcomeAssessments,
  validateNativeOutcomeAssessments,
} from '../core/runtime/native-outcome-review.ts';
import { finalRenderReviewerPacket } from '../core/runtime/final-render-review.ts';
import { observationV2Sha256, validateObservationV2 } from '../core/runtime/observation.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { publishConsultedReferences } from '../core/design/consulted-references.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { browserFixturePng } from './helpers/browser-observation-decision-links.ts';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

test('model-led final review uses the measured transport for every reviewer lane', async () => {
  const fixture = await prepareFinalRenderReviewFixture();
  try {
    const blind = JSON.parse(finalRenderReviewerPacket({
      ...fixture,
      packetInput: {
        schema: 'adaptive-final-render-reviewer-packet-input-v1',
        observationSha256s: fixture.observationSha256s,
      },
    }).toString());
    assert.equal(blind.schema, 'measured-final-reviewer-transport-v1');
    assert.equal(blind.outputContract.schema, 'measured-final-reviewer-handback-v1');
    assert.equal(blind.outputContract.lane, 'blindLane');
    for (const lane of ['fidelityLane', 'protocolLane'] as const) {
      const packet = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane }).toString());
      assert.equal(packet.schema, 'measured-final-reviewer-transport-v1');
      assert.equal(packet.outputContract.schema, 'measured-final-reviewer-handback-v1');
      assert.equal(packet.outputContract.lane, lane);
      assert.equal(packet.outputContract.responseIdentity, undefined);
      assert.deepEqual(
        [packet.outputContract.fixedBindings.reviewProfile.role, packet.outputContract.fixedBindings.reviewProfile.mode],
        ['omd-eye', lane === 'fidelityLane' ? 'fidelity' : 'protocol'],
      );
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('reported whole originals reach measured fidelity without leaking source locators or blind review', async () => {
  const fixture = await prepareFinalRenderReviewFixture();
  try {
    const route = readPersistedRoute(fixture.root, fixture.invocation);
    const png = browserFixturePng(16, 16);
    mkdirSync(join(fixture.root, '.omd/.cache'), { recursive: true });
    writeFileSync(join(fixture.root, '.omd/.cache/original.png'), png);
    const published = publishConsultedReferences(fixture.root, {
      schema: 'consulted-references-input-v1', requestSha256: hash(route.request),
      images: [{ path: '.omd/.cache/original.png', sha256: hash(png), sourceUrl: 'https://example.com/studio', role: 'primary' }],
    }, createTestProjectWriteAdapter(fixture.root, fixture.invocation));
    const fidelity = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }).toString());
    assert.equal(fidelity.evidence.consultedReferences.sha256, published.sha256);
    assert.equal(fidelity.evidence.referenceRenders[0].role, 'consulted-external-original');
    assert.equal(fidelity.evidence.referenceRenders[0].pngBase64, png.toString('base64'));
    assert.equal(JSON.stringify(fidelity).includes('example.com'), false);
    const protocol = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }).toString());
    assert.equal(protocol.evidence.referenceRenders.length, 0);
    const blind = JSON.parse(finalRenderReviewerPacket({ ...fixture, packetInput: {
      schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s: fixture.observationSha256s,
    } }).toString());
    assert.equal(blind.evidence.consultedReferenceRenders, undefined);
    writeFileSync(join(fixture.root, ".omd/consulted-references/images/" + hash(png) + ".png"), 'tampered');
    assert.throws(() => packets.nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane' }));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

for (const lane of ['fidelityLane', 'protocolLane'] as const) {
  test(`measured ${lane} binds exact production captures, profiles and source-free documents`, async () => {
    const fixture = await prepareFinalRenderReviewFixture();
    try {
      writeFileSync(join(fixture.root, '.omd/functional-requirements.json'), JSON.stringify({ screen: 'requested-screen' }));
      const packet = JSON.parse(packets.nativeFinalLanePacket({ ...fixture, lane }).toString());
      assert.equal(packet.evidence.renders.length, 2);
      assert.ok(packet.evidence.renders.every((image: { pngBase64: string }) => image.pngBase64.length > 0));
      assert.equal(packet.evidence.measurementProjection.length > 0, true);
      assert.equal(packet.evidence.observationProjection.length, 2);
      assert.ok(packet.evidence.documents.every((document: Record<string, unknown>) =>
        Object.keys(document).length === 1 && typeof document.sha256 === 'string'));
      assert.equal(packet.evidence.outcomeExecution, undefined);
      assert.deepEqual(
        [packet.outputContract.fixedBindings.reviewProfile.role, packet.outputContract.fixedBindings.reviewProfile.mode],
        ['omd-eye', lane === 'fidelityLane' ? 'fidelity' : 'protocol'],
      );
      assert.equal(packet.outputContract.reviewerFields.includes('outcomeAssessments'), false);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });
}

test('a forged observation digest cannot enter a measured native lane', async () => {
  const fixture = await prepareFinalRenderReviewFixture();
  try {
    assert.throws(() => packets.nativeFinalLanePacket({
      ...fixture, lane: 'fidelityLane', observationSha256s: ['a'.repeat(64)],
    }));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('outcome assessments still require exact current execution coverage', async () => {
  const fixture = await prepareFinalRenderReviewFixture();
  try {
    const observation = fixture.observationSha256s.at(-1);
    assert.ok(observation);
    const evidence = nativeOutcomeExecutionEvidence(fixture.root, fixture.invocation, observation);
    const assessments = evidence.outcomes.map(outcome => ({
      outcomeRef: outcome.outcomeRef, verdict: 'pass', rationale: 'Observed evidence supports this requirement.',
      receiptSha256: evidence.receiptSha256, executionPlanSha256: evidence.executionPlanSha256,
      captureSha256s: outcome.captures.map(capture => capture.sha256),
    }));
    assert.equal(validateNativeOutcomeAssessments(assessments, evidence).length, evidence.outcomes.length);
    assert.doesNotThrow(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, observation, assessments));
    assert.throws(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, observation, undefined));
    assert.throws(() => validateNativeOutcomeAssessments(assessments.slice(1), evidence));
    assert.throws(() => validateNativeOutcomeAssessments(
      assessments.map((row, index) => index === 0 ? { ...row, captureSha256s: ['c'.repeat(64)] } : row),
      evidence,
    ));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('changed measured capture bytes are refused before reviewer publication', async () => {
  const fixture = await prepareFinalRenderReviewFixture();
  try {
    const current = fixture.observationSha256s.at(-1);
    assert.ok(current);
    const observation = validateObservationV2(JSON.parse(readFileSync(
      join(fixture.root, `.omd/observation-v2/sha256-${current}.json`), 'utf8',
    )));
    const evidence = observation.evidence as Record<string, unknown>;
    const trusted = evidence.trustedOutcome as Record<string, unknown>;
    const receiptSha256 = String(trusted.receiptSha256);
    const receipt = JSON.parse(readFileSync(join(
      fixture.root, `.omd/trusted-browser-receipt-sha256-${receiptSha256}.json`,
    ), 'utf8')) as { captures: { path: string }[] };
    const capturePath = receipt.captures[0]?.path;
    assert.ok(capturePath);
    writeFileSync(join(fixture.root, capturePath), 'tampered');
    assert.throws(() => packets.nativeFinalLanePacket({ ...fixture, lane: 'protocolLane' }), /capture|artifact|changed/i);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('legacy observation descriptors remain readable without inventing outcome authority', async () => {
  const fixture = await prepareFinalRenderReviewFixture();
  try {
    const current = fixture.observationSha256s.at(-1);
    assert.ok(current);
    const value = validateObservationV2(JSON.parse(readFileSync(
      join(fixture.root, `.omd/observation-v2/sha256-${current}.json`), 'utf8',
    )));
    assert.ok(typeof value.evidence === 'object' && value.evidence !== null && !Array.isArray(value.evidence));
    const legacy = { ...value, evidence: Object.fromEntries(
      Object.entries(value.evidence).filter(([key]) => key !== 'trustedOutcome'),
    ) };
    const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
    const digest = hash(bytes);
    const semantic = observationV2Sha256(legacy);
    assert.notEqual(digest, semantic);
    const path = '.omd/legacy-observation.json';
    writeFileSync(join(fixture.root, path), bytes);
    assert.doesNotThrow(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, digest, undefined, path));
    assert.throws(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, digest, [], path),
      /assessments require executed outcome evidence/);
    assert.throws(() => validateCurrentOutcomeAssessments(fixture.root, fixture.invocation, current, undefined, path),
      /observation changed/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
