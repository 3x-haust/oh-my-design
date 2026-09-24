import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { routeLocaleDesignContext } from '../core/locale/design-context.ts';
import { buildReferenceDiscoveryPlan, missingDiscoveryMotionEvidence } from '../core/ref/discovery-plan.ts';
import { parseSearchInput } from '../core/ref/search-execution.ts';
import { buildBrief, formatBrief } from '../core/brief/index.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { inferredKoreanReferenceMarket, isMarketQualifiedQuery } from '../core/ref/market-reference.ts';

const fixture = (name = 'synth-marketing') => JSON.parse(readFileSync(
  fileURLToPath(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url)), 'utf8'));
function project(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'omd-auto-discovery-'));
  mkdirSync(join(root, '.omd'), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const still = { source: 'captured-reference', scrollFired: false, animatedShare: 0, peakEnergy: 0 };

test('Korean product brief starts both research lanes in Korea without asserting a Korean visual style', t => {
  const input = fixture('medical-new-product');
  input.request = '복지 혜택을 찾아 신청까지 이어가는 한국어 서비스를 만들어줘.';
  input.taskOutcome.goal = '복지 혜택을 탐색하고 신청을 준비한다.';
  const plan = buildReferenceDiscoveryPlan(project(t), routeAdaptiveFlow(input));
  assert.equal(plan.marketReferencePolicy.marketRegion, 'KR');
  assert.equal(plan.marketReferencePolicy.mode, 'target-market-first');
  assert.equal(plan.marketReferencePolicy.targetMarketCoverage, 'required-in-domain-and-design');
  assert.deepEqual(plan.marketReferencePolicy.domainSearchInputs.map(input => input.query),
    ['복지로', '정부24 혜택알리미', '서울복지포털', '웰로']);
  for (const lead of ['복지로 맞춤형급여안내', '정부24 혜택알리미', '서울복지포털 맞춤검색', '웰로 맞춤형 정책 추천']) {
    assert.ok(plan.lanes.find(lane => lane.id === 'domain-reference')?.querySeeds.includes(lead));
  }
  assert.ok(plan.designSourcePolicy.nativeSearchInputs.some(candidate => candidate.query.startsWith('한국 ')));
  assert.equal(plan.marketReferencePolicy.styleInference, 'forbidden');
  assert.equal(inferredKoreanReferenceMarket('미국 복지 신청을 위한 한국어 서비스'), null);
  assert.equal(isMarketQualifiedQuery('미니멀 앱 UI', ['대한민국', '한국', 'South Korea']), false);
  assert.equal(isMarketQualifiedQuery('정부24 혜택알리미', ['대한민국', '한국', 'South Korea']), true);
});

test('a benefits-only Korean brief still requires four named local welfare searches', t => {
  const input = fixture('medical-new-product');
  input.request = '한국어로 혜택 탐색과 신청을 돕는 서비스를 만들어줘.';
  input.taskOutcome.goal = '혜택 탐색';
  const plan = buildReferenceDiscoveryPlan(project(t), routeAdaptiveFlow(input));
  assert.deepEqual(plan.marketReferencePolicy.domainSearchInputs.map(item => item.query),
    ['복지로', '정부24 혜택알리미', '서울복지포털', '웰로']);
});

test('URL-free showpiece requests receive automatic craft and motion lanes on a route that always carries domain', t => {
  const root = project(t);
  const input = fixture();
  input.request = '한국어 신시사이저 랜딩페이지를 만들어줘. 국내 멋진 수상작처럼 스크롤 애니메이션도 잘 되게 해줘.';
  const route = routeAdaptiveFlow(input);
  assert.equal(route.strategy.stages.includes('domain'), true, 'domain analysis is mandatory on every route');
  const plan = buildReferenceDiscoveryPlan(root, route);
  assert.equal(plan.userUrlsRequired, false);
  assert.equal(plan.request, input.request);
  assert.deepEqual(plan.lanes.map(lane => lane.id), ['domain-reference', 'design-reference', 'motion']);
  assert.deepEqual(plan.galleryDirectories, ['Siteinspire', 'Pinterest']);
  assert.equal(plan.designSourcePolicy.access, 'free-only-verify-at-inspection');
  assert.ok(plan.designSourcePolicy.searchQueries.some(query => query.startsWith('site:pinterest.com/pin/')));
  assert.equal(plan.motionEvidenceRequired, true);
  assert.deepEqual(plan.decisions, [], 'no section template is invented before Framer');
  assert.deepEqual(plan.locale, { surfaceLocale: null, explicitMarket: null, culturalDecision: null });
  assert.equal(plan.queryPolicy, 'derive-from-explicit-request-and-decisions-not-locale-stereotypes');
});

test('explicit Korean surface mechanics remain separate from market and source-country preferences', t => {
  const root = project(t);
  const locale = routeLocaleDesignContext({
    schema: 'locale-design-context-v1', conversationLanguage: 'ko', surfaceLocale: 'ko',
    marketRegion: null, marketAuthorityClaimId: null, audience: 'Developers', domain: 'Instrument launch', surface: 'marketing',
    desiredFit: 'locale-mechanics-only', brandInvariants: ['Supplied instrument facts'],
  });
  const plan = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(fixture(), undefined, locale));
  assert.equal(plan.locale.surfaceLocale, 'ko');
  assert.equal(plan.locale.explicitMarket, null);
  assert.equal(plan.locale.culturalDecision, 'mechanics-only');
  assert.equal(plan.lanes.some(lane => lane.id === 'design-reference'), true);
  assert.deepEqual(plan.marketReferencePolicy, {
    mode: 'unscoped', marketRegion: null, marketLabel: null, audience: null,
    marketSearchLabels: [],
    targetMarketCoverage: 'not-required', domainSearchInputs: [], fallback: 'ordinary-reference-discovery',
    styleInference: 'forbidden',
  });
  assert.doesNotMatch(JSON.stringify(plan), /Korean style|Korean users|Korean market/);
});

