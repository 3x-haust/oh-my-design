/**
 * Tests for the cross-page site consistency check in core/site/index.ts.
 *
 * All tests are pure: they construct synthetic Invariants and call checkSite
 * directly without a browser or filesystem. The assertions verify the exact
 * conditions documented on checkSite: SITE-LADDER-DRIFT fires when any ladder's
 * step count differs by more than 1, SITE-TOKEN-DRIFT fires when token coverage
 * varies by more than 0.3.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSite } from '../core/site/index.ts';
import type { Invariants } from '../core/types.ts';

/** A fully-populated Invariants fixture: consistent 4-step type scale, healthy token coverage. */
const base: Invariants = {
  spacingLadder: [4, 8, 16, 24],
  radiusLadder: [4, 8, 12],
  elevationLevels: 2,
  centeredRatio: 0.1,
  tokenCoverage: 0.9,
  paddingWeight: 16,
  typeScale: [13, 14, 16, 21],       // 4 steps
  fontFamilies: ['inter'],
  weightLadder: [400, 600],
  motionDurations: [120, 200],
  easingVocab: ['ease-out'],
  animatedShare: 0.05,
  hoverCoverage: 0.8,
  focusCoverage: 0.6,
  animatedProperties: ['opacity', 'transform'],
  hasReducedMotion: true,
  scrollChoreography: [],
};

// ── No violations ─────────────────────────────────────────────────────────────

test('returns empty array for a single page', () => {
  const result = checkSite([{ path: 'index.html', invariants: base }]);
  assert.deepEqual(result, []);
});

test('no violations when two identical pages are compared', () => {
  const result = checkSite([
    { path: 'index.html', invariants: base },
    { path: 'post.html', invariants: base },
  ]);
  assert.deepEqual(result, []);
});

test('no violations when three pages agree on all ladders and token coverage', () => {
  const result = checkSite([
    { path: 'index.html', invariants: base },
    { path: 'about.html', invariants: base },
    { path: 'contact.html', invariants: base },
  ]);
  assert.deepEqual(result, []);
});

// ── Type scale drift ──────────────────────────────────────────────────────────

test('SITE-LADDER-DRIFT fires when type scale length differs by 2 (4 vs 6)', () => {
  const sixStep = { ...base, typeScale: [12, 13, 14, 16, 21, 32] }; // 6 steps
  const result = checkSite([
    { path: 'index.html', invariants: base },       // 4 steps
    { path: 'post.html', invariants: sixStep },
  ]);
  const drift = result.filter((v) => v.id === 'SITE-LADDER-DRIFT');
  assert.ok(drift.length > 0, 'SITE-LADDER-DRIFT should fire');
  assert.ok(drift.some((v) => v.message.includes('type scale')));
});

test('SITE-LADDER-DRIFT does not fire when type scale differs by exactly 1 step', () => {
  const fiveStep = { ...base, typeScale: [13, 14, 16, 21, 32] }; // 5 steps (diff = 1)
  const result = checkSite([
    { path: 'index.html', invariants: base },       // 4 steps
    { path: 'post.html', invariants: fiveStep },
  ]);
  assert.ok(
    !result.some((v) => v.id === 'SITE-LADDER-DRIFT' && v.message.includes('type scale')),
    'diff of 1 is tolerated',
  );
});

// ── Spacing drift ─────────────────────────────────────────────────────────────

test('SITE-LADDER-DRIFT fires when spacing ladder length differs by 2', () => {
  const twoStepSpacing = { ...base, spacingLadder: [8, 16] }; // 2 steps vs 4
  const result = checkSite([
    { path: 'a.html', invariants: base },
    { path: 'b.html', invariants: twoStepSpacing },
  ]);
  const drift = result.filter((v) => v.id === 'SITE-LADDER-DRIFT');
  assert.ok(drift.some((v) => v.message.includes('spacing')));
});

test('SITE-LADDER-DRIFT does not fire when spacing ladder differs by 1', () => {
  const threeStepSpacing = { ...base, spacingLadder: [8, 16, 24] }; // 3 steps vs 4
  const result = checkSite([
    { path: 'a.html', invariants: base },           // 4 steps
    { path: 'b.html', invariants: threeStepSpacing },
  ]);
  assert.ok(
    !result.some((v) => v.id === 'SITE-LADDER-DRIFT' && v.message.includes('spacing')),
    'diff of 1 is tolerated',
  );
});

