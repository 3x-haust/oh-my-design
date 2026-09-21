import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  parseReferenceResearch, publishReferenceResearch, referenceResearchArtifacts,
  validateReferenceResearch, REFERENCE_RESEARCH_SCHEMA,
} from '../core/ref/reference-research.ts';
import { admissionHash, designAdmissionFixture } from './helpers/design-admission.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { fallbackCoverage, fallbackGap, localSearchSource, marketContext as context,
  marketDomainBrief as domainBrief, marketOptions as options } from './helpers/market-reference.ts';

const DAY_FOR_TEST = 24 * 60 * 60 * 1000;

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
    domain: { localSources: [], globalFallback: fallbackCoverage(['domain-1', 'domain-2', 'domain-3'],
      input.domainReference.searches[0]!.sha256, fallbackGap(domainQueries)) },
    design: { localSources: [localSearchSource('visual', fixture.source.evidence.sha256, 'product', input.designReference.searches[0]!.sha256)], globalFallback: null } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: globalOnly }), /MARKET_DOMAIN_LOCAL/);
  const documented = { marketRegion: 'KR',
    domain: { localSources: [localSearchSource('domain-1', fixture.domain.evidence.sha256, 'service', input.domainReference.searches[0]!.sha256)],
      globalFallback: fallbackCoverage(['domain-2', 'domain-3'], input.domainReference.searches[0]!.sha256,
        fallbackGap(domainQueries)) },
    design: { localSources: [localSearchSource('visual', fixture.source.evidence.sha256, 'product', input.designReference.searches[0]!.sha256)], globalFallback: null } };
  const parsed = parseReferenceResearch({ ...input, marketCoverage: documented });
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parsed, options));
  const nextLocalDate = new Date(Date.now() + DAY_FOR_TEST).toISOString().slice(0, 10);
  const timezoneAhead = structuredClone({ ...input, marketCoverage: documented });
  timezoneAhead.domainReference.sources[0]!.observedAt = nextLocalDate;
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(timezoneAhead), options));
  const forgedFallback = structuredClone(documented);
  forgedFallback.domain.globalFallback!.provenance[0]!.provenanceReceiptSha256 = 'f'.repeat(64);
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch({ ...input, marketCoverage: forgedFallback }), options), /MARKET_DOMAIN_FALLBACK_PROVENANCE/);
  const capturePath = join(fixture.root, fixture.domainTwo.capture.path);
  const currentCapture = readFileSync(capturePath);
  const staleCapture = JSON.parse(currentCapture.toString('utf8'));
  staleCapture.capturedAt = '2020-01-01T00:00:00.000Z';
  const staleCaptureBytes = Buffer.from(JSON.stringify(staleCapture));
  writeFileSync(capturePath, staleCaptureBytes);
  try {
    const staleCaptureInput = structuredClone({ ...input, marketCoverage: documented });
    staleCaptureInput.domainReference.sources[1]!.capture.sha256 = admissionHash(staleCaptureBytes);
    assert.throws(() => validateReferenceResearch(fixture.root,
      parseReferenceResearch(staleCaptureInput), options), /MARKET_DOMAIN_CAPTURE_STALE/);
  } finally { writeFileSync(capturePath, currentCapture); }
  const extraQuery = '대한민국 public benefits mobile service';
  const extraReceipt = testSearchReceipt(fixture.root, 'domain', extraQuery, [fixture.domainThree.source]);
  const extraCoverage = structuredClone(documented);
  extraCoverage.domain.globalFallback!.gap.attemptedQueries = [...domainQueries, extraQuery];
  const extraInput = { ...input, marketCoverage: extraCoverage,
    domainReference: { ...input.domainReference, queries: [...domainQueries, extraQuery],
      searches: [...input.domainReference.searches, extraReceipt] } };
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(extraInput), options));
  const repeatedReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domainTwo.source, fixture.domainThree.source]);
  const repeatedCoverage = structuredClone(documented);
  repeatedCoverage.domain.globalFallback!.gap.attemptedQueries = [...domainQueries, domainQueries[0]!];
  const repeatedInput = { ...input, marketCoverage: repeatedCoverage,
    domainReference: { ...input.domainReference,
      searches: [...input.domainReference.searches, repeatedReceipt] } };
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(repeatedInput), options));
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
  const crossScopeReceipt = testSearchReceipt(fixture.root, 'design', designQueries[0]!,
    [fixture.gallery.source], false, new Date().toISOString(), 'South Korea service market');
  const crossScopeCoverage = structuredClone(documented);
  crossScopeCoverage.design.localSources[0]!.provenanceReceiptSha256 = crossScopeReceipt.sha256;
  const crossScopeInput = { ...input, marketCoverage: crossScopeCoverage,
    designReference: { ...input.designReference,
      searches: [crossScopeReceipt, input.designReference.searches[1]!] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(crossScopeInput), options), /MARKET_DESIGN_LOCAL_RESULT_SCOPE/);
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
  const staleExtraReceipt = testSearchReceipt(fixture.root, 'domain', extraQuery,
    [fixture.domainThree.source], false, oldObservedAt);
  const staleExtraInput = { ...input, marketCoverage: extraCoverage,
    domainReference: { ...input.domainReference, queries: [...domainQueries, extraQuery],
      searches: [...input.domainReference.searches, staleExtraReceipt] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(staleExtraInput), options), /MARKET_DOMAIN_ATTEMPT_STALE/);
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
  const futureGlobal = testSearchReceipt(fixture.root, 'domain', globalQuery,
    [fixture.domainThree.source], false, new Date(Date.now() + 10 * 60 * 1000).toISOString());
  const futureGlobalInput = { ...input, marketCoverage: documented,
    domainReference: { ...input.domainReference, queries: [...domainQueries, globalQuery],
      searches: [...input.domainReference.searches, futureGlobal] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(futureGlobalInput), options), /MARKET_DOMAIN_ATTEMPT_STALE/);
});
