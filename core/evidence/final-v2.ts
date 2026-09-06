import { createHash, randomBytes } from 'node:crypto';
import {
  constants as fsConstants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { hostname as localHostname } from 'node:os';
import { relative, resolve } from 'node:path';

import {
  type ArtifactReceipt,
  type FinalEvidenceV2Graph,
  type FinalEvidenceV2GraphVariant,
  type FinalEvidenceV2GraphBindings,
  type FinalEvidenceV2GraphBindingsVariant,
  type WorkflowArtSelectedFinalEvidenceV2Graph,
  type WorkflowAdaptiveFinalEvidenceV2Graph,
  isWorkflowAdaptiveFinalEvidenceV2Graph,
  isWorkflowArtSelectedFinalEvidenceV2Graph,
  validateFinalEvidenceV2Graph,
  validateFinalEvidenceV2GraphFiles,
} from './final-v2-graph.ts';
import { isAdaptiveFinalEvidenceV2Graph, type AdaptiveFinalEvidenceV2Graph } from './final-v2-adaptive-contract.ts';
import { validateArtDirectionPointer, validateArtDirectionRecord } from '../art-direction/schema.ts';
import { parseEvidenceClaimPublication, type EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import { validateStaticDirectionEvidenceV1 } from '../art-direction/static-evidence.ts';
import { validateMotionEvidenceV2, validateRenderedBeatResultAuthority } from '../render/index.ts';
import { hasHostBoundLocalProjectWriteAuthority } from '../runtime/activation.ts';
import { requireFinalEvidenceManifestAuthorization, requireMotionCollectorAuthorization, requireStaticEvidenceResultAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { acquireProjectMutationLock } from '../runtime/project-write.ts';
import { preflightFinalEvidenceGraph, revalidateFinalEvidenceGraph } from './final-v2-publication-preflight.ts';
import { checkCompletionPublicationPrerequisites } from '../completion/publication.ts';
export const FINAL_EVIDENCE_V2_SCHEMA = 'final-evidence-v2';
export const FINAL_EVIDENCE_V2_POINTER_SCHEMA = 'final-evidence-v2-pointer';
export const FINAL_EVIDENCE_V2_LOCK_TTL_MS = 15 * 60 * 1000;
export const FINAL_EVIDENCE_V2_GC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MotionDecision = 'none' | 'one';
export type FinalEvidenceV2Bindings = FinalEvidenceV2GraphBindings;
export type MotionEvidenceV2Binding = ArtifactReceipt & Readonly<{ schema: 'motion-evidence-v2' }>;
export type StaticDirectionEvidenceV1Binding = ArtifactReceipt & Readonly<{ schema: 'static-direction-evidence-v1' }>;
export interface FinalEvidenceV2Manifest {
  schema: typeof FINAL_EVIDENCE_V2_SCHEMA;
  motionDecision: MotionDecision;
  claimPublication: EvidenceClaimPublication;
  graph: Exclude<FinalEvidenceV2Graph, AdaptiveFinalEvidenceV2Graph>;
  graphRootHash?: string;
  motionEvidence?: MotionEvidenceV2Binding;
  staticEvidence?: StaticDirectionEvidenceV1Binding;
}
export interface WorkflowArtSelectedFinalEvidenceV2Manifest extends Omit<FinalEvidenceV2Manifest, 'graph'> {
  graph: WorkflowArtSelectedFinalEvidenceV2Graph;
}
export interface AdaptiveOmissionFinalEvidenceV2Manifest {
  schema: typeof FINAL_EVIDENCE_V2_SCHEMA;
  motionDecision: 'none';
  claimPublication: EvidenceClaimPublication;
  graph: AdaptiveFinalEvidenceV2Graph | WorkflowAdaptiveFinalEvidenceV2Graph;
  graphRootHash?: string;
  motionEvidence?: never;
  staticEvidence?: never;
}
export type FinalEvidenceV2ManifestVariant = FinalEvidenceV2Manifest | WorkflowArtSelectedFinalEvidenceV2Manifest | AdaptiveOmissionFinalEvidenceV2Manifest;
function isAdaptiveFinalEvidenceV2Manifest(value: FinalEvidenceV2ManifestVariant): value is AdaptiveOmissionFinalEvidenceV2Manifest {
  return isAdaptiveFinalEvidenceV2Graph(value.graph) || isWorkflowAdaptiveFinalEvidenceV2Graph(value.graph);
}

export interface FinalEvidenceV2Pointer {
  schema: typeof FINAL_EVIDENCE_V2_POINTER_SCHEMA;
  record: string;
  sha256: string;
}

interface FinalEvidenceV2FileSystem {
  mkdir(path: string, options: { recursive: true }): void;
  open(path: string, flags: string | number, mode: number): number;
  write(fd: number, bytes: string | Buffer, offset?: number, length?: number): number;
  writeFile(path: string, bytes: string, options: { flag: string; mode: number }): void;
  readFile(path: string | number): Buffer;
  rename(from: string, to: string): void;
  link(existingPath: string, newPath: string): void;
  unlink(path: string): void;
  rm(path: string, options: { force: true; recursive?: boolean }): void;
  utimes(path: string, atime: Date, mtime: Date): void;
  lstat(path: string): { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number; mtimeMs: number; ctimeMs: number; dev?: number; ino?: number; nlink?: number };
  fstat(fd: number): { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number; mtimeMs: number; ctimeMs: number; dev?: number; ino?: number; nlink?: number };
  readdir(path: string): string[];
  fsync(fd: number): void;
  close(fd: number): void;
  exists(path: string): boolean;
}

export interface FinalEvidenceV2GcResult {
  dryRun: boolean;
  quarantined: string[];
  deleted: string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const RECORD = /^sha256-([a-f0-9]{64})\.json$/;
const LOCK = '.final-evidence-v2.lock';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function hash(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message: string): never { throw new Error(`final-evidence-v2: ${message}`); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} has unexpected keys`);
}
function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be a sha256 hex digest`);
  return value;
}
function fileName(value: unknown): string {
  if (typeof value !== 'string' || !RECORD.test(value)) fail('pointer record is invalid');
  return value;
}

/** Validates receipt descriptors. Files are validated only by the publisher/checker against the project root. */
export function validateFinalEvidenceV2ManifestVariant(value: unknown): FinalEvidenceV2ManifestVariant {
  const manifest = object(value, 'manifest');
  exact(manifest, ['schema', 'motionDecision', 'claimPublication', 'graph', 'graphRootHash', 'motionEvidence', 'staticEvidence'].filter((key) => key in manifest), 'manifest');
  if (manifest.schema !== FINAL_EVIDENCE_V2_SCHEMA) fail('unsupported manifest schema');
  if (manifest.motionDecision !== 'none' && manifest.motionDecision !== 'one') fail('motionDecision must be none or one');
  const claimPublication = parseEvidenceClaimPublication(manifest.claimPublication);
  const graph = validateFinalEvidenceV2Graph(manifest.graph);
  const graphRootHash = manifest.graphRootHash === undefined ? undefined : digest(manifest.graphRootHash, 'graphRootHash');
  if (isAdaptiveFinalEvidenceV2Graph(graph) || isWorkflowAdaptiveFinalEvidenceV2Graph(graph)) {
    if (manifest.motionDecision !== 'none' || manifest.motionEvidence !== undefined || manifest.staticEvidence !== undefined) fail('adaptive omission manifests require motionDecision none and no art evidence branch');
    return { schema: FINAL_EVIDENCE_V2_SCHEMA, motionDecision: 'none', claimPublication, graph, ...(graphRootHash === undefined ? {} : { graphRootHash }) };
  }
  const receipt = (value: unknown, label: string, schema: string): ArtifactReceipt & { schema: typeof schema } => {
    const item = object(value, label);
    exact(item, ['path', 'schema', 'sha256'], label);
    if (item.schema !== schema || typeof item.path !== 'string' || typeof item.sha256 !== 'string') fail(`${label} is invalid`);
    digest(item.sha256, `${label}.sha256`);
    return { path: item.path, schema, sha256: item.sha256 };
  };
  if (manifest.motionDecision === 'one') {
    if (manifest.staticEvidence !== undefined || manifest.motionEvidence === undefined) fail('one requires exactly one motion evidence and no static evidence');
    const motionEvidence = receipt(manifest.motionEvidence, 'motionEvidence', 'motion-evidence-v2') as MotionEvidenceV2Binding;
    if (isWorkflowArtSelectedFinalEvidenceV2Graph(graph)) return { schema: FINAL_EVIDENCE_V2_SCHEMA, motionDecision: 'one', claimPublication, graph, ...(graphRootHash === undefined ? {} : { graphRootHash }), motionEvidence };
    return { schema: FINAL_EVIDENCE_V2_SCHEMA, motionDecision: 'one', claimPublication, graph, ...(graphRootHash === undefined ? {} : { graphRootHash }), motionEvidence };
  }
  if (manifest.motionEvidence !== undefined || manifest.staticEvidence === undefined) fail('none requires exactly one static evidence and no motion evidence');
  const staticEvidence = receipt(manifest.staticEvidence, 'staticEvidence', 'static-direction-evidence-v1') as StaticDirectionEvidenceV1Binding;
  if (isWorkflowArtSelectedFinalEvidenceV2Graph(graph)) return { schema: FINAL_EVIDENCE_V2_SCHEMA, motionDecision: 'none', claimPublication, graph, ...(graphRootHash === undefined ? {} : { graphRootHash }), staticEvidence };
  return { schema: FINAL_EVIDENCE_V2_SCHEMA, motionDecision: 'none', claimPublication, graph, ...(graphRootHash === undefined ? {} : { graphRootHash }), staticEvidence };
}
export function validateFinalEvidenceV2Manifest(value: unknown): FinalEvidenceV2Manifest;
export function validateFinalEvidenceV2Manifest(value: unknown) { return validateFinalEvidenceV2ManifestVariant(value); }

function filesystem(): FinalEvidenceV2FileSystem {
  return {
    mkdir: mkdirSync, open: openSync, write: (fd, bytes, offset, length) => typeof bytes === 'string'
      ? writeSync(fd, bytes, offset) : writeSync(fd, bytes, offset ?? 0, length ?? bytes.byteLength), writeFile: writeFileSync, readFile: readFileSync, rename: renameSync, link: linkSync,
    unlink: unlinkSync, rm: rmSync, lstat: lstatSync, fstat: fstatSync, readdir: readdirSync, fsync: fsyncSync, close: closeSync, exists: existsSync, utimes: utimesSync,
  };
}
function rootPath(rootInput: string): string {
  try {
    const root = realpathSync(resolve(rootInput));
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('project root is unsafe');
    return root;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('final-evidence-v2:')) throw error;
    fail('project root must be an existing real directory');
  }
}
function requireFinalEvidenceV2Authority(rootInput: string, invocation: ProjectRunInvocation): string {
  const root = rootPath(rootInput);
  if (!hasHostBoundLocalProjectWriteAuthority(invocation, root)) {
    fail('a current host-issued project invocation bound to this project root is required');
  }
  return root;
}
function ensureDirectory(fs: FinalEvidenceV2FileSystem, path: string): void {
  fs.mkdir(path, { recursive: true });
  const stat = fs.lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`unsafe directory: ${path}`);
}
function syncDirectory(fs: FinalEvidenceV2FileSystem, path: string): void {
  const fd = fs.open(path, 'r', 0o600);
  try { fs.fsync(fd); } finally { fs.close(fd); }
}
function syncFile(fs: FinalEvidenceV2FileSystem, path: string): void {
  const fd = fs.open(path, 'r', 0o600);
  try { fs.fsync(fd); } finally { fs.close(fd); }
}
function regular(fs: FinalEvidenceV2FileSystem, path: string): void {
  const stat = fs.lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`unsafe file: ${path}`);
}
function sameFileIdentity(left: { dev?: number; ino?: number; size: number; mtimeMs: number; ctimeMs: number }, right: { dev?: number; ino?: number; size: number; mtimeMs: number; ctimeMs: number }): boolean {
  return left.dev !== undefined && left.ino !== undefined && left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}
