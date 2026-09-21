import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLocaleDesignContext } from '../locale/design-context.ts';
import { validateDomainBrief } from '../domain/domain-brief.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ReferenceResearch } from './reference-research-types.ts';
import { isMarketQualifiedQuery, marketDomainQueries, marketSearchLabels } from './market-reference.ts';
import { readCurrentDirectDiscoveryEntry } from './discovery-record.ts';
import { readSearchExecution, SEARCH_EXECUTION_SCHEMA } from './search-execution.ts';
import {
  marketObject, marketReject, marketText, marketTexts,
  type MarketLaneCoverage, type MarketSourceIdentity,
} from './market-reference-coverage-contract.ts';

export { parseMarketReferenceCoverage } from './market-reference-coverage-contract.ts';
export type { MarketLaneCoverage, MarketReferenceCoverage } from './market-reference-coverage-contract.ts';

const INVISIBLE = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
const DIRECT_NEGATION = /\b(?:not|no|isn't|is not|doesn't|does not|unavailable|unsupported|outside|excludes?|excluded|excluding|global only)\b|아님|아니다|불가|제외|미지원|제공하지\s*않|지원하지\s*않|해외\s*전용|한국\s*외/iu;
const DIRECT_SCOPE = /\b(?:serves?|serving|available|operat(?:e|es|ed|ing)|based|local(?:ized)?|market|residents?|users?|audience|directory|gallery|service|product|interface)\b|대상|제공|운영|거주|사용자|시장|서비스|디렉터리|갤러리|제품|인터페이스|앱|웹사이트/iu;

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
  if (DIRECT_NEGATION.test(reason) || !DIRECT_SCOPE.test(reason) || !containsMarketToken(reason, marketTokens)) marketReject(code);
}

export function validateMarketReferenceCoverage(root: string, research: ReferenceResearch, expectedRequest?: string): void {
  const contextPath = resolve(root, '.omd/locale-design-context.json');
  if (!existsSync(contextPath)) {
    if (research.schema === 'reference-research-v7' && research.marketCoverage !== null) return marketReject('REFERENCE_RESEARCH_MARKET_CONTEXT_REQUIRED');
    return;
  }
  const bytes = readStableProjectFile({ root: resolve(root), path: contextPath, label: '.omd/locale-design-context.json', fs: nodeStableProjectFileSystem() });
  const context = parseLocaleDesignContext(JSON.parse(bytes.toString('utf8')));
  if (context.marketRegion === null) {
    if (research.schema === 'reference-research-v7' && research.marketCoverage !== null) return marketReject('REFERENCE_RESEARCH_MARKET_COVERAGE_UNSCOPED');
    return;
  }
  if (research.schema !== 'reference-research-v7' || research.marketCoverage === null || research.marketCoverage === undefined) {
    return marketReject('REFERENCE_RESEARCH_MARKET_COVERAGE_REQUIRED: publish v7 with source-specific local-market provenance for both lanes and a concrete gap for every global fallback');
  }
  if (research.marketCoverage.marketRegion !== context.marketRegion) return marketReject('REFERENCE_RESEARCH_MARKET_REGION_STALE');
  const labels = marketSearchLabels(context.marketRegion, context.surfaceLocale);
  const domainQueries = marketDomainQueries(context.marketRegion, context.surfaceLocale, context.domain);
  const marketTokens = [context.marketRegion, ...labels];
  for (const [name, roots] of [
    ['DOMAIN', research.domainReference.discoveryRoots], ['DESIGN', research.designReference.discoveryRoots],
  ] as const) roots?.forEach(root => directRootReason(root.reason, marketTokens,
    `REFERENCE_RESEARCH_MARKET_${name}_DIRECT_ROOT_REQUIRED: explain how each direct root scopes discovery to the explicit market`));
  if (!research.domainReference.discoveryRoots?.length
    && domainQueries.some((query, index) => research.domainReference.queries[index] !== query)) {
    return marketReject('REFERENCE_RESEARCH_MARKET_DOMAIN_SEARCH_REQUIRED: execute the exact target-market domain inputs before global searches');
  }
  const domainExecutions = research.domainReference.discoveryRoots?.length
    ? validateDirectExecutions(root, research.domainReference.discoveryRoots, marketTokens, 'DOMAIN')
    : validateExecutionOrder(root, research.domainReference.searches, domainQueries, labels, 'DOMAIN');
  const briefPath = resolve(root, '.omd/domain-brief.json');
  if (!existsSync(briefPath)) return marketReject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_REQUIRED: current domain queries are missing');
  const briefBytes = readStableProjectFile({ root: resolve(root), path: briefPath, label: '.omd/domain-brief.json', fs: nodeStableProjectFileSystem() });
  const brief = validateDomainBrief(JSON.parse(briefBytes.toString('utf8')));
  if (expectedRequest === undefined || brief.request !== expectedRequest.trim()) {
    return marketReject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_STALE: current domain queries describe another request');
  }
  const base = [...brief.referenceQueries.mood, ...brief.referenceQueries.component][0];
  if (base === undefined) return marketReject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_REQUIRED: current domain queries are empty');
  const designQueries = labels.map(label => `${label} ${context.domain} ${base}`);
  if (!research.designReference.discoveryRoots?.length && (designQueries.some((query, index) => research.designReference.queries[index] !== query)
    || research.designReference.queries.slice(0, labels.length).some(query => !isMarketQualifiedQuery(query, labels)))) {
    return marketReject('REFERENCE_RESEARCH_MARKET_DESIGN_SEARCH_REQUIRED: execute market-and-domain-qualified design searches before global searches');
  }
  const designExecutions = research.designReference.discoveryRoots?.length
    ? validateDirectExecutions(root, research.designReference.discoveryRoots, marketTokens, 'DESIGN')
    : validateExecutionOrder(root, research.designReference.searches, designQueries, labels, 'DESIGN');
  validateLaneProvenance('DOMAIN', context.marketRegion, research.marketCoverage.domain,
    research.domainReference.sources, domainExecutions, domainQueries, research.domainReference.discoveryRoots ?? []);
  validateLaneProvenance('DESIGN', context.marketRegion, research.marketCoverage.design,
    research.designReference.sources, designExecutions, designQueries, research.designReference.discoveryRoots ?? []);
}

