import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { measuredFinalRenderPacket } from '../core/runtime/trusted-measured-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

const sharedFixture = prepareFinalRenderReviewFixture('copy-only', { withGraphHistory: true });

test('measured final packet validates history but exposes only terminal render measurements', async () => {
  const fixture = await sharedFixture;
  const packet = JSON.parse(measuredFinalRenderPacket(
    fixture.root,
    fixture.invocation,
    fixture.observationSha256s,
  ).toString('utf8'));
    const terminal = fixture.observationSha256s.at(-1);
    assert.ok(terminal);
    assert.equal(fixture.observationSha256s.length, 2);
    assert.deepEqual(
      packet.outputContract.fixedBindings.observationSha256s,
      fixture.observationSha256s,
    );
    assert.ok(packet.evidence.renders.length >= 2);
    assert.ok(packet.evidence.renders.every(
      ({ observationSha256 }: { observationSha256: string }) =>
        observationSha256 === terminal,
    ));
    assert.ok(packet.evidence.observationProjection.every(
      ({ observationSha256 }: { observationSha256: string }) =>
        observationSha256 === terminal,
    ));
    assert.equal(
      JSON.stringify(packet.evidence).includes(fixture.observationSha256s[0]!),
      false,
    );
});

test('measured final packet refuses damaged native measurement bytes without mutating the current pointer', async () => {
  const fixture = await sharedFixture;
  try {
    const packet = JSON.parse(measuredFinalRenderPacket(
      fixture.root,
      fixture.invocation,
      fixture.observationSha256s,
    ).toString('utf8'));
    const measurement = packet.outputContract.fixedBindings.measurements[0] as {
      path: string;
    } | undefined;
    assert.ok(measurement);
    writeFileSync(join(fixture.root, measurement.path), '{}');
    const pointer = join(fixture.root, '.omd', 'observation-v2.json');
    const pointerBefore = readFileSync(pointer);

    assert.throws(
      () => measuredFinalRenderPacket(
        fixture.root,
        fixture.invocation,
        fixture.observationSha256s,
      ),
      /packet bytes changed/,
    );
    assert.deepEqual(readFileSync(pointer), pointerBefore);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
