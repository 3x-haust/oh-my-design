import { readDirectDiscoveryEntry } from './discovery-record.ts';
import { observedNavigationTargets, readSearchCoverage, type ObservedNavigation } from './search-execution.ts';
import { fail, type ReferenceResearch, type ResearchEvidence } from './reference-research-contract.ts';

type DiscoveryRoot = Readonly<{ method: 'executed-search'; targets: readonly string[] }>
  | Readonly<{ method: 'direct-public'; observation: ObservedNavigation }>;
type DiscoveryCoverage = Readonly<{
  lane: 'domain' | 'design'; queries: readonly string[]; searches: readonly ResearchEvidence[];
  sourceUrls: readonly string[]; navigation: readonly ObservedNavigation[]; directRoots: readonly ObservedNavigation[];
}>;

export function readResearchDiscoveryRoots(root: string, lane: Pick<ReferenceResearch['domainReference'], 'discoveryRoots'>): readonly ObservedNavigation[] {
  return (lane.discoveryRoots ?? []).map(({ reason: _reason, ...receipt }) => readDirectDiscoveryEntry(root, receipt));
}

function targets(origin: DiscoveryRoot): readonly string[] {
  switch (origin.method) {
    case 'executed-search': return origin.targets;
    case 'direct-public': return origin.observation.links.filter(link => link !== origin.observation.url && link !== origin.observation.finalUrl);
    default: return assertNever(origin);
  }
}
function assertNever(value: never): never { return fail(`REFERENCE_DISCOVERY_COVERAGE_VARIANT: ${String(value)}`); }

export function validateDiscoveryCoverage(root: string, coverage: DiscoveryCoverage): void {
  const search = readSearchCoverage(root, { lane: coverage.lane, queries: coverage.queries, receipts: coverage.searches });
  const origins: readonly DiscoveryRoot[] = [{ method: 'executed-search', targets: search.targets },
    ...coverage.directRoots.map(observation => ({ method: 'direct-public' as const, observation }))];
  const reached = observedNavigationTargets(origins.flatMap(targets), coverage.navigation);
  for (const source of coverage.sourceUrls) if (!reached.has(source)) {
    fail(`REFERENCE_DISCOVERY: retained source was not an observed search/direct-entry link or strict captured navigation descendant: ${source}; capture every intermediate hop`);
  }
}