type MarketExecution = Readonly<{ sha256: string; query: string | null; observedAt: number; links: readonly string[] }>;
function validateLaneProvenance(
  lane: 'DOMAIN' | 'DESIGN', marketRegion: string, coverage: MarketLaneCoverage,
  sources: readonly MarketSourceIdentity[], executions: readonly MarketExecution[],
  expectedQueries: readonly string[], roots: readonly Readonly<{ url: string }>[],
): void {
  for (const local of coverage.localSources) {
    const source = sources.find(candidate => candidate.id === local.sourceId)!;
    const urls = [source.url, ...(source.discovery === undefined ? [] : [source.discovery.url])];
    const execution = executions.find(candidate => candidate.sha256 === local.provenanceReceiptSha256);
    if ((local.basis === 'market-search-result') !== (execution?.query !== null)) {
      marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_LOCAL_PROVENANCE`);
    }
    if (execution === undefined || !execution.links.some(link => urls.includes(link))) {
      marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_LOCAL_PROVENANCE`);
    }
  }
  const fallback = coverage.globalFallback;
  if (fallback === null) return;
  if (fallback.gap.marketRegion !== marketRegion) marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_FALLBACK_MARKET`);
  const rootUrls = roots.map(root => root.url);
  const expectedAttempts = roots.length
    ? !fallback.gap.attemptedQueries.length && same(fallback.gap.attemptedRoots, rootUrls)
    : !fallback.gap.attemptedRoots.length && same(fallback.gap.attemptedQueries, expectedQueries);
  if (!expectedAttempts) marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_FALLBACK_ATTEMPTS`);
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
    return { sha256: receipt.sha256, query: execution.query, observedAt: Date.parse(execution.observedAt), links: execution.links };
  });
  const expected = expectedQueries.map(query => executions.find(execution => execution.query === query)
    ?? marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_REQUIRED`));
  if (expected.some(execution => !Number.isFinite(execution.observedAt))) return marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_TIME`);
  const latestRequired = Math.max(...expected.map(execution => execution.observedAt));
  if (executions.some(execution => !isMarketQualifiedQuery(execution.query, labels)
    && (!Number.isFinite(execution.observedAt) || execution.observedAt <= latestRequired))) {
    return marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_ORDER: target-market searches must execute before global searches`);
  }
  return Object.freeze(expected);
}

function validateDirectExecutions(
  root: string,
  roots: NonNullable<ReferenceResearch['domainReference']['discoveryRoots']>,
  marketTokens: readonly string[],
  lane: 'DOMAIN' | 'DESIGN',
): readonly MarketExecution[] {
  return Object.freeze(roots.map(receipt => {
    let scoped: string;
    try { scoped = decodeURIComponent(receipt.url).replace(/[+_/-]+/g, ' '); }
    catch { return marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_DIRECT_PROVENANCE`); }
    if (!containsMarketToken(scoped, marketTokens)) {
      return marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_DIRECT_PROVENANCE`);
    }
    const { reason: _reason, ...nativeReceipt } = receipt;
    const observation = readCurrentDirectDiscoveryEntry(root, nativeReceipt);
    return Object.freeze({ sha256: receipt.capture.sha256, query: null, observedAt: 0, links: observation.links });
  }));
}
