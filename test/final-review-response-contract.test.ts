import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';
import { digest } from '../core/measure/identity.ts';
import { loadReviewPolicy } from '../core/measure/review-policy.ts';
import { reviewProfileBinding } from '../core/runtime/trusted-review-profile.ts';
import {
  MEASURED_REVIEW_HANDBACK,
  MEASURED_REVIEW_TRANSPORT,
  measuredFinalRenderPacket,
} from '../core/runtime/trusted-measured-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

const sharedFixture = prepareFinalRenderReviewFixture();

test('measured blind packet supplies bindings rather than an unmeasured response template', async () => {
  const fixture = await sharedFixture;
  const packet = JSON.parse(measuredFinalRenderPacket(
    fixture.root,
    fixture.invocation,
    fixture.observationSha256s,
  ).toString('utf8'));
    const contract = packet.outputContract;

    assert.equal(packet.schema, MEASURED_REVIEW_TRANSPORT);
    assert.equal(contract.schema, MEASURED_REVIEW_HANDBACK);
    assert.equal(contract.lane, 'blindLane');
    assert.equal(contract.laneSchema, 'measured-blind-review-v1');
    assert.equal(contract.responseTemplate, undefined);
    assert.equal(contract.responseSchema, undefined);
    assert.deepEqual(
      contract.reviewerFields,
      [
        'schema',
        'lane',
        'verdicts',
        'criticalFloors',
        'designQuality',
        'observationSha256s',
        'routeSha256',
        'buildSha256',
        'briefSha256',
        'browserSha256',
        'evidenceSha256',
        'measurements',
        'reviewPolicySha256',
        'reviewProfile',
        'processBindingSha256',
        'findings',
      ],
    );
    assert.ok(contract.verdictKeys.includes('blindVisual'));
    assert.ok(contract.verdictKeys.includes('blindNarrative'));
    assert.ok(contract.criticalFloorKeys.includes('composition'));
    assert.ok(contract.criticalFloorKeys.includes('copy'));
});

test('measured packet binds current policy, profile, process, observations, and native measurements', async () => {
  const fixture = await sharedFixture;
  try {
    const packet = JSON.parse(measuredFinalRenderPacket(
      fixture.root,
      fixture.invocation,
      fixture.observationSha256s,
    ).toString('utf8'));
    const fixed = packet.outputContract.fixedBindings;
    const policy = loadReviewPolicy(fixture.root, fixture.invocation);

    assert.deepEqual(fixed.observationSha256s, fixture.observationSha256s);
    assert.equal(fixed.reviewPolicySha256, digest(policy));
    assert.deepEqual(fixed.reviewProfile, reviewProfileBinding('blindLane'));
    assert.match(fixed.processBindingSha256, /^[a-f0-9]{64}$/);
    assert.ok(Array.isArray(fixed.measurements));
    assert.ok(fixed.measurements.length > 0);
    assert.deepEqual(
      packet.evidence.measurementProjection.map(({ packetSha256 }: { packetSha256: string }) => packetSha256),
      fixed.measurements.map(({ sha256 }: { sha256: string }) => sha256),
    );
    assert.ok(packet.evidence.renders.every(
      ({ packetSha256 }: { packetSha256: string }) =>
        fixed.measurements.some(({ sha256 }: { sha256: string }) => sha256 === packetSha256),
    ));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
