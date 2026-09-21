import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  parseReferenceResearch, publishReferenceResearch, referenceResearchArtifacts,
  validateReferenceResearch, REFERENCE_RESEARCH_SCHEMA,
} from '../core/ref/reference-research.ts';
import { validateMarketReferenceCoverage } from '../core/ref/market-reference-coverage.ts';
import { ADMISSION_SOURCE_SHA, admissionHash, designAdmissionFixture } from './helpers/design-admission.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';

const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false,
  expectedRequest: 'Study Korean public benefits' };
const domainBrief = {
  schema: 'domain-brief-v1', request: options.expectedRequest, domain: 'public benefits', summary: 'Compare public benefits',
  surfaces: [{ name: 'home', purpose: 'Find a benefit', evidence: [{ status: 'user-provided', reference: 'test' }] }],
  coreObjects: [{ name: 'benefit', evidence: [{ status: 'user-provided', reference: 'test' }] }],
  audience: { description: 'Korean residents', evidence: [{ status: 'user-provided', reference: 'test' }] },
  referenceQueries: { component: ['benefit card'], craft: ['eligibility feedback'], mood: ['visual task'] },
  planning: { businessGoal: { text: 'Find benefits' }, successSignal: { text: 'Open a relevant benefit' },
    nonGoals: [{ text: 'Do not submit official applications' }] },
};
const context = { schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ko-KR',
  marketRegion: 'KR', audience: '한국에서 공공 혜택을 비교하는 주민', domain: 'public benefits',
  surface: 'product', desiredFit: 'market-grounded', brandInvariants: ['Facts remain source-bound'] };
const localSearchSource = (sourceId: string, evidenceSha256: string, scope: 'service' | 'product', searchReceiptSha256: string) => ({
  sourceId, evidenceSha256, scope, basis: 'market-search-result', searchReceiptSha256,
});
const localDomainSource = (sourceId: string, evidenceSha256: string, scope: 'service' | 'product') => ({
  sourceId, evidenceSha256, scope, basis: 'market-domain', searchReceiptSha256: null,
});
const fallbackGap = (attemptedQueries: readonly string[], attemptedRoots: readonly string[] = []) => ({
  marketRegion: 'KR', kind: 'coverage', attemptedQueries, attemptedRoots,
});
function rootEnvelope(lane: 'domain' | 'design') {
  const digest = (lane === 'domain' ? 'c' : 'd').repeat(64);
  return { method: 'direct-public', entry: lane === 'domain' ? 'public-directory' : 'free-gallery',
    url: lane === 'domain' ? 'https://directory.example/tasks' : 'https://www.siteinspire.com/',
    reason: 'The public list exposes comparable task entries.',
    evidence: { path: `.omd/discovery/${lane}/entries/${digest}.png`, sha256: digest },
    capture: { path: `.omd/discovery/${lane}/entries/${digest}.json`, sha256: digest } };
}
function searchReceiptAt(root: string, lane: 'domain' | 'design', receipt: { path: string }, observedAt: string) {
  const record = JSON.parse(readFileSync(join(root, receipt.path), 'utf8'));
  record.observedAt = observedAt;
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
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
  forgedLocal.design.localSources[0]!.searchReceiptSha256 = 'f'.repeat(64);
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch({ ...input, marketCoverage: forgedLocal }), options), /MARKET_DESIGN_LOCAL_PROVENANCE/);
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
  const domainRoot = { ...rootEnvelope('domain'), reason: '대한민국 public benefits directory.' };
  const designRoot = { ...rootEnvelope('design'), reason: '대한민국 public benefits gallery list.' };
  const directCoverage = { marketRegion: 'KR',
    domain: { localSources: [localDomainSource('domain-1', fixture.domain.evidence.sha256, 'service')],
      globalFallback: { sourceIds: ['domain-2', 'domain-3'], gap: fallbackGap([], [domainRoot.url]) } },
    design: { localSources: [localDomainSource('visual', fixture.source.evidence.sha256, 'product')], globalFallback: null } };
  const scoped = { ...badRoot, marketCoverage: directCoverage,
    domainReference: { ...badRoot.domainReference,
      sources: badRoot.domainReference.sources.map((source, index) => index === 0 ? { ...source, url: 'https://benefits.go.kr/task' } : source), discoveryRoots: [domainRoot] },
    designReference: { ...badRoot.designReference,
      sources: badRoot.designReference.sources.map(source => ({ ...source, url: 'https://design.kr/reference' })), discoveryRoots: [designRoot] } };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(scoped), options.expectedRequest));
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
