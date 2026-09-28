import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { browserProfilePath } from './browser-consent.ts';
import { readBrowserConsent, readUserBrowserConsent } from './browser-consent.ts';
import type { RouteRecord } from '../route/index.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { canonicalJson, sha256 } from './board-artifacts.ts';
import { inspectDesignReferenceAdmission } from './design-admission.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';
import { readDomainObservation } from './domain-observation.ts';
import { currentReferenceEvidenceAfter, readCurrentReferenceDiscoveryEvidence, type DiscoveryAttempt, type LaneEvidence } from './discovery-evidence.ts';
import { readReferenceDiscoveryExclusions, type ReferenceDiscoveryExclusionRecord } from './discovery-exclusion.ts';
import { designDiscoveryProvider, referenceServiceFamily } from './design-discovery-sources.ts';
import { buildReferenceDiscoveryPlan, type ReferenceDiscoveryPlan } from './discovery-plan.ts';
import { expandedDiscoveryInputs } from './discovery-recovery.ts';
import { fetchSearchLeads } from './search-leads.ts';
import { discoveryProvider, providerCircuitSummaries, type ProviderCircuitSummary } from './provider-circuit.ts';
import { searchObserved, type SearchExecution } from './search-execution.ts';
import { actionableSearchTargets, observedSearchTargets } from './search-result.ts';
import { loadRefs } from './store.ts';
import { userBrowserAcquisition } from './user-browser-provenance.ts';

type Lane = 'domain' | 'design';
type SearchInput = ReferenceDiscoveryPlan['marketReferencePolicy']['domainSearchInputs'][number]
  | ReferenceDiscoveryPlan['designSourcePolicy']['nativeSearchInputs'][number];
