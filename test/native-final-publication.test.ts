import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { finalRenderReviewerPacket } from '../core/runtime/final-render-review.ts';
import {
  finalizeNativeEvidence,
  runNativeFinalReview,
} from '../core/runtime/native-final-publication.ts';
import { MEASURED_REVIEW_TRANSPORT } from '../core/runtime/trusted-measured-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

test('model-led final publication prepares a measured blind review instead of caller-authored lanes', async t => {
  const fixture = await prepareFinalRenderReviewFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  const packet = JSON.parse(finalRenderReviewerPacket({
    ...fixture,
    packetInput: {
      schema: 'adaptive-final-render-reviewer-packet-input-v1',
      observationSha256s: fixture.observationSha256s,
    },
  }).toString('utf8'));

  assert.equal(packet.schema, MEASURED_REVIEW_TRANSPORT);
  assert.equal(packet.outputContract.schema, 'measured-final-reviewer-handback-v1');
  assert.equal(packet.outputContract.lane, 'blindLane');
  assert.equal(packet.outputContract.responseTemplate, undefined);
  assert.ok(packet.outputContract.fixedBindings.reviewPolicySha256);
  assert.ok(packet.outputContract.fixedBindings.measurements.length > 0);
});

test('measured final publication refuses incomplete terminal evidence without publishing review state', async t => {
  const fixture = await prepareFinalRenderReviewFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  await assert.rejects(
    runNativeFinalReview({ root: fixture.root, invocation: fixture.invocation, signal: t.signal }),
    /source-seal|could not be read stably/i,
  );
  assert.equal(existsSync(join(fixture.root, '.omd/final-review/native-current.json')), false);
  assert.equal(existsSync(join(fixture.root, '.omd/final-evidence-v2.json')), false);
});

test('unauthenticated local authority cannot run or finalize native review', async t => {
  const fixture = await prepareFinalRenderReviewFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const invocation = {
    ...fixture.invocation,
    authority: undefined,
  } as typeof fixture.invocation;

  await assert.rejects(
    runNativeFinalReview({ root: fixture.root, invocation }),
    /native Pi command|authority|activation/i,
  );
  assert.throws(
    () => finalizeNativeEvidence({ root: fixture.root, invocation }),
    /native Pi command|authority|activation/i,
  );
  assert.equal(existsSync(join(fixture.root, '.omd/final-evidence-v2.json')), false);
});