test('an explicit Korean market makes both reference lanes target-market-first without inferring a country style', t => {
  const root = project(t);
  const locale = routeLocaleDesignContext({
    schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ko-KR',
    marketRegion: 'KR', marketAuthorityClaimId: 'market-authority', audience: 'Korean residents comparing public benefits',
    domain: 'public benefit discovery', surface: 'marketing', desiredFit: 'market-grounded',
    brandInvariants: ['Eligibility facts remain source-bound'],
  });
  const input = fixture();
  input.evidenceClaims.claims.push({ id: 'market-authority', text: 'The product targets South Korea.', status: 'confirmed',
    userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'market-request', excerpt: 'Build this for users in South Korea.' }] });
  input.evidenceClaims.userFacts.push('market-authority');
  const plan = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(input, undefined, locale));
  assert.equal(plan.schema, 'reference-discovery-plan-v2');
  assert.deepEqual(plan.marketReferencePolicy, {
    mode: 'target-market-first', marketRegion: 'KR', marketLabel: 'South Korea', marketSearchLabels: ['대한민국', '한국', 'South Korea'],
    audience: 'Korean residents comparing public benefits', targetMarketCoverage: 'required-in-domain-and-design',
    domainSearchInputs: [
      { lane: 'domain', query: '복지로',
        url: 'https://search.daum.net/search?w=tot&q=%EB%B3%B5%EC%A7%80%EB%A1%9C', queryParam: 'q' },
      { lane: 'domain', query: '정부24 혜택알리미',
        url: 'https://search.daum.net/search?w=tot&q=%EC%A0%95%EB%B6%8024+%ED%98%9C%ED%83%9D%EC%95%8C%EB%A6%AC%EB%AF%B8', queryParam: 'q' },
      { lane: 'domain', query: '서울복지포털',
        url: 'https://search.daum.net/search?w=tot&q=%EC%84%9C%EC%9A%B8%EB%B3%B5%EC%A7%80%ED%8F%AC%ED%84%B8', queryParam: 'q' },
      { lane: 'domain', query: '웰로',
        url: 'https://search.daum.net/search?w=tot&q=%EC%9B%B0%EB%A1%9C', queryParam: 'q' },
    ],
    fallback: 'global-equivalent-only-after-documented-target-market-gap', styleInference: 'forbidden',
  });
  const firstDomainSearch = plan.marketReferencePolicy.domainSearchInputs[0];
  assert.ok(firstDomainSearch);
  assert.equal(parseSearchInput(firstDomainSearch).lane, 'domain');
  assert.ok(plan.lanes.find(lane => lane.id === 'domain-reference')?.querySeeds.includes('복지로'));
  assert.ok(plan.lanes.find(lane => lane.id === 'design-reference')?.querySeeds.some(query => query.startsWith('대한민국 ')));
  assert.ok(plan.designSourcePolicy.nativeSearchInputs.some(input => input.query.startsWith('대한민국 ')));
  assert.ok(plan.designSourcePolicy.nativeSearchInputs.some(input => input.query.startsWith('South Korea ')));
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
  assert.deepEqual(plan.lanes.map(lane => lane.id), ['domain-reference', 'design-reference']);
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
  assert.deepEqual(plan.lanes.find(lane => lane.id === 'domain-reference')?.querySeeds, [question]);
  const decision = plan.decisions[0];
  assert.ok(decision);
  assert.equal(decision.state, 'A labeled connection example changes after interaction.');
  assert.equal(decision.viewports.length, 2);
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
  assert.deepEqual(restrained.lanes.map(lane => lane.id), ['domain-reference', 'design-reference']);
  assert.equal(missingDiscoveryMotionEvidence(restrained, []), false);
  const operational = fixture('medical-new-product');
  operational.designAxes.expressiveDesignNeed = 'balanced';
  const balancedProduct = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(operational));
  // Gathering a visual direction is the DEFAULT. A real run that gathered only similar services
  // produced a product survey instead of a direction, so ordinary product work now opens this lane;
  // restrained work also needs evidence for its visual direction.
  assert.equal(balancedProduct.lanes.some(lane => lane.id === 'design-reference'), true, 'ordinary product work gathers a visual direction');
  const restrainedRoute = fixture('medical-new-product');
  restrainedRoute.designAxes.expressiveDesignNeed = 'restrained';
  const restrainedPlan = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(restrainedRoute));
  assert.equal(restrainedPlan.lanes.some(lane => lane.id === 'design-reference'), true, 'design reference is the second required lane');
  assert.deepEqual(restrainedPlan.galleryDirectories, ['Mobbin', 'Page Flows', 'Pinterest', 'Dribbble', 'Behance', 'UI Bowl']);
  assert.equal(restrainedPlan.designSourcePolicy.searchQueries.some(query => query.includes('site:siteinspire.com/')), false,
    'product UI discovery must not fall back to a marketing-gallery search');
  assert.ok(restrainedPlan.designSourcePolicy.searchQueries.some(query => query.includes('site:mobbin.com/explore/screens/')));
  assert.ok(restrainedPlan.designSourcePolicy.searchQueries.some(query => query.includes('site:pageflows.com/screens/')));
  assert.equal(restrainedPlan.designSourcePolicy.domainOutput, '.omd/refs/domain/research.json');
  assert.equal(restrainedPlan.designSourcePolicy.designOutput, '.omd/refs/design/research.json');
  assert.match(restrainedPlan.designSourcePolicy.fallback, /Do not purchase/);
  const skipped = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(fixture('copy-only')));
  assert.equal(skipped.decision, 'skip');
  assert.deepEqual(skipped.lanes, []);
  assert.deepEqual(skipped.galleryDirectories, []);
  assert.deepEqual(skipped.designSourcePolicy.candidates, []);
  assert.deepEqual(skipped.designSourcePolicy.searchQueries, []);
  assert.ok(skipped.skipReason);
});