function readStableRegularFile(fs: FinalEvidenceV2FileSystem, path: string, label: string): Buffer {
  const before = fs.lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) fail(`${label} is not a regular non-symlink file`);
  const fd = fs.open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, 0o600);
  try {
    const opened = fs.fstat(fd);
    const entry = fs.lstat(path);
    if (!opened.isFile() || !entry.isFile() || entry.isSymbolicLink() || !sameFileIdentity(before, opened) || !sameFileIdentity(opened, entry)) fail(`${label} changed or is not a regular non-symlink file`);
    const bytes = fs.readFile(fd);
    const after = fs.fstat(fd);
    const current = fs.lstat(path);
    if (!sameFileIdentity(opened, after) || !current.isFile() || current.isSymbolicLink() || !sameFileIdentity(opened, current)) fail(`${label} changed while it was read`);
    return bytes;
  } finally {
    fs.close(fd);
  }
}
function requireRealAncestors(root: string, path: string, fs: FinalEvidenceV2FileSystem, label: string): void {
  const rootStat = fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail(`${label} root is unsafe`);
  let current = root;
  for (const segment of relative(root, path).split('/').slice(0, -1)) {
    current = resolve(current, segment);
    const stat = fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} has an unsafe ancestor`);
  }
}
function requireRealNestedProjectPaths(root: string, value: unknown, fs: FinalEvidenceV2FileSystem, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => requireRealNestedProjectPaths(root, item, fs, `${label}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'path' && typeof item === 'string') {
      if (item.includes('\0') || item.includes('\\') || item.startsWith('/') || /^[A-Za-z]:\//.test(item) || item.split('/').some((part) => !part || part === '.' || part === '..')) fail(`${label}.${key} is not a safe project-relative path`);
      const path = resolve(root, item);
      const outside = relative(root, path);
      if (outside === '' || outside.startsWith('..') || resolve(root, outside) !== path) fail(`${label}.${key} escapes the project root`);
      requireRealAncestors(root, path, fs, `${label}.${key}`);
      regular(fs, path);
    }
    requireRealNestedProjectPaths(root, item, fs, `${label}.${key}`);
  }
}
function temporary(directory: string, stem: string): string { return resolve(directory, `.${stem}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`); }
function parseJsonBytes(bytes: Buffer, label: string): unknown {
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(`${label} is not valid JSON`); }
}
function readJson(fs: FinalEvidenceV2FileSystem, path: string, label: string): unknown {
  return parseJsonBytes(readStableRegularFile(fs, path, label), label);
}
function pointerFrom(bytes: Buffer): FinalEvidenceV2Pointer {
  const pointer = object(parseJsonBytes(bytes, 'pointer'), 'pointer');
  exact(pointer, ['schema', 'record', 'sha256'], 'pointer');
  if (pointer.schema !== FINAL_EVIDENCE_V2_POINTER_SCHEMA) fail('unsupported pointer schema');
  return { schema: FINAL_EVIDENCE_V2_POINTER_SCHEMA, record: fileName(pointer.record), sha256: digest(pointer.sha256, 'pointer.sha256') };
}
function paths(root: string): { omd: string; runs: string; consumptions: string; pointer: string; lock: string; publicationJournal: string; quarantine: string; gcJournal: string; gcRunsClaim: string; gcQuarantineClaim: string } {
  const omd = resolve(root, '.omd');
  return {
    omd, runs: resolve(omd, 'final-evidence-v2-runs'), consumptions: resolve(omd, 'final-evidence-v2-motion-consumptions'), pointer: resolve(omd, 'final-evidence-v2.json'),
    lock: resolve(omd, LOCK), publicationJournal: resolve(omd, '.final-evidence-v2-publication.journal'), quarantine: resolve(omd, 'final-evidence-v2-quarantine'),
    gcJournal: resolve(omd, '.final-evidence-v2-gc.journal'),
    gcRunsClaim: resolve(omd, '.final-evidence-v2-gc-runs.claim'),
    gcQuarantineClaim: resolve(omd, '.final-evidence-v2-gc-quarantine.claim'),
  };
}
function validateBackedManifest(root: string, fs: FinalEvidenceV2FileSystem, value: unknown, invocation?: ProjectRunInvocation, consumeMotionAuthorizations = false): FinalEvidenceV2ManifestVariant {
  const manifest = validateFinalEvidenceV2ManifestVariant(value);
  const graph = validateFinalEvidenceV2GraphFiles(root, manifest.graph, fs, invocation ?? fail('a fresh host invocation is required to validate final evidence'));
  if (manifest.graphRootHash !== graph.rootHash) fail('graph root hash changed');
  if (graph.bindings.branch === 'adaptive-omission') {
    if ((!isAdaptiveFinalEvidenceV2Graph(manifest.graph) && !isWorkflowAdaptiveFinalEvidenceV2Graph(manifest.graph)) || canonical(manifest.claimPublication) !== canonical(graph.bindings.claimPublication)) fail('claim publication does not match the adaptive source contract');
    return manifest;
  }
  if (isAdaptiveFinalEvidenceV2Manifest(manifest)) fail('adaptive graph bindings are inconsistent');
  const artDirectionPath = resolve(root, manifest.graph.artDirection.path);
  requireRealAncestors(root, artDirectionPath, fs, 'art direction');
  const artDirection = validateArtDirectionRecord(readJson(fs, artDirectionPath, 'art direction'));
  const artDirectionPointerPath = resolve(root, '.omd', 'art-direction.json');
  requireRealAncestors(root, artDirectionPointerPath, fs, 'art direction pointer');
  const artDirectionPointer = validateArtDirectionPointer(readJson(fs, artDirectionPointerPath, 'art direction current pointer'));
  if (`.omd/${artDirectionPointer.record}` !== manifest.graph.artDirection.path || artDirectionPointer.sha256 !== graph.bindings.artDirectionSha256) fail('art direction receipt is not the current immutable record');
  if (artDirection.decision.motionDecision !== manifest.motionDecision) fail('evidence branch does not match the selected art-direction decision');
  const evidence = manifest.motionDecision === 'one' ? manifest.motionEvidence : manifest.staticEvidence;
  if (evidence === undefined) fail('evidence branch is missing');
  const evidencePath = resolve(root, evidence.path);
  const outside = relative(root, evidencePath);
  if (outside === '' || outside.startsWith('..') || resolve(root, outside) !== evidencePath) fail('evidence branch escapes the project root');
  requireRealAncestors(root, evidencePath, fs, 'evidence branch');
  const evidenceBytes = readStableRegularFile(fs, evidencePath, 'evidence branch');
  if (hash(evidenceBytes) !== evidence.sha256) fail('evidence branch hash changed');
  const evidenceObject = object(parseJsonBytes(evidenceBytes, 'evidence branch'), 'evidence branch');
  requireRealNestedProjectPaths(root, evidenceObject, fs, 'evidence branch');
  if ((evidenceObject.schema ?? evidenceObject.schemaVersion) !== evidence.schema) fail('evidence branch schema changed');
  if (evidenceObject.artDirectionHash !== graph.bindings.artDirectionSha256) fail('evidence branch provenance does not bind the selected semantic art direction');
  if (manifest.motionDecision === 'one') {
    if (invocation === undefined) fail('motion evidence requires the fresh host invocation');
    requireMotionCollectorAuthorization(invocation, root, evidenceBytes, consumeMotionAuthorizations);
    const observedMotion = object(evidenceObject.observed, 'motion evidence observed');
    const observedRoute = typeof observedMotion.route === 'string' ? observedMotion.route : fail('motion evidence route is missing');
    const observedTarget = typeof observedMotion.target === 'string' ? observedMotion.target : fail('motion evidence target is missing');
    const observedTaskId = typeof observedMotion.taskId === 'string' ? observedMotion.taskId : fail('motion evidence task is missing');
    const task = graph.bindings.motionTask;
    if (task !== undefined && (observedTaskId !== task.taskId || observedRoute !== task.route || !task.targets.includes(observedTarget))) {
      fail('motion evidence does not bind the current task-derived route, task, and host-authorized live target');
    }
    const route = task?.route ?? observedRoute;
    const target = task === undefined ? observedTarget : task.targets.find((candidate) => candidate === observedTarget)
      ?? fail('motion evidence target is not a current task-authorized probe target');
    const taskId = task?.taskId ?? observedTaskId;
    if (task === undefined && route !== artDirection.decision.route) fail('motion evidence route is not the current art-direction route');
    const motion = validateMotionEvidenceV2(evidenceObject, {
      motionDecision: 'one',
      artDirectionHash: graph.bindings.artDirectionSha256,
      buildHash: graph.bindings.buildSha256,
      root,
      invocation,
      route,
      target,
      taskId,
      consumeResult: consumeMotionAuthorizations,
    });
    if (motion.scenes.length !== 1) fail('motion evidence must prove exactly one scene');
    const observed = object(evidenceObject.observed, 'motion evidence observed');
    const influence = object(observed.sourceInfluence, 'motion evidence source influence');
    if (influence.kind === 'reference-slot') {
      if (typeof influence.referenceSlotId !== 'string'
        || !graph.bindings.allowedMotionReferenceSlotIds.includes(influence.referenceSlotId)) {
        fail('motion evidence source is not an allowed graph-derived motion reference');
      }
    } else if (influence.kind === 'approved-recipe') {
      const recipe = graph.bindings.approvedMotionRecipe;
      if (recipe === undefined || influence.recipeId !== recipe.recipeId || influence.recipeSha256 !== recipe.recipeSha256) {
        fail('motion evidence source is not the exact decision-bound approved recipe');
      }
    } else {
      fail('motion evidence source is not a supported graph-derived motion source');
    }
  } else {
    if (invocation === undefined) fail('static evidence requires the fresh host invocation');
    requireStaticEvidenceResultAuthorization(invocation, root, evidenceBytes);
    const canonicalBeatPath = resolve(root, manifest.graph.renderedBeats.path);
    requireRealAncestors(root, canonicalBeatPath, fs, 'canonical rendered Beat receipt');
    if (canonical(evidenceObject.beatReceipt) !== canonical(readJson(fs, canonicalBeatPath, 'canonical rendered Beat receipt'))) fail('static evidence does not embed the graph-canonical Beat and copy receipt');
    const canonicalBeatReceipt = object(evidenceObject.beatReceipt, 'static evidence beat receipt');
    validateStaticDirectionEvidenceV1(evidenceObject, {
      motionDecision: 'none',
      selectedRegister: artDirection.decision.selectedRegister,
      selectedStaticReferenceSlotIds: artDirection.decision.selectedStaticReferenceSlotIds,
      artDirectionHash: graph.bindings.artDirectionSha256,
      selectionSha256: graph.bindings.settledSelectionSha256,
      handoffSha256: graph.bindings.handoffSha256,
      buildHash: graph.bindings.buildSha256,
      runId: graph.bindings.activation.buildSha256,
      observationRoot: root,
      invocation,
      route: artDirection.decision.route,
      target: typeof canonicalBeatReceipt.target === 'string' && canonicalBeatReceipt.target.length > 0
        ? canonicalBeatReceipt.target
        : fail('static evidence beat target is invalid'),
      taskId: typeof canonicalBeatReceipt.taskId === 'string' && canonicalBeatReceipt.taskId.length > 0
        ? canonicalBeatReceipt.taskId
        : fail('static evidence beat task is invalid'),
    });
  }
  if (consumeMotionAuthorizations) consumeRenderedBeatAuthorization(root, fs, manifest, graph.bindings, invocation ?? fail('rendered Beat consumption requires a fresh host invocation'));
  return manifest;
}
function consumeRenderedBeatAuthorization(
  root: string,
  fs: FinalEvidenceV2FileSystem,
  manifest: FinalEvidenceV2Manifest | WorkflowArtSelectedFinalEvidenceV2Manifest,
  bindings: FinalEvidenceV2GraphBindings,
  invocation: ProjectRunInvocation,
): void {
  const receipt = manifest.graph.renderedBeats;
  const bytes = readStableRegularFile(fs, resolve(root, receipt.path), 'rendered Beat receipt before consumption');
  if (hash(bytes) !== receipt.sha256) fail('rendered Beat receipt hash changed before consumption');
  const result = object(parseJsonBytes(bytes, 'rendered Beat receipt'), 'rendered Beat receipt');
  const task = bindings.motionTask;
  const route = task?.route ?? (typeof result.route === 'string' ? result.route : fail('rendered Beat route is invalid'));
  const taskId = task?.taskId ?? (typeof result.taskId === 'string' ? result.taskId : fail('rendered Beat task is invalid'));
  const targets = task?.targets ?? [typeof result.target === 'string' ? result.target : fail('rendered Beat target is invalid')];
  let error: unknown;
  for (const target of targets) {
    try {
      validateRenderedBeatResultAuthority(result, {
        invocation, root, buildSha256: bindings.buildSha256, artDirectionHash: bindings.artDirectionSha256, route, target, taskId, consumeResult: true,
      });
      return;
    } catch (caught) {
      error = caught instanceof Error ? caught : new Error(String(caught));
    }
  }
  fail(`rendered Beat result cannot be consumed: ${error instanceof Error ? error.message : String(error)}`);
}
function recordFor(root: string, fs: FinalEvidenceV2FileSystem, runDirectory: string, pointer: FinalEvidenceV2Pointer, invocation: ProjectRunInvocation): FinalEvidenceV2ManifestVariant {
  const path = resolve(runDirectory, pointer.record);
  requireRealAncestors(root, path, fs, 'final evidence record');
  const bytes = readStableRegularFile(fs, path, 'final evidence record');
  if (hash(bytes) !== pointer.sha256 || pointer.record !== `sha256-${pointer.sha256}.json`) fail('pointer does not identify an intact immutable record');
  return validateBackedManifest(root, fs, parseJsonBytes(bytes, 'final evidence record'), invocation);
}
function committedManifest(
  fs: FinalEvidenceV2FileSystem,
  location: ReturnType<typeof paths>,
  invocation: ProjectRunInvocation,
): Readonly<{ record: string; manifest: FinalEvidenceV2ManifestVariant }> {
  if (!directoryExists(fs, location.pointer)) fail('a current final evidence manifest is required');
  const pointer = pointerFrom(readStableRegularFile(fs, location.pointer, 'final evidence pointer'));
  const root = resolve(location.omd, '..');
  const record = resolve(location.runs, pointer.record);
  requireRealAncestors(root, record, fs, 'final evidence record');
  const bytes = readStableRegularFile(fs, record, 'final evidence record');
  if (hash(bytes) !== pointer.sha256 || pointer.record !== `sha256-${pointer.sha256}.json`) fail('pointer does not identify an intact immutable record');
  requireFinalEvidenceManifestAuthorization(invocation, root, bytes);
  const manifest = validateBackedManifest(root, fs, parseJsonBytes(bytes, 'final evidence record'), invocation);
  assertRequiredMotionConsumptions(root, fs, location, requiredMotionConsumptions(root, fs, manifest, invocation, pointer.sha256));
  return { record: pointer.record, manifest };
}
function committedRecord(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>, invocation: ProjectRunInvocation): string {
  return committedManifest(fs, location, invocation).record;
}
const MOTION_CONSUMPTION_SCHEMA = 'final-evidence-v2-motion-consumption-v1';

