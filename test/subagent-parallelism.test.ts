import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADAPTIVE_STAGE_GRAPH,
  ADAPTIVE_STAGE_OWNERS,
  AdaptiveRouteError,
  adaptiveRefinementCheckpoint,
  routeAdaptiveFlow,
} from '../core/route/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (): object => JSON.parse(readFileSync(
  join(root, 'test/fixtures/adaptive-flow/medical-new-product.json'), 'utf8',
));

test('selected scout and writer work is runtime-enforced in one concurrent wave', () => {
  const route = routeAdaptiveFlow(fixture());
  const wave = route.strategy.executionWaves.find((entry) => entry.roles.includes('omd-scout'));
  assert.deepEqual(wave, {
    id: 'parallel-research-copy', mode: 'concurrent', roles: ['omd-scout', 'omd-writer'],
  });
  assert.equal(route.behavior.active.parallelReferenceAcquisition, true);
  assert.equal(route.behavior.policy.references.handoff, 'sanitized-summary-only');
  assert.equal(route.behavior.policy.references.rawHandoff, false);
  assert.deepEqual(route.behavior.policy.references.coverage, [
    'domain', 'competitors', 'audience-language', 'typography', 'voice', 'motion', 'components',
  ]);
  const checkpoint = adaptiveRefinementCheckpoint('red', 'present');
  assert.equal(checkpoint.producer, ADAPTIVE_STAGE_OWNERS.production);
  assert.equal(checkpoint.reviewer, ADAPTIVE_STAGE_OWNERS['independent-review']);
  assert.notEqual(checkpoint.producer, checkpoint.reviewer);
  assert.deepEqual(ADAPTIVE_STAGE_GRAPH['independent-review'].prerequisites, ['browser-evidence']);
  assert.deepEqual(route.strategy.stages.slice(-3), ['production', 'browser-evidence', 'independent-review']);
});

test('execution waves are dependency-safe and reject sequential scout-writer mutation', () => {
  const input = fixture();
  const strategy = Reflect.get(input, 'strategyDecision');
  Reflect.set(strategy, 'executionWaves', [
    { id: 'frame', mode: 'concurrent', roles: ['omd-framer'] },
    { id: 'scout', mode: 'concurrent', roles: ['omd-scout'] },
    { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
    { id: 'composition', mode: 'concurrent', roles: ['omd-composer'] },
    { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
    { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
  ]);
  assert.throws(() => routeAdaptiveFlow(input), (error: unknown) => {
    assert.ok(error instanceof AdaptiveRouteError);
    assert.equal(error.code, 'ADAPTIVE_EXECUTION_WAVE_INVALID');
    return true;
  });
});