export type ReferenceDiscoveryAction = Readonly<{
  kind: 'browser-consent' | 'search' | 'collect-leads' | 'direct-entry' | 'follow-link' | 'retain-reference' | 'publish-board' | 'replan-discovery';
  lane: Lane | null;
  args: readonly string[];
  reason: string;
  input?: SearchInput;
  engine?: 'user-browser' | 'omd-profile' | 'bing';
  question?: string;
  answers?: Readonly<Record<string, string>>;
  url?: string;
  entry?: 'free-gallery' | 'public-directory';
  selector?: string;
}>;
export type ReferenceDiscoveryWork = Readonly<{
  schema: 'reference-discovery-work-v1';
  status: 'action' | 'ready' | 'exhausted';
  action: ReferenceDiscoveryAction | null;
  next: string;
  instruction: string;
  workSha256: string;
  materialProgressIdentities: readonly string[];
  circuits: readonly ProviderCircuitSummary[];
  code: 'REFERENCE_DISCOVERY_EXHAUSTED' | 'REFERENCE_DISCOVERY_NO_ACCEPTED_SOURCE' | null;
  attempts: readonly DiscoveryAttempt[];
  exclusions: readonly ReferenceDiscoveryExclusionRecord[];
  progress: Readonly<{ domainFamilies: number; designFamilies: number; searches: number; entries: number;
    visits: number; unavailable: number; ignored: number }>;
}>;
export function materialReferenceProgressIdentities(root: string, route: RouteRecord): readonly string[] {
  return referenceDiscoveryWork(root, route).materialProgressIdentities;
}
function nativeAction(kind: 'search' | 'collect-leads' | 'direct-entry' | 'follow-link', lane: Lane,
  reason: string, details: Readonly<{ input?: SearchInput; url?: string;
    entry?: 'free-gallery' | 'public-directory' }>): ReferenceDiscoveryAction {
  return { kind, lane, args: ['ref', 'advance', '--json'], reason, ...details };
}
export const BROWSER_CONSENT_QUESTION = '레퍼런스 검색 전에 브라우저 사용 방식을 선택해 주세요. 로그인된 평소 브라우저에서는 방문 페이지의 네트워크 요청을 OMD가 격리할 수 없어요. 평소 쓰는 브라우저 그대로 쓰기 / OMD 전용 로그인 브라우저 / 이번엔 건너뛰기 / 다시 묻지 않기 중 무엇을 원하시나요?';
function searchAction(lane: Lane, input: SearchInput, evidence: LaneEvidence): ReferenceDiscoveryAction {
  const failed = evidence.searches.filter(item => item.query === input.query && !searchObserved(item));
  const google = new URL('https://www.google.com/search'); google.searchParams.set('q', input.query);
  const googleInput = { lane, query: input.query, url: google.href, queryParam: 'q' as const };
  if (readUserBrowserConsent() === 'consented' && !failed.some(item => item.provider === 'www.google.com' && item.error?.startsWith('user-browser:')))
    return { kind: 'search', lane, engine: 'user-browser', args: ['ref', 'advance', '--json'], input: googleInput,
      reason: 'Search Google in the consented everyday browser; an observed challenge requires human handoff.' };
  if (readBrowserConsent() === 'consented' && existsSync(browserProfilePath())
    && !failed.some(item => item.provider === 'www.google.com' && !item.error?.startsWith('user-browser:')))
    return { kind: 'search', lane, engine: 'omd-profile', args: ['ref', 'advance', '--json'], input: googleInput,
      reason: 'Search Google in the consented OMD login browser; hand off any challenge to the user.' };
  if (process.env.OMD_HOST_WEB_SEARCH_AVAILABLE === '1') return { kind: 'collect-leads', lane, args: [], input: googleInput,
    reason: 'Use the available host web search tool and register actual URLs with omd ref leads add; leads are not destination evidence.' };
  return { kind: 'collect-leads', lane, args: ['ref', 'leads', 'search', '--input', '.omd/.cache/reference-lead-query.json', '--json'], input: googleInput,
    reason: 'No host web search is available. Write {lane,query} from this input to .omd/.cache/reference-lead-query.json and run omd ref leads search --input .omd/.cache/reference-lead-query.json --json (DuckDuckGo HTML); if unavailable, try Bing last.' };
}
function publicCandidate(value: string): boolean {
  try { return publicDiscoveryUrl(value) === value; }
  catch (error) { if (error instanceof Error) return false; throw error; }
}
function domainCandidate(value: string): boolean {
  return publicCandidate(value) && !/^(?:www\.)?(?:facebook\.com|instagram\.com|youtube\.com|linkedin\.com|twitter\.com|x\.com)$/u
    .test(new URL(value).hostname.toLowerCase());
}
function domainSearchResults(search: SearchExecution, allowUnmatched: boolean): readonly string[] {
  const labels = new Map((search.results ?? []).flatMap(result =>
    observedSearchTargets({ links: [result.url] }).map(url => [url, result.text] as const)));
  return actionableSearchTargets({ ...search, allowUnmatched }).filter(url => {
    if (!publicCandidate(url)) return false;
    const host = new URL(url).hostname.toLowerCase();
    const label = labels.get(url) ?? '';
    if (/(?:^|\.)(?:namu\.wiki|wikipedia\.org)$/u.test(host)
      || /나무위키|위키|조회 방법|신청 방법|정책정보|공지사항/iu.test(label)
      || /\/gvrnPolicy\//iu.test(new URL(url).pathname)) return false;
    return host !== search.provider && !host.endsWith(`.${search.provider}`)
      && !/^(?:search\.daum\.net|logins\.daum\.net|www\.google\.com|www\.bing\.com|duckduckgo\.com|map\.kakao\.com)$/u.test(host);
  }).sort((left, right) => {
    const score = (url: string) => Number(/[가-힣]/u.test(labels.get(url) ?? ''));
    return score(right) - score(left);
  });
}
function queryAlreadySearched(searches: LaneEvidence['searches'], query: string): boolean {
  const browserConsent = readUserBrowserConsent() === 'consented' || readBrowserConsent() === 'consented';
  return searches.some(search => search.query === query && (searchObserved(search) || !browserConsent));
}
function pendingMarketSearch(lane: Lane, plan: ReferenceDiscoveryPlan, evidence: LaneEvidence, leadQueries: ReadonlySet<string>): SearchInput | undefined {
  if (plan.marketReferencePolicy.marketRegion === null || (evidence.searches.length === 0 && evidence.entries.length > 0)) return undefined;
  const inputs = lane === 'domain' ? plan.marketReferencePolicy.domainSearchInputs
    : plan.designSourcePolicy.nativeSearchInputs;
  return inputs.find(input => !leadQueries.has(input.query) && !queryAlreadySearched(evidence.searches, input.query));
}
function nextLaneAction(lane: Lane, plan: ReferenceDiscoveryPlan, evidence: LaneEvidence,
  retainedFamilies: ReadonlySet<string>, excludedUrls: ReadonlySet<string>,
  requiredSearch: SearchInput | undefined, leadUrls: readonly string[], leadQueries: ReadonlySet<string>,
  openProviders: ReadonlySet<string>): ReferenceDiscoveryAction | null {
  if (requiredSearch !== undefined && retainedFamilies.size >= (lane === 'domain' ? 3 : 2)) {
    return searchAction(lane, requiredSearch, evidence);
  }
  const failedUrls = new Set(evidence.unavailable.map(item => item.source));
  const excludedFamilies = new Map<string, Set<string>>();
  for (const url of excludedUrls) {
    const family = referenceServiceFamily(url);
    const urls = excludedFamilies.get(family) ?? new Set<string>();
    urls.add(url);
    excludedFamilies.set(family, urls);
  }
  const visited = new Set([...evidence.visits, ...evidence.entries].flatMap(item =>
    [item.observation.url, item.observation.finalUrl]));
  const rootTargets = [...new Set([...leadUrls.filter(url => lane === 'domain' ? domainCandidate(url) : publicCandidate(url)), ...evidence.searches.filter(searchObserved).flatMap(search => lane === 'domain'
    ? domainSearchResults(search, plan.marketReferencePolicy.marketRegion === null)
    : actionableSearchTargets(search).filter(publicCandidate)),
    ...evidence.entries.flatMap(item => item.observation.links.filter(url => lane === 'domain'
      ? domainCandidate(url) : publicCandidate(url) && designDiscoveryProvider(url) !== null))])];
  const rootSet = new Set(lane === 'domain'
    ? evidence.entries.map(item => item.observation.url) : rootTargets);
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
        if (excludedUrls.has(url) || !publicCandidate(url) || (lane === 'design' && openProviders.has(discoveryProvider(url) ?? ''))) return false;
        const family = referenceServiceFamily(url);
        if (lane === 'domain' && (excludedFamilies.get(family)?.size ?? 0) >= 2) return false;
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
  if (lane === 'design' && inspected?.observation.imageCandidates?.length && designDiscoveryProvider(inspected.observation.url) !== null)
    return { kind: 'retain-reference', lane, args: [], url: inspected.observation.url,
      selector: inspected.observation.imageCandidates[0]!.selector,
      reason: 'Inspect the signed gallery image candidates and choose one useful UI image before following an original; the suggestion is not an automatic visual choice.' };
  if (freshDescendant !== undefined && inspectedDescendant === undefined) {
    return nativeAction('follow-link', lane, 'Inspect the original observed from a captured reference item before retaining its wrapper.',
      { url: freshDescendant });
  }
  const freshTarget = targets.find(url => !visited.has(url) && !failedUrls.has(url));
  if (freshTarget !== undefined && (inspected === undefined || evidence.visits.length < 2)) {
    return nativeAction('follow-link', lane, 'Inspect an observed concrete source before retaining it.', { url: freshTarget });
  }
  if (inspected !== undefined && lane === 'design') return { kind: 'retain-reference', lane, args: [], url: inspected.observation.url,
    ...(inspected.observation.imageCandidates?.[0] ? { selector: inspected.observation.imageCandidates[0].selector } : {}),
    reason: 'Inspect the image candidates and choose one exact CSS selector based on the actual UI; the suggested selector is not an automatic visual judgment. If unsuitable, exclude the inspected item.' };
  const inputs = lane === 'domain' ? (plan.marketReferencePolicy.domainSearchInputs.length
    ? plan.marketReferencePolicy.domainSearchInputs
    : ((plan.lanes.find(item => item.id === 'domain-reference')?.querySeeds.length ?? 0) > 0
      ? plan.lanes.find(item => item.id === 'domain-reference')!.querySeeds : [plan.task]).slice(0, 4).map(query => {
      const url = new URL('https://www.google.com/search'); url.searchParams.set('q', query);
      return { lane: 'domain' as const, query, url: url.href, queryParam: 'q' as const };
    })) : plan.designSourcePolicy.nativeSearchInputs;
  const nextSearch = inputs.find(input => !leadQueries.has(input.query) && !queryAlreadySearched(evidence.searches, input.query));
  if (nextSearch !== undefined) return searchAction(lane, nextSearch, evidence);
  const entryInputs = lane === 'design' ? plan.designSourcePolicy.nativeEntryInputs
    : plan.marketReferencePolicy.domainEntryInputs;
  const nextEntry = entryInputs.find(item =>
    (lane !== 'design' || !openProviders.has(discoveryProvider(item.url) ?? '')) && !evidence.entries.some(entry => entry.observation.url === item.url)
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
      || (ref.acquisition.httpStatus !== 200 && !userBrowserAcquisition(ref.acquisition))
      || !ref.acquisition.imageSha256) return false;
    try {
      const image = readStableProjectFile({ root: resolve(root), path: resolve(root, ref.imagePath),
        label: ref.imagePath, fs: nodeStableProjectFileSystem() });
      return sha256(image) === ref.acquisition.imageSha256;
    } catch (error) { if (error instanceof Error) return false; throw error; }
  });
  const korean = plan.marketReferencePolicy.marketRegion === 'KR';
  const admittedDomain = [...domain.visits, ...domain.entries].filter(item => {
    try {
      const observation = readDomainObservation(root, { url: item.observation.url, capture: item.receipt });
      return !korean || observation.language === 'korean';
    } catch { return false; }
  });
  const admittedDesign = refs.filter(ref => ref.researchLane === 'design'
    && inspectDesignReferenceAdmission(root, ref, { references: refs }).eligible);
  const domainFamilies = new Set(admittedDomain.map(item => referenceServiceFamily(item.observation.finalUrl)));
  const designFamilies = new Set(admittedDesign.map(ref => referenceServiceFamily(ref.source)));
  const domainLeads = fetchSearchLeads(root, 'domain', route.sourceContractSha256);
  const designLeads = fetchSearchLeads(root, 'design', route.sourceContractSha256);
  const domainQueries = new Set(domainLeads.map(lead => lead.query));
  const designQueries = new Set(designLeads.map(lead => lead.query));
  const circuits = providerCircuitSummaries(design);
  const openProviders = new Set(circuits.map(item => item.provider));
  const domainSearch = pendingMarketSearch('domain', plan, domain, domainQueries);
  const designSearch = pendingMarketSearch('design', plan, design, designQueries);
  const pending: Lane[] = [];
  if (domainFamilies.size < 3 || domainSearch !== undefined) pending.push('domain');
  if (designFamilies.size < 2 || designSearch !== undefined) pending.push('design');
  let action: ReferenceDiscoveryAction | null = null;
  for (const lane of pending) {
    action = nextLaneAction(lane, plan, lane === 'domain' ? domain : design,
      lane === 'domain' ? domainFamilies : designFamilies,
      new Set(exclusions.filter(item => item.decision.researchLane === lane).map(item => item.decision.source)),
      lane === 'domain' ? domainSearch : designSearch,
      (lane === 'domain' ? domainLeads : designLeads).flatMap(lead => lead.urls),
      lane === 'domain' ? domainQueries : designQueries, openProviders);
    if (action !== null) break;
  }
  if (action === null) for (const lane of pending) {
    const evidence = lane === 'domain' ? domain : design;
    const input = expandedDiscoveryInputs(plan, lane).find(input =>
      !(lane === 'domain' ? domainQueries : designQueries).has(input.query)
      && !queryAlreadySearched(evidence.searches, input.query));
    if (input !== undefined) {
      action = searchAction(lane, input, evidence);
      break;
    }
  }
  if (action !== null && progressHasNoAcquisition(domain, design) && readBrowserConsent() === null && readUserBrowserConsent() === null
    && !process.env.OMD_BROWSER_CDP_URL && !process.env.OMD_BROWSER_STORAGE_STATE && !process.env.OMD_STEALTH_BROWSER_PATH) {
    action = { kind: 'browser-consent', lane: null, args: [], reason: BROWSER_CONSENT_QUESTION,
      question: BROWSER_CONSENT_QUESTION, answers: {
        '평소 쓰는 브라우저 그대로 쓰기': 'omd browser setup --engine user-browser --consent',
        'OMD 전용 로그인 브라우저': 'omd browser setup --engine omd-profile --consent',
        '이번엔 건너뛰기': 'omd browser skip --decision skipped-this-run --json',
        '다시 묻지 않기': 'omd browser skip --decision never-ask --json' } };
  }
  const status = pending.length === 0 ? 'ready' : 'action';
  action ??= status === 'ready' ? { kind: 'publish-board', lane: null, args: [],
    reason: 'Interpret retained domain flows and design UI parts, then publish the candidate assembly with omd ref board.' }
    : { kind: 'replan-discovery', lane: pending[0] ?? null,
      args: ['ref', 'discover-batch', '--input', '.omd/.cache/reference-recovery-batch.json', '--recovery', '--json'],
      reason: `The initial leads are depleted, not all public evidence. Scout must use Google in a consented browser, then an available host web search tool, DuckDuckGo HTML leads, and Bing last with novel task/component queries for ${pending.join(' and ')}; observe destinations with OMD. Challenges are handled by the acquisition layer; configured logged-in sessions are used. Move to another provider when its circuit opens. Do not invent links/evidence or publish an empty board.` };
  const materialProgressIdentities = [...new Set([
    ...admittedDomain.filter(item => (item.observation.taskText?.trim().length ?? 0) >= 20
      && item.observation.links.length > 0).map(item => `domain:${item.observation.finalUrl}`),
    ...design.visits.filter(item => (item.observation.imageCandidates?.length ?? 0) > 0
      || (item.observation.taskText?.trim().length ?? 0) >= 20).map(item => `design-visit:${item.observation.finalUrl}`),
    ...admittedDesign.map(ref => `design:${ref.source}:${ref.component}`),
  ])].sort();
  const progress = { domainFamilies: domainFamilies.size, designFamilies: designFamilies.size,
    searches: domain.searches.length + design.searches.length, entries: domain.entries.length + design.entries.length,
    visits: domain.visits.length + design.visits.length, unavailable: domain.unavailable.length + design.unavailable.length,
    ignored: domain.ignored + design.ignored };
  const attempts = [...domain.failures, ...design.failures];
  const next = status === 'ready' ? 'omd ref board --input <candidate-assemblies.json>'
    : action.kind === 'browser-consent' ? action.question!
    : action.kind === 'collect-leads' ? `${action.reason} Query: ${JSON.stringify(action.input?.query)}`
      : action.args.length ? `omd ${action.args.join(' ')}`
      : `Inspect the captured DOM${action.selector ? ` and confirm image candidate ${JSON.stringify(action.selector)}` : ' for a real selector'}, then omd ref add ${action.url ?? '<observed-source>'} --as <component-name> --lane design --selector ${action.selector ? JSON.stringify(action.selector) : '<observed-ui-selector>'} --shot OR omd ref exclude ${action.url ?? '<observed-source>'} --lane design --reason <specific-quality-judgment>`;
  const instruction = status === 'ready' ? 'Read omd schema reference-board once, author the board from useful retained evidence, then publish it with the named CLI publisher.'
    : action.reason;
  return { schema: 'reference-discovery-work-v1', status, action, next, instruction,
    code: null,
    attempts, exclusions, circuits, materialProgressIdentities,
    workSha256: sha256(canonicalJson({ sourceContractSha256: route.sourceContractSha256, status, action,
      evidence: [...domain.digests, ...design.digests],
      exclusions: exclusions.map(item => item.receipt.sha256),
      retained: [...admittedDomain.map(item => ['domain', item.observation.finalUrl, item.sha256]),
        ...admittedDesign.map(ref => ['design', ref.source, ref.component])] })),
    progress };
}
function progressHasNoAcquisition(domain: LaneEvidence, design: LaneEvidence): boolean {
  return [domain, design].every(lane => lane.searches.length === 0 && lane.entries.length === 0
    && lane.visits.length === 0 && lane.unavailable.length === 0);
}
