import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTIVE_STAGE_GRAPH,
  ADAPTIVE_STAGE_OWNERS,
  adaptiveRefinementCheckpoint,
  routeAdaptiveFlow,
} from '../core/route/index.ts';
import { MODEL_LED_STRATEGY_DECISION } from '../core/route/adaptive-flow-domain.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';

const fixture = (): Record<string, unknown> =>
  structuredClone(inputSkeleton('product-route-input').skeleton) as Record<string, unknown>;

test('model-led production and independent review use separate canonical waves', () => {
  const route = routeAdaptiveFlow(fixture());
  assert.deepEqual(route.strategy.executionWaves, [
    { id: 'build', mode: 'concurrent', roles: ['omd-hand'] },
    { id: 'verify', mode: 'concurrent', roles: ['omd-eye'] },
  ]);
  const checkpoint = adaptiveRefinementCheckpoint('red', 'present');
  assert.equal(checkpoint.producer, ADAPTIVE_STAGE_OWNERS.production);
  assert.equal(checkpoint.reviewer, ADAPTIVE_STAGE_OWNERS['independent-review']);
  assert.notEqual(checkpoint.producer, checkpoint.reviewer);
  assert.deepEqual(ADAPTIVE_STAGE_GRAPH['independent-review'].prerequisites, ['browser-evidence']);
});

test('caller-authored structured role waves cannot change the model-led route', () => {
  const input = fixture();
  const strategy = structuredClone(MODEL_LED_STRATEGY_DECISION) as unknown as Record<string, unknown>;
  strategy.roles = ['omd-scout', 'omd-writer', 'omd-hand', 'omd-eye'];
  strategy.executionWaves = [
    { id: 'research', mode: 'concurrent', roles: ['omd-scout', 'omd-writer'] },
    { id: 'build', mode: 'concurrent', roles: ['omd-hand'] },
    { id: 'verify', mode: 'concurrent', roles: ['omd-eye'] },
  ];
  input.strategyDecision = strategy;
  assert.deepEqual(routeAdaptiveFlow(input).strategy.executionWaves, MODEL_LED_STRATEGY_DECISION.executionWaves);
});
