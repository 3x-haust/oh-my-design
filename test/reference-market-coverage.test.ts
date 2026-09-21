import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  parseReferenceResearch, publishReferenceResearch, referenceResearchArtifacts,
  validateReferenceResearch, REFERENCE_RESEARCH_SCHEMA,
} from '../core/ref/reference-research.ts';
import { validateMarketReferenceCoverage } from '../core/ref/market-reference-coverage.ts';
import { admissionHash, designAdmissionFixture } from './helpers/design-admission.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { directRootAt, fallbackGap, localDirectSource, localSearchSource, marketContext as context,
  marketDomainBrief as domainBrief, marketOptions as options, rootEnvelope } from './helpers/market-reference.ts';

function searchReceiptAt(root: string, lane: 'domain' | 'design', receipt: { path: string }, observedAt: string) {
  const record = JSON.parse(readFileSync(join(root, receipt.path), 'utf8'));
  const { signature: _signature, ...unsignedRecord } = record;
  const unsigned = { ...unsignedRecord, observedAt };
  const updated = { ...unsigned, signature: signNativeObservation(root, unsigned.schema,
    admissionHash(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(updated, null, 2)}\n`;
  const sha256 = admissionHash(bytes);
  const path = `.omd/refs/${lane}/search-${sha256}.json`;
  writeFileSync(join(root, path), bytes);
  return { path, sha256 };
}

test('explicit-market v7 binds local sources and fallback to executed market evidence', t => {
  const fixture = designAdmissionFixture(t);
  publishReferenceResearch(fixture.root, fixture.research, options, fixture.writer);
  const published = Object.keys(referenceResearchArtifacts(parseReferenceResearch(fixture.research))).map(path => join(fixture.root, path));
  const before = published.map(path => readFileSync(path));
  writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify(context));
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief));
  const domainQueries = ['대한민국 public benefits', 'South Korea public benefits service'];
  const designQueries = ['대한민국 public benefits visual task', 'South Korea public benefits visual task'];
  const input = { ...fixture.research, schema: REFERENCE_RESEARCH_SCHEMA, marketCoverage: null,
    domainReference: { ...fixture.research.domainReference, queries: domainQueries,
      searches: domainQueries.map(query => testSearchReceipt(fixture.root, 'domain', query,
        [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source])) },
    designReference: { ...fixture.research.designReference, queries: designQueries,
      searches: designQueries.map(query => testSearchReceipt(fixture.root, 'design', query, [fixture.gallery.source])) } };
  assert.throws(() => publishReferenceResearch(fixture.root, input, options, fixture.writer), /MARKET_COVERAGE_REQUIRED/);
  assert.deepEqual(published.map(path => readFileSync(path)), before);
  const globalOnly = { marketRegion: 'KR',
    domain: { localSources: [], globalFallback: { sourceIds: ['domain-1', 'domain-2', 'domain-3'], gap: fallbackGap(domainQueries) } },
    design: { localSources: [localSearchSource('visual', fixture.source.evidence.sha256, 'product', input.designReference.searches[0]!.sha256)], globalFallback: null } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: globalOnly }), /MARKET_DOMAIN_LOCAL/);
  const documented = { marketRegion: 'KR',
    domain: { localSources: [localSearchSource('domain-1', fixture.domain.evidence.sha256, 'service', input.domainReference.searches[0]!.sha256)],
      globalFallback: { sourceIds: ['domain-2', 'domain-3'], gap: fallbackGap(domainQueries) } },
    design: { localSources: [localSearchSource('visual', fixture.source.evidence.sha256, 'product', input.designReference.searches[0]!.sha256)], globalFallback: null } };
  const parsed = parseReferenceResearch({ ...input, marketCoverage: documented });
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parsed, options));
  const forgedLocal = structuredClone(documented);
  forgedLocal.design.localSources[0]!.provenanceReceiptSha256 = 'f'.repeat(64);
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch({ ...input, marketCoverage: forgedLocal }), options), /MARKET_DESIGN_LOCAL_PROVENANCE/);
  const blockedReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source], true);
  const blockedCoverage = structuredClone(documented);
  blockedCoverage.domain.localSources[0]!.provenanceReceiptSha256 = blockedReceipt.sha256;
  const blockedInput = { ...input, marketCoverage: blockedCoverage,
    domainReference: { ...input.domainReference,
      searches: [blockedReceipt, input.domainReference.searches[1]!] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(blockedInput), options), /MARKET_DOMAIN_LOCAL_PROVENANCE/);
  const unscopedReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source], false, new Date().toISOString(), 'Global directory for Canadian services');
  const unscopedCoverage = structuredClone(documented);
  unscopedCoverage.domain.localSources[0]!.provenanceReceiptSha256 = unscopedReceipt.sha256;
  const unscopedInput = { ...input, marketCoverage: unscopedCoverage,
    domainReference: { ...input.domainReference,
      searches: [unscopedReceipt, input.domainReference.searches[1]!] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(unscopedInput), options), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
  const oldObservedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const staleSearchReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source], false, oldObservedAt);
  const staleSearchCoverage = structuredClone(documented);
  staleSearchCoverage.domain.localSources[0]!.provenanceReceiptSha256 = staleSearchReceipt.sha256;
  const staleSearchInput = { ...input, marketCoverage: staleSearchCoverage,
    domainReference: { ...input.domainReference,
      sources: input.domainReference.sources.map((source, index) => index === 0
        ? { ...source, observedAt: oldObservedAt.slice(0, 10) } : source),
      searches: [staleSearchReceipt, input.domainReference.searches[1]!] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(staleSearchInput), options), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const futureObservedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const futureReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source], false, futureObservedAt);
  const futureCoverage = structuredClone(documented);
  futureCoverage.domain.localSources[0]!.provenanceReceiptSha256 = futureReceipt.sha256;
  const futureInput = { ...input, marketCoverage: futureCoverage,
    domainReference: { ...input.domainReference,
      searches: [futureReceipt, input.domainReference.searches[1]!] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(futureInput), options), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const staleFallbackReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[1]!,
    [fixture.domainThree.source], false, oldObservedAt);
  const staleFallbackInput = { ...input, marketCoverage: documented,
    domainReference: { ...input.domainReference,
      searches: [input.domainReference.searches[0]!, staleFallbackReceipt] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(staleFallbackInput), options), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const wrongGap = structuredClone(documented);
  wrongGap.domain.globalFallback!.gap.marketRegion = 'CA';
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch({ ...input, marketCoverage: wrongGap }), options), /MARKET_DOMAIN_FALLBACK_MARKET/);
  const globalQuery = 'global public benefits examples';
  const globalReceipt = searchReceiptAt(fixture.root, 'domain', testSearchReceipt(
    fixture.root, 'domain', globalQuery, [fixture.domain.source]), '2026-09-20T00:00:00.000Z');
  const wrongOrder = { ...input, marketCoverage: documented, domainReference: { ...input.domainReference,
    queries: [...domainQueries, globalQuery], searches: [...input.domainReference.searches, globalReceipt] } };
  assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(wrongOrder), options), /SEARCH_ORDER/);
});

test('market search and direct provenance refuse malformed scope, attempts, roots, and stale plans', t => {
  const fixture = designAdmissionFixture(t);
  const domainQueries = ['대한민국 public benefits', 'South Korea public benefits service'];
  const oldObservedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify(context));
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief));
  const coverage = { marketRegion: 'KR',
    domain: { localSources: fixture.research.domainReference.sources.map(source => localSearchSource(
      source.id, source.evidence.sha256, 'service', 'e'.repeat(64))), globalFallback: null },
    design: { localSources: [localSearchSource('visual', fixture.source.evidence.sha256, 'product', 'e'.repeat(64))], globalFallback: null } };
  const input = { ...fixture.research, schema: REFERENCE_RESEARCH_SCHEMA, marketCoverage: coverage };
  assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(input), options), /MARKET_DOMAIN_SEARCH_REQUIRED/);
  const emptyGap = { ...coverage, domain: { localSources: coverage.domain.localSources.slice(0, 2),
    globalFallback: { sourceIds: ['domain-3'], gap: fallbackGap([]) } } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: emptyGap }), /FALLBACK_ATTEMPTS/);
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
  const designItem = 'https://www.siteinspire.com/websites/10267-south-korea-example';
  const designRoot = directRootAt(fixture.root, 'design', 'https://www.siteinspire.com/websites/category/south-korea', [designItem]);
  const directCoverage = { marketRegion: 'KR',
    domain: { localSources: [localDirectSource('domain-1', fixture.domain.evidence.sha256, 'service', domainRoot.capture.sha256)],
      globalFallback: { sourceIds: ['domain-2', 'domain-3'], gap: fallbackGap([], [domainRoot.url]) } },
    design: { localSources: [localDirectSource('visual', fixture.source.evidence.sha256, 'product', designRoot.capture.sha256)], globalFallback: null } };
  const scoped = { ...badRoot, marketCoverage: directCoverage,
    domainReference: { ...badRoot.domainReference, discoveryRoots: [domainRoot] },
    designReference: { ...badRoot.designReference,
      sources: badRoot.designReference.sources.map(source => ({ ...source,
        discovery: { ...source.discovery, url: designItem } })), discoveryRoots: [designRoot] } };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(scoped), options.expectedRequest));
  const mixedSearches = domainQueries.map(query => testSearchReceipt(fixture.root, 'domain', query,
    [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source]));
  const mixedCoverage = { ...directCoverage,
    domain: {
      localSources: [
        localDirectSource('domain-1', fixture.domain.evidence.sha256, 'service', domainRoot.capture.sha256),
        localSearchSource('domain-2', fixture.domainTwo.evidence.sha256, 'service', mixedSearches[0]!.sha256),
      ],
      globalFallback: { sourceIds: ['domain-3'], gap: fallbackGap(domainQueries, [domainRoot.url]) },
    } };
  const mixed = { ...scoped, marketCoverage: mixedCoverage,
    domainReference: { ...scoped.domainReference, queries: domainQueries,
      searches: mixedSearches, discoveryRoots: [domainRoot] } };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(mixed), options.expectedRequest));
  const incompleteMixed = structuredClone(mixed);
  incompleteMixed.marketCoverage.domain.globalFallback!.gap.attemptedQueries = [];
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(incompleteMixed), options.expectedRequest), /MARKET_DOMAIN_FALLBACK_ATTEMPTS/);
  const unrelatedRoot = directRootAt(fixture.root, 'domain', 'https://directory.example/south-korea/unrelated',
    fixture.research.domainReference.sources.map(source => source.url), undefined, undefined,
    'Global directory for Canadian services');
  const unrelated = { ...scoped,
    domainReference: { ...scoped.domainReference, discoveryRoots: [unrelatedRoot] },
    marketCoverage: { ...directCoverage, domain: { ...directCoverage.domain,
      localSources: [localDirectSource('domain-1', fixture.domain.evidence.sha256, 'service', unrelatedRoot.capture.sha256)],
      globalFallback: { sourceIds: ['domain-2', 'domain-3'], gap: fallbackGap([], [unrelatedRoot.url]) } } } };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(unrelated), options.expectedRequest), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
  const staleAttemptRoot = directRootAt(fixture.root, 'domain', 'https://directory.example/south-korea/old-gap',
    [fixture.domainThree.source], undefined, oldObservedAt);
  const staleFallback = { ...scoped,
    domainReference: { ...scoped.domainReference, discoveryRoots: [domainRoot, staleAttemptRoot] },
    marketCoverage: { ...directCoverage, domain: { ...directCoverage.domain,
      globalFallback: { sourceIds: ['domain-2', 'domain-3'],
        gap: fallbackGap([], [domainRoot.url, staleAttemptRoot.url]) } } } };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(staleFallback), options.expectedRequest), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const genericRoot = directRootAt(fixture.root, 'domain', 'https://attacker.kr/tasks?note=South%20Korea',
    fixture.research.domainReference.sources.map(source => source.url), 'Global directory for Canadian services.');
  const selfAttested = { ...scoped,
    domainReference: { ...scoped.domainReference, discoveryRoots: [{ ...genericRoot, reason: 'South Korea public benefits directory.' }] },
    marketCoverage: { ...directCoverage, domain: { ...directCoverage.domain,
      localSources: [localDirectSource('domain-1', fixture.domain.evidence.sha256, 'service', genericRoot.capture.sha256)],
      globalFallback: { sourceIds: ['domain-2', 'domain-3'], gap: fallbackGap([], [genericRoot.url]) } } } };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root,
    parseReferenceResearch(selfAttested), options.expectedRequest), /MARKET_DOMAIN_DIRECT_PROVENANCE/);
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
      localSources: [localDirectSource('domain-1', fixture.domain.evidence.sha256, 'service', staleRoot.capture.sha256)],
      globalFallback: { sourceIds: ['domain-2', 'domain-3'], gap: fallbackGap([], [staleRoot.url]) } } } };
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

test('every explicit market requires current local coverage regardless of fit mode or audience', t => {
  const fixture = designAdmissionFixture(t);
  for (const overrides of [{ desiredFit: 'locale-mechanics-only', audience: null }, { desiredFit: 'market-grounded', audience: null }]) {
    writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify({ ...context, ...overrides }));
    assert.throws(() => validateReferenceResearch(fixture.root,
      parseReferenceResearch(fixture.research), options), /MARKET_COVERAGE_REQUIRED/);
  }
});