test('stale domain queries cannot steer the current request', t => {
  const root = project(t);
  const input = fixture();
  const domain = {
    schema: 'domain-brief-v1', request: input.request, domain: 'Instrument', summary: 'Explain the supplied instrument.',
    surfaces: [{ name: 'Landing', purpose: 'Decide whether to adopt', evidence: [{ status: 'observed', reference: 'https://example-instrument.com' }] }],
    coreObjects: [{ name: 'Instrument', evidence: [{ status: 'user-provided', reference: 'user-message' }] }],
    audience: { description: 'Musicians', evidence: [{ status: 'user-provided', reference: 'user-message' }] },
    referenceQueries: { component: ['patch controls'], craft: ['expressive interaction case study'], mood: ['analog warmth, patched panel, low glow'] },
    planning: {
      businessGoal: {
        text: 'decide whether to adopt the instrument',
        userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'request', excerpt: 'as asked' }],
      },
      successSignal: {
        text: 'a visitor can decide without contacting support',
        userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'request', excerpt: 'as asked' }],
      },
      nonGoals: [],
    },
  };
  writeFileSync(join(root, '.omd/domain-brief.json'), JSON.stringify(domain));
  const plan = buildReferenceDiscoveryPlan(root, routeAdaptiveFlow(input));
  // The visual lane searches PART keywords — the felt-direction queries plus the component names —
  // because a designer finds a direction by searching the parts, not by naming the product.
  assert.deepEqual(plan.lanes.find(lane => lane.id === 'design-reference')?.querySeeds, [...domain.referenceQueries.mood, ...domain.referenceQueries.component]);
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
