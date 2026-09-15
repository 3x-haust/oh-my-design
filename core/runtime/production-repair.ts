import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { types as utilTypes } from 'node:util';

import {
  checkAdaptiveWorkflowProductionReadiness,
  checkAdaptiveWorkflowProductionSlice,
} from '../design-development/workflow-persistence.ts';
import { parseWorkflowProductionSlice, workflowProductionSliceBytes } from '../design-development/production-slice.ts';
import { canonicalWorkflowPlanJson } from '../design-development/workflow-plan.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { pathsOutsideScope } from '../route/adaptive-route-record.ts';
import {
  requireFinalReviewerLaneAuthorization,
  requireProductionOwnerRepairAuthorization,
  type ProjectRunInvocation,
} from './invocation.ts';
import { observationV2Sha256, validateObservationV2 } from './observation.ts';
import {
  acquireProjectMutationLock,
  createExternalPrivateMirror,
  replaceProjectFileAtomically,
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from './project-write.ts';
import {
  nodeStableProjectFileSystem,
  readStableProjectFile,
} from './stable-project-file.ts';

const SHA256 = /^[a-f0-9]{64}$/;
const JOURNAL_PATH = '.omd/.production-repair.journal';
const ROLLBACK_JOURNAL_PATH = '.omd/.production-repair-rollback.journal';
const HANDOFF_PATH = '.omd/observation-v2-repair-predecessor.json';
const fs = nodeStableProjectFileSystem();

export type ProductionRepairErrorCode =
  | 'MALFORMED_REPAIR_PATH'
  | 'MALFORMED_REPAIR_REVIEW'
  | 'MALFORMED_STAGED_REPAIR'
  | 'REPAIR_PATH_OUTSIDE_ROUTE'
  | 'REPAIR_SLICE_REQUIRED'
  | 'STALE_REPAIR_BASE'
  | 'NO_OP_REPAIR'
  | 'MULTI_FILE_REPAIR'
  | 'REPAIR_OWNER_RECEIPT_REQUIRED'
  | 'REPAIR_OWNER_RECEIPT_STALE'
  | 'REPAIR_OWNER_RECEIPT_REPLAY'
  | 'UNRESOLVED_REPAIR_JOURNAL'
  | 'REPAIR_ROLLBACK_REVIEW_INVALID'
  | 'REPAIR_ROLLBACK_STALE'
  | 'UNRESOLVED_REPAIR_ROLLBACK_JOURNAL';

export class ProductionRepairError extends Error {
  readonly code: ProductionRepairErrorCode;

  constructor(code: ProductionRepairErrorCode) {
    super(code);
    this.name = 'ProductionRepairError';
    this.code = code;
  }
}

export type ProductionRepairOutcome = Readonly<{
  status: 'committed';
  path: string;
  mode: number;
  beforeTreeSha256: string;
  afterTreeSha256: string;
  outcomePath: string;
}>;

export type ProductionRepairReview = Readonly<{
  schema: 'production-repair-review-v1';
  observationPointerSha256: string;
  retentionPointerSha256: string | null;
  beforeSha256: string;
  afterSha256: string;
  suggestedPaths: readonly string[];
  findingIds: readonly string[];
}>;

/** Opaque, process-local result of comparing a private mirror with the authenticated production slice. */
export type StagedProductionRepair = Readonly<{ schema: 'opaque-staged-production-repair-v1' }>;

type StageRecord = Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  review: ProductionRepairReview;
  reviewBytes: string;
  path: string;
  before: Buffer;
  after: Buffer;
  beforeSha256: string;
  afterSha256: string;
  mode: number;
  routeSha256: string;
  sliceSha256: string;
  observationPointerSha256: string;
  ownerReceiptSha256: string;
}>;

const stagedRepairs = new WeakMap<StagedProductionRepair, StageRecord>();
const consumedStages = new WeakSet<StagedProductionRepair>();

type ValidatedReview = Readonly<{
  review: ProductionRepairReview;
  paths: readonly string[];
  bytes: string;
}>;

function descriptorValues(value: unknown, keys: readonly string[]): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try { descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>; }
  catch { throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW'); }
  const own = Reflect.ownKeys(descriptors);
  if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key))) {
    throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
  }
  const result = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
    }
    result.set(key, descriptor.value);
  }
  return result;
}

function descriptorArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
  }
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try { descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>; }
  catch { throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW'); }
  const length = descriptors.length?.value;
  if (descriptors.length === undefined || descriptors.length.enumerable
    || !Object.hasOwn(descriptors.length, 'value') || typeof length !== 'number'
    || !Number.isSafeInteger(length) || length < 0) throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
  const expected = Array.from({ length }, (_, index) => String(index));
  const own = Reflect.ownKeys(descriptors);
  if (own.length !== expected.length + 1
    || own.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) {
    throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
  }
  return Object.freeze(expected.map((key) => {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
    }
    return descriptor.value;
  }));
}

function snapshotReview(value: unknown): ValidatedReview {
  const item = descriptorValues(value, [
    'schema', 'observationPointerSha256', 'retentionPointerSha256', 'beforeSha256', 'afterSha256',
    'suggestedPaths', 'findingIds',
  ]);
  const schema = item.get('schema');
  const observationPointerSha256 = item.get('observationPointerSha256');
  const retentionPointerSha256 = item.get('retentionPointerSha256');
  const beforeSha256 = item.get('beforeSha256');
  const afterSha256 = item.get('afterSha256');
  const suggested = descriptorArray(item.get('suggestedPaths'));
  const findings = descriptorArray(item.get('findingIds'));
  if (schema !== 'production-repair-review-v1'
    || typeof observationPointerSha256 !== 'string' || !SHA256.test(observationPointerSha256)
    || (retentionPointerSha256 !== null
      && (typeof retentionPointerSha256 !== 'string' || !SHA256.test(retentionPointerSha256)))
    || typeof beforeSha256 !== 'string' || !SHA256.test(beforeSha256)
    || typeof afterSha256 !== 'string' || !SHA256.test(afterSha256)
    || suggested.length === 0 || findings.length === 0
    || findings.some((id) => typeof id !== 'string' || id.trim() === '')
    || new Set(findings).size !== findings.length) throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
  let paths: string[];
  try { paths = suggested.map(safePath); }
  catch { throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW'); }
  if (new Set(paths).size !== paths.length) throw new ProductionRepairError('MALFORMED_REPAIR_REVIEW');
  const review: ProductionRepairReview = Object.freeze({
    schema, observationPointerSha256, retentionPointerSha256, beforeSha256, afterSha256,
    suggestedPaths: Object.freeze([...paths]), findingIds: Object.freeze(findings as string[]),
  });
  return Object.freeze({ review, paths: review.suggestedPaths, bytes: `${canonicalJson(review)}
` });
}

export function productionRepairReviewBytes(review: unknown): Buffer {
  return Buffer.from(snapshotReview(review).bytes);
}

const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

function stableRead(root: string, path: string, label: string): Buffer {
  return readStableProjectFile({ root, path: resolve(root, path), label, fs });
}

function optionalStableRead(root: string, path: string, label: string): Buffer | null {
  try {
    return stableRead(root, path, label);
  } catch (error) {
    try {
      lstatSync(resolve(root, path));
    } catch (missing) {
      if ((missing as NodeJS.ErrnoException).code === 'ENOENT') return null;
    }
    throw error;
  }
}

function glob(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*').replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

function safePath(value: unknown): string {
  if (typeof value !== 'string') throw new ProductionRepairError('MALFORMED_REPAIR_PATH');
  const normalized = value.replace(/^\.\//, '');
  if (normalized === '' || normalized.includes('\0') || normalized.includes('\\')
    || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
    || normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    || normalized === '.omd' || normalized.startsWith('.omd/')) {
    throw new ProductionRepairError('MALFORMED_REPAIR_PATH');
  }
  return normalized;
}

function within(path: string, allowedPaths: readonly string[]): boolean {
  return allowedPaths.some((pattern) => glob(pattern).test(path));
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) return false;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key))) return false;
  return keys.every((key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && 'value' in descriptor;
  });
}

function currentObservation(root: string): Readonly<{ pointer: Buffer; sha256: string }> {
  let pointer: Buffer;
  try { pointer = stableRead(root, '.omd/observation-v2.json', 'repair observation pointer'); }
  catch { throw new ProductionRepairError('STALE_REPAIR_BASE'); }
  let value: unknown;
  try { value = JSON.parse(pointer.toString('utf8')); } catch { throw new ProductionRepairError('STALE_REPAIR_BASE'); }
  if (!exactObject(value, ['schema', 'record', 'sha256'])
    || value.schema !== 'observation-v2-pointer'
    || typeof value.record !== 'string'
    || !/^\.omd\/observation-v2\/sha256-([a-f0-9]{64})\.json$/.test(value.record)
    || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)
    || !value.record.endsWith(`sha256-${value.sha256}.json`)) {
    throw new ProductionRepairError('STALE_REPAIR_BASE');
  }
  let record: Buffer; let parsed: unknown;
  try {
    record = stableRead(root, value.record, 'repair current observation record');
    parsed = JSON.parse(record.toString('utf8'));
  } catch { throw new ProductionRepairError('STALE_REPAIR_BASE'); }
  if (hash(record) !== value.sha256
    || observationV2Sha256(validateObservationV2(parsed)) !== value.sha256) {
    throw new ProductionRepairError('STALE_REPAIR_BASE');
  }
  return Object.freeze({ pointer, sha256: value.sha256 });
}

