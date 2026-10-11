import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { finalRenderReviewerPacket } from '../core/runtime/final-render-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import { loadDesignQualityObservationBindings } from '../core/evidence/final-v2-browser-observations.ts';
import { assertDesignQualityGreen, DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-design-quality.ts';
import { nodeStableProjectFileSystem } from '../core/runtime/stable-project-file.ts';

test('final visual packet validates historical graphs but delivers only current terminal pixels', () => {
  const fixture = prepareFinalRenderReviewFixture('copy-only', { withGraphHistory: true });
  try {
    const packet = JSON.parse(finalRenderReviewerPacket({
      root: fixture.root, invocation: fixture.invocation,
      packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s: fixture.observationSha256s },
    }).toString('utf8'));
    assert.equal(fixture.observationSha256s.length, 2);
    assert.equal(packet.evidence.renders.length, 2);
    assert.equal(packet.evidence.observationProjection.observations.length, 2);
    for (const row of packet.evidence.renders) {
      assert.equal(row.observationSha256, fixture.observationSha256s.at(-1));
    }
    assert.deepEqual(packet.outputContract.fixedBindings.observationSha256s, fixture.observationSha256s);
    const historical = readdirSync(join(fixture.root, '.omd', 'decision-graphs'))[0];
    assert.ok(historical);
    writeFileSync(join(fixture.root, '.omd', 'decision-graphs', historical), '{}');
    const pointer = join(fixture.root, '.omd', 'observation-v2.json');
    const pointerBefore = readFileSync(pointer);
    assert.throws(() => finalRenderReviewerPacket({
      root: fixture.root, invocation: fixture.invocation,
      packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s: fixture.observationSha256s },
    }), /decision graph bytes/);
    assert.deepEqual(readFileSync(pointer), pointerBefore);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('final design quality cannot cite predecessor captures even with an intact historical chain', () => {
  const fixture = prepareFinalRenderReviewFixture('copy-only', { withGraphHistory: true });
  try {
    const packet = JSON.parse(finalRenderReviewerPacket({
      root: fixture.root, invocation: fixture.invocation,
      packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s: fixture.observationSha256s },
    }).toString('utf8'));
    const options = {
      expectedObservationSha256s: fixture.observationSha256s,
      expectedObservationBindings: loadDesignQualityObservationBindings(
        fixture.root, nodeStableProjectFileSystem(), fixture.observationSha256s,
      ),
    };
    const quality = (observationSha256: string) => ({
      schema: 'design-quality-contract-v1',
      axes: DESIGN_QUALITY_AXES.map(axis => ({
        axis, verdict: 'GREEN', score: 4, crossViewport: 'preserved', criticalFailure: null,
        evidence: packet.evidence.renders.map((row: { viewport: string; state: string }) => ({
          observationSha256, viewport: row.viewport, state: row.state, region: 'work object',
          visibleCondition: 'The active record and its next action are visible.',
          userConsequence: 'The task can be understood from the presented state.',
        })),
      })),
    });
    const before = fixture.observationSha256s[0];
    const terminal = fixture.observationSha256s.at(-1);
    assert.ok(before);
    assert.ok(terminal);
    assert.doesNotThrow(() => assertDesignQualityGreen(quality(terminal), options));
    assert.throws(() => assertDesignQualityGreen(quality(before), options), /DESIGN_QUALITY_EVIDENCE_INVALID/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