interface MotionConsumption {
  schema: typeof MOTION_CONSUMPTION_SCHEMA;
  projectRoot: string;
  buildSha256: string;
  briefSha256: string;
  collectorSha256: string;
  motionResultSha256: string;
  manifestSha256: string;
}

function motionConsumption(root: string, fs: FinalEvidenceV2FileSystem, manifest: FinalEvidenceV2ManifestVariant, invocation: ProjectRunInvocation, manifestSha256: string): MotionConsumption | undefined {
  if (manifest.motionDecision !== 'one' || manifest.motionEvidence === undefined) return undefined;
  const evidencePath = resolve(root, manifest.motionEvidence.path);
  requireRealAncestors(root, evidencePath, fs, 'motion evidence');
  const collectorBytes = readStableRegularFile(fs, evidencePath, 'motion evidence');
  if (hash(collectorBytes) !== manifest.motionEvidence.sha256) fail('motion evidence hash changed before consumption');
  const result = object(parseJsonBytes(collectorBytes, 'motion evidence'), 'motion evidence');
  return {
    schema: MOTION_CONSUMPTION_SCHEMA,
    projectRoot: root,
    buildSha256: invocation.current.buildSha256,
    briefSha256: invocation.current.briefSha256,
    collectorSha256: hash(collectorBytes),
    motionResultSha256: hash(Buffer.from(canonical(result))),
    manifestSha256,
  };
}
function renderedBeatConsumption(root: string, fs: FinalEvidenceV2FileSystem, manifest: FinalEvidenceV2Manifest | WorkflowArtSelectedFinalEvidenceV2Manifest, invocation: ProjectRunInvocation, manifestSha256: string): MotionConsumption {
  const receipt = manifest.graph.renderedBeats;
  const receiptPath = resolve(root, receipt.path);
  requireRealAncestors(root, receiptPath, fs, 'rendered Beat receipt');
  const receiptBytes = readStableRegularFile(fs, receiptPath, 'rendered Beat receipt');
  if (hash(receiptBytes) !== receipt.sha256) fail('rendered Beat receipt hash changed before consumption');
  return {
    schema: MOTION_CONSUMPTION_SCHEMA,
    projectRoot: root,
    buildSha256: invocation.current.buildSha256,
    briefSha256: invocation.current.briefSha256,
    collectorSha256: hash(receiptBytes),
    motionResultSha256: hash(Buffer.from(canonical(object(parseJsonBytes(receiptBytes, 'rendered Beat receipt'), 'rendered Beat receipt')))),
    manifestSha256,
  };
}
function requiredMotionConsumptions(root: string, fs: FinalEvidenceV2FileSystem, manifest: FinalEvidenceV2ManifestVariant, invocation: ProjectRunInvocation, manifestSha256: string): readonly MotionConsumption[] {
  if (isAdaptiveFinalEvidenceV2Manifest(manifest)) return [];
  const motion = motionConsumption(root, fs, manifest, invocation, manifestSha256);
  return [renderedBeatConsumption(root, fs, manifest, invocation, manifestSha256), ...(motion === undefined ? [] : [motion])];
}

