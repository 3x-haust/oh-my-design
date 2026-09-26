import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as packets from '../core/runtime/native-final-packet.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

for (const lane of ['fidelityLane', 'protocolLane'] as const) {
  test(`Given authenticated observations When ${lane} packet is derived Then bindings and production images are host-derived`, () => {
    const fixture = prepareFinalRenderReviewFixture();
    try {
      writeFileSync(join(fixture.root, '.omd/functional-requirements.json'), JSON.stringify({ screen: 'requested-screen' }));
      const bytes = packets.nativeFinalLanePacket({ ...fixture, lane });
      const packet = JSON.parse(bytes.toString());
      assert.equal(packet.schema, 'native-pi-final-lane-transport-v1');
      assert.equal(packet.outputContract.lane, lane);
      assert.deepEqual(packet.outputContract.fixedBindings.observationSha256s, fixture.observationSha256s);
      assert.equal(packet.outputContract.fixedBindings.briefSha256, fixture.invocation.current.briefSha256);
      assert.ok(packet.evidence.renders.every((image: { pngBase64: string }) => image.pngBase64.length > 0));
      assert.equal(packet.evidence.referenceRenders.length, 0);
      assert.ok(packet.evidence.documents.some((doc: { path: string }) => doc.path === '.omd/copy-deck.md'));
      assert.ok(packet.evidence.documents.some((doc: { path: string }) => doc.path === '.omd/functional-requirements.json'));
      writeFileSync(join(fixture.root, '.omd/copy-deck.md'), '# Changed copy\n');
      assert.notDeepEqual(packets.nativeFinalLanePacket({ ...fixture, lane }), bytes);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });
}

test('Given a forged observation digest When deriving a native packet Then it is refused before publication', () => {
  const fixture = prepareFinalRenderReviewFixture();
  try {
    assert.throws(() => packets.nativeFinalLanePacket({ ...fixture, lane: 'fidelityLane', observationSha256s: ['a'.repeat(64)] }));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
