import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DESIGN_QUALITY_AXES,
  DESIGN_QUALITY_AXIS_FLOORS,
} from '../core/evidence/final-v2-design-quality.ts';
import {
  ADAPTIVE_BEHAVIOR_POLICY,
  routeAdaptiveFlow,
} from '../core/route/index.ts';

const fixturePath = (name: string): string =>
  fileURLToPath(
    new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url),
  );

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(fixturePath(name), 'utf8'));
}

test('showpiece routes require integrated visual candidates', () => {
  const input = fixture('medical-new-product');
  assert.ok(typeof input === 'object' && input !== null);
  const designAxes = Reflect.get(input, 'designAxes');
  assert.ok(typeof designAxes === 'object' && designAxes !== null);
  Reflect.set(designAxes, 'expressiveDesignNeed', 'showpiece');
  const route = routeAdaptiveFlow(input);
  assert.equal(
    route.sourceContract.designAxes.expressiveDesignNeed,
    'showpiece',
  );
  assert.ok(route.strategy.stages.includes('composition'));
  assert.ok(route.strategy.stages.includes('candidate-generation'));
  assert.deepEqual(route.behavior.active.designQuality, {
    axes: DESIGN_QUALITY_AXES,
    floor: 3,
    floors: DESIGN_QUALITY_AXIS_FLOORS,
    aggregation: 'conjunctive',
    candidateMode: 'integrated-visual',
    evidence: 'localized-desktop-mobile',
    fidelityCanSubstitute: false,
  });
});

test('every visual register keeps the six-axis terminal floor', () => {
  const visual = ADAPTIVE_BEHAVIOR_POLICY.visual;
  assert.deepEqual(visual.designQualityAxes, DESIGN_QUALITY_AXES);
  assert.equal(visual.designQualityFloor, 3);
  assert.deepEqual(visual.designQualityFloors, DESIGN_QUALITY_AXIS_FLOORS);
  assert.equal(visual.designQualityAggregation, 'conjunctive');
  assert.equal(visual.designQualityEvidence, 'localized-desktop-mobile');
  assert.equal(visual.fidelityCanSubstituteDesignQuality, false);

  const quiet = routeAdaptiveFlow(fixture('copy-only'));
  assert.deepEqual(quiet.behavior.active.designQuality, {
    axes: DESIGN_QUALITY_AXES,
    floor: 3,
    floors: DESIGN_QUALITY_AXIS_FLOORS,
    aggregation: 'conjunctive',
    candidateMode: 'structural',
    evidence: 'localized-desktop-mobile',
    fidelityCanSubstitute: false,
  });
  assert.equal(quiet.strategy.owner, 'user-selected-model');
});

test('design quality cannot collapse into the existing review mean', () => {
  const visual = ADAPTIVE_BEHAVIOR_POLICY.visual;
  assert.ok(!Object.hasOwn(visual, 'designQualityMean'));
  assert.ok(!Object.hasOwn(visual, 'designQualityWeights'));
  assert.ok(!Object.hasOwn(visual, 'overallDesignScore'));
});