function assertRequiredMotionConsumptions(root: string, fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>, consumptions: readonly MotionConsumption[]): void {
  if (!fs.exists(location.consumptions)) fail('required motion consumption is missing');
  const directory = openStableDirectory(fs, location.consumptions, 'motion consumption directory');
  try {
    for (const consumption of consumptions) {
      const bytes = Buffer.from(`${canonical(consumption)}\n`);
      const record = resolve(location.consumptions, `sha256-${hash(bytes)}.json`);
      assertStableDirectory(fs, location.consumptions, directory, 'motion consumption directory during committed validation');
      if (!fs.exists(record)) fail('required motion consumption is missing');
      requireRealAncestors(root, record, fs, 'required motion consumption');
      if (!readStableRegularFile(fs, record, 'required motion consumption').equals(bytes)) fail('required motion consumption is corrupt');
    }
    assertStableDirectory(fs, location.consumptions, directory, 'motion consumption directory after committed validation');
  } finally {
    fs.close(directory.fd);
  }
}

function validateMotionConsumption(value: unknown): MotionConsumption {
  const record = object(value, 'motion consumption');
  exact(record, ['schema', 'projectRoot', 'buildSha256', 'briefSha256', 'collectorSha256', 'motionResultSha256', 'manifestSha256'], 'motion consumption');
  if (record.schema !== MOTION_CONSUMPTION_SCHEMA || typeof record.projectRoot !== 'string' || record.projectRoot === '') fail('motion consumption is invalid');
  return {
    schema: MOTION_CONSUMPTION_SCHEMA,
    projectRoot: record.projectRoot,
    buildSha256: digest(record.buildSha256, 'motion consumption buildSha256'),
    briefSha256: digest(record.briefSha256, 'motion consumption briefSha256'),
    collectorSha256: digest(record.collectorSha256, 'motion consumption collectorSha256'),
    motionResultSha256: digest(record.motionResultSha256, 'motion consumption motionResultSha256'),
    manifestSha256: digest(record.manifestSha256, 'motion consumption manifestSha256'),
  };
}
function assertMotionConsumptionsAvailable(root: string, fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>, consumptions: readonly MotionConsumption[]): void {
  if (new Set(consumptions.map((item) => item.collectorSha256)).size !== consumptions.length
    || new Set(consumptions.map((item) => item.motionResultSha256)).size !== consumptions.length) {
    fail('motion collector or result is duplicated within the publication');
  }
  ensureDirectory(fs, location.consumptions);
  const directory = openStableDirectory(fs, location.consumptions, 'motion consumption directory');
  try {
    for (const name of fs.readdir(location.consumptions)) {
      if (!RECORD.test(name)) fail('motion consumption directory contains an invalid record name');
      assertStableDirectory(fs, location.consumptions, directory, 'motion consumption directory during preflight');
      const recordBytes = readStableRegularFile(fs, resolve(location.consumptions, name), 'motion consumption record');
      if (name !== `sha256-${hash(recordBytes)}.json`) fail('motion consumption record is not immutable');
      const existing = validateMotionConsumption(parseJsonBytes(recordBytes, 'motion consumption record'));
      if (existing.projectRoot !== root) fail('motion consumption project root is invalid');
      if (consumptions.some((item) => existing.collectorSha256 === item.collectorSha256 || existing.motionResultSha256 === item.motionResultSha256)) {
        fail('motion collector or result has already been durably consumed');
      }
    }
    assertStableDirectory(fs, location.consumptions, directory, 'motion consumption directory after preflight');
  } finally {
    fs.close(directory.fd);
  }
}

