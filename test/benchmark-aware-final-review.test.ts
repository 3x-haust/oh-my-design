import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertBenchmarkAwareFinalReview,
  type BenchmarkAwareFinalReviewInput,
} from '../core/evidence/final-v2-benchmark-fit.ts';
import {
  adaptiveBlindLaneContract,
  validateAdaptiveBlindExecutionVerdicts,
} from '../core/evidence/final-v2-adaptive-files.ts';
import {
  DESIGN_QUALITY_AXES,
  type DesignQualityContract,
} from '../core/evidence/final-v2-design-quality.ts';

function designQuality(
  observations: readonly [string, string],
): DesignQualityContract {
  return {
    schema: 'design-quality-contract-v1',
    axes: DESIGN_QUALITY_AXES.map((axis) => ({
      axis,
      verdict: 'GREEN',
      score:
        axis === 'beautyDesirability' || axis === 'hierarchyComposition'
          ? 4
          : 3,
      crossViewport: 'preserved',
      criticalFailure: null,
      evidence: [
        {
          observationSha256: observations[0],
          viewport: 'desktop',
          state: 'initial',
          region: 'primary work surface',
          visibleCondition: 'The intended priority is visible.',
          userConsequence: 'The next decision is legible.',
        },
        {
          observationSha256: observations[1],
          viewport: 'mobile',
          state: 'initial',
          region: 'primary work surface',
          visibleCondition: 'The same priority is recomposed.',
          userConsequence: 'The decision context remains available.',
        },
      ],
    })),
  };
}

function input(): BenchmarkAwareFinalReviewInput {
  return {
    surface: 'product',
    greenfield: true,
    benchmarkProjection: {
      path: '.omd/task-flow-benchmark-projection.json',
      schema: 'task-flow-benchmark-projection-v1',
      sha256: 'a'.repeat(64),
    },
    benchmarkPatternIds: ['scope-before-schedule', 'unknown-is-valid'],
    currentObservationSha256s: ['b'.repeat(64), 'c'.repeat(64)],
    benchmarkComparisons: [
      {
        patternId: 'scope-before-schedule',
        taskId: 'observe',
        observationSha256s: ['b'.repeat(64)],
        result: 'meets',
      },
      {
        patternId: 'unknown-is-valid',
        taskId: 'observe',
        observationSha256s: ['c'.repeat(64)],
        result: 'exceeds',
      },
    ],
    verdicts: {
      blindVisual: 'GREEN',
      blindNarrative: 'GREEN',
      interactionBenchmarkFit: 'GREEN',
      domainSpecificity: 'GREEN',
      realityFit: 'GREEN',
    },
    criticalFloors: {
      composition: 3,
      copy: 3,
      interactionQuality: 3,
    },
    designQuality: designQuality(['b'.repeat(64), 'c'.repeat(64)]),
  };
}

test('greenfield product final review requires current benchmark comparisons', () => {
  assert.doesNotThrow(() => assertBenchmarkAwareFinalReview(input()));

  const missed = input();
  missed.benchmarkComparisons[0]!.result = 'misses';
  assert.throws(
    () => assertBenchmarkAwareFinalReview(missed),
    /FINAL_BENCHMARK_MISSED/,
  );

  const stale = input();
  stale.benchmarkComparisons[0]!.observationSha256s = ['d'.repeat(64)];
  assert.throws(
    () => assertBenchmarkAwareFinalReview(stale),
    /FINAL_BENCHMARK_OBSERVATION_UNBOUND/,
  );

  const generic = input();
  generic.verdicts.domainSpecificity = 'RED';
  assert.throws(
    () => assertBenchmarkAwareFinalReview(generic),
    /FINAL_DOMAIN_SPECIFICITY_RED/,
  );
});

test('authenticity stays conjunctive and marketing remains unaffected', () => {
  const invented = input();
  invented.verdicts.realityFit = 'RED';
  assert.throws(
    () => assertBenchmarkAwareFinalReview(invented),
    /FINAL_REALITY_FIT_RED/,
  );

  const marketing: BenchmarkAwareFinalReviewInput = {
    surface: 'marketing',
    greenfield: true,
    benchmarkPatternIds: [],
    currentObservationSha256s: ['b'.repeat(64), 'c'.repeat(64)],
    benchmarkComparisons: [],
    verdicts: {
      blindVisual: 'GREEN',
      blindNarrative: 'GREEN',
    },
    criticalFloors: {
      composition: 3,
      copy: 3,
    },
    designQuality: designQuality(['b'.repeat(64), 'c'.repeat(64)]),
  };
  assert.doesNotThrow(() => assertBenchmarkAwareFinalReview(marketing));
});

test('applicable adaptive publication upgrades the blind lane contract', () => {
  const benchmark = adaptiveBlindLaneContract({
    projectMode: 'greenfield',
    gates: ['greenfield-task-flow-benchmark'],
  });
  assert.equal(benchmark.schema, 'adaptive-blind-review-v3');
  assert.deepEqual(benchmark.verdicts, [
    'blindVisual',
    'blindNarrative',
    'interactionBenchmarkFit',
    'domainSpecificity',
    'realityFit',
  ]);
  assert.ok(benchmark.floors.includes('interactionQuality'));

  const marketing = adaptiveBlindLaneContract({
    projectMode: 'greenfield',
    gates: [],
  });
  assert.equal(marketing.schema, 'adaptive-blind-review-v3');
});

test('benchmark Blind execution accepts its complete five-verdict shape', () => {
  assert.doesNotThrow(() => validateAdaptiveBlindExecutionVerdicts({
    blindVisual: 'GREEN',
    blindNarrative: 'GREEN',
    interactionBenchmarkFit: 'GREEN',
    domainSpecificity: 'GREEN',
    realityFit: 'GREEN',
  }, 'greenfield', true));
  assert.throws(() => validateAdaptiveBlindExecutionVerdicts({
    blindVisual: 'GREEN',
    blindNarrative: 'GREEN',
    interactionBenchmarkFit: 'GREEN',
    domainSpecificity: 'GREEN',
    realityFit: 'GREEN',
  }, 'greenfield', false), /unexpected keys/);
});

