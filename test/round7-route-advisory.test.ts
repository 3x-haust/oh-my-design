import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { adaptiveRouteUnknownFieldWarnings } from '../core/route/adaptive-flow-boundary.ts';
const fixture = (): Record<string, unknown> => JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/adaptive-flow/copy-only.json', import.meta.url)), 'utf8'));
test('optional stage omission and extra ordinary route fields do not refuse', () => {
  const input = fixture();
  input.extra = 'ordinary note';
  const strategy = input.strategyDecision as Record<string, unknown>;
  strategy.extra = 'ordinary note';
  const stages = strategy.stages as string[];
  strategy.stages = stages.filter(stage => stage !== 'domain');
  strategy.skips = (strategy.skips as { id: string; reason: string }[]).filter(item => item.id !== 'domain');
  const warnings = adaptiveRouteUnknownFieldWarnings(input);
  assert.deepEqual(warnings.map(w => w.field), ['route.extra', 'strategyDecision.extra']);
  assert.equal(routeAdaptiveFlow(input).strategy.stages.includes('domain'), false);
});
test('unsafe accessors and an attempted host-owned authority field are rejected', () => {
  const accessor = fixture(); Object.defineProperty(accessor, 'request', { enumerable: true, get() { throw new Error('do not read'); } });
  assert.throws(() => routeAdaptiveFlow(accessor));
  assert.throws(() => routeAdaptiveFlow({ ...fixture(), signature: 'forged' }));
});
