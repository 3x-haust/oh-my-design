import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReviewerContextBudget, reviewerTextTokenEstimate } from '../adapters/pi-reviewer-runtime.ts';

const packet = (textBytes: number, imageBytes = 0) => Buffer.from(JSON.stringify({
  evidence: { note: 'x'.repeat(textBytes), renders: [{ captureSha256: 'a'.repeat(64), pngBase64: 'A'.repeat(imageBytes) }] },
}));

test('reviewer evidence that fits the context is launched', () => {
  assert.doesNotThrow(() => assertReviewerContextBudget(packet(240_000), 500_000));
  // Hosts that do not report a window keep the byte cap as their only guard.
  assert.doesNotThrow(() => assertReviewerContextBudget(packet(2_400_000), undefined));
  // Image bytes are budgeted by the provider resize, not as text.
  assert.ok(reviewerTextTokenEstimate(packet(1_000, 4_000_000)) < 1_000);
});

test('reviewer evidence larger than the context is refused before a compacted answer can exist', () => {
  assert.throws(() => assertReviewerContextBudget(packet(1_000_000), 500_000), /packet-exceeds-reviewer-context/);
  assert.throws(() => assertReviewerContextBudget(packet(300_000), 128_000), /about \d+ evidence text tokens for a 128000-token/);
});
