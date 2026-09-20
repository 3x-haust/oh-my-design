import { createHash } from 'node:crypto';
import { isAbsolute, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readReferenceBoardArtifacts } from './board-artifacts.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { parseImageFragmentRecord } from './image-fragment-parser.ts';
import { trustedReferenceImage } from './board-security.ts';
import { designDiscoveryProvider, referenceServiceHost } from './design-discovery-sources.ts';
import { validateSearchCoverage, type ObservedNavigation } from './search-execution.ts';
import {
  parseTaskFlowBenchmark,
  taskFlowBenchmarkSha256,
  validateTaskFlowBenchmarkEvidence,
} from './task-flow-benchmark.ts';

export const REFERENCE_RESEARCH_SCHEMA = 'reference-research-v5' as const;
export const DOMAIN_REFERENCES_PATH = '.omd/refs/domain/research.json';
export const DESIGN_REFERENCES_PATH = '.omd/refs/design/research.json';
export const REFERENCE_RESEARCH_PATH = '.omd/reference-research.json';
export const REFERENCE_RESEARCH_KEYS = [
  'schema',
  'sourceContractSha256',
  'domainReference',
  'designReference',
] as const;
export const REFERENCE_RESEARCH_LANE_KEYS = [
  'queries',
  'searches',
  'sources',
] as const;
export const REFERENCE_RESEARCH_DOMAIN_KEYS = [
  ...REFERENCE_RESEARCH_LANE_KEYS,
  'benchmarkSha256',
] as const;
export const REFERENCE_RESEARCH_DESIGN_KEYS = [
  ...REFERENCE_RESEARCH_LANE_KEYS,
  'boardSha256',
] as const;
export const REFERENCE_RESEARCH_SOURCE_KEYS = [
  'id',
  'url',
  'observedAt',
  'decision',
  'finding',
  'evidence',
  'capture',
] as const;
export const REFERENCE_RESEARCH_EVIDENCE_KEYS = ['path', 'sha256'] as const;

const SHA256 = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type ResearchEvidence = Readonly<{ path: string; sha256: string }>;
type ResearchSource = Readonly<{
  id: string;
  url: string;
  observedAt: string;
  decision: string;
  finding: string;
  evidence: ResearchEvidence;
  capture: ResearchEvidence;
  visualRole?: 'visual-direction' | 'component-support';
  visualAssessment?: Readonly<Record<'composition' | 'typography' | 'density' | 'imagery' | 'transfer' | 'avoid', string>>;
  discovery?: Readonly<{
    url: string;
    kind: 'app-gallery' | 'web-gallery' | 'visual-bookmark' | 'user-provided';
    access: 'free';
    qualityReason: string;
    evidence: ResearchEvidence;
    capture: ResearchEvidence;
  }>;
}>;
type ResearchLane = Readonly<{
  queries: readonly string[];
  searches: readonly ResearchEvidence[];
  sources: readonly ResearchSource[];
  navigation?: readonly Readonly<{ url: string; evidence: ResearchEvidence; capture: ResearchEvidence }>[];
}>;
export type ReferenceResearch = Readonly<{
  schema: typeof REFERENCE_RESEARCH_SCHEMA;
  sourceContractSha256: string;
  domainReference: ResearchLane & Readonly<{ benchmarkSha256: string | null }>;
  designReference: ResearchLane & Readonly<{ boardSha256: string }>;
}>;

