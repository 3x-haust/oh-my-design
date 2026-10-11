import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';

export const DEVELOPER_EVALUATION_SNAPSHOT_SCHEMA = 'developer-evaluation-snapshot-v1';

export type DeveloperEvaluationNamespace = 'real' | 'fixture';
export type ComparisonChoice = 'a' | 'b' | 'tie' | 'neither' | 'uncertain';
export type Satisfaction = 'satisfied' | 'mixed' | 'unsatisfied' | 'uncertain';
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type DeveloperEvaluationScope = Readonly<{
  route: string;
  surface: string;
  task: string;
}>;
export type InterviewOption = Readonly<{ id: string; label: string }>;
export type InterviewQuestion = Readonly<{
  id: string;
  prompt: string;
  options: readonly InterviewOption[];
}>;
export type InterviewAnswer = Readonly<{
  questionId: string;
  optionIds: readonly string[];
  text: string | null;
}>;
export type InterviewResponse = Readonly<{
  questions: readonly InterviewQuestion[];
  answers: readonly InterviewAnswer[];
}>;
export type ComparedImage = Readonly<{ path: string; sha256: string }>;
export type EvaluationRole =
  | Readonly<{ kind: 'development' }>
  | Readonly<{
    kind: 'held-out';
    candidateRecordId: string;
    candidateImage: 'a' | 'b';
    caseDecision: 'approve' | 'reject' | 'uncertain';
  }>;
export type DeveloperEvaluationRecordInput = Readonly<{
  recordId: string;
  requestId: string;
  taskId: string;
  capturedAt: string;
  scope: DeveloperEvaluationScope;
  role: EvaluationRole;
  images: Readonly<{ a: ComparedImage; b: ComparedImage }>;
  humanResponse: Readonly<{
    interview: InterviewResponse;
    comparisonChoice: ComparisonChoice;
    satisfaction: Satisfaction;
    postChange: InterviewResponse;
  }>;
  relations: Readonly<{ references: readonly string[]; design: readonly string[] }>;
  changes: Readonly<{ attempted: readonly string[]; preserved: readonly string[] }>;
  modelInterpretation: Readonly<{ summary: string; advisory: readonly string[] }>;
  experiment: Readonly<{
    model: string;
    settings: JsonValue;
    budget: Readonly<{ unit: string; limit: number }>;
    criteriaVersion: string;
  }>;
  reuse: Readonly<{
    consent: 'allow-private-advisory-reuse' | 'deny';
    scope: DeveloperEvaluationScope;
  }>;
}>;
export type DeveloperEvaluationRecord = Readonly<DeveloperEvaluationRecordInput & {
  schema: 'developer-evaluation-record-v1';
  namespace: DeveloperEvaluationNamespace;
  revision: number;
  revisesSha256: string | null;
  revisionReason: string | null;
  revisedAt: string | null;
  recordSha256: string;
}>;
export type DeveloperEvaluationRevocation = Readonly<{
  schema: 'developer-evaluation-revocation-v1';
  namespace: DeveloperEvaluationNamespace;
  recordId: string;
  recordSha256: string;
  revokedAt: string;
  reason: string;
  revocationSha256: string;
}>;
export type DeveloperEvaluationCaseProjection = Readonly<{
  caseId: string;
  sourceRecordSha256: string;
  heldOutRecordSha256s: readonly string[];
  scope: DeveloperEvaluationScope;
  developerSignal: Readonly<{
    comparisonChoice: ComparisonChoice;
    satisfaction: Satisfaction;
  }>;
  designRelations: readonly string[];
  changeSummary: Readonly<{
    attempted: readonly string[];
    preserved: readonly string[];
  }>;
  advisory: readonly string[];
  advisorySource: 'model-interpretation';
  applicability: 'advisory';
  authority: 'none';
  currentRequestPrecedence: 'always';
}>;
export type DeveloperEvaluationCase = Readonly<DeveloperEvaluationCaseProjection & {
  schema: 'developer-evaluation-case-v1';
  namespace: 'real';
  promotedAt: string;
}>;
export type DeveloperEvaluationSnapshot = Readonly<{
  schema: typeof DEVELOPER_EVALUATION_SNAPSHOT_SCHEMA;
  snapshotId: string;
  requestRunId: string;
  pinnedAt: string;
  cases: readonly DeveloperEvaluationCaseProjection[];
  digest: string;
}>;

