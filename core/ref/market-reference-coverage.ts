import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLocaleDesignContext } from '../locale/design-context.ts';
import { validateDomainBrief } from '../domain/domain-brief.ts';
import { readFrame } from '../frame/index.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ReferenceResearch, ResearchSource } from './reference-research-types.ts';
import { inferredKoreanReferenceMarket, isKoreanLanguageServiceText, isMarketQualifiedQuery, marketDesignQueries, marketDomainQueries, marketSearchLabels } from './market-reference.ts';
import { readCurrentDirectDiscoveryEntry } from './discovery-record.ts';
import { negatesMarketScope } from './market-scope-negation.ts';
import { readSearchExecution, SEARCH_EXECUTION_SCHEMA } from './search-execution.ts';
import { actionableSearchTargets, resultReaches, type ObservedSearchResult } from './search-result.ts';
import { referenceServiceFamily, referenceServiceHost } from './design-discovery-sources.ts';
import {
  marketObject, marketReject, marketText, marketTexts,
  type MarketLaneCoverage,
} from './market-reference-coverage-contract.ts';

export { parseMarketReferenceCoverage } from './market-reference-coverage-contract.ts';
export type { MarketLaneCoverage, MarketReferenceCoverage } from './market-reference-coverage-contract.ts';

const INVISIBLE = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
const DIRECT_SCOPE = /\b(?:serves?|serving|available|operat(?:e|es|ed|ing)|based|local(?:ized)?|market|residents?|users?|audience|directory|gallery|service|product|interface)\b|대상|제공|운영|거주|사용자|시장|서비스|디렉터리|갤러리|제품|인터페이스|앱|웹사이트|복지|혜택|신청|포털|안내/iu;
const SCOPE_TERMS = {
  service: /\b(?:services?|benefits?|support|welfare|applications?|platform)\b|서비스|혜택|지원|복지|신청|플랫폼/iu,
  product: /\b(?:products?|apps?|applications?|interfaces?|websites?|sites?|ui)\b|제품|프로덕트|앱|애플리케이션|인터페이스|웹사이트|사이트|UI/iu,
  gallery: /\b(?:gallery|design|reference|showcase|inspiration)\b|갤러리|디자인|레퍼런스|쇼케이스/iu,
  audience: /\b(?:residents?|users?|audience|citizens?|customers?|people)\b|거주|주민|사용자|대상|시민|고객|이용자/iu,
} as const;
const MAX_PROVENANCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GENERIC_LINK_LABEL = /^(?:바로가기|사이트\s*바로가기|홈페이지\s*바로가기|방문하기)$/u;
const KOREAN_SERVICE_TERMS = /서비스|혜택|지원|복지|신청|플랫폼/u;

