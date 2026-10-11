import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptiveBehaviorContract } from '../core/route/adaptive-behavior-contract.ts';
import type { AdaptiveStrategyDecision } from '../core/route/adaptive-flow-domain.ts';

const strategy: AdaptiveStrategyDecision = {
  schema: 'adaptive-strategy-decision-v1',
  owner: 'user-selected-model',
  roles: ['omd-sketch', 'omd-hand', 'omd-eye'],
  stages: ['candidate-generation', 'production', 'independent-review'],
  executionWaves: [],
  methods: [],
  skips: [],
  attributionCategories: [],
  aiAssets: [],
  rationale: 'Compare representative finished visual directions before production.',
};

for (const ambition of ['restrained', 'balanced', 'showpiece'] as const) {
  test(`${ambition} candidates expose visual quality before production`, () => {
    const result = adaptiveBehaviorContract(strategy, ambition);
    assert.equal(result.active.designQuality.candidateMode, 'integrated-visual');
    assert.equal(result.active.designQuality.fidelityCanSubstitute, false);
    assert.equal(result.active.designQuality.floors.beautyDesirability, 4);
    assert.equal(result.active.designQuality.floors.hierarchyComposition, 4);
  });
}
