import { resolve } from 'node:path';
import type { RouteRecord } from '../route/index.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { canonicalJson, sha256 } from './board-artifacts.ts';
import { inspectDesignReferenceAdmission } from './design-admission.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';
import { currentReferenceEvidenceAfter, readCurrentReferenceDiscoveryEvidence, type DiscoveryAttempt, type LaneEvidence } from './discovery-evidence.ts';
import { readReferenceDiscoveryExclusions, type ReferenceDiscoveryExclusionRecord } from './discovery-exclusion.ts';
import { designDiscoveryProvider, referenceServiceFamily } from './design-discovery-sources.ts';
import { buildReferenceDiscoveryPlan, type ReferenceDiscoveryPlan } from './discovery-plan.ts';
import { searchObserved, type SearchExecution } from './search-execution.ts';
import { actionableSearchTargets, observedSearchTargets } from './search-result.ts';
import { loadRefs } from './store.ts';

type Lane = 'domain' | 'design';
type SearchInput = ReferenceDiscoveryPlan['marketReferencePolicy']['domainSearchInputs'][number]
  | ReferenceDiscoveryPlan['designSourcePolicy']['nativeSearchInputs'][number];
export type ReferenceDiscoveryAction = Readonly<{
  kind: 'search' | 'direct-entry' | 'follow-link' | 'retain-reference' | 'publish-board';
  lane: Lane | null;
  args: readonly string[];
  reason: string;
  input?: SearchInput;
  url?: string;
  entry?: 'free-gallery' | 'public-directory';
}>;
export type ReferenceDiscoveryWork = Readonly<{
  schema: 'reference-discovery-work-v1';
  status: 'action' | 'ready' | 'exhausted';
  action: ReferenceDiscoveryAction | null;
  next: string;
  instruction: string;
  workSha256: string;
  code: 'REFERENCE_DISCOVERY_EXHAUSTED' | 'REFERENCE_DISCOVERY_NO_ACCEPTED_SOURCE' | null;
  attempts: readonly DiscoveryAttempt[];
  exclusions: readonly ReferenceDiscoveryExclusionRecord[];
  progress: Readonly<{ domainFamilies: number; designFamilies: number; searches: number; entries: number;
    visits: number; unavailable: number; ignored: number }>;
}>;
function nativeAction(kind: 'search' | 'direct-entry' | 'follow-link', lane: Lane,
  reason: string, details: Readonly<{ input?: SearchInput; url?: string;
    entry?: 'free-gallery' | 'public-directory' }>): ReferenceDiscoveryAction {
  return { kind, lane, args: ['ref', 'advance', '--json'], reason, ...details };
}
function publicCandidate(value: string): boolean {
  try { return publicDiscoveryUrl(value) === value; }
  catch (error) { if (error instanceof Error) return false; throw error; }
}
function domainCandidate(value: string): boolean {
  return publicCandidate(value) && !/^(?:www\.)?(?:facebook\.com|instagram\.com|youtube\.com|linkedin\.com|twitter\.com|x\.com)$/u
    .test(new URL(value).hostname.toLowerCase());
}
function domainSearchResults(search: SearchExecution, plan: ReferenceDiscoveryPlan): readonly string[] {
  const labels = new Map((search.results ?? []).flatMap(result =>
    observedSearchTargets({ links: [result.url] }).map(url => [url, result.text] as const)));
  const knownFamilies = new Set(plan.marketReferencePolicy.domainEntryInputs.map(item => referenceServiceFamily(item.url)));
  return actionableSearchTargets(search, knownFamilies).filter(url => {
    if (!publicCandidate(url)) return false;
    const host = new URL(url).hostname.toLowerCase();
    return host !== search.provider && !host.endsWith(`.${search.provider}`)
      && !/^(?:search\.daum\.net|logins\.daum\.net|www\.google\.com|www\.bing\.com|duckduckgo\.com|map\.kakao\.com)$/u.test(host);
  }).sort((left, right) => {
    const score = (url: string) => Number(new URL(url).hostname.endsWith('.kr')) * 2
      + Number(/[가-힣]/u.test(labels.get(url) ?? ''));
    return score(right) - score(left);
  });
}
function pendingMarketSearch(lane: Lane, plan: ReferenceDiscoveryPlan, evidence: LaneEvidence): SearchInput | undefined {
  if (plan.marketReferencePolicy.marketRegion === null || (evidence.searches.length === 0 && evidence.entries.length > 0)) return undefined;
  const inputs = lane === 'domain' ? plan.marketReferencePolicy.domainSearchInputs
    : plan.designSourcePolicy.nativeSearchInputs;
  return inputs.find(input => !evidence.searches.some(search => search.query === input.query));
}
function nextLaneAction(lane: Lane, plan: ReferenceDiscoveryPlan, evidence: LaneEvidence,
  retainedFamilies: ReadonlySet<string>, excludedUrls: ReadonlySet<string>,
  requiredSearch: SearchInput | undefined): ReferenceDiscoveryAction | null {
  if (requiredSearch !== undefined && retainedFamilies.size >= (lane === 'domain' ? 3 : 2)) {
    return nativeAction('search', lane, 'Complete the exact target-market searches already required by this research lane.',
      { input: requiredSearch });
  }
  const failedUrls = new Set(evidence.unavailable.map(item => item.source));
  const visited = new Set([...evidence.visits, ...evidence.entries].flatMap(item =>
    [item.observation.url, item.observation.finalUrl]));
  const rootTargets = [...new Set([...evidence.searches.filter(searchObserved).flatMap(search => lane === 'domain'
    ? domainSearchResults(search, plan) : actionableSearchTargets(search).filter(publicCandidate)),
    ...evidence.entries.flatMap(item => item.observation.links.filter(url => lane === 'domain'
      ? domainCandidate(url) : publicCandidate(url) && designDiscoveryProvider(url) !== null))])];
  const rootSet = new Set(rootTargets);
  const descendantTargets = evidence.visits.filter(item => rootSet.has(item.observation.url))
    .flatMap(item => item.observation.links.filter(url => lane === 'domain'
      ? domainCandidate(url) && referenceServiceFamily(url) !== referenceServiceFamily(item.observation.url)
      : domainCandidate(url) && designDiscoveryProvider(item.observation.url) !== null
        && referenceServiceFamily(url) !== referenceServiceFamily(item.observation.url)));
  const originals = new Set(lane === 'design' ? descendantTargets : []);
  const descendants = new Set(descendantTargets);
  const targets = [...new Set([...rootTargets, ...descendantTargets])]
    .filter(url => {
      try {
        if (excludedUrls.has(url) || !publicCandidate(url)) return false;
        const family = referenceServiceFamily(url);
        return lane === 'design' ? designDiscoveryProvider(url) !== null || originals.has(url)
          : !retainedFamilies.has(family) && designDiscoveryProvider(url) === null;
      } catch { return false; }
    });
  const inspectedVisits = [...evidence.visits].reverse().filter(item => targets.includes(item.observation.url)
    && !excludedUrls.has(item.observation.url)
    && !retainedFamilies.has(referenceServiceFamily(item.observation.url)));
  const inspectedDescendant = inspectedVisits.find(item => descendants.has(item.observation.url));
  const inspected = inspectedDescendant ?? inspectedVisits[0];
  const freshDescendant = descendantTargets.find(url => targets.includes(url) && !visited.has(url) && !failedUrls.has(url));
  if (freshDescendant !== undefined && inspectedDescendant === undefined) {
    return nativeAction('follow-link', lane, 'Inspect the original observed from a captured reference item before retaining its wrapper.',
      { url: freshDescendant });
  }
  const freshTarget = targets.find(url => !visited.has(url) && !failedUrls.has(url));
  if (freshTarget !== undefined && (inspected === undefined || evidence.visits.length < 2)) {
    return nativeAction('follow-link', lane, 'Inspect an observed concrete source before retaining it.', { url: freshTarget });
  }
  if (inspected !== undefined) return { kind: 'retain-reference', lane, args: [], url: inspected.observation.url,
    reason: 'Review the captured source and retain a useful scoped UI or task state with omd ref add. If unusable, run omd ref exclude <observed-url> --lane <lane> --reason <specific-quality-judgment>; navigation alone is not a reference.' };
  const inputs = lane === 'domain' ? plan.marketReferencePolicy.domainSearchInputs.length > 0
    ? plan.marketReferencePolicy.domainSearchInputs
    : ((plan.lanes.find(item => item.id === 'domain-reference')?.querySeeds.length ?? 0) > 0
      ? plan.lanes.find(item => item.id === 'domain-reference')?.querySeeds ?? [] : [plan.task]).slice(0, 4)
      .flatMap(query => ['https://www.bing.com/search', 'https://duckduckgo.com/', 'https://www.google.com/search'].map(endpoint => {
        const url = new URL(endpoint);
        url.searchParams.set('q', query);
        return { lane: 'domain' as const, query, url: url.href, queryParam: 'q' as const };
      }))
    : plan.designSourcePolicy.nativeSearchInputs;
  const nextSearch = inputs.find(input => !evidence.searches.some(item => item.requestedUrl === input.url));
  if (nextSearch !== undefined) return nativeAction('search', lane,
    'Run the next target-market public search; the query alone is not evidence.', { input: nextSearch });
  const entryInputs = lane === 'design' ? plan.designSourcePolicy.nativeEntryInputs
    : plan.marketReferencePolicy.domainEntryInputs;
  const nextEntry = entryInputs.find(item =>
    !evidence.entries.some(entry => entry.observation.url === item.url)
    && !evidence.unavailable.some(attempt => attempt.source === item.url && attempt.entry === item.entry));
  if (nextEntry !== undefined) return nativeAction('direct-entry', lane,
    lane === 'design' ? 'Open the next free public design gallery; retain only a concrete observed item.'
      : 'Open the next target-market service directly when search lacks a usable result; inspect its real task links.',
    { url: nextEntry.url, entry: nextEntry.entry });
  return null;
}

