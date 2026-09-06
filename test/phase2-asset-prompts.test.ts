import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aiAssetDecisionAuthorityBytes,
  commitAiAssetDecision,
  validateAiImageUsage,
} from '../core/asset-sourcing/index.ts';
import { PhotoLicenseError, validatePhotoProvenance } from '../core/graphics/photo-license.ts';
import {
  ADAPTIVE_BEHAVIOR_POLICY,
  AdaptiveRouteError,
  parseRouteRecord,
  routeAdaptiveFlow,
  validateAttributionCoverage,
} from '../core/route/index.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectRunInvocation,
  createTestProjectWriteAdapter,
} from './helpers/project-write.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoots: string[] = [];
after(() => {
  for (const path of temporaryRoots) rmSync(path, { recursive: true, force: true });
});
const fixture = (): object => JSON.parse(readFileSync(
  join(root, 'test/fixtures/adaptive-flow/copy-only.json'), 'utf8',
));

test('asset precedence, fallback, and dependency authority are machine contracts', () => {
  const assets = ADAPTIVE_BEHAVIOR_POLICY.assets;
  assert.equal(assets.dependencyPolicy, 'named-only');
  assert.deepEqual(assets.sourcePrecedence, [
    'user-asset', 'free-license-photo', 'conditional-ai', 'additive-webgl',
  ]);
  assert.deepEqual(assets.fallback, ['user-asset', 'css-svg']);
  assert.equal(assets.placeholderFinalAllowed, false);
  assert.equal(assets.sourcingOverridesCarrierDecision, false);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.visual.userRegisterMotionLock, true);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.visual.directionCount, 'ambition-and-uncertainty');
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.visual.motionOneRequiresTriggeredScene, true);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.visual.motionNoneRequiresStaticBreak, false);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.visual.marketingMotionNoneRequiresStaticBreak, true);

  const input = fixture();
  Reflect.set(input, 'namedDependencies', ['existing-design-system']);
  const route = routeAdaptiveFlow(input);
  assert.deepEqual(route.namedDependencies, ['existing-design-system']);
  assert.deepEqual(route.sourceContract.namedDependencies, ['existing-design-system']);
  assert.deepEqual(route.allowedPaths, ['src/copy/**']);
});

test('free photography requires lawful provenance while mood boards remain study-only', () => {
  const photo = validatePhotoProvenance({
    source: 'Openverse', sourcePage: 'https://openverse.org/image/example', license: 'CC-BY',
    photographer: 'Example Creator', attribution: 'Example Creator, CC-BY',
    localPath: 'public/example.jpg', altText: 'A quiet atmospheric landscape',
  });
  assert.equal(photo.license, 'CC-BY');
  assert.deepEqual(ADAPTIVE_BEHAVIOR_POLICY.assets.freePhotoProvenance, [
    'source', 'license', 'attribution',
  ]);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.assets.moodBoardUse, 'study-only');
  assert.throws(() => validatePhotoProvenance({
    ...photo, source: 'Pinterest', license: 'all-rights-reserved',
  }), PhotoLicenseError);
});

