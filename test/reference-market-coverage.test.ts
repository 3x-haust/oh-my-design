import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  parseReferenceResearch, publishReferenceResearch, referenceResearchArtifacts,
  validateReferenceResearch, REFERENCE_RESEARCH_SCHEMA,
} from '../core/ref/reference-research.ts';
import { validateMarketReferenceCoverage } from '../core/ref/market-reference-coverage.ts';
import { ADMISSION_SOURCE_SHA, admissionHash, designAdmissionFixture } from './helpers/design-admission.ts';
import { testPng, testSearchReceipt } from './helpers/search-execution.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';

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
  sourceId, evidenceSha256, scope, basis: 'market-search-result', provenanceReceiptSha256: searchReceiptSha256,
});
const localDirectSource = (sourceId: string, evidenceSha256: string, scope: 'service' | 'product', receiptSha256: string) => ({
  sourceId, evidenceSha256, scope, basis: 'market-direct-result', provenanceReceiptSha256: receiptSha256,
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
function directRootAt(root: string, lane: 'domain' | 'design', url: string, links: readonly string[]) {
  const image = testPng(1280, 900, lane === 'design' ? 1 : 0);
  const imageSha256 = admissionHash(image);
  const imagePath = `.omd/discovery/${lane}/entries/${imageSha256}.png`;
  mkdirSync(join(root, `.omd/discovery/${lane}/entries`), { recursive: true });
  writeFileSync(join(root, imagePath), image);
  const unsigned = { schema: 'reference-discovery-entry-v2', method: 'direct-public',
    entry: lane === 'domain' ? 'public-directory' : 'free-gallery', source: url, researchLane: lane,
    kind: 'page', capturedAt: '2026-09-21T00:00:00.000Z', imagePath,
    acquisition: { requestedUrl: url, finalUrl: url, httpStatus: 200, links, imageSha256 },
    limitations: 'native-public-get; stable-rendered-viewport-links; no-authentication; no-interaction-probes; not-provider-attested' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema,
    admissionHash(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const sha256 = admissionHash(bytes);
  const path = `.omd/discovery/${lane}/entries/${sha256}.json`;
  writeFileSync(join(root, path), bytes);
  return { ...rootEnvelope(lane), url,
    reason: `South Korea ${lane === 'domain' ? 'service directory' : 'design gallery'} list.`,
    evidence: { path: imagePath, sha256: imageSha256 }, capture: { path, sha256 } };
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
  const genericRoot = directRootAt(fixture.root, 'domain', 'https://directory.example/tasks',
    fixture.research.domainReference.sources.map(source => source.url));
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
