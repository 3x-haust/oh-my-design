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
import { captureFinalUrlGuard } from '../core/ref/capture-intake.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { fallbackCoverage, fallbackGap, localSearchSource, marketContext as context,
  marketDomainBrief as domainBrief, marketOptions as options, directRootAt } from './helpers/market-reference.ts';

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
  const secondVisual = fixture.addSecondDesignDirection();
  publishReferenceResearch(fixture.root, fixture.research, options, fixture.writer);
  const published = Object.keys(referenceResearchArtifacts(parseReferenceResearch(fixture.research))).map(path => join(fixture.root, path));
  const before = published.map(path => readFileSync(path));
  writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify(context));
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief));
  const domainFour = fixture.capture('https://domain-four.example/task', 'domain', 'domain', 6);
  const domainFourSource = { id: 'domain-4', url: domainFour.source, observedAt: new Date().toISOString().slice(0, 10),
    decision: 'Task order', finding: 'Review before submission', evidence: domainFour.evidence, capture: domainFour.capture };
  const domainQueries = ['복지로', '정부24 혜택알리미', '서울복지포털', '웰로'];
  const designQueries = ['대한민국 복지 앱 UI 디자인', '한국 복지 앱 UI 디자인', 'South Korea 복지 앱 UI 디자인'];
  const input = { ...fixture.research, schema: REFERENCE_RESEARCH_SCHEMA, marketCoverage: null,
    domainReference: { ...fixture.research.domainReference, queries: domainQueries,
      searches: domainQueries.map(query => testSearchReceipt(fixture.root, 'domain', query,
        [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source])),
      sources: [...fixture.research.domainReference.sources, domainFourSource] },
    designReference: { ...fixture.research.designReference, queries: designQueries,
      searches: designQueries.map(query => testSearchReceipt(fixture.root, 'design', query,
        [fixture.gallery.source, secondVisual.gallery.source])) } };
  assert.throws(() => publishReferenceResearch(fixture.root, input, options, fixture.writer), /MARKET_COVERAGE_REQUIRED/);
  assert.deepEqual(published.map(path => readFileSync(path)), before);
  const globalOnly = { marketRegion: 'KR',
    domain: { localSources: [], globalFallback: fallbackCoverage(['domain-1', 'domain-2', 'domain-3', 'domain-4'],
      input.domainReference.searches[0]!.sha256, fallbackGap(domainQueries)) },
    design: { localSources: [
      localSearchSource('visual', fixture.source.evidence.sha256, 'product', input.designReference.searches[0]!.sha256),
      localSearchSource(secondVisual.sourceId, secondVisual.source.evidence.sha256, 'product', input.designReference.searches[0]!.sha256),
    ], globalFallback: null } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: globalOnly }), /MARKET_DOMAIN_LOCAL/);
  const documented = { marketRegion: 'KR',
    domain: { localSources: [fixture.domain, fixture.domainTwo, fixture.domainThree].map((source, index) =>
      localSearchSource(`domain-${index + 1}`, source.evidence.sha256, 'service', input.domainReference.searches[0]!.sha256)),
      globalFallback: fallbackCoverage(['domain-4'], input.domainReference.searches[0]!.sha256,
        fallbackGap(domainQueries)) },
    design: { localSources: [
      localSearchSource('visual', fixture.source.evidence.sha256, 'product', input.designReference.searches[0]!.sha256),
      localSearchSource(secondVisual.sourceId, secondVisual.source.evidence.sha256, 'product', input.designReference.searches[0]!.sha256),
    ], globalFallback: null } };
  const parsed = parseReferenceResearch({ ...input, marketCoverage: documented });
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parsed, options));
  const localCapturePath = join(fixture.root, fixture.domain.capture.path);
  const localCaptureBytes = readFileSync(localCapturePath);
  const englishOnly = JSON.parse(localCaptureBytes.toString('utf8')) as Record<string, unknown>;
  delete englishOnly.visibleKoreanText;
  const englishBytes = Buffer.from(JSON.stringify(englishOnly));
  writeFileSync(localCapturePath, englishBytes);
  try {
    const englishSource = { ...input.domainReference.sources[0]!,
      capture: { ...fixture.domain.capture, sha256: admissionHash(englishBytes) } };
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
      ...input, marketCoverage: documented,
      domainReference: { ...input.domainReference,
        sources: [englishSource, ...input.domainReference.sources.slice(1)] },
    }), options), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
  } finally { writeFileSync(localCapturePath, localCaptureBytes); }
  const firstLocal = documented.domain.localSources[0]; assert.ok(firstLocal);
  const oneLocal = { marketRegion: 'KR',
    domain: { localSources: [firstLocal],
      globalFallback: fallbackCoverage(['domain-2', 'domain-3', 'domain-4'], input.domainReference.searches[0]!.sha256,
        fallbackGap(domainQueries)) },
    design: documented.design };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch({ ...input, marketCoverage: oneLocal }), options), /MARKET_DOMAIN_LOCAL_DIVERSITY/);
  const noLoginReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source], false,
    new Date().toISOString(), 'South Korea benefits service — no login required');
  const noLoginCoverage = structuredClone(documented);
  noLoginCoverage.domain.localSources.forEach(source => { source.provenanceReceiptSha256 = noLoginReceipt.sha256; });
  noLoginCoverage.domain.globalFallback!.provenance.forEach(binding => {
    binding.provenanceReceiptSha256 = noLoginReceipt.sha256;
  });
  const noLoginInput = { ...input, marketCoverage: noLoginCoverage,
    domainReference: { ...input.domainReference,
      searches: [noLoginReceipt, ...input.domainReference.searches.slice(1)] } };
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(noLoginInput), options));
  const koreanReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source], false,
    new Date().toISOString(), '복지로 복지 서비스 신청 대상과 준비 서류 안내');
  const koreanCoverage = structuredClone(documented);
  koreanCoverage.domain.localSources.forEach(source => { source.provenanceReceiptSha256 = koreanReceipt.sha256; });
  koreanCoverage.domain.globalFallback!.provenance.forEach(binding => {
    binding.provenanceReceiptSha256 = koreanReceipt.sha256;
  });
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
    ...input, marketCoverage: koreanCoverage,
    domainReference: { ...input.domainReference,
      searches: [koreanReceipt, ...input.domainReference.searches.slice(1)] },
  }), options));
  for (const label of ['복지로', '정부24 혜택알리미', '서울복지포털']) {
    const receipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
      [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source],
      false, new Date().toISOString(), label);
    const local = structuredClone(documented);
    local.domain.localSources.forEach(source => { source.provenanceReceiptSha256 = receipt.sha256; });
    local.domain.globalFallback!.provenance.forEach(binding => { binding.provenanceReceiptSha256 = receipt.sha256; });
    assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
      ...input, marketCoverage: local,
      domainReference: { ...input.domainReference, searches: [receipt, ...input.domainReference.searches.slice(1)] },
    }), options), label);
  }
  const uk = fixture.capture('https://www.gov.uk/benefits', 'uk-benefits', 'domain', 7);
  const ukReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [uk.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source], false,
    new Date().toISOString(), '복지 서비스 신청 대상과 준비 서류 안내');
  const ukCoverage = structuredClone(documented);
  ukCoverage.domain.localSources.forEach(source => { source.provenanceReceiptSha256 = ukReceipt.sha256; });
  ukCoverage.domain.localSources[0]!.evidenceSha256 = uk.evidence.sha256;
  ukCoverage.domain.globalFallback!.provenance.forEach(binding => {
    binding.provenanceReceiptSha256 = ukReceipt.sha256;
  });
  assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
    ...input, marketCoverage: ukCoverage,
    domainReference: { ...input.domainReference,
      searches: [ukReceipt, ...input.domainReference.searches.slice(1)],
      sources: [{ ...input.domainReference.sources[0], url: uk.source,
        evidence: uk.evidence, capture: uk.capture }, ...input.domainReference.sources.slice(1)] },
  }), options), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
  const govKr = fixture.capture('https://www.gov.kr/portal/benefitAlimi', 'korean-benefits', 'domain', 8);
  const govKrReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [govKr.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source], false,
    new Date().toISOString(), '정부24 혜택알리미 복지 서비스 신청 안내');
  const govKrCoverage = structuredClone(documented);
  govKrCoverage.domain.localSources.forEach(source => { source.provenanceReceiptSha256 = govKrReceipt.sha256; });
  govKrCoverage.domain.localSources[0]!.evidenceSha256 = govKr.evidence.sha256;
  govKrCoverage.domain.globalFallback!.provenance.forEach(binding => {
    binding.provenanceReceiptSha256 = govKrReceipt.sha256;
  });
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
    ...input, marketCoverage: govKrCoverage,
    domainReference: { ...input.domainReference,
      searches: [govKrReceipt, ...input.domainReference.searches.slice(1)],
      sources: [{ ...input.domainReference.sources[0], url: govKr.source,
        evidence: govKr.evidence, capture: govKr.capture }, ...input.domainReference.sources.slice(1)] },
  }), options));
  const genericReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source], false, new Date().toISOString(), '바로가기');
  const genericCoverage = structuredClone(documented);
  genericCoverage.domain.localSources[0]!.provenanceReceiptSha256 = genericReceipt.sha256;
  genericCoverage.domain.localSources.slice(1).forEach(source => {
    source.provenanceReceiptSha256 = input.domainReference.searches[1]!.sha256;
  });
  genericCoverage.domain.globalFallback!.provenance.forEach(binding => {
    binding.provenanceReceiptSha256 = input.domainReference.searches[1]!.sha256;
  });
  const genericSearches = [genericReceipt, ...input.domainReference.searches.slice(1)];
  const genericInput = { ...input, marketCoverage: genericCoverage,
    domainReference: { ...input.domainReference, searches: genericSearches } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(genericInput), options), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
  const koreanCapturePath = join(fixture.root, fixture.domain.capture.path);
  const originalCapture = readFileSync(koreanCapturePath);
  try {
    const captured = JSON.parse(originalCapture.toString('utf8'));
    const koreanCapture = Buffer.from(JSON.stringify({ ...captured, visibleKoreanText: true }));
    writeFileSync(koreanCapturePath, koreanCapture);
    const observedInput = { ...genericInput,
      domainReference: { ...genericInput.domainReference,
        sources: [{ ...input.domainReference.sources[0],
          capture: { ...fixture.domain.capture, sha256: admissionHash(koreanCapture) } },
        ...input.domainReference.sources.slice(1)] } };
    assert.throws(() => validateReferenceResearch(fixture.root,
      parseReferenceResearch(observedInput), options), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
    const nativeEntry = directRootAt(fixture.root, 'domain', fixture.domain.source,
      [fixture.domainTwo.source], '복지 혜택 신청을 돕는 한국어 서비스 안내와 지원 정보입니다.');
    const signedCoverage = structuredClone(genericCoverage);
    signedCoverage.domain.globalFallback.gap.attemptedRoots = [nativeEntry.url];
    const signedInput = { ...observedInput, marketCoverage: signedCoverage,
      domainReference: { ...observedInput.domainReference, discoveryRoots: [nativeEntry] } };
    assert.doesNotThrow(() => validateReferenceResearch(fixture.root,
      parseReferenceResearch(signedInput), options));
    assert.doesNotThrow(() => publishReferenceResearch(fixture.root, signedInput, options, fixture.writer));
    const wrongUrlEntry = directRootAt(fixture.root, 'domain', fixture.domainTwo.source,
      [fixture.domain.source], '복지 혜택 신청을 돕는 한국어 서비스 안내와 지원 정보입니다.');
    const wrongUrlCoverage = structuredClone(signedCoverage);
    wrongUrlCoverage.domain.globalFallback.gap.attemptedRoots = [wrongUrlEntry.url];
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
      ...signedInput, marketCoverage: wrongUrlCoverage,
      domainReference: { ...signedInput.domainReference, discoveryRoots: [wrongUrlEntry] },
    }), options), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
    const foreignEntry = directRootAt(fixture.root, 'domain', fixture.domain.source,
      [fixture.domainTwo.source], '캐나다 주민을 위한 복지 혜택 신청 서비스입니다. 캐나다 지원 안내를 제공합니다.');
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
      ...signedInput, domainReference: { ...signedInput.domainReference, discoveryRoots: [foreignEntry] },
    }), options), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
    const staleEntry = directRootAt(fixture.root, 'domain', fixture.domain.source,
      [fixture.domainTwo.source], '복지 혜택 신청을 돕는 한국어 서비스 안내와 지원 정보입니다.',
      new Date(Date.now() - 8 * DAY_FOR_TEST).toISOString());
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
      ...signedInput, domainReference: { ...signedInput.domainReference, discoveryRoots: [staleEntry] },
    }), options), /MARKET_DOMAIN_ATTEMPT_STALE|native discovery capture is stale/);
  } finally { writeFileSync(koreanCapturePath, originalCapture); }
  for (const label of [
    'South Korea benefits service with unsupported browser notices',
    'Not only South Korea residents use this benefits service',
  ]) {
    const positiveReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
      [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source], false,
      new Date().toISOString(), label);
    const positiveCoverage = structuredClone(documented);
    positiveCoverage.domain.localSources.forEach(source => { source.provenanceReceiptSha256 = positiveReceipt.sha256; });
    positiveCoverage.domain.globalFallback!.provenance.forEach(binding => {
      binding.provenanceReceiptSha256 = positiveReceipt.sha256;
    });
    assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parseReferenceResearch({
      ...input, marketCoverage: positiveCoverage,
      domainReference: { ...input.domainReference,
        searches: [positiveReceipt, ...input.domainReference.searches.slice(1)] },
    }), options));
  }
  const laterNegationReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source], false,
    new Date().toISOString(), 'South Korea benefits service directory; this service is not available in South Korea');
  const laterNegationCoverage = structuredClone(documented);
  laterNegationCoverage.domain.localSources.forEach(source => { source.provenanceReceiptSha256 = laterNegationReceipt.sha256; });
  laterNegationCoverage.domain.globalFallback!.provenance.forEach(binding => {
    binding.provenanceReceiptSha256 = laterNegationReceipt.sha256;
  });
  const laterNegationInput = { ...input, marketCoverage: laterNegationCoverage,
    domainReference: { ...input.domainReference,
      searches: [laterNegationReceipt, ...input.domainReference.searches.slice(1)] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(laterNegationInput), options), /REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
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
      searches: [blockedReceipt, ...input.domainReference.searches.slice(1)] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(blockedInput), options), /MARKET_DOMAIN_LOCAL_PROVENANCE/);
  const unscopedReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source], false, new Date().toISOString(), 'Global directory for Canadian services');
  const unscopedCoverage = structuredClone(documented);
  unscopedCoverage.domain.localSources[0]!.provenanceReceiptSha256 = unscopedReceipt.sha256;
  const unscopedInput = { ...input, marketCoverage: unscopedCoverage,
    domainReference: { ...input.domainReference,
      searches: [unscopedReceipt, ...input.domainReference.searches.slice(1)] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(unscopedInput), options), /MARKET_DOMAIN_LOCAL_RESULT_SCOPE/);
  const crossScopeReceipt = testSearchReceipt(fixture.root, 'design', designQueries[0]!,
    [fixture.gallery.source], false, new Date().toISOString(), 'South Korea service market');
  const crossScopeCoverage = structuredClone(documented);
  crossScopeCoverage.design.localSources[0]!.provenanceReceiptSha256 = crossScopeReceipt.sha256;
  const crossScopeInput = { ...input, marketCoverage: crossScopeCoverage,
    designReference: { ...input.designReference,
      searches: [crossScopeReceipt, ...input.designReference.searches.slice(1)] } };
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
      searches: [staleSearchReceipt, ...input.domainReference.searches.slice(1)] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(staleSearchInput), options), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const futureObservedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const futureReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[0]!,
    [fixture.domain.source], false, futureObservedAt);
  const futureCoverage = structuredClone(documented);
  futureCoverage.domain.localSources[0]!.provenanceReceiptSha256 = futureReceipt.sha256;
  const futureInput = { ...input, marketCoverage: futureCoverage,
    domainReference: { ...input.domainReference,
      searches: [futureReceipt, ...input.domainReference.searches.slice(1)] } };
  assert.throws(() => validateReferenceResearch(fixture.root,
    parseReferenceResearch(futureInput), options), /MARKET_DOMAIN_ATTEMPT_STALE/);
  const staleFallbackReceipt = testSearchReceipt(fixture.root, 'domain', domainQueries[1]!,
    [fixture.domainThree.source], false, oldObservedAt);
  const staleFallbackInput = { ...input, marketCoverage: documented,
    domainReference: { ...input.domainReference,
      searches: [input.domainReference.searches[0]!, staleFallbackReceipt, ...input.domainReference.searches.slice(2)] } };
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
    fixture.root, 'domain', globalQuery, [fixture.domain.source]), new Date(Date.now() - 60_000).toISOString());
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
  const routeInput = inputSkeleton('product-route-input').skeleton as Record<string, unknown>;
  const request = '복지 혜택을 찾고 신청하는 서비스를 구현해줘.';
  routeInput.projectMode = 'existing';
  routeInput.request = request;
  const invocation = publishTestAdaptiveRoute(fixture.root, routeInput);
  const route = readPersistedRoute(fixture.root, invocation);
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify({ ...domainBrief, request }));
  const current = { ...input, sourceContractSha256: route.sourceContractSha256, marketCoverage: documented };
  publishReferenceResearch(fixture.root, current, {
    ...options, expectedSourceContractSha256: route.sourceContractSha256, expectedRequest: request,
  }, fixture.writer);
  const foreign = captureFinalUrlGuard(fixture.root, [{ source: 'https://www.usa.gov/benefits', lane: 'domain' }], invocation);
  assert.doesNotThrow(() => foreign(0, 'https://www.usa.gov/benefits', 'Find government benefits'),
    'fully validated published local research may permit a documented foreign fallback');
  writeFileSync(join(fixture.root, fixture.domain.evidence.path), 'tampered screenshot');
  assert.throws(() => foreign(0, 'https://www.usa.gov/benefits', 'Find government benefits'),
    /REFERENCE_MARKET_LOCAL_FIRST/, 'stale local source bytes revoke foreign capture admission');
});