function currentSlice(root: string, invocation: ProjectRunInvocation) {
  try {
    if (optionalStableRead(root, '.omd/workflow-production-slice.json', 'repair production slice pointer') === null) {
      throw new ProductionRepairError('REPAIR_SLICE_REQUIRED');
    }
    const current = checkAdaptiveWorkflowProductionSlice(root, invocation);
    if (current.productionSlice === null || current.productionSliceReceipt === null) {
      throw new ProductionRepairError('REPAIR_SLICE_REQUIRED');
    }
    return { value: current.productionSlice, receipt: current.productionSliceReceipt };
  } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError('STALE_REPAIR_BASE');
  }
}

function slicePaths(slice: ReturnType<typeof currentSlice>['value']): readonly string[] {
  return Object.freeze([...new Set(slice.slices.flatMap((entry) => [
    safePath(entry.component.source.path),
    safePath(entry.representativeContext.source.path),
  ]))].sort());
}

function routeScopedPaths(root: string, invocation: ProjectRunInvocation): readonly string[] {
  const route = readPersistedRoute(root, invocation);
  const paths: string[] = [];
  const directories = [''];
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory === undefined) break;
    for (const name of readdirSync(resolve(root, directory)).sort()) {
      if (directory === '' && ['.git', '.omd', 'node_modules'].includes(name)) continue;
      const relativePath = directory === '' ? name : `${directory}/${name}`;
      const metadata = lstatSync(resolve(root, relativePath));
      if (metadata.isSymbolicLink()) continue;
      if (metadata.isDirectory()) directories.push(relativePath);
      else if (metadata.isFile() && pathsOutsideScope(route, [relativePath]).length === 0) {
        paths.push(relativePath);
      }
    }
  }
  if (paths.length === 0) throw new ProductionRepairError('REPAIR_SLICE_REQUIRED');
  return Object.freeze(paths.sort());
}

function currentRepairScope(root: string, invocation: ProjectRunInvocation): Readonly<{
  paths: readonly string[];
  receipt: Readonly<{ sha256: string }>;
  sourceSha256s?: ReadonlyMap<string, string>;
}> {
  if (optionalStableRead(root, '.omd/workflow-production-slice.json', 'repair production slice pointer') !== null) {
    const slice = currentSlice(root, invocation);
    const sources = slice.value.slices.flatMap((entry) => [
      entry.component.source,
      entry.representativeContext.source,
    ]);
    return Object.freeze({
      paths: slicePaths(slice.value),
      receipt: slice.receipt,
      sourceSha256s: new Map(sources.map((source) => [source.path, source.sha256])),
    });
  }
  const route = readPersistedRoute(root, invocation);
  const paths = routeScopedPaths(root, invocation);
  const bytes = Buffer.from(`${canonicalJson({
    schema: 'adaptive-route-repair-scope-v1',
    routeSha256: adaptiveRouteRecordSha256(route),
    paths,
  })}\n`);
  return Object.freeze({ paths, receipt: Object.freeze({ sha256: hash(bytes) }) });
}

/** Read-only current scope identity for consumers that revalidate a committed repair outcome. */
export function currentProductionRepairScopeSha256(root: string, invocation: ProjectRunInvocation): string {
  return currentRepairScope(realpathSync(root), invocation).receipt.sha256;
}

export function createProductionRepairMirror(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  parent: string;
}>): Readonly<{ mirrorRoot: string; paths: readonly string[] }> {
  if (!isAbsolute(input.parent)) throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  let parent: string;
  try {
    parent = realpathSync(input.parent);
    const metadata = lstatSync(parent);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
    }
  } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  const projectRoot = realpathSync(input.root);
  const fromProject = relative(projectRoot, parent);
  if (fromProject === '' || (!fromProject.startsWith('..') && !isAbsolute(fromProject))) {
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  const scope = currentRepairScope(projectRoot, input.invocation);
  const paths = scope.paths;
  const files = paths.map((path) => {
    const source = resolve(projectRoot, path);
    const metadata = lstatSync(source);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
    }
    return Object.freeze({
      relativePath: path,
      content: stableRead(projectRoot, path, `repair mirror source ${path}`),
      mode: metadata.mode & 0o777,
    });
  });
  try {
    const mirrorRoot = createExternalPrivateMirror({
      projectRoot,
      invocation: input.invocation,
      parent,
      files,
    });
    return Object.freeze({ mirrorRoot, paths });
  } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
}

function requirePrivateMirror(root: string, mirrorRoot: string): string {
  if (typeof mirrorRoot !== 'string' || mirrorRoot === '' || !isAbsolute(mirrorRoot)) {
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  let real: string;
  try {
    const metadata = lstatSync(mirrorRoot);
    real = realpathSync(mirrorRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
      throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
    }
  } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  const project = realpathSync(root);
  const fromProject = relative(project, real);
  if (fromProject === '' || (!fromProject.startsWith('..') && !isAbsolute(fromProject))) {
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  return real;
}

function mirrorSnapshot(root: string): Readonly<{
  files: ReadonlyMap<string, Readonly<{ bytes: Buffer; mode: number }>>;
  treeSha256: string;
}> {
  const files = new Map<string, Readonly<{ bytes: Buffer; mode: number }>>();
  const tree: Array<Record<string, unknown>> = [{
    path: '.', kind: 'directory', mode: lstatSync(root).mode & 0o7777,
  }];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = resolve(directory, name);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
        throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
      }
      const path = relative(root, absolute).split(sep).join('/');
      const mode = metadata.mode & 0o7777;
      if (metadata.isDirectory()) {
        tree.push({ path, kind: 'directory', mode });
        visit(absolute);
      } else {
        const bytes = stableRead(root, path, `repair owner mirror source ${path}`);
        tree.push({ path, kind: 'file', mode, sha256: hash(bytes) });
        files.set(path, Object.freeze({ bytes, mode }));
      }
    }
  };
  try { visit(root); } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  return Object.freeze({ files, treeSha256: hash(canonicalJson(tree)) });
}

type ProductionOwnerRepairReceipt = Readonly<{
  bytes: Buffer;
  sha256: string;
  mirrorRoot: string;
  mirrorDevice: string;
  mirrorInode: string;
  mirrorBaselineSha256: string;
  mirrorFinalSha256: string;
  observationPointerSha256: string;
  observationSha256: string;
  changedPath: string;
}>;

function productionOwnerRepairReceipt(
  root: string,
  input: unknown,
): ProductionOwnerRepairReceipt {
  if (!(input instanceof Uint8Array)) throw new ProductionRepairError('REPAIR_OWNER_RECEIPT_REQUIRED');
  const bytes = Buffer.from(input);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch {
    throw new ProductionRepairError('REPAIR_OWNER_RECEIPT_STALE');
  }
  const allowed = [
    'schema', 'owner', 'projectRoot', 'taskSha256', 'rolePromptSha256', 'host', 'transport',
    'modelArgumentOmitted', 'model', 'modelReasoningEffort', 'configurationSha256', 'attempts',
    'sourceChanges', 'mode', 'repair', 'finalEvidence', 'result', 'failure', 'resumeCommand', 'receiptPath',
  ];
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some((key) => !allowed.includes(key))
    || !bytes.equals(Buffer.from(`${canonicalJson(value)}\n`))) {
    throw new ProductionRepairError('REPAIR_OWNER_RECEIPT_STALE');
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== 'omd-production-owner-result-v1' || record.owner !== 'omd-hand'
    || record.projectRoot !== root || record.host !== 'codex'
    || record.transport !== 'codex-exec-stdio-jsonl' || record.mode !== 'repair'
    || record.result !== 'completed' || !Array.isArray(record.sourceChanges) || record.sourceChanges.length !== 0
    || !Array.isArray(record.attempts) || record.attempts.length < 1 || record.attempts.length > 2
    || typeof record.receiptPath !== 'string' || !isAbsolute(record.receiptPath)) {
    throw new ProductionRepairError('REPAIR_OWNER_RECEIPT_STALE');
  }
  const repair = record.repair;
  if (!exactObject(repair, [
    'mirrorRoot', 'mirrorDevice', 'mirrorInode', 'mirrorBaselineSha256', 'mirrorFinalSha256',
    'observationPointerSha256', 'observationSha256', 'changedPaths',
  ]) || typeof repair.mirrorRoot !== 'string' || !isAbsolute(repair.mirrorRoot)
    || typeof repair.mirrorDevice !== 'string' || repair.mirrorDevice === ''
    || typeof repair.mirrorInode !== 'string' || repair.mirrorInode === ''
    || !['mirrorBaselineSha256', 'mirrorFinalSha256', 'observationPointerSha256', 'observationSha256']
      .every((key) => typeof repair[key] === 'string' && SHA256.test(repair[key] as string))
    || !Array.isArray(repair.changedPaths) || repair.changedPaths.length !== 1) {
    throw new ProductionRepairError('REPAIR_OWNER_RECEIPT_STALE');
  }
  let changedPath: string;
  try { changedPath = safePath(repair.changedPaths[0]); } catch {
    throw new ProductionRepairError('REPAIR_OWNER_RECEIPT_STALE');
  }
  return Object.freeze({
    bytes, sha256: hash(bytes), mirrorRoot: repair.mirrorRoot,
    mirrorDevice: repair.mirrorDevice, mirrorInode: repair.mirrorInode,
    mirrorBaselineSha256: repair.mirrorBaselineSha256 as string,
    mirrorFinalSha256: repair.mirrorFinalSha256 as string,
    observationPointerSha256: repair.observationPointerSha256 as string,
    observationSha256: repair.observationSha256 as string,
    changedPath,
  });
}

