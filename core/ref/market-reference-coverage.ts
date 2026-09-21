import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLocaleDesignContext } from '../locale/design-context.ts';
import { validateDomainBrief } from '../domain/domain-brief.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ReferenceResearch } from './reference-research-types.ts';
import { isMarketQualifiedQuery, marketDomainQueries, marketSearchLabels } from './market-reference.ts';

export type MarketLaneCoverage = Readonly<{
  localSources: readonly Readonly<{ sourceId: string; evidenceSha256: string; reason: string }>[];
  globalFallback: Readonly<{ sourceIds: readonly string[]; gap: string }> | null;
}>;
export type MarketReferenceCoverage = Readonly<{
  marketRegion: string;
  domain: MarketLaneCoverage;
  design: MarketLaneCoverage;
}>;

const reject = (code: string): never => { throw new Error(code); };
const INVISIBLE = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
const DIRECT_NEGATION = /\b(?:not|no|isn't|is not|doesn't|does not|unavailable|unsupported|outside|excludes?|excluding|global only)\b|아님|아니다|불가|제외|미지원|제공하지\s*않|지원하지\s*않|해외\s*전용|한국\s*외/iu;
const DIRECT_SCOPE = /\b(?:serves?|serving|available|operat(?:e|es|ed|ing)|based|local(?:ized)?|market|residents?|users?|audience|directory|gallery|service|product|interface)\b|대상|제공|운영|거주|사용자|시장|서비스|디렉터리|갤러리|제품|인터페이스|앱|웹사이트/iu;
const MARKET_GAP = /\b(?:lack|lacks|lacking|missing|unavailable|blocked|only|fewer|insufficient|could not|cannot|unable)\b|부족|없(?:음|다)|찾지\s*못|접근\s*불가|차단|한정|제한|미확인|뿐/iu;
type SourceIdentity = Readonly<{ id: string; evidence: Readonly<{ sha256: string }> }>;
function object(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return reject(code);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) reject(code);
}
function text(value: unknown, code: string): string {
  if (typeof value !== 'string') return reject(code);
  const result = value.trim();
  if (!result || result.length > 4096 || !result.replace(INVISIBLE, '') || Array.from(result).some(character => {
    const point = character.codePointAt(0) ?? 0;
    return point >= 0xd800 && point <= 0xdfff;
  })) return reject(code);
  return result;
}
function explanation(value: unknown, code: string): string {
  const result = text(value, code);
  if (result.replace(INVISIBLE, '').length < 20) return reject(code);
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
  if (DIRECT_NEGATION.test(reason) || !DIRECT_SCOPE.test(reason) || !containsMarketToken(reason, marketTokens)) reject(code);
}
function localSourceReason(reason: string, marketTokens: readonly string[], code: string): void {
  if (DIRECT_NEGATION.test(reason) || !DIRECT_SCOPE.test(reason) || !containsMarketToken(reason, marketTokens)) reject(code);
}
function fallbackGap(gap: string, marketTokens: readonly string[], code: string): void {
  if (!MARKET_GAP.test(gap) || !DIRECT_SCOPE.test(gap) || !containsMarketToken(gap, marketTokens)) reject(code);
}
function texts(value: unknown, code: string): readonly string[] {
  if (!Array.isArray(value) || !value.length || Object.keys(value).length !== value.length) return reject(code);
  const result = value.map(item => text(item, code));
  if (new Set(result).size !== result.length) return reject(`${code}_DUPLICATE`);
  return Object.freeze(result);
}
function lane(value: unknown, sources: readonly SourceIdentity[], label: string): MarketLaneCoverage {
  const code = `REFERENCE_RESEARCH_MARKET_${label.toUpperCase()}`;
  const input = object(value, code);
  exact(input, ['localSources', 'globalFallback'], `${code}_KEYS`);
  if (!Array.isArray(input.localSources) || !input.localSources.length
    || Object.keys(input.localSources).length !== input.localSources.length) return reject(`${code}_LOCAL`);
  const localSources = Object.freeze(input.localSources.map(value => {
    const source = object(value, `${code}_LOCAL`);
    exact(source, ['sourceId', 'evidenceSha256', 'reason'], `${code}_LOCAL_KEYS`);
    const sourceId = text(source.sourceId, `${code}_LOCAL_ID`);
    const retained = sources.find(candidate => candidate.id === sourceId);
    if (retained === undefined || source.evidenceSha256 !== retained.evidence.sha256) return reject(`${code}_LOCAL_EVIDENCE`);
    return Object.freeze({ sourceId, evidenceSha256: retained.evidence.sha256,
      reason: explanation(source.reason, `${code}_LOCAL_REASON`) });
  }));
  let globalFallback: MarketLaneCoverage['globalFallback'] = null;
  if (input.globalFallback !== null) {
    const fallback = object(input.globalFallback, `${code}_FALLBACK`);
    exact(fallback, ['sourceIds', 'gap'], `${code}_FALLBACK_KEYS`);
    globalFallback = Object.freeze({
      sourceIds: texts(fallback.sourceIds, `${code}_FALLBACK_SOURCES`),
      gap: explanation(fallback.gap, `${code}_FALLBACK_GAP`),
    });
  }
  const classified = [...localSources.map(source => source.sourceId), ...globalFallback?.sourceIds ?? []];
  const sourceIds = sources.map(source => source.id);
  if (new Set(classified).size !== classified.length || classified.length !== sourceIds.length
    || classified.some(id => !sourceIds.includes(id))) return reject(`${code}_COVERAGE`);
  return Object.freeze({ localSources, globalFallback });
}

