import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveRouteError, routeAdaptiveFlow } from '../core/route/index.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { MODEL_LED_STRATEGY_DECISION } from '../core/route/adaptive-flow-domain.ts';
import { validatePersistedAdaptiveBehavior } from '../core/route/adaptive-behavior-record.ts';

const fixture = (): Record<string, unknown> =>
  structuredClone(inputSkeleton('product-route-input').skeleton) as Record<string, unknown>;

test('model-led route leaves concept formation to ordinary model tools', () => {
  const route = routeAdaptiveFlow(fixture());
  assert.deepEqual(route.strategy.methods, []);
  assert.deepEqual(route.behavior.active.methods, []);
  assert.equal(route.behavior.policy.process.owner, 'user-selected-model');
  assert.equal(route.behavior.policy.process.production, 'ordinary-host-tools');
  assert.equal(Reflect.has(route.behavior.policy, 'imageGeneration'), false);
});

test('caller-authored image workflow selection cannot change model-led behavior', () => {
  const input = fixture();
  const strategy = structuredClone(MODEL_LED_STRATEGY_DECISION) as unknown as Record<string, unknown>;
  strategy.methods = ['image-first-draft'];
  input.strategyDecision = strategy;
  const route = routeAdaptiveFlow(input);
  assert.deepEqual(route.strategy.methods, []);
  assert.deepEqual(route.behavior.active.methods, []);
});

test('model-led visual quality remains conjunctive and cannot be replaced by fidelity', () => {
  const quality = routeAdaptiveFlow(fixture()).behavior.active.designQuality;
  assert.equal(quality.candidateMode, 'integrated-visual');
  assert.equal(quality.aggregation, 'conjunctive');
  assert.equal(quality.fidelityCanSubstitute, false);
  assert.equal(quality.floors.beautyDesirability, 4);
  assert.equal(quality.floors.hierarchyComposition, 4);
});

test('a persisted route cannot replay a weakened model-led behavior policy', () => {
  const expected = routeAdaptiveFlow(fixture()).behavior;
  const changed = structuredClone(expected);
  Reflect.set(changed.policy.process, 'production', 'structured-role-workflow');
  assert.throws(() => validatePersistedAdaptiveBehavior(changed, expected), AdaptiveRouteError);
});
