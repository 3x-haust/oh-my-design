import { createHash } from 'node:crypto';
import { supportsMarketCoverage } from './reference-research-types.ts';
import { validateBrowseLane, validateBrowseSourceCoverage } from './reference-research-browse.ts';
import { verifyBrowseRetention } from './browse/retention.ts';
import { resolve, sep } from 'node:path';
import { readReferenceBoardArtifacts } from './board-artifacts.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { parseImageFragmentRecord } from './image-fragment-parser.ts';
import { trustedDiscoveryImage, trustedReferenceImage } from './board-security.ts';
import { designDiscoveryDirectoryProvider, designDiscoveryItemIdentity, designDiscoveryProvider,
  referenceServiceFamily, referenceServiceHost } from './design-discovery-sources.ts';
import { observedNavigationTargets, readSearchCoverage, validateSearchCoverage,
  type ObservedNavigation } from './search-execution.ts';
import { readResearchDiscoveryRoots, validateDiscoveryCoverage } from './discovery-coverage.ts';
import { currentReferenceEvidenceAfter, readCurrentDiscoveryNavigation } from './discovery-record.ts';
import { isDocumentationReferenceOrigin, isRetainedReferencePath, requireDesignReferenceAdmission } from './design-admission.ts';
import { loadRefs } from './store.ts';
import { requireDesignImageAdmission } from './design-image-admission.ts';
import { refIdentity } from './identity.ts';
import { validateFunctionalResearch } from './reference-research-functional.ts';
import { readDomainObservation } from './domain-observation.ts';
import { readSearchLeads } from './search-leads.ts';
import { userBrowserAcquisition } from './user-browser-provenance.ts';
import type { ResearchSource } from './reference-research-types.ts';
import { assertCurrentMarketCapture, validateMarketReferenceCoverage } from './market-reference-coverage.ts';
import { referenceCaptureTimestamp } from './reference-capture-time.ts';
import { parseTaskFlowBenchmark, taskFlowBenchmarkSha256, validateTaskFlowBenchmarkEvidence } from './task-flow-benchmark.ts';
import { fail, httpsUrl, record, type ReferenceResearch, type ResearchEvidence, type ValidationOptions } from './reference-research-contract.ts';
import { requireReferenceDirectionAdmission } from './reference-direction-admission.ts';

export function requireVisualPresentationImage(presentation: 'finished-product-website' | 'finished-app-flow', image: Buffer): void {
  if (presentation === 'finished-product-website' && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && image.readUInt32BE(20) >= 1200 && image.readUInt32BE(16) < image.readUInt32BE(20) * .85)
    fail('REFERENCE_VISUAL_SELECTION_REQUIRED: a portrait single app screen is not a finished desktop website; inspect its actual multi-screen flow');
}
export function readReferenceResearchFileBytes(root: string, path: string, code: string): Buffer {
  const projectRoot = resolve(root);
  const absolute = resolve(projectRoot, path);
  if (absolute === projectRoot || !absolute.startsWith(`${projectRoot}${sep}`)) fail('REFERENCE_RESEARCH_EVIDENCE_PATH');
  try {
    return readStableProjectFile({ root: projectRoot, path: absolute, label: path, fs: nodeStableProjectFileSystem() });
  } catch {
    fail(code);
  }
}
function verifyEvidence(root: string, item: ResearchEvidence): void {
  const bytes = readReferenceResearchFileBytes(root, item.path, 'REFERENCE_RESEARCH_EVIDENCE_MISSING');
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
    fail(`REFERENCE_RESEARCH_EVIDENCE_STALE: ${item.path}; read this artifact again and reassess its evidence, then run omd hash <artifact-path> --json before authoring an updated research receipt`);
  }
}

