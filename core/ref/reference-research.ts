import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readReferenceBoardArtifacts } from './board-artifacts.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { parseImageFragmentRecord } from './image-fragment-parser.ts';
import { trustedDiscoveryImage, trustedReferenceImage } from './board-security.ts';
import { designDiscoveryProvider, referenceServiceFamily } from './design-discovery-sources.ts';
import { validateSearchCoverage, type ObservedNavigation } from './search-execution.ts';
import { readResearchDiscoveryRoots, validateDiscoveryCoverage } from './discovery-coverage.ts';
import { readStrictDiscoveryNavigation } from './discovery-record.ts';
import { isRetainedReferencePath, requireDesignReferenceAdmission } from './design-admission.ts';
import { loadRefs } from './store.ts';
import { requireDesignImageAdmission } from './design-image-admission.ts';
import { refIdentity } from './identity.ts';
import {
  parseTaskFlowBenchmark,
  taskFlowBenchmarkSha256,
  validateTaskFlowBenchmarkEvidence,
} from './task-flow-benchmark.ts';

import { DOMAIN_REFERENCES_PATH, DESIGN_REFERENCES_PATH, REFERENCE_RESEARCH_PATH, parseReferenceResearch, fail, record, httpsUrl, type ReferenceResearch, type ResearchEvidence, type ValidationOptions } from './reference-research-contract.ts';
export { REFERENCE_RESEARCH_SCHEMA, DOMAIN_REFERENCES_PATH, DESIGN_REFERENCES_PATH, REFERENCE_RESEARCH_PATH, REFERENCE_RESEARCH_KEYS, REFERENCE_RESEARCH_LANE_KEYS, REFERENCE_RESEARCH_DOMAIN_KEYS, REFERENCE_RESEARCH_DESIGN_KEYS, REFERENCE_RESEARCH_SOURCE_KEYS, REFERENCE_RESEARCH_EVIDENCE_KEYS, parseReferenceResearch } from './reference-research-contract.ts';
export type { ReferenceResearch } from './reference-research-contract.ts';

/** Separate, inspectable deliverables; the aggregate is a consistency receipt written last. */
export function referenceResearchArtifacts(research: ReferenceResearch) {
  const envelope = { sourceContractSha256: research.sourceContractSha256 };
  return {
    [DOMAIN_REFERENCES_PATH]: { schema: 'domain-references-v1', ...envelope, ...research.domainReference },
    [DESIGN_REFERENCES_PATH]: { schema: 'design-references-v1', ...envelope, ...research.designReference },
    [REFERENCE_RESEARCH_PATH]: research,
  };
}

export function publishReferenceResearch(root: string, input: unknown, options: ValidationOptions, writer: ProjectWriteAdapter): void {
  const research = parseReferenceResearch(input);
  validateReferenceResearch(root, research, options);
  writer.write('.omd/refs/design/README.md', designResearchSummary(research));
  for (const [path, value] of Object.entries(referenceResearchArtifacts(research))) {
    writer.write(path, `${JSON.stringify(value, null, 2)}\n`);
  }
}

/** Human inspection surface, not an automated beauty score or a downstream role payload. */
export function designResearchSummary(research: ReferenceResearch): string {
  const escape = (value: string): string => value.replace(/[<>]/g, '').replace(/\n/g, ' ');
  return ['# Design research', '', 'Visual-direction judgments need human review. Captured ≠ selected quality; component-support alone does not complete this lane.', '',
    ...research.designReference.sources.flatMap(item => [
      `## ${escape(item.id)} — ${item.visualRole}`, '',
      `Source: ${item.url}`, `Discovery: ${item.discovery!.url}`, '',
      `![Captured reference](../../../${item.evidence.path})`, '',
      ...Object.entries(item.visualAssessment!).map(([axis, finding]) => `- ${axis}: ${escape(finding)}`), '',
    ]),
  ].join('\n');
}

/** Fail closed on missing lanes or an interrupted/stale publication; never infer a second lane. */
export function readPublishedReferenceResearch(root: string): ReferenceResearch {
  const research = parseReferenceResearch(JSON.parse(fileBytes(root, REFERENCE_RESEARCH_PATH, 'REFERENCE_RESEARCH_MISSING').toString('utf8')));
  for (const [path, expected] of Object.entries(referenceResearchArtifacts(research))) {
    if (path === REFERENCE_RESEARCH_PATH) continue;
    const actual = JSON.parse(fileBytes(root, path, `REFERENCE_RESEARCH_LANE_MISSING: ${path}`).toString('utf8'));
    // Object key order is not evidence; compare the decoded record recursively.
    if (!isDeepStrictEqual(actual, expected)) fail(`REFERENCE_RESEARCH_LANE_STALE: ${path}`);
  }
  return research;
}

