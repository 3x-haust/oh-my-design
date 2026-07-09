import { test } from 'node:test';
import assert from 'node:assert/strict';
import { similarity } from '../core/ref/distance.ts';
import type { Invariants } from '../core/types.ts';

/** Linear's real invariants, measured from https://linear.app. */
const LINEAR: Invariants = {
  spacingLadder: [1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 40, 48],
  radiusLadder: [4, 6, 8, 12, 16, 50, 9999],
  elevationLevels: 3,
  centeredRatio: 0.0929,
  tokenCoverage: 0.7068,
  paddingWeight: 10.47,
};

const WARN = 0.6;

// Found in review: Jaccard punished a long ladder for being long. Linear's thirteen
// spacing values scored 0.632 against any five-rung 8pt scale — over the copying
// threshold — purely because a long ladder contains the common values by accident.
test('a long ladder does not read as copied by any ordinary 8pt scale', () => {
  const ordinary: Invariants = { ...LINEAR, spacingLadder: [4, 8, 12, 16, 24], radiusLadder: [8] };
  assert.ok(similarity(LINEAR, ordinary) < WARN, `scored ${similarity(LINEAR, ordinary)}`);
});

test('but a page that reproduces the whole ladder still reads as copied', () => {
  const copy: Invariants = { ...LINEAR, centeredRatio: 0.12, tokenCoverage: 0.68 };
  assert.ok(similarity(LINEAR, copy) >= WARN);
});

// Found in review: `1 - |a-b| / max(a,b,1)` is scale-dependent. A 30px padding gap scored
// 0.25 at (10,40) and 0.77 at (100,130) — the same gap, two verdicts. Padding is felt as
// a proportion, so the comparison happens in log space.
test('padding similarity does not depend on absolute scale', () => {
  const at = (w: number): Invariants => ({ ...LINEAR, paddingWeight: w });
  const tight = similarity(at(10), at(40));
  const airy = similarity(at(100), at(130));
  assert.ok(Math.abs(tight - airy) < 0.12, `tight=${tight} airy=${airy}: the same 30px gap must score alike`);
});

test('a genuinely airier design is still distinguished from a tight one', () => {
  const at = (w: number): Invariants => ({ ...LINEAR, paddingWeight: w });
  assert.ok(similarity(at(8), at(64)) < similarity(at(8), at(12)));
});

// The properties the whole defence rests on.
test('identity is exactly 1 and symmetry holds after the rewrite', () => {
  assert.equal(similarity(LINEAR, LINEAR), 1);
  const other: Invariants = { spacingLadder: [5, 10], radiusLadder: [24], elevationLevels: 0, centeredRatio: 0.9, tokenCoverage: 0.05, paddingWeight: 60 };
  assert.equal(similarity(LINEAR, other), similarity(other, LINEAR));
});

test('an opposite design scores far below the threshold', () => {
  const opposite: Invariants = { spacingLadder: [5, 10, 15], radiusLadder: [24], elevationLevels: 0, centeredRatio: 0.95, tokenCoverage: 0.05, paddingWeight: 60 };
  assert.ok(similarity(LINEAR, opposite) < 0.3);
});

test('empty ladders never yield NaN', () => {
  const empty: Invariants = { spacingLadder: [], radiusLadder: [], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 0 };
  for (const s of [similarity(LINEAR, empty), similarity(empty, LINEAR), similarity(empty, empty)]) {
    assert.ok(Number.isFinite(s) && s >= 0 && s <= 1);
  }
});