export function parseMarketReferenceCoverage(
  value: unknown,
  domainSources: readonly SourceIdentity[],
  designSources: readonly SourceIdentity[],
): MarketReferenceCoverage | null {
  if (value === null) return null;
  const input = object(value, 'REFERENCE_RESEARCH_MARKET_COVERAGE');
  exact(input, ['marketRegion', 'domain', 'design'], 'REFERENCE_RESEARCH_MARKET_COVERAGE_KEYS');
  const marketRegion = text(input.marketRegion, 'REFERENCE_RESEARCH_MARKET_REGION').toUpperCase();
  if (!/^(?:[A-Z]{2}|\d{3})$/.test(marketRegion)) return reject('REFERENCE_RESEARCH_MARKET_REGION');
  return Object.freeze({ marketRegion,
    domain: lane(input.domain, domainSources, 'domain'), design: lane(input.design, designSources, 'design') });
}

export function validateMarketReferenceCoverage(root: string, research: ReferenceResearch, expectedRequest?: string): void {
  const contextPath = resolve(root, '.omd/locale-design-context.json');
  if (!existsSync(contextPath)) {
    if (research.schema === 'reference-research-v7' && research.marketCoverage !== null) return reject('REFERENCE_RESEARCH_MARKET_CONTEXT_REQUIRED');
    return;
  }
  const bytes = readStableProjectFile({ root: resolve(root), path: contextPath, label: '.omd/locale-design-context.json', fs: nodeStableProjectFileSystem() });
  const context = parseLocaleDesignContext(JSON.parse(bytes.toString('utf8')));
  const required = context.marketRegion !== null;
  if (!required) {
    if (research.schema === 'reference-research-v7' && research.marketCoverage !== null) return reject('REFERENCE_RESEARCH_MARKET_COVERAGE_UNSCOPED');
    return;
  }
  if (research.schema !== 'reference-research-v7' || research.marketCoverage === null || research.marketCoverage === undefined) {
    return reject('REFERENCE_RESEARCH_MARKET_COVERAGE_REQUIRED: publish v7 with source-specific local-market reasons for both lanes and a concrete gap for every global fallback');
  }
  if (research.marketCoverage.marketRegion !== context.marketRegion) return reject('REFERENCE_RESEARCH_MARKET_REGION_STALE');
  const labels = marketSearchLabels(context.marketRegion, context.surfaceLocale);
  const domain = marketDomainQueries(context.marketRegion, context.surfaceLocale, context.domain);
  const marketTokens = [context.marketRegion, ...labels];
  for (const [name, coverage] of [
    ['DOMAIN', research.marketCoverage.domain],
    ['DESIGN', research.marketCoverage.design],
  ] as const) {
    coverage.localSources.forEach(source => localSourceReason(
      source.reason, marketTokens, `REFERENCE_RESEARCH_MARKET_${name}_LOCAL_REASON`,
    ));
    if (coverage.globalFallback !== null) fallbackGap(
      coverage.globalFallback.gap, marketTokens, `REFERENCE_RESEARCH_MARKET_${name}_FALLBACK_GAP`,
    );
  }
  const directLanes = [
    ['DOMAIN', research.domainReference.discoveryRoots],
    ['DESIGN', research.designReference.discoveryRoots],
  ] as const;
  for (const [name, roots] of directLanes) {
    roots?.forEach(root => directRootReason(
      root.reason,
      marketTokens,
      `REFERENCE_RESEARCH_MARKET_${name}_DIRECT_ROOT_REQUIRED: explain how each direct root scopes discovery to the explicit market`,
    ));
  }
  if (!research.domainReference.discoveryRoots?.length && domain.some((query, index) => research.domainReference.queries[index] !== query)) {
    return reject('REFERENCE_RESEARCH_MARKET_DOMAIN_SEARCH_REQUIRED: execute the exact target-market domain inputs before global searches');
  }
  if (!research.domainReference.discoveryRoots?.length) validateExecutionOrder(
    root, research.domainReference.searches, domain, labels, 'DOMAIN',
  );
  const briefPath = resolve(root, '.omd/domain-brief.json');
  if (!existsSync(briefPath)) return reject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_REQUIRED: current domain queries are missing');
  const briefBytes = readStableProjectFile({ root: resolve(root), path: briefPath, label: '.omd/domain-brief.json', fs: nodeStableProjectFileSystem() });
  const brief = validateDomainBrief(JSON.parse(briefBytes.toString('utf8')));
  if (expectedRequest === undefined || brief.request !== expectedRequest.trim()) {
    return reject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_STALE: current domain queries describe another request');
  }
  if (research.designReference.discoveryRoots?.length) return;
  const base = [...brief.referenceQueries.mood, ...brief.referenceQueries.component][0];
  if (base === undefined) return reject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_REQUIRED: current domain queries are empty');
  const designQueries = labels.map(label => `${label} ${context.domain} ${base}`);
  if (designQueries.some((query, index) => research.designReference.queries[index] !== query)
    || research.designReference.queries.slice(0, labels.length).some(query => !isMarketQualifiedQuery(query, labels))) {
    return reject('REFERENCE_RESEARCH_MARKET_DESIGN_SEARCH_REQUIRED: execute market-and-domain-qualified design searches before global searches');
  }
  validateExecutionOrder(root, research.designReference.searches, designQueries, labels, 'DESIGN');
}

