import type { DiscoveryBatchItem } from './discovery-batch.ts';
import { readCurrentReferenceDiscoveryEvidence, type LaneEvidence } from './discovery-evidence.ts';
import type { ReferenceDiscoveryPlan } from './discovery-plan.ts';
import { isMarketQualifiedQuery } from './market-reference.ts';
import type { SearchExecution } from './search-execution.ts';

type Lane = 'domain' | 'design';
type SearchInput = Readonly<{ lane: Lane; query: string; url: string; queryParam: 'q' }>;

export function expandedDiscoveryInputs(plan: ReferenceDiscoveryPlan, lane: Lane): readonly SearchInput[] {
  const patternQueries = (plan.lanes.find(item => item.id === 'design-reference')?.querySeeds ?? [])
    .filter(query => !plan.designSourcePolicy.nativeSearchInputs.some(input => input.query === query));
  const patternSearches = patternQueries.flatMap(query =>
    ['site:pinterest.com/pin/', 'site:dribbble.com/shots/', 'site:behance.net/gallery/'].map(site => `${site} ${query}`));
  const seeds = lane === 'domain'
    ? plan.lanes.find(item => item.id === 'domain-reference')?.querySeeds ?? []
    : [...patternSearches, ...plan.designSourcePolicy.searchQueries];
  const labels = plan.marketReferencePolicy.marketSearchLabels;
  const queries = [...new Set(seeds.map(seed => labels.length > 0 && !isMarketQualifiedQuery(seed, labels)
    ? `${labels[0]} ${seed}` : seed))].slice(0, 6);
  return queries.flatMap(query => ['https://www.google.com/search', 'https://www.bing.com/search'].map(endpoint => {
    const url = new URL(endpoint);
    url.searchParams.set('q', query);
    return { lane, query, url: url.href, queryParam: 'q' as const };
  }));
}

function searchIdentity(input: Pick<SearchExecution, 'query' | 'requestedUrl'>): string {
  const url = new URL(input.requestedUrl);
  return `${url.origin}${url.pathname}:${input.query.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()}`;
}
function navigationIdentity(source: string): string {
  const url = new URL(source);
  url.pathname = url.pathname.replace(/%[0-9a-f]{2}/giu, escape => {
    const character = String.fromCharCode(Number.parseInt(escape.slice(1), 16));
    return /^[a-z0-9._~-]$/iu.test(character) ? character : escape.toUpperCase();
  });
  for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|gclid$|fbclid$)/u.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
function attemptedNavigation(evidence: LaneEvidence): Set<string> {
  return new Set([...evidence.entries, ...evidence.visits].flatMap(item =>
    [item.observation.url, item.observation.finalUrl]).concat(evidence.unavailable.map(item => item.source))
    .map(navigationIdentity));
}

export function requireNovelRecoveryBatch(root: string, items: readonly DiscoveryBatchItem[]): void {
  const evidence = readCurrentReferenceDiscoveryEvidence(root);
  const searches = { domain: new Set(evidence.domain.searches.map(searchIdentity)),
    design: new Set(evidence.design.searches.map(searchIdentity)) };
  const visits = { domain: attemptedNavigation(evidence.domain), design: attemptedNavigation(evidence.design) };
  for (const item of items) {
    const lane = item.kind === 'search' ? item.input.lane : item.lane;
    const identity = item.kind === 'search'
      ? searchIdentity({ query: item.input.query, requestedUrl: item.input.url }) : navigationIdentity(item.source);
    const attempted = item.kind === 'search' ? searches[lane] : visits[lane];
    if (attempted.has(identity)) {
      throw new Error(`REFERENCE_RECOVERY_REPEATED_REQUEST: ${lane} ${item.kind === 'search' ? item.input.url : item.source}; use a new task/pattern query, another public provider, or a newly observed destination. Identical retry is not recovery.`);
    }
    attempted.add(identity);
  }
}
