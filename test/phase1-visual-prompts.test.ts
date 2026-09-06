import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADAPTIVE_BEHAVIOR_POLICY,
  ADAPTIVE_STAGE_GRAPH,
  ADAPTIVE_STAGE_OWNERS,
  AdaptiveRouteError,
  MANDATORY_ADAPTIVE_GATES,
  parseRouteRecord,
  routeAdaptiveFlow,
} from '../core/route/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (): object => JSON.parse(readFileSync(
  join(root, 'test/fixtures/adaptive-flow/medical-new-product.json'), 'utf8',
));

test('visual phases retain independent machine-owned artifacts and dependency order', () => {
  const route = routeAdaptiveFlow(fixture());
  assert.equal(ADAPTIVE_STAGE_OWNERS.copy, 'omd-writer');
  assert.equal(ADAPTIVE_STAGE_OWNERS['type-proof'], 'omd-typesetter');
  assert.equal(ADAPTIVE_STAGE_OWNERS.composition, 'omd-composer');
  assert.equal(ADAPTIVE_STAGE_OWNERS['candidate-generation'], 'omd-sketch');
  assert.equal(ADAPTIVE_STAGE_OWNERS.production, 'omd-hand');
  assert.deepEqual(ADAPTIVE_STAGE_GRAPH.composition.prerequisites, ['frame', 'copy']);
  assert.deepEqual(ADAPTIVE_STAGE_GRAPH['type-proof'].prerequisites, ['copy']);
  assert.deepEqual(ADAPTIVE_STAGE_GRAPH['candidate-generation'].prerequisites, ['composition']);
  assert.ok(route.strategy.stages.indexOf('composition') < route.strategy.stages.indexOf('production'));
});

test('register, colour, scale, and carrier decisions are executable conditional policy', () => {
  const visual = ADAPTIVE_BEHAVIOR_POLICY.visual;
  assert.deepEqual(visual.registers, ['quiet', 'confident', 'showpiece']);
  assert.deepEqual(visual.registerDefaults, { marketing: 'confident', product: 'quiet' });
  assert.deepEqual(visual.restrainedMarketingCarrier, ['scale', 'structure', 'display-type']);
  assert.equal(visual.productDisplayExempt, true);
  assert.equal(visual.marketingRequiresColourIdentity, true);
  assert.equal(visual.marketingRequiresBuiltCarrier, true);
  assert.equal(visual.textOnlyMarketingPasses, false);
  assert.equal(visual.colourDistribution, 'surface-conditional');
  assert.equal(visual.marketingColourDistribution, '60-30-10');
  assert.equal(visual.productColourStrategy, 'semantic-action-state');
  assert.equal(visual.colourlessMarketing, 'RED');
  assert.deepEqual(visual.carrierOptions, [
    'gradient-mesh', 'noise-grain-texture', 'svg-geometric-pattern',
    'css-illustration-primitives', 'expressive-theory', 'motion-recipe',
  ]);
  assert.equal(visual.carrierAbsenceClassification, 'surface-conditional');
  assert.equal(visual.productCarrierRequired, false);
  assert.equal(visual.carrierStackingAllowed, false);
  assert.equal(visual.maximumSystematicDetailLayers, 1);
});

test('stack choice, direction divergence, and motion remain locked and non-defaulting', () => {
  const visual = ADAPTIVE_BEHAVIOR_POLICY.visual;
  assert.equal(visual.productionBeforeFrameAndResearch, false);
  assert.equal(visual.explicitStackRequestBuildAuthority, false);
  assert.equal(visual.directionCount, 'ambition-and-uncertainty');
  assert.equal(visual.directionSelection, 'autonomous');
  assert.equal(visual.directionDifference, 'content-generator-and-macro-composition');
  assert.equal(visual.sharedBrandColoursAllowed, true);
  assert.equal(visual.userRegisterMotionLock, true);
  assert.equal(visual.motionDefault, 'none');
  assert.equal(visual.maximumTriggeredScenes, 1);
  assert.equal(visual.motionOneRequiresTriggeredScene, true);
  assert.equal(visual.motionNoneRequiresStaticBreak, false);
  assert.equal(visual.marketingMotionNoneRequiresStaticBreak, true);
  assert.equal(visual.scrollEvidenceAddsMotionObligation, false);
});

