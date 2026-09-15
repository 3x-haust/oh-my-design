import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { routeLocaleDesignContext } from '../core/locale/design-context.ts';
import { buildReferenceDiscoveryPlan, missingDiscoveryMotionEvidence } from '../core/ref/discovery-plan.ts';
import { buildBrief, formatBrief } from '../core/brief/index.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';

const fixture = (name = 'synth-marketing') => JSON.parse(readFileSync(
  fileURLToPath(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url)), 'utf8'));
function project(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'omd-auto-discovery-'));
  mkdirSync(join(root, '.omd'), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const still = { source: 'captured-reference', scrollFired: false, animatedShare: 0, peakEnergy: 0 };

test('URL-free showpiece requests receive automatic craft and motion lanes without a domain artifact', t => {
  const root = project(t);
  const input = fixture();
  input.request = '한국어 신시사이저 랜딩페이지를 만들어줘. 국내 멋진 수상작처럼 스크롤 애니메이션도 잘 되게 해줘.';
  const route = routeAdaptiveFlow(input);
  assert.equal(route.strategy.stages.includes('domain'), false);
  const plan = buildReferenceDiscoveryPlan(root, route);
  assert.equal(plan.userUrlsRequired, false);
  assert.equal(plan.request, input.request);
  assert.deepEqual(plan.lanes.map(lane => lane.id), ['subject-identity', 'task-components', 'visual-craft', 'motion']);
  assert.deepEqual(plan.galleryDirectories, ['Awwwards', 'FWA', 'GDWEB']);
  assert.equal(plan.motionEvidenceRequired, true);
  assert.deepEqual(plan.decisions, [], 'no section template is invented before Framer');
  assert.deepEqual(plan.locale, { surfaceLocale: null, explicitMarket: null, culturalDecision: null });
  assert.equal(plan.queryPolicy, 'derive-from-explicit-request-and-decisions-not-locale-stereotypes');
});

test('explicit Korean surface mechanics remain separate from market and source-country preferences', t => {
  const root = project(t);
  const locale = routeLocaleDesignContext({
    schema: 'locale-design-context-v1', conversationLanguage: 'ko', surfaceLocale: 'ko',
    marketRegion: null, audience: 'Developers', domain: 'Instrument launch', surface: 'marketing',
    desiredFit: 'locale-mechanics-only', brandInvariants: ['Supplied instrument facts'],
  });
  const plan = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(fixture(), undefined, locale));
  assert.equal(plan.locale.surfaceLocale, 'ko');
  assert.equal(plan.locale.explicitMarket, null);
  assert.equal(plan.locale.culturalDecision, 'mechanics-only');
  assert.equal(plan.lanes.some(lane => lane.id === 'visual-craft'), true);
  assert.doesNotMatch(JSON.stringify(plan), /Korean style|Korean users|Korean market/);
});

test('a one-sentence balanced marketing route investigates craft and motion without inventing a scene lock', t => {
  const input = fixture();
  input.request = readFileSync(new URL('../evals/landing-quality/no-reference-ko.md', import.meta.url), 'utf8').trim();
  assert.equal(input.request, '현재 README에 있는 Oh My Design의 한국어 랜딩페이지를 만들어줘.');
  input.designAxes.expressiveDesignNeed = 'balanced';
  input.strategyDecision.methods = input.strategyDecision.methods.filter((method: string) =>
    method !== 'motion-one' && !method.startsWith('motion-ambition:'))
    .map((method: string) => method === 'design-strategy-expressive-campaign' ? 'design-strategy-operational-ux' : method);
  input.strategyDecision.attributionCategories = input.strategyDecision.attributionCategories.filter((category: string) => category !== 'motion');
  input.strategyDecision.skips.push({ id: 'motion-one', reason: 'No production scene is selected before comparing relevant evidence.' });
  const route = routeAdaptiveFlow(input);
  const plan = buildReferenceDiscoveryPlan(project(t), route);
  assert.equal(plan.decision, 'discover');
  assert.equal(plan.expressiveNeed, 'balanced');
  assert.deepEqual(plan.lanes.map(lane => lane.id), ['subject-identity', 'task-components', 'visual-craft', 'motion']);
  assert.match(plan.lanes.find(lane => lane.id === 'motion')!.purpose, /does not select a production scene/);
  assert.equal(plan.motionEvidenceRequired, false);
  assert.equal(missingDiscoveryMotionEvidence(plan, []), false, 'researching a candidate is not an activated motion contract');
  assert.equal(route.strategy.methods.includes('motion-one'), false);
});

