import {
  closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import {
  DEVELOPER_EVALUATION_SNAPSHOT_SCHEMA,
  DeveloperEvaluationError,
  parseDeveloperEvaluationScope,
  parseDeveloperEvaluationSnapshot,
  type DeveloperEvaluationCase,
  type DeveloperEvaluationCaseProjection,
  type DeveloperEvaluationNamespace,
  type DeveloperEvaluationRecord,
  type DeveloperEvaluationRecordInput,
  type DeveloperEvaluationRevocation,
  type DeveloperEvaluationScope,
  type DeveloperEvaluationSnapshot,
} from './developer-evaluation-contract.ts';
import {
  parseDeveloperEvaluationInput,
  parseStoredDeveloperEvaluationInput,
} from './developer-evaluation-input.ts';

export * from './developer-evaluation-contract.ts';
export { parseDeveloperEvaluationInput, parseEvaluationInput } from './developer-evaluation-input.ts';

export type DeveloperEvaluationStore = Readonly<{
  directory: string;
  projectRoot: string;
  namespace: DeveloperEvaluationNamespace;
}>;
export type DeveloperEvaluationRevisionInput = Readonly<{
  reason: string;
  revisedAt: string;
  record: DeveloperEvaluationRecordInput;
}>;
export type DeveloperEvaluationRevocationInput = Readonly<{
  recordId: string;
  reason: string;
  revokedAt: string;
}>;
export type DeveloperEvaluationPromotionInput = Readonly<{
  recordId: string;
  heldOutRecordIds: readonly string[];
  promotedAt: string;
}>;
export type DeveloperEvaluationPinInput = Readonly<{
  requestRunId: string;
  caseIds: readonly string[];
  pinnedAt: string;
}>;

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const errorCode = (error: unknown): unknown => error !== null && typeof error === 'object'
  ? Reflect.get(error, 'code') : undefined;
const fail = (message: string): never => { throw new DeveloperEvaluationError(message); };
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => deepFreeze(Reflect.get(value, key)));
    Object.freeze(value);
  }
  return value;
};
const own = (value: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail(`${label} must be a plain object`);
  }
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('\0') !== [...keys].sort().join('\0')) {
    return fail(`${label} has unknown or missing fields`);
  }
  return item;
};
const text = (value: unknown, label: string, max = 2048): string => {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > max) {
    return fail(`${label} must be non-empty trimmed text`);
  }
  return value;
};
const id = (value: unknown, label: string): string => {
  const result = text(value, label, 128);
  if (!ID.test(result)) return fail(`${label} is invalid`);
  return result;
};
const timestamp = (value: unknown, label: string): string => {
  const result = text(value, label, 64);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) {
    return fail(`${label} must be a canonical ISO timestamp`);
  }
  return result;
};
const stringArray = (value: unknown, label: string, minimum = 0, maximum = 32): readonly string[] => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    return fail(`${label} must contain ${minimum}-${maximum} entries`);
  }
  const result = value.map((entry, index) => text(entry, `${label}[${index}]`));
  if (new Set(result).size !== result.length) return fail(`${label} must not contain duplicates`);
  return Object.freeze(result);
};
const same = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);
const roleSafeSummaries = (value: unknown, label: string, minimum = 0): readonly string[] => {
  const summaries = stringArray(value, label, minimum, 16);
  if (summaries.some((entry) => entry.includes('/') || entry.includes('\\') || entry.includes('://') || entry.includes('\0'))) {
    return fail(`${label} cannot contain source paths or URLs`);
  }
  return summaries;
};

export function resolveDeveloperEvaluationHome(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  home = homedir(),
): string {
  const configured = environment.OMD_EVALUATION_HOME;
  if (configured !== undefined) {
    if (!isAbsolute(configured)) return fail('OMD_EVALUATION_HOME must be an absolute path');
    return resolve(configured);
  }
  return join(resolve(home), '.config', 'oh-my-design', 'developer-evaluation');
}