export class DeveloperEvaluationError extends Error {
  override readonly name = 'DeveloperEvaluationError';
}

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const own = (value: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new DeveloperEvaluationError(`${label} must be a plain object`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join('\0') !== [...keys].sort().join('\0')) {
    throw new DeveloperEvaluationError(`${label} has unknown or missing fields`);
  }
  return record;
};
const text = (value: unknown, label: string, max = 2048): string => {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > max) {
    throw new DeveloperEvaluationError(`${label} must be non-empty trimmed text`);
  }
  return value;
};
const id = (value: unknown, label: string): string => {
  const result = text(value, label, 128);
  if (!ID.test(result)) throw new DeveloperEvaluationError(`${label} is invalid`);
  return result;
};
const timestamp = (value: unknown, label: string): string => {
  const result = text(value, label, 64);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    throw new DeveloperEvaluationError(`${label} must be a canonical ISO timestamp`);
  }
  return result;
};
const hash = (value: unknown, label: string): string => {
  const result = text(value, label, 64);
  if (!HASH.test(result)) throw new DeveloperEvaluationError(`${label} must be a SHA-256 digest`);
  return result;
};
const stringArray = (value: unknown, label: string, max = 32): readonly string[] => {
  if (!Array.isArray(value) || value.length > max) throw new DeveloperEvaluationError(`${label} must be a bounded array`);
  return Object.freeze(value.map((entry, index) => text(entry, `${label}[${index}]`)));
};
const safeProjectionStrings = (value: unknown, label: string, minimum = 0): readonly string[] => {
  const result = stringArray(value, label, 16);
  if (result.length < minimum || result.some((entry) =>
    entry.includes('/') || entry.includes('\\') || entry.includes('://') || entry.includes('\0'))) {
    throw new DeveloperEvaluationError(`${label} must contain path-free role-safe summaries`);
  }
  return result;
};
export function parseDeveloperEvaluationScope(value: unknown, label = 'scope'): DeveloperEvaluationScope {
  const item = own(value, ['route', 'surface', 'task'], label);
  const route = text(item.route, `${label}.route`, 1024);
  if (!route.startsWith('/') || route.includes('?') || route.includes('#') || route.includes('\\')
    || route.split('/').includes('..')) throw new DeveloperEvaluationError(`${label}.route is invalid`);
  return Object.freeze({
    route,
    surface: id(item.surface, `${label}.surface`),
    task: id(item.task, `${label}.task`),
  });
}
const parseProjection = (value: unknown, label: string): DeveloperEvaluationCaseProjection => {
  const item = own(value, [
    'caseId', 'sourceRecordSha256', 'heldOutRecordSha256s', 'scope', 'developerSignal',
    'designRelations', 'changeSummary', 'advisory', 'advisorySource',
    'applicability', 'authority', 'currentRequestPrecedence',
  ], label);
  if (item.applicability !== 'advisory' || item.authority !== 'none'
    || item.currentRequestPrecedence !== 'always' || item.advisorySource !== 'model-interpretation') {
    throw new DeveloperEvaluationError(`${label} cannot grant evaluation cases authority`);
  }
  const heldOutRecordSha256s = stringArray(item.heldOutRecordSha256s, `${label}.heldOutRecordSha256s`, 16);
  heldOutRecordSha256s.forEach((entry, index) => hash(entry, `${label}.heldOutRecordSha256s[${index}]`));
  if (heldOutRecordSha256s.length < 2 || new Set(heldOutRecordSha256s).size !== heldOutRecordSha256s.length) {
    throw new DeveloperEvaluationError(`${label} needs distinct held-out records`);
  }
  const signal = own(item.developerSignal, ['comparisonChoice', 'satisfaction'], `${label}.developerSignal`);
  if (!['a', 'b', 'tie', 'neither', 'uncertain'].includes(signal.comparisonChoice as string)
    || !['satisfied', 'mixed', 'unsatisfied', 'uncertain'].includes(signal.satisfaction as string)) {
    throw new DeveloperEvaluationError(`${label}.developerSignal is invalid`);
  }
  const changes = own(item.changeSummary, ['attempted', 'preserved'], `${label}.changeSummary`);
  return Object.freeze({
    caseId: hash(item.caseId, `${label}.caseId`),
    sourceRecordSha256: hash(item.sourceRecordSha256, `${label}.sourceRecordSha256`),
    heldOutRecordSha256s,
    scope: parseDeveloperEvaluationScope(item.scope, `${label}.scope`),
    developerSignal: Object.freeze({
      comparisonChoice: signal.comparisonChoice as ComparisonChoice,
      satisfaction: signal.satisfaction as Satisfaction,
    }),
    designRelations: safeProjectionStrings(item.designRelations, `${label}.designRelations`),
    changeSummary: Object.freeze({
      attempted: safeProjectionStrings(changes.attempted, `${label}.changeSummary.attempted`),
      preserved: safeProjectionStrings(changes.preserved, `${label}.changeSummary.preserved`),
    }),
    advisory: safeProjectionStrings(item.advisory, `${label}.advisory`, 1),
    advisorySource: 'model-interpretation',
    applicability: 'advisory',
    authority: 'none',
    currentRequestPrecedence: 'always',
  });
};

