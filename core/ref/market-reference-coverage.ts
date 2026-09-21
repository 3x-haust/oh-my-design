import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLocaleDesignContext } from '../locale/design-context.ts';
import { validateDomainBrief } from '../domain/domain-brief.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ReferenceResearch } from './reference-research-contract.ts';
import { isMarketQualifiedQuery, marketDomainQueries, marketSearchLabels } from './market-reference.ts';

export type MarketLaneCoverage = Readonly<{
  localSources: readonly Readonly<{ sourceId: string; reason: string }>[];
  globalFallback: Readonly<{ sourceIds: readonly string[]; gap: string }> | null;
}>;
export type MarketReferenceCoverage = Readonly<{
  marketRegion: string;
  domain: MarketLaneCoverage;
  design: MarketLaneCoverage;
}>;

const reject = (code: string): never => { throw new Error(code); };
const INVISIBLE = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
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
  if (!result || result.length > 4096 || !result.replace(INVISIBLE, '')) return reject(code);
  return result;
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
  exact(input, ['localSources', 'globalFallback'], `${code}_KEYS`);
  if (!Array.isArray(input.localSources) || !input.localSources.length
    || Object.keys(input.localSources).length !== input.localSources.length) return reject(`${code}_LOCAL`);
  const localSources = Object.freeze(input.localSources.map(value => {
    const source = object(value, `${code}_LOCAL`);
    exact(source, ['sourceId', 'reason'], `${code}_LOCAL_KEYS`);
    return Object.freeze({ sourceId: text(source.sourceId, `${code}_LOCAL_ID`),
      reason: text(source.reason, `${code}_LOCAL_REASON`) });
  }));
  let globalFallback: MarketLaneCoverage['globalFallback'] = null;
  if (input.globalFallback !== null) {
    const fallback = object(input.globalFallback, `${code}_FALLBACK`);
    exact(fallback, ['sourceIds', 'gap'], `${code}_FALLBACK_KEYS`);
    globalFallback = Object.freeze({
      sourceIds: texts(fallback.sourceIds, `${code}_FALLBACK_SOURCES`),
      gap: text(fallback.gap, `${code}_FALLBACK_GAP`),
    });
  }
  const classified = [...localSources.map(source => source.sourceId), ...globalFallback?.sourceIds ?? []];
  if (new Set(classified).size !== classified.length || classified.length !== sourceIds.length
    || classified.some(id => !sourceIds.includes(id))) return reject(`${code}_COVERAGE`);
  return Object.freeze({ localSources, globalFallback });
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
  const directLanes = [
    ['DOMAIN', research.domainReference.discoveryRoots],
    ['DESIGN', research.designReference.discoveryRoots],
  ] as const;
  for (const [name, roots] of directLanes) {
    if (roots?.some(root => !marketTokens.some(token => root.reason.includes(token)))) {
      return reject(`REFERENCE_RESEARCH_MARKET_${name}_DIRECT_ROOT_REQUIRED: explain how each direct root scopes discovery to the explicit market`);
    }
  }
  if (!research.domainReference.discoveryRoots?.length && domain.some((query, index) => research.domainReference.queries[index] !== query)) {
    return reject('REFERENCE_RESEARCH_MARKET_DOMAIN_SEARCH_REQUIRED: execute the exact target-market domain inputs before global searches');
  }
  if (!research.domainReference.discoveryRoots?.length) validateExecutionOrder(
    root, research.domainReference.searches, domain, labels, 'DOMAIN',
  );
  if (research.designReference.discoveryRoots?.length) return;
  const briefPath = resolve(root, '.omd/domain-brief.json');
  if (!existsSync(briefPath)) return reject('REFERENCE_RESEARCH_MARKET_DESIGN_PLAN_REQUIRED: current domain queries are missing');
  const briefBytes = readStableProjectFile({ root: resolve(root), path: briefPath, label: '.omd/domain-brief.json', fs: nodeStableProjectFileSystem() });
  const brief = validateDomainBrief(JSON.parse(briefBytes.toString('utf8')));
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
    && (!Number.isFinite(execution.observedAt) || execution.observedAt < latestRequired))) {
    return reject(`REFERENCE_RESEARCH_MARKET_${lane}_SEARCH_ORDER: target-market searches must execute before global searches`);
  }
}
