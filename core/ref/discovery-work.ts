import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { browserProfilePath } from './browser-consent.ts';
import { readBrowserConsent, readUserBrowserConsent } from './browser-consent.ts';
import type { RouteRecord } from '../route/index.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { canonicalJson, sha256 } from './board-artifacts.ts';
import { inspectDesignReferenceAdmission } from './design-admission.ts';
import { loadDesignCandidates } from './reference-candidate.ts';
import { readAuthenticatedAdmissionHistory } from './reference-direction-admission.ts';
import { refIdentity } from './identity.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';
import { readDomainObservation } from './domain-observation.ts';
import { currentReferenceEvidenceAfter, readCurrentReferenceDiscoveryEvidence, type DiscoveryAttempt, type LaneEvidence } from './discovery-evidence.ts';
import { readReferenceDiscoveryExclusions, type ReferenceDiscoveryExclusionRecord } from './discovery-exclusion.ts';
import { designDiscoveryDirectoryProvider, designDiscoveryProvider, referenceServiceFamily, referenceServiceHost } from './design-discovery-sources.ts';
import { buildReferenceDiscoveryPlan, type ReferenceDiscoveryPlan } from './discovery-plan.ts';
import { expandedDiscoveryInputs } from './discovery-recovery.ts';
import { fetchSearchLeads } from './search-leads.ts';
import { discoveryProvider, providerCircuitSummaries, type ProviderCircuitSummary } from './provider-circuit.ts';
import { searchObserved, type SearchExecution } from './search-execution.ts';
import { actionableSearchTargets, observedSearchTargets } from './search-result.ts';
import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';
import { loadRefs, refRecordPath } from './store.ts';
import { userBrowserAcquisition } from './user-browser-provenance.ts';
import type { GalleryImageCandidate } from './gallery-image-candidates.ts';
import { browseDiscoveryWork } from './browse/work.ts';

type Lane = 'domain' | 'design';
type SearchInput = ReferenceDiscoveryPlan['marketReferencePolicy']['domainSearchInputs'][number]
  | ReferenceDiscoveryPlan['designSourcePolicy']['nativeSearchInputs'][number];
