import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOP_ADVISORY_FLOOR,
  SLOP_SCORE_SCHEMA,
  scoreSlop,
  slopCentroid,
} from '../core/slop/score.ts';
import type { Invariants } from '../core/types.ts';

function invariants(overrides: Partial<Invariants> = {}): Invariants {
  return {
    spacingLadder: [4, 8, 16, 24, 32],
    radiusLadder: [4, 8, 12, 16],
    elevationLevels: 3,
    centeredRatio: 0.2,
    tokenCoverage: 0.9,
    paddingWeight: 40,
    typeScale: [14, 16, 24, 40],
    fontFamilies: ['inter', 'source-serif'],
    weightLadder: [400, 500, 700],
    motionDurations: [150, 300],
    easingVocab: ['ease-out'],
    animatedShare: 0.25,
    hoverCoverage: 0.8,
    focusCoverage: 0.6,
    animatedProperties: ['opacity'],
    hasReducedMotion: true,
    scrollChoreography: [],
    measurementCoverage: { interactionProbe: 'measured', motionProbe: 'measured', energyCurve: 'measured' },
    ...overrides,
  };
}

/** The shape this module exists to catch: one rung everywhere, no tokens, everything centred. */
function genericPage(): Invariants {
  return invariants({
    spacingLadder: [16],
    radiusLadder: [8],
    typeScale: [16, 16],
    fontFamilies: ['inter'],
    weightLadder: [400],
    motionDurations: [200],
    easingVocab: ['ease'],
    elevationLevels: 1,
    centeredRatio: 0.95,
    tokenCoverage: 0.1,
    paddingWeight: 16,
    animatedShare: 0.5,
  });
}

/** A page with committed, specific choices. */
function specificPage(): Invariants {
  return invariants({
    spacingLadder: [3, 7, 13, 21, 34, 55],
    radiusLadder: [2, 6, 14],
    typeScale: [12, 15, 19, 27, 44, 72],
    fontFamilies: ['fraunces', 'iosevka', 'atkinson-hyperlegible'],
    weightLadder: [300, 500, 800],
    motionDurations: [90, 220, 640],
    easingVocab: ['cubic-bezier(0.2, 0, 0, 1)', 'steps(4)'],
    elevationLevels: 4,
    centeredRatio: 0.05,
    tokenCoverage: 1,
    paddingWeight: 120,
    animatedShare: 0.08,
  });
}

const corpus = [
  { invariants: genericPage() },
  { invariants: genericPage() },
  { invariants: genericPage() },
];

test('a page matching the generic corpus scores near zero distance and warns', () => {
  const score = scoreSlop({ invariants: genericPage(), corpus });
  assert.equal(score.schema, SLOP_SCORE_SCHEMA);
  assert.ok(score.distance < 1e-12, `expected no measurable distance, got ${score.distance}`);
  assert.equal(score.nearSlop, true);
  assert.equal(score.findings[0]?.id, 'SLOP-CENTROID-PROXIMITY');
  assert.equal(score.findings[0]?.severity, 'advisory');
});

test('a page with its own committed vocabulary separates from the generic corpus', () => {
  const score = scoreSlop({ invariants: specificPage(), corpus });
  assert.ok(score.distance > SLOP_ADVISORY_FLOOR, `expected separation, got ${score.distance}`);
  assert.equal(score.nearSlop, false);
  assert.deepEqual(score.findings, []);
});

test('findings never carry a gating severity', () => {
  const score = scoreSlop({ invariants: genericPage(), corpus });
  assert.ok(score.findings.every((finding) => finding.severity === 'advisory'));
  assert.equal('passed' in score, false, 'the score reports a reading, not a verdict');
});

test('the centroid is derived from the corpus rather than hardcoded', () => {
  const genericCentroid = slopCentroid([{ invariants: genericPage() }]);
  const specificCentroid = slopCentroid([{ invariants: specificPage() }]);
  assert.notDeepEqual(genericCentroid, specificCentroid);

  const mixed = scoreSlop({ invariants: specificPage(), corpus: [{ invariants: specificPage() }] });
  assert.ok(mixed.distance < 1e-12, 'against its own centroid the same page has no distance');

  const againstGeneric = scoreSlop({ invariants: specificPage(), corpus });
  assert.ok(againstGeneric.distance > mixed.distance);
});

test('an empty corpus fails closed instead of scoring against nothing', () => {
  assert.throws(() => slopCentroid([]), /at least one corpus entry/);
  assert.throws(() => scoreSlop({ invariants: genericPage(), corpus: [] }), /at least one corpus entry/);
});

test('an axis the corpus never measured cannot manufacture agreement', () => {
  const score = scoreSlop({
    invariants: genericPage(),
    corpus: [{ invariants: genericPage() }, { invariants: genericPage() }],
    axes: ['motionLoad', 'energyLoad'],
  });
  assert.deepEqual(score.compared, []);
  assert.ok(Number.isNaN(score.distance), 'unmeasured axes are incomparable, not identical');
  assert.equal(score.nearSlop, false, 'unknown proximity must not be reported as near-slop');
  assert.equal(score.findings[0]?.id, 'SLOP-AXIS-AGREEMENT');
});

test('narrowing to specific axes excludes the others from the comparison', () => {
  const score = scoreSlop({
    invariants: genericPage(),
    corpus,
    axes: ['spacingRhythm', 'radiusProfile'],
  });
  assert.deepEqual([...score.compared].sort(), ['radiusProfile', 'spacingRhythm']);
  assert.ok(score.excluded.includes('tokenDiscipline'));
});

test('readings name the axes that drove the number, closest agreement first', () => {
  const score = scoreSlop({ invariants: specificPage(), corpus });
  assert.ok(score.readings.length > 0);
  const gaps = score.readings.map((reading) => Math.abs(reading.gap ?? 0));
  assert.deepEqual(gaps, [...gaps].sort((a, b) => a - b), 'closest agreement is listed first');
  assert.ok(score.readings.every((reading) => reading.centroid !== null));
});

test('a signed gap says which side of the centroid a page sits on', () => {
  const score = scoreSlop({ invariants: specificPage(), corpus });
  const tokenDiscipline = score.readings.find((reading) => reading.axis === 'tokenDiscipline');
  assert.ok(tokenDiscipline !== undefined);
  assert.ok(tokenDiscipline!.gap! > 0, 'full token coverage sits above the generic centroid');

  const centeredReading = score.readings.find((reading) => reading.axis === 'centeredComposition');
  assert.ok(centeredReading!.gap! < 0, 'a left-aligned page sits below the centred centroid');
});
