import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADAPTIVE_BEHAVIOR_POLICY,
  AdaptiveRouteError,
  OPTIONAL_METHOD_IDS,
  parseRouteRecord,
  routeAdaptiveFlow,
} from '../core/route/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const input = (name: string): object => JSON.parse(readFileSync(
  join(root, `test/fixtures/adaptive-flow/${name}.json`), 'utf8',
));

test('image generation has an executable generate-analyze-implement and non-shipping contract', () => {
  const policy = ADAPTIVE_BEHAVIOR_POLICY.imageGeneration;
  assert.deepEqual(policy.sequence, ['generate', 'analyze', 'implement']);
  assert.equal(policy.owner, 'coordinator');
  assert.equal(policy.selection, 'blind');
  assert.equal(policy.concurrency, 'independent-drafts');
  assert.equal(policy.requiresHostCapability, true);
  assert.equal(policy.anchorCount, 'content-dependent');
  assert.equal(policy.templateAssessment, 'visible-fit-not-family-name');
  assert.equal(policy.chosenDraftShips, false);
  assert.equal(policy.factualCarrierAllowed, false);
  assert.equal(policy.distanceBlocksShipping, false);
});

test('selected image generation is consumed by composition and omitted image work stays reasoned', () => {
  assert.ok(OPTIONAL_METHOD_IDS.includes('image-first-draft'));
  const skipped = routeAdaptiveFlow(input('copy-only'));
  assert.equal(skipped.behavior.active.imageGeneration, false);
  assert.ok(skipped.strategy.skips.some((entry) => entry.id === 'image-first-draft' && entry.reason.trim() !== ''));

  const selectedInput = input('medical-new-product');
  const strategy = Reflect.get(selectedInput, 'strategyDecision');
  const methods = Reflect.get(strategy, 'methods');
  const skips = Reflect.get(strategy, 'skips');
  assert.ok(Array.isArray(methods) && Array.isArray(skips));
  Reflect.set(strategy, 'methods', [...methods, 'image-first-draft']);
  Reflect.set(strategy, 'skips', skips.filter((entry) => Reflect.get(entry, 'id') !== 'image-first-draft'));
  const selected = routeAdaptiveFlow(selectedInput);
  assert.equal(selected.behavior.active.imageGeneration, true);
  assert.ok(selected.strategy.roles.includes('omd-composer'));
  assert.ok(selected.strategy.stages.includes('composition'));
  assert.equal(selected.behavior.policy.imageGeneration.composerRole, 'selected-draft-consumer');
  assert.deepEqual(selected.behavior.policy.imageGeneration.composerForbidden, [
    'provider-prompt', 'generation', 'cache-management', 'draft-selection',
  ]);
});

test('selected references seed drafts through sanitized blueprints and measured local handoff', () => {
  assert.deepEqual(ADAPTIVE_BEHAVIOR_POLICY.imageGeneration.seedInputs, [
    'selected-references', 'skin-abstracted-blueprints', 'project-owned-inputs',
  ]);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.references.localPartImages, true);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.references.fidelityTarget, 'high');
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.references.blueprintSeedAllowed, true);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.references.handoff, 'sanitized-summary-only');
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.references.rawHandoff, false);
  assert.equal(routeAdaptiveFlow(input('copy-only')).behavior.active.referenceDistance, false);
  assert.equal(routeAdaptiveFlow(input('medical-new-product')).behavior.active.referenceDistance, true);
});

test('persisted image-generation behavior cannot be weakened', () => {
  const record = structuredClone(routeAdaptiveFlow(input('medical-new-product')));
  Reflect.set(record.behavior.policy.imageGeneration, 'chosenDraftShips', true);
  assert.throws(() => parseRouteRecord(record), AdaptiveRouteError);
});