export function assertCurrentMarketCapture(value: unknown, lane: 'DOMAIN' | 'DESIGN'): void {
  const capturedAt = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  const now = Date.now();
  if (!Number.isFinite(capturedAt) || now - capturedAt > MAX_PROVENANCE_AGE_MS
    || capturedAt - now > MAX_CLOCK_SKEW_MS) {
    marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_CAPTURE_STALE`);
  }
}

function explanation(value: unknown, code: string): string {
  const result = marketText(value, code);
  if (result.replace(INVISIBLE, '').length < 20) return marketReject(code);
  return result;
}
function containsMarketToken(reason: string, tokens: readonly string[]): boolean {
  const normalized = reason.normalize('NFKC').toLocaleLowerCase('und');
  return tokens.some(candidate => {
    const token = candidate.normalize('NFKC').toLocaleLowerCase('und');
    let offset = normalized.indexOf(token);
    while (offset >= 0) {
      const before = normalized.slice(0, offset).at(-1);
      const after = normalized.slice(offset + token.length).at(0);
      if ((before === undefined || !/[\p{L}\p{N}]/u.test(before))
        && (after === undefined || !/[\p{L}\p{N}]/u.test(after))) return true;
      offset = normalized.indexOf(token, offset + token.length);
    }
    return false;
  });
}
function directRootReason(value: unknown, marketTokens: readonly string[], code: string): void {
  const reason = explanation(value, code);
  if (negatesMarketScope(reason, marketTokens) || !DIRECT_SCOPE.test(reason) || !containsMarketToken(reason, marketTokens)) marketReject(code);
}

function persistedTaskNeed(root: string, sourceContractSha256: string, request: string): string | null {
  const pointerPath = resolve(root, '.omd/route-source.json');
  if (!existsSync(pointerPath)) return null;
  const fs = nodeStableProjectFileSystem();
  const code = 'REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_STALE';
  const pointer = marketObject(JSON.parse(readStableProjectFile({ root: resolve(root), path: pointerPath,
    label: '.omd/route-source.json', fs }).toString('utf8')), code);
  const record = `route-sources/sha256-${sourceContractSha256}.json`;
  if (pointer.schema !== 'adaptive-route-source-pointer-v1' || pointer.record !== record
    || pointer.sha256 !== sourceContractSha256) return marketReject(code);
  const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, '.omd', record),
    label: record, fs });
  if (createHash('sha256').update(bytes).digest('hex') !== sourceContractSha256) return marketReject(code);
  const source = marketObject(JSON.parse(bytes.toString('utf8')), code);
  if (source.request !== request.trim()) return marketReject(code);
  return marketText(marketObject(source.referenceDiscovery, code).taskNeed, code);
}

function retainedKoreanService(root: string, source: ResearchSource): boolean {
  const { capture } = source;
  if (!capture.path.startsWith('.omd/refs/domain/')) return false;
  const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, capture.path),
    label: capture.path, fs: nodeStableProjectFileSystem() });
  if (createHash('sha256').update(bytes).digest('hex') !== capture.sha256) return false;
  const record = marketObject(JSON.parse(bytes.toString('utf8')), 'REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_RESULT_SCOPE');
  return record.source === source.url && record.researchLane === 'domain' && record.visibleKoreanText === true;
}

function capturedKoreanService(root: string, source: ResearchSource,
  discoveryRoots: ReferenceResearch['domainReference']['discoveryRoots'], marketLabels: readonly string[]): boolean {
  if (!retainedKoreanService(root, source)) return false;
  const entry = discoveryRoots?.find(candidate => candidate.url === source.url);
  if (entry === undefined) return false;
  const { reason: _reason, ...receipt } = entry;
  const observed = readCurrentDirectDiscoveryEntry(root, receipt);
  const text = observed.observedText ?? '';
  return observed.url === source.url && observed.finalUrl === source.url
    && isKoreanLanguageServiceText(text) && KOREAN_SERVICE_TERMS.test(text)
    && inferredKoreanReferenceMarket(text) === 'KR'
    && !negatesMarketScope(text, marketLabels);
}

export function validateMarketReferenceCoverage(root: string, research: ReferenceResearch, expectedRequest?: string): void {
  const contextPath = resolve(root, '.omd/locale-design-context.json');
  const context = existsSync(contextPath)
    ? parseLocaleDesignContext(JSON.parse(readStableProjectFile({ root: resolve(root), path: contextPath,
      label: '.omd/locale-design-context.json', fs: nodeStableProjectFileSystem() }).toString('utf8')))
    : null;
  const inferred = expectedRequest === undefined ? null : inferredKoreanReferenceMarket(expectedRequest);
  const marketRegion = context?.marketRegion ?? inferred;
  if (marketRegion === null) {
    if (research.schema === 'reference-research-v7' && research.marketCoverage !== null) return marketReject('REFERENCE_RESEARCH_MARKET_COVERAGE_UNSCOPED');
    return;
  }
  if (research.schema !== 'reference-research-v7' || research.marketCoverage === null || research.marketCoverage === undefined) {
    return marketReject('REFERENCE_RESEARCH_MARKET_COVERAGE_REQUIRED: publish v7 with source-specific local-market provenance for both lanes and a concrete gap for every global fallback');
  }
  if (research.marketCoverage.marketRegion !== marketRegion) return marketReject('REFERENCE_RESEARCH_MARKET_REGION_STALE');
  const localDomainIds = new Set(research.marketCoverage.domain.localSources.map(source => source.sourceId));
  const localDomainFamilies = new Set(research.domainReference.sources
    .filter(source => localDomainIds.has(source.id)).map(source => referenceServiceFamily(source.url)));
  if (localDomainIds.size < 3 || localDomainFamilies.size < 3) {
    return marketReject('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_DIVERSITY: inspect at least three target-market services from independent operator families before using global fallback');
  }
  const surfaceLocale = context?.surfaceLocale ?? 'ko';
  const briefPath = resolve(root, '.omd/domain-brief.json');
  if (!existsSync(briefPath)) return marketReject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_REQUIRED: current domain queries are missing');
  const briefBytes = readStableProjectFile({ root: resolve(root), path: briefPath, label: '.omd/domain-brief.json', fs: nodeStableProjectFileSystem() });
  const brief = validateDomainBrief(JSON.parse(briefBytes.toString('utf8')));
  if (expectedRequest === undefined || brief.request !== expectedRequest.trim()) {
    return marketReject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_STALE: current domain queries describe another request');
  }
  const domain = context?.domain ?? brief.domain;
  const labels = marketSearchLabels(marketRegion, surfaceLocale);
  const domainQueries = marketDomainQueries(marketRegion, surfaceLocale, domain);
  const marketTokens = [marketRegion, ...labels];
  for (const [name, roots] of [
    ['DOMAIN', research.domainReference.discoveryRoots], ['DESIGN', research.designReference.discoveryRoots],
  ] as const) roots?.forEach(root => directRootReason(root.reason, marketTokens,
    `REFERENCE_RESEARCH_MARKET_${name}_DIRECT_ROOT_REQUIRED: explain how each direct root scopes discovery to the explicit market`));
  const domainSearchRequired = laneNeedsMarketSearch(research.marketCoverage.domain,
    research.domainReference.discoveryRoots ?? [], research.domainReference.searches);
  if (domainSearchRequired
    && domainQueries.some((query, index) => research.domainReference.queries[index] !== query)) {
    return marketReject('REFERENCE_RESEARCH_MARKET_DOMAIN_SEARCH_REQUIRED: execute the exact target-market domain inputs before global searches');
  }
  const domainExecutions = [
    ...(domainSearchRequired ? validateExecutionOrder(root, research.domainReference.searches, domainQueries, labels, 'DOMAIN') : []),
    ...validateDirectExecutions(root, research.domainReference.discoveryRoots ?? [], 'DOMAIN'),
  ];
  const base = [...brief.referenceQueries.component, ...brief.referenceQueries.mood][0];
  if (base === undefined) return marketReject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_REQUIRED: current domain queries are empty');
  const designQueries = marketDesignQueries(marketRegion, surfaceLocale, domain, base,
    readFrame(root)?.uxSurface === 'marketing'
      || persistedTaskNeed(root, research.sourceContractSha256, expectedRequest) === 'new-marketing');
  const designSearchRequired = laneNeedsMarketSearch(research.marketCoverage.design,
    research.designReference.discoveryRoots ?? [], research.designReference.searches);
  if (designSearchRequired && (designQueries.some((query, index) => research.designReference.queries[index] !== query)
    || research.designReference.queries.slice(0, labels.length).some(query => !isMarketQualifiedQuery(query, labels)))) {
    return marketReject('REFERENCE_RESEARCH_MARKET_DESIGN_SEARCH_REQUIRED: execute market-and-domain-qualified design searches before global searches');
  }
  const designExecutions = [
    ...(designSearchRequired ? validateExecutionOrder(root, research.designReference.searches, designQueries, labels, 'DESIGN') : []),
    ...validateDirectExecutions(root, research.designReference.discoveryRoots ?? [], 'DESIGN'),
  ];
  validateLaneProvenance(root, 'DOMAIN', marketRegion, labels, research.marketCoverage.domain,
    research.domainReference.sources, domainExecutions, research.domainReference.discoveryRoots ?? []);
  validateLaneProvenance(root, 'DESIGN', marketRegion, labels, research.marketCoverage.design,
    research.designReference.sources, designExecutions, research.designReference.discoveryRoots ?? []);
}

type MarketExecution = Readonly<{
  sha256: string;
  query: string | null;
  observedAt: number;
  links: readonly string[];
  results: readonly ObservedSearchResult[];
  usable: boolean;
  directRoot?: Readonly<{ url: string; observedText: string }>;
}>;
function laneNeedsMarketSearch(coverage: MarketLaneCoverage, roots: readonly unknown[], searches: readonly unknown[]): boolean {
  return searches.length > 0 || !roots.length || coverage.localSources.some(source => source.basis === 'market-search-result')
    || (coverage.globalFallback?.gap.attemptedQueries.length ?? 0) > 0;
}
function validateLaneProvenance(
  root: string, lane: 'DOMAIN' | 'DESIGN', marketRegion: string, marketLabels: readonly string[], coverage: MarketLaneCoverage,
  sources: readonly ResearchSource[], executions: readonly MarketExecution[],
  roots: NonNullable<ReferenceResearch['domainReference']['discoveryRoots']>,
): void {
  for (const execution of executions) assertCurrentExecution(execution,
    `REFERENCE_RESEARCH_MARKET_${lane}_ATTEMPT_STALE`);
  for (const local of coverage.localSources) {
    const source = sources.find(candidate => candidate.id === local.sourceId)
      ?? marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_LOCAL_PROVENANCE`);
    if (marketRegion === 'KR' && lane === 'DOMAIN' && !retainedKoreanService(root, source)) {
      marketReject('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_RESULT_SCOPE');
    }
    const serviceHost = referenceServiceHost(source.url);
    if (marketRegion === 'KR' && lane === 'DOMAIN'
      && /(?:^|\.)(?:gov|nhs)(?:\.[a-z]{2})?$/u.test(serviceHost)
      && serviceHost !== 'gov.kr' && !serviceHost.endsWith('.gov.kr')) {
      marketReject('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_RESULT_SCOPE');
    }
    const urls = [source.url, ...(source.discovery === undefined ? [] : [source.discovery.url])];
    const execution = executions.find(candidate => candidate.sha256 === local.provenanceReceiptSha256)
      ?? marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_LOCAL_PROVENANCE`);
    if ((local.basis === 'market-search-result') !== (execution.query !== null)) {
      marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_LOCAL_PROVENANCE`);
    }
    if (!execution.usable) marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_LOCAL_PROVENANCE`);
    const result = execution.results.find(candidate => resultReaches(candidate, urls));
    const selfRoot = lane === 'DOMAIN' && execution.query === null
      && execution.directRoot?.url === source.url && execution.directRoot.observedText;
    const scopedSelfRoot = selfRoot && DIRECT_SCOPE.test(selfRoot) && SCOPE_TERMS[local.scope].test(selfRoot)
      && (marketRegion === 'KR' ? capturedKoreanService(root, source, roots, marketLabels)
        : containsMarketToken(selfRoot, marketLabels)) && !negatesMarketScope(selfRoot, marketLabels);
    const scopedResult = result !== undefined && DIRECT_SCOPE.test(result.text)
      && SCOPE_TERMS[local.scope].test(result.text)
      && (containsMarketToken(result.text, marketLabels)
        || (marketRegion === 'KR' && inferredKoreanReferenceMarket(result.text) === 'KR'));
    const capturedGeneric = result !== undefined && lane === 'DOMAIN' && marketRegion === 'KR'
      && local.scope === 'service' && GENERIC_LINK_LABEL.test(result.text.trim())
      && capturedKoreanService(root, source, roots, marketLabels);
    if (!scopedSelfRoot && (result === undefined || negatesMarketScope(result.text, marketLabels)
      || (!scopedResult && !capturedGeneric))) {
      marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_LOCAL_RESULT_SCOPE`);
    }
    assertCurrentSourceObservation(source.observedAt, execution.observedAt,
      `REFERENCE_RESEARCH_MARKET_${lane}_LOCAL_PROVENANCE_STALE`);
  }
  const fallback = coverage.globalFallback;
  if (fallback === null) return;
  if (fallback.gap.marketRegion !== marketRegion) marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_FALLBACK_MARKET`);
  for (const binding of fallback.provenance) {
    const source = sources.find(candidate => candidate.id === binding.sourceId)
      ?? marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_FALLBACK_PROVENANCE`);
    const urls = [source.url, ...(source.discovery === undefined ? [] : [source.discovery.url])];
    const execution = executions.find(candidate => candidate.sha256 === binding.provenanceReceiptSha256)
      ?? marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_FALLBACK_PROVENANCE`);
    const selfRoot = lane === 'DOMAIN' && execution.query === null
      && execution.directRoot?.url === source.url && execution.directRoot.observedText;
    const usefulSelfRoot = selfRoot && DIRECT_SCOPE.test(selfRoot) && SCOPE_TERMS.service.test(selfRoot);
    if (!execution.usable || !usefulSelfRoot && !execution.results.some(result => resultReaches(result, urls)
      && (execution.query === null || actionableSearchTargets({ lane: lane.toLowerCase() as 'domain' | 'design',
        query: execution.query, provider: '', results: [result], allowUnmatched: false })
        .some(target => urls.includes(target))))) {
      marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_FALLBACK_PROVENANCE`);
    }
    assertCurrentSourceObservation(source.observedAt, execution.observedAt,
      `REFERENCE_RESEARCH_MARKET_${lane}_FALLBACK_PROVENANCE_STALE`);
  }
  const rootUrls = roots.map(root => root.url);
  const attemptedQueries = executions.flatMap(execution => execution.query === null ? [] : [execution.query]);
  const expectedAttempts = same(fallback.gap.attemptedRoots, rootUrls)
    && same(fallback.gap.attemptedQueries, attemptedQueries);
  if (!expectedAttempts) marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_FALLBACK_ATTEMPTS`);
}
function assertCurrentSourceObservation(value: string, executionObservedAt: number, code: string): void {
  const observedAt = Date.parse(value);
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const executionDay = Date.parse(new Date(executionObservedAt).toISOString().slice(0, 10));
  if (!Number.isFinite(observedAt) || Math.abs(observedAt - executionDay) > MAX_PROVENANCE_AGE_MS
    || today - observedAt > MAX_PROVENANCE_AGE_MS || observedAt - today > DAY_MS) marketReject(code);
}
function assertCurrentExecution(execution: MarketExecution, code: string): void {
  const now = Date.now();
  if (!Number.isFinite(execution.observedAt) || now - execution.observedAt > MAX_PROVENANCE_AGE_MS
    || execution.observedAt - now > MAX_CLOCK_SKEW_MS) marketReject(code);
}
const same = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

function validateExecutionOrder(
  root: string, receipts: ReferenceResearch['domainReference']['searches'], expectedQueries: readonly string[],
  labels: readonly string[], lane: 'DOMAIN' | 'DESIGN',
): readonly MarketExecution[] {
  const executions = receipts.map(receipt => {
    const execution = readSearchExecution(root, receipt, lane.toLowerCase() as 'domain' | 'design');
    if (execution.schema !== SEARCH_EXECUTION_SCHEMA) return marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_AUTHORITY`);
    return {
      sha256: receipt.sha256,
      query: execution.query,
      observedAt: Date.parse(execution.observedAt),
      links: execution.links,
      results: execution.results ?? [],
      usable: execution.status === 'page-observed' || execution.status === 'gallery-observed',
    };
  });
  for (const execution of executions) assertCurrentExecution(execution,
    `REFERENCE_RESEARCH_MARKET_${lane}_ATTEMPT_STALE`);
  const expected = expectedQueries.map(query => executions.find(execution => execution.query === query)
    ?? marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_REQUIRED`));
  if (expected.some(execution => !Number.isFinite(execution.observedAt))) return marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_TIME`);
  const latestRequired = Math.max(...expected.map(execution => execution.observedAt));
  if (executions.some(execution => !isMarketQualifiedQuery(execution.query, labels)
    && (!Number.isFinite(execution.observedAt) || execution.observedAt <= latestRequired))) {
    return marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_ORDER: target-market searches must execute before global searches`);
  }
  return Object.freeze(executions);
}

function validateDirectExecutions(
  root: string,
  roots: NonNullable<ReferenceResearch['domainReference']['discoveryRoots']>,
  lane: 'DOMAIN' | 'DESIGN',
): readonly MarketExecution[] {
  return Object.freeze(roots.map(receipt => {
    const { reason: _reason, ...nativeReceipt } = receipt;
    let observation: ReturnType<typeof readCurrentDirectDiscoveryEntry>;
    try { observation = readCurrentDirectDiscoveryEntry(root, nativeReceipt); }
    catch (error) {
      if (error instanceof Error && /native discovery capture is stale/u.test(error.message)) {
        marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_ATTEMPT_STALE`);
      }
      throw error;
    }
    return Object.freeze({ sha256: receipt.capture.sha256, query: null,
      observedAt: Date.parse(observation.capturedAt ?? ''),
      links: observation.links, results: observation.linkLabels ?? [], usable: true,
      directRoot: { url: observation.url, observedText: observation.observedText ?? '' } });
  }));
}