export function parseDeveloperEvaluationSnapshot(value: unknown): DeveloperEvaluationSnapshot {
  const item = own(value, ['schema', 'snapshotId', 'requestRunId', 'pinnedAt', 'cases', 'digest'], 'snapshot');
  if (item.schema !== DEVELOPER_EVALUATION_SNAPSHOT_SCHEMA) {
    throw new DeveloperEvaluationError('snapshot.schema is invalid');
  }
  if (!Array.isArray(item.cases) || item.cases.length > 128) {
    throw new DeveloperEvaluationError('snapshot.cases must be a bounded array');
  }
  const cases = Object.freeze(item.cases.map((entry, index) => parseProjection(entry, `snapshot.cases[${index}]`)));
  if (new Set(cases.map((entry) => entry.caseId)).size !== cases.length) {
    throw new DeveloperEvaluationError('snapshot cases must be unique');
  }
  const snapshot = {
    schema: DEVELOPER_EVALUATION_SNAPSHOT_SCHEMA,
    requestRunId: id(item.requestRunId, 'snapshot.requestRunId'),
    pinnedAt: timestamp(item.pinnedAt, 'snapshot.pinnedAt'),
    cases,
  } as const;
  const snapshotId = hash(item.snapshotId, 'snapshot.snapshotId');
  const digest = hash(item.digest, 'snapshot.digest');
  if (digest !== sha256(canonicalJson(snapshot)) || snapshotId !== digest) {
    throw new DeveloperEvaluationError('snapshot digest does not match its safe advisory content');
  }
  return Object.freeze({ ...snapshot, snapshotId, digest });
}

export function selectDeveloperEvaluationCases(
  snapshot: DeveloperEvaluationSnapshot,
  scope: DeveloperEvaluationScope,
  limit = 3,
): readonly DeveloperEvaluationCaseProjection[] {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 3) {
    throw new DeveloperEvaluationError('developer evaluation case selection is bounded to at most three');
  }
  const selectedScope = parseDeveloperEvaluationScope(scope);
  const key = canonicalJson(selectedScope);
  return Object.freeze(snapshot.cases.filter((entry) => canonicalJson(entry.scope) === key).slice(0, limit));
}