export function verifyCapture(root: string, item: { url: string; evidence: ResearchEvidence; capture: ResearchEvidence }, lane: 'domain' | 'design', purpose: 'retained' | 'navigation' = 'retained'): Record<string, unknown> {
  for (const receipt of [item.evidence, item.capture]) {
    if (!(receipt.path.startsWith(`.omd/refs/${lane}/`) || (purpose === 'navigation' && receipt.path.startsWith(`.omd/discovery/${lane}/`)))) fail('REFERENCE_RESEARCH_LANE_PATH_REQUIRED');
    if (purpose === 'retained' && !isRetainedReferencePath(receipt.path, lane)) fail('REFERENCE_RESEARCH_CAPTURE_PURPOSE');
    verifyEvidence(root, receipt);
  }
  if (!item.evidence.path.endsWith('.png') || !item.capture.path.endsWith('.json')) fail('REFERENCE_RESEARCH_CAPTURE_FORMAT');
  if (purpose === 'navigation' && item.evidence.path.startsWith('.omd/discovery/')) trustedDiscoveryImage(root, item.evidence.path);
  else trustedReferenceImage(root, item.evidence.path);
  const captured = record(JSON.parse(readReferenceResearchFileBytes(root, item.capture.path, 'REFERENCE_RESEARCH_CAPTURE_MISSING').toString('utf8')), 'REFERENCE_RESEARCH_CAPTURE_INVALID');
  if (purpose === 'retained' && ['reference-navigation-capture-v1', 'reference-navigation-capture-v2', 'reference-navigation-capture-v3', 'reference-navigation-capture-v4',
    'reference-discovery-entry-v1', 'reference-discovery-entry-v2', 'reference-discovery-entry-v3', 'reference-discovery-entry-v4', 'reference-discovery-entry-v5',
    'reference-search-execution-v1', 'reference-search-execution-v2', 'reference-search-execution-v3'].some(schema => captured.schema === schema)) fail('REFERENCE_RESEARCH_CAPTURE_PURPOSE');
  if (captured.browse !== undefined) {
    if (!Object.hasOwn(item, 'provenance')) fail('REFERENCE_RESEARCH_BROWSE_PROVENANCE_REQUIRED');
    const verified = verifyBrowseRetention(root, captured);
    if (verified.reference.source !== item.url || verified.reference.researchLane !== lane || verified.reference.imagePath !== item.evidence.path
      || verified.keep.image.sha256 !== item.evidence.sha256) fail('REFERENCE_RESEARCH_BROWSE_SOURCE');
    return captured;
  }
  if (captured.schemaVersion === 'image-fragment-v1') {
    const fragment = parseImageFragmentRecord(captured);
    if (lane !== 'design' || fragment.provenance.sourcePage !== item.url || fragment.imagePath !== item.evidence.path || fragment.sha256 !== item.evidence.sha256) fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
    requireDesignImageAdmission(root, fragment);
  } else if (captured.source !== item.url || captured.imagePath !== item.evidence.path || captured.researchLane !== lane
    || typeof captured.capturedAt !== 'string' || !Number.isFinite(Date.parse(captured.capturedAt))
    || !['page', 'component', 'image'].includes(captured.kind as string)) fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
  if (captured.schemaVersion !== 'image-fragment-v1') {
    const acquisition = record(captured.acquisition, 'REFERENCE_RESEARCH_ACQUISITION_REQUIRED');
    if (acquisition.requestedUrl !== item.url || typeof acquisition.finalUrl !== 'string'
      || !userBrowserAcquisition(acquisition) && (typeof acquisition.httpStatus !== 'number'
        || acquisition.httpStatus < 200 || acquisition.httpStatus >= 300)
      || !Array.isArray(acquisition.links)) fail('REFERENCE_RESEARCH_ACQUISITION_INVALID');
    if (acquisition.imageSha256 !== item.evidence.sha256) fail('REFERENCE_RESEARCH_CAPTURE_IMAGE_MISMATCH');
  }
  return captured;
}

