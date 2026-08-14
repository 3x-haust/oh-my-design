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
import {
  requireFinalReviewerLaneAuthorization,
  type ProjectRunInvocation,
} from './invocation.ts';
import { observationV2Sha256, validateObservationV2 } from './observation.ts';
import {
  acquireProjectMutationLock,
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
  | 'UNRESOLVED_REPAIR_JOURNAL';

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

export function productionRepairReviewBytes(review: ProductionRepairReview): Buffer {
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

function mirrorFiles(root: string): readonly string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = resolve(directory, name);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
        throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
      }
      if (metadata.isDirectory()) visit(absolute);
      else result.push(relative(root, absolute).split(sep).join('/'));
    }
  };
  try { visit(root); } catch (error) {
    if (error instanceof ProductionRepairError) throw error;
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  return result;
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
  const slice = currentSlice(input.root, input.invocation);
  const paths = slicePaths(slice.value);
  const mirrorRoot = requirePrivateMirror(input.root, input.mirrorRoot);
  const files = mirrorFiles(mirrorRoot);
  if (files.length !== paths.length || files.some((path, index) => path !== paths[index])) {
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  const changes: Array<Readonly<{ path: string; before: Buffer; after: Buffer; mode: number }>> = [];
  for (const path of paths) {
    let before: Buffer; let after: Buffer;
    try {
      before = stableRead(input.root, path, `repair production source ${path}`);
      after = stableRead(mirrorRoot, path, `staged repair source ${path}`);
    } catch { throw new ProductionRepairError('MALFORMED_STAGED_REPAIR'); }
    const beforeMetadata = lstatSync(resolve(input.root, path));
    const afterMetadata = lstatSync(resolve(mirrorRoot, path));
    const mode = beforeMetadata.mode & 0o777;
    if ((afterMetadata.mode & 0o777) !== mode) throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
    if (!before.equals(after)) changes.push({ path, before, after, mode });
  }
  if (changes.length === 0) throw new ProductionRepairError('NO_OP_REPAIR');
  if (changes.length !== 1) throw new ProductionRepairError('MULTI_FILE_REPAIR');
  const change = changes[0] as (typeof changes)[number];
  if (change.after.byteLength === 0) throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  if (!within(change.path, route.allowedPaths) || !reviewPaths.includes(change.path)) {
    throw new ProductionRepairError('REPAIR_PATH_OUTSIDE_ROUTE');
  }
  const beforeSha256 = hash(change.before);
  const afterSha256 = hash(change.after);
  if (reviewed.review.beforeSha256 !== beforeSha256 || reviewed.review.afterSha256 !== afterSha256) {
    throw new ProductionRepairError('MALFORMED_STAGED_REPAIR');
  }
  const source = slice.value.slices.flatMap((entry) => [entry.component.source, entry.representativeContext.source])
    .find((candidate) => candidate.path === change.path);
  if (source === undefined || source.sha256 !== beforeSha256) throw new ProductionRepairError('STALE_REPAIR_BASE');
  const stage = Object.freeze({ schema: 'opaque-staged-production-repair-v1' as const });
  stagedRepairs.set(stage, Object.freeze({
    root: realpathSync(input.root), invocation: input.invocation, review: reviewed.review, reviewBytes: reviewed.bytes,
    path: change.path, before: Buffer.from(change.before), after: Buffer.from(change.after),
    beforeSha256, afterSha256, mode: change.mode,
    routeSha256: adaptiveRouteRecordSha256(route), sliceSha256: slice.receipt.sha256,
    observationPointerSha256: hash(observation.pointer),
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
  path: string; beforeTreeSha256: string; afterTreeSha256: string; routeSha256: string;
  sliceSha256: string; reviewSha256: string; predecessorSha256: string;
}>): Buffer {
  return Buffer.from(`${canonicalJson({
    schema: 'omd-production-repair-outcome-v2', outcome: 'committed', path: value.path,
    beforeTreeSha256: value.beforeTreeSha256, afterTreeSha256: value.afterTreeSha256,
    routeSha256: value.routeSha256, sliceSha256: value.sliceSha256,
    reviewSha256: value.reviewSha256, predecessorSha256: value.predecessorSha256,
  })}
`);
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
    requireFinalReviewerLaneAuthorization(input.invocation, input.root, Buffer.from(stage.reviewBytes));
    const observation = currentObservation(input.root);
    const route = readPersistedRoute(input.root, input.invocation);
    const slice = currentSlice(input.root, input.invocation);
    if (hash(observation.pointer) !== stage.observationPointerSha256
      || stage.review.observationPointerSha256 !== stage.observationPointerSha256
      || adaptiveRouteRecordSha256(route) !== stage.routeSha256
      || slice.receipt.sha256 !== stage.sliceSha256) throw new ProductionRepairError('STALE_REPAIR_BASE');
    const allowedSlicePaths = slicePaths(slice.value);
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
      path: stage.path, beforeTreeSha256: stage.beforeSha256, afterTreeSha256: stage.afterSha256,
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
      status: 'committed', path: stage.path, beforeTreeSha256: stage.beforeSha256,
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

function recoverySlicePaths(root: string, invocation: ProjectRunInvocation, journal: RepairJournal): readonly string[] {
  const route = readPersistedRoute(root, invocation);
  if (adaptiveRouteRecordSha256(route) !== journal.routeSha256) throw new ProductionRepairError('UNRESOLVED_REPAIR_JOURNAL');
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
    const expectedOutcome = repairOutcomeBytes(value);
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