function persistMotionConsumption(root: string, fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>, consumption: MotionConsumption): void {
  ensureDirectory(fs, location.consumptions);
  const directory = openStableDirectory(fs, location.consumptions, 'motion consumption directory');
  const bytes = `${canonical(consumption)}\n`;
  const record = resolve(location.consumptions, `sha256-${hash(bytes)}.json`);
  try {
    for (const name of fs.readdir(location.consumptions)) {
      if (!RECORD.test(name)) fail('motion consumption directory contains an invalid record name');
      assertStableDirectory(fs, location.consumptions, directory, 'motion consumption directory during traversal');
      const recordPath = resolve(location.consumptions, name);
      const recordBytes = readStableRegularFile(fs, recordPath, 'motion consumption record');
      if (name !== `sha256-${hash(recordBytes)}.json`) fail('motion consumption record is not immutable');
      const existing = validateMotionConsumption(parseJsonBytes(recordBytes, 'motion consumption record'));
      if (existing.projectRoot !== root) fail('motion consumption project root is invalid');
      if (existing.collectorSha256 === consumption.collectorSha256 || existing.motionResultSha256 === consumption.motionResultSha256) {
        if (recordPath === record && recordBytes.equals(Buffer.from(bytes))) return;
        fail('motion collector or result has already been durably consumed');
      }
    }
    assertStableDirectory(fs, location.consumptions, directory, 'motion consumption directory before write');
    const prepared = temporary(location.consumptions, 'final-evidence-v2-motion-consumption');
    try {
      fs.writeFile(prepared, bytes, { flag: 'wx', mode: 0o600 });
      syncFile(fs, prepared);
      assertStableDirectory(fs, location.consumptions, directory, 'motion consumption directory before commit');
      try { fs.link(prepared, record); } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        requireRealAncestors(root, record, fs, 'motion consumption record');
        if (!readStableRegularFile(fs, record, 'motion consumption record').equals(Buffer.from(bytes))) fail('motion consumption record collision');
        fail('motion collector or result has already been durably consumed');
      }
      cleanupTemp(fs, prepared);
      assertStableDirectory(fs, location.consumptions, directory, 'motion consumption directory after commit');
      syncDirectory(fs, location.consumptions);
    } finally {
      cleanupTemp(fs, prepared);
    }
  } finally {
    fs.close(directory.fd);
  }
}
type PublicationJournal = Readonly<{ schema: 'final-evidence-v2-publication-journal'; manifestSha256: string; pointer: FinalEvidenceV2Pointer }>;
function writePublicationJournal(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>, journal: PublicationJournal): void {
  if (fs.exists(location.publicationJournal)) fail('publication recovery is already in progress');
  const temp = temporary(location.omd, 'final-evidence-v2-publication-journal');
  try {
    fs.writeFile(temp, `${canonical(journal)}\n`, { flag: 'wx', mode: 0o600 });
    syncFile(fs, temp);
    fs.rename(temp, location.publicationJournal);
    syncDirectory(fs, location.omd);
  } finally {
    cleanupTemp(fs, temp);
  }
}
function readPublicationJournal(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>): PublicationJournal {
  const value = object(readJson(fs, location.publicationJournal, 'publication journal'), 'publication journal');
  exact(value, ['schema', 'manifestSha256', 'pointer'], 'publication journal');
  if (value.schema !== 'final-evidence-v2-publication-journal') fail('publication recovery is ambiguous');
  const pointer = pointerFrom(Buffer.from(`${canonical(value.pointer)}\n`));
  const manifestSha256 = digest(value.manifestSha256, 'publication journal manifest hash');
  if (pointer.record !== `sha256-${manifestSha256}.json` || pointer.sha256 !== manifestSha256) fail('publication recovery is ambiguous');
  return { schema: 'final-evidence-v2-publication-journal', manifestSha256, pointer };
}
function removePublicationJournal(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>): void {
  regular(fs, location.publicationJournal);
  fs.unlink(location.publicationJournal);
  syncDirectory(fs, location.omd);
}

/** Checks only the current pointer and its named immutable record. Orphan records are deliberately ignored. */
export function checkFinalEvidenceV2(rootInput: string, invocation?: ProjectRunInvocation): FinalEvidenceV2Manifest;
export function checkFinalEvidenceV2(rootInput: string, invocation?: ProjectRunInvocation) {
  if (arguments.length !== 2) fail('check does not accept caller-controlled seams');
  if (invocation === undefined) fail('a fresh host invocation is required to check final v2 evidence');
  const root = requireFinalEvidenceV2Authority(rootInput, invocation);
  const fs = filesystem();
  const location = paths(root);
  const committed = committedManifest(fs, location, invocation);
  return committed.manifest;
}

function requireCurrentGraphIdentity(root: string, fs: FinalEvidenceV2FileSystem, manifest: FinalEvidenceV2ManifestVariant, invocation: ProjectRunInvocation): void {
  const bindings = validateFinalEvidenceV2GraphFiles(root, manifest.graph, fs, invocation).bindings;
  if (bindings.branch !== 'adaptive-omission'
    && (bindings.activation.buildSha256 !== invocation.current.buildSha256
    || bindings.activation.loadedSkillSha256 !== invocation.current.loadedSkillSha256
    || bindings.activation.briefSha256 !== invocation.current.briefSha256)) {
    fail('graph activation, task, and source identities are not current');
  }
}
function lockPayload(operation: 'publication' | 'gc', manifestHash: string): string {
  return `${canonical({ schema: 'final-evidence-v2-lock', operation, hash: manifestHash, host: localHostname(), pid: process.pid, startedAt: Date.now() })}\n`;
}
type StableLock = Readonly<{ fd: number; dev: number; ino: number }>;
type StableDirectory = Readonly<{ fd: number; dev: number; ino: number }>;
function openStableDirectory(fs: FinalEvidenceV2FileSystem, path: string, label: string): StableDirectory {
  const entry = fs.lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) fail(`${label} is not a real non-symlink directory`);
  const fd = fs.open(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW, 0o600);
  try {
    const opened = fs.fstat(fd);
    const current = fs.lstat(path);
    if (!opened.isDirectory() || !current.isDirectory() || current.isSymbolicLink() || !sameFileIdentity(opened, current)) {
      fail(`${label} changed or is not a real non-symlink directory`);
    }
    if (opened.dev === undefined || opened.ino === undefined) fail(`${label} has no stable directory identity`);
    return { fd, dev: opened.dev, ino: opened.ino };
  } catch (error) {
    fs.close(fd);
    throw error;
  }
}
function assertStableDirectory(fs: FinalEvidenceV2FileSystem, path: string, directory: StableDirectory, label: string): void {
  const opened = fs.fstat(directory.fd);
  const current = fs.lstat(path);
  if (!opened.isDirectory() || !current.isDirectory() || current.isSymbolicLink()
    || opened.dev !== directory.dev || opened.ino !== directory.ino
    || current.dev !== directory.dev || current.ino !== directory.ino) {
    fail(`${label} changed or is not a real non-symlink directory`);
  }
}
function directoryExists(fs: FinalEvidenceV2FileSystem, path: string): boolean {
  try { fs.lstat(path); return true; } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
function writeFully(fs: FinalEvidenceV2FileSystem, fd: number, bytes: string): void {
  const content = Buffer.from(bytes, 'utf8');
  let offset = 0;
  while (offset < content.byteLength) {
    const written = fs.write(fd, content, offset, content.byteLength - offset);
    if (!Number.isSafeInteger(written) || written <= 0) fail('lock write made no progress');
    offset += written;
  }
}
function acquire(fs: FinalEvidenceV2FileSystem, path: string, bytes: string): StableLock {
  const directory = resolve(path, '..');
  const prepared = temporary(directory, 'final-evidence-v2-lock');
  let preparedFd: number | undefined;
  let lockFd: number | undefined;
  let claimed: { dev: number; ino: number } | undefined;
  const cleanClaim = (): void => {
    if (claimed === undefined) return;
    try {
      const entry = fs.lstat(path);
      if (entry.isFile() && !entry.isSymbolicLink() && entry.dev === claimed.dev && entry.ino === claimed.ino) fs.unlink(path);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  try {
    preparedFd = fs.open(prepared, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    writeFully(fs, preparedFd, bytes);
    fs.fsync(preparedFd);
    fs.close(preparedFd);
    preparedFd = undefined;
    fs.link(prepared, path);
    const entry = fs.lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.dev === undefined || entry.ino === undefined || (entry.nlink !== undefined && entry.nlink !== 2)) {
      fail('lock changed during acquisition');
    }
    claimed = { dev: entry.dev, ino: entry.ino };
    fs.unlink(prepared);
    syncDirectory(fs, directory);
    lockFd = fs.open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, 0o600);
    const opened = fs.fstat(lockFd);
    const current = fs.lstat(path);
    if (!opened.isFile() || current.isSymbolicLink() || !current.isFile() || opened.dev === undefined || opened.ino === undefined || current.dev !== opened.dev || current.ino !== opened.ino || (opened.nlink !== undefined && opened.nlink !== 1)) {
      fail('lock changed during acquisition');
    }
    claimed = undefined;
    return { fd: lockFd, dev: opened.dev, ino: opened.ino };
  } catch (error: unknown) {
    if (lockFd !== undefined) fs.close(lockFd);
    if (preparedFd !== undefined) fs.close(preparedFd);
    try { cleanClaim(); } finally { cleanupTemp(fs, prepared); }
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('publication is already in progress');
    throw error;
  }
}
function assertStableLock(fs: FinalEvidenceV2FileSystem, path: string, lock: StableLock, label: string): void {
  const opened = fs.fstat(lock.fd); const entry = fs.lstat(path);
  if (!opened.isFile() || entry.isSymbolicLink() || !entry.isFile() || opened.dev !== lock.dev || opened.ino !== lock.ino || entry.dev !== lock.dev || entry.ino !== lock.ino || (opened.nlink !== undefined && opened.nlink !== 1)) fail(`lock changed ${label}`);
}
function releaseLock(fs: FinalEvidenceV2FileSystem, path: string, lock: StableLock): void {
  assertStableLock(fs, path, lock, 'before release');
  fs.close(lock.fd);
  const entry = fs.lstat(path);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.dev !== lock.dev || entry.ino !== lock.ino) fail('lock changed during release');
  fs.unlink(path);
}
function cleanupTemp(fs: FinalEvidenceV2FileSystem, path: string): void {
  try { fs.unlink(path); } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
function lockOwnerAlive(pid: number, host: string): boolean | undefined {
  if (host !== localHostname()) return undefined;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (!(error instanceof Error)) return undefined;
    return 'code' in error && error.code === 'ESRCH' ? false : undefined;
  }
}
function claimStableDirectory(
  fs: FinalEvidenceV2FileSystem,
  path: string,
  claimed: string,
  directory: StableDirectory,
  label: string,
): void {
  if (directoryExists(fs, claimed)) fail(`${label} ownership claim has foreign residue`);
  assertStableDirectory(fs, path, directory, `${label} before ownership claim`);
  fs.rename(path, claimed);
  const stat = fs.lstat(claimed);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== directory.dev || stat.ino !== directory.ino) {
    fail(`${label} changed during ownership claim`);
  }
}

