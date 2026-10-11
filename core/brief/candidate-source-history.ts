import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';

import { canonicalJson } from '../ref/board-artifacts.ts';
import {
  materializeProjectTree,
  readLocalFileNoFollow,
  type ProjectTreeSnapshot,
} from '../render/serve.ts';
import {
  requireProjectWriteAdapter,
  type ProjectWriteAdapter,
} from '../runtime/project-write.ts';

export const CANDIDATE_SOURCE_CAPTURE_SCHEMA = 'candidate-source-capture-v1' as const;
export const CANDIDATE_SOURCE_HISTORY_SCHEMA = 'candidate-source-history-v1' as const;
export const CANDIDATE_SOURCE_HISTORY_REFERENCE_SCHEMA =
  'candidate-source-history-reference-v1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const HISTORY_ROOT = '.omd/candidate-source-history';
const INPUTS = Object.freeze([
  { kind: 'composition', path: '.omd/composition.md' },
  { kind: 'frame', path: '.omd/frame.md' },
  { kind: 'copy', path: '.omd/copy-deck.md' },
  { kind: 'type', path: '.omd/type-proof.md' },
] as const);

export type CandidateSourceInputKind = (typeof INPUTS)[number]['kind'];
export type CandidateSourceInputDigest = Readonly<{
  kind: CandidateSourceInputKind;
  path: (typeof INPUTS)[number]['path'];
  sha256: string;
}>;
export type CandidateSourceFile = Readonly<{
  path: string;
  sha256: string;
  byteLength: number;
}>;
export type CandidateSourceCapture = Readonly<{
  schema: typeof CANDIDATE_SOURCE_CAPTURE_SCHEMA;
  sourceEntryPath: string;
  treeSha256: string;
  files: readonly CandidateSourceFile[];
  inputDigests: readonly CandidateSourceInputDigest[];
}>;
export type CandidateSourceHistoryRecord = Readonly<{
  schema: typeof CANDIDATE_SOURCE_HISTORY_SCHEMA;
  sourceEntryPath: string;
  treeEntryPath: string;
  treeSha256: string;
  files: readonly CandidateSourceFile[];
  inputDigests: readonly CandidateSourceInputDigest[];
}>;
export type CandidateSourceHistoryReference = Readonly<{
  schema: typeof CANDIDATE_SOURCE_HISTORY_REFERENCE_SCHEMA;
  recordPath: string;
  recordSha256: string;
  treePath: string;
  treeSha256: string;
}>;
export type CandidateSourceHistorySnapshot = Readonly<{
  record: CandidateSourceHistoryRecord;
  files: ReadonlyMap<string, Buffer>;
}>;

type CapturedState = Readonly<{
  projectRoot: string;
  record: CandidateSourceHistoryRecord;
  files: ReadonlyMap<string, Buffer>;
}>;

const capturedStates = new WeakMap<CandidateSourceCapture, CapturedState>();

export class CandidateSourceHistoryError extends Error {
  override readonly name = 'CandidateSourceHistoryError';

  constructor(reason: string) {
    super(`CANDIDATE_SOURCE_HISTORY_INVALID: ${reason}`);
  }
}

const fail = (reason: string): never => {
  throw new CandidateSourceHistoryError(reason);
};
const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
};
const digest = (value: unknown, label: string): string =>
  typeof value === 'string' && SHA256.test(value) ? value : fail(`${label} is not a SHA-256 digest`);
const safeRelativePath = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value === '' || value.includes('\\') || value.includes('\0')
    || value.startsWith('/') || /^[A-Za-z]:\//.test(value)
    || value.split('/').some(part => part === '' || part === '.' || part === '..')) {
    return fail(`${label} must be a normalized relative path`);
  }
  return value;
};
const frozenFile = (path: string, bytes: Uint8Array): CandidateSourceFile =>
  Object.freeze({ path, sha256: hash(bytes), byteLength: bytes.byteLength });
const freezeInputs = (
  inputs: readonly CandidateSourceInputDigest[],
): readonly CandidateSourceInputDigest[] =>
  Object.freeze(inputs.map(input => Object.freeze({ ...input })));
const freezeFiles = (files: readonly CandidateSourceFile[]): readonly CandidateSourceFile[] =>
  Object.freeze(files.map(file => Object.freeze({ ...file })));

export function candidateSourceInputDigests(root: string): readonly CandidateSourceInputDigest[] {
  const inputs: CandidateSourceInputDigest[] = [];
  for (const input of INPUTS) {
    let bytes: Buffer;
    try {
      bytes = readLocalFileNoFollow(root, input.path);
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') continue;
      throw error;
    }
    inputs.push(Object.freeze({ ...input, sha256: hash(bytes) }));
  }
  return Object.freeze(inputs);
}

