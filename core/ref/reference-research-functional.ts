import { referenceServiceFamily } from './design-discovery-sources.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDomainBrief } from '../domain/domain-brief.ts';
import { selfRootTaskClaim } from './market-task-claim.ts';
import { inferredKoreanReferenceMarket } from './market-reference.ts';
import { readDomainObservation } from './domain-observation.ts';
import { readSearchExecution, searchObserved } from './search-execution.ts';
import { resultReaches } from './search-result.ts';
import type { FunctionalCitation, FunctionalSource, ReferenceResearch, ValidationOptions } from './reference-research-types.ts';

const fail = (code: string): never => { throw new Error(code); };
const collapse = (text: string): string => text.replace(/\s+/gu, ' ').trim();

export function validateFunctionalResearch(root: string, research: ReferenceResearch, options: ValidationOptions): void {
  if (research.schema !== 'reference-research-v8') return;
  const sources = research.domainReference.sources as readonly FunctionalSource[];
  const families = new Set<string>();
  const market = research.marketCoverage;
  const localIds = new Set(market?.domain.localSources.map(item => item.sourceId) ?? []);
  const taskCategory = market ? validateDomainBrief(JSON.parse(readFileSync(join(root, '.omd/domain-brief.json'), 'utf8'))).domain : null;
  if (market?.marketRegion === 'KR' && localIds.size < 3) fail('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_DIVERSITY');
  for (const source of sources) {
    const observations = source.observations.map(receipt => readDomainObservation(root, receipt));
    const marketObservation = observations.find(item => item.capture.sha256 === source.marketObservationSha256 && item.url === source.url);
    if (!marketObservation) throw new Error('REFERENCE_DOMAIN_OBSERVATION_REQUIRED: market observation must bind the service URL');
    const family = referenceServiceFamily(marketObservation.finalUrl);
    families.add(family);
    if (marketObservation.method === 'navigation') {
      const reachable = research.domainReference.searches.some(receipt => {
        const search = readSearchExecution(root, receipt, 'domain');
        return searchObserved(search) && search.results?.some(item => resultReaches(item, [source.url]));
      });
      if (!reachable) fail('REFERENCE_DOMAIN_OBSERVATION_REQUIRED: service navigation must be reached from signed search results');
    }
    if (market?.marketRegion === 'KR' && localIds.has(source.id) && marketObservation.language !== 'korean')
      fail('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_RESULT_SCOPE');
    if (market && localIds.has(source.id) && marketObservation.method === 'direct-public'
      && taskCategory && !selfRootTaskClaim(taskCategory, marketObservation.taskText ?? ''))
      fail('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_RESULT_SCOPE');
    if (market?.marketRegion === 'KR' && localIds.has(source.id)
      && /(?:^|\.)(?:gov|nhs)(?:\.[a-z]{2})?$/u.test(new URL(marketObservation.finalUrl).hostname)
      && !new URL(marketObservation.finalUrl).hostname.endsWith('.kr')) fail('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_RESULT_SCOPE');
    for (const observation of observations) {
      if (referenceServiceFamily(observation.finalUrl) !== family) fail('REFERENCE_DOMAIN_OBSERVATION_REQUIRED: unrelated service observation');
      if (observation.url !== source.url && !observations.some(parent => parent.links.includes(observation.url)))
        fail('REFERENCE_DOMAIN_OBSERVATION_REQUIRED: unlinked page observation');
    }
    const quote = (citation: FunctionalCitation): string => {
      const observation = observations.find(item => item.capture.sha256 === citation.observationSha256);
      if (!observation) throw new Error('REFERENCE_DOMAIN_CITATION_MISMATCH: observation not listed');
      if (citation.field === 'linkLabels') {
        const label = observation.linkLabels?.find(item => item.url === citation.linkUrl && collapse(item.text).includes(collapse(citation.quote)));
        if (!label) throw new Error('REFERENCE_DOMAIN_CITATION_MISMATCH: link URL and label differ');
        return label.text;
      }
      if (citation.linkUrl !== null) fail('REFERENCE_DOMAIN_CITATION_MISMATCH: text citation cannot bind a link');
      const text = citation.field === 'taskText' ? observation.taskText ?? '' : observation.observedText ?? '';
      if (!collapse(text).includes(collapse(citation.quote))) fail('REFERENCE_DOMAIN_CITATION_MISMATCH: quote absent from signed visible text');
      return text;
    };
    const ids = new Set(source.features.map(feature => feature.id));
    for (const feature of source.features) {
      const texts = feature.evidence.map(quote);
      if (!texts.some(text => collapse(text).includes(collapse(feature.observedLabel))))
        fail('REFERENCE_DOMAIN_FEATURE_EVIDENCE_REQUIRED: observed label is not grounded in cited text');
    }
    for (const comparison of [...source.similarities, ...source.differences]) {
      if (!options.expectedRequest || !collapse(options.expectedRequest).includes(collapse(comparison.requestQuote)))
        fail('REFERENCE_DOMAIN_COMPARISON_REQUEST_MISMATCH');
      if (comparison.featureIds.some(id => !ids.has(id))) fail('REFERENCE_DOMAIN_FEATURE_EVIDENCE_REQUIRED: unknown feature');
    }
    for (const decision of [...source.adopt, ...source.avoid]) {
      if (decision.featureIds.some(id => !ids.has(id))) fail('REFERENCE_DOMAIN_FEATURE_EVIDENCE_REQUIRED: unknown feature');
    }
    if (market) {
      const local = market.domain.localSources.find(item => item.sourceId === source.id);
      if (local && local.evidenceSha256 !== source.marketObservationSha256) fail('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_EVIDENCE');
      if (local) {
        const search = research.domainReference.searches.find(item => item.sha256 === local.provenanceReceiptSha256);
        if (search) {
          const execution = readSearchExecution(root, search, 'domain');
          const result = execution.results?.find(item => resultReaches(item, [source.url]));
          if (!searchObserved(execution) || !result) throw new Error('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_PROVENANCE');
          if (market.marketRegion === 'KR' && inferredKoreanReferenceMarket(result.text) !== 'KR'
            && !/복지|혜택|지원|신청|서비스/u.test(result.text))
            fail('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_RESULT_SCOPE');
        } else if (local.provenanceReceiptSha256 !== marketObservation.capture.sha256 || marketObservation.method !== 'direct-public')
          fail('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_PROVENANCE');
      }
    }
  }
  if (families.size < 3) fail('REFERENCE_RESEARCH_DOMAIN_SOURCE_DIVERSITY');
  if (market?.domain.globalFallback) {
    const fallback = market.domain.globalFallback;
    if (fallback.gap.attemptedQueries.length !== research.domainReference.searches.length
      || fallback.gap.attemptedQueries.some((query, index) =>
        readSearchExecution(root, research.domainReference.searches[index]!, 'domain').query !== query))
      fail('REFERENCE_RESEARCH_MARKET_DOMAIN_FALLBACK_ATTEMPTS');
    for (const binding of fallback.provenance) {
      const source = sources.find(item => item.id === binding.sourceId);
      if (!source) throw new Error('REFERENCE_RESEARCH_MARKET_DOMAIN_FALLBACK_PROVENANCE');
      const receipt = research.domainReference.searches.find(item => item.sha256 === binding.provenanceReceiptSha256);
      if (receipt) {
        const execution = readSearchExecution(root, receipt, 'domain');
        if (!searchObserved(execution) || !execution.results?.some(result => resultReaches(result, [source.url])))
          fail('REFERENCE_RESEARCH_MARKET_DOMAIN_FALLBACK_PROVENANCE');
      } else if (!source.observations.some(item => item.capture.sha256 === binding.provenanceReceiptSha256
        && readDomainObservation(root, item).method === 'direct-public')) fail('REFERENCE_RESEARCH_MARKET_DOMAIN_FALLBACK_PROVENANCE');
    }
  }
  if (market?.marketRegion === 'KR' && new Set(sources.filter(item => localIds.has(item.id))
    .map(item => referenceServiceFamily(readDomainObservation(root, item.observations.find(obs => obs.capture.sha256 === item.marketObservationSha256)!).finalUrl))).size < 3)
    fail('REFERENCE_RESEARCH_MARKET_DOMAIN_LOCAL_DIVERSITY');
}
