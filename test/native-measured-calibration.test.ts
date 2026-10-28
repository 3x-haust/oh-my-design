import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { measuredFinalRenderPacket } from '../core/runtime/trusted-measured-review.ts';
import { measuredTerminalFixture } from './helpers/measured-terminal.ts';
import { calibrationFixture, calibrationFrame } from './helpers/developer-calibration.ts';

test('current measured review receives the pinned matching examples without changing required outcomes', { timeout: 120_000 }, async t => {
  const calibration = calibrationFixture({
    route: '/src/copy/final.html', surface: 'editorial', task: sha256('Read confirmation'),
  });
  const f = await measuredTerminalFixture(t, {
    calibration, frame: { ...calibrationFrame,
      entrySurface: { ...calibrationFrame.entrySurface, entryPath: 'src/copy/final.html' } },
  });
  const packet = JSON.parse(measuredFinalRenderPacket(f.root, f.invocation, f.observationSha256s).toString('utf8'));
  assert.equal(packet.evidence.context.developerCalibration.snapshotSha256, calibration.digest);
  assert.equal(packet.evidence.context.developerCalibration.mode, 'validated');
  assert.deepEqual(packet.evidence.context.developerCalibration.cases.map((entry: { caseId: string }) => entry.caseId),
    calibration.cases.map(entry => entry.caseId));
  assert.deepEqual(packet.evidence.context.requiredOutcomes, f.route.requiredOutcomes);
  assert.deepEqual(packet.evidence.context.prohibitedOutcomes, f.route.prohibitedOutcomes);
});