export type ReferenceDiscoveryAction = Readonly<{
  kind: 'browser-consent' | 'search' | 'collect-leads' | 'direct-entry' | 'follow-link' | 'retain-reference'
    | 'review-candidates' | 'publish-board' | 'replan-discovery'
    | 'start-browse' | 'continue-browse' | 'narrow-tray' | 'end-browse';
  lane: Lane | null;
  args: readonly string[];
  reason: string;
  input?: SearchInput;
  engine?: 'user-browser' | 'omd-profile' | 'headless' | 'bing';
  question?: string;
  answers?: Readonly<Record<string, string>>;
  url?: string;
  entry?: 'free-gallery' | 'public-directory';
  selector?: string;
  imageCandidates?: readonly GalleryImageCandidate[];
  batchUrls?: readonly string[];
}>;
export type ReferenceDiscoveryWork = Readonly<{
  schema: 'reference-discovery-work-v1' | 'reference-discovery-work-v2';
  status: 'action' | 'ready' | 'exhausted' | 'stopped-with-debt';
  browse?: Readonly<{ head: string | null; budget: import('./browse/contract.ts').BrowseBudget | null; observation: import('./browse/contract.ts').BrowseObservation | null;
    confidenceDebt: readonly import('./browse/contract.ts').ReferenceConfidenceDebt[] }>;
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
export async function assessDiscoveryTarget(url: string, binding?: ReferenceJudgmentBinding) {
  if (binding && binding.subjectId !== url) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
  return referenceDecision('discovery-target', binding);
}
export const BROWSER_CONSENT_QUESTION = '평소 쓰는 브라우저를 명시적으로 사용하시겠습니까? 기본 조사는 창을 띄우지 않는 OMD 전용/공개 헤드리스 브라우저로 진행합니다. 평소 브라우저의 네트워크 요청은 OMD가 격리하지 못합니다. 로그인·인증·확인 과제에 한해서만 전용 창을 엽니다.';
function searchAction(lane: Lane, input: SearchInput, evidence: LaneEvidence): ReferenceDiscoveryAction {
  const failed = evidence.searches.filter(item => item.query === input.query && !searchObserved(item));
  const google = new URL('https://www.google.com/search'); google.searchParams.set('q', input.query);
  const googleInput = { lane, query: input.query, url: google.href, queryParam: 'q' as const };
  if (process.env.OMD_REFERENCE_BROWSER_ENGINE === 'user-browser' && readUserBrowserConsent() === 'consented'
    && !failed.some(item => item.provider === 'www.google.com' && item.error?.startsWith('user-browser:')))
    return { kind: 'search', lane, engine: 'user-browser', args: ['ref', 'advance', '--json'], input: googleInput,
      reason: 'Search Google in the consented everyday browser; an observed challenge requires human handoff.' };
  if (!failed.some(item => item.provider === 'www.google.com' && !item.error?.startsWith('user-browser:')))
    return { kind: 'search', lane, engine: readBrowserConsent() === 'consented' && existsSync(browserProfilePath()) ? 'omd-profile' : 'headless',
      args: ['ref', 'advance', '--json'], input: googleInput,
      reason: 'Search in background headless Chromium (reuse the consented OMD profile if available); open a dedicated window only for unavoidable login or challenge.' };
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
  return publicCandidate(value);
}
function domainSearchResults(search: SearchExecution, allowUnmatched: boolean): readonly string[] {
  // Search results remain observable leads. Without a signed discovery-target judgment,
  // none is automatically promoted to the next visit.
  void search; void allowUnmatched;
  return [];
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
  retainedFamilies: ReadonlySet<string>, domainFamilies: ReadonlySet<string>, excludedUrls: ReadonlySet<string>,
  requiredSearch: SearchInput | undefined, leadUrls: readonly string[], leadQueries: ReadonlySet<string>,
  openProviders: ReadonlySet<string>): ReferenceDiscoveryAction | null {
  // Family quotas do not force searches; the default plan still recommends research.
  void requiredSearch;
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
  const productLeads = new Set(lane === 'design' ? leadUrls.filter(url =>
    publicCandidate(url) && designDiscoveryDirectoryProvider(url) === null
    && !(referenceServiceHost(url) === 'figma.com' && /^\/templates(?:\/|$)/.test(new URL(url).pathname))
    && !domainFamilies.has(referenceServiceFamily(url))) : []);
  const descendants = new Set(descendantTargets);
  const targets = [...new Set([...rootTargets, ...descendantTargets])]
    .filter(url => {
      try {
        if (excludedUrls.has(url) || !publicCandidate(url) || (lane === 'design' && openProviders.has(discoveryProvider(url) ?? ''))) return false;
        const family = referenceServiceFamily(url);
        if (lane === 'domain' && (excludedFamilies.get(family)?.size ?? 0) >= 2) return false;
        return lane === 'design' ? designDiscoveryProvider(url) !== null || originals.has(url) || productLeads.has(url)
          : !retainedFamilies.has(family) && designDiscoveryProvider(url) === null;
      } catch { return false; }
    });
  const inspectedVisits = [...evidence.visits].reverse().filter(item => targets.includes(item.observation.url)
    && !excludedUrls.has(item.observation.url)
    && !retainedFamilies.has(referenceServiceFamily(item.observation.url)));
  const inspectedDescendant = inspectedVisits.find(item => descendants.has(item.observation.url));
  const inspected = inspectedDescendant ?? inspectedVisits[0];
  const freshDescendant = descendantTargets.find(url => targets.includes(url) && !visited.has(url) && !failedUrls.has(url));
  const inspectedImages = inspected?.observation.imageCandidates;
  const bestImage = inspectedImages?.length === 1 ? inspectedImages[0] : undefined;
  const lowResolution = bestImage !== undefined && Math.max(bestImage.naturalWidth, bestImage.naturalHeight) < 1200;
  if (freshDescendant !== undefined && inspectedDescendant === undefined) {
    return nativeAction('follow-link', lane, 'Inspect the original observed from a captured reference item before retaining its wrapper.',
      { url: freshDescendant });
  }
  if (lane === 'design' && bestImage && !lowResolution && designDiscoveryProvider(inspected!.observation.url) !== null)
    return { kind: 'retain-reference', lane, args: [], url: inspected!.observation.url,
      selector: bestImage.selector,
      reason: 'Inspect this single observed image for task fit and quality before retaining its whole original; dimensions are not an admission.' };
  const freshTargets = targets.filter(url => !visited.has(url) && !failedUrls.has(url));
  const freshTarget = freshTargets[0];
  if (freshTarget !== undefined && (inspected === undefined || evidence.visits.length < 2)) {
    return {
      ...nativeAction('follow-link', lane, 'Inspect observed concrete sources before retaining them.', { url: freshTarget }),
      ...(freshTargets.length > 1 ? { batchUrls: freshTargets.slice(0, 4) } : {}),
    };
  }
  if (inspected !== undefined && lane === 'design') return { kind: 'retain-reference', lane, args: [], url: inspected.observation.url,
    ...(bestImage ? { selector: bestImage.selector } : {}),
    ...(inspectedImages && inspectedImages.length > 1 ? { imageCandidates: inspectedImages } : {}),
    reason: lowResolution
      ? 'Only a sub-1200px original was observed; prefer a full-resolution original on another item or site. If none is available, disclose the low-resolution limitation and retain the whole original, never a thumbnail crop.'
      : 'Inspect the observed image choices or whole 2x screen for task fit and quality; choose a current exact image selector, never infer a direction from size or retain a crop.' };
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
  return browseDiscoveryWork(root, route);
}

/** Explicit legacy catalogue work remains readable/testable; it is no longer the default loop. */
export function legacyReferenceDiscoveryWork(root: string, route: RouteRecord): ReferenceDiscoveryWork {
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
  const admittedDomain = [...domain.visits, ...domain.entries].filter(item => {
    try {
      const observation = readDomainObservation(root, { url: item.observation.url, capture: item.receipt });
      return (observation.taskText?.trim().length ?? 0) >= 20 && observation.links.length > 0;
    }
    catch { return false; }
  });
  const history = route.references.decision === 'discover'
    ? readAuthenticatedAdmissionHistory(root, route.sourceContractSha256) : [];
  const admissions = history.flatMap(item => item.admissions);
  const candidates = loadDesignCandidates(root);
  const excludedDesign = new Set(exclusions.filter(item => item.decision.researchLane === 'design')
    .map(item => item.decision.source));
  const pendingCandidates = candidates.filter(item => !excludedDesign.has(item.reference.source)
    && inspectDesignReferenceAdmission(root, item.reference, { candidate: item, purpose: 'visual-direction' }).eligible
    && !admissions.some(row => row.sourceId === refIdentity(item.reference.source, item.reference.component)
      && row.imageSha256 === item.reference.acquisition?.imageSha256));
  const admittedDesign = refs.filter(ref => ref.researchLane === 'design'
    && inspectDesignReferenceAdmission(root, ref, { references: refs }).eligible
    && admissions.some(row => row.verdict === 'direction'
      && row.sourceId === refIdentity(ref.source, ref.component)
      && row.imageSha256 === ref.acquisition?.imageSha256
      && row.captureSha256 === sha256(readStableProjectFile({ root: resolve(root),
        path: refRecordPath(root, ref), label: 'retained design reference',
        fs: nodeStableProjectFileSystem() }))));
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
  let action: ReferenceDiscoveryAction | null = pendingCandidates.length && designFamilies.size < 2
    ? { kind: 'review-candidates', lane: 'design', args: ['ref', 'direction-review', '--json'],
      reason: 'Independent Eye must inspect the staged original pixels before any design reference can be retained or counted as a visual direction.' }
    : null;
  for (const lane of action === null ? pending : []) {
    action = nextLaneAction(lane, plan, lane === 'domain' ? domain : design,
      lane === 'domain' ? domainFamilies : designFamilies,
      domainFamilies,
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
  if (action !== null && process.env.OMD_REFERENCE_BROWSER_ENGINE === 'user-browser'
    && progressHasNoAcquisition(domain, design) && readUserBrowserConsent() === null) {
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
      reason: `The initial leads are depleted, not all public evidence. Follow the supported OMD-owned isolated headless search by default, then an available host web search tool, DuckDuckGo HTML leads, and Bing last with novel task/component queries for ${pending.join(' and ')}; use the everyday browser only on explicit current user choice and observe destinations with OMD. Challenges are handled by the acquisition layer; configured logged-in sessions are used. Move to another provider when its circuit opens. Do not invent links/evidence or publish an empty board.` };
  const materialProgressIdentities = [...new Set([
    ...admittedDomain.filter(item => (item.observation.taskText?.trim().length ?? 0) >= 20
      && item.observation.links.length > 0).map(item => `domain:${item.observation.finalUrl}`),
    ...design.visits.filter(item => (item.observation.imageCandidates?.length ?? 0) > 0
      || (item.observation.taskText?.trim().length ?? 0) >= 20).map(item => `design-visit:${item.observation.finalUrl}`),
    ...admittedDesign.map(ref => `design:${ref.source}:${ref.component}`),
    ...candidates.map(item => `design-candidate:${refIdentity(item.reference.source, item.reference.component)}:${item.reference.acquisition?.imageSha256}`),
    ...history.map(item => `design-eye:${item.sha256}`),
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
      evidence: [...domain.digests, ...design.digests, ...candidates.map(item => sha256(item.capture)),
        ...history.map(item => item.sha256)],
      exclusions: exclusions.map(item => item.receipt.sha256),
      retained: [...admittedDomain.map(item => ['domain', item.observation.finalUrl, item.sha256]),
        ...admittedDesign.map(ref => ['design', ref.source, ref.component])] })),
    progress };
}
function progressHasNoAcquisition(domain: LaneEvidence, design: LaneEvidence): boolean {
  return [domain, design].every(lane => lane.searches.length === 0 && lane.entries.length === 0
    && lane.visits.length === 0 && lane.unavailable.length === 0);
}
