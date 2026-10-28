import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import {
  initialReviewerConfigurationCount,
  runPiReviewerLane,
} from '../adapters/pi-reviewer-runtime.ts';
import { PiReviewerError } from '../adapters/pi-reviewer-contract.ts';
import { finalRenderReviewerPacket } from '../core/runtime/final-render-review.ts';
import { measuredReviewerTask } from '../core/runtime/trusted-review-profile.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

async function setup(t: TestContext) {
  const fixture = await prepareFinalRenderReviewFixture();
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const packet = finalRenderReviewerPacket({
    ...fixture,
    packetInput: {
      schema: 'adaptive-final-render-reviewer-packet-input-v1',
      observationSha256s: fixture.observationSha256s,
    },
  });
  return {
    root: fixture.root,
    invocation: fixture.invocation,
    packet,
    lane: 'blindLane' as const,
    task: measuredReviewerTask('blindLane'),
  };
}

test('reviewer runtime accepts the source-owned measured task and rejects legacy task text', async t => {
  const input = await setup(t);

  await assert.rejects(
    runPiReviewerLane({ ...input, task: 'Review the final render.', signal: t.signal }),
    error => error instanceof PiReviewerError && error.code === 'task-not-source-owned',
  );
  await assert.rejects(
    runPiReviewerLane({ ...input, signal: t.signal }),
    /child-exited:1:unknown command --mode/,
  );
});

test('reviewer runtime refuses oversized evidence before any route or child execution', async t => {
  const input = await setup(t);
  await assert.rejects(
    runPiReviewerLane({
      ...input,
      packet: Buffer.alloc(16 * 1024 * 1024 + 1),
      signal: t.signal,
    }),
    error => error instanceof PiReviewerError && error.code === 'packet-too-large',
  );
});

test('reviewer configuration parser accepts only the empty host-authored effort update', () => {
  assert.equal(initialReviewerConfigurationCount({
    data: {
      messages: [{
        role: 'configurationUpdate',
        effort: 'high',
        content: [],
        timestamp: 1,
      }],
    },
  }, 'high'), 1);
  assert.equal(initialReviewerConfigurationCount({ data: { messages: [] } }, 'high'), 0);
  assert.throws(
    () => initialReviewerConfigurationCount({
      data: {
        messages: [{
          role: 'configurationUpdate',
          effort: 'medium',
          content: [],
          timestamp: 1,
        }],
      },
    }, 'high'),
    error => error instanceof PiReviewerError && error.code === 'initial-conversation-history',
  );
});
