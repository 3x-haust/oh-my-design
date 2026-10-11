import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { writeFrame } from '../core/frame/write.ts';
import { currentDeveloperCalibration } from '../core/coach/developer-calibration.ts';
import { buildBrief, formatBrief } from '../core/brief/index.ts';
import { prepareNativeMaker } from '../core/runtime/native-maker-packet.ts';
import { makeNativeSource } from '../core/runtime/native-maker.ts';
import { getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { parseNativePiRun } from '../core/runtime/native-pi-run-record.ts';
import { fixture } from './helpers/native-maker.ts';
import { calibrationFixture, calibrationFrame } from './helpers/developer-calibration.ts';

test('a pinned matching case reaches actual maker evidence without overriding the current request', async t => {
  const calibration = calibrationFixture({
    route: '/src/copy/index.html', surface: 'editorial', task: sha256('Read confirmation'),
  });
  const context = fixture(t, 'success', calibration);
  writeFrame(context.root, calibrationFrame, '', context.writer);
  const brief = buildBrief(context.root, 'production', context.packRoot, context.invocation);
  assert.equal(brief.developerCalibration?.cases.length, 1);
  assert.ok(formatBrief(brief).includes(calibration.digest));
  const prepared = prepareNativeMaker(context);
  const packet = JSON.parse(prepared.packet.toString('utf8'));
  const delivered = packet.evidence.context.developerCalibration;
  assert.equal(delivered.snapshotSha256, calibration.digest);
  assert.deepEqual(delivered.cases[0].developerSignal, { comparisonChoice: 'b', satisfaction: 'satisfied' });
  assert.equal(delivered.cases[0].authority, 'none');
  assert.deepEqual(packet.evidence.context.taskOutcome, context.routeInput.taskOutcome);
  const result = await makeNativeSource(context);
  assert.equal(result.receipt.role, 'omd-hand');
  assert.match(readFileSync(join(context.root, 'src/copy/confirmation.ts'), 'utf8'), /maker-fixture/);
  const run = getNativePiRun(context.invocation, context.root);
  assert.throws(() => parseNativePiRun({ ...run, calibration: { ...calibration, cases: [] } }));
});

test('different task or surface consumes no cases and never changes the pinned snapshot', t => {
  const calibration = calibrationFixture({
    route: '/src/copy/index.html', surface: 'editorial', task: sha256('Read confirmation'),
  });
  const context = fixture(t, 'success', calibration);
  const before = JSON.stringify(getNativePiRun(context.invocation, context.root).calibration);
  writeFrame(context.root, { ...calibrationFrame, uxTask: 'Delete all records' }, '', context.writer);
  assert.deepEqual(currentDeveloperCalibration(context.root, context.invocation)?.cases, []);
  writeFrame(context.root, { ...calibrationFrame, uxSurface: 'marketing' }, '', context.writer);
  assert.deepEqual(currentDeveloperCalibration(context.root, context.invocation)?.cases, []);
  assert.equal(JSON.stringify(getNativePiRun(context.invocation, context.root).calibration), before);
});

test('missing evaluation data leaves ordinary maker execution independent of an interview', async t => {
  const context = fixture(t);
  assert.equal(currentDeveloperCalibration(context.root, context.invocation), null);
  assert.equal((await makeNativeSource(context)).receipt.role, 'omd-hand');
});