type ValidationOptions = Readonly<{
  expectedSourceContractSha256: string;
  benchmarkRequired: boolean;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function text(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function digest(value: unknown, code: string): string {
  const parsed = text(value, code);
  if (!SHA256.test(parsed)) fail(code);
  return parsed;
}

function texts(value: unknown, code: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) fail(code);
  const parsed = value.map((entry) => text(entry, code));
  if (new Set(parsed).size !== parsed.length) fail(`${code}_DUPLICATE`);
  return parsed;
}

function httpsUrl(value: unknown): string {
  const parsed = text(value, 'REFERENCE_RESEARCH_SOURCE_URL');
  try {
    if (new URL(parsed).protocol !== 'https:') fail('REFERENCE_RESEARCH_SOURCE_URL');
  } catch {
    fail('REFERENCE_RESEARCH_SOURCE_URL');
  }
  return parsed;
}

function evidence(value: unknown): ResearchEvidence {
  const input = record(value, 'REFERENCE_RESEARCH_EVIDENCE_INVALID');
  exactKeys(input, REFERENCE_RESEARCH_EVIDENCE_KEYS, 'REFERENCE_RESEARCH_EVIDENCE_KEYS');
  const path = text(input.path, 'REFERENCE_RESEARCH_EVIDENCE_PATH');
  if (isAbsolute(path) || path.includes('\\') || path.split('/').includes('..') || !path.startsWith('.omd/refs/')) {
    fail('REFERENCE_RESEARCH_EVIDENCE_PATH');
  }
  return Object.freeze({ path, sha256: digest(input.sha256, 'REFERENCE_RESEARCH_EVIDENCE_SHA') });
}

function source(value: unknown, design: boolean): ResearchSource {
  const input = record(value, 'REFERENCE_RESEARCH_SOURCE_INVALID');
  exactKeys(input, design ? [...REFERENCE_RESEARCH_SOURCE_KEYS, 'discovery', 'visualRole', 'visualAssessment'] : REFERENCE_RESEARCH_SOURCE_KEYS, 'REFERENCE_RESEARCH_SOURCE_KEYS');
  const observedAt = text(input.observedAt, 'REFERENCE_RESEARCH_OBSERVED_AT');
  if (!DATE.test(observedAt)) fail('REFERENCE_RESEARCH_OBSERVED_AT');
  let discovery: ResearchSource['discovery'];
  let visualAssessment: ResearchSource['visualAssessment'];
  if (design) {
    if (!['visual-direction', 'component-support'].includes(input.visualRole as string)) fail('REFERENCE_RESEARCH_VISUAL_ROLE');
    const assessment = record(input.visualAssessment, 'REFERENCE_RESEARCH_VISUAL_ASSESSMENT');
    const axes = ['composition', 'typography', 'density', 'imagery', 'transfer', 'avoid'] as const;
    exactKeys(assessment, axes, 'REFERENCE_RESEARCH_VISUAL_ASSESSMENT_KEYS');
    visualAssessment = Object.freeze(Object.fromEntries(axes.map(axis => [axis, text(assessment[axis], `REFERENCE_RESEARCH_VISUAL_${axis.toUpperCase()}`)]))) as ResearchSource['visualAssessment'];
    const entry = record(input.discovery, 'REFERENCE_RESEARCH_DESIGN_DISCOVERY_REQUIRED');
    exactKeys(entry, ['url', 'kind', 'access', 'qualityReason', 'evidence', 'capture'], 'REFERENCE_RESEARCH_DESIGN_DISCOVERY_KEYS');
    if (!['app-gallery', 'web-gallery', 'visual-bookmark', 'user-provided'].includes(entry.kind as string)) fail('REFERENCE_RESEARCH_DESIGN_DISCOVERY_KIND');
    if (entry.access !== 'free') fail('REFERENCE_RESEARCH_DESIGN_FREE_ACCESS_REQUIRED');
    const entryUrl = httpsUrl(entry.url);
    const entryPath = new URL(entryUrl).pathname.replace(/\/+$/, '') || '/';
    if (entry.kind !== 'user-provided' && ['/', '/landing', '/home', '/explore', '/search', '/search/pins'].includes(entryPath)) {
      fail('REFERENCE_RESEARCH_DISCOVERY_ENTRY_REQUIRED: capture the inspected gallery item, not its homepage');
    }
    if (entry.kind !== 'user-provided' && designDiscoveryProvider(entryUrl) === null) {
      fail('REFERENCE_RESEARCH_DISCOVERY_PROVIDER: use an inspected Pinterest/Dribbble/Behance/Siteinspire/Land-book/Godly/UI Bowl item; a service or documentation page is not a gallery');
    }
    discovery = Object.freeze({
      url: entryUrl, kind: entry.kind as NonNullable<ResearchSource['discovery']>['kind'],
      access: 'free', qualityReason: text(entry.qualityReason, 'REFERENCE_RESEARCH_DESIGN_QUALITY_REASON'),
      evidence: evidence(entry.evidence), capture: evidence(entry.capture),
    });
  }
  return Object.freeze({
    id: text(input.id, 'REFERENCE_RESEARCH_SOURCE_ID'),
    url: httpsUrl(input.url),
    observedAt,
    decision: text(input.decision, 'REFERENCE_RESEARCH_DECISION'),
    finding: text(input.finding, 'REFERENCE_RESEARCH_FINDING'),
    evidence: evidence(input.evidence),
    capture: evidence(input.capture),
    ...(discovery ? { discovery } : {}),
    ...(design ? { visualRole: input.visualRole as NonNullable<ResearchSource['visualRole']>, visualAssessment: visualAssessment! } : {}),
  });
}

function lane(value: unknown, keys: readonly string[], code: string, design = false): ResearchLane & Record<string, unknown> {
  const input = record(value, code);
  exactKeys(input, Object.hasOwn(input, 'navigation') ? [...keys, 'navigation'] : keys, `${code}_KEYS`);
  if (!Array.isArray(input.sources) || input.sources.length === 0) fail(`${code}_SOURCE_COVERAGE`);
  const sources = input.sources.map(value => source(value, design));
  if (new Set(sources.map((entry) => entry.id)).size !== sources.length) fail(`${code}_SOURCE_DUPLICATE`);
  if (!Array.isArray(input.searches) || !input.searches.length || Object.keys(input.searches).length !== input.searches.length) fail('REFERENCE_RESEARCH_SEARCH_EXECUTION_REQUIRED');
  const navigation = input.navigation;
  if (navigation !== undefined && (!Array.isArray(navigation) || navigation.length > 100 || Object.keys(navigation).length !== navigation.length)) fail('REFERENCE_RESEARCH_NAVIGATION_INVALID');
  return { ...input, queries: texts(input.queries, `${code}_QUERY`), searches: input.searches.map(evidence), sources,
    ...(navigation === undefined ? {} : { navigation: (navigation as unknown[]).map(value => {
      const hop = record(value, 'REFERENCE_RESEARCH_NAVIGATION_INVALID');
      exactKeys(hop, ['url', 'evidence', 'capture'], 'REFERENCE_RESEARCH_NAVIGATION_KEYS');
      return { url: httpsUrl(hop.url), evidence: evidence(hop.evidence), capture: evidence(hop.capture) };
    }) }) };
}

export function parseReferenceResearch(value: unknown): ReferenceResearch {
  const input = record(value, 'REFERENCE_RESEARCH_INVALID');
  if (['reference-research-v1', 'reference-research-v2', 'reference-research-v3', 'reference-research-v4'].includes(input.schema as string)) fail('REFERENCE_RESEARCH_UPGRADE_REQUIRED: use omd schema reference-research; retain valid captures, run omd ref search for executed-query evidence, and republish with omd ref research-set');
  exactKeys(input, REFERENCE_RESEARCH_KEYS, 'REFERENCE_RESEARCH_KEYS');
  if (input.schema !== REFERENCE_RESEARCH_SCHEMA) fail('REFERENCE_RESEARCH_SCHEMA');
  const sourceContractSha256 = digest(input.sourceContractSha256, 'REFERENCE_RESEARCH_SOURCE_CONTRACT_SHA');
  const domain = lane(input.domainReference, REFERENCE_RESEARCH_DOMAIN_KEYS, 'REFERENCE_RESEARCH_DOMAIN');
  const design = lane(input.designReference, REFERENCE_RESEARCH_DESIGN_KEYS, 'REFERENCE_RESEARCH_DESIGN', true);
  const directions = design.sources.filter(entry => entry.visualRole === 'visual-direction');
  if (directions.length === 0) fail('REFERENCE_RESEARCH_VISUAL_DIRECTION_REQUIRED: component/usability documentation alone cannot establish visual direction');
  // Independent services, not two crops/pages of one service. This is a lane policy, not a beauty score.
  const domainHosts = new Set(domain.sources.map(entry => referenceServiceHost(entry.url)));
  if (design.sources.some(entry => [entry.url, entry.discovery!.url].some(url => domainHosts.has(referenceServiceHost(url))))) {
    fail('REFERENCE_RESEARCH_DOMAIN_AS_VISUAL_DIRECTION: domain and design must use independent service hosts; keep the domain capture and discover a separate visual source');
  }
  const benchmarkSha256 = domain.benchmarkSha256 === null
    ? null
    : digest(domain.benchmarkSha256, 'REFERENCE_RESEARCH_BENCHMARK_SHA');
  const boardSha256 = digest(design.boardSha256, 'REFERENCE_RESEARCH_BOARD_SHA');
  const domainPaths = new Set(domain.sources.map(entry => entry.evidence.path));
  const domainHashes = new Set(domain.sources.map(entry => entry.evidence.sha256));
  if (design.sources.some(entry => [entry.evidence, entry.discovery!.evidence].some(item => domainPaths.has(item.path) || domainHashes.has(item.sha256)))) {
    fail('REFERENCE_RESEARCH_LANE_EVIDENCE_REUSED');
  }
  return Object.freeze({
    schema: REFERENCE_RESEARCH_SCHEMA,
    sourceContractSha256,
    domainReference: Object.freeze({ queries: domain.queries, searches: domain.searches, sources: domain.sources, ...(domain.navigation === undefined ? {} : { navigation: domain.navigation }), benchmarkSha256 }),
    designReference: Object.freeze({ queries: design.queries, searches: design.searches, sources: design.sources, ...(design.navigation === undefined ? {} : { navigation: design.navigation }), boardSha256 }),
  });
}

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
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) fail('REFERENCE_RESEARCH_EVIDENCE_STALE');
}