export function referenceDiscoveryWork(root: string, route: RouteRecord): ReferenceDiscoveryWork {
  const plan = buildReferenceDiscoveryPlan(root, route);
  const { domain, design } = readCurrentReferenceDiscoveryEvidence(root);
  const evidenceAfter = currentReferenceEvidenceAfter(root);
  const exclusions = readReferenceDiscoveryExclusions(root, route.sourceContractSha256);
  const allRefs = loadRefs(root, { includeDomain: true });
  const refs = allRefs.filter(ref => {
    const capturedAt = Date.parse(ref.capturedAt);
    if (!Number.isFinite(capturedAt) || capturedAt < evidenceAfter || capturedAt > Date.now() + 5 * 60 * 1000
      || !ref.imagePath || !ref.acquisition || ref.acquisition.requestedUrl !== ref.source
      || ref.acquisition.httpStatus !== 200 || !ref.acquisition.imageSha256) return false;
    try {
      const image = readStableProjectFile({ root: resolve(root), path: resolve(root, ref.imagePath),
        label: ref.imagePath, fs: nodeStableProjectFileSystem() });
      return sha256(image) === ref.acquisition.imageSha256;
    } catch (error) { if (error instanceof Error) return false; throw error; }
  });
  const korean = plan.marketReferencePolicy.marketRegion === 'KR';
  const admittedDomain = refs.filter(ref => ref.researchLane === 'domain'
    && (!korean || ref.visibleKoreanText === true));
  const admittedDesign = refs.filter(ref => ref.researchLane === 'design'
    && inspectDesignReferenceAdmission(root, ref, { references: refs }).eligible);
  const domainFamilies = new Set(admittedDomain.map(ref => referenceServiceFamily(ref.source)));
  const designFamilies = new Set(admittedDesign.map(ref => referenceServiceFamily(ref.source)));
  const domainSearch = pendingMarketSearch('domain', plan, domain);
  const designSearch = pendingMarketSearch('design', plan, design);
  const lane = domainFamilies.size < 3 || domainSearch !== undefined ? 'domain'
    : designFamilies.size < 2 || designSearch !== undefined ? 'design' : null;
  const action = lane === null ? { kind: 'publish-board', lane: null, args: [],
    reason: 'Interpret retained domain flows and design UI parts, then publish the candidate assembly with omd ref board.' } as const
    : nextLaneAction(lane, plan, lane === 'domain' ? domain : design,
      lane === 'domain' ? domainFamilies : designFamilies,
      new Set(exclusions.filter(item => item.decision.researchLane === lane).map(item => item.decision.source)),
      lane === 'domain' ? domainSearch : designSearch);
  const status = lane === null ? 'ready' : action === null ? 'exhausted' : 'action';
  const progress = { domainFamilies: domainFamilies.size, designFamilies: designFamilies.size,
    searches: domain.searches.length + design.searches.length, entries: domain.entries.length + design.entries.length,
    visits: domain.visits.length + design.visits.length, unavailable: domain.unavailable.length + design.unavailable.length,
    ignored: domain.ignored + design.ignored };
  const attempts = [...domain.failures, ...design.failures];
  const next = status === 'ready' ? 'omd ref board --input <candidate-assemblies.json>' : status === 'exhausted'
    ? exclusions.length > 0 ? 'REFERENCE_DISCOVERY_NO_ACCEPTED_SOURCE' : 'REFERENCE_DISCOVERY_EXHAUSTED'
    : action?.args.length ? `omd ${action.args.join(' ')}`
      : `omd ref add ${action?.url ?? '<observed-source>'} --lane ${lane ?? 'design'} --selector <observed-ui-selector> --shot OR omd ref exclude ${action?.url ?? '<observed-source>'} --lane ${lane ?? 'design'} --reason <specific-quality-judgment>`;
  const instruction = status === 'ready' ? 'Read omd schema reference-board once, author the board from useful retained evidence, then publish it with the named CLI publisher.'
    : status === 'exhausted' ? 'No plan-derived public acquisition lead remains. Inspect work.attempts for native outcomes and work.exclusions for authored quality decisions; add a reachable qualified source before board publication.'
      : action?.reason ?? '';
  return { schema: 'reference-discovery-work-v1', status, action, next, instruction,
    code: status === 'exhausted' ? exclusions.length > 0
      ? 'REFERENCE_DISCOVERY_NO_ACCEPTED_SOURCE' : 'REFERENCE_DISCOVERY_EXHAUSTED' : null,
    attempts, exclusions,
    workSha256: sha256(canonicalJson({ sourceContractSha256: route.sourceContractSha256, status, action,
      evidence: [...domain.digests, ...design.digests],
      exclusions: exclusions.map(item => item.receipt.sha256),
      retained: [...admittedDomain, ...admittedDesign].map(ref => [ref.researchLane, ref.source, ref.component]) })),
    progress };
}
