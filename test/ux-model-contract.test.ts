import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseUxModelSet,
  uxModelSetSha256,
} from '../core/composition-contract/ux-models.ts';

const BENCHMARK_SHA = 'b'.repeat(64);

function modelSet() {
  return {
    schema: 'ux-model-set-v1',
    benchmarkProjectionSha256: BENCHMARK_SHA,
    models: [
      {
        id: 'guided-diagnostic',
        macroLayoutFamily: 'guided-workbench',
        flowTopology: 'conditional-diagnostic',
        dominantWorkObject: 'observed-symptom',
        taskIds: ['observe', 'evidence', 'availability'],
        benchmarkPatternIds: ['scope-before-schedule', 'unknown-is-valid'],
        decisionSupportSequence: [
          'observable symptom',
          'unknown path',
          'optional evidence',
        ],
        domainBindings: ['leak location', 'visible water behavior'],
        observableConsequences: [
          'unknown avoids forced diagnosis',
          'evidence prompt follows symptom context',
        ],
        costliestErrorRecovery: 'edit request evidence without losing availability',
        mobileRecomposition: 'current diagnostic question precedes preserved request summary',
        rejectionCondition: 'fails if scheduling appears before minimum issue scope',
      },
      {
        id: 'open-brief',
        macroLayoutFamily: 'brief-and-dialogue',
        flowTopology: 'open-request',
        dominantWorkObject: 'service-brief',
        taskIds: ['observe', 'availability'],
        benchmarkPatternIds: ['flexible-availability'],
        decisionSupportSequence: ['short brief', 'flexible timing', 'provider dialogue'],
        domainBindings: ['uncertain repair scope', 'provider clarification'],
        observableConsequences: [
          'long-tail conditions remain expressible',
          'provider clarification follows the brief',
        ],
        costliestErrorRecovery: 'revise brief before accepting an appointment',
        mobileRecomposition: 'brief remains primary while responses follow',
        rejectionCondition: 'fails when urgent conditions have no escape route',
      },
    ],
  };
}

test('composition candidates are structurally distinct UX models', () => {
  const parsed = parseUxModelSet(modelSet(), {
    expectedBenchmarkProjectionSha256: BENCHMARK_SHA,
    frameTaskIds: ['observe', 'evidence', 'availability'],
  });

  assert.equal(parsed.models.length, 2);
  assert.notEqual(
    parsed.models[0]!.topologySha256,
    parsed.models[1]!.topologySha256,
  );
  assert.match(uxModelSetSha256(parsed), /^[a-f0-9]{64}$/);
});

test('composition candidates reject cosmetic variants and visual fields', () => {
  const cosmetic = modelSet();
  cosmetic.models[1]!.macroLayoutFamily =
    cosmetic.models[0]!.macroLayoutFamily;
  cosmetic.models[1]!.flowTopology = cosmetic.models[0]!.flowTopology;
  cosmetic.models[1]!.dominantWorkObject =
    cosmetic.models[0]!.dominantWorkObject;
  assert.throws(
    () => parseUxModelSet(cosmetic),
    /UX_MODEL_STRUCTURAL_DUPLICATE/,
  );

  const visual = modelSet();
  Object.assign(visual.models[0]!, { palette: 'blue' });
  assert.throws(() => parseUxModelSet(visual), /UX_MODEL_FIELD_UNKNOWN/);
});

