import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseMeasuredHandback } from '../adapters/measured-reviewer-publication.ts';
import {
  MEASURED_REVIEW_HANDBACK,
  measuredFinalRenderPacket,
} from '../core/runtime/trusted-measured-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

const sharedFixture = prepareFinalRenderReviewFixture('synth-marketing');

test('art-selected measured packet binds the exact current direction with no source payload', async () => {
  const fixture = await sharedFixture;
  const pointer = JSON.parse(readFileSync(
    join(fixture.root, '.omd', 'art-direction.json'),
    'utf8',
  )) as { sha256: string };
  const packet = JSON.parse(measuredFinalRenderPacket(
    fixture.root,
    fixture.invocation,
    fixture.observationSha256s,
    pointer.sha256,
  ).toString('utf8'));

  assert.equal(packet.outputContract.fixedBindings.artDirectionSha256, pointer.sha256);
  assert.ok(packet.outputContract.reviewerFields.includes('artDirectionSha256'));
  assert.equal(JSON.stringify(packet).includes('lawfulImplementationPath'), false);
  assert.equal(JSON.stringify(packet).includes('authorPayloadSha256'), false);
});

test('art-selected measured handback cannot replace the bound direction digest', async () => {
  const fixture = await sharedFixture;
  try {
    const pointer = JSON.parse(readFileSync(
      join(fixture.root, '.omd', 'art-direction.json'),
      'utf8',
    )) as { sha256: string };
    const packetBytes = measuredFinalRenderPacket(
      fixture.root,
      fixture.invocation,
      fixture.observationSha256s,
      pointer.sha256,
    );
    const packet = JSON.parse(packetBytes.toString('utf8'));
    const changed = {
      schema: MEASURED_REVIEW_HANDBACK,
      lane: 'blindLane',
      verdicts: Object.fromEntries(packet.outputContract.verdictKeys.map((key: string) => [key, 'GREEN'])),
      criticalFloors: Object.fromEntries(packet.outputContract.criticalFloorKeys.map((key: string) => [key, 4])),
      designQuality: { schema: 'design-quality-contract-v2', axes: [] },
      ...packet.outputContract.fixedBindings,
      artDirectionSha256: '0'.repeat(64),
      findings: [],
    };

    assert.throws(
      () => parseMeasuredHandback(
        fixture.root,
        fixture.invocation,
        changed,
        packetBytes,
        'blindLane',
      ),
      /measured reviewer binding changed: artDirectionSha256/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
