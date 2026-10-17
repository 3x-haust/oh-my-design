import assert from 'node:assert/strict';
import test from 'node:test';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';
import { MODEL_LED_STRATEGY_DECISION } from '../core/route/adaptive-flow-domain.ts';

const routeInput = () =>
  structuredClone(inputSkeleton('product-route-input').skeleton) as Record<string, unknown>;

test('route classification derives the sole model-led execution strategy', () => {
  const record = routeAdaptiveFlow(routeInput());
  assert.deepEqual(record.strategy, MODEL_LED_STRATEGY_DECISION);
  assert.deepEqual(record.strategy.stages, ['production', 'browser-evidence', 'independent-review']);
  assert.deepEqual(record.strategy.roles, ['omd-hand', 'omd-eye']);
  assert.deepEqual(record.strategy.methods, []);
});

test('caller-authored structured strategy fields cannot select production behavior', () => {
  const input = routeInput();
  input.strategyDecision = {
    schema: 'adaptive-strategy-decision-v1',
    owner: 'user-selected-model',
    roles: ['omd-art-director', 'omd-sketch'],
    stages: ['candidate-generation'],
    executionWaves: [{ id: 'legacy', mode: 'concurrent', roles: ['omd-sketch'] }],
    methods: ['concept-exploration'],
    aiAssets: [],
    attributionCategories: [],
    skips: [],
    rationale: 'legacy',
  };
  assert.deepEqual(routeAdaptiveFlow(input).strategy, MODEL_LED_STRATEGY_DECISION);
});

test('high-risk input still requires an enforced safety rail', () => {
  const input = routeInput();
  const axes = Reflect.get(input, 'designAxes') as Record<string, unknown>;
  axes.failureRisk = 'high';
  axes.uxNeed = 'rigorous';
  assert.throws(() => routeAdaptiveFlow(input), /SAFETY_WORK_REQUIRED/);
});