function fileBytes(root: string, path: string, code: string): Buffer {
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
  const bytes = fileBytes(root, item.path, 'REFERENCE_RESEARCH_EVIDENCE_MISSING');
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
    fail(`REFERENCE_RESEARCH_EVIDENCE_STALE: ${item.path}; read this artifact again and reassess its evidence, then run omd hash <artifact-path> --json before authoring an updated research receipt`);
  }
}

/** Bind the claim to the capture's actual source and image, not a filename or a declared gallery. */
function verifyCapture(root: string, item: { url: string; evidence: ResearchEvidence; capture: ResearchEvidence }, lane: 'domain' | 'design', purpose: 'retained' | 'navigation' = 'retained'): Record<string, unknown> {
  for (const receipt of [item.evidence, item.capture]) {
    if (!(receipt.path.startsWith(`.omd/refs/${lane}/`) || (purpose === 'navigation' && receipt.path.startsWith(`.omd/discovery/${lane}/`)))) fail('REFERENCE_RESEARCH_LANE_PATH_REQUIRED');
    if (purpose === 'retained' && !isRetainedReferencePath(receipt.path, lane)) fail('REFERENCE_RESEARCH_CAPTURE_PURPOSE');
    verifyEvidence(root, receipt);
  }
  if (!item.evidence.path.endsWith('.png') || !item.capture.path.endsWith('.json')) fail('REFERENCE_RESEARCH_CAPTURE_FORMAT');
  if (purpose === 'navigation' && item.evidence.path.startsWith('.omd/discovery/')) trustedDiscoveryImage(root, item.evidence.path);
  else trustedReferenceImage(root, item.evidence.path);
  const captured = record(JSON.parse(fileBytes(root, item.capture.path, 'REFERENCE_RESEARCH_CAPTURE_MISSING').toString('utf8')), 'REFERENCE_RESEARCH_CAPTURE_INVALID');
  if (purpose === 'retained' && ['reference-navigation-capture-v1', 'reference-navigation-capture-v2',
    'reference-discovery-entry-v1', 'reference-search-execution-v1'].some(schema => captured.schema === schema)) fail('REFERENCE_RESEARCH_CAPTURE_PURPOSE');
  if (captured.schemaVersion === 'image-fragment-v1') {
    const fragment = parseImageFragmentRecord(captured);
    if (lane !== 'design' || fragment.provenance.sourcePage !== item.url || fragment.imagePath !== item.evidence.path || fragment.sha256 !== item.evidence.sha256) fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
    requireDesignImageAdmission(root, fragment);
  } else if (captured.source !== item.url || captured.imagePath !== item.evidence.path || captured.researchLane !== lane
    || typeof captured.capturedAt !== 'string' || !Number.isFinite(Date.parse(captured.capturedAt))
    || !['page', 'component'].includes(captured.kind as string)) {
    fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
  }
  if (captured.schemaVersion !== 'image-fragment-v1') {
    const acquisition = record(captured.acquisition, 'REFERENCE_RESEARCH_ACQUISITION_REQUIRED');
    if (acquisition.requestedUrl !== item.url || typeof acquisition.finalUrl !== 'string'
      || typeof acquisition.httpStatus !== 'number' || acquisition.httpStatus < 200 || acquisition.httpStatus >= 300
      || !Array.isArray(acquisition.links)) fail('REFERENCE_RESEARCH_ACQUISITION_INVALID');
    if (acquisition.imageSha256 !== item.evidence.sha256) fail('REFERENCE_RESEARCH_CAPTURE_IMAGE_MISMATCH');
  }
  return captured;
}

