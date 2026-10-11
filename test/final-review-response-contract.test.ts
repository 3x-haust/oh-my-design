import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import { finalRenderReviewerPacket } from '../core/runtime/final-render-review.ts';
import { nativeFinalLanePacket } from '../core/runtime/native-final-packet.ts';
import { DESIGN_QUALITY_AXES, parseDesignQualityContract } from '../core/evidence/final-v2-design-quality.ts';

for (const lane of ['blindLane', 'fidelityLane', 'protocolLane'] as const) {
  test(`${lane} supplies a complete response template with numeric floors and string findings`, () => {
    const fixture = prepareFinalRenderReviewFixture();
    try {
      const bytes = lane === 'blindLane'
        ? finalRenderReviewerPacket({ ...fixture, packetInput: {
          schema: 'adaptive-final-render-reviewer-packet-input-v1',
          observationSha256s: fixture.observationSha256s,
        } })
        : nativeFinalLanePacket({ ...fixture, lane });
      const packet = JSON.parse(bytes.toString());
      const contract = packet.outputContract;
      assert.ok(contract.responseTemplate, 'machine-readable response template is required');
      assert.equal(contract.responseTemplate.schema, contract.responseIdentity.schema);
      assert.equal(contract.responseTemplate.lane, lane);
      for (const [key, value] of Object.entries(contract.fixedBindings)) {
        assert.deepEqual(contract.responseTemplate[key], value);
      }
      assert.deepEqual(Object.keys(contract.responseTemplate.verdicts).sort(), [...contract.verdictKeys].sort());
      for (const key of contract.verdictKeys) {
        assert.equal(contract.responseTemplate.verdicts[key], null);
        assert.deepEqual(contract.responseSchema.properties.verdicts.properties[key].enum, ['GREEN', 'RED']);
      }
      for (const key of contract.criticalFloorKeys) {
        assert.equal(contract.responseTemplate.criticalFloors[key], null);
        assert.equal(contract.responseSchema.properties.criticalFloors.properties[key].type, 'number');
      }
      assert.equal(contract.responseSchema.additionalProperties, false);
      assert.equal(contract.responseSchema.properties.findings.items.type, 'string');
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });
}

test('blind quality template supports exact evidence-bound rejection without converting it into approval', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    const packet = JSON.parse(finalRenderReviewerPacket({ ...fixture, packetInput: {
      schema: 'adaptive-final-render-reviewer-packet-input-v1',
      observationSha256s: fixture.observationSha256s,
    } }).toString());
    assert.ok(packet.outputContract.responseTemplate, 'quality response template is required');
    const template = packet.outputContract.responseTemplate.designQuality;
    assert.deepEqual(template.axes.map((row: { axis: string }) => row.axis), DESIGN_QUALITY_AXES);
    const observations = packet.evidence.observationProjection.observations;
    const evidence = ['desktop', 'mobile'].map(viewport => {
      const row = observations.find((item: { viewport: string }) => item.viewport === viewport);
      assert.ok(row);
      return { observationSha256: row.observationSha256, viewport, state: row.state,
        region: 'main', visibleCondition: 'The required hierarchy is not visible.',
        userConsequence: 'The next action is unclear.' };
    });
    const rejected = { ...template, axes: template.axes.map((row: { axis: string }) => ({
      ...row, verdict: 'RED', score: 0, crossViewport: 'contradicted',
      criticalFailure: 'The main action is absent.', evidence,
    })) };
    assert.equal(parseDesignQualityContract(rejected, {
      expectedObservationSha256s: fixture.observationSha256s,
    }).axes.length, 6);
    assert.throws(() => parseDesignQualityContract({
      ...rejected, axes: rejected.axes.map((row: object) => ({ ...row, verdict: 'GREEN' })),
    }), /DESIGN_QUALITY_VERDICT_MISMATCH/);
    assert.throws(() => parseDesignQualityContract({ beautyDesirability: 3 }), /DESIGN_QUALITY_MALFORMED/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
