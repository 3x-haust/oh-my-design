export type ArtifactReceipt = {
  path: string;
  schema: string;
  sha256: string;
};

export type BenchmarkComparison = {
  patternId: string;
  taskId: string;
  observationSha256s: string[];
  result: 'meets' | 'exceeds' | 'misses';
};

export type BenchmarkAwareFinalReviewInput = {
  surface: 'product' | 'mixed' | 'marketing' | 'editorial';
  greenfield: boolean;
  benchmarkProjection?: ArtifactReceipt;
  benchmarkPatternIds: string[];
  currentObservationSha256s: string[];
  benchmarkComparisons: BenchmarkComparison[];
  verdicts: {
    blindVisual: 'GREEN' | 'RED';
    blindNarrative: 'GREEN' | 'RED';
    interactionBenchmarkFit?: 'GREEN' | 'RED';
    domainSpecificity?: 'GREEN' | 'RED';
    realityFit?: 'GREEN' | 'RED';
  };
  criticalFloors: {
    composition: number;
    copy: number;
    interactionQuality?: number;
  };
  designQuality: DesignQualityContract;
};

const SHA256 = /^[a-f0-9]{64}$/;

function fail(code: string): never {
  throw new Error(code);
}

function assertReceipt(
  receipt: ArtifactReceipt | undefined,
  schema: string,
): asserts receipt is ArtifactReceipt {
  if (
    !receipt ||
    receipt.schema !== schema ||
    receipt.path.trim() === '' ||
    !SHA256.test(receipt.sha256)
  ) {
    fail('FINAL_BENCHMARK_MISSING');
  }
}

function assertBlindVerdicts(input: BenchmarkAwareFinalReviewInput): void {
  if (
    input.verdicts.blindVisual !== 'GREEN' ||
    input.verdicts.blindNarrative !== 'GREEN'
  ) {
    fail('FINAL_BLIND_REVIEW_RED');
  }
}

function assertProductBenchmark(input: BenchmarkAwareFinalReviewInput): void {
  assertReceipt(
    input.benchmarkProjection,
    'task-flow-benchmark-projection-v1',
  );
  if (input.verdicts.interactionBenchmarkFit !== 'GREEN') {
    fail('FINAL_BENCHMARK_FIT_RED');
  }
  if (input.verdicts.domainSpecificity !== 'GREEN') {
    fail('FINAL_DOMAIN_SPECIFICITY_RED');
  }
  if ((input.criticalFloors.interactionQuality ?? 0) < 3) {
    fail('FINAL_BENCHMARK_FLOOR');
  }
  if (input.greenfield && input.verdicts.realityFit !== 'GREEN') {
    fail('FINAL_REALITY_FIT_RED');
  }

  const required = new Set(input.benchmarkPatternIds);
  const currentObservations = new Set(input.currentObservationSha256s);
  if (required.size === 0 || required.size !== input.benchmarkPatternIds.length) {
    fail('FINAL_BENCHMARK_PATTERN_COVERAGE');
  }
  const observed = new Set<string>();
  for (const comparison of input.benchmarkComparisons) {
    if (!required.has(comparison.patternId)) {
      fail('FINAL_BENCHMARK_PATTERN_UNKNOWN');
    }
    if (comparison.taskId.trim() === '') fail('FINAL_BENCHMARK_TASK_MISSING');
    if (comparison.result === 'misses') fail('FINAL_BENCHMARK_MISSED');
    if (comparison.observationSha256s.length === 0) {
      fail('FINAL_BENCHMARK_OBSERVATION_MISSING');
    }
    for (const sha256 of comparison.observationSha256s) {
      if (!SHA256.test(sha256) || !currentObservations.has(sha256)) {
        fail('FINAL_BENCHMARK_OBSERVATION_UNBOUND');
      }
    }
    if (observed.has(comparison.patternId)) {
      fail('FINAL_BENCHMARK_PATTERN_DUPLICATE');
    }
    observed.add(comparison.patternId);
  }
  if ([...required].some((patternId) => !observed.has(patternId))) {
    fail('FINAL_BENCHMARK_PATTERN_COVERAGE');
  }
}

export function assertBenchmarkAwareFinalReview(
  input: BenchmarkAwareFinalReviewInput,
): void {
  assertDesignQualityGreen(input.designQuality, {
    expectedObservationSha256s: input.currentObservationSha256s,
  });
  assertBlindVerdicts(input);
  if (input.surface === 'product' || input.surface === 'mixed') {
    assertProductBenchmark(input);
  }
}
import {
  assertDesignQualityGreen,
  type DesignQualityContract,
} from './final-v2-design-quality.ts';


