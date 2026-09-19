import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VISUAL_VECTOR_AXES,
  VISUAL_VECTOR_SCHEMA,
  serializeVisualVector,
  toVisualVector,
  visualVectorCentroid,
  visualVectorDistance,
  visualVectorSpread,
  type VisualVector,
} from '../core/visual-vector.ts';
import type { Invariants } from '../core/types.ts';

function invariants(overrides: Partial<Invariants> = {}): Invariants {
  return {
    spacingLadder: [4, 8, 16, 24, 32],
    radiusLadder: [4, 8, 12],
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
    ...overrides,
  } as Invariants;
}

test('a fully measured page produces a value on every measured axis', () => {
  const vector = toVisualVector({ invariants: invariants() });
  assert.deepEqual(
    VISUAL_VECTOR_AXES.filter((axis) => vector[axis] === null),
    ['motionLoad', 'energyLoad'],
    'only the render loads are unmeasured here',
  );
  for (const axis of VISUAL_VECTOR_AXES) {
    if (axis === 'motionLoad' || axis === 'energyLoad') continue;
    const value = vector[axis]!;
    assert.ok(value >= 0 && value <= 1, `${axis} must stay in 0..1, got ${value}`);
  }
});

test('an unmeasured ladder is null rather than zero', () => {
  const vector = toVisualVector({ invariants: invariants({ spacingLadder: [], typeScale: [], fontFamilies: [] }) });
  assert.equal(vector.spacingRhythm, null);
  assert.equal(vector.typeVoice, null);
  assert.equal(vector.fontVoice, null);
});

test('an unmeasured interaction probe is null rather than a real 0 coverage', () => {
  const neverProbed = invariants({
    hoverCoverage: 0,
    focusCoverage: 0,
    measurementCoverage: { interactionProbe: 'not-measured', motionProbe: 'measured', energyCurve: 'measured' },
  });
  assert.equal(toVisualVector({ invariants: neverProbed }).interactionCoverage, null);

  const probedAndDead = invariants({
    hoverCoverage: 0,
    focusCoverage: 0,
    measurementCoverage: { interactionProbe: 'measured', motionProbe: 'measured', energyCurve: 'measured' },
  });
  assert.equal(toVisualVector({ invariants: probedAndDead }).interactionCoverage, 0);
});

test('render loads stay unmeasured when no pixel summary was computed', () => {
  const bare = toVisualVector({ invariants: invariants() });
  assert.equal(bare.motionLoad, null);
  assert.equal(bare.energyLoad, null);
  const loaded = toVisualVector({ invariants: invariants(), loads: { gradientLoad: 0.4, blurLoad: 0.1 } });
  assert.equal(loaded.motionLoad, 0.4);
  assert.equal(loaded.energyLoad, 0.1);
});

test('distance compares only shared measured axes and reports what it skipped', () => {
  const a = invariants();
  const b = invariants();
  const identical = visualVectorDistance(toVisualVector({ invariants: a }), toVisualVector({ invariants: b }));
  assert.equal(identical.distance, 0, 'the same measurements are zero apart');
  assert.ok(identical.compared.includes('spacingRhythm'));
  assert.deepEqual([...identical.excluded].sort(), ['energyLoad', 'motionLoad']);

  const divergent = visualVectorDistance(
    toVisualVector({ invariants: a }),
    toVisualVector({ invariants: invariants({ spacingLadder: [40], radiusLadder: [], tokenCoverage: 0, centeredRatio: 1 }) }),
  );
  assert.ok(divergent.distance > 0);
  assert.ok(divergent.excluded.includes('radiusProfile'), 'an empty ladder is excluded, not scored as maximal difference');
});

test('two inputs sharing no measured axis are incomparable rather than identical or opposite', () => {
  const unknownsOnly: VisualVector = Object.freeze(
    Object.fromEntries(VISUAL_VECTOR_AXES.map((axis) => [axis, null])),
  ) as VisualVector;
  const comparison = visualVectorDistance(unknownsOnly, unknownsOnly);
  assert.deepEqual(comparison.compared, []);
  assert.ok(Number.isNaN(comparison.distance), 'unknown proximity must not read as 0');

  const measured = toVisualVector({ invariants: invariants() });
  assert.ok(Number.isNaN(visualVectorDistance(unknownsOnly, measured).distance));
});

test('centroid and spread summarise a set per axis over the members that measured it', () => {
  const tight = toVisualVector({ invariants: invariants({ tokenCoverage: 0.8, centeredRatio: 0.2 }) });
  const loose = toVisualVector({ invariants: invariants({ tokenCoverage: 1, centeredRatio: 0.4 }) });
  const centroid = visualVectorCentroid([tight, loose]);
  assert.equal(centroid.tokenDiscipline, 0.9);
  assert.ok(Math.abs(centroid.centeredComposition! - 0.3) < 1e-9);

  const spread = visualVectorSpread([tight, loose]);
  assert.ok(Math.abs(spread.tokenDiscipline! - 0.1) < 1e-9);
  assert.equal(spread.motionLoad, null, 'an axis nobody measured has no spread');

  const withUnmeasured = visualVectorCentroid([
    tight,
    loose,
    toVisualVector({ invariants: invariants({ tokenCoverage: 1, centeredRatio: 0.4, spacingLadder: [] }) }),
  ]);
  assert.equal(withUnmeasured.spacingRhythm, 1, 'only the two members with a ladder contribute, and both are full scales');
  assert.ok(Math.abs(withUnmeasured.tokenDiscipline! - (0.8 + 1 + 1) / 3) < 1e-9, 'all three members measured token coverage');

  const allUnmeasured = visualVectorCentroid([
    toVisualVector({ invariants: invariants({ spacingLadder: [] }) }),
    toVisualVector({ invariants: invariants({ spacingLadder: [] }) }),
  ]);
  assert.equal(allUnmeasured.spacingRhythm, null, 'an axis no member measured has no centroid');
});

test('an empty set has no centroid and says so', () => {
  assert.throws(() => visualVectorCentroid([]), /at least one vector/);
});

test('serialisation is fixed-order so a stored vector stays comparable and diffable', () => {
  const vector = toVisualVector({ invariants: invariants() });
  const text = serializeVisualVector(vector);
  const lines = text.trim().split('\n');
  assert.equal(lines[0], VISUAL_VECTOR_SCHEMA);
  assert.deepEqual(lines.slice(1).map((line) => line.split('=')[0]), [...VISUAL_VECTOR_AXES]);
  assert.match(text, /motionLoad=unmeasured/);
  assert.equal(serializeVisualVector(vector), text, 'serialisation is stable');
});
