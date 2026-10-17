import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateAdaptiveExecutionWaves } from '../core/route/adaptive-execution-waves.ts';
import { MODEL_LED_STRATEGY_DECISION } from '../core/route/adaptive-flow-domain.ts';
import { diagnoseAdaptiveRouteInput, routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';

function starter(): Record<string, unknown> {
  return structuredClone(inputSkeleton('product-route-input').skeleton) as Record<string, unknown>;
}

test('route starter exposes only the canonical model-led strategy', () => {
  const value = starter();
  assert.equal(Object.hasOwn(value, 'strategyDecision'), false);
  const strategy = routeAdaptiveFlow(value).strategy;
  assert.deepEqual(strategy.roles, ['omd-hand', 'omd-eye']);
  assert.deepEqual(strategy.stages, ['production', 'browser-evidence', 'independent-review']);
  assert.deepEqual(strategy.methods, []);
});

test('canonical execution waves retain production before independent review', () => {
  assert.doesNotThrow(() => validateAdaptiveExecutionWaves(MODEL_LED_STRATEGY_DECISION));
  assert.throws(() => validateAdaptiveExecutionWaves({
    ...MODEL_LED_STRATEGY_DECISION,
    executionWaves: [{ id: 'review', mode: 'concurrent', roles: ['omd-eye'] }],
  }), /ADAPTIVE_EXECUTION_WAVE_INVALID/);
});

test('caller-authored structured strategy fields cannot select route behavior', () => {
  const value = starter();
  value.strategyDecision = {
    ...MODEL_LED_STRATEGY_DECISION,
    roles: ['omd-framer', 'omd-hand', 'omd-eye'],
  };
  assert.deepEqual(routeAdaptiveFlow(value).strategy, MODEL_LED_STRATEGY_DECISION);
  assert.deepEqual(diagnoseAdaptiveRouteInput(value), []);
});

test('canonical starter remains classifiable without selecting workflow methods', () => {
  const value = starter();
  assert.equal(routeAdaptiveFlow(value).route, 'adaptive');
});

test('missing route is unclassified, not malformed or a request for external activation', t => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-unclassified-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('../bin/omd.mjs', import.meta.url)), 'guard', 'completion', '--json'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }), (error: unknown) => {
    const failure = error as { stdout: unknown; stderr: unknown };
    const output = `${String(failure.stdout)}\n${String(failure.stderr)}`;
    assert.match(output, /ROUTE_UNCLASSIFIED/);
    assert.doesNotMatch(output, /MALFORMED_ADAPTIVE_ROUTE/);
    return true;
  });
});
