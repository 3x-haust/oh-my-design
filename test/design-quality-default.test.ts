import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptiveBehaviorContract } from '../core/route/adaptive-behavior-contract.ts';
import { MODEL_LED_STRATEGY_DECISION } from '../core/route/adaptive-flow-domain.ts';

for (const ambition of ['restrained', 'balanced', 'showpiece'] as const) {
  test(`${ambition} candidates expose visual quality before production`, () => {
    const result = adaptiveBehaviorContract(MODEL_LED_STRATEGY_DECISION, ambition);
    assert.equal(result.active.designQuality.candidateMode, 'integrated-visual');
    assert.equal(result.active.designQuality.fidelityCanSubstitute, false);
    assert.equal(result.active.designQuality.floors.beautyDesirability, 4);
    assert.equal(result.active.designQuality.floors.hierarchyComposition, 4);
  });
}
