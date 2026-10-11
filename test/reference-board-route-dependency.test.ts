import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { AdaptiveRouteError } from '../core/route/adaptive-flow-domain.ts';
import { diagnoseAdaptiveRouteInput, routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/adaptive-flow/${name}.json`, import.meta.url), 'utf8'));
}

function referenceInput(placement: 'missing' | 'before-scout' | 'after-board'): unknown {
  const value = fixture('medical-new-product');
  assert.ok(typeof value === 'object' && value !== null);
  const strategy: unknown = Reflect.get(value, 'strategyDecision');
  assert.ok(typeof strategy === 'object' && strategy !== null);
  const stages: unknown = Reflect.get(strategy, 'stages');
  const skips: unknown = Reflect.get(strategy, 'skips');
  assert.ok(Array.isArray(stages) && Array.isArray(skips));
  const selected = stages.filter((stage: unknown): stage is string => typeof stage === 'string' && stage !== 'acquisition');
  const remainingSkips = skips.filter((skip: unknown) => {
    assert.ok(typeof skip === 'object' && skip !== null);
    return Reflect.get(skip, 'id') !== 'acquisition';
  });
  if (placement !== 'missing') {
    const index = placement === 'before-scout' ? selected.indexOf('scout') : selected.indexOf('reference-board') + 1;
    selected.splice(index, 0, 'acquisition');
  }
  return {
    ...value,
    strategyDecision: {
      ...strategy,
      stages: selected,
      skips: placement === 'missing'
        ? [...remainingSkips, { id: 'acquisition', reason: 'Acquire references directly without a separate plan.' }]
        : remainingSkips,
    },
  };
}

for (const placement of ['missing', 'after-board'] as const) {
  test(`reference board refuses ${placement} acquisition without mutating input`, () => {
    const input = referenceInput(placement);
    const before = JSON.stringify(input);
    assert.throws(() => routeAdaptiveFlow(input), (error: unknown) => {
      assert.ok(error instanceof AdaptiveRouteError);
      assert.equal(error.code, 'ADAPTIVE_STAGE_ORDER_INVALID');
      return true;
    });
    assert.equal(JSON.stringify(input), before);
  });
}

test('route diagnostics expose the missing acquisition dependency', () => {
  assert.ok(diagnoseAdaptiveRouteInput(referenceInput('missing')).some(
    diagnostic => diagnostic.path === 'strategyDecision.stages' && diagnostic.code === 'ADAPTIVE_STAGE_ORDER_INVALID',
  ));
});

test('reference board accepts acquisition before Scout', () => {
  assert.doesNotThrow(() => routeAdaptiveFlow(referenceInput('before-scout')));
});

test('a route without reference board can explicitly skip acquisition', () => {
  assert.doesNotThrow(() => routeAdaptiveFlow(fixture('copy-only')));
});

for (const starter of ['product-route-input', 'design-route-input']) {
  test(`${starter} supplies its board acquisition dependency`, () => {
    const route = routeAdaptiveFlow(inputSkeleton(starter).skeleton);
    assert.ok(route.strategy.stages.includes('acquisition'));
    assert.ok(route.strategy.roles.includes('omd-framer'));
    assert.ok(route.strategy.stages.indexOf('acquisition') < route.strategy.stages.indexOf('scout'));
  });
}

test('a missing selected domain points to its owner before acquisition and reference discovery', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-board-acquisition-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invocation = publishTestAdaptiveRoute(root, referenceInput('before-scout'));
  const work = nextStageWork(root, fileURLToPath(new URL('../core', import.meta.url)), invocation);
  assert.equal(work.stage, 'domain');
  assert.equal(work.owner, 'coordinator');
  assert.equal(work.action, 'author-output');
  assert.equal(work.referenceWork, null);
  assert.equal(work.next, 'omd brief domain --check --json');
});
