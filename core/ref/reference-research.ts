import { createHash } from 'node:crypto';
import { isAbsolute, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readReferenceBoardArtifacts } from './board-artifacts.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { parseImageFragmentRecord } from './image-fragment-parser.ts';
import { trustedReferenceImage } from './board-security.ts';
import {
  parseTaskFlowBenchmark,
  taskFlowBenchmarkSha256,
  validateTaskFlowBenchmarkEvidence,
} from './task-flow-benchmark.ts';

export const REFERENCE_RESEARCH_SCHEMA = 'reference-research-v3' as const;
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
  sources: readonly ResearchSource[];
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
  exactKeys(input, design ? [...REFERENCE_RESEARCH_SOURCE_KEYS, 'discovery'] : REFERENCE_RESEARCH_SOURCE_KEYS, 'REFERENCE_RESEARCH_SOURCE_KEYS');
  const observedAt = text(input.observedAt, 'REFERENCE_RESEARCH_OBSERVED_AT');
  if (!DATE.test(observedAt)) fail('REFERENCE_RESEARCH_OBSERVED_AT');
  let discovery: ResearchSource['discovery'];
  if (design) {
    const entry = record(input.discovery, 'REFERENCE_RESEARCH_DESIGN_DISCOVERY_REQUIRED');
    exactKeys(entry, ['url', 'kind', 'access', 'qualityReason', 'evidence', 'capture'], 'REFERENCE_RESEARCH_DESIGN_DISCOVERY_KEYS');
    if (!['app-gallery', 'web-gallery', 'visual-bookmark', 'user-provided'].includes(entry.kind as string)) fail('REFERENCE_RESEARCH_DESIGN_DISCOVERY_KIND');
    if (entry.access !== 'free') fail('REFERENCE_RESEARCH_DESIGN_FREE_ACCESS_REQUIRED');
    const entryUrl = httpsUrl(entry.url);
    const entryPath = new URL(entryUrl).pathname.replace(/\/+$/, '') || '/';
    if (entry.kind !== 'user-provided' && ['/', '/landing', '/home', '/explore', '/search', '/search/pins'].includes(entryPath)) {
      fail('REFERENCE_RESEARCH_DISCOVERY_ENTRY_REQUIRED: capture the inspected gallery item, not its homepage');
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
  });
}

function lane(value: unknown, keys: readonly string[], code: string, design = false): ResearchLane & Record<string, unknown> {
  const input = record(value, code);
  exactKeys(input, keys, `${code}_KEYS`);
  if (!Array.isArray(input.sources) || input.sources.length === 0) fail(`${code}_SOURCE_COVERAGE`);
  const sources = input.sources.map(value => source(value, design));
  if (new Set(sources.map((entry) => entry.id)).size !== sources.length) fail(`${code}_SOURCE_DUPLICATE`);
  return { ...input, queries: texts(input.queries, `${code}_QUERY`), sources };
}

export function parseReferenceResearch(value: unknown): ReferenceResearch {
  const input = record(value, 'REFERENCE_RESEARCH_INVALID');
  if (input.schema === 'reference-research-v1' || input.schema === 'reference-research-v2') fail('REFERENCE_RESEARCH_UPGRADE_REQUIRED: use omd schema reference-research; recollect lane-separated source and gallery-entry captures and republish with omd ref research-set');
  exactKeys(input, REFERENCE_RESEARCH_KEYS, 'REFERENCE_RESEARCH_KEYS');
  if (input.schema !== REFERENCE_RESEARCH_SCHEMA) fail('REFERENCE_RESEARCH_SCHEMA');
  const sourceContractSha256 = digest(input.sourceContractSha256, 'REFERENCE_RESEARCH_SOURCE_CONTRACT_SHA');
  const domain = lane(input.domainReference, REFERENCE_RESEARCH_DOMAIN_KEYS, 'REFERENCE_RESEARCH_DOMAIN');
  const design = lane(input.designReference, REFERENCE_RESEARCH_DESIGN_KEYS, 'REFERENCE_RESEARCH_DESIGN', true);
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
    domainReference: Object.freeze({ queries: domain.queries, sources: domain.sources, benchmarkSha256 }),
    designReference: Object.freeze({ queries: design.queries, sources: design.sources, boardSha256 }),
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
  for (const [path, value] of Object.entries(referenceResearchArtifacts(research))) {
    writer.write(path, `${JSON.stringify(value, null, 2)}\n`);
  }
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
  for (const item of research.domainReference.sources) verifyCapture(root, item, 'domain');
  for (const item of research.designReference.sources) {
    verifyCapture(root, item, 'design');
    const entry = verifyCapture(root, item.discovery!, 'design');
    if (item.discovery!.kind === 'user-provided' && entry.origin !== 'user') {
      fail('REFERENCE_RESEARCH_USER_SOURCE_REQUIRED: user-provided discovery needs an actual --from-user capture');
    }
    if (item.discovery!.url !== item.url) {
      const acquisition = record(entry.acquisition, 'REFERENCE_RESEARCH_DISCOVERY_LINK_REQUIRED');
      if (!Array.isArray(acquisition.links) || !acquisition.links.includes(item.url)) fail('REFERENCE_RESEARCH_DISCOVERY_LINK_MISMATCH');
    }
  }
  const boardBytes = fileBytes(root, '.omd/reference-board.json', 'REFERENCE_RESEARCH_BOARD_MISSING');
  if (createHash('sha256').update(boardBytes).digest('hex') !== research.designReference.boardSha256) {
    fail('REFERENCE_RESEARCH_BOARD_STALE');
  }
  const board = readReferenceBoardArtifacts(root);
  const retained = new Set(research.designReference.sources.map(item => `${item.evidence.path}:${item.evidence.sha256}`));
  if (board.raw.candidates.some(candidate => !candidate.pieces.some(piece =>
    'imagePath' in piece.evidence && 'imageSha256' in piece.evidence
    && retained.has(`${piece.evidence.imagePath}:${piece.evidence.imageSha256}`)))) {
    fail('REFERENCE_RESEARCH_BOARD_DESIGN_COVERAGE: every candidate must actually use retained design evidence');
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
  validateTaskFlowBenchmarkEvidence(root, benchmark);
  if (taskFlowBenchmarkSha256(benchmark) !== research.domainReference.benchmarkSha256) {
    fail('REFERENCE_RESEARCH_BENCHMARK_STALE');
  }
  const domainUrls = new Set(research.domainReference.sources.map((entry) => entry.url));
  if (benchmark.sources.some((entry) => !domainUrls.has(entry.url))) {
    fail('REFERENCE_RESEARCH_BENCHMARK_SOURCE_COVERAGE');
  }
}
