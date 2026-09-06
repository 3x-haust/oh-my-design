import type {
  ContentFitCheck,
  ValidateContentFitCoverageInput,
} from './contract.ts';
import { contentGrainDecisionToken, contentGrainSha256 } from './parser.ts';
import { ContentGrainError } from './strict.ts';

const fail = (code: string, detail: string): never => {
  throw new ContentGrainError(code, detail);
};

const checkKey = ({ traitId, fixtureId, viewport }: ContentFitCheck): string =>
  `${traitId}:${fixtureId}:${viewport}`;

export const validateContentFitCoverage = (
  input: ValidateContentFitCoverageInput,
): void => {
  const actualGrainSha256 = contentGrainSha256(input.grain);
  if (
    input.grainSha256 !== actualGrainSha256
    || input.receipt.grain.sha256 !== actualGrainSha256
  ) {
    fail('STALE_CONTENT_FIT_GRAIN', 'receipt does not bind the current Content Grain');
  }
  if (input.receipt.decisionGraphSha256 !== input.decisionGraphSha256) {
    fail('STALE_CONTENT_FIT_DECISION_GRAPH', 'receipt does not bind the current decision graph');
  }

  if (input.grain.status === 'no-stable-grain') {
    if (input.receipt.status !== 'no-stable-grain' || input.receipt.checks.length !== 0) {
      fail(
        'CONTENT_FIT_STATUS_MISMATCH',
        'no-stable-grain requires a no-stable-grain receipt with no checks',
      );
    }
    return;
  }
  if (input.receipt.status !== 'fit') {
    fail('CONTENT_FIT_STATUS_MISMATCH', 'active Content Grain requires a fit receipt');
  }

  const expected = new Map<string, { traitId: string; fixtureId: string; viewport: string }>();
  for (const trait of input.grain.traits) {
    for (const fixtureId of trait.fixtureIds) {
      for (const viewport of ['desktop', 'mobile'] as const) {
        expected.set(`${trait.id}:${fixtureId}:${viewport}`, {
          traitId: trait.id,
          fixtureId,
          viewport,
        });
      }
    }
  }
  const actual = new Map(input.receipt.checks.map((check) => [checkKey(check), check]));
  for (const [key, requirement] of expected) {
    if (!actual.has(key)) {
      fail(
        'INCOMPLETE_CONTENT_FIT_COVERAGE',
        `${requirement.traitId}/${requirement.fixtureId}/${requirement.viewport}`,
      );
    }
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      fail('UNKNOWN_CONTENT_FIT_CHECK', key);
    }
  }

  const observations = new Map(
    input.observations.map((observation) => [observation.sha256, observation]),
  );
  for (const check of input.receipt.checks) {
    const observation = observations.get(check.observationSha256);
    if (!observation) {
      return fail('MISSING_CONTENT_FIT_OBSERVATION', check.observationSha256);
    }
    const token = contentGrainDecisionToken(actualGrainSha256, check.traitId);
    if (!observation.decisionRefs.includes(token)) {
      fail(
        'UNBOUND_CONTENT_GRAIN_DECISION',
        `${check.traitId}/${check.fixtureId}/${check.viewport}`,
      );
    }
  }
};
