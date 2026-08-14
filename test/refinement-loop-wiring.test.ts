import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AdaptiveRouteError,
  adaptiveRefinementCheckpoint,
  adaptiveRefinementDisposition,
  parseRouteRecord,
  routeAdaptiveFlow,
} from '../core/route/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name: string): object => JSON.parse(readFileSync(
  join(root, `test/fixtures/adaptive-flow/${name}.json`), 'utf8',
));

test('typed routes start refinement only when selected or a required gate is RED', () => {
  const copy = routeAdaptiveFlow(fixture('copy-only'));
  const medical = routeAdaptiveFlow(fixture('medical-new-product'));
  assert.equal(copy.behavior.active.reflectionCheckpoints, false);
  assert.ok(copy.strategy.skips.some((entry) => entry.id === 'reflection-in-action' && entry.reason.trim() !== ''));
  assert.equal(medical.behavior.active.reflectionCheckpoints, true);
  assert.deepEqual(adaptiveRefinementDisposition(copy.strategy, 'green'), {
    action: 'stop', producer: 'omd-hand', reviewer: 'omd-eye', reason: 'required-gates-green',
  });
  assert.equal(adaptiveRefinementDisposition(copy.strategy, 'red').action, 'run');
  assert.equal(adaptiveRefinementDisposition(medical.strategy, 'green').action, 'run');
});

test('RED, GREEN, and missing-evidence checkpoints have executable stop semantics', () => {
  assert.deepEqual(adaptiveRefinementCheckpoint('red', 'present'), {
    action: 'continue', countsRound: true, producer: 'omd-hand', reviewer: 'omd-eye',
  });
  assert.deepEqual(adaptiveRefinementCheckpoint('green', 'present'), {
    action: 'complete', countsRound: true, producer: 'omd-hand', reviewer: 'omd-eye',
  });
  assert.deepEqual(adaptiveRefinementCheckpoint('red', 'missing'), {
    action: 'reject', countsRound: false, producer: 'omd-hand', reviewer: 'omd-eye',
  });
});

test('refinement is evidence-driven without a remembered round table or gate override', () => {
  const policy = routeAdaptiveFlow(fixture('medical-new-product')).behavior.policy.refinement;
  assert.equal(policy.evidenceRequired, true);
  assert.equal(policy.redAction, 'continue');
  assert.equal(policy.greenAction, 'complete');
  assert.equal(policy.missingEvidenceCounts, false);
  assert.equal(policy.fixedRoundTable, false);
  assert.equal(policy.overridesMandatoryGates, false);
  assert.notEqual(policy.producer, policy.reviewer);

  const record = structuredClone(routeAdaptiveFlow(fixture('medical-new-product')));
  Reflect.set(record.behavior.policy.refinement, 'missingEvidenceCounts', true);
  assert.throws(() => parseRouteRecord(record), AdaptiveRouteError);
});