function ensurePrivateDirectory(path: string, projectRoot: string): string {
  const absolute = resolve(path);
  if (!isAbsolute(path)) return fail('developer evaluation directory must be explicit and absolute');
  const missing: string[] = [];
  let current = absolute;
  while (!existsSync(current)) {
    missing.push(current);
    const parent = dirname(current);
    if (parent === current) return fail('developer evaluation directory has no existing ancestor');
    current = parent;
  }
  const existing = lstatSync(current);
  if (!existing.isDirectory() || existing.isSymbolicLink()) return fail('developer evaluation path must contain real directories');
  const canonical = resolve(realpathSync(current), relative(current, absolute));
  if (overlaps(projectRoot, canonical)) return fail('developer evaluation storage must be outside the project tree');
  if (missing.length === 0 && ((existing.mode & 0o077) !== 0
    || (typeof process.getuid === 'function' && existing.uid !== process.getuid()))) {
    return fail('developer evaluation directory must be private and caller-owned');
  }
  for (const directory of missing.reverse()) mkdirSync(directory, { mode: 0o700 });
  const stats = lstatSync(absolute);
  if ((stats.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && stats.uid !== process.getuid())) {
    return fail('developer evaluation directory must be private and caller-owned');
  }
  return realpathSync(absolute);
}
const overlaps = (left: string, right: string): boolean => {
  const fromLeft = relative(left, right);
  const fromRight = relative(right, left);
  const contained = (value: string): boolean => value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value));
  return contained(fromLeft) || contained(fromRight);
};
function ensureSubdirectory(parent: string, name: string): string {
  const path = join(parent, name);
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
    return fail('developer evaluation store subdirectories must be private real directories');
  }
  return path;
}

export function openDeveloperEvaluationStore(input: Readonly<{
  directory: string;
  projectRoot: string;
  namespace: DeveloperEvaluationNamespace;
}>): DeveloperEvaluationStore {
  if (input.namespace !== 'real' && input.namespace !== 'fixture') return fail('developer evaluation namespace is invalid');
  const projectRoot = realpathSync(resolve(input.projectRoot));
  const projectStats = lstatSync(projectRoot);
  if (!projectStats.isDirectory() || projectStats.isSymbolicLink()) return fail('project root must be a real directory');
  const directory = ensurePrivateDirectory(input.directory, projectRoot);
  if (overlaps(projectRoot, directory)) return fail('developer evaluation storage must be outside the project tree');
  const namespaces = ensureSubdirectory(directory, 'namespaces');
  const namespace = ensureSubdirectory(namespaces, input.namespace);
  for (const name of ['records', 'revocations', 'cases', 'snapshots']) ensureSubdirectory(namespace, name);
  return Object.freeze({ directory, projectRoot, namespace: input.namespace });
}

function directoryFor(store: DeveloperEvaluationStore, kind: 'records' | 'revocations' | 'cases' | 'snapshots'): string {
  return join(store.directory, 'namespaces', store.namespace, kind);
}
function readStablePrivateFile(path: string): Buffer {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    const entry = lstatSync(path);
    if (!before.isFile() || entry.isSymbolicLink() || !entry.isFile()
      || before.dev !== entry.dev || before.ino !== entry.ino || before.nlink !== 1 || entry.nlink !== 1
      || (entry.mode & 0o077) !== 0) return fail('developer evaluation record must be a private stable file');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== before.size) return fail('developer evaluation record changed while being read');
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
function writeImmutable(directory: string, digest: string, value: unknown): void {
  const bytes = canonicalJson(value);
  const path = join(directory, `sha256-${digest}.json`);
  try {
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (errorCode(error) !== 'EEXIST' || readStablePrivateFile(path).toString('utf8') !== bytes) throw error;
  }
}
function readJsonDirectory(directory: string): readonly unknown[] {
  return readdirSync(directory).sort().flatMap((name): readonly unknown[] => {
    if (!/^sha256-[a-f0-9]{64}\.json$/.test(name)) return [];
    const path = join(directory, name);
    const bytes = readStablePrivateFile(path).toString('utf8');
    try { return [JSON.parse(bytes) as unknown]; } catch { return fail('developer evaluation record is not JSON'); }
  });
}