function restoreClaimedDirectory(fs: FinalEvidenceV2FileSystem, claimed: string, path: string, directory: StableDirectory, label: string): void {
  const stat = fs.lstat(claimed);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== directory.dev || stat.ino !== directory.ino || directoryExists(fs, path)) {
    fail(`${label} cannot be safely restored`);
  }
  fs.rename(claimed, path);
  assertStableDirectory(fs, path, directory, `${label} after restore`);
}
type GcClaimState = 'prepared' | 'claimed' | 'restoring' | 'restored';
type GcParentJournal = Readonly<{ path: string; claimed: string; dev: number; ino: number; state: GcClaimState }>;
type GcJournal = Readonly<{ schema: 'final-evidence-v2-gc-journal'; runs?: GcParentJournal; quarantine?: GcParentJournal }>;

function journalParent(value: unknown, label: string): GcParentJournal {
  const parent = object(value, label);
  exact(parent, ['path', 'claimed', 'dev', 'ino', 'state'], label);
  if (typeof parent.path !== 'string' || typeof parent.claimed !== 'string'
    || !Number.isSafeInteger(parent.dev) || !Number.isSafeInteger(parent.ino)
    || !['prepared', 'claimed', 'restoring', 'restored'].includes(parent.state as string)) {
    fail('GC journal is ambiguous');
  }
  return parent as GcParentJournal;
}

function readGcJournal(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>): GcJournal {
  regular(fs, location.gcJournal);
  const journal = object(readJson(fs, location.gcJournal, 'GC journal'), 'GC journal');
  const keys = Object.keys(journal).sort();
  if (canonical(keys) !== canonical(['quarantine', 'runs', 'schema'].filter(key => journal[key] !== undefined))) fail('GC journal is ambiguous');
  if (journal.schema !== 'final-evidence-v2-gc-journal') fail('GC journal is ambiguous');
  const result: { schema: 'final-evidence-v2-gc-journal'; runs?: GcParentJournal; quarantine?: GcParentJournal } = { schema: 'final-evidence-v2-gc-journal' };
  if (journal.runs !== undefined) result.runs = journalParent(journal.runs, 'GC runs journal');
  if (journal.quarantine !== undefined) result.quarantine = journalParent(journal.quarantine, 'GC quarantine journal');
  if (result.runs === undefined && result.quarantine === undefined) fail('GC journal is ambiguous');
  if ((result.runs !== undefined && (result.runs.path !== location.runs || result.runs.claimed !== location.gcRunsClaim))
    || (result.quarantine !== undefined && (result.quarantine.path !== location.quarantine || result.quarantine.claimed !== location.gcQuarantineClaim))) {
    fail('GC journal is ambiguous');
  }
  return result;
}

function writeGcJournal(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>, journal: GcJournal): void {
  if (fs.exists(location.gcJournal)) regular(fs, location.gcJournal);
  const temp = temporary(location.omd, 'final-evidence-v2-gc-journal');
  try {
    fs.writeFile(temp, `${canonical(journal)}\n`, { flag: 'wx', mode: 0o600 });
    syncFile(fs, temp);
    fs.rename(temp, location.gcJournal);
    syncDirectory(fs, location.omd);
  } catch (error) {
    cleanupTemp(fs, temp);
    throw error;
  }
}

function removeGcJournal(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>): void {
  regular(fs, location.gcJournal);
  fs.unlink(location.gcJournal);
  syncDirectory(fs, location.omd);
}

function gcJournalParent(path: string, claimed: string, directory: StableDirectory, state: GcClaimState): GcParentJournal {
  return { path, claimed, dev: directory.dev, ino: directory.ino, state };
}

function restoreJournalParent(fs: FinalEvidenceV2FileSystem, parent: GcParentJournal, label: string): void {
  const canonicalExists = directoryExists(fs, parent.path);
  const claimedExists = directoryExists(fs, parent.claimed);
  if (canonicalExists && claimedExists) fail(`${label} recovery is ambiguous`);
  if (!canonicalExists && !claimedExists) fail(`${label} recovery is ambiguous`);
  const observedPath = canonicalExists ? parent.path : parent.claimed;
  const entry = fs.lstat(observedPath);
  if (!entry.isDirectory() || entry.isSymbolicLink() || entry.dev !== parent.dev || entry.ino !== parent.ino) fail(`${label} recovery is ambiguous`);
  if (!canonicalExists) {
    fs.rename(parent.claimed, parent.path);
    const restored = fs.lstat(parent.path);
    if (!restored.isDirectory() || restored.isSymbolicLink() || restored.dev !== parent.dev || restored.ino !== parent.ino) fail(`${label} recovery is ambiguous`);
  }
}

function recoverGcJournal(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>): void {
  const journal = readGcJournal(fs, location);
  if (journal.quarantine !== undefined) restoreJournalParent(fs, journal.quarantine, 'GC quarantine parent');
  if (journal.runs !== undefined) restoreJournalParent(fs, journal.runs, 'GC runs parent');
  syncDirectory(fs, location.omd);
  removeGcJournal(fs, location);
}

