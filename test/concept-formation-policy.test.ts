import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AdaptiveRouteError, parseRouteRecord, routeAdaptiveFlow } from '../core/route/index.ts';

const fixture = () => JSON.parse(readFileSync(
  fileURLToPath(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url)), 'utf8',
));
const selected = () => {
  const input = fixture();
  input.strategyDecision.methods.push('image-first-draft');
  input.strategyDecision.skips = input.strategyDecision.skips.filter((row: { id: string }) => row.id !== 'image-first-draft');
  return routeAdaptiveFlow(input);
};

test('selected draft formation supports one governing anchor and shared brand colours', () => {
  const route = selected();
  const image = route.behavior.policy.imageGeneration;
  const visual = route.behavior.policy.visual;
  assert.equal(Reflect.get(image, 'anchorCount'), 'content-dependent');
  assert.equal(Reflect.has(image, 'minimumDistinctAnchors'), false);
  assert.equal(Reflect.get(image, 'templateAssessment'), 'visible-fit-not-family-name');
  assert.equal(Reflect.get(image, 'nonShippingIsSkipReason'), false);
  assert.equal(Reflect.get(visual, 'directionCount'), 'ambition-and-uncertainty');
  assert.equal(Reflect.get(visual, 'directionCountCommitment'), 'before-generation-with-evidence-reason');
  assert.equal(Reflect.get(visual, 'directionDifference'), 'content-generator-and-macro-composition');
  assert.equal(Reflect.get(visual, 'sharedBrandColoursAllowed'), true);
  assert.equal(Reflect.has(visual, 'autonomousMarketingDirectionCount'), false);
  assert.deepEqual(parseRouteRecord(JSON.parse(JSON.stringify(route))), route);
});

test('relaxed style quotas preserve candidate feasibility and selection obligations', () => {
  const route = selected();
  const image = route.behavior.policy.imageGeneration;
  assert.equal(Reflect.get(image, 'feasibilityEvidence'), 'rendered-anchor-and-task-at-required-viewports');
  assert.equal(Reflect.get(image, 'selectionMerit'), 'rendered-concept-task-and-craft');
  assert.equal(Reflect.get(image, 'costRole'), 'explicit-budget-or-equivalent-candidate-tiebreak');
  assert.equal(image.owner, 'coordinator');
  assert.equal(image.composerRole, 'selected-draft-consumer');
  assert.equal(image.chosenDraftShips, false);
  assert.equal(route.behavior.active.designQuality.fidelityCanSubstitute, false);
  assert.equal(route.behavior.policy.visual.maximumTriggeredScenes, 1);
});

test('stale quota policy and weakened candidate checks cannot replay as current route behavior', () => {
  for (const [key, value] of [
    ['minimumDistinctAnchors', 3],
    ['templateAssessment', 'reject-all-split-heroes'],
    ['costRole', 'cheapest-feasible'],
    ['feasibilityEvidence', 'author-confidence'],
    ['chosenDraftShips', true],
  ] as const) {
    const route = structuredClone(selected());
    Reflect.set(route.behavior.policy.imageGeneration, key, value);
    assert.throws(() => parseRouteRecord(route), AdaptiveRouteError, key);
  }
});

test('content-dependent formation does not activate a skipped image method', () => {
  const route = routeAdaptiveFlow(fixture());
  assert.equal(route.behavior.active.imageGeneration, false);
  assert.ok(route.strategy.skips.some(row => row.id === 'image-first-draft' && row.reason.length > 0));
});
