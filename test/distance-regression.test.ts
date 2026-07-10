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
  typeScale: [13, 14, 16, 21],
  fontFamilies: ['inter'],
  weightLadder: [400, 510],
  motionDurations: [100, 160],
  easingVocab: ['ease', 'ease-out'],
  animatedShare: 0.05,
  hoverCoverage: 0,
  focusCoverage: 0,
};

const WARN = 0.6;

// Found in review: Jaccard punished a long ladder for being long. Linear's thirteen
// spacing values scored 0.632 against any five-rung 8pt scale — over the copying
// threshold — purely because a long ladder contains the common values by accident.
test('a long ladder does not read as copied by any ordinary 8pt scale', () => {
  const ordinary: Invariants = {
    ...LINEAR, spacingLadder: [4, 8, 12, 16, 24], radiusLadder: [8],
    typeScale: [16, 24, 32], fontFamilies: ['georgia'], weightLadder: [400, 700],
    motionDurations: [], easingVocab: [], animatedShare: 0,
  };
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
  const other: Invariants = {
    spacingLadder: [5, 10], radiusLadder: [24], elevationLevels: 0, centeredRatio: 0.9, tokenCoverage: 0.05, paddingWeight: 60,
    typeScale: [18, 30], fontFamilies: ['georgia'], weightLadder: [400, 700],
    motionDurations: [], easingVocab: [], animatedShare: 0,
    hoverCoverage: 0, focusCoverage: 0,
  };
  assert.equal(similarity(LINEAR, other), similarity(other, LINEAR));
});

test('an opposite design scores far below the threshold', () => {
  const opposite: Invariants = {
    spacingLadder: [5, 10, 15], radiusLadder: [24], elevationLevels: 0, centeredRatio: 0.95, tokenCoverage: 0.05, paddingWeight: 60,
    typeScale: [18, 30], fontFamilies: ['georgia'], weightLadder: [400, 700],
    motionDurations: [], easingVocab: [], animatedShare: 0,
    hoverCoverage: 0, focusCoverage: 0,
  };
  assert.ok(similarity(LINEAR, opposite) < 0.3);
});

// F1: a pre-typography reference (core/ref/store.ts withInvariantDefaults backfills
// typeScale/fontFamilies/weightLadder/motionDurations/easingVocab to [] and animatedShare
// to 0) must not read as ~85-92% DIFFERENT from a fresh, identical capture of its own
// page. Before the fix, empty-vs-populated jaccard scored 0 on those five array
// components, was floored to EPSILON by the geometric mean, and collapsed the score to
// ~0.08-0.15 — silently blinding copy/similarity detection to the entire pre-migration
// reference library. The fix excludes an array component from the comparison (and
// renormalises the remaining weights) whenever either side is empty/unmeasured, so an old
// ref is judged only on what it actually measured.
test('an old-format ref (typography/motion fields defaulted empty) scores >= 0.95 against an identical fresh capture (F1)', () => {
  const oldRef: Invariants = {
    ...LINEAR,
    typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0,
  };
  const score = similarity(oldRef, LINEAR);
  assert.ok(score >= 0.95, `old-format ref vs its own fresh capture scored ${score}, expected >= 0.95`);
});

// F1, part (b) of the mandatory regression set: identity must still be exactly 1 after
// the exclusion/renormalisation rewrite (already covered by the "identity is exactly 1"
// test above; asserted again here, adjacent to the F1 fix, for visibility).
test('similarity(LINEAR, LINEAR) is still exactly 1 (F1)', () => {
  assert.equal(similarity(LINEAR, LINEAR), 1);
});

test('empty ladders never yield NaN', () => {
  const empty: Invariants = {
    spacingLadder: [], radiusLadder: [], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 0,
    typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0,
    hoverCoverage: 0, focusCoverage: 0,
  };
  for (const s of [similarity(LINEAR, empty), similarity(empty, LINEAR), similarity(empty, empty)]) {
    assert.ok(Number.isFinite(s) && s >= 0 && s <= 1);
  }
});