test('AI imagery is conditional and binds exact provenance to a current immutable omd decision', () => {
  const assets = ADAPTIVE_BEHAVIOR_POLICY.assets;
  assert.deepEqual(assets.aiZones, ['abstract', 'atmospheric']);
  assert.deepEqual(assets.aiProvenance, [
    'prompt', 'provider', 'trusted-project-current-omd-decision',
    'host-ai-asset-decision-authority',
  ]);
  assert.equal(assets.factualCarrierAiAllowed, false);
  assert.equal(assets.fabricateFactsOrAssets, false);
  assert.equal(assets.mandatePhoto, false);

  const projectRoot = mkdtempSync(join(tmpdir(), 'omd-phase2-ai-authority-'));
  temporaryRoots.push(projectRoot);
  const invocation = createTestProjectRunInvocation(projectRoot, 'phase2-ai-asset');
  const decisionInput = {
    decisionId: 'hero-atmosphere', prompt: 'soft cobalt atmospheric field',
    provider: 'host-imagegen', reason: 'The abstract launch carrier is selected by art direction.',
  };
  const authority = aiAssetDecisionAuthorityBytes(projectRoot, decisionInput, invocation);
  authorizeTestProjectRunPayloads(projectRoot, invocation, [{ purpose: 'ai-asset-decision', payload: authority }]);
  const decision = commitAiAssetDecision(
    projectRoot, decisionInput, createTestProjectWriteAdapter(projectRoot, invocation), invocation,
  );
  const usage = {
    zone: 'atmospheric' as const, hostHasImageGen: true,
    provenance: { prompt: decisionInput.prompt, provider: decisionInput.provider },
    decision, currentDecision: decision, projectRoot, invocation,
  };
  assert.deepEqual(validateAiImageUsage(usage), { allowed: true, violations: [] });

  const mutations: readonly (readonly [string, object])[] = [
    ['missing decision', { ...usage, decision: undefined }],
    ['uncommitted decision', { ...usage, decision: { ...decision, status: 'draft' } }],
    ['tampered decision', { ...usage, decision: { ...decision, decisionSha256: 'c'.repeat(64) } }],
    ['mismatched prompt', { ...usage, provenance: { ...usage.provenance, prompt: 'different prompt' } }],
    ['mismatched provider', { ...usage, provenance: { ...usage.provenance, provider: 'other-provider' } }],
    ['stale current reference', { ...usage, currentDecision: { ...usage.currentDecision, decisionSha256: 'a'.repeat(64) } }],
    ['missing current reference', { ...usage, currentDecision: undefined }],
  ];
  for (const [label, mutation] of mutations) {
    const result = validateAiImageUsage(mutation as Parameters<typeof validateAiImageUsage>[0]);
    assert.equal(result.allowed, false, label);
    assert.ok(result.violations.some((entry) => entry.includes('decision')), label);
  }

  const routedInput = fixture();
  const strategy = Reflect.get(routedInput, 'strategyDecision');
  const methods = Reflect.get(strategy, 'methods');
  const skips = Reflect.get(strategy, 'skips');
  assert.ok(Array.isArray(methods) && Array.isArray(skips));
  Reflect.set(strategy, 'methods', [...methods, 'ai-shipped-asset']);
  Reflect.set(strategy, 'skips', skips.filter((entry) => Reflect.get(entry, 'id') !== 'ai-shipped-asset'));
  Reflect.set(strategy, 'aiAssets', [{
    assetId: 'hero-atmosphere', zone: 'atmospheric', ...usage.provenance,
    decision, currentDecision: usage.currentDecision,
  }]);
  Reflect.set(strategy, 'attributionCategories', ['tokens', 'graphics']);
  const routed = routeAdaptiveFlow(routedInput, { root: projectRoot, invocation });
  assert.deepEqual(routed.behavior.active.aiAssetDecisionIds, ['hero-atmosphere']);
  assert.deepEqual(routed.behavior.active.attributionCategories, ['tokens', 'graphics']);

  const forged = structuredClone(routed);
  Reflect.set(forged.strategy.aiAssets[0]?.currentDecision ?? {}, 'decisionSha256', 'b'.repeat(64));
  assert.throws(
    () => parseRouteRecord(forged, { root: projectRoot, invocation }),
    AdaptiveRouteError,
  );
});

test('adaptive attribution coverage is exact and conditionally derived from selected contracts', () => {
  assert.deepEqual(validateAttributionCoverage(['tokens'], ['tokens']), ['tokens']);
  assert.deepEqual(validateAttributionCoverage(
    ['tokens', 'motion', 'composition', 'graphics'],
    ['tokens', 'motion', 'composition', 'graphics'],
  ), ['tokens', 'motion', 'composition', 'graphics']);
  for (const mutation of [
    ['tokens', 'motion', 'graphics'],
    ['tokens', 'motion', 'composition', 'graphics', 'graphics'],
    ['tokens', 'motion', 'composition', 'graphics', 'photography'],
  ]) {
    assert.throws(
      () => validateAttributionCoverage(mutation, ['tokens', 'motion', 'composition', 'graphics']),
      AdaptiveRouteError,
    );
  }
  assert.deepEqual(routeAdaptiveFlow(fixture()).behavior.active.attributionCategories, ['tokens']);
  const medical = JSON.parse(readFileSync(
    join(root, 'test/fixtures/adaptive-flow/medical-new-product.json'), 'utf8',
  ));
  assert.deepEqual(routeAdaptiveFlow(medical).behavior.active.attributionCategories, [
    'tokens', 'composition',
  ]);

  const missing = fixture();
  const strategy = Reflect.get(missing, 'strategyDecision');
  assert.ok(typeof strategy === 'object' && strategy !== null);
  Reflect.set(strategy, 'attributionCategories', ['tokens', 'composition']);
  assert.throws(() => routeAdaptiveFlow(missing), AdaptiveRouteError);
});

test('WebGL remains additive behind precedence, budget, and semantic fallback', () => {
  assert.deepEqual(ADAPTIVE_BEHAVIOR_POLICY.assets.webglRequires, [
    'hand-precedence', 'performance-budget', 'semantic-fallback',
  ]);
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.assets.sourcePrecedence.at(-1), 'additive-webgl');
});

test('persisted asset handoff and dependency policy cannot be weakened', () => {
  const record = structuredClone(routeAdaptiveFlow(fixture()));
  Reflect.set(record.behavior.policy.assets, 'fabricateFactsOrAssets', true);
  assert.throws(() => parseRouteRecord(record), AdaptiveRouteError);
});
