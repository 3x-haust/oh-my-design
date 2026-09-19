import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ANTI_REFERENCE_SEEDS,
  MAX_ANTI_REFERENCE_SEEDS,
  assignAntiReferenceSeeds,
  candidateDecisionLines,
  discardNearDuplicates,
  discardedCandidateIds,
  keptCandidateIds,
  noveltySha256,
  type NoveltyCandidate,
} from '../core/ref/candidate-novelty.ts';
import type { Invariants } from '../core/types.ts';

function invariants(overrides: Partial<Invariants> = {}): Invariants {
  return {
    spacingLadder: [4, 8, 16, 24, 32], radiusLadder: [4, 8, 12], elevationLevels: 3,
    centeredRatio: 0.2, tokenCoverage: 0.9, paddingWeight: 40, typeScale: [14, 16, 24, 40],
    fontFamilies: ['inter', 'source-serif'], weightLadder: [400, 500, 700], motionDurations: [150, 300],
    easingVocab: ['ease-out'], animatedShare: 0.25, hoverCoverage: 0.8, focusCoverage: 0.6,
    animatedProperties: ['opacity'], hasReducedMotion: true, scrollChoreography: [],
    measurementCoverage: { interactionProbe: 'measured', motionProbe: 'measured', energyCurve: 'measured' },
    ...overrides,
  } as Invariants;
}

const candidate = (id: string, generator: string, overrides: Partial<Invariants> = {}): NoveltyCandidate =>
  ({ id, generator, invariants: invariants(overrides) });

const distinct = (): Partial<Invariants> => ({
  spacingLadder: [3, 7, 13, 21, 34, 55], radiusLadder: [2, 6, 14], typeScale: [12, 15, 19, 27, 44, 72],
  fontFamilies: ['fraunces', 'iosevka', 'atkinson'], weightLadder: [300, 500, 800],
  motionDurations: [90, 220, 640], easingVocab: ['cubic-bezier(0.2, 0, 0, 1)'], elevationLevels: 4,
  centeredRatio: 0.05, tokenCoverage: 1, paddingWeight: 120,
});

test('each generator gets a different anti-reference while the pool allows it', () => {
  const seeds = [
    { id: 'b', avoid: 'second' },
    { id: 'a', avoid: 'first' },
    { id: 'c', avoid: 'third' },
  ];
  const assigned = assignAntiReferenceSeeds(['g1', 'g2', 'g3'], seeds);
  assert.deepEqual(assigned.map((entry) => entry.seed.id), ['a', 'b', 'c'], 'assignment is sorted and deterministic');
  assert.ok(assigned.every((entry) => entry.reused === false));

  const repeated = assignAntiReferenceSeeds(['g1', 'g2', 'g3'], seeds.slice(0, 2));
  assert.deepEqual(repeated.map((entry) => entry.seed.id), ['a', 'b', 'a']);
  assert.deepEqual(repeated.map((entry) => entry.reused), [false, false, true], 'a reused seed is recorded, not hidden');
});

test('a generator with nothing to avoid is refused, and the seed pool is capped', () => {
  assert.throws(() => assignAntiReferenceSeeds(['g1'], []), /at least one anti-reference seed/);
  const many = Array.from({ length: MAX_ANTI_REFERENCE_SEEDS + 1 }, (_v, i) => ({ id: `s${i}`, avoid: 'x' }));
  assert.throws(() => assignAntiReferenceSeeds(['g1'], many), /bounded to/);
  assert.deepEqual(assignAntiReferenceSeeds([], DEFAULT_ANTI_REFERENCE_SEEDS), []);
});

