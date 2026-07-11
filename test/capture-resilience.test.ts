/**
 * Tests for the block-page heuristic in core/render/index.ts.
 *
 * All tests exercise detectBlockReason — the pure function that inspects a
 * page title, visible body-text length, and HTTP status, and returns either a
 * block-reason string or null. No browser is required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBlockReason } from '../core/render/index.ts';

// ── HTTP status signals ──────────────────────────────────────────────────────

test('HTTP 403 is a block signal', () => {
  const reason = detectBlockReason('', 5000, 403);
  assert.ok(reason !== null, 'should detect block');
  assert.ok(reason!.includes('403'));
});

test('HTTP 500 is a block signal', () => {
  const reason = detectBlockReason('My Site', 5000, 500);
  assert.ok(reason !== null);
  assert.ok(reason!.includes('500'));
});

test('HTTP 502 is a block signal', () => {
  assert.ok(detectBlockReason('', 5000, 502) !== null);
});

test('HTTP 200 is not a block signal on its own', () => {
  assert.equal(detectBlockReason('My Site', 5000, 200), null);
});

test('null HTTP status (file URL or unknown) does not trigger status check', () => {
  // Should not block on status alone — fall through to other checks.
  const reason = detectBlockReason('My Site', 5000, null);
  assert.equal(reason, null);
});

// ── Challenge-title signals ──────────────────────────────────────────────────

test('"Just a moment..." (Cloudflare) is a block signal', () => {
  const reason = detectBlockReason('Just a moment...', 1200, 200);
  assert.ok(reason !== null);
  assert.ok(reason!.includes('challenge page'));
});

test('"Attention Required!" is a block signal', () => {
  assert.ok(detectBlockReason('Attention Required!', 1200, 200) !== null);
});

test('"Access Denied" is a block signal', () => {
  assert.ok(detectBlockReason('Access Denied', 1200, 200) !== null);
});

test('"Checking your browser" is a block signal', () => {
  assert.ok(detectBlockReason('Checking your browser', 1200, 200) !== null);
});

test('"Are you human?" is a block signal', () => {
  assert.ok(detectBlockReason('Are you human? Please verify', 1200, 200) !== null);
});

test('"One more step" is a block signal', () => {
  assert.ok(detectBlockReason('One more step', 1200, 200) !== null);
});

test('Pattern matching is case-insensitive', () => {
  assert.ok(detectBlockReason('JUST A MOMENT', 1200, 200) !== null);
  assert.ok(detectBlockReason('just a moment...', 1200, 200) !== null);
});

test('A normal page title is not a block signal', () => {
  assert.equal(detectBlockReason('Linear — Project Management', 5000, 200), null);
});

test('A title mentioning "moment" mid-sentence is not flagged', () => {
  // "Just a moment" pattern requires the phrase to start the title.
  assert.equal(detectBlockReason('This moment changed everything', 5000, 200), null);
});

// ── Near-empty body signal ───────────────────────────────────────────────────

test('body text < 200 chars is a block signal', () => {
  const reason = detectBlockReason('My Site', 50, 200);
  assert.ok(reason !== null);
  assert.ok(reason!.includes('near-empty body'));
  assert.ok(reason!.includes('50'));
});

test('body text exactly 199 chars is a block signal', () => {
  assert.ok(detectBlockReason('My Site', 199, 200) !== null);
});

test('body text exactly 200 chars is NOT a block signal', () => {
  assert.equal(detectBlockReason('My Site', 200, 200), null);
});

test('body text 0 chars is a block signal', () => {
  assert.ok(detectBlockReason('', 0, 200) !== null);
});

// ── Priority: HTTP status beats title beats body ─────────────────────────────

test('HTTP 403 is reported even when title and body also look blocked', () => {
  const reason = detectBlockReason('Just a moment...', 10, 403);
  assert.ok(reason !== null);
  assert.ok(reason!.includes('HTTP 403'), 'HTTP status should be the reported reason');
});

test('challenge title is reported when status is OK but body is also short', () => {
  // Title check runs before body check, so the challenge-title reason wins.
  const reason = detectBlockReason('Just a moment...', 10, 200);
  assert.ok(reason !== null);
  assert.ok(reason!.includes('challenge page'), 'challenge-title reason should be reported');
});

// ── Valid pages pass all checks ───────────────────────────────────────────────

test('a normal well-populated page produces no block reason', () => {
  const longBody = 'x'.repeat(1500);
  assert.equal(detectBlockReason('Linear — Project Management', longBody.length, 200), null);
});
