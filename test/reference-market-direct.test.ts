import assert from 'node:assert/strict';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseReferenceResearch, validateReferenceResearch, REFERENCE_RESEARCH_SCHEMA } from '../core/ref/reference-research.ts';
import { validateMarketReferenceCoverage } from '../core/ref/market-reference-coverage.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';
import { directRootAt, fallbackCoverage, fallbackGap, localDirectSource, localSearchSource,
  marketContext as context, marketDomainBrief as domainBrief, marketOptions as options,
  rootEnvelope } from './helpers/market-reference.ts';

test('market search and direct provenance refuse malformed scope, attempts, roots, and stale plans', t => {
  const fixture = designAdmissionFixture(t);
  const secondVisual = fixture.addSecondDesignDirection();
  const domainQueries = ['복지로', '정부24 혜택알리미', '서울복지포털', '웰로'];
  const oldObservedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify(context));
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief));
  const coverage = { marketRegion: 'KR',
    domain: { localSources: fixture.research.domainReference.sources.map(source => localSearchSource(
      source.id, source.evidence.sha256, 'service', 'e'.repeat(64))), globalFallback: null },
    design: { localSources: [
      localSearchSource('visual', fixture.source.evidence.sha256, 'product', 'e'.repeat(64)),
      localSearchSource(secondVisual.sourceId, secondVisual.source.evidence.sha256, 'product', 'e'.repeat(64)),
    ], globalFallback: null } };
  const input = { ...fixture.research, schema: REFERENCE_RESEARCH_SCHEMA, marketCoverage: coverage };
  assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(input), options), /MARKET_DOMAIN_SEARCH_REQUIRED/);
  const emptyGap = { ...coverage, domain: { localSources: coverage.domain.localSources.slice(0, 2),
    globalFallback: fallbackCoverage(['domain-3'], 'e'.repeat(64), fallbackGap([])) } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: emptyGap }), /FALLBACK_ATTEMPTS/);
  const missingFallbackProvenance = structuredClone(emptyGap);
  delete (missingFallbackProvenance.domain.globalFallback as { provenance?: unknown }).provenance;
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: missingFallbackProvenance }), /FALLBACK_KEYS/);
  const wrongScope = { ...coverage, domain: { ...coverage.domain,
    localSources: coverage.domain.localSources.map((source, index) => index === 0 ? { ...source, scope: 'gallery' } : source) } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: wrongScope }), /LOCAL_SCOPE/);
  const wrongEvidence = structuredClone(coverage); wrongEvidence.domain.localSources[0]!.evidenceSha256 = '0'.repeat(64);
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: wrongEvidence }), /LOCAL_EVIDENCE/);
  const badRoot = { ...input,
    domainReference: { ...input.domainReference, queries: [], searches: [], discoveryRoots: [{ ...rootEnvelope('domain'), reason: 'NOT serving KR; global directory only.' }] },
    designReference: { ...input.designReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('design')] } };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(badRoot), options.expectedRequest), /MARKET_DOMAIN_DIRECT_ROOT_REQUIRED/);
  const domainRoot = directRootAt(fixture.root, 'domain', 'https://directory.example/south-korea/tasks',
    fixture.research.domainReference.sources.map(source => source.url));
  const designItems = [
    'https://www.siteinspire.com/website/10267-south-korea-example',
    'https://www.siteinspire.com/website/10268-south-korea-workspace',
  ];
  const designRoot = directRootAt(fixture.root, 'design', 'https://www.siteinspire.com/websites/category/south-korea', designItems);
  const directCoverage = { marketRegion: 'KR',
    domain: { localSources: [fixture.domain, fixture.domainTwo, fixture.domainThree].map((source, index) =>
      localDirectSource(`domain-${index + 1}`, source.evidence.sha256, 'service', domainRoot.capture.sha256)),
      globalFallback: null },
    design: { localSources: [
      localDirectSource('visual', fixture.source.evidence.sha256, 'product', designRoot.capture.sha256),
      localDirectSource(secondVisual.sourceId, secondVisual.source.evidence.sha256, 'product', designRoot.capture.sha256),
    ], globalFallback: null } };
  const scoped = { ...badRoot, marketCoverage: directCoverage,
    domainReference: { ...badRoot.domainReference, discoveryRoots: [domainRoot] },
    designReference: { ...badRoot.designReference,
      sources: badRoot.designReference.sources.map((source, index) => ({ ...source,
        discovery: { ...source.discovery, url: designItems[index]! } })), discoveryRoots: [designRoot] } };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(scoped), options.expectedRequest));
  const selfRoot = directRootAt(fixture.root, 'domain', fixture.domain.source,
    [`${fixture.domain.source}/benefits`], '복지 혜택 서비스를 찾고 신청을 준비하는 한국 주민을 위한 안내입니다.');
  const selfCoverage = structuredClone(directCoverage);
  selfCoverage.domain.localSources[0]!.provenanceReceiptSha256 = selfRoot.capture.sha256;
  const selfScoped = { ...scoped, marketCoverage: selfCoverage,
    domainReference: { ...scoped.domainReference, discoveryRoots: [selfRoot, domainRoot] } };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(selfScoped), options.expectedRequest));
  const foreignSelfRoot = directRootAt(fixture.root, 'domain', fixture.domain.source,
    [`${fixture.domain.source}/benefits`], 'Global directory for Canadian residents and services.');
  const foreignSelfCoverage = structuredClone(selfCoverage);
  foreignSelfCoverage.domain.localSources[0]!.provenanceReceiptSha256 = foreignSelfRoot.capture.sha256;
  assert.throws(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch({
    ...selfScoped, marketCoverage: foreignSelfCoverage,
    domainReference: { ...selfScoped.domainReference, discoveryRoots: [foreignSelfRoot, domainRoot] },
  }), options.expectedRequest), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
  const globalSource = fixture.capture('https://global.example/benefits', 'global', 'domain', 7);
  const fallbackRoot = directRootAt(fixture.root, 'domain', globalSource.source,
    [`${globalSource.source}/eligibility`], 'Global benefits service for residents.');
  const selfFallbackCoverage = { ...directCoverage, domain: {
    localSources: directCoverage.domain.localSources,
    globalFallback: fallbackCoverage(['domain-4'], fallbackRoot.capture.sha256,
      fallbackGap([], [domainRoot.url, fallbackRoot.url])),
  } };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch({
    ...scoped, marketCoverage: selfFallbackCoverage,
    domainReference: { ...scoped.domainReference,
      sources: [...scoped.domainReference.sources, { ...scoped.domainReference.sources[0]!, id: 'domain-4',
        url: globalSource.source, evidence: globalSource.evidence, capture: globalSource.capture }],
      discoveryRoots: [domainRoot, fallbackRoot] },
  }), options.expectedRequest));
  const staleCoexistingSearch = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source], false, oldObservedAt);
  const currentCoexistingSearches = domainQueries.slice(1).map(query => testSearchReceipt(fixture.root, 'domain', query,
    [fixture.domainTwo.source, fixture.domainThree.source]));
  const directWithStaleSearch = { ...scoped, domainReference: { ...scoped.domainReference,
    queries: domainQueries, searches: [staleCoexistingSearch, ...currentCoexistingSearches] } };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(directWithStaleSearch), options.expectedRequest), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const mixedSearches = domainQueries.map(query => testSearchReceipt(fixture.root, 'domain', query,
    [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source]));
  const mixedCoverage = { ...directCoverage,
    domain: {
      localSources: [
        localDirectSource('domain-1', fixture.domain.evidence.sha256, 'service', domainRoot.capture.sha256),
        localSearchSource('domain-2', fixture.domainTwo.evidence.sha256, 'service', mixedSearches[0]!.sha256),
        localSearchSource('domain-3', fixture.domainThree.evidence.sha256, 'service', mixedSearches[0]!.sha256),
      ],
      globalFallback: null,
    } };
  const mixed = { ...scoped, marketCoverage: mixedCoverage,
    domainReference: { ...scoped.domainReference, queries: domainQueries,
      searches: mixedSearches, discoveryRoots: [domainRoot] } };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(mixed), options.expectedRequest));
  const unrelatedRoot = directRootAt(fixture.root, 'domain', 'https://directory.example/south-korea/unrelated',
    fixture.research.domainReference.sources.map(source => source.url), undefined, undefined,
    'Global directory for Canadian services');
  const unrelated = { ...scoped,
    domainReference: { ...scoped.domainReference, discoveryRoots: [unrelatedRoot] },
    marketCoverage: { ...directCoverage, domain: { ...directCoverage.domain,
      localSources: [fixture.domain, fixture.domainTwo, fixture.domainThree].map((source, index) =>
        localDirectSource(`domain-${index + 1}`, source.evidence.sha256, 'service', unrelatedRoot.capture.sha256)),
      globalFallback: null } } };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(unrelated), options.expectedRequest), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
  const staleAttemptRoot = directRootAt(fixture.root, 'domain', 'https://directory.example/south-korea/old-gap',
    [fixture.domainThree.source], undefined, oldObservedAt);
  const staleFallback = { ...scoped,
    domainReference: { ...scoped.domainReference, discoveryRoots: [domainRoot, staleAttemptRoot] },
    marketCoverage: directCoverage };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(staleFallback), options.expectedRequest), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const genericRoot = directRootAt(fixture.root, 'domain', 'https://attacker.kr/tasks?note=South%20Korea',
    fixture.research.domainReference.sources.map(source => source.url), 'Global directory for Canadian services.');
  const linkScoped = { ...scoped,
    domainReference: { ...scoped.domainReference, discoveryRoots: [{ ...genericRoot, reason: 'South Korea public benefits directory.' }] },
    marketCoverage: { ...directCoverage, domain: { ...directCoverage.domain,
      localSources: [fixture.domain, fixture.domainTwo, fixture.domainThree].map((source, index) =>
        localDirectSource(`domain-${index + 1}`, source.evidence.sha256, 'service', genericRoot.capture.sha256)),
      globalFallback: null } } };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(linkScoped), options.expectedRequest));
  const forgedDirect = structuredClone(scoped);
  forgedDirect.marketCoverage.domain.localSources[0]!.provenanceReceiptSha256 = 'f'.repeat(64);
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(forgedDirect), options.expectedRequest), /MARKET_DOMAIN_LOCAL_PROVENANCE/);
  const staleRoot = directRootAt(fixture.root, 'domain', 'https://directory.example/south-korea/stale',
    fixture.research.domainReference.sources.map(source => source.url), undefined, oldObservedAt);
  const stale = { ...scoped,
    domainReference: { ...scoped.domainReference,
      sources: scoped.domainReference.sources.map((source, index) => index === 0
        ? { ...source, observedAt: oldObservedAt.slice(0, 10) } : source),
      discoveryRoots: [staleRoot] },
    marketCoverage: { ...directCoverage, domain: { ...directCoverage.domain,
      localSources: [fixture.domain, fixture.domainTwo, fixture.domainThree].map((source, index) =>
        localDirectSource(`domain-${index + 1}`, source.evidence.sha256, 'service', staleRoot.capture.sha256)),
      globalFallback: null } } };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(stale), options.expectedRequest), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const excluded = { ...scoped, domainReference: { ...scoped.domainReference,
    discoveryRoots: [{ ...domainRoot, reason: 'South Korea was excluded; this service serves Canadian users.' }] } };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(excluded), options.expectedRequest), /DIRECT_ROOT_REQUIRED/);
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify({ ...domainBrief, request: 'Another task' }));
  assert.throws(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(scoped), options.expectedRequest), /PLAN_STALE/);
  unlinkSync(join(fixture.root, '.omd/domain-brief.json'));
  assert.throws(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(scoped), options.expectedRequest), /PLAN_REQUIRED/);
});