/** Bind the claim to the capture's actual source and image, not a filename or a declared gallery. */
function verifyCapture(root: string, item: { url: string; evidence: ResearchEvidence; capture: ResearchEvidence }, lane: 'domain' | 'design'): Record<string, unknown> {
  for (const receipt of [item.evidence, item.capture]) {
    if (!receipt.path.startsWith(`.omd/refs/${lane}/`)) fail('REFERENCE_RESEARCH_LANE_PATH_REQUIRED');
    verifyEvidence(root, receipt);
  }
  if (!item.evidence.path.endsWith('.png') || !item.capture.path.endsWith('.json')) fail('REFERENCE_RESEARCH_CAPTURE_FORMAT');
  trustedReferenceImage(root, item.evidence.path);
  const captured = record(JSON.parse(fileBytes(root, item.capture.path, 'REFERENCE_RESEARCH_CAPTURE_MISSING').toString('utf8')), 'REFERENCE_RESEARCH_CAPTURE_INVALID');
  if (captured.schemaVersion === 'image-fragment-v1') {
    const fragment = parseImageFragmentRecord(captured);
    if (lane !== 'design' || fragment.provenance.sourcePage !== item.url || fragment.imagePath !== item.evidence.path || fragment.sha256 !== item.evidence.sha256) fail('REFERENCE_RESEARCH_CAPTURE_SOURCE_MISMATCH');
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
  const domainFinalHosts = new Set<string>();
  const navigation: Record<'domain' | 'design', ObservedNavigation[]> = { domain: [], design: [] };
  const observe = (lane: 'domain' | 'design', url: string, captured: Record<string, unknown>) => {
    if (captured.schemaVersion === 'image-fragment-v1') return;
    const acquisition = captured.acquisition as { finalUrl: string; links: unknown[] };
    navigation[lane].push({ url, finalUrl: httpsUrl(acquisition.finalUrl), links: acquisition.links.filter((link): link is string => {
      try { return typeof link === 'string' && new URL(link).protocol === 'https:'; } catch { return false; }
    }) });
  };
  for (const lane of ['domain', 'design'] as const) for (const hop of research[lane === 'domain' ? 'domainReference' : 'designReference'].navigation ?? []) {
    const captured = verifyCapture(root, hop, lane);
    if (captured.schemaVersion === 'image-fragment-v1') fail('REFERENCE_RESEARCH_NAVIGATION_NATIVE_REQUIRED');
    observe(lane, hop.url, captured);
  }
  for (const item of research.domainReference.sources) {
    const captured = verifyCapture(root, item, 'domain');
    observe('domain', item.url, captured);
    const acquisition = captured.acquisition as Record<string, unknown>;
    domainFinalHosts.add(referenceServiceHost(acquisition.finalUrl as string));
  }
  for (const item of research.designReference.sources) {
    const source = verifyCapture(root, item, 'design');
    const entry = verifyCapture(root, item.discovery!, 'design');
    observe('design', item.url, source);
    observe('design', item.discovery!.url, entry);
    for (const captured of [source, entry]) {
      const acquisition = captured.acquisition as Record<string, unknown> | undefined;
      if (acquisition && domainFinalHosts.has(referenceServiceHost(acquisition.finalUrl as string))) fail('REFERENCE_RESEARCH_LANE_REDIRECT_OVERLAP');
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
  }
  validateSearchCoverage(root, 'domain', research.domainReference.queries, research.domainReference.searches,
    research.domainReference.sources.map(item => item.url), navigation.domain);
  validateSearchCoverage(root, 'design', research.designReference.queries, research.designReference.searches,
    research.designReference.sources.filter(item => item.discovery!.kind !== 'user-provided').map(item => item.discovery!.url), navigation.design);
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
