import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertBenchmarkAwareFinalReview,
  type BenchmarkAwareFinalReviewInput,
} from '../core/evidence/final-v2-benchmark-fit.ts';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function axis(
  name: string,
  verdict: 'GREEN' | 'RED' = 'GREEN',
): Record<string, unknown> {
  const greenScore =
    name === 'beautyDesirability' || name === 'hierarchyComposition'
      ? 4
      : 3;
  return {
    axis: name,
    verdict,
    score: verdict === 'GREEN' ? greenScore : 1,
    crossViewport: verdict === 'GREEN' ? 'preserved' : 'contradicted',
    criticalFailure: verdict === 'GREEN' ? null : 'major-optical-imbalance',
    evidence: [
      {
        observationSha256: SHA_A,
        viewport: 'desktop',
        state: 'initial',
        region: 'primary work surface',
        visibleCondition: 'The work object owns the dominant visual mass.',
        userConsequence: 'The next decision is legible without reconstructing context.',
      },
      {
        observationSha256: SHA_B,
        viewport: 'mobile',
        state: 'initial',
        region: 'primary work surface',
        visibleCondition: 'The same priority is recomposed for the narrow viewport.',
        userConsequence: 'The decision context remains visible on mobile.',
      },
    ],
  };
}

function designQuality(
  redAxis?: string,
): Record<string, unknown> {
  return {
    schema: 'design-quality-contract-v1',
    axes: [
      'beautyDesirability',
      'hierarchyComposition',
      'domainSpecificity',
      'humanAuthorship',
      'usability',
      'responsiveCraft',
    ].map((name) => axis(name, name === redAxis ? 'RED' : 'GREEN')),
  };
}

function input(): Record<string, unknown> {
  return {
    surface: 'product',
    greenfield: true,
    benchmarkProjection: {
      path: '.omd/task-flow-benchmark-projection.json',
      schema: 'task-flow-benchmark-projection-v1',
      sha256: 'c'.repeat(64),
    },
    benchmarkPatternIds: ['evidence-before-disposition'],
    currentObservationSha256s: [SHA_A, SHA_B],
    benchmarkComparisons: [
      {
        patternId: 'evidence-before-disposition',
        taskId: 'review-evidence',
        observationSha256s: [SHA_A, SHA_B],
        result: 'meets',
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
      composition: 4,
      copy: 4,
      interactionQuality: 4,
    },
    designQuality: designQuality(),
  };
}

function review(value: unknown): void {
  assertBenchmarkAwareFinalReview(
    value as BenchmarkAwareFinalReviewInput,
  );
}

test('all six design-quality axes independently gate final review', () => {
  assert.doesNotThrow(() => review(input()));

  for (const name of [
    'beautyDesirability',
    'hierarchyComposition',
    'domainSpecificity',
    'humanAuthorship',
    'usability',
    'responsiveCraft',
  ]) {
    const value = input();
    value.designQuality = designQuality(name);
    assert.throws(
      () => review(value),
      new RegExp(`DESIGN_QUALITY_AXIS_RED:${name}`),
    );
  }
});

test('missing, aggregate, and unknown quality shapes fail closed', () => {
  const { designQuality: _designQuality, ...missing } = input();
  assert.throws(
    () => review(missing),
    /DESIGN_QUALITY_MISSING/,
  );

  const aggregate = input();
  aggregate.designQuality = {
    ...designQuality(),
    overall: 'GREEN',
    mean: 4,
  };
  assert.throws(
    () => review(aggregate),
    /DESIGN_QUALITY_MALFORMED/,
  );

  const unknown = input();
  const quality = unknown.designQuality as Record<string, unknown>;
  const axes = quality.axes as Record<string, unknown>[];
  axes[0] = axis('visualPolish');
  assert.throws(
    () => review(unknown),
    /DESIGN_QUALITY_MALFORMED/,
  );
});

test('axis evidence must bind both current viewports', () => {
  const value = input();
  const quality = value.designQuality as Record<string, unknown>;
  const axes = quality.axes as Record<string, unknown>[];
  axes[0] = {
    ...axis('beautyDesirability'),
    evidence: [
      {
        observationSha256: SHA_A,
        viewport: 'desktop',
        state: 'initial',
        region: 'primary work surface',
        visibleCondition: 'Desktop alone appears resolved.',
        userConsequence: 'Mobile quality remains unproven.',
      },
    ],
  };
  assert.throws(
    () => review(value),
    /DESIGN_QUALITY_EVIDENCE_INVALID:beautyDesirability/,
  );
});

test('competent wireframe scores cannot pass beauty or composition', () => {
  for (const name of ['beautyDesirability', 'hierarchyComposition']) {
    const value = input();
    const quality = value.designQuality as Record<string, unknown>;
    const axes = quality.axes as Record<string, unknown>[];
    const index = axes.findIndex(({ axis: candidate }) => candidate === name);
    axes[index] = {
      ...axis(name),
      score: 3,
    };

    assert.throws(
      () => review(value),
      new RegExp(`DESIGN_QUALITY_VERDICT_MISMATCH:${name}`),
    );
  }
});