/** Publishes an immutable content-addressed record; pointer rename is the only commit marker. */
export function publishFinalEvidenceV2(rootInput: string, input: unknown, invocation: ProjectRunInvocation): string {
  if (arguments.length !== 3) fail('publication does not accept caller-controlled seams');
  const submitted = validateFinalEvidenceV2ManifestVariant(input);
  if (submitted.graphRootHash !== undefined) fail('publisher computes graphRootHash from receipts');
  const fs = filesystem();
  const root = requireFinalEvidenceV2Authority(rootInput, invocation);
  // allow: SIZE_OK - the oversized legacy sole publisher retains only these calls so authority acquisition and atomic pointer commit remain one non-transferable boundary.
  const graphPreflight = { root, graph: submitted.graph, fs, invocation };
  const preflightGraph = preflightFinalEvidenceGraph(graphPreflight);
  checkCompletionPublicationPrerequisites(root, submitted, invocation);
  const releaseMutation = acquireProjectMutationLock(root, invocation, { nonReentrant: true });
  try {
  const graph = revalidateFinalEvidenceGraph(preflightGraph, graphPreflight);
  checkCompletionPublicationPrerequisites(root, submitted, invocation);
  const manifest: FinalEvidenceV2ManifestVariant = { ...submitted, graphRootHash: graph.rootHash };
  validateBackedManifest(root, fs, manifest, invocation);
  requireCurrentGraphIdentity(root, fs, manifest, invocation);
  const location = paths(root);
  ensureDirectory(fs, location.omd);
  const bytes = `${canonical(manifest)}\n`;
  requireFinalEvidenceManifestAuthorization(invocation, root, Buffer.from(bytes));
  const manifestHash = hash(bytes);
  let lockFd: StableLock | undefined;
  try {
    lockFd = acquire(fs, location.lock, lockPayload('publication', manifestHash)); assertStableLock(fs, location.lock, lockFd, 'before fsync'); fs.fsync(lockFd.fd); assertStableLock(fs, location.lock, lockFd, 'before directory sync'); syncDirectory(fs, location.omd); assertStableLock(fs, location.lock, lockFd, 'after directory sync');
    ensureDirectory(fs, location.runs);
    assertStableLock(fs, location.lock, lockFd, 'after runs directory creation');
    requireFinalEvidenceV2Authority(root, invocation);
    validateBackedManifest(root, fs, manifest, invocation);
    requireCurrentGraphIdentity(root, fs, manifest, invocation);
    checkCompletionPublicationPrerequisites(root, manifest, invocation);
    if (directoryExists(fs, location.pointer)) {
      const current = pointerFrom(readStableRegularFile(fs, location.pointer, 'final evidence pointer'));
      if (current.record === `sha256-${manifestHash}.json`) {
        committedManifest(fs, location, invocation);
        return location.pointer;
      }
    }

    const record = resolve(location.runs, `sha256-${manifestHash}.json`);
    const recordTemp = temporary(location.runs, 'final-evidence-v2-record');
    try {
      fs.writeFile(recordTemp, bytes, { flag: 'wx', mode: 0o600 });
      syncFile(fs, recordTemp);
      try { fs.link(recordTemp, record); } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        requireRealAncestors(root, record, fs, 'content-addressed record');
        if (!readStableRegularFile(fs, record, 'content-addressed record').equals(Buffer.from(bytes))) fail('content-addressed record collision');
      }
      cleanupTemp(fs, recordTemp); syncDirectory(fs, location.runs);
    } finally { cleanupTemp(fs, recordTemp); }
    // Re-parse the persisted immutable bytes immediately before the commit marker.
    const persisted = readStableRegularFile(fs, record, 'immutable record');
    if (!persisted.equals(Buffer.from(bytes)) || hash(persisted) !== manifestHash) fail('immutable record changed before commit');
    requireFinalEvidenceV2Authority(root, invocation);
    validateBackedManifest(root, fs, parseJsonBytes(persisted, 'persisted final evidence record'), invocation);
    requireCurrentGraphIdentity(root, fs, manifest, invocation);
    checkCompletionPublicationPrerequisites(root, manifest, invocation);

    const pointer: FinalEvidenceV2Pointer = { schema: FINAL_EVIDENCE_V2_POINTER_SCHEMA, record: `sha256-${manifestHash}.json`, sha256: manifestHash };
    const pointerTemp = temporary(location.omd, 'final-evidence-v2-pointer');
    try {
      fs.writeFile(pointerTemp, `${canonical(pointer)}\n`, { flag: 'wx', mode: 0o600 });
      syncFile(fs, pointerTemp);
      regular(fs, pointerTemp);
      if (!readStableRegularFile(fs, pointerTemp, 'pointer temporary').equals(Buffer.from(`${canonical(pointer)}\n`))) fail('pointer temporary changed before commit');
      const consumptions = requiredMotionConsumptions(root, fs, manifest, invocation, manifestHash);
      assertMotionConsumptionsAvailable(root, fs, location, consumptions);
      writePublicationJournal(fs, location, { schema: 'final-evidence-v2-publication-journal', manifestSha256: manifestHash, pointer });
      consumptions.forEach((consumption) => persistMotionConsumption(root, fs, location, consumption));
      validateBackedManifest(root, fs, parseJsonBytes(persisted, 'persisted final evidence record'), invocation, true);
      requireCurrentGraphIdentity(root, fs, manifest, invocation);
      checkCompletionPublicationPrerequisites(root, manifest, invocation);
      fs.rename(pointerTemp, location.pointer);
      syncDirectory(fs, location.omd);
      removePublicationJournal(fs, location);
    } finally { cleanupTemp(fs, pointerTemp); }
    return location.pointer;
  } finally {
    if (lockFd !== undefined) {
      if (fs.exists(location.publicationJournal)) {
        fs.close(lockFd.fd);
      } else {
        try { releaseLock(fs, location.lock, lockFd); syncDirectory(fs, location.omd); } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
  } finally {
    releaseMutation();
  }
}
function recoverPublicationJournal(root: string, fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>, manifestHash: string, invocation: ProjectRunInvocation): void {
  if (!fs.exists(location.publicationJournal)) fail('publication recovery is missing its transaction journal');
  const journal = readPublicationJournal(fs, location);
  if (journal.manifestSha256 !== manifestHash) fail('publication recovery does not match the intended transaction');
  const manifest = recordFor(root, fs, location.runs, journal.pointer, invocation);
  const consumptions = requiredMotionConsumptions(root, fs, manifest, invocation, manifestHash);
  consumptions.forEach((consumption) => persistMotionConsumption(root, fs, location, consumption));
  assertRequiredMotionConsumptions(root, fs, location, consumptions);
  if (fs.exists(location.pointer)) {
    const current = pointerFrom(readStableRegularFile(fs, location.pointer, 'final evidence pointer'));
    if (canonical(current) !== canonical(journal.pointer)) fail('publication recovery conflicts with the current pointer');
  } else {
    const temp = temporary(location.omd, 'final-evidence-v2-recovery-pointer');
    try {
      fs.writeFile(temp, `${canonical(journal.pointer)}\n`, { flag: 'wx', mode: 0o600 });
      syncFile(fs, temp);
      regular(fs, temp);
      if (!readStableRegularFile(fs, temp, 'publication recovery pointer').equals(Buffer.from(`${canonical(journal.pointer)}\n`))) fail('publication recovery pointer changed before commit');
      fs.rename(temp, location.pointer);
      syncDirectory(fs, location.omd);
    } finally {
      cleanupTemp(fs, temp);
    }
  }
  removePublicationJournal(fs, location);
}

/** Removes only an unambiguously stale lock. A live, malformed, or ambiguous lock fails closed. */
export function recoverFinalEvidenceV2Lock(rootInput: string, invocation: ProjectRunInvocation): boolean {
  if (arguments.length !== 2) fail('lock recovery does not accept caller-controlled seams');
  const fs = filesystem();
  const root = requireFinalEvidenceV2Authority(rootInput, invocation);
  const location = paths(root);
  const releaseMutation = acquireProjectMutationLock(root, invocation, { nonReentrant: true });
  let staleFd: number | undefined;
  try {
    ensureDirectory(fs, location.omd);
    if (!fs.exists(location.lock)) return false;
    staleFd = fs.open(location.lock, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, 0o600);
    const staleIdentity = fs.fstat(staleFd);
    const staleEntry = fs.lstat(location.lock);
    if (!staleIdentity.isFile() || staleEntry.isSymbolicLink() || !staleEntry.isFile() || staleIdentity.dev === undefined || staleIdentity.ino === undefined || staleEntry.dev !== staleIdentity.dev || staleEntry.ino !== staleIdentity.ino || (staleIdentity.nlink !== undefined && staleIdentity.nlink !== 1)) fail('lock recovery is ambiguous');
    const lock = object(parseJsonBytes(fs.readFile(staleFd), 'lock'), 'lock');
    exact(lock, ['schema', 'operation', 'hash', 'host', 'pid', 'startedAt'], 'lock');
    const lockOperation = lock.operation === 'publication' || lock.operation === 'gc' ? lock.operation : fail('lock recovery is ambiguous');
    const lockHash = typeof lock.hash === 'string' && SHA256.test(lock.hash) ? lock.hash : fail('lock recovery is ambiguous');
    const lockHost = typeof lock.host === 'string' && lock.host !== '' ? lock.host : fail('lock recovery is ambiguous');
    const lockPid = typeof lock.pid === 'number' && Number.isSafeInteger(lock.pid) && lock.pid > 0 ? lock.pid : fail('lock recovery is ambiguous');
    const lockStartedAt = typeof lock.startedAt === 'number' && Number.isSafeInteger(lock.startedAt) ? lock.startedAt : fail('lock recovery is ambiguous');
    if (lock.schema !== 'final-evidence-v2-lock') fail('lock recovery is ambiguous');
    if (Date.now() - lockStartedAt < FINAL_EVIDENCE_V2_LOCK_TTL_MS) fail('lock is not stale');
    if (lockOwnerAlive(lockPid, lockHost) !== false) fail('lock owner liveness is ambiguous');
    if (lockOperation === 'gc') {
      if (!fs.exists(location.gcJournal)
        && (directoryExists(fs, location.gcRunsClaim) || directoryExists(fs, location.gcQuarantineClaim))) {
        fail('GC recovery has foreign residue');
      }
      if (fs.exists(location.gcJournal)) recoverGcJournal(fs, location);
    }
    if (lockOperation === 'publication') {
      if (fs.exists(location.publicationJournal)) {
        recoverPublicationJournal(root, fs, location, lockHash, invocation);
      } else if (fs.exists(location.pointer)) {
        const current = pointerFrom(readStableRegularFile(fs, location.pointer, 'final evidence pointer'));
        if (current.sha256 === lockHash) committedManifest(fs, location, invocation);
      }
    }
    if (fs.exists(location.publicationJournal)) fail('publication recovery remains incomplete');
    const current = fs.lstat(location.lock); const opened = fs.fstat(staleFd);
    if (current.isSymbolicLink() || !current.isFile() || opened.dev !== staleIdentity.dev || opened.ino !== staleIdentity.ino || current.dev !== staleIdentity.dev || current.ino !== staleIdentity.ino || (opened.nlink !== undefined && opened.nlink !== 1)) fail('lock changed before recovery');
    fs.close(staleFd); staleFd = undefined;
    fs.unlink(location.lock); syncDirectory(fs, location.omd);
    return true;
  } finally {
    if (staleFd !== undefined) fs.close(staleFd);
    releaseMutation();
  }
}

/** Conservative two-stage orphan retention. Mutations serialize with publication and require an explicit non-dry-run call. */
export function garbageCollectFinalEvidenceV2(rootInput: string, invocation: ProjectRunInvocation, options: { dryRun?: boolean; now?: number } = {}): FinalEvidenceV2GcResult {
  if (arguments.length < 2 || arguments.length > 3 || Object.keys(options).some((key) => key !== 'dryRun' && key !== 'now')) fail('garbage collection does not accept caller-controlled seams');
  const fs = filesystem();
  const root = requireFinalEvidenceV2Authority(rootInput, invocation);
  const location = paths(root);
  const active = { ...location };
  const now = options.now ?? Date.now();
  const dryRun = options.dryRun !== false;
  const result: FinalEvidenceV2GcResult = { dryRun, quarantined: [], deleted: [] };
  const releaseMutation = dryRun ? undefined : acquireProjectMutationLock(root, invocation, { nonReentrant: true });
  try {
  let lockFd: StableLock | undefined;
  let runsDirectory: StableDirectory | undefined;
  let quarantineDirectory: StableDirectory | undefined;
  let journal: GcJournal | undefined;
  let cleanupComplete = false;
  try {
    if (fs.exists(location.pointer)) committedRecord(fs, location, invocation);
    if (!dryRun) {
      ensureDirectory(fs, location.omd);
      lockFd = acquire(fs, location.lock, lockPayload('gc', hash('gc')));
      assertStableLock(fs, location.lock, lockFd, 'before fsync');
      fs.fsync(lockFd.fd);
      assertStableLock(fs, location.lock, lockFd, 'before directory sync');
      syncDirectory(fs, location.omd);
      assertStableLock(fs, location.lock, lockFd, 'after directory sync');
      if (fs.exists(location.gcJournal) || directoryExists(fs, location.gcRunsClaim) || directoryExists(fs, location.gcQuarantineClaim)) {
        fail('GC ownership claim has foreign residue');
      }
    }
    if (directoryExists(fs, location.runs)) {
      runsDirectory = openStableDirectory(fs, location.runs, 'GC runs parent');
      if (!dryRun) {
        journal = { schema: 'final-evidence-v2-gc-journal', runs: gcJournalParent(location.runs, location.gcRunsClaim, runsDirectory, 'prepared') };
        writeGcJournal(fs, location, journal);
        claimStableDirectory(fs, location.runs, location.gcRunsClaim, runsDirectory, 'GC runs parent');
        syncDirectory(fs, location.omd);
        journal = { ...journal, runs: gcJournalParent(location.runs, location.gcRunsClaim, runsDirectory, 'claimed') };
        writeGcJournal(fs, location, journal);
        active.runs = location.gcRunsClaim;
      }
    }
    if (directoryExists(fs, location.quarantine)) {
      quarantineDirectory = openStableDirectory(fs, location.quarantine, 'GC quarantine parent');
      if (!dryRun) {
        journal = { ...(journal ?? { schema: 'final-evidence-v2-gc-journal' }), quarantine: gcJournalParent(location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'prepared') };
        writeGcJournal(fs, location, journal);
        claimStableDirectory(fs, location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'GC quarantine parent');
        syncDirectory(fs, location.omd);
        journal = { ...journal, quarantine: gcJournalParent(location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'claimed') };
        writeGcJournal(fs, location, journal);
        active.quarantine = location.gcQuarantineClaim;
      }
    }

    if (runsDirectory !== undefined) {
      assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent before committed-record traversal');
      const committed = fs.exists(location.pointer) ? committedRecord(fs, active, invocation) : undefined;
      assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent after committed-record traversal');
      const runNames = fs.readdir(active.runs);
      assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent after traversal');
      for (const name of runNames) {
        if (!RECORD.test(name) || name === committed) continue;
        assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent before record traversal');
        const path = resolve(active.runs, name);
        regular(fs, path);
        const source = fs.lstat(path);
        const bytes = readStableRegularFile(fs, path, 'GC run record');
        if (hash(bytes) !== RECORD.exec(name)?.[1] || now - source.mtimeMs < FINAL_EVIDENCE_V2_GC_TTL_MS) continue;
        result.quarantined.push(name);
        if (!dryRun) {
          if (quarantineDirectory === undefined) {
            ensureDirectory(fs, location.quarantine);
            quarantineDirectory = openStableDirectory(fs, location.quarantine, 'GC quarantine parent');
            journal = { ...(journal ?? { schema: 'final-evidence-v2-gc-journal' }), quarantine: gcJournalParent(location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'prepared') };
            writeGcJournal(fs, location, journal);
            claimStableDirectory(fs, location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'GC quarantine parent');
            syncDirectory(fs, location.omd);
            journal = { ...journal, quarantine: gcJournalParent(location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'claimed') };
            writeGcJournal(fs, location, journal);
            active.quarantine = location.gcQuarantineClaim;
          }
          assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent before move');
          assertStableDirectory(fs, active.quarantine, quarantineDirectory, 'GC quarantine parent before move');
          if (fs.exists(location.pointer) && committedRecord(fs, active, invocation) === name) {
            result.quarantined.pop();
            continue;
          }
          const quarantined = resolve(active.quarantine, name);
          fs.rename(path, quarantined);
          const moved = fs.lstat(quarantined);
          if (!moved.isFile() || moved.isSymbolicLink() || !sameFileIdentity(source, moved)) {
            fail('GC record changed during quarantine move');
          }
          assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent after rename');
          assertStableDirectory(fs, active.quarantine, quarantineDirectory, 'GC quarantine parent after rename');
          fs.utimes(quarantined, new Date(now), new Date(now));
          syncDirectory(fs, active.runs);
          syncDirectory(fs, active.quarantine);
        }
      }
    }

    if (quarantineDirectory !== undefined) {
      assertStableDirectory(fs, active.quarantine, quarantineDirectory, 'GC quarantine parent before traversal');
      const quarantineNames = fs.readdir(active.quarantine);
      assertStableDirectory(fs, active.quarantine, quarantineDirectory, 'GC quarantine parent after traversal');
      for (const name of quarantineNames) {
        if (!RECORD.test(name)) continue;
        assertStableDirectory(fs, active.quarantine, quarantineDirectory, 'GC quarantine parent before record traversal');
        const path = resolve(active.quarantine, name);
        regular(fs, path);
        const candidate = fs.lstat(path);
        if (now - candidate.mtimeMs < FINAL_EVIDENCE_V2_GC_TTL_MS) continue;
        result.deleted.push(name);
        if (!dryRun) {
          assertStableDirectory(fs, active.quarantine, quarantineDirectory, 'GC quarantine parent before delete');
          if (!sameFileIdentity(candidate, fs.lstat(path))) fail('GC quarantine record changed before deletion');
          fs.rm(path, { force: true });
          assertStableDirectory(fs, active.quarantine, quarantineDirectory, 'GC quarantine parent after delete');
          syncDirectory(fs, active.quarantine);
        }
      }
    }
    return result;
  } finally {
    try {
      if (journal?.quarantine !== undefined && quarantineDirectory !== undefined && directoryExists(fs, location.gcQuarantineClaim)) {
        journal = { ...journal, quarantine: gcJournalParent(location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'restoring') };
        writeGcJournal(fs, location, journal);
        restoreClaimedDirectory(fs, location.gcQuarantineClaim, location.quarantine, quarantineDirectory, 'GC quarantine parent');
        syncDirectory(fs, location.omd);
        journal = { ...journal, quarantine: gcJournalParent(location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'restored') };
        writeGcJournal(fs, location, journal);
      }
      if (journal?.runs !== undefined && runsDirectory !== undefined && directoryExists(fs, location.gcRunsClaim)) {
        journal = { ...journal, runs: gcJournalParent(location.runs, location.gcRunsClaim, runsDirectory, 'restoring') };
        writeGcJournal(fs, location, journal);
        restoreClaimedDirectory(fs, location.gcRunsClaim, location.runs, runsDirectory, 'GC runs parent');
        syncDirectory(fs, location.omd);
        journal = { ...journal, runs: gcJournalParent(location.runs, location.gcRunsClaim, runsDirectory, 'restored') };
        writeGcJournal(fs, location, journal);
      }
      if (journal !== undefined) removeGcJournal(fs, location);
      cleanupComplete = true;
    } finally {
      if (quarantineDirectory !== undefined) fs.close(quarantineDirectory.fd);
      if (runsDirectory !== undefined) fs.close(runsDirectory.fd);
      if (lockFd !== undefined) {
        if (cleanupComplete) {
          releaseLock(fs, location.lock, lockFd);
          syncDirectory(fs, location.omd);
        } else {
          fs.close(lockFd.fd);
        }
      }
    }
  }
  } finally {
    releaseMutation?.();
  }
}

export const finalizeFinalEvidenceV2 = publishFinalEvidenceV2;
export const checkFinalEvidenceV2Manifest = validateFinalEvidenceV2Manifest;