test('frame-less new-marketing route accepts its exact Korean welfare design queries', t => {
  const fixture = designAdmissionFixture(t);
  const secondVisual = fixture.addSecondDesignDirection();
  writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify(context));
  const request = '한국 복지 서비스를 소개하는 랜딩 페이지를 구현해줘.';
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify({ ...domainBrief, request }));
  const routeInput = inputSkeleton('product-route-input').skeleton as Record<string, unknown>;
  routeInput.request = request;
  routeInput.referenceDiscovery = { ...routeInput.referenceDiscovery as Record<string, unknown>, taskNeed: 'new-marketing' };
  const invocation = publishTestAdaptiveRoute(fixture.root, routeInput);
  const route = readPersistedRoute(fixture.root, invocation);
  const domainQueries = ['복지로', '정부24 혜택알리미', '서울복지포털', '웰로'];
  const marketingQueries = ['대한민국 복지 웹사이트 디자인', '한국 복지 웹사이트 디자인', 'South Korea 복지 웹사이트 디자인'];
  const domainFour = fixture.capture('https://domain-four.example/task', 'domain', 'domain', 6);
  const domainFourSource = { id: 'domain-4', url: domainFour.source, observedAt: new Date().toISOString().slice(0, 10),
    decision: 'Task order', finding: 'Review before submission', evidence: domainFour.evidence, capture: domainFour.capture };
  const domainSearches = domainQueries.map(query => testSearchReceipt(fixture.root, 'domain', query,
    [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source, domainFour.source]));
  const designSearches = marketingQueries.map(query => testSearchReceipt(fixture.root, 'design', query,
    [fixture.gallery.source, secondVisual.gallery.source]));
  const research = parseReferenceResearch({ ...fixture.research, schema: REFERENCE_RESEARCH_SCHEMA,
    sourceContractSha256: route.sourceContractSha256,
    marketCoverage: { marketRegion: 'KR',
      domain: { localSources: [fixture.domain, fixture.domainTwo, fixture.domainThree].map((source, index) =>
        localSearchSource(`domain-${index + 1}`, source.evidence.sha256, 'service', domainSearches[0]!.sha256)),
        globalFallback: fallbackCoverage(['domain-4'], domainSearches[0]!.sha256, fallbackGap(domainQueries)) },
      design: { localSources: [
        localSearchSource('visual', fixture.source.evidence.sha256, 'product', designSearches[0]!.sha256),
        localSearchSource(secondVisual.sourceId, secondVisual.source.evidence.sha256, 'product', designSearches[0]!.sha256),
      ], globalFallback: null } },
    domainReference: { ...fixture.research.domainReference, queries: domainQueries, searches: domainSearches,
      sources: [...fixture.research.domainReference.sources, domainFourSource] },
    designReference: { ...fixture.research.designReference, queries: marketingQueries, searches: designSearches } });
  const routeOptions = { ...options, expectedRequest: request, expectedSourceContractSha256: route.sourceContractSha256 };
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root, research, routeOptions));
  const wrongQueries = parseReferenceResearch({ ...research,
    designReference: { ...research.designReference,
      queries: ['대한민국 복지 앱 UI 디자인', '한국 복지 앱 UI 디자인', 'South Korea 복지 앱 UI 디자인'] } });
  assert.throws(() => validateReferenceResearch(fixture.root, wrongQueries, routeOptions), /MARKET_DESIGN_SEARCH_REQUIRED/);
});