function parseStoredRecord(value: unknown): DeveloperEvaluationRecord {
  const item = own(value, [
    'schema', 'namespace', 'revision', 'revisesSha256', 'revisionReason', 'revisedAt', 'recordSha256', 'recordId', 'requestId',
    'taskId', 'capturedAt', 'scope', 'role', 'images', 'humanResponse', 'relations', 'changes',
    'modelInterpretation', 'experiment', 'reuse',
  ], 'stored record');
  if (item.schema !== 'developer-evaluation-record-v1' || (item.namespace !== 'real' && item.namespace !== 'fixture')
    || !Number.isSafeInteger(item.revision) || (item.revision as number) < 1
    || (item.revisesSha256 !== null && (typeof item.revisesSha256 !== 'string' || !HASH.test(item.revisesSha256)))
    || (item.revisionReason !== null && typeof item.revisionReason !== 'string')
    || (item.revisedAt !== null && typeof item.revisedAt !== 'string')) {
    return fail('stored developer evaluation record metadata is invalid');
  }
  const input = parseStoredDeveloperEvaluationInput(Object.fromEntries(Object.entries(item).filter(([key]) => ![
    'schema', 'namespace', 'revision', 'revisesSha256', 'revisionReason', 'revisedAt', 'recordSha256',
  ].includes(key))));
  const unsigned = {
    schema: 'developer-evaluation-record-v1' as const,
    namespace: item.namespace as DeveloperEvaluationNamespace,
    revision: item.revision as number,
    revisesSha256: item.revisesSha256 as string | null,
    revisionReason: item.revisionReason === null ? null : text(item.revisionReason, 'stored record.revisionReason'),
    revisedAt: item.revisedAt === null ? null : timestamp(item.revisedAt, 'stored record.revisedAt'),
    ...input,
  };
  const origin = unsigned.revisesSha256 === null && unsigned.revisionReason === null && unsigned.revisedAt === null;
  const revision = unsigned.revisesSha256 !== null && unsigned.revisionReason !== null && unsigned.revisedAt !== null;
  if ((unsigned.revision === 1 && !origin) || (unsigned.revision > 1 && !revision)) {
    return fail('stored developer evaluation revision metadata is inconsistent');
  }
  if (typeof item.recordSha256 !== 'string' || item.recordSha256 !== sha256(canonicalJson(unsigned))) {
    return fail('stored developer evaluation record digest is invalid');
  }
  return deepFreeze({ ...unsigned, recordSha256: item.recordSha256 });
}
function records(store: DeveloperEvaluationStore): readonly DeveloperEvaluationRecord[] {
  return readJsonDirectory(directoryFor(store, 'records')).map(parseStoredRecord);
}
function recordState(store: DeveloperEvaluationStore): ReadonlyMap<string, DeveloperEvaluationRecord> {
  const result = new Map<string, DeveloperEvaluationRecord>();
  const ordered = [...records(store)].sort((left, right) =>
    left.recordId.localeCompare(right.recordId) || left.revision - right.revision);
  for (const record of ordered) {
    if (record.namespace !== store.namespace) return fail('developer evaluation record crossed namespaces');
    const previous = result.get(record.recordId);
    if (previous === undefined) {
      if (record.revision !== 1 || record.revisesSha256 !== null) return fail('developer evaluation revision chain has no origin');
      result.set(record.recordId, record);
    } else if (record.revision === previous.revision + 1 && record.revisesSha256 === previous.recordSha256) {
      result.set(record.recordId, record);
    } else return fail('developer evaluation revision chain is invalid');
  }
  return result;
}
function revocations(store: DeveloperEvaluationStore): readonly DeveloperEvaluationRevocation[] {
  return readJsonDirectory(directoryFor(store, 'revocations')).map((value) => {
    const item = own(value, ['schema', 'namespace', 'recordId', 'recordSha256', 'revokedAt', 'reason', 'revocationSha256'], 'revocation');
    if (item.schema !== 'developer-evaluation-revocation-v1' || item.namespace !== store.namespace) {
      return fail('developer evaluation revocation crossed namespaces');
    }
    const unsigned = {
      schema: 'developer-evaluation-revocation-v1' as const,
      namespace: store.namespace,
      recordId: id(item.recordId, 'revocation.recordId'),
      recordSha256: text(item.recordSha256, 'revocation.recordSha256', 64),
      revokedAt: timestamp(item.revokedAt, 'revocation.revokedAt'),
      reason: text(item.reason, 'revocation.reason'),
    };
    if (!HASH.test(unsigned.recordSha256) || typeof item.revocationSha256 !== 'string'
      || item.revocationSha256 !== sha256(canonicalJson(unsigned))) return fail('developer evaluation revocation digest is invalid');
    return Object.freeze({ ...unsigned, revocationSha256: item.revocationSha256 });
  });
}
function activeRecords(store: DeveloperEvaluationStore): ReadonlyMap<string, DeveloperEvaluationRecord> {
  const state = new Map(recordState(store));
  for (const revocation of revocations(store)) {
    const record = state.get(revocation.recordId);
    if (record === undefined || record.recordSha256 !== revocation.recordSha256) {
      return fail('developer evaluation revocation does not bind the active record');
    }
    state.delete(revocation.recordId);
  }
  return state;
}