function validateExecutionOrder(
  root: string,
  receipts: ReferenceResearch['domainReference']['searches'],
  expectedQueries: readonly string[],
  labels: readonly string[],
  lane: 'DOMAIN' | 'DESIGN',
): void {
  const executions = receipts.map(receipt => {
    const path = resolve(root, receipt.path);
    const bytes = readStableProjectFile({ root: resolve(root), path, label: receipt.path, fs: nodeStableProjectFileSystem() });
    if (createHash('sha256').update(bytes).digest('hex') !== receipt.sha256) return reject('REFERENCE_RESEARCH_EVIDENCE_STALE');
    const value = object(JSON.parse(bytes.toString('utf8')), `REFERENCE_RESEARCH_MARKET_${lane}_SEARCH`);
    return { query: text(value.query, `REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_QUERY`),
      observedAt: Date.parse(text(value.observedAt, `REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_TIME`)) };
  });
  const expected = expectedQueries.map(query => executions.find(execution => execution.query === query)
    ?? reject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_REQUIRED`));
  if (expected.some(execution => !Number.isFinite(execution.observedAt))) return reject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_TIME`);
  const latestRequired = Math.max(...expected.map(execution => execution.observedAt));
  if (executions.some(execution => !isMarketQualifiedQuery(execution.query, labels)
    && (!Number.isFinite(execution.observedAt) || execution.observedAt <= latestRequired))) {
    return reject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_ORDER: target-market searches must execute before global searches`);
  }
}