/** Recomputes both lane outputs and refuses a one-lane or prose-only completion claim. */
export function validateReferenceResearch(
  root: string,
  research: ReferenceResearch,
  options: ValidationOptions,
): void {
  if (research.sourceContractSha256 !== options.expectedSourceContractSha256) {
    fail('REFERENCE_RESEARCH_SOURCE_CONTRACT_STALE');
  }
  const directRoots = { domain: readResearchDiscoveryRoots(root, research.domainReference), design: readResearchDiscoveryRoots(root, research.designReference) };
  const domainHosts = new Set(research.domainReference.sources.map(item => referenceServiceFamily(item.url)));
  for (const observation of directRoots.domain) for (const url of [observation.url, observation.finalUrl]) domainHosts.add(referenceServiceFamily(url));
  const retainedIdentities = new Map<string, string>();
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
    if (directRoots[lane].length) {
      if ([hop.evidence, hop.capture].some(receipt => !receipt.path.startsWith(`.omd/discovery/${lane}/navigation/`))) fail('REFERENCE_RESEARCH_NAVIGATION_NATIVE_REQUIRED');
      navigation[lane].push(readStrictDiscoveryNavigation(root, hop));
      continue;
    }
    const captured = verifyCapture(root, hop, lane, 'navigation');
    if (captured.schemaVersion === 'image-fragment-v1') fail('REFERENCE_RESEARCH_NAVIGATION_NATIVE_REQUIRED');
    observe(lane, hop.url, captured);
  }
  for (const item of research.domainReference.sources) {
    const captured = verifyCapture(root, item, 'domain');
    observe('domain', item.url, captured);
    const acquisition = captured.acquisition as Record<string, unknown>;
    domainHosts.add(referenceServiceFamily(acquisition.finalUrl as string));
  }
  const designUrls = [...research.designReference.sources.flatMap(item => item.discovery ? [item.url, item.discovery.url] : [item.url]),
    ...directRoots.design.flatMap(observation => [observation.url, observation.finalUrl])];
  if (designUrls.some(url => domainHosts.has(referenceServiceFamily(url)))) fail('REFERENCE_RESEARCH_LANE_REDIRECT_OVERLAP');
  for (const item of research.designReference.sources) {
    const source = verifyCapture(root, item, 'design');
    if (source.schemaVersion === 'image-fragment-v1' && typeof source.id === 'string') retainedIdentities.set(item.id, source.id);
    else if (typeof source.component === 'string') retainedIdentities.set(item.id, refIdentity(item.url, source.component));
    else fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
    const entry = verifyCapture(root, item.discovery!, 'design');
    observe('design', item.url, source);
    observe('design', item.discovery!.url, entry);
    for (const captured of [source, entry]) {
      const acquisition = captured.acquisition as Record<string, unknown> | undefined;
      if (acquisition && domainHosts.has(referenceServiceFamily(acquisition.finalUrl as string))) fail('REFERENCE_RESEARCH_LANE_REDIRECT_OVERLAP');
    }
    if (item.discovery!.kind !== 'user-provided' && entry.acquisition
      && designDiscoveryProvider((entry.acquisition as Record<string, unknown>).finalUrl as string) === null) fail('REFERENCE_RESEARCH_DISCOVERY_REDIRECT: final page is not a supported gallery item');
    if (item.discovery!.kind === 'user-provided' && entry.origin !== 'user') {
      fail('REFERENCE_RESEARCH_USER_SOURCE_REQUIRED: user-provided discovery needs an actual --from-user capture');
    }
    if (item.discovery!.url !== item.url) {
      const acquisition = record(entry.acquisition, 'REFERENCE_RESEARCH_DISCOVERY_LINK_REQUIRED');
      if (!Array.isArray(acquisition.links) || !acquisition.links.includes(item.url)) fail('REFERENCE_RESEARCH_DISCOVERY_LINK_MISMATCH');
    }
    for (const [captured, url] of [[source, item.url], [entry, item.discovery!.url]] as const) {
      if (captured.schemaVersion === 'image-fragment-v1') continue;
      const reference = references.find(ref => ref.researchLane === 'design' && ref.source === url && ref.component === captured.component);
      if (!reference) fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
      requireDesignReferenceAdmission(root, reference, { references });
    }
  }
  for (const lane of ['domain', 'design'] as const) {
    const entry = research[lane === 'domain' ? 'domainReference' : 'designReference'];
    const sourceUrls = lane === 'domain' ? entry.sources.map(item => item.url)
      : entry.sources.filter(item => item.discovery?.kind !== 'user-provided').map(item => item.discovery!.url);
    if (directRoots[lane].length) validateDiscoveryCoverage(root, { lane, queries: entry.queries, searches: entry.searches, sourceUrls, navigation: navigation[lane], directRoots: directRoots[lane] });
    else validateSearchCoverage(root, lane, entry.queries, entry.searches, sourceUrls, navigation[lane]);
  }
  const boardBytes = fileBytes(root, '.omd/reference-board.json', 'REFERENCE_RESEARCH_BOARD_MISSING');
  if (createHash('sha256').update(boardBytes).digest('hex') !== research.designReference.boardSha256) {
    fail('REFERENCE_RESEARCH_BOARD_STALE');
  }
  const board = readReferenceBoardArtifacts(root);
  const retained = new Set(research.designReference.sources.filter(item => item.visualRole === 'visual-direction').map(item => `${item.evidence.path}:${item.evidence.sha256}`));
  if (board.raw.candidates.some(candidate => !candidate.pieces.some(piece =>
    'imagePath' in piece.evidence && 'imageSha256' in piece.evidence
    && retained.has(`${piece.evidence.imagePath}:${piece.evidence.imageSha256}`)))) {
    fail('REFERENCE_RESEARCH_BOARD_DESIGN_COVERAGE: every candidate must actually use visual-direction evidence, not component-support alone');
  }
  for (const candidate of board.resolved.candidates) for (const piece of candidate.pieces) {
    if (piece.sourceKind === 'classified-reference') continue;
    if (piece.sourceKind === 'component-capture') requireDesignReferenceAdmission(root, piece.reference, { references });
    const raw = board.raw.candidates.find(row => row.id === candidate.id)?.pieces.find(row => row.slotId === piece.slotId);
    const sourceUrl = piece.sourceKind === 'component-capture' ? piece.reference.source : piece.provenance.sourcePage;
    if (!raw || !('imagePath' in raw.evidence) || !('imageSha256' in raw.evidence)) fail('REFERENCE_RESEARCH_BOARD_SOURCE_COVERAGE');
    const image = raw.evidence;
    if (!research.designReference.sources.some(item => item.url === sourceUrl && retainedIdentities.get(item.id) === piece.referenceId
        && item.evidence.path === image.imagePath && item.evidence.sha256 === image.imageSha256)) {
      fail('REFERENCE_RESEARCH_BOARD_SOURCE_COVERAGE: every visual board piece must bind a qualified retained source and its image');
    }
  }

  if (!options.benchmarkRequired) {
    if (research.domainReference.benchmarkSha256 !== null) {
      const benchmark = parseTaskFlowBenchmark(JSON.parse(fileBytes(
        root,
        '.omd/task-flow-benchmark.json',
        'REFERENCE_RESEARCH_BENCHMARK_MISSING',
      ).toString('utf8')), { expectedSourceContractSha256: options.expectedSourceContractSha256 });
      validateTaskFlowBenchmarkEvidence(root, benchmark);
      if (taskFlowBenchmarkSha256(benchmark) !== research.domainReference.benchmarkSha256) {
        fail('REFERENCE_RESEARCH_BENCHMARK_STALE');
      }
    }
    return;
  }
  if (research.domainReference.benchmarkSha256 === null) fail('REFERENCE_RESEARCH_BENCHMARK_REQUIRED');
  const benchmark = parseTaskFlowBenchmark(JSON.parse(fileBytes(
    root,
    '.omd/task-flow-benchmark.json',
    'REFERENCE_RESEARCH_BENCHMARK_MISSING',
  ).toString('utf8')), { expectedSourceContractSha256: options.expectedSourceContractSha256 });
  const strength = validateTaskFlowBenchmarkEvidence(root, benchmark);
  if (!strength.liveFlowVerified) fail('REFERENCE_RESEARCH_NATIVE_FLOW_REQUIRED: selected product benchmark needs signed native execution for every declared completed flow; use omd benchmark record, retain honest blocked/excluded targets, and never relabel artifact prose as execution');
  if (taskFlowBenchmarkSha256(benchmark) !== research.domainReference.benchmarkSha256) {
    fail('REFERENCE_RESEARCH_BENCHMARK_STALE');
  }
  const domainUrls = new Set(research.domainReference.sources.map((entry) => entry.url));
  if (benchmark.sources.some((entry) => !domainUrls.has(entry.url))) {
    fail('REFERENCE_RESEARCH_BENCHMARK_SOURCE_COVERAGE');
  }
}