function currentNavigation(root: string, item: { url: string; evidence: ResearchEvidence; capture: ResearchEvidence }): ObservedNavigation {
  let observation: ReturnType<typeof readCurrentDiscoveryNavigation>;
  try { observation = readCurrentDiscoveryNavigation(root, item); }
  catch (error) {
    if (error instanceof Error && /native discovery capture is stale/u.test(error.message)) fail('REFERENCE_RESEARCH_NAVIGATION_STALE');
    throw error;
  }
  if (observation.capturedAt === undefined || Date.parse(observation.capturedAt) < currentReferenceEvidenceAfter(root)) {
    fail('REFERENCE_RESEARCH_NAVIGATION_STALE');
  }
  return observation;
}

export function validateReferenceResearch(root: string, research: ReferenceResearch, options: ValidationOptions): void {
  if (research.sourceContractSha256 !== options.expectedSourceContractSha256) fail('REFERENCE_RESEARCH_SOURCE_CONTRACT_STALE');
  for (const lane of ['domain', 'design'] as const) {
    const researchLane = research[lane === 'domain' ? 'domainReference' : 'designReference'];
    const sources: readonly ResearchSource[] = [...researchLane.sources]
      .filter((source): source is ResearchSource => 'evidence' in source && 'capture' in source);
    validateBrowseLane(root, { ...researchLane, sources },
    lane, options.expectedSourceContractSha256);
  }
  const admissionSourceContract = research.schema === 'reference-research-v8'
    ? options.expectedSourceContractSha256 : null;
  if (admissionSourceContract !== null) {
    const retained = loadRefs(root, { includeDomain: true });
    for (const source of research.designReference.sources) {
      const reference = source.evidence.path.startsWith('.omd/refs/design/fragments/')
        ? requireDesignImageAdmission(root, parseImageFragmentRecord(verifyCapture(root, source, 'design')))
        : retained.find(item => item.researchLane === 'design' && item.source === source.url
          && item.imagePath === source.evidence.path);
      if (!reference) fail('REFERENCE_DIRECTION_ADMISSION_MISSING');
      requireReferenceDirectionAdmission(root, reference, admissionSourceContract,
        source.visualRole === 'visual-direction' ? 'direction' : 'support');
    }
  }
  if (research.schema === 'reference-research-v8') for (const lane of ['domain', 'design'] as const) {
    for (const receipt of research[lane === 'domain' ? 'domainReference' : 'designReference'].leads ?? [])
      readSearchLeads(root, receipt, lane, research.sourceContractSha256);
  }
  validateMarketReferenceCoverage(root, research, options.expectedRequest, options.onAdvisory);
  validateFunctionalResearch(root, research, options);
  const legacyDomainSources = research.domainReference.sources.filter(
    (source): source is ResearchSource => !('observations' in source));
  const serviceIdentity = research.schema === 'reference-research-v5' ? referenceServiceHost : referenceServiceFamily;
  const marketCoverage = research.schema === 'reference-research-v7' || research.schema === 'reference-research-v8' ? research.marketCoverage : null;
  const localMarketSources = marketCoverage != null
    ? { domain: new Set([...marketCoverage.domain.localSources.map(item => item.sourceId),
      ...marketCoverage.domain.globalFallback?.sourceIds ?? []]),
      design: new Set([...marketCoverage.design.localSources.map(item => item.sourceId),
        ...marketCoverage.design.globalFallback?.sourceIds ?? []]) }
    : { domain: new Set<string>(), design: new Set<string>() };
  const directRoots = { domain: readResearchDiscoveryRoots(root, research.domainReference), design: readResearchDiscoveryRoots(root, research.designReference) };
  const domainHosts = new Set(research.domainReference.sources.map(item => serviceIdentity(item.url)));
  if (domainHosts.size < 3) options.onAdvisory?.('REFERENCE_RESEARCH_DOMAIN_SOURCE_DIVERSITY', 'Fewer than three domain source families; record the research limitation.');
  if (research.schema === 'reference-research-v8') for (const source of research.domainReference.sources)
    if ('observations' in source) for (const receipt of source.observations) {
      const observation = readDomainObservation(root, receipt);
      domainHosts.add(serviceIdentity(observation.url));
      domainHosts.add(serviceIdentity(observation.finalUrl));
    }
  const capturedDomainFamilies = new Set<string>();
  for (const observation of directRoots.domain) for (const url of [observation.url, observation.finalUrl]) domainHosts.add(serviceIdentity(url));
  const retainedIdentities = new Map<string, string>();
  const finalDesignSourceFamilies = new Set<string>();
  const references = loadRefs(root, { includeDomain: true });
  const navigation: Record<'domain' | 'design', ObservedNavigation[]> = { domain: [], design: [] };
  const observe = (lane: 'domain' | 'design', url: string, captured: Record<string, unknown>) => {
    if (captured.schemaVersion === 'image-fragment-v1' || directRoots[lane].length) return;
    const acquisition = captured.acquisition as { finalUrl: string; links: unknown[] };
    navigation[lane].push({ url, finalUrl: httpsUrl(acquisition.finalUrl), links: acquisition.links.filter((link): link is string => {
      try { return typeof link === 'string' && new URL(link).protocol === 'https:'; } catch { return false; }
    }) });
  };
  for (const lane of ['domain', 'design'] as const) for (const hop of research[lane === 'domain' ? 'domainReference' : 'designReference'].navigation ?? []) {
    if ([hop.evidence, hop.capture].some(receipt => !receipt.path.startsWith(`.omd/discovery/${lane}/navigation/`))) {
      fail('REFERENCE_RESEARCH_NAVIGATION_NATIVE_REQUIRED');
    }
    navigation[lane].push(currentNavigation(root, hop));
  }
  for (const item of legacyDomainSources) {
    const captured = verifyCapture(root, item, 'domain');
    if (localMarketSources.domain.has(item.id)) assertCurrentMarketCapture(referenceCaptureTimestamp(captured), 'DOMAIN');
    observe('domain', item.url, captured);
    const acquisition = captured.acquisition as Record<string, unknown>;
    const finalFamily = referenceServiceFamily(acquisition.finalUrl as string);
    domainHosts.add(serviceIdentity(acquisition.finalUrl as string));
    capturedDomainFamilies.add(finalFamily);
  }
  // Family count is evidence for the research review, not a publication quota.
  void capturedDomainFamilies;
  const designUrls = [...research.designReference.sources.flatMap(item => item.discovery ? [item.url, item.discovery.url] : [item.url]),
    ...directRoots.design.flatMap(observation => [observation.url, observation.finalUrl])];
  void designUrls;
  for (const item of research.designReference.sources) {
    const discovery = item.discovery;
    const source = verifyCapture(root, item, 'design');
    const browseVerified = discovery?.kind === 'recorded-browse'
      ? validateBrowseSourceCoverage(root, item, 'design', options.expectedSourceContractSha256) : null;
    const parent = browseVerified
      ? references.find(ref => ref.browse && ref.source === item.url && ref.component === browseVerified.reference.component)
      : source.schemaVersion === 'image-fragment-v1'
      ? requireDesignImageAdmission(root, parseImageFragmentRecord(source))
      : references.find(ref => ref.researchLane === 'design' && ref.source === item.url && ref.imagePath === item.evidence.path);
    if (!parent) fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
    if (supportsMarketCoverage(research.schema) && item.visualRole === 'visual-direction') {
      const acquisition = source.acquisition as Record<string, unknown> | undefined;
      const finalUrl = typeof acquisition?.finalUrl === 'string' ? acquisition.finalUrl : item.url;
      finalDesignSourceFamilies.add(referenceServiceFamily(finalUrl));
    }
    const visualSelection = item.visualAssessment?.selection;
    if (research.schema === 'reference-research-v8' && item.visualRole === 'visual-direction') {
      if (!visualSelection) fail('REFERENCE_VISUAL_SELECTION_REQUIRED: inspect a finished website or multi-screen app visually, reject documentation and pattern catalogues, and author a specific appearance intent');
      if (isDocumentationReferenceOrigin(item.url) || isDocumentationReferenceOrigin(String((source.acquisition as Record<string, unknown> | undefined)?.finalUrl ?? item.url)))
        fail('REFERENCE_VISUAL_SELECTION_REQUIRED: design-system documentation is component support, not a finished-product visual direction');
      const image = readReferenceResearchFileBytes(root, item.evidence.path, 'REFERENCE_VISUAL_SELECTION_REQUIRED');
      requireVisualPresentationImage(visualSelection.presentation, image);
      requireDesignReferenceAdmission(root, parent, { references, purpose: 'visual-direction' });
      const seen = new Set([item.evidence.sha256]);
      for (const receipt of visualSelection.flowCaptures) {
        verifyEvidence(root, receipt);
        const related = references.find(ref => ref.researchLane === 'design' && ref.imagePath === receipt.path
          && referenceServiceFamily(ref.acquisition?.finalUrl ?? ref.source) === referenceServiceFamily(item.url));
        if (!related || !related.acquisition || related.acquisition.imageSha256 !== receipt.sha256
          || !isRetainedReferencePath(receipt.path, 'design') || seen.has(receipt.sha256)) fail('REFERENCE_VISUAL_FLOW_EVIDENCE_REQUIRED: cite distinct inspected screens from one provider; Scout must judge whether they form the same finished app flow');
        requireDesignReferenceAdmission(root, related, { references });
        seen.add(receipt.sha256);
      }
    }
    if (localMarketSources.design.has(item.id)) assertCurrentMarketCapture(referenceCaptureTimestamp(source), 'DESIGN');
    if (source.schemaVersion === 'image-fragment-v1' && typeof source.id === 'string') retainedIdentities.set(item.id, source.id);
    else if (typeof source.component === 'string') retainedIdentities.set(item.id, refIdentity(item.url, source.component));
    else fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
    if (discovery?.kind === 'recorded-browse') {
      if (!browseVerified) fail('REFERENCE_RESEARCH_BROWSE_SOURCE');
      requireDesignReferenceAdmission(root, parent, { references,
        purpose: item.visualRole === 'visual-direction' ? 'visual-direction' : 'retained' });
      continue;
    }
    if (!discovery) {
      observe('design', item.url, source);
      requireDesignReferenceAdmission(root, parent, { references });
      continue;
    }
    const nativeVisit = discovery.capture.path.startsWith('.omd/discovery/design/navigation/');
    const visit = nativeVisit ? currentNavigation(root, {
      url: discovery.url, evidence: discovery.evidence, capture: discovery.capture,
    }) : null;
    const entry = verifyCapture(root, discovery, 'design', nativeVisit ? 'navigation' : 'retained');
    if (discovery.kind === 'direct-product') {
      const retained = record(source.schemaVersion === 'image-fragment-v1' ? parent.acquisition : source.acquisition,
        'REFERENCE_RESEARCH_DIRECT_PRODUCT_PROVENANCE_REQUIRED');
      if (visit === null || discovery.url !== item.url || visit.finalUrl !== retained.finalUrl
        || designDiscoveryProvider(discovery.url) !== null || designDiscoveryDirectoryProvider(discovery.url) !== null
        || designDiscoveryProvider(visit.finalUrl) !== null || designDiscoveryDirectoryProvider(visit.finalUrl) !== null
        || domainHosts.has(serviceIdentity(discovery.url)) || domainHosts.has(serviceIdentity(visit.finalUrl)))
        fail('REFERENCE_RESEARCH_DIRECT_PRODUCT_PROVENANCE_REQUIRED');
    } else if (research.schema === 'reference-research-v8' && discovery.kind !== 'user-provided') {
      const identity = designDiscoveryItemIdentity(discovery.url);
      if (identity === null || designDiscoveryItemIdentity(httpsUrl(record(entry.acquisition,
        'REFERENCE_RESEARCH_GALLERY_ITEM_REQUIRED').finalUrl)) !== identity)
        fail('REFERENCE_RESEARCH_GALLERY_ITEM_REQUIRED');
    }
    observe('design', item.url, source);
    observe('design', discovery.url, entry);
    // Entry provider and lane independence are recommendations; signed capture identity remains checked.
    if (discovery.kind === 'user-provided' && entry.origin !== 'user') fail('REFERENCE_RESEARCH_USER_SOURCE_REQUIRED: user-provided discovery needs an actual --from-user capture');
    if (discovery.url !== item.url) {
      const acquisition = record(entry.acquisition, 'REFERENCE_RESEARCH_DISCOVERY_LINK_REQUIRED');
      if (!Array.isArray(acquisition.links) || !acquisition.links.includes(item.url)) fail('REFERENCE_RESEARCH_DISCOVERY_LINK_MISMATCH');
    }
    for (const [captured, url, purpose] of [[source, item.url, 'retained'], [entry, discovery.url, 'discovery']] as const) {
      if (captured.schemaVersion === 'image-fragment-v1') continue;
      if (purpose === 'discovery' && nativeVisit) continue;
      const reference = references.find(ref => ref.researchLane === 'design' && ref.source === url && ref.component === captured.component);
      if (!reference) fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
      requireDesignReferenceAdmission(root, reference, { references, purpose });
    }
  }
  if (finalDesignSourceFamilies.size < 2) options.onAdvisory?.('REFERENCE_RESEARCH_DESIGN_SOURCE_DIVERSITY', 'Fewer than two design source families; record the research limitation.');
  for (const lane of ['domain', 'design'] as const) {
    const entry = research[lane === 'domain' ? 'domainReference' : 'designReference'];
    const sourceUrls = lane === 'domain' ? entry.sources.map(item => item.url)
      : research.designReference.sources.flatMap(item => item.discovery
        && item.discovery.kind !== 'user-provided' && item.discovery.kind !== 'recorded-browse' ? [item.discovery.url] : []);
    const allowUnmatched = !['reference-research-v7', 'reference-research-v8'].includes(research.schema) || marketCoverage?.marketRegion == null;
    if (research.schema === 'reference-research-v8' && entry.leads?.length && !directRoots[lane].length) {
      const leadUrls = new Set(entry.leads.flatMap(receipt => readSearchLeads(root, receipt, lane, research.sourceContractSha256).urls));
      const visits = lane === 'design' ? [
        ...(research.designReference.navigation ?? []).map(hop => currentNavigation(root, hop)),
        ...research.designReference.sources.flatMap(source =>
          source.discovery && source.discovery.kind !== 'recorded-browse'
            && source.discovery.capture.path.startsWith('.omd/discovery/design/navigation/')
            ? [currentNavigation(root, { url: source.discovery.url, evidence: source.discovery.evidence, capture: source.discovery.capture })] : []),
      ] : research.domainReference.sources.flatMap(source =>
        'observations' in source ? source.observations.map(receipt => readDomainObservation(root, receipt)) : []);
      const roots = visits.filter(visit => leadUrls.has(visit.url));
      const search = readSearchCoverage(root, { lane, queries: entry.queries, receipts: entry.searches, allowUnmatched });
      const reached = observedNavigationTargets([...search.targets, ...roots.map(root => root.url)],
        [...visits, ...navigation[lane]]);
      if (sourceUrls.some(url => !reached.has(url)))
        fail('REFERENCE_LEAD_OBSERVATION_REQUIRED');
      continue;
    }
    if (lane === 'domain' && research.schema === 'reference-research-v8') continue;
    if (directRoots[lane].length) validateDiscoveryCoverage(root, { lane, queries: entry.queries, searches: entry.searches, sourceUrls, navigation: navigation[lane], directRoots: directRoots[lane], allowUnmatched });
    else validateSearchCoverage(root, lane, entry.queries, entry.searches, sourceUrls, navigation[lane], allowUnmatched);
  }
  const boardBytes = readReferenceResearchFileBytes(root, '.omd/reference-board.json', 'REFERENCE_RESEARCH_BOARD_MISSING');
  if (createHash('sha256').update(boardBytes).digest('hex') !== research.designReference.boardSha256) fail('REFERENCE_RESEARCH_BOARD_STALE');
  const board = readReferenceBoardArtifacts(root);
  const retained = new Set(research.designReference.sources.filter(item => item.visualRole === 'visual-direction').map(item => `${item.evidence.path}:${item.evidence.sha256}`));
  void retained; // Board coverage is advice; individual claimed pieces still bind genuine captures below.
  for (const candidate of board.resolved.candidates) for (const piece of candidate.pieces) {
    if (piece.sourceKind === 'classified-reference') continue;
    if (piece.sourceKind === 'component-capture') requireDesignReferenceAdmission(root, piece.reference, { references });
    const raw = board.raw.candidates.find(row => row.id === candidate.id)?.pieces.find(row => row.slotId === piece.slotId);
    const sourceUrl = piece.sourceKind === 'component-capture' ? piece.reference.source : piece.provenance.sourcePage;
    if (!raw || !('imagePath' in raw.evidence) || !('imageSha256' in raw.evidence)) fail('REFERENCE_RESEARCH_BOARD_SOURCE_COVERAGE');
    const image = raw.evidence;
    const scopedSupport = research.schema === 'reference-research-v8'
      && admissionSourceContract !== null && piece.binding !== undefined;
    if (!research.designReference.sources.some(item => (item.visualRole === 'visual-direction'
        || scopedSupport && item.visualRole === 'component-support')
        && item.url === sourceUrl && item.evidence.sha256 === image.imageSha256
        && (piece.sourceKind === 'image-fragment'
          || retainedIdentities.get(item.id) === piece.referenceId && item.evidence.path === image.imagePath))) {
      fail(`REFERENCE_RESEARCH_BOARD_SOURCE_COVERAGE: ${candidate.id}/${piece.slotId} must bind a qualified retained source at ${sourceUrl} with image ${image.imageSha256}`);
    }
  }

  if (options.benchmarkRequired && research.domainReference.benchmarkSha256 === null)
    options.onAdvisory?.('REFERENCE_RESEARCH_BENCHMARK_REQUIRED', 'No optional benchmark was published; record the limitation.');
  if (!options.benchmarkRequired || research.domainReference.benchmarkSha256 === null) {
    if (research.domainReference.benchmarkSha256 !== null) {
      const benchmark = parseTaskFlowBenchmark(JSON.parse(readReferenceResearchFileBytes(root, '.omd/task-flow-benchmark.json', 'REFERENCE_RESEARCH_BENCHMARK_MISSING').toString('utf8')), { expectedSourceContractSha256: options.expectedSourceContractSha256 });
      validateTaskFlowBenchmarkEvidence(root, benchmark);
      if (taskFlowBenchmarkSha256(benchmark) !== research.domainReference.benchmarkSha256) fail('REFERENCE_RESEARCH_BENCHMARK_STALE');
    }
    return;
  }

  const benchmark = parseTaskFlowBenchmark(JSON.parse(readReferenceResearchFileBytes(root, '.omd/task-flow-benchmark.json', 'REFERENCE_RESEARCH_BENCHMARK_MISSING').toString('utf8')), { expectedSourceContractSha256: options.expectedSourceContractSha256 });
  const strength = validateTaskFlowBenchmarkEvidence(root, benchmark);
  // A benchmark is optional, but every declared completion is verified by its own execution receipt.
  void strength;
  if (taskFlowBenchmarkSha256(benchmark) !== research.domainReference.benchmarkSha256) fail('REFERENCE_RESEARCH_BENCHMARK_STALE');
  const domainUrls = new Set(research.domainReference.sources.map((entry) => entry.url));
  if (benchmark.sources.some((entry) => !domainUrls.has(entry.url))) fail('REFERENCE_RESEARCH_BENCHMARK_SOURCE_COVERAGE');
}