test('the default seeds name conditions, not styles', () => {
  assert.ok(DEFAULT_ANTI_REFERENCE_SEEDS.length >= 4);
  for (const seed of DEFAULT_ANTI_REFERENCE_SEEDS) {
    assert.ok(seed.avoid.trim().length > 0);
    assert.equal(/#[0-9a-f]{3,6}|serif|sans-serif|blue|purple/i.test(seed.avoid), false, `${seed.id} should name a condition, not a style`);
  }
});

test('one candidate is kept and a near-duplicate collapses into it', () => {
  const decisions = discardNearDuplicates([
    candidate('c1', 'g1'),
    candidate('c2', 'g2'),
  ]);
  assert.equal(decisions.length, 2);
  assert.deepEqual(keptCandidateIds(decisions), ['c1']);
  assert.deepEqual(discardedCandidateIds(decisions), ['c2']);
  assert.equal(decisions[1]!.collapsedInto, 'c1');
  assert.ok(decisions[1]!.distance! < 0.12);
  assert.match(decisions[1]!.reason, /one candidate counted twice/);
});

test('genuinely distinct candidates are all kept', () => {
  const decisions = discardNearDuplicates([
    candidate('c1', 'g1'),
    candidate('c2', 'g2', distinct()),
    candidate('c3', 'g3', { spacingLadder: [5], radiusLadder: [1], centeredRatio: 0.8, tokenCoverage: 0.2, paddingWeight: 5, typeScale: [30], fontFamilies: ['georgia'], weightLadder: [900], motionDurations: [1000], easingVocab: ['linear'], elevationLevels: 0 }),
  ]);
  assert.equal(keptCandidateIds(decisions).length, 3);
  assert.deepEqual(discardedCandidateIds(decisions), []);
});

test('the first candidate in a collision is the one that survives', () => {
  const decisions = discardNearDuplicates([candidate('first', 'g1'), candidate('second', 'g2')]);
  assert.equal(decisions[0]!.outcome, 'kept');
  assert.equal(decisions[1]!.collapsedInto, 'first');
});

test('a sole candidate is kept with a reason', () => {
  const decisions = discardNearDuplicates([candidate('only', 'g1')]);
  assert.deepEqual(keptCandidateIds(decisions), ['only']);
  assert.match(decisions[0]!.reason, /first candidate/);
});

test('decision lines name the discard, its reason, and the anti-reference', () => {
  const seeds = assignAntiReferenceSeeds(['g1', 'g2'], DEFAULT_ANTI_REFERENCE_SEEDS);
  const lines = candidateDecisionLines(
    discardNearDuplicates([candidate('c1', 'g1'), candidate('c2', 'g2')]),
    seeds,
  );
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /`c1` \(g1\): kept/);
  assert.match(lines[0]!, /anti-reference `[a-z-]+` \(.+\)/);
  assert.match(lines[1]!, /discarded into `c1`/);
  assert.match(lines[1]!, /anti-reference `[a-z-]+` \(.+\)/);
  assert.notEqual(
    lines[0]!.match(/anti-reference `([a-z-]+)`/)?.[1],
    lines[1]!.match(/anti-reference `([a-z-]+)`/)?.[1],
    'two generators must not be told to avoid the same thing while distinct seeds remain',
  );
});

test('a reused seed is stated in the record', () => {
  const seeds = assignAntiReferenceSeeds(['g1', 'g2'], DEFAULT_ANTI_REFERENCE_SEEDS.slice(0, 1));
  const lines = candidateDecisionLines(discardNearDuplicates([candidate('c1', 'g1'), candidate('c2', 'g2', distinct())]), seeds);
  assert.match(lines[1]!, /reused, so this generator shares its avoid-target/);
});

test('the decision set has a stable identity', () => {
  const decisions = discardNearDuplicates([candidate('c1', 'g1'), candidate('c2', 'g2')]);
  assert.equal(noveltySha256(decisions), noveltySha256(discardNearDuplicates([candidate('c1', 'g1'), candidate('c2', 'g2')])));
  assert.notEqual(noveltySha256(decisions), noveltySha256(discardNearDuplicates([candidate('c1', 'g1'), candidate('c2', 'g2', distinct())])));
});