// ── Radius drift ──────────────────────────────────────────────────────────────

test('SITE-LADDER-DRIFT fires when radius ladder length differs by 2', () => {
  const fiveStepRadius = { ...base, radiusLadder: [2, 4, 8, 12, 16] }; // 5 steps vs 3
  const result = checkSite([
    { path: 'a.html', invariants: base },
    { path: 'b.html', invariants: fiveStepRadius },
  ]);
  assert.ok(result.some((v) => v.id === 'SITE-LADDER-DRIFT' && v.message.includes('radius')));
});

// ── Token coverage drift ──────────────────────────────────────────────────────

test('SITE-TOKEN-DRIFT fires when token coverage range exceeds 0.3', () => {
  const lowCoverage = { ...base, tokenCoverage: 0.5 }; // 0.9 - 0.5 = 0.4 > 0.3
  const result = checkSite([
    { path: 'index.html', invariants: base },           // 0.9
    { path: 'post.html', invariants: lowCoverage },     // 0.5
  ]);
  assert.ok(result.some((v) => v.id === 'SITE-TOKEN-DRIFT'), 'SITE-TOKEN-DRIFT should fire');
});

test('SITE-TOKEN-DRIFT does not fire when token coverage range is exactly 0.3', () => {
  const slightlyLower = { ...base, tokenCoverage: 0.6 }; // 0.9 - 0.6 = 0.3 (threshold is > 0.3)
  const result = checkSite([
    { path: 'index.html', invariants: base },
    { path: 'post.html', invariants: slightlyLower },
  ]);
  assert.ok(
    !result.some((v) => v.id === 'SITE-TOKEN-DRIFT'),
    'range of exactly 0.3 is tolerated',
  );
});

test('SITE-TOKEN-DRIFT fires for 0.9 vs 0.1 (extreme drift)', () => {
  const noCoverage = { ...base, tokenCoverage: 0.1 };
  const result = checkSite([
    { path: 'a.html', invariants: base },
    { path: 'b.html', invariants: noCoverage },
  ]);
  const drift = result.filter((v) => v.id === 'SITE-TOKEN-DRIFT');
  assert.ok(drift.length > 0);
  // Message should include the per-page breakdown
  assert.ok(drift[0]!.message.includes('0.90') || drift[0]!.message.includes('0.9'));
});

// ── Multi-page comparisons ────────────────────────────────────────────────────

test('three-page comparison catches drift on the odd-one-out page', () => {
  const drifted = { ...base, typeScale: [12, 13, 14, 16, 21, 32] }; // 6 steps vs 4
  const result = checkSite([
    { path: 'a.html', invariants: base },
    { path: 'b.html', invariants: base },
    { path: 'c.html', invariants: drifted },
  ]);
  assert.ok(result.some((v) => v.id === 'SITE-LADDER-DRIFT'));
});

test('all pages listed in violation.pages', () => {
  const drifted = { ...base, typeScale: [12, 13, 14, 16, 21, 32] };
  const result = checkSite([
    { path: 'a.html', invariants: base },
    { path: 'b.html', invariants: drifted },
  ]);
  const ldrViolation = result.find((v) => v.id === 'SITE-LADDER-DRIFT');
  assert.ok(ldrViolation !== undefined);
  assert.ok(ldrViolation!.pages.includes('a.html'));
  assert.ok(ldrViolation!.pages.includes('b.html'));
});

test('violations have severity warn', () => {
  const drifted = { ...base, typeScale: [12, 13, 14, 16, 21, 32] };
  const result = checkSite([
    { path: 'a.html', invariants: base },
    { path: 'b.html', invariants: drifted },
  ]);
  for (const v of result) {
    assert.equal(v.severity, 'warn');
  }
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test('empty token object does not cause token drift', () => {
  // No tokens field → treated as no token set → token drift still uses tokenCoverage
  const result = checkSite([
    { path: 'a.html', invariants: base, tokens: {} },
    { path: 'b.html', invariants: base, tokens: {} },
  ]);
  assert.deepEqual(result, []);
});

test('pages with empty ladders on both sides produce no drift', () => {
  const noLadders = { ...base, typeScale: [], spacingLadder: [], radiusLadder: [] };
  const result = checkSite([
    { path: 'a.html', invariants: noLadders },
    { path: 'b.html', invariants: noLadders },
  ]);
  assert.deepEqual(result, []);
});