export function readDeveloperEvaluationInput(store: DeveloperEvaluationStore, recordId: string): DeveloperEvaluationRecordInput {
  const record = activeRecords(store).get(recordId);
  if (record === undefined) return fail(`developer evaluation record is not active: ${recordId}`);
  const { schema: _schema, namespace: _namespace, revision: _revision,
    revisesSha256: _revises, revisionReason: _reason, revisedAt: _at, recordSha256: _sha,
    ...input } = record;
  return input;
}

function persistRecord(
  store: DeveloperEvaluationStore,
  input: DeveloperEvaluationRecordInput,
  revision: number,
  revisesSha256: string | null,
  revisionReason: string | null,
  revisedAt: string | null,
): DeveloperEvaluationRecord {
  const unsigned = {
    schema: 'developer-evaluation-record-v1' as const,
    namespace: store.namespace,
    revision,
    revisesSha256,
    revisionReason,
    revisedAt,
    ...input,
  };
  const record = deepFreeze({ ...unsigned, recordSha256: sha256(canonicalJson(unsigned)) });
  writeImmutable(directoryFor(store, 'records'), record.recordSha256, record);
  return record;
}
export function appendDeveloperEvaluation(
  store: DeveloperEvaluationStore,
  value: DeveloperEvaluationRecordInput,
): DeveloperEvaluationRecord {
  const input = parseDeveloperEvaluationInput(value);
  if (recordState(store).has(input.recordId)) return fail(`developer evaluation record already exists: ${input.recordId}`);
  return persistRecord(store, input, 1, null, null, null);
}
export function reviseDeveloperEvaluation(
  store: DeveloperEvaluationStore,
  value: DeveloperEvaluationRevisionInput,
): DeveloperEvaluationRecord {
  const item = own(value, ['reason', 'revisedAt', 'record'], 'revision');
  const reason = text(item.reason, 'revision.reason');
  const revisedAt = timestamp(item.revisedAt, 'revision.revisedAt');
  const input = parseDeveloperEvaluationInput(item.record);
  const previous = activeRecords(store).get(input.recordId);
  if (previous === undefined) return fail(`developer evaluation record is not active: ${input.recordId}`);
  if (previous.requestId !== input.requestId || previous.taskId !== input.taskId || !same(previous.role, input.role)) {
    return fail('developer evaluation revision cannot change request, task, or evaluation role identity');
  }
  return persistRecord(store, input, previous.revision + 1, previous.recordSha256, reason, revisedAt);
}
export function revokeDeveloperEvaluation(
  store: DeveloperEvaluationStore,
  value: DeveloperEvaluationRevocationInput,
): DeveloperEvaluationRevocation {
  const item = own(value, ['recordId', 'reason', 'revokedAt'], 'revocation input');
  const recordId = id(item.recordId, 'revocation input.recordId');
  const record = activeRecords(store).get(recordId);
  if (record === undefined) return fail(`developer evaluation record is not active: ${recordId}`);
  const unsigned = {
    schema: 'developer-evaluation-revocation-v1' as const,
    namespace: store.namespace,
    recordId,
    recordSha256: record.recordSha256,
    revokedAt: timestamp(item.revokedAt, 'revocation input.revokedAt'),
    reason: text(item.reason, 'revocation input.reason'),
  };
  const revocation = Object.freeze({ ...unsigned, revocationSha256: sha256(canonicalJson(unsigned)) });
  writeImmutable(directoryFor(store, 'revocations'), revocation.revocationSha256, revocation);
  return revocation;
}