function recordFromSnapshot(
  sourceEntryPath: string,
  snapshot: ProjectTreeSnapshot,
  inputDigests: readonly CandidateSourceInputDigest[],
): CandidateSourceHistoryRecord {
  const files = [...snapshot.files.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([path, bytes]) => frozenFile(path, bytes));
  return Object.freeze({
    schema: CANDIDATE_SOURCE_HISTORY_SCHEMA,
    sourceEntryPath,
    treeEntryPath: basename(sourceEntryPath),
    treeSha256: snapshot.sha256,
    files: Object.freeze(files),
    inputDigests,
  });
}

/**
 * Captures the exact immutable byte tree that the renderer would serve, plus digests of the
 * source-free candidate inputs that actually exist. The returned capability is intentionally
 * process-local: only this capture can authorize persistence of its private byte snapshot.
 */
export function captureCandidateSourceTree(
  root: string,
  sourceEntryPath: string,
): CandidateSourceCapture {
  const snapshot = materializeProjectTree(root, sourceEntryPath);
  const inputDigests = candidateSourceInputDigests(root);
  const record = recordFromSnapshot(sourceEntryPath, snapshot, inputDigests);
  const capture = Object.freeze({
    schema: CANDIDATE_SOURCE_CAPTURE_SCHEMA,
    sourceEntryPath: record.sourceEntryPath,
    treeSha256: record.treeSha256,
    files: record.files,
    inputDigests: record.inputDigests,
  });
  capturedStates.set(capture, Object.freeze({
    projectRoot: realpathSync(root),
    record,
    files: new Map([...snapshot.files].map(([path, bytes]) => [path, Buffer.from(bytes)])),
  }));
  return capture;
}

function treePath(treeSha256: string): string {
  return `${HISTORY_ROOT}/trees/sha256-${treeSha256}`;
}
function recordPath(recordSha256: string): string {
  return `${HISTORY_ROOT}/records/sha256-${recordSha256}.json`;
}
function assertStoredTree(
  record: CandidateSourceHistoryRecord,
  stored: ProjectTreeSnapshot,
): void {
  if (stored.sha256 !== record.treeSha256) fail('stored tree does not match its digest');
  const actualPaths = [...stored.files.keys()].sort();
  if (actualPaths.length !== record.files.length
    || actualPaths.some((path, index) => path !== record.files[index]?.path)) {
    fail('stored tree file manifest changed');
  }
  for (const file of record.files) {
    const bytes = stored.files.get(file.path) ?? fail('stored tree file is missing');
    if (bytes.byteLength !== file.byteLength || hash(bytes) !== file.sha256) {
      fail('stored tree file bytes changed');
    }
  }
}

/**
 * Persists a captured tree under its served-tree digest and writes a canonical record under its
 * own digest. It does not alter, restore, or assign any status to the live candidate.
 */
export function persistCandidateSourceHistory(
  root: string,
  capture: CandidateSourceCapture,
  writer: ProjectWriteAdapter,
): CandidateSourceHistoryReference {
  const trusted = requireProjectWriteAdapter(root, writer);
  const state = capturedStates.get(capture) ?? fail('persistence requires a genuine current-process capture');
  if (state.projectRoot !== trusted.projectRoot) fail('capture belongs to a different project root');
  const storedTreePath = treePath(state.record.treeSha256);
  for (const [path, bytes] of state.files) {
    trusted.writeContentAddressed(`${storedTreePath}/${path}`, bytes);
  }
  const stored = materializeProjectTree(
    root,
    `${storedTreePath}/${state.record.treeEntryPath}`,
  );
  assertStoredTree(state.record, stored);
  const recordBytes = Buffer.from(canonicalJson(state.record));
  const recordSha256 = hash(recordBytes);
  const storedRecordPath = recordPath(recordSha256);
  trusted.writeContentAddressed(storedRecordPath, recordBytes);
  return Object.freeze({
    schema: CANDIDATE_SOURCE_HISTORY_REFERENCE_SCHEMA,
    recordPath: storedRecordPath,
    recordSha256,
    treePath: storedTreePath,
    treeSha256: state.record.treeSha256,
  });
}

function parseFile(value: unknown): CandidateSourceFile {
  if (!isRecord(value) || !exactKeys(value, ['byteLength', 'path', 'sha256'])) {
    return fail('record file has an invalid shape');
  }
  const path = safeRelativePath(value.path, 'record file path');
  const sha256 = digest(value.sha256, 'record file digest');
  if (typeof value.byteLength !== 'number' || !Number.isSafeInteger(value.byteLength) || value.byteLength < 0) {
    return fail('record file byte length is invalid');
  }
  return Object.freeze({ path, sha256, byteLength: value.byteLength });
}

