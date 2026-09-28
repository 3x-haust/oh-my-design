import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLocaleDesignContext } from '../locale/design-context.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ReferenceResearch } from './reference-research-types.ts';
import { readCurrentDirectDiscoveryEntry, readCurrentDiscoveryNavigation } from './discovery-record.ts';
import { readDomainObservation } from './domain-observation.ts';
import { readSearchExecution, searchObserved } from './search-execution.ts';
import { resultReaches } from './search-result.ts';
import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';
import { marketReject } from './market-reference-coverage-contract.ts';

export { parseMarketReferenceCoverage } from './market-reference-coverage-contract.ts';
export type { MarketLaneCoverage, MarketReferenceCoverage } from './market-reference-coverage-contract.ts';

const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export function assertCurrentMarketCapture(value: unknown, lane: 'DOMAIN' | 'DESIGN'): void {
  const date = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(date) || Date.now() - date > MAX_AGE || date - Date.now() > 300000)
    marketReject(`REFERENCE_RESEARCH_MARKET_${lane}_CAPTURE_STALE`);
}

/** Signed search/direct/observed receipts establish where the source was found. They do not
 * establish whom a service serves or what task it supports. Those require current judgments. */
export function validateMarketReferenceCoverage(root: string, research: ReferenceResearch, expectedRequest?: string,
  onAdvisory?: (code: string, detail: string) => void): readonly Readonly<{ code: string; detail: string }>[] {
  const advisories: { code: string; detail: string }[] = [];
  const warn = (code: string, detail: string) => { advisories.push({ code, detail }); onAdvisory?.(code, detail); };
  const contextPath = resolve(root, '.omd/locale-design-context.json');
  const context = existsSync(contextPath)
    ? parseLocaleDesignContext(JSON.parse(readStableProjectFile({ root: resolve(root), path: contextPath,
      label: '.omd/locale-design-context.json', fs: nodeStableProjectFileSystem() }).toString('utf8'))) : null;
  const coverage = research.marketCoverage;
  if (!coverage) {
    if (context?.marketRegion) warn('REFERENCE_RESEARCH_MARKET_COVERAGE_REQUIRED', 'Market research limitation: no source-specific coverage was submitted.');
    return advisories;
  }
  if (context?.marketRegion && coverage.marketRegion !== context.marketRegion) marketReject('REFERENCE_RESEARCH_MARKET_REGION_STALE');
  if (expectedRequest === undefined) warn('REFERENCE_RESEARCH_MARKET_REQUEST_UNVERIFIED', 'No authenticated request was supplied for market assessment.');
  for (const lane of ['domain', 'design'] as const) {
    const laneCoverage = coverage[lane];
    const researchLane = lane === 'domain' ? research.domainReference : research.designReference;
    const searches = researchLane.searches.map(receipt => ({ receipt, execution: readSearchExecution(root, receipt, lane) }));
    const direct = (researchLane.discoveryRoots ?? []).map(({ reason: _reason, ...receipt }) =>
      ({ receipt, observation: readCurrentDirectDiscoveryEntry(root, receipt) }));
    const observed = lane === 'design' ? research.designReference.sources.flatMap(source => source.discovery?.capture.path.startsWith('.omd/discovery/design/navigation/')
      ? [{ receipt: source.discovery.capture, observation: readCurrentDiscoveryNavigation(root, source.discovery) }] : [])
      : research.schema === 'reference-research-v8' ? research.domainReference.sources.flatMap(source =>
        'observations' in source ? source.observations.map(receipt => ({ receipt: receipt.capture, observation: readDomainObservation(root, receipt) })) : []) : [];
    const provenance = (sourceId: string, receiptSha256: string, code: string) => {
      const source = researchLane.sources.find(item => item.id === sourceId) ?? marketReject(code);
      const urls = [source.url, ...('discovery' in source && source.discovery ? [source.discovery.url] : [])];
      const search = searches.find(item => item.receipt.sha256 === receiptSha256);
      if (search) {
        if (!searchObserved(search.execution) || !search.execution.results?.some(result => resultReaches(result, urls))) marketReject(code);
        assertCurrentMarketCapture(search.execution.observedAt, lane.toUpperCase() as 'DOMAIN' | 'DESIGN');
        return;
      }
      const entry = direct.find(item => item.receipt.capture.sha256 === receiptSha256);
      if (entry) {
        if (!urls.some(url => url === entry.observation.url || entry.observation.links.includes(url))) marketReject(code);
        assertCurrentMarketCapture(entry.observation.capturedAt, lane.toUpperCase() as 'DOMAIN' | 'DESIGN');
        return;
      }
      const observation = observed.find(item => item.receipt.sha256 === receiptSha256) ?? marketReject(code);
      if (!urls.includes(observation.observation.url)) marketReject(code);
      assertCurrentMarketCapture(observation.observation.capturedAt, lane.toUpperCase() as 'DOMAIN' | 'DESIGN');
    };
    for (const local of laneCoverage.localSources) {
      provenance(local.sourceId, local.provenanceReceiptSha256, `REFERENCE_RESEARCH_MARKET_${lane.toUpperCase()}_LOCAL_PROVENANCE`);
      warn(`REFERENCE_RESEARCH_MARKET_${lane.toUpperCase()}_SCOPE_UNCLEAR`, `${local.sourceId}: serving region and task capability require verified judgments.`);
    }
    for (const fallback of laneCoverage.globalFallback?.provenance ?? [])
      provenance(fallback.sourceId, fallback.provenanceReceiptSha256, `REFERENCE_RESEARCH_MARKET_${lane.toUpperCase()}_FALLBACK_PROVENANCE`);
    if (laneCoverage.localSources.length < (lane === 'domain' ? 3 : 2)) warn(`REFERENCE_RESEARCH_MARKET_${lane.toUpperCase()}_LOCAL_DIVERSITY`, 'Local source count is below the suggested target.');
    if (laneCoverage.globalFallback && (!laneCoverage.globalFallback.gap.attemptedQueries.length && !laneCoverage.globalFallback.gap.attemptedRoots.length))
      warn(`REFERENCE_RESEARCH_MARKET_${lane.toUpperCase()}_FALLBACK_ATTEMPTS`, 'Fallback has no recorded attempts.');
  }
  return advisories;
}

/** Caller passes host-resolved, signed judgments. False/stale quotes fail rather than turning
 * into advisory limitations; only an absent judgment is unclear. */
export async function assessMarketSource(sourceUrl: string, bindings: Readonly<{
  scope?: ReferenceJudgmentBinding; capability?: ReferenceJudgmentBinding;
}> = {}) {
  if (bindings.scope && bindings.scope.subjectId !== sourceUrl || bindings.capability && bindings.capability.subjectId !== sourceUrl)
    marketReject('AI_JUDGMENT_CONTEXT_MISMATCH');
  const scope = await referenceDecision('market-scope', bindings.scope);
  const capability = await referenceDecision('task-capability', bindings.capability);
  return { scope, capability, eligible: scope.decision === 'serves' && capability.decision === 'supports',
    limitations: [scope.limitation, capability.limitation].filter((value): value is string => value !== null) };
}