/**
 * Compares a host-private complete mirror with the current authenticated production slice.
 * The returned token contains no patch bytes or path authority and cannot be forged by callers.
 */
export function stageProductionRepair(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  review: ProductionRepairReview;
  mirrorRoot: string;
  ownerReceipt: Uint8Array;
}>): StagedProductionRepair {
  const reviewed = snapshotReview(input.review);
  const reviewPaths = reviewed.paths;
  requireFinalReviewerLaneAuthorization(input.invocation, input.root, Buffer.from(reviewed.bytes));
  const observation = currentObservation(input.root);
  if (hash(observation.pointer) !== reviewed.review.observationPointerSha256) {
    throw new ProductionRepairError('STALE_REPAIR_BASE');
  }
  const retention = optionalStableRead(input.root, '.omd/observation-v2-retention.json', 'repair retention pointer');
  if ((retention === null ? null : hash(retention)) !== reviewed.review.retentionPointerSha256) {
    throw new ProductionRepairError('STALE_REPAIR_BASE');
  }
  const route = readPersistedRoute(input.root, input.invocation);
  const scope = currentRepairScope(input.root, input.invocation);
  const paths = scope.paths;
  const mirrorRoot = requirePrivateMirror(input.root, input.mirrorRoot);
  const owner = productionOwnerRepairReceipt(realpathSync(input.root), input.ownerReceipt);
  const mirrorMetadata = lstatSync(mirrorRoot);
  const snapshot = mirrorSnapshot(mirrorRoot);
  const files = [...snapshot.files.keys()];
  if (files.length !== paths.length || files.some((path, index) => path !== paths[index])
    || owner.mirrorRoot !== mirrorRoot
    || owner.mirrorDevice !== String(mirrorMetadata.dev)
    || owner.mirrorInode !== String(mirrorMetadata.ino)
    || owner.mirrorBaselineSha256 === owner.mirrorFinalSha256
    || owner.mirrorFinalSha256 !== snapshot.treeSha256
    || owner.observationPointerSha256 !== hash(observation.pointer)
    || owner.observationSha256 !== observation.sha256) {
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  const changes: Array<Readonly<{ path: string; before: Buffer; after: Buffer; mode: number }>> = [];
  for (const path of paths) {
    let before: Buffer; let after: Buffer;
    try {
      before = stableRead(input.root, path, `repair production source ${path}`);
      const mirrored = snapshot.files.get(path);
      if (mirrored === undefined) throw new Error('missing repair owner mirror source');
      after = mirrored.bytes;
    } catch { throw new ProductionRepairError('MALFORMED_STAGED_REPAIR'); }
    const beforeMetadata = lstatSync(resolve(input.root, path));
    const afterMetadata = snapshot.files.get(path);
    if (afterMetadata === undefined) throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
    const mode = beforeMetadata.mode & 0o777;
    if ((afterMetadata.mode & 0o777) !== mode) throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
    if (!before.equals(after)) changes.push({ path, before, after, mode });
  }
  if (changes.length === 0) throw new ProductionRepairError('NO_OP_REPAIR');
  if (changes.length !== 1) throw new ProductionRepairError('MULTI_FILE_REPAIR');
  const change = changes[0] as (typeof changes)[number];
  if (owner.changedPath !== change.path) throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  if (change.after.byteLength === 0) throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  if (!within(change.path, route.allowedPaths) || !reviewPaths.includes(change.path)) {
    throw new ProductionRepairError('REPAIR_PATH_OUTSIDE_ROUTE');
  }
  const beforeSha256 = hash(change.before);
  const afterSha256 = hash(change.after);
  if (reviewed.review.beforeSha256 !== beforeSha256 || reviewed.review.afterSha256 !== afterSha256) {
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  if (scope.sourceSha256s !== undefined
    && scope.sourceSha256s.get(change.path) !== beforeSha256) throw new ProductionRepairError('STALE_REPAIR_BASE');
  try { requireProductionOwnerRepairAuthorization(input.invocation, input.root, owner.bytes, true); }
  catch (error) {
    if (error instanceof Error && /already been consumed/i.test(error.message)) {
      throw new ProductionRepairError('REPAIR_OWNER_RECEIPT_REPLAY');
    }
    throw new ProductionRepairError('REPAIR_OWNER_RECEIPT_REQUIRED');
  }
  const stage = Object.freeze({ schema: 'opaque-staged-production-repair-v1' as const });
  stagedRepairs.set(stage, Object.freeze({
    root: realpathSync(input.root), invocation: input.invocation, review: reviewed.review, reviewBytes: reviewed.bytes,
    path: change.path, before: Buffer.from(change.before), after: Buffer.from(change.after),
    beforeSha256, afterSha256, mode: change.mode,
    routeSha256: adaptiveRouteRecordSha256(route), sliceSha256: scope.receipt.sha256,
    observationPointerSha256: hash(observation.pointer),
    ownerReceiptSha256: owner.sha256,
  }));
  return stage;
}

type JournalState = 'prepared' | 'applied' | 'committed';
type RepairJournal = Readonly<{
  schema: 'omd-production-repair-journal-v2';
  state: JournalState;
  path: string;
  mode: number;
  outcomePath: string;
  outcomeBase64: string;
  beforeTreeSha256: string;
  afterTreeSha256: string;
  beforeBase64: string;
  routeSha256: string;
  sliceSha256: string;
  reviewSha256: string;
  reviewBase64: string;
  observationPointer: string;
  retentionPointer: string | null;
  handoffPointer: string | null;
  predecessorSha256: string;
}>;

function repairOutcomeBytes(value: Readonly<{
  path: string; mode: number; beforeTreeSha256: string; afterTreeSha256: string; routeSha256: string;
  sliceSha256: string; reviewSha256: string; predecessorSha256: string;
}>, schema: 'omd-production-repair-outcome-v2' | 'omd-production-repair-outcome-v3' = 'omd-production-repair-outcome-v3'): Buffer {
  const common = {
    schema, outcome: 'committed', path: value.path,
    beforeTreeSha256: value.beforeTreeSha256, afterTreeSha256: value.afterTreeSha256,
    routeSha256: value.routeSha256, sliceSha256: value.sliceSha256,
    reviewSha256: value.reviewSha256, predecessorSha256: value.predecessorSha256,
  };
  return Buffer.from(`${canonicalJson(schema === 'omd-production-repair-outcome-v3'
    ? { ...common, mode: value.mode }
    : common)}\n`);
}

function writeAtomic(
  root: string,
  invocation: ProjectRunInvocation,
  path: string,
  content: Uint8Array | string,
  mode?: number,
): void {
  replaceProjectFileAtomically({
    projectRoot: root,
    invocation,
    relativePath: path,
    content,
    ...(mode === undefined ? {} : { mode }),
  });
}

function writeTarget(root: string, invocation: ProjectRunInvocation, path: string, bytes: Uint8Array, mode: number): void {
  writeAtomic(root, invocation, path, bytes, mode);
}

export function applyProductionRepair(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  writer: ProjectWriteAdapter;
  staged: StagedProductionRepair;
}>): ProductionRepairOutcome {
  requireProjectWriteAdapterForInvocation(input.root, input.writer, input.invocation);
  const stage = stagedRepairs.get(input.staged);
  if (stage === undefined || consumedStages.has(input.staged)
    || stage.invocation !== input.invocation || stage.root !== realpathSync(input.root)) {
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  const release = acquireProjectMutationLock(input.root, input.invocation);
  try {
    if (optionalStableRead(input.root, JOURNAL_PATH, 'production repair journal') !== null) {
      throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    }
    if (optionalStableRead(input.root, ROLLBACK_JOURNAL_PATH, 'production repair rollback journal') !== null) {
      throw new ProductionRepairError('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
    }
    requireFinalReviewerLaneAuthorization(input.invocation, input.root, Buffer.from(stage.reviewBytes));
    const observation = currentObservation(input.root);
    const route = readPersistedRoute(input.root, input.invocation);
    const scope = currentRepairScope(input.root, input.invocation);
    if (hash(observation.pointer) !== stage.observationPointerSha256
      || stage.review.observationPointerSha256 !== stage.observationPointerSha256
      || adaptiveRouteRecordSha256(route) !== stage.routeSha256
      || scope.receipt.sha256 !== stage.sliceSha256) throw new ProductionRepairError('STALE_REPAIR_BASE');
    const allowedSlicePaths = scope.paths;
    if (!allowedSlicePaths.includes(stage.path) || !within(stage.path, route.allowedPaths)) {
      throw new ProductionRepairError('REPAIR_PATH_OUTSIDE_ROUTE');
    }
    let before: Buffer;
    try { before = stableRead(input.root, stage.path, 'repair production target'); }
    catch { throw new ProductionRepairError('STALE_REPAIR_BASE'); }
    const metadata = lstatSync(resolve(input.root, stage.path));
    if (hash(before) !== stage.beforeSha256 || !before.equals(stage.before)
      || (metadata.mode & 0o777) !== stage.mode) throw new ProductionRepairError('STALE_REPAIR_BASE');
    if (stage.beforeSha256 === stage.afterSha256) throw new ProductionRepairError('NO_OP_REPAIR');

    const routeSha256 = adaptiveRouteRecordSha256(route);
    const outcome = repairOutcomeBytes({
      path: stage.path, mode: stage.mode,
      beforeTreeSha256: stage.beforeSha256, afterTreeSha256: stage.afterSha256,
      routeSha256, sliceSha256: stage.sliceSha256, reviewSha256: hash(stage.reviewBytes),
      predecessorSha256: observation.sha256,
    });
    const outcomePath = `.omd/production-repairs/sha256-${hash(outcome)}.json`;
    const retention = optionalStableRead(input.root, '.omd/observation-v2-retention.json', 'repair retention pointer');
    validateRetentionBytes(retention, observation.sha256);
    if ((retention === null ? null : hash(retention)) !== stage.review.retentionPointerSha256) {
      throw new ProductionRepairError('STALE_REPAIR_BASE');
    }
    const priorHandoff = optionalStableRead(input.root, HANDOFF_PATH, 'repair predecessor handoff');
    if (priorHandoff !== null) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    input.writer.writeContentAddressed(`.omd/production-repair-blobs/sha256-${stage.beforeSha256}.bin`, stage.before);
    input.writer.writeContentAddressed(`.omd/production-repair-blobs/sha256-${stage.afterSha256}.bin`, stage.after);
    input.writer.writeContentAddressed(
      `.omd/final-review/repairs/sha256-${hash(stage.reviewBytes)}.json`,
      Buffer.from(stage.reviewBytes),
    );
    const base = {
      schema: 'omd-production-repair-journal-v2' as const,
      path: stage.path, mode: stage.mode, outcomePath, outcomeBase64: outcome.toString('base64'),
      beforeTreeSha256: stage.beforeSha256, afterTreeSha256: stage.afterSha256,
      beforeBase64: stage.before.toString('base64'), routeSha256, sliceSha256: stage.sliceSha256,
      reviewSha256: hash(stage.reviewBytes),
      reviewBase64: Buffer.from(stage.reviewBytes).toString('base64'),
      observationPointer: observation.pointer.toString('base64'),
      retentionPointer: retention?.toString('base64') ?? null,
      handoffPointer: null, predecessorSha256: observation.sha256,
    };
    const journal = (state: JournalState): RepairJournal => Object.freeze({ ...base, state });
    const writeJournal = (state: JournalState): void => writeAtomic(
      input.root, input.invocation, JOURNAL_PATH, `${canonicalJson(journal(state))}\n`,
    );

    writeJournal('prepared');
    writeTarget(input.root, input.invocation, stage.path, stage.after, stage.mode);
    input.writer.remove('.omd/observation-v2.json');
    input.writer.remove('.omd/observation-v2-retention.json');
    writeAtomic(input.root, input.invocation, HANDOFF_PATH, `${canonicalJson({
      schema: 'observation-v2-repair-predecessor-v1', predecessorSha256: observation.sha256,
    })}\n`);
    writeJournal('applied');
    input.writer.writeContentAddressed(outcomePath, outcome);
    writeJournal('committed');
    input.writer.remove(JOURNAL_PATH);
    consumedStages.add(input.staged);
    return Object.freeze({
      status: 'committed', path: stage.path, mode: stage.mode, beforeTreeSha256: stage.beforeSha256,
      afterTreeSha256: stage.afterSha256, outcomePath,
    });
  } finally {
    release();
  }
}

function parseJournal(bytes: Buffer): RepairJournal {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
  const keys = ['schema', 'state', 'path', 'mode', 'outcomePath', 'outcomeBase64', 'beforeTreeSha256',
    'afterTreeSha256', 'beforeBase64', 'routeSha256', 'sliceSha256', 'reviewSha256',
    'reviewBase64', 'observationPointer',
    'retentionPointer', 'handoffPointer', 'predecessorSha256'];
  if (!exactObject(value, keys) || value.schema !== 'omd-production-repair-journal-v2'
    || !['prepared', 'applied', 'committed'].includes(String(value.state))
    || typeof value.path !== 'string' || typeof value.mode !== 'number' || !Number.isInteger(value.mode)
    || value.mode < 0 || value.mode > 0o777 || typeof value.outcomePath !== 'string'
    || !/^\.omd\/production-repairs\/sha256-[a-f0-9]{64}\.json$/.test(value.outcomePath)
    || typeof value.outcomeBase64 !== 'string' || typeof value.beforeBase64 !== 'string'
    || typeof value.reviewBase64 !== 'string'
    || typeof value.observationPointer !== 'string'
    || (value.retentionPointer !== null && typeof value.retentionPointer !== 'string')
    || (value.handoffPointer !== null && typeof value.handoffPointer !== 'string')
    || !['beforeTreeSha256', 'afterTreeSha256', 'routeSha256', 'sliceSha256', 'reviewSha256', 'predecessorSha256']
      .every((key) => typeof value[key] === 'string' && SHA256.test(value[key] as string))) {
    throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  }
  try { safePath(value.path); } catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
  if (!bytes.equals(Buffer.from(`${canonicalJson(value)}
`))) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  return Object.freeze({ ...value }) as RepairJournal;
}

function decodeBase64(value: string): Buffer {
  if (value === '' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  return bytes;
}

function expectedHandoffBytes(predecessorSha256: string): Buffer {
  return Buffer.from(`${canonicalJson({ schema: 'observation-v2-repair-predecessor-v1', predecessorSha256 })}
`);
}

function validateObservationPointerBytes(root: string, bytes: Buffer, pointerSha256: string, predecessorSha256: string): void {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
  if (!exactObject(value, ['schema', 'record', 'sha256']) || value.schema !== 'observation-v2-pointer'
    || typeof value.record !== 'string' || typeof value.sha256 !== 'string' || value.sha256 !== predecessorSha256
    || value.record !== `.omd/observation-v2/sha256-${value.sha256}.json`
    || hash(bytes) !== pointerSha256 || !bytes.equals(Buffer.from(`${canonicalJson(value)}
`))) {
    throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  }
  let record: Buffer; let parsed: unknown;
  try { record = stableRead(root, value.record, 'repair recovery observation record'); parsed = JSON.parse(record.toString('utf8')); }
  catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
  if (hash(record) !== value.sha256 || observationV2Sha256(validateObservationV2(parsed)) !== value.sha256
    || !record.equals(Buffer.from(`${canonicalJson(parsed)}
`))) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
}

function validateRetentionBytes(bytes: Buffer | null, predecessorSha256: string): void {
  if (bytes === null) return;
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
  if (!exactObject(value, ['schema', 'currentArtifactSha256', 'retained']) || value.schema !== 'observation-v2-retention'
    || typeof value.currentArtifactSha256 !== 'string' || !SHA256.test(value.currentArtifactSha256)
    || !Array.isArray(value.retained) || Object.getPrototypeOf(value.retained) !== Array.prototype || value.retained.length === 0
    || value.retained.some((entry) => typeof entry !== 'string' || !SHA256.test(entry))
    || new Set(value.retained).size !== value.retained.length || !value.retained.includes(predecessorSha256)
    || !bytes.equals(Buffer.from(`${canonicalJson(value)}
`))) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
}

function recoverySlicePaths(
  root: string,
  invocation: ProjectRunInvocation,
  journal: Pick<RepairJournal, 'routeSha256' | 'sliceSha256' | 'path' | 'beforeTreeSha256'>,
): readonly string[] {
  const route = readPersistedRoute(root, invocation);
  if (adaptiveRouteRecordSha256(route) !== journal.routeSha256) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  if (optionalStableRead(root, '.omd/workflow-production-slice.json', 'repair recovery production slice pointer') === null) {
    const scope = currentRepairScope(root, invocation);
    if (scope.receipt.sha256 !== journal.sliceSha256) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    return scope.paths;
  }
  const readiness = checkAdaptiveWorkflowProductionReadiness(root, invocation);
  const pointerBytes = stableRead(root, '.omd/workflow-production-slice.json', 'repair recovery production slice pointer');
  let pointer: unknown;
  try { pointer = JSON.parse(pointerBytes.toString('utf8')); } catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
  if (!exactObject(pointer, ['schema', 'record', 'sha256']) || pointer.schema !== 'adaptive-workflow-production-slice-pointer-v1'
    || pointer.sha256 !== journal.sliceSha256 || typeof pointer.record !== 'string'
    || pointer.record !== `workflow-production-slice-runs/sha256-${pointer.sha256}.json`
    || pointerBytes.toString('utf8') !== `${canonicalWorkflowPlanJson(pointer)}
`) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  const record = stableRead(root, `.omd/${pointer.record}`, 'repair recovery production slice record');
  let parsed: unknown;
  try { parsed = JSON.parse(record.toString('utf8')); } catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
  const slice = parseWorkflowProductionSlice(parsed);
  if (hash(record) !== pointer.sha256 || !record.equals(workflowProductionSliceBytes(slice))
    || canonicalWorkflowPlanJson(slice.route) !== canonicalWorkflowPlanJson(readiness.plan.route)
    || canonicalWorkflowPlanJson(slice.plan) !== canonicalWorkflowPlanJson(readiness.planReceipt)
    || canonicalWorkflowPlanJson(slice.readiness) !== canonicalWorkflowPlanJson(readiness.readinessReceipt)
    || slice.owner.buildSha256 !== invocation.current.buildSha256
    || slice.owner.loadedSkillSha256 !== invocation.current.loadedSkillSha256
    || slice.owner.briefSha256 !== invocation.current.briefSha256) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  const sources = slice.slices.flatMap((entry) => [entry.component.source, entry.representativeContext.source]);
  const paths = Object.freeze([...new Set(sources.map((source) => safePath(source.path)))].sort());
  const target = sources.find((source) => source.path === journal.path);
  if (target === undefined || target.sha256 !== journal.beforeTreeSha256 || !within(journal.path, route.allowedPaths)) {
    throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  }
  for (const source of sources) if (source.path !== journal.path
    && hash(stableRead(root, source.path, 'repair recovery production slice source')) !== source.sha256) {
    throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  }
  return paths;
}

/** Revalidates the immutable pre-repair scope while allowing only the reviewed target to differ. */
export function validateCommittedProductionRepairScope(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  routeSha256: string;
  sliceSha256: string;
  path: string;
  beforeTreeSha256: string;
}>): void {
  recoverySlicePaths(realpathSync(input.root), input.invocation, input);
}

type RejectedRefinementCheckpoint = Readonly<{
  sha256: string;
  reviewSha256: string;
  evidenceSha256: string;
  productionRepairOutcomeSha256: string;
  beforeObservationSha256: string;
  afterObservationSha256: string;
}>;

type RejectedRepairOutcome = Readonly<{
  sha256: string;
  path: string;
  mode: number;
  beforeTreeSha256: string;
  afterTreeSha256: string;
  routeSha256: string;
  sliceSha256: string;
  reviewSha256: string;
  predecessorSha256: string;
}>;

type RollbackJournalState = 'prepared' | 'source-restored' | 'pointer-restored';
type RepairRollbackJournal = Readonly<{
  schema: 'omd-production-repair-rollback-journal-v1';
  state: RollbackJournalState;
  reviewPath: string;
  checkpointSha256: string;
  productionRepairOutcomeSha256: string;
  path: string;
  mode: number;
  beforeTreeSha256: string;
  afterTreeSha256: string;
  beforeObservationSha256: string;
  afterObservationSha256: string;
}>;

export type RejectedProductionRepairRollbackOutcome = Readonly<{
  status: 'rolled-back';
  path: string;
  mode: number;
  beforeTreeSha256: string;
  afterTreeSha256: string;
  beforeObservationSha256: string;
  rejectedAfterObservationSha256: string;
  productionRepairOutcomeSha256: string;
  checkpointSha256: string;
  reviewSha256: string;
}>;

type RollbackContext = Readonly<{
  root: string;
  reviewPath: string;
  checkpoint: RejectedRefinementCheckpoint;
  outcome: RejectedRepairOutcome;
  before: Buffer;
  beforePointer: Buffer;
  afterPointer: Buffer;
  sourceIsBefore: boolean;
  pointerIsBefore: boolean;
}>;

function rollbackFail(code: 'REPAIR_ROLLBACK_REVIEW_INVALID' | 'REPAIR_ROLLBACK_STALE'
  | 'UNRESOLVED_REPAIR_ROLLBACK_JOURNAL'): never {
  throw new ProductionRepairError(code);
}

function rollbackArtifactPath(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || value.includes('\0') || value.includes('\\')
    || value.startsWith('/') || value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    || !pattern.test(value)) return rollbackFail('REPAIR_ROLLBACK_REVIEW_INVALID');
  return value;
}

function canonicalArtifact(root: string, path: string, label: string, code: 'REPAIR_ROLLBACK_REVIEW_INVALID'
  | 'REPAIR_ROLLBACK_STALE' | 'UNRESOLVED_REPAIR_ROLLBACK_JOURNAL'): Readonly<{ bytes: Buffer; value: Record<string, unknown> }> {
  let bytes: Buffer; let value: unknown;
  try {
    bytes = stableRead(root, path, label);
    value = JSON.parse(bytes.toString('utf8'));
  } catch { return rollbackFail(code); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || !bytes.equals(Buffer.from(`${canonicalJson(value)}\n`))) return rollbackFail(code);
  return Object.freeze({ bytes, value: value as Record<string, unknown> });
}

function refinementVariantAlias(observationSha256: string): string {
  return `variant-${hash(`rendered-refinement\0${observationSha256}`).slice(0, 16)}`;
}

function parseRejectedCheckpoint(root: string): RejectedRefinementCheckpoint {
  const pointer = canonicalArtifact(
    root, '.omd/refinement-checkpoint.json', 'repair rollback checkpoint pointer', 'REPAIR_ROLLBACK_STALE',
  );
  if (!exactObject(pointer.value, ['schema', 'record', 'sha256'])
    || pointer.value.schema !== 'adaptive-rendered-refinement-checkpoint-pointer-v1'
    || typeof pointer.value.sha256 !== 'string' || !SHA256.test(pointer.value.sha256)
    || pointer.value.record !== `.omd/refinement/checkpoints/sha256-${pointer.value.sha256}.json`) {
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
  const sha256 = pointer.value.sha256;
  const record = canonicalArtifact(root, pointer.value.record as string, 'repair rollback checkpoint', 'REPAIR_ROLLBACK_STALE');
  if (hash(record.bytes) !== sha256 || !exactObject(record.value, [
    'schema', 'status', 'comparison', 'action', 'countsRound', 'beforeObservationSha256',
    'afterObservationSha256', 'evidenceSha256', 'reviewSha256', 'productionRepairOutcomeSha256',
    'target', 'remainingCriteria', 'previousCheckpointSha256',
  ]) || record.value.schema !== 'adaptive-rendered-refinement-checkpoint-v1'
    || record.value.status !== 'regress' || record.value.comparison !== 'before'
    || record.value.action !== 'rollback' || record.value.countsRound !== true
    || !Array.isArray(record.value.remainingCriteria)
    || (record.value.target !== null && typeof record.value.target !== 'string')
    || (record.value.previousCheckpointSha256 !== null
      && (typeof record.value.previousCheckpointSha256 !== 'string' || !SHA256.test(record.value.previousCheckpointSha256)))
    || !['beforeObservationSha256', 'afterObservationSha256', 'evidenceSha256', 'reviewSha256',
      'productionRepairOutcomeSha256'].every((key) => typeof record.value[key] === 'string'
        && SHA256.test(record.value[key] as string))) return rollbackFail('REPAIR_ROLLBACK_STALE');
  let childBefore = record.value.beforeObservationSha256 as string;
  let priorSha256 = record.value.previousCheckpointSha256 as string | null;
  const seen = new Set([sha256]);
  while (priorSha256 !== null) {
    if (seen.has(priorSha256)) return rollbackFail('REPAIR_ROLLBACK_STALE');
    seen.add(priorSha256);
    const prior = canonicalArtifact(
      root, `.omd/refinement/checkpoints/sha256-${priorSha256}.json`,
      'repair rollback predecessor checkpoint', 'REPAIR_ROLLBACK_STALE',
    );
    if (hash(prior.bytes) !== priorSha256 || !exactObject(prior.value, [
      'schema', 'status', 'comparison', 'action', 'countsRound', 'beforeObservationSha256',
      'afterObservationSha256', 'evidenceSha256', 'reviewSha256', 'productionRepairOutcomeSha256',
      'target', 'remainingCriteria', 'previousCheckpointSha256',
    ]) || prior.value.schema !== 'adaptive-rendered-refinement-checkpoint-v1'
      || !['improve', 'regress', 'reframe', 'plateau', 'preserved'].includes(String(prior.value.status))
      || !['after', 'before', 'tie', 'disagreement'].includes(String(prior.value.comparison))
      || !['continue', 'complete', 'rollback', 'stop'].includes(String(prior.value.action))
      || prior.value.countsRound !== true || !Array.isArray(prior.value.remainingCriteria)
      || !['beforeObservationSha256', 'afterObservationSha256', 'evidenceSha256', 'reviewSha256',
        'productionRepairOutcomeSha256'].every((key) => typeof prior.value[key] === 'string'
          && SHA256.test(prior.value[key] as string))
      || (prior.value.previousCheckpointSha256 !== null
        && (typeof prior.value.previousCheckpointSha256 !== 'string'
          || !SHA256.test(prior.value.previousCheckpointSha256)))) return rollbackFail('REPAIR_ROLLBACK_STALE');
    const accepted = prior.value.action === 'rollback'
      ? prior.value.beforeObservationSha256 : prior.value.afterObservationSha256;
    if (accepted !== childBefore) return rollbackFail('REPAIR_ROLLBACK_STALE');
    childBefore = prior.value.beforeObservationSha256 as string;
    priorSha256 = prior.value.previousCheckpointSha256 as string | null;
  }
  return Object.freeze({
    sha256,
    reviewSha256: record.value.reviewSha256 as string,
    evidenceSha256: record.value.evidenceSha256 as string,
    productionRepairOutcomeSha256: record.value.productionRepairOutcomeSha256 as string,
    beforeObservationSha256: record.value.beforeObservationSha256 as string,
    afterObservationSha256: record.value.afterObservationSha256 as string,
  });
}

function validateRejectedReview(
  root: string,
  invocation: ProjectRunInvocation,
  reviewPathInput: string,
  checkpoint: RejectedRefinementCheckpoint,
  routeSha256: string,
): string {
  const reviewPath = rollbackArtifactPath(
    reviewPathInput, /^\.omd\/final-review\/refinements\/sha256-([a-f0-9]{64})\.json$/,
  );
  const addressed = /sha256-([a-f0-9]{64})\.json$/.exec(reviewPath)?.[1];
  const review = canonicalArtifact(root, reviewPath, 'repair rollback refinement review', 'REPAIR_ROLLBACK_REVIEW_INVALID');
  if (addressed === undefined || hash(review.bytes) !== addressed || addressed !== checkpoint.reviewSha256
    || !exactObject(review.value, [
      'schema', 'winnerAlias', 'evidenceSha256', 'transportSha256', 'routeSha256', 'buildSha256',
      'briefSha256', 'remainingCriteria', 'votes', 'quorum', 'provenance', 'executionReceipts',
    ]) || review.value.schema !== 'adaptive-refinement-review-v1'
    || review.value.winnerAlias !== refinementVariantAlias(checkpoint.beforeObservationSha256)
    || review.value.evidenceSha256 !== checkpoint.evidenceSha256
    || review.value.routeSha256 !== routeSha256
    || review.value.buildSha256 !== invocation.current.buildSha256
    || review.value.briefSha256 !== invocation.current.briefSha256
    || typeof review.value.transportSha256 !== 'string' || !SHA256.test(review.value.transportSha256)
    || !Array.isArray(review.value.remainingCriteria)
    || !Array.isArray(review.value.votes) || review.value.votes.length !== 2
    || !Array.isArray(review.value.executionReceipts) || review.value.executionReceipts.length !== 2) {
    return rollbackFail('REPAIR_ROLLBACK_REVIEW_INVALID');
  }
  const quorum = review.value.quorum;
  if (!exactObject(quorum, ['required', 'passed']) || quorum.required !== 2 || quorum.passed !== 2) {
    return rollbackFail('REPAIR_ROLLBACK_REVIEW_INVALID');
  }
  const winnerAlias = review.value.winnerAlias;
  for (const voteValue of review.value.votes) {
    if (!exactObject(voteValue, ['reviewerId', 'winnerAlias', 'remainingCriteria', 'findings'])
      || typeof voteValue.reviewerId !== 'string' || voteValue.winnerAlias !== winnerAlias
      || !Array.isArray(voteValue.remainingCriteria) || !Array.isArray(voteValue.findings)) {
      return rollbackFail('REPAIR_ROLLBACK_REVIEW_INVALID');
    }
  }
  for (const receiptValue of review.value.executionReceipts) {
    if (!exactObject(receiptValue, ['path', 'sha256']) || typeof receiptValue.path !== 'string'
      || !/^\.omd\/final-review\/refinement-executions\/sha256-[a-f0-9]{64}\.json$/.test(receiptValue.path)
      || typeof receiptValue.sha256 !== 'string' || !SHA256.test(receiptValue.sha256)
      || !receiptValue.path.endsWith(`sha256-${receiptValue.sha256}.json`)) {
      return rollbackFail('REPAIR_ROLLBACK_REVIEW_INVALID');
    }
    let execution: Buffer;
    try { execution = stableRead(root, receiptValue.path, 'repair rollback reviewer execution'); }
    catch { return rollbackFail('REPAIR_ROLLBACK_REVIEW_INVALID'); }
    if (hash(execution) !== receiptValue.sha256) return rollbackFail('REPAIR_ROLLBACK_REVIEW_INVALID');
  }
  try { requireFinalReviewerLaneAuthorization(invocation, root, review.bytes); }
  catch { return rollbackFail('REPAIR_ROLLBACK_REVIEW_INVALID'); }
  return reviewPath;
}

function rollbackObservationPointer(root: string, sha256: string): Buffer {
  const recordPath = `.omd/observation-v2/sha256-${sha256}.json`;
  const record = canonicalArtifact(root, recordPath, 'repair rollback observation', 'REPAIR_ROLLBACK_STALE');
  let observation: ReturnType<typeof validateObservationV2>;
  try { observation = validateObservationV2(record.value); } catch { return rollbackFail('REPAIR_ROLLBACK_STALE'); }
  if (hash(record.bytes) !== sha256 || observationV2Sha256(observation) !== sha256) {
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
  return Buffer.from(`${canonicalJson({ schema: 'observation-v2-pointer', record: recordPath, sha256 })}\n`);
}

function parseRejectedRepairOutcome(root: string, checkpoint: RejectedRefinementCheckpoint): RejectedRepairOutcome {
  const sha256 = checkpoint.productionRepairOutcomeSha256;
  const path = `.omd/production-repairs/sha256-${sha256}.json`;
  const artifact = canonicalArtifact(root, path, 'repair rollback committed outcome', 'REPAIR_ROLLBACK_STALE');
  if (hash(artifact.bytes) !== sha256 || !exactObject(artifact.value, [
    'schema', 'outcome', 'path', 'mode', 'beforeTreeSha256', 'afterTreeSha256', 'routeSha256',
    'sliceSha256', 'reviewSha256', 'predecessorSha256',
  ]) || artifact.value.schema !== 'omd-production-repair-outcome-v3' || artifact.value.outcome !== 'committed'
    || typeof artifact.value.mode !== 'number' || !Number.isInteger(artifact.value.mode)
    || artifact.value.mode < 0 || artifact.value.mode > 0o777
    || !['beforeTreeSha256', 'afterTreeSha256', 'routeSha256', 'sliceSha256', 'reviewSha256',
      'predecessorSha256'].every((key) => typeof artifact.value[key] === 'string'
        && SHA256.test(artifact.value[key] as string))) return rollbackFail('REPAIR_ROLLBACK_STALE');
  let productionPath: string;
  try { productionPath = safePath(artifact.value.path); } catch { return rollbackFail('REPAIR_ROLLBACK_STALE'); }
  return Object.freeze({
    sha256, path: productionPath, mode: artifact.value.mode,
    beforeTreeSha256: artifact.value.beforeTreeSha256 as string,
    afterTreeSha256: artifact.value.afterTreeSha256 as string,
    routeSha256: artifact.value.routeSha256 as string,
    sliceSha256: artifact.value.sliceSha256 as string,
    reviewSha256: artifact.value.reviewSha256 as string,
    predecessorSha256: artifact.value.predecessorSha256 as string,
  });
}

function resolveRollbackContext(
  rootInput: string,
  invocation: ProjectRunInvocation,
  reviewPathInput: string,
  phase: 'before' | 'during' | 'after',
): RollbackContext {
  const root = realpathSync(rootInput);
  if (optionalStableRead(root, JOURNAL_PATH, 'repair rollback production repair journal') !== null) {
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
  const checkpoint = parseRejectedCheckpoint(root);
  let route: ReturnType<typeof readPersistedRoute>;
  try { route = readPersistedRoute(root, invocation); } catch { return rollbackFail('REPAIR_ROLLBACK_STALE'); }
  const routeSha256 = adaptiveRouteRecordSha256(route);
  const reviewPath = validateRejectedReview(root, invocation, reviewPathInput, checkpoint, routeSha256);
  const outcome = parseRejectedRepairOutcome(root, checkpoint);
  if (outcome.routeSha256 !== routeSha256
    || outcome.predecessorSha256 !== checkpoint.beforeObservationSha256) return rollbackFail('REPAIR_ROLLBACK_STALE');
  try {
    validateCommittedProductionRepairScope({
      root, invocation, routeSha256: outcome.routeSha256, sliceSha256: outcome.sliceSha256,
      path: outcome.path, beforeTreeSha256: outcome.beforeTreeSha256,
    });
  } catch { return rollbackFail('REPAIR_ROLLBACK_STALE'); }
  const beforePointer = rollbackObservationPointer(root, checkpoint.beforeObservationSha256);
  const afterPointer = rollbackObservationPointer(root, checkpoint.afterObservationSha256);
  const afterRecord = canonicalArtifact(
    root, `.omd/observation-v2/sha256-${checkpoint.afterObservationSha256}.json`,
    'repair rollback rejected observation', 'REPAIR_ROLLBACK_STALE',
  );
  if (afterRecord.value.predecessorSha256 !== checkpoint.beforeObservationSha256) {
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
  const repairReview = canonicalArtifact(
    root, `.omd/final-review/repairs/sha256-${outcome.reviewSha256}.json`,
    'repair rollback original repair review', 'REPAIR_ROLLBACK_STALE',
  );
  let originalReview: ValidatedReview;
  try { originalReview = snapshotReview(repairReview.value); } catch { return rollbackFail('REPAIR_ROLLBACK_STALE'); }
  if (hash(repairReview.bytes) !== outcome.reviewSha256
    || !repairReview.bytes.equals(Buffer.from(originalReview.bytes))
    || originalReview.review.observationPointerSha256 !== hash(beforePointer)
    || originalReview.review.beforeSha256 !== outcome.beforeTreeSha256
    || originalReview.review.afterSha256 !== outcome.afterTreeSha256
    || !originalReview.paths.includes(outcome.path)) return rollbackFail('REPAIR_ROLLBACK_STALE');
  try { requireFinalReviewerLaneAuthorization(invocation, root, repairReview.bytes); }
  catch { return rollbackFail('REPAIR_ROLLBACK_STALE'); }
  let before: Buffer; let after: Buffer;
  try {
    before = stableRead(root, `.omd/production-repair-blobs/sha256-${outcome.beforeTreeSha256}.bin`, 'repair rollback before blob');
    after = stableRead(root, `.omd/production-repair-blobs/sha256-${outcome.afterTreeSha256}.bin`, 'repair rollback after blob');
  } catch { return rollbackFail('REPAIR_ROLLBACK_STALE'); }
  if (hash(before) !== outcome.beforeTreeSha256 || hash(after) !== outcome.afterTreeSha256) {
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
  let source: Buffer; let sourceMode: number;
  try {
    source = stableRead(root, outcome.path, 'repair rollback current production source');
    sourceMode = lstatSync(resolve(root, outcome.path)).mode & 0o777;
  } catch { return rollbackFail('REPAIR_ROLLBACK_STALE'); }
  const sourceSha256 = hash(source);
  const sourceIsBefore = sourceSha256 === outcome.beforeTreeSha256;
  const sourceIsAfter = sourceSha256 === outcome.afterTreeSha256;
  if (sourceMode !== outcome.mode || (phase === 'before' ? !sourceIsAfter : phase === 'after' ? !sourceIsBefore : (!sourceIsBefore && !sourceIsAfter))) {
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
  const pointer = optionalStableRead(root, '.omd/observation-v2.json', 'repair rollback current observation pointer');
  if (pointer === null) return rollbackFail('REPAIR_ROLLBACK_STALE');
  const pointerIsBefore = pointer.equals(beforePointer);
  const pointerIsAfter = pointer.equals(afterPointer);
  if (phase === 'before' ? !pointerIsAfter : phase === 'after' ? !pointerIsBefore : (!pointerIsBefore && !pointerIsAfter)) {
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
  if (optionalStableRead(root, HANDOFF_PATH, 'repair rollback predecessor handoff') !== null) {
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
  return Object.freeze({ root, reviewPath, checkpoint, outcome, before, beforePointer, afterPointer, sourceIsBefore, pointerIsBefore });
}

function rollbackJournalBytes(value: RepairRollbackJournal): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`);
}

function rollbackJournal(context: RollbackContext, state: RollbackJournalState): RepairRollbackJournal {
  return Object.freeze({
    schema: 'omd-production-repair-rollback-journal-v1', state, reviewPath: context.reviewPath,
    checkpointSha256: context.checkpoint.sha256,
    productionRepairOutcomeSha256: context.outcome.sha256,
    path: context.outcome.path, mode: context.outcome.mode,
    beforeTreeSha256: context.outcome.beforeTreeSha256,
    afterTreeSha256: context.outcome.afterTreeSha256,
    beforeObservationSha256: context.checkpoint.beforeObservationSha256,
    afterObservationSha256: context.checkpoint.afterObservationSha256,
  });
}

function parseRollbackJournal(bytes: Buffer): RepairRollbackJournal {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL'); }
  if (!exactObject(value, [
    'schema', 'state', 'reviewPath', 'checkpointSha256', 'productionRepairOutcomeSha256', 'path', 'mode',
    'beforeTreeSha256', 'afterTreeSha256', 'beforeObservationSha256', 'afterObservationSha256',
  ]) || value.schema !== 'omd-production-repair-rollback-journal-v1'
    || !['prepared', 'source-restored', 'pointer-restored'].includes(String(value.state))
    || typeof value.mode !== 'number' || !Number.isInteger(value.mode) || value.mode < 0 || value.mode > 0o777
    || !['checkpointSha256', 'productionRepairOutcomeSha256', 'beforeTreeSha256', 'afterTreeSha256',
      'beforeObservationSha256', 'afterObservationSha256'].every((key) => typeof value[key] === 'string'
        && SHA256.test(value[key] as string))
    || !bytes.equals(Buffer.from(`${canonicalJson(value)}\n`))) {
    return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
  }
  let reviewPath: string; let path: string;
  try {
    reviewPath = rollbackArtifactPath(value.reviewPath, /^\.omd\/final-review\/refinements\/sha256-[a-f0-9]{64}\.json$/);
    path = safePath(value.path);
  } catch { return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL'); }
  return Object.freeze({ ...value, reviewPath, path }) as RepairRollbackJournal;
}

function rollbackOutcome(context: RollbackContext): RejectedProductionRepairRollbackOutcome {
  return Object.freeze({
    status: 'rolled-back', path: context.outcome.path, mode: context.outcome.mode,
    beforeTreeSha256: context.outcome.beforeTreeSha256,
    afterTreeSha256: context.outcome.afterTreeSha256,
    beforeObservationSha256: context.checkpoint.beforeObservationSha256,
    rejectedAfterObservationSha256: context.checkpoint.afterObservationSha256,
    productionRepairOutcomeSha256: context.outcome.sha256,
    checkpointSha256: context.checkpoint.sha256,
    reviewSha256: context.checkpoint.reviewSha256,
  });
}

/**
 * Applies the current authenticated two-Eye `before` decision as a bounded inverse transaction.
 * Immutable repair, reviewer, checkpoint, observation, capture, and blob history is retained.
 */
export function rollbackRejectedProductionRepair(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  writer: ProjectWriteAdapter;
  reviewPath: string;
}>): RejectedProductionRepairRollbackOutcome {
  requireProjectWriteAdapterForInvocation(input.root, input.writer, input.invocation);
  const release = acquireProjectMutationLock(input.root, input.invocation);
  let transactionStarted = false;
  try {
    if (optionalStableRead(input.root, ROLLBACK_JOURNAL_PATH, 'production repair rollback journal') !== null) {
      return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
    }
    const context = resolveRollbackContext(input.root, input.invocation, input.reviewPath, 'during');
    if (context.sourceIsBefore && context.pointerIsBefore) return rollbackOutcome(context);
    if (context.sourceIsBefore || context.pointerIsBefore) return rollbackFail('REPAIR_ROLLBACK_STALE');
    const writeJournal = (state: RollbackJournalState): void => writeAtomic(
      context.root, input.invocation, ROLLBACK_JOURNAL_PATH, rollbackJournalBytes(rollbackJournal(context, state)),
    );
    writeJournal('prepared');
    transactionStarted = true;
    writeTarget(context.root, input.invocation, context.outcome.path, context.before, context.outcome.mode);
    writeJournal('source-restored');
    writeAtomic(context.root, input.invocation, '.omd/observation-v2.json', context.beforePointer);
    writeJournal('pointer-restored');
    input.writer.remove(ROLLBACK_JOURNAL_PATH);
    return rollbackOutcome(context);
  } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError(transactionStarted
      ? 'UNRESOLVED_REPAIR_ROLLBACK_JOURNAL'
      : 'REPAIR_ROLLBACK_STALE');
  } finally { release(); }
}

/** Completes a fully authenticated interrupted rollback; ambiguous combinations remain journaled. */
export function recoverRejectedProductionRepairRollback(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  writer: ProjectWriteAdapter;
  reviewPath: string;
}>): Readonly<{ status: 'clean' | 'rolled-back'; outcome?: RejectedProductionRepairRollbackOutcome }> {
  requireProjectWriteAdapterForInvocation(input.root, input.writer, input.invocation);
  if (optionalStableRead(input.root, ROLLBACK_JOURNAL_PATH, 'production repair rollback journal') === null) {
    return Object.freeze({ status: 'clean' });
  }
  const release = acquireProjectMutationLock(input.root, input.invocation);
  try {
    const bytes = optionalStableRead(input.root, ROLLBACK_JOURNAL_PATH, 'production repair rollback journal');
    if (bytes === null) return Object.freeze({ status: 'clean' });
    const journal = parseRollbackJournal(bytes);
    let requestedReviewPath: string;
    try {
      requestedReviewPath = rollbackArtifactPath(
        input.reviewPath, /^\.omd\/final-review\/refinements\/sha256-[a-f0-9]{64}\.json$/,
      );
    } catch { return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL'); }
    if (requestedReviewPath !== journal.reviewPath) {
      return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
    }
    let context: RollbackContext;
    try { context = resolveRollbackContext(input.root, input.invocation, requestedReviewPath, 'during'); }
    catch { return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL'); }
    const expected = rollbackJournal(context, journal.state);
    if (!rollbackJournalBytes(expected).equals(bytes)) return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
    if ((!context.sourceIsBefore && context.pointerIsBefore)
      || (journal.state === 'source-restored' && !context.sourceIsBefore)
      || (journal.state === 'pointer-restored' && (!context.sourceIsBefore || !context.pointerIsBefore))) {
      return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
    }
    const writeJournal = (state: RollbackJournalState): void => writeAtomic(
      context.root, input.invocation, ROLLBACK_JOURNAL_PATH, rollbackJournalBytes(rollbackJournal(context, state)),
    );
    if (!context.sourceIsBefore) {
      writeTarget(context.root, input.invocation, context.outcome.path, context.before, context.outcome.mode);
    }
    writeJournal('source-restored');
    if (!context.pointerIsBefore) writeAtomic(context.root, input.invocation, '.omd/observation-v2.json', context.beforePointer);
    writeJournal('pointer-restored');
    input.writer.remove(ROLLBACK_JOURNAL_PATH);
    return Object.freeze({ status: 'rolled-back', outcome: rollbackOutcome(context) });
  } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
  } finally { release(); }
}

/** Proves the rollback pointer/source lineage is complete and no transaction residue remains. */
export function validateRejectedProductionRepairRollback(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  reviewPath: string;
}>): RejectedProductionRepairRollbackOutcome {
  try {
    if (optionalStableRead(input.root, ROLLBACK_JOURNAL_PATH, 'production repair rollback journal') !== null) {
      return rollbackFail('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
    }
    return rollbackOutcome(resolveRollbackContext(input.root, input.invocation, input.reviewPath, 'after'));
  }
  catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    return rollbackFail('REPAIR_ROLLBACK_STALE');
  }
}

function restoreOptional(root: string, invocation: ProjectRunInvocation, writer: ProjectWriteAdapter, path: string, base64: string | null): void {
  if (base64 === null) writer.remove(path);
  else writeAtomic(root, invocation, path, Buffer.from(base64, 'base64'));
}

export function recoverProductionRepair(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  writer: ProjectWriteAdapter;
}>): Readonly<{ status: 'clean' | 'rolled-back' }> {
  requireProjectWriteAdapterForInvocation(input.root, input.writer, input.invocation);
  if (optionalStableRead(input.root, ROLLBACK_JOURNAL_PATH, 'production repair rollback journal') !== null) {
    throw new ProductionRepairError('UNRESOLVED_REPAIR_ROLLBACK_JOURNAL');
  }
  if (optionalStableRead(input.root, JOURNAL_PATH, 'production repair journal') === null) return Object.freeze({ status: 'clean' });
  const release = acquireProjectMutationLock(input.root, input.invocation);
  try {
    const journalBytes = optionalStableRead(input.root, JOURNAL_PATH, 'production repair journal');
    if (journalBytes === null) return Object.freeze({ status: 'clean' });
    const value = parseJournal(journalBytes);
    const before = decodeBase64(value.beforeBase64);
    const outcome = decodeBase64(value.outcomeBase64);
    const reviewBytes = decodeBase64(value.reviewBase64);
    const pointerBytes = decodeBase64(value.observationPointer);
    const retentionBytes = value.retentionPointer === null ? null : decodeBase64(value.retentionPointer);
    if (value.handoffPointer !== null) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    let rawReview: unknown;
    try { rawReview = JSON.parse(reviewBytes.toString('utf8')); } catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
    const reviewed = snapshotReview(rawReview); const review = reviewed.review;
    if ((retentionBytes === null ? null : hash(retentionBytes)) !== review.retentionPointerSha256) {
      throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    }
    let rawOutcome: unknown;
    try { rawOutcome = JSON.parse(outcome.toString('utf8')); } catch { throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL'); }
    const outcomeSchema = typeof rawOutcome === 'object' && rawOutcome !== null && !Array.isArray(rawOutcome)
      ? (rawOutcome as Record<string, unknown>).schema : undefined;
    if (outcomeSchema !== 'omd-production-repair-outcome-v2'
      && outcomeSchema !== 'omd-production-repair-outcome-v3') {
      throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    }
    const expectedOutcome = repairOutcomeBytes(value, outcomeSchema);
    if (!reviewBytes.equals(Buffer.from(reviewed.bytes)) || hash(reviewBytes) !== value.reviewSha256
      || review.beforeSha256 !== value.beforeTreeSha256 || review.afterSha256 !== value.afterTreeSha256
      || !review.suggestedPaths.includes(value.path) || hash(before) !== value.beforeTreeSha256
      || !outcome.equals(expectedOutcome) || value.outcomePath !== `.omd/production-repairs/sha256-${hash(expectedOutcome)}.json`) {
      throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    }
    validateObservationPointerBytes(input.root, pointerBytes, review.observationPointerSha256, value.predecessorSha256);
    validateRetentionBytes(retentionBytes, value.predecessorSha256);
    requireFinalReviewerLaneAuthorization(input.invocation, input.root, reviewBytes);
    recoverySlicePaths(input.root, input.invocation, value);
    const beforeBlob = stableRead(input.root, `.omd/production-repair-blobs/sha256-${value.beforeTreeSha256}.bin`, 'repair recovery before blob');
    const afterBlob = stableRead(input.root, `.omd/production-repair-blobs/sha256-${value.afterTreeSha256}.bin`, 'repair recovery after blob');
    if (!beforeBlob.equals(before) || hash(beforeBlob) !== value.beforeTreeSha256 || hash(afterBlob) !== value.afterTreeSha256) {
      throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    }
    const current = stableRead(input.root, value.path, 'repair recovery production target');
    const currentSha256 = hash(current); const currentMode = lstatSync(resolve(input.root, value.path)).mode & 0o777;
    if ((currentSha256 !== value.beforeTreeSha256 && currentSha256 !== value.afterTreeSha256) || currentMode !== value.mode) {
      throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    }
    const currentPointer = optionalStableRead(input.root, '.omd/observation-v2.json', 'repair recovery current observation pointer');
    const currentRetention = optionalStableRead(input.root, '.omd/observation-v2-retention.json', 'repair recovery current retention pointer');
    const currentHandoff = optionalStableRead(input.root, HANDOFF_PATH, 'repair recovery current predecessor handoff');
    const currentOutcome = optionalStableRead(input.root, value.outcomePath, 'repair recovery current outcome');
    const expectedHandoff = expectedHandoffBytes(value.predecessorSha256);
    if ((currentPointer !== null && !currentPointer.equals(pointerBytes))
      || (currentRetention !== null && (retentionBytes === null || !currentRetention.equals(retentionBytes)))
      || (currentHandoff !== null && !currentHandoff.equals(expectedHandoff))
      || (currentOutcome !== null && !currentOutcome.equals(expectedOutcome))) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    if (value.state === 'prepared') {
      if (currentOutcome !== null) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    } else if (currentSha256 !== value.afterTreeSha256 || currentPointer !== null || currentRetention !== null || currentHandoff === null) {
      throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
    }
    if (value.state === 'committed') {
      if (currentOutcome === null) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
      input.writer.remove(JOURNAL_PATH);
      return Object.freeze({ status: 'clean' });
    }
    if (currentSha256 === value.afterTreeSha256) writeTarget(input.root, input.invocation, value.path, before, value.mode);
    input.writer.remove(value.outcomePath);
    restoreOptional(input.root, input.invocation, input.writer, '.omd/observation-v2.json', value.observationPointer);
    restoreOptional(input.root, input.invocation, input.writer, '.omd/observation-v2-retention.json', value.retentionPointer);
    restoreOptional(input.root, input.invocation, input.writer, HANDOFF_PATH, value.handoffPointer);
    input.writer.remove(JOURNAL_PATH);
    return Object.freeze({ status: 'rolled-back' });
  } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
  } finally { release(); }
}