function parseInput(value: unknown): CandidateSourceInputDigest {
  if (!isRecord(value) || !exactKeys(value, ['kind', 'path', 'sha256'])) {
    return fail('input digest has an invalid shape');
  }
  const expected = INPUTS.find(input => input.kind === value.kind);
  if (expected === undefined || value.path !== expected.path) {
    return fail('input digest is not a recognized source-free candidate input');
  }
  return Object.freeze({
    kind: expected.kind,
    path: expected.path,
    sha256: digest(value.sha256, 'input digest'),
  });
}

function parseRecord(value: unknown): CandidateSourceHistoryRecord {
  if (!isRecord(value) || !exactKeys(value, [
    'files',
    'inputDigests',
    'schema',
    'sourceEntryPath',
    'treeEntryPath',
    'treeSha256',
  ]) || value.schema !== CANDIDATE_SOURCE_HISTORY_SCHEMA
    || !Array.isArray(value.files) || !Array.isArray(value.inputDigests)) {
    return fail('record has an invalid shape');
  }
  const sourceEntryPath = safeRelativePath(value.sourceEntryPath, 'record source entry path');
  const treeEntryPath = safeRelativePath(value.treeEntryPath, 'record tree entry path');
  if (treeEntryPath !== basename(sourceEntryPath) || treeEntryPath.includes('/')) {
    fail('record tree entry does not match the source entry');
  }
  const files = value.files.map(parseFile);
  const paths = files.map(file => file.path);
  if (paths.length === 0 || new Set(paths).size !== paths.length
    || paths.some((path, index) => index > 0 && path <= paths[index - 1]!)) {
    fail('record files must be nonempty, unique, and sorted');
  }
  if (!paths.includes(treeEntryPath)) fail('record tree entry is missing from the file manifest');
  const inputDigests = value.inputDigests.map(parseInput);
  const inputOrder = inputDigests.map(input =>
    INPUTS.findIndex(expected => expected.kind === input.kind));
  if (new Set(inputOrder).size !== inputOrder.length
    || inputOrder.some((position, index) => index > 0 && position <= inputOrder[index - 1]!)) {
    fail('input digests must be unique and in canonical order');
  }
  return Object.freeze({
    schema: CANDIDATE_SOURCE_HISTORY_SCHEMA,
    sourceEntryPath,
    treeEntryPath,
    treeSha256: digest(value.treeSha256, 'record tree digest'),
    files: freezeFiles(files),
    inputDigests: freezeInputs(inputDigests),
  });
}

export function parseCandidateSourceHistoryReference(value: unknown): CandidateSourceHistoryReference {
  if (!isRecord(value) || !exactKeys(value, [
    'recordPath',
    'recordSha256',
    'schema',
    'treePath',
    'treeSha256',
  ]) || value.schema !== CANDIDATE_SOURCE_HISTORY_REFERENCE_SCHEMA) {
    return fail('reference has an invalid shape');
  }
  const recordSha256 = digest(value.recordSha256, 'reference record digest');
  const treeSha256 = digest(value.treeSha256, 'reference tree digest');
  if (value.recordPath !== recordPath(recordSha256)
    || value.treePath !== treePath(treeSha256)) {
    return fail('reference paths do not match their content identities');
  }
  return Object.freeze({
    schema: CANDIDATE_SOURCE_HISTORY_REFERENCE_SCHEMA,
    recordPath: value.recordPath,
    recordSha256,
    treePath: value.treePath,
    treeSha256,
  });
}

/**
 * Reads and validates only immutable history storage. Later edits to the live candidate and input
 * documents do not participate in validation.
 */
export function readCandidateSourceHistory(
  root: string,
  input: unknown,
): CandidateSourceHistorySnapshot {
  try {
    const reference = parseCandidateSourceHistoryReference(input);
    const recordBytes = readLocalFileNoFollow(root, reference.recordPath);
    if (hash(recordBytes) !== reference.recordSha256) fail('record bytes do not match their identity');
    let parsed: unknown;
    try {
      parsed = JSON.parse(recordBytes.toString('utf8'));
    } catch {
      return fail('record is not valid JSON');
    }
    const record = parseRecord(parsed);
    if (recordBytes.toString('utf8') !== canonicalJson(record)) fail('record is not canonical');
    if (record.treeSha256 !== reference.treeSha256) fail('record binds a different tree');
    const stored = materializeProjectTree(
      root,
      `${reference.treePath}/${record.treeEntryPath}`,
    );
    assertStoredTree(record, stored);
    return Object.freeze({
      record,
      files: new Map(
        [...stored.files.entries()]
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([path, bytes]) => [path, Buffer.from(bytes)]),
      ),
    });
  } catch (error) {
    if (error instanceof CandidateSourceHistoryError) throw error;
    return fail(error instanceof Error ? error.message : 'history could not be read safely');
  }
}
