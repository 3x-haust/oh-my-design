import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { readReferenceBoardArtifacts } from './board-artifacts.ts';
import {
  parseTaskFlowBenchmark,
  taskFlowBenchmarkSha256,
  validateTaskFlowBenchmarkEvidence,
} from './task-flow-benchmark.ts';

export const REFERENCE_RESEARCH_SCHEMA = 'reference-research-v1' as const;
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

function source(value: unknown): ResearchSource {
  const input = record(value, 'REFERENCE_RESEARCH_SOURCE_INVALID');
  exactKeys(input, REFERENCE_RESEARCH_SOURCE_KEYS, 'REFERENCE_RESEARCH_SOURCE_KEYS');
  const observedAt = text(input.observedAt, 'REFERENCE_RESEARCH_OBSERVED_AT');
  if (!DATE.test(observedAt)) fail('REFERENCE_RESEARCH_OBSERVED_AT');
  return Object.freeze({
    id: text(input.id, 'REFERENCE_RESEARCH_SOURCE_ID'),
    url: httpsUrl(input.url),
    observedAt,
    decision: text(input.decision, 'REFERENCE_RESEARCH_DECISION'),
    finding: text(input.finding, 'REFERENCE_RESEARCH_FINDING'),
    evidence: evidence(input.evidence),
  });
}

function lane(value: unknown, keys: readonly string[], code: string): ResearchLane & Record<string, unknown> {
  const input = record(value, code);
  exactKeys(input, keys, `${code}_KEYS`);
  if (!Array.isArray(input.sources) || input.sources.length === 0) fail(`${code}_SOURCE_COVERAGE`);
  const sources = input.sources.map(source);
  if (new Set(sources.map((entry) => entry.id)).size !== sources.length) fail(`${code}_SOURCE_DUPLICATE`);
  return { ...input, queries: texts(input.queries, `${code}_QUERY`), sources };
}

export function parseReferenceResearch(value: unknown): ReferenceResearch {
  const input = record(value, 'REFERENCE_RESEARCH_INVALID');
  exactKeys(input, REFERENCE_RESEARCH_KEYS, 'REFERENCE_RESEARCH_KEYS');
  if (input.schema !== REFERENCE_RESEARCH_SCHEMA) fail('REFERENCE_RESEARCH_SCHEMA');
  const sourceContractSha256 = digest(input.sourceContractSha256, 'REFERENCE_RESEARCH_SOURCE_CONTRACT_SHA');
  const domain = lane(input.domainReference, REFERENCE_RESEARCH_DOMAIN_KEYS, 'REFERENCE_RESEARCH_DOMAIN');
  const design = lane(input.designReference, REFERENCE_RESEARCH_DESIGN_KEYS, 'REFERENCE_RESEARCH_DESIGN');
  const benchmarkSha256 = domain.benchmarkSha256 === null
    ? null
    : digest(domain.benchmarkSha256, 'REFERENCE_RESEARCH_BENCHMARK_SHA');
  const boardSha256 = digest(design.boardSha256, 'REFERENCE_RESEARCH_BOARD_SHA');
  const domainEvidence = new Set(domain.sources.map((entry) => `${entry.evidence.path}:${entry.evidence.sha256}`));
  if (design.sources.some((entry) => domainEvidence.has(`${entry.evidence.path}:${entry.evidence.sha256}`))) {
    fail('REFERENCE_RESEARCH_LANE_EVIDENCE_REUSED');
  }
  return Object.freeze({
    schema: REFERENCE_RESEARCH_SCHEMA,
    sourceContractSha256,
    domainReference: Object.freeze({ queries: domain.queries, sources: domain.sources, benchmarkSha256 }),
    designReference: Object.freeze({ queries: design.queries, sources: design.sources, boardSha256 }),
  });
}

function fileBytes(root: string, path: string, code: string): Buffer {
  const projectRoot = resolve(root);
  const absolute = resolve(projectRoot, path);
  if (absolute === projectRoot || !absolute.startsWith(`${projectRoot}${sep}`)) fail('REFERENCE_RESEARCH_EVIDENCE_PATH');
  try {
    return readFileSync(absolute);
  } catch {
    fail(code);
  }
}

function verifyEvidence(root: string, item: ResearchEvidence): void {
  const bytes = fileBytes(root, item.path, 'REFERENCE_RESEARCH_EVIDENCE_MISSING');
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) fail('REFERENCE_RESEARCH_EVIDENCE_STALE');
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
  for (const item of [...research.domainReference.sources, ...research.designReference.sources]) {
    verifyEvidence(root, item.evidence);
  }
  const boardBytes = fileBytes(root, '.omd/reference-board.json', 'REFERENCE_RESEARCH_BOARD_MISSING');
  if (createHash('sha256').update(boardBytes).digest('hex') !== research.designReference.boardSha256) {
    fail('REFERENCE_RESEARCH_BOARD_STALE');
  }
  readReferenceBoardArtifacts(root);

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
