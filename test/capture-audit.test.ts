import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditCaptureTimes } from '../core/ref/capture-audit.ts';

const NOW = Date.parse('2026-07-21T12:00:00.000Z');
const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

test('auditCaptureTimes flags a sequential capture pass (large median gap)', () => {
  // four captures ~60s apart — a separate browser launch each
  const a = auditCaptureTimes([iso(300_000), iso(240_000), iso(180_000), iso(120_000)], NOW);
  assert.equal(a.ok, false);
  assert.equal(a.refs, 4);
  assert.ok(a.medianGapSeconds >= 15, `expected a large median gap, got ${a.medianGapSeconds}s`);
  assert.match(a.reason, /captured sequentially/i);
});

test('auditCaptureTimes passes a batched capture (tight cluster)', () => {
  const a = auditCaptureTimes([iso(10_000), iso(8_000), iso(6_000), iso(4_000)], NOW);
  assert.equal(a.ok, true);
  assert.equal(a.refs, 4);
});

test('auditCaptureTimes passes when fewer than four recent captures', () => {
  const a = auditCaptureTimes([iso(300_000), iso(240_000), iso(180_000)], NOW);
  assert.equal(a.ok, true);
  assert.equal(a.refs, 3);
});

test('auditCaptureTimes ignores captures older than the recent window', () => {
  const sevenHours = 7 * 60 * 60 * 1000;
  const a = auditCaptureTimes(
    [iso(sevenHours + 300_000), iso(sevenHours + 240_000), iso(sevenHours + 180_000), iso(sevenHours + 120_000)],
    NOW,
  );
  assert.equal(a.ok, true);
  assert.equal(a.refs, 0);
});

test('auditCaptureTimes tolerates a lone late straggler among a batched set', () => {
  // three tight captures + one much later — median gap stays small, so it passes
  const a = auditCaptureTimes([iso(600_000), iso(12_000), iso(10_000), iso(8_000)], NOW);
  assert.equal(a.ok, true);
});