test('search decisions are the current owned acquisition questions, not guessed generic sections', t => {
  const root = project(t);
  const question = 'How does a patch example preserve its labels while a connection changes?';
  writeFileSync(join(root, '.omd/acquisition-plan.json'), JSON.stringify({
    schema: 'reference-acquisition-plan-v2', owner: 'omd-framer', localeContextSha256: null,
    zones: [{ id: 'patch-example', kind: 'region', job: 'Explain a connection', required: true,
      decisionId: 'patch-feedback', question, axes: ['structure', 'motion'],
      requiredState: 'A labeled connection example changes after interaction.',
      viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
      falsifier: 'The changed connection becomes detached from its labels.',
    }],
  }));
  const plan = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(fixture()));
  assert.deepEqual(plan.decisions.map(decision => decision.zoneId), ['patch-example']);
  assert.deepEqual(plan.lanes.find(lane => lane.id === 'task-components')?.querySeeds, [question]);
  assert.equal(plan.decisions[0]!.state, 'A labeled connection example changes after interaction.');
  assert.equal(plan.decisions[0]!.viewports.length, 2);
});

test('selected motion cannot be satisfied by static captures or waived by omitting domain analysis', t => {
  const plan = buildReferenceDiscoveryPlan(project(t), routeAdaptiveFlow(fixture()));
  assert.equal(missingDiscoveryMotionEvidence(plan, []), true);
  assert.equal(missingDiscoveryMotionEvidence(plan, [still]), true);
  for (const change of [{ scrollFired: true }, { animatedShare: 0.1 }, { peakEnergy: 0.2 }]) {
    assert.equal(missingDiscoveryMotionEvidence(plan, [{ ...still, ...change }]), false);
  }
});

test('restrained discovery and sufficient existing evidence do not manufacture award-motion obligations', t => {
  const root = project(t);
  const restrained = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(fixture('medical-new-product')));
  assert.deepEqual(restrained.lanes.map(lane => lane.id), ['subject-identity', 'task-components']);
  assert.equal(missingDiscoveryMotionEvidence(restrained, []), false);
  const operational = fixture('medical-new-product');
  operational.designAxes.expressiveDesignNeed = 'balanced';
  const balancedProduct = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(operational));
  assert.equal(balancedProduct.lanes.some(lane => lane.id === 'visual-craft'), false, 'ordinary product work does not acquire an award-gallery sequence by default');
  const skipped = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(fixture('copy-only')));
  assert.equal(skipped.decision, 'skip');
  assert.deepEqual(skipped.lanes, []);
  assert.deepEqual(skipped.galleryDirectories, []);
  assert.ok(skipped.skipReason);
});

test('stale optional domain queries cannot steer the current request', t => {
  const root = project(t);
  const input = fixture();
  const domain = {
    schema: 'domain-brief-v1', request: input.request, domain: 'Instrument', summary: 'Explain the supplied instrument.',
    surfaces: [{ name: 'Landing', purpose: 'Decide whether to adopt' }], coreObjects: ['Instrument'], audience: 'Musicians',
    referenceQueries: { component: ['patch controls'], craft: ['expressive interaction case study'] }, researched: false,
  };
  writeFileSync(join(root, '.omd/domain-brief.json'), JSON.stringify(domain));
  const plan = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(input));
  assert.deepEqual(plan.lanes.find(lane => lane.id === 'visual-craft')?.querySeeds, domain.referenceQueries.craft);
  writeFileSync(join(root, '.omd/domain-brief.json'), JSON.stringify({ ...domain, request: 'An earlier unrelated project.' }));
  assert.throws(() => buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(input)), /earlier request/);
});

test('current Scout briefs expose the automatic plan without leaking discovery sources downstream', t => {
  const root = project(t);
  const invocation = publishTestAdaptiveRoute(root, fixture());
  const scout = buildBrief(root, 'scout', undefined, invocation);
  assert.equal(scout.discovery?.command, 'omd ref discover-plan --json');
  assert.equal(scout.discovery?.userUrlsRequired, false);
  assert.equal(scout.discovery?.motionEvidenceRequired, true);
  assert.match(formatBrief(scout), /user reference URLs are optional/);
  for (const stage of ['composition', 'production', 'independent-review'] as const) {
    assert.equal(buildBrief(root, stage, undefined, invocation).discovery, null);
  }
});