function parseCase(store: DeveloperEvaluationStore, value: unknown): DeveloperEvaluationCase {
  const item = own(value, [
    'schema', 'namespace', 'caseId', 'sourceRecordSha256', 'heldOutRecordSha256s', 'scope',
    'developerSignal', 'designRelations', 'changeSummary', 'advisory', 'advisorySource',
    'applicability', 'authority', 'currentRequestPrecedence', 'promotedAt',
  ], 'developer evaluation case');
  if (item.schema !== 'developer-evaluation-case-v1' || item.namespace !== 'real' || store.namespace !== 'real'
    || item.applicability !== 'advisory' || item.authority !== 'none' || item.currentRequestPrecedence !== 'always'
    || item.advisorySource !== 'model-interpretation') {
    return fail('developer evaluation case metadata is invalid');
  }
  const heldOutRecordSha256s = stringArray(item.heldOutRecordSha256s, 'case.heldOutRecordSha256s', 2, 16);
  if (heldOutRecordSha256s.some((digest) => !HASH.test(digest))) return fail('case held-out digest is invalid');
  const signal = own(item.developerSignal, ['comparisonChoice', 'satisfaction'], 'case.developerSignal');
  if (!['a', 'b', 'tie', 'neither', 'uncertain'].includes(signal.comparisonChoice as string)
    || !['satisfied', 'mixed', 'unsatisfied', 'uncertain'].includes(signal.satisfaction as string)) {
    return fail('case developer signal is invalid');
  }
  const changes = own(item.changeSummary, ['attempted', 'preserved'], 'case.changeSummary');
  const core = {
    sourceRecordSha256: text(item.sourceRecordSha256, 'case.sourceRecordSha256', 64),
    heldOutRecordSha256s,
    scope: parseDeveloperEvaluationScope(item.scope),
    developerSignal: Object.freeze({
      comparisonChoice: signal.comparisonChoice as DeveloperEvaluationRecordInput['humanResponse']['comparisonChoice'],
      satisfaction: signal.satisfaction as DeveloperEvaluationRecordInput['humanResponse']['satisfaction'],
    }),
    designRelations: roleSafeSummaries(item.designRelations, 'case.designRelations'),
    changeSummary: Object.freeze({
      attempted: roleSafeSummaries(changes.attempted, 'case.changeSummary.attempted'),
      preserved: roleSafeSummaries(changes.preserved, 'case.changeSummary.preserved'),
    }),
    advisory: roleSafeSummaries(item.advisory, 'case.advisory', 1),
    advisorySource: 'model-interpretation' as const,
    promotedAt: timestamp(item.promotedAt, 'case.promotedAt'),
  };
  if (!HASH.test(core.sourceRecordSha256)) return fail('case source digest is invalid');
  const caseId = sha256(canonicalJson(core));
  if (item.caseId !== caseId) return fail('developer evaluation case digest is invalid');
  return deepFreeze({
    schema: 'developer-evaluation-case-v1',
    namespace: 'real',
    caseId,
    ...core,
    applicability: 'advisory',
    authority: 'none',
    currentRequestPrecedence: 'always',
  });
}
function cases(store: DeveloperEvaluationStore): readonly DeveloperEvaluationCase[] {
  return readJsonDirectory(directoryFor(store, 'cases')).map((entry) => parseCase(store, entry));
}
export function promoteDeveloperEvaluationCase(
  store: DeveloperEvaluationStore,
  value: DeveloperEvaluationPromotionInput,
): DeveloperEvaluationCase {
  if (store.namespace !== 'real') return fail('fixture developer evaluations can never promote into the real namespace');
  const item = own(value, ['recordId', 'heldOutRecordIds', 'promotedAt'], 'promotion');
  const recordId = id(item.recordId, 'promotion.recordId');
  const heldOutIds = stringArray(item.heldOutRecordIds, 'promotion.heldOutRecordIds', 2, 16).map((entry) => id(entry, 'promotion held-out record id'));
  const active = activeRecords(store);
  const source = active.get(recordId);
  if (source === undefined || source.role.kind !== 'development') return fail('promotion source must be an active development record');
  if (source.reuse.consent !== 'allow-private-advisory-reuse') return fail('promotion source has no private advisory reuse consent');
  if (source.modelInterpretation.advisory.length === 0) return fail('promotion source needs a separately recorded model advisory');
  if (source.experiment.budget.unit === 'unmeasured' || source.experiment.budget.limit <= 0) {
    return fail('promotion requires measured experiment metadata');
  }
  const heldOut = heldOutIds.map((heldOutId) => {
    const record = active.get(heldOutId);
    if (record === undefined || record.role.kind !== 'held-out'
      || record.role.candidateRecordId !== source.recordId || record.role.caseDecision !== 'approve') {
      return fail('promotion requires explicit approving held-out evaluation records');
    }
    if (record.humanResponse.comparisonChoice !== record.role.candidateImage
      || record.humanResponse.satisfaction !== 'satisfied') {
      return fail('promotion held-out responses must favor the declared candidate and be satisfied');
    }
    if (!same(record.scope, source.scope) || !same(record.reuse.scope, source.scope)
      || record.reuse.consent !== 'allow-private-advisory-reuse') {
      return fail('promotion held-out records must have exact matching scope and consent');
    }
    if (!same(record.experiment, source.experiment)) {
      return fail('promotion records must share the same measured experiment contract');
    }
    return record;
  });
  const requestIds = [source.requestId, ...heldOut.map((record) => record.requestId)];
  if (new Set(requestIds).size !== requestIds.length) {
    return fail('promotion requires held-out evaluations from different requests');
  }
  const core = {
    sourceRecordSha256: source.recordSha256,
    heldOutRecordSha256s: Object.freeze(heldOut.map((record) => record.recordSha256)),
    scope: source.scope,
    developerSignal: Object.freeze({
      comparisonChoice: source.humanResponse.comparisonChoice,
      satisfaction: source.humanResponse.satisfaction,
    }),
    designRelations: roleSafeSummaries(source.relations.design, 'promotion design relations'),
    changeSummary: Object.freeze({
      attempted: roleSafeSummaries(source.changes.attempted, 'promotion attempted changes'),
      preserved: roleSafeSummaries(source.changes.preserved, 'promotion preserved changes'),
    }),
    advisory: roleSafeSummaries(source.modelInterpretation.advisory, 'promotion model advisory', 1),
    advisorySource: 'model-interpretation' as const,
    promotedAt: timestamp(item.promotedAt, 'promotion.promotedAt'),
  };
  const promoted = deepFreeze({
    schema: 'developer-evaluation-case-v1' as const,
    namespace: 'real' as const,
    caseId: sha256(canonicalJson(core)),
    ...core,
    applicability: 'advisory' as const,
    authority: 'none' as const,
    currentRequestPrecedence: 'always' as const,
  });
  writeImmutable(directoryFor(store, 'cases'), promoted.caseId, promoted);
  return promoted;
}
function projection(value: DeveloperEvaluationCase): DeveloperEvaluationCaseProjection {
  return deepFreeze({
    caseId: value.caseId,
    sourceRecordSha256: value.sourceRecordSha256,
    heldOutRecordSha256s: [...value.heldOutRecordSha256s],
    scope: { ...value.scope },
    developerSignal: { ...value.developerSignal },
    designRelations: [...value.designRelations],
    changeSummary: {
      attempted: [...value.changeSummary.attempted],
      preserved: [...value.changeSummary.preserved],
    },
    advisory: [...value.advisory],
    advisorySource: 'model-interpretation',
    applicability: 'advisory',
    authority: 'none',
    currentRequestPrecedence: 'always',
  });
}
function activeCase(store: DeveloperEvaluationStore, value: DeveloperEvaluationCase): boolean {
  const active = [...activeRecords(store).values()];
  const digests = new Set(active.map((record) => record.recordSha256));
  return digests.has(value.sourceRecordSha256) && value.heldOutRecordSha256s.every((digest) => digests.has(digest));
}
export function pinDeveloperEvaluationSnapshot(
  store: DeveloperEvaluationStore,
  value: DeveloperEvaluationPinInput,
): DeveloperEvaluationSnapshot {
  if (store.namespace !== 'real') return fail('fixture developer evaluations cannot produce real snapshots');
  const item = own(value, ['requestRunId', 'caseIds', 'pinnedAt'], 'snapshot pin');
  const caseIds = stringArray(item.caseIds, 'snapshot pin.caseIds', 0, 128);
  if (caseIds.some((caseId) => !HASH.test(caseId))) return fail('snapshot pin case id is invalid');
  const available = new Map(cases(store).map((entry) => [entry.caseId, entry]));
  const selected = caseIds.map((caseId) => {
    const found = available.get(caseId);
    if (found === undefined || !activeCase(store, found)) return fail(`developer evaluation case is not active: ${caseId}`);
    return projection(found);
  });
  const core = {
    schema: DEVELOPER_EVALUATION_SNAPSHOT_SCHEMA,
    requestRunId: id(item.requestRunId, 'snapshot pin.requestRunId'),
    pinnedAt: timestamp(item.pinnedAt, 'snapshot pin.pinnedAt'),
    cases: Object.freeze(selected),
  } as const;
  const digest = sha256(canonicalJson(core));
  const snapshotId = digest;
  const snapshot = parseDeveloperEvaluationSnapshot({ ...core, snapshotId, digest });
  writeImmutable(directoryFor(store, 'snapshots'), snapshot.digest, snapshot);
  return snapshot;
}
export function readDeveloperEvaluationSnapshot(
  store: DeveloperEvaluationStore,
  snapshotId: string,
): DeveloperEvaluationSnapshot {
  if (!HASH.test(snapshotId)) return fail('developer evaluation snapshot id is invalid');
  const path = join(directoryFor(store, 'snapshots'), `sha256-${snapshotId}.json`);
  if (!existsSync(path)) return fail(`developer evaluation snapshot does not exist: ${snapshotId}`);
  const bytes = readStablePrivateFile(path).toString('utf8');
  try {
    const snapshot = parseDeveloperEvaluationSnapshot(JSON.parse(bytes));
    const available = new Map(cases(store).map((entry) => [entry.caseId, entry]));
    for (const selected of snapshot.cases) {
      const evaluationCase = available.get(selected.caseId);
      if (evaluationCase === undefined || !activeCase(store, evaluationCase)
        || !same(selected, projection(evaluationCase))) {
        return fail(`developer evaluation snapshot references an inactive case: ${selected.caseId}`);
      }
    }
    return snapshot;
  } catch (error) {
    if (error instanceof DeveloperEvaluationError) throw error;
    return fail('developer evaluation snapshot is not JSON');
  }
}