test('visual review is isolated, evidence-terminal, and conjunctively gated', () => {
  const route = routeAdaptiveFlow(fixture());
  assert.equal(ADAPTIVE_STAGE_OWNERS['independent-review'], 'omd-eye');
  assert.deepEqual(ADAPTIVE_STAGE_GRAPH['independent-review'].prerequisites, ['browser-evidence']);
  assert.deepEqual(route.behavior.policy.process.reviewIsolation.blindAllowed, [
    'role-brief', 'opaque-renders', 'deterministic-findings',
  ]);
  assert.deepEqual(route.behavior.policy.process.reviewIsolation.fidelityAllowed, [
    'selected-projections', 'handoff-receipts',
  ]);
  assert.equal(route.behavior.policy.visual.criticalReviewFloor, 3);
  assert.deepEqual(route.behavior.policy.visual.reviewVerdicts, [
    'signature-fit', 'narrative-fit', 'motion-fit', 'decision-fit', 'reality-fit',
  ]);
  assert.equal(route.behavior.policy.visual.allReviewVerdictsRequired, true);
  assert.equal(route.behavior.policy.visual.functionalElementIsSignature, false);
  assert.equal(route.behavior.policy.visual.quietProductExtraSignatureRequired, false);
  assert.ok(MANDATORY_ADAPTIVE_GATES.includes('final-evidence-v2'));
  assert.ok(MANDATORY_ADAPTIVE_GATES.includes('independent-review'));
  assert.deepEqual(route.strategy.stages.slice(-3), ['production', 'browser-evidence', 'independent-review']);
});

test('showpiece selected motion persists award or canonical ambition and rejects baseline only there', () => {
  const make = (need: 'restrained' | 'showpiece', ambition: 'baseline' | 'award-level' | 'canonical'): object => {
    const input = fixture();
    const axes = Reflect.get(input, 'designAxes');
    const strategy = Reflect.get(input, 'strategyDecision');
    assert.ok(typeof axes === 'object' && axes !== null && typeof strategy === 'object' && strategy !== null);
    Reflect.set(axes, 'expressiveDesignNeed', need);
    const methods = Reflect.get(strategy, 'methods');
    const skips = Reflect.get(strategy, 'skips');
    const categories = Reflect.get(strategy, 'attributionCategories');
    assert.ok(Array.isArray(methods) && Array.isArray(skips) && Array.isArray(categories));
    Reflect.set(strategy, 'methods', [...methods, 'motion-one', `motion-ambition:${ambition}`]);
    Reflect.set(strategy, 'skips', skips.filter((entry) => Reflect.get(entry, 'id') !== 'motion-one'));
    Reflect.set(strategy, 'attributionCategories', ['tokens', 'motion', ...categories.filter((entry) => entry !== 'tokens')]);
    return input;
  };

  assert.equal(routeAdaptiveFlow(make('showpiece', 'award-level')).behavior.active.motion.ambition, 'award-level');
  assert.equal(routeAdaptiveFlow(make('showpiece', 'canonical')).behavior.active.motion.ambition, 'canonical');
  assert.equal(routeAdaptiveFlow(make('restrained', 'baseline')).behavior.active.motion.ambition, 'baseline');
  assert.throws(() => routeAdaptiveFlow(make('showpiece', 'baseline')), AdaptiveRouteError);

  const missing = make('showpiece', 'award-level');
  const strategy = Reflect.get(missing, 'strategyDecision');
  const methods = Reflect.get(strategy, 'methods');
  assert.ok(Array.isArray(methods));
  Reflect.set(strategy, 'methods', methods.filter((entry) => !String(entry).startsWith('motion-ambition:')));
  assert.throws(() => routeAdaptiveFlow(missing), AdaptiveRouteError);

  const duplicate = make('showpiece', 'award-level');
  const duplicateStrategy = Reflect.get(duplicate, 'strategyDecision');
  const duplicateMethods = Reflect.get(duplicateStrategy, 'methods');
  assert.ok(Array.isArray(duplicateMethods));
  Reflect.set(duplicateStrategy, 'methods', [...duplicateMethods, 'motion-ambition:canonical']);
  assert.throws(() => routeAdaptiveFlow(duplicate), AdaptiveRouteError);
});

test('persisted visual policy mutations fail closed', () => {
  const record = structuredClone(routeAdaptiveFlow(fixture()));
  Reflect.set(record.behavior.policy.visual, 'motionDefault', 'one');
  assert.throws(() => parseRouteRecord(record), AdaptiveRouteError);
});
