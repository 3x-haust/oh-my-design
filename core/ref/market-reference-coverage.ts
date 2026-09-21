import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLocaleDesignContext } from '../locale/design-context.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ReferenceResearch } from './reference-research-contract.ts';
import { isMarketQualifiedQuery, marketDomainQueries, marketSearchLabels } from './market-reference.ts';

export type MarketLaneCoverage = Readonly<{
  localSourceIds: readonly string[];
  globalFallback: Readonly<{ sourceIds: readonly string[]; gap: string }> | null;
}>;
export type MarketReferenceCoverage = Readonly<{
  marketRegion: string;
  domain: MarketLaneCoverage;
  design: MarketLaneCoverage;
}>;

const reject = (code: string): never => { throw new Error(code); };
function object(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return reject(code);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) reject(code);
}
function text(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) return reject(code);
  return value.trim();
}
function texts(value: unknown, code: string): readonly string[] {
  if (!Array.isArray(value) || !value.length || Object.keys(value).length !== value.length) return reject(code);
  const result = value.map(item => text(item, code));
  if (new Set(result).size !== result.length) return reject(`${code}_DUPLICATE`);
  return Object.freeze(result);
}
function lane(value: unknown, sourceIds: readonly string[], label: string): MarketLaneCoverage {
  const code = `REFERENCE_RESEARCH_MARKET_${label.toUpperCase()}`;
  const input = object(value, code);
  exact(input, ['localSourceIds', 'globalFallback'], `${code}_KEYS`);
  const localSourceIds = texts(input.localSourceIds, `${code}_LOCAL`);
  let globalFallback: MarketLaneCoverage['globalFallback'] = null;
  if (input.globalFallback !== null) {
    const fallback = object(input.globalFallback, `${code}_FALLBACK`);
    exact(fallback, ['sourceIds', 'gap'], `${code}_FALLBACK_KEYS`);
    globalFallback = Object.freeze({
      sourceIds: texts(fallback.sourceIds, `${code}_FALLBACK_SOURCES`),
      gap: text(fallback.gap, `${code}_FALLBACK_GAP`),
    });
  }
  const classified = [...localSourceIds, ...globalFallback?.sourceIds ?? []];
  if (new Set(classified).size !== classified.length || classified.length !== sourceIds.length
    || classified.some(id => !sourceIds.includes(id))) return reject(`${code}_COVERAGE`);
  return Object.freeze({ localSourceIds, globalFallback });
}

export function parseMarketReferenceCoverage(
  value: unknown,
  domainIds: readonly string[],
  designIds: readonly string[],
): MarketReferenceCoverage | null {
  if (value === null) return null;
  const input = object(value, 'REFERENCE_RESEARCH_MARKET_COVERAGE');
  exact(input, ['marketRegion', 'domain', 'design'], 'REFERENCE_RESEARCH_MARKET_COVERAGE_KEYS');
  const marketRegion = text(input.marketRegion, 'REFERENCE_RESEARCH_MARKET_REGION').toUpperCase();
  if (!/^(?:[A-Z]{2}|\d{3})$/.test(marketRegion)) return reject('REFERENCE_RESEARCH_MARKET_REGION');
  return Object.freeze({ marketRegion,
    domain: lane(input.domain, domainIds, 'domain'), design: lane(input.design, designIds, 'design') });
}

export function validateMarketReferenceCoverage(root: string, research: ReferenceResearch): void {
  const contextPath = resolve(root, '.omd/locale-design-context.json');
  if (!existsSync(contextPath)) {
    if (research.schema === 'reference-research-v7' && research.marketCoverage !== null) return reject('REFERENCE_RESEARCH_MARKET_CONTEXT_REQUIRED');
    return;
  }
  const bytes = readStableProjectFile({ root: resolve(root), path: contextPath, label: '.omd/locale-design-context.json', fs: nodeStableProjectFileSystem() });
  const context = parseLocaleDesignContext(JSON.parse(bytes.toString('utf8')));
  const required = context.desiredFit === 'market-grounded' && context.marketRegion !== null && context.audience !== null;
  if (!required) {
    if (research.schema === 'reference-research-v7' && research.marketCoverage !== null) return reject('REFERENCE_RESEARCH_MARKET_COVERAGE_UNSCOPED');
    return;
  }
  if (research.schema !== 'reference-research-v7' || research.marketCoverage === null || research.marketCoverage === undefined) {
    return reject('REFERENCE_RESEARCH_MARKET_COVERAGE_REQUIRED: publish v7 with local source ids for both lanes and a concrete gap for every global fallback');
  }
  if (research.marketCoverage.marketRegion !== context.marketRegion) return reject('REFERENCE_RESEARCH_MARKET_REGION_STALE');
  const labels = marketSearchLabels(context.marketRegion, context.surfaceLocale);
  const domain = marketDomainQueries(context.marketRegion, context.surfaceLocale, context.domain);
  if (!research.domainReference.discoveryRoots?.length
    && domain.some((query, index) => research.domainReference.queries[index] !== query)) {
    return reject('REFERENCE_RESEARCH_MARKET_DOMAIN_SEARCH_REQUIRED: execute the exact target-market domain inputs before global searches');
  }
  const designPrefixes = labels.map(label => `${label} ${context.domain}`);
  if (!research.designReference.discoveryRoots?.length
    && (designPrefixes.some((prefix, index) => !research.designReference.queries[index]?.startsWith(`${prefix} `))
      || research.designReference.queries.slice(0, labels.length).some(query => !isMarketQualifiedQuery(query, labels)))) {
    return reject('REFERENCE_RESEARCH_MARKET_DESIGN_SEARCH_REQUIRED: execute market-and-domain-qualified design searches before global searches');
  }
}
