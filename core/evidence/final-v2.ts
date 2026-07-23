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
  validateFinalEvidenceV2Graph,
  validateFinalEvidenceV2GraphFiles,
} from './final-v2-graph.ts';
import { validateArtDirectionPointer, validateArtDirectionRecord } from '../art-direction/schema.ts';
import { validateStaticDirectionEvidenceV1 } from '../art-direction/static-evidence.ts';
import { validateMotionEvidenceV2 } from '../render/index.ts';
import { SCROLL_SCENE_EVIDENCE_SCHEMA, validateScrollSceneEvidence } from '../render/scroll-scene-evidence.ts';
import { hasHostBoundLocalProjectWriteAuthority, requireHostPayloadAuthorization } from '../runtime/activation.ts';
import { requireFinalEvidenceManifestAuthorization, requireStaticEvidenceResultAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
export const FINAL_EVIDENCE_V2_SCHEMA = 'final-evidence-v2';
export const FINAL_EVIDENCE_V2_POINTER_SCHEMA = 'final-evidence-v2-pointer';
export const FINAL_EVIDENCE_V2_LOCK_TTL_MS = 15 * 60 * 1000;
export const FINAL_EVIDENCE_V2_GC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MotionDecision = 'none' | 'one';
export type FinalEvidenceV2FaultPoint =
  | 'lock-write' | 'lock-fsync' | 'lock-directory-sync'
  | 'record-temp-write' | 'record-temp-fsync' | 'record-rename' | 'runs-directory-sync'
  | 'revalidate' | 'pointer-temp-write' | 'pointer-temp-fsync' | 'pointer-rename'
  | 'pointer-directory-sync' | 'lock-unlink' | 'lock-directory-sync'
  | 'gc-runs-claim' | 'gc-quarantine-claim' | 'gc-runs-restore' | 'gc-quarantine-restore';

export type FinalEvidenceV2Bindings = FinalEvidenceV2Graph;
export type MotionEvidenceV2Binding = ArtifactReceipt & Readonly<{ schema: 'motion-evidence-v2' }>;
export type StaticDirectionEvidenceV1Binding = ArtifactReceipt & Readonly<{ schema: 'static-direction-evidence-v1' }>;
export type ScrollSceneEvidenceBinding = ArtifactReceipt & Readonly<{ schema: typeof SCROLL_SCENE_EVIDENCE_SCHEMA }>;
export interface FinalEvidenceV2Manifest {
  schema: typeof FINAL_EVIDENCE_V2_SCHEMA;
  motionDecision: MotionDecision;
  graph: FinalEvidenceV2Graph;
  graphRootHash?: string;
  motionEvidence?: MotionEvidenceV2Binding;
  staticEvidence?: StaticDirectionEvidenceV1Binding;
  // Optional showpiece escalation: a scroll-position-scrubbed journey that accompanies the one load scene.
  scrollSceneEvidence?: ScrollSceneEvidenceBinding;
}

export interface FinalEvidenceV2Pointer {
  schema: typeof FINAL_EVIDENCE_V2_POINTER_SCHEMA;
  record: string;
  sha256: string;
}

export interface FinalEvidenceV2FileSystem {
  mkdir(path: string, options: { recursive: true }): void;
  open(path: string, flags: string | number, mode: number): number;
  write(fd: number, bytes: string): void;
  writeFile(path: string, bytes: string, options: { flag: string; mode: number }): void;
  readFile(path: string | number): Buffer;
  rename(from: string, to: string): void;
  link(existingPath: string, newPath: string): void;
  unlink(path: string): void;
  rm(path: string, options: { force: true; recursive?: boolean }): void;
  utimes(path: string, atime: Date, mtime: Date): void;
  lstat(path: string): { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; mtimeMs: number; dev?: number; ino?: number; nlink?: number };
  fstat(fd: number): { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; dev?: number; ino?: number; nlink?: number };
  readdir(path: string): string[];
  fsync(fd: number): void;
  close(fd: number): void;
  exists(path: string): boolean;
}
export interface FinalEvidenceV2Seams {
  fs?: Partial<FinalEvidenceV2FileSystem>;
  fault?: (point: FinalEvidenceV2FaultPoint) => void;
  now?: () => number;
  pid?: () => number;
  hostname?: () => string;
  processAlive?: (pid: number, hostname: string) => boolean | undefined;
}

export interface FinalEvidenceV2GcResult {
  dryRun: boolean;
  quarantined: string[];
  deleted: string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const RECORD = /^sha256-([a-f0-9]{64})\.json$/;
const LOCK = '.final-evidence-v2.lock';
const RECOVERY_LOCK = '.final-evidence-v2-recovery.lock';

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
export function validateFinalEvidenceV2Manifest(value: unknown): FinalEvidenceV2Manifest {
  const manifest = object(value, 'manifest');
  exact(manifest, ['schema', 'motionDecision', 'graph', 'graphRootHash', 'motionEvidence', 'staticEvidence', 'scrollSceneEvidence'].filter((key) => key in manifest), 'manifest');
  if (manifest.schema !== FINAL_EVIDENCE_V2_SCHEMA) fail('unsupported manifest schema');
  if (manifest.motionDecision !== 'none' && manifest.motionDecision !== 'one') fail('motionDecision must be none or one');
  if (manifest.scrollSceneEvidence !== undefined && manifest.motionDecision !== 'one') fail('a scroll-scene sequence is a showpiece escalation that accompanies the one load scene');
  const graph = validateFinalEvidenceV2Graph(manifest.graph);
  if (manifest.graphRootHash !== undefined) digest(manifest.graphRootHash, 'graphRootHash');
  const receipt = (value: unknown, label: string, schema: string): ArtifactReceipt & { schema: typeof schema } => {
    const item = object(value, label);
    exact(item, ['path', 'schema', 'sha256'], label);
    if (item.schema !== schema || typeof item.path !== 'string' || typeof item.sha256 !== 'string') fail(`${label} is invalid`);
    digest(item.sha256, `${label}.sha256`);
    return { path: item.path, schema, sha256: item.sha256 };
  };
  if (manifest.motionDecision === 'one') {
    if (manifest.staticEvidence !== undefined || manifest.motionEvidence === undefined) fail('one requires exactly one motion evidence and no static evidence');
    return { schema: FINAL_EVIDENCE_V2_SCHEMA, motionDecision: 'one', graph, ...(manifest.graphRootHash === undefined ? {} : { graphRootHash: manifest.graphRootHash as string }), motionEvidence: receipt(manifest.motionEvidence, 'motionEvidence', 'motion-evidence-v2') as MotionEvidenceV2Binding, ...(manifest.scrollSceneEvidence === undefined ? {} : { scrollSceneEvidence: receipt(manifest.scrollSceneEvidence, 'scrollSceneEvidence', SCROLL_SCENE_EVIDENCE_SCHEMA) as ScrollSceneEvidenceBinding }) };
  }
  if (manifest.motionEvidence !== undefined || manifest.staticEvidence === undefined) fail('none requires exactly one static evidence and no motion evidence');
  return { schema: FINAL_EVIDENCE_V2_SCHEMA, motionDecision: 'none', graph, ...(manifest.graphRootHash === undefined ? {} : { graphRootHash: manifest.graphRootHash as string }), staticEvidence: receipt(manifest.staticEvidence, 'staticEvidence', 'static-direction-evidence-v1') as StaticDirectionEvidenceV1Binding };
}

function filesystem(seams: FinalEvidenceV2Seams): FinalEvidenceV2FileSystem {
  const defaults: FinalEvidenceV2FileSystem = {
    mkdir: mkdirSync, open: openSync, write: (fd, bytes) => { writeSync(fd, bytes); }, writeFile: writeFileSync, readFile: readFileSync, rename: renameSync, link: linkSync,
    unlink: unlinkSync, rm: rmSync, lstat: lstatSync, fstat: fstatSync, readdir: readdirSync, fsync: fsyncSync, close: closeSync, exists: existsSync, utimes: utimesSync,
  };
  return { ...defaults, ...seams.fs };
}
function invokeFault(seams: FinalEvidenceV2Seams, point: FinalEvidenceV2FaultPoint): void { seams.fault?.(point); }
function rootPath(rootInput: string): string { return resolve(rootInput); }
function requireFinalEvidenceV2Authority(rootInput: string, invocation: ProjectRunInvocation): string {
  if (!hasHostBoundLocalProjectWriteAuthority(invocation, rootInput)) {
    fail('a current host-issued project invocation bound to this project root is required');
  }
  return rootPath(rootInput);
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
function sameFileIdentity(left: { dev?: number; ino?: number }, right: { dev?: number; ino?: number }): boolean {
  return left.dev !== undefined && left.ino !== undefined && left.dev === right.dev && left.ino === right.ino;
}
function readStableRegularFile(fs: FinalEvidenceV2FileSystem, path: string, label: string): Buffer {
  regular(fs, path);
  const fd = fs.open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, 0o600);
  try {
    const opened = fs.fstat(fd);
    const entry = fs.lstat(path);
    if (!opened.isFile() || !entry.isFile() || entry.isSymbolicLink() || !sameFileIdentity(opened, entry)) fail(`${label} changed or is not a regular non-symlink file`);
    const bytes = fs.readFile(fd);
    const current = fs.lstat(path);
    if (!current.isFile() || current.isSymbolicLink() || !sameFileIdentity(opened, current)) fail(`${label} changed while it was read`);
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
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
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
function readJson(fs: FinalEvidenceV2FileSystem, path: string, label: string): unknown {
  regular(fs, path);
  try { return JSON.parse(fs.readFile(path).toString('utf8')) as unknown; } catch { fail(`${label} is not valid JSON`); }
}
function pointerFrom(fs: FinalEvidenceV2FileSystem, path: string): FinalEvidenceV2Pointer {
  const pointer = object(readJson(fs, path, 'pointer'), 'pointer');
  exact(pointer, ['schema', 'record', 'sha256'], 'pointer');
  if (pointer.schema !== FINAL_EVIDENCE_V2_POINTER_SCHEMA) fail('unsupported pointer schema');
  return { schema: FINAL_EVIDENCE_V2_POINTER_SCHEMA, record: fileName(pointer.record), sha256: digest(pointer.sha256, 'pointer.sha256') };
}
function paths(root: string): { omd: string; runs: string; pointer: string; lock: string; recovery: string; quarantine: string; gcJournal: string; gcRunsClaim: string; gcQuarantineClaim: string } {
  const omd = resolve(root, '.omd');
  return {
    omd, runs: resolve(omd, 'final-evidence-v2-runs'), pointer: resolve(omd, 'final-evidence-v2.json'),
    lock: resolve(omd, LOCK), recovery: resolve(omd, RECOVERY_LOCK), quarantine: resolve(omd, 'final-evidence-v2-quarantine'),
    gcJournal: resolve(omd, '.final-evidence-v2-gc.journal'),
    gcRunsClaim: resolve(omd, '.final-evidence-v2-gc-runs.claim'),
    gcQuarantineClaim: resolve(omd, '.final-evidence-v2-gc-quarantine.claim'),
  };
}
function validateBackedManifest(root: string, fs: FinalEvidenceV2FileSystem, value: unknown, invocation?: ProjectRunInvocation): FinalEvidenceV2Manifest {
  const manifest = validateFinalEvidenceV2Manifest(value);
  const graph = validateFinalEvidenceV2GraphFiles(root, manifest.graph, fs, invocation ?? fail('a fresh host invocation is required to validate final evidence'));
  if (manifest.graphRootHash !== graph.rootHash) fail('graph root hash changed');
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
  regular(fs, evidencePath);
  const evidenceBytes = fs.readFile(evidencePath);
  if (hash(evidenceBytes) !== evidence.sha256) fail('evidence branch hash changed');
  const evidenceObject = object(readJson(fs, evidencePath, 'evidence branch'), 'evidence branch');
  requireRealNestedProjectPaths(root, evidenceObject, fs, 'evidence branch');
  if ((evidenceObject.schema ?? evidenceObject.schemaVersion) !== evidence.schema) fail('evidence branch schema changed');
  if (evidenceObject.artDirectionHash !== graph.bindings.artDirectionSha256) fail('evidence branch provenance does not bind the selected semantic art direction');
  if (manifest.motionDecision === 'one') {
    const motion = validateMotionEvidenceV2(evidenceObject, {
      motionDecision: 'one',
      artDirectionHash: graph.bindings.artDirectionSha256,
      buildHash: graph.bindings.buildSha256,
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
    });
  }
  // A scroll journey is a showpiece-only escalation that must carry its own scroll-position-scrubbed
  // evidence, bound to the same immutable art direction as the load scene.
  if (manifest.scrollSceneEvidence !== undefined) {
    if (artDirection.decision.selectedRegister !== 'showpiece') fail('a scroll-scene sequence is a showpiece-only escalation');
    const scrollPath = resolve(root, manifest.scrollSceneEvidence.path);
    const scrollOutside = relative(root, scrollPath);
    if (scrollOutside === '' || scrollOutside.startsWith('..') || resolve(root, scrollOutside) !== scrollPath) fail('scroll-scene evidence escapes the project root');
    requireRealAncestors(root, scrollPath, fs, 'scroll-scene evidence');
    regular(fs, scrollPath);
    const scrollBytes = fs.readFile(scrollPath);
    if (hash(scrollBytes) !== manifest.scrollSceneEvidence.sha256) fail('scroll-scene evidence hash changed');
    const scrollObject = object(readJson(fs, scrollPath, 'scroll-scene evidence'), 'scroll-scene evidence');
    requireRealNestedProjectPaths(root, scrollObject, fs, 'scroll-scene evidence');
    if (scrollObject.schema !== manifest.scrollSceneEvidence.schema) fail('scroll-scene evidence schema changed');
    if (scrollObject.artDirectionHash !== graph.bindings.artDirectionSha256) fail('scroll-scene evidence does not bind the selected semantic art direction');
    validateScrollSceneEvidence(scrollObject);
  }
  return manifest;
}
function recordFor(root: string, fs: FinalEvidenceV2FileSystem, runDirectory: string, pointer: FinalEvidenceV2Pointer, invocation: ProjectRunInvocation): FinalEvidenceV2Manifest {
  const path = resolve(runDirectory, pointer.record);
  requireRealAncestors(root, path, fs, 'final evidence record');
  const bytes = readStableRegularFile(fs, path, 'final evidence record');
  if (hash(bytes) !== pointer.sha256 || pointer.record !== `sha256-${pointer.sha256}.json`) fail('pointer does not identify an intact immutable record');
  return validateBackedManifest(root, fs, JSON.parse(bytes.toString('utf8')) as unknown, invocation);
}
function committedRecord(fs: FinalEvidenceV2FileSystem, location: ReturnType<typeof paths>, invocation: ProjectRunInvocation): string | undefined {
  if (!fs.exists(location.pointer)) return undefined;
  const pointer = pointerFrom(fs, location.pointer);
  recordFor(location.omd === '' ? location.omd : resolve(location.omd, '..'), fs, location.runs, pointer, invocation);
  return pointer.record;
}

/** Checks only the current pointer and its named immutable record. Orphan records are deliberately ignored. */
export function checkFinalEvidenceV2(rootInput: string, invocation?: ProjectRunInvocation, seams: FinalEvidenceV2Seams = {}): FinalEvidenceV2Manifest {
  if (invocation === undefined) fail('a fresh host invocation is required to check final v2 evidence');
  const root = requireFinalEvidenceV2Authority(rootInput, invocation);
  const fs = filesystem(seams);
  const location = paths(root);
  requireRealAncestors(root, location.pointer, fs, 'final evidence pointer');
  const pointerBytes = readStableRegularFile(fs, location.pointer, 'final evidence pointer');
  requireHostPayloadAuthorization(invocation, root, 'final-reviewer-lane', pointerBytes);
  return recordFor(root, fs, location.runs, pointerFrom(fs, location.pointer), invocation);
}

function requireCurrentGraphIdentity(root: string, fs: FinalEvidenceV2FileSystem, manifest: FinalEvidenceV2Manifest, invocation: ProjectRunInvocation): void {
  const bindings = validateFinalEvidenceV2GraphFiles(root, manifest.graph, fs, invocation).bindings;
  if (bindings.activation.buildSha256 !== invocation.current.buildSha256
    || bindings.activation.loadedSkillSha256 !== invocation.current.loadedSkillSha256
    || bindings.activation.briefSha256 !== invocation.current.briefSha256) {
    fail('graph activation, task, and source identities are not current');
  }
}
function lockPayload(operation: 'publication' | 'gc', manifestHash: string, seams: FinalEvidenceV2Seams): string {
  return `${canonical({ schema: 'final-evidence-v2-lock', operation, hash: manifestHash, host: seams.hostname?.() ?? localHostname(), pid: seams.pid?.() ?? process.pid, startedAt: seams.now?.() ?? Date.now() })}\n`;
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
function acquire(fs: FinalEvidenceV2FileSystem, path: string, bytes: string): StableLock {
  try {
    const fd = fs.open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    try {
      const opened = fs.fstat(fd); const entry = fs.lstat(path);
      if (!opened.isFile() || entry.isSymbolicLink() || !entry.isFile() || opened.dev === undefined || opened.ino === undefined || entry.dev !== opened.dev || entry.ino !== opened.ino || (opened.nlink !== undefined && opened.nlink !== 1)) fail('lock changed during acquisition');
      fs.write(fd, bytes);
      return { fd, dev: opened.dev, ino: opened.ino };
    } catch (error) { fs.close(fd); throw error; }
  } catch (error: unknown) {
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
function lockOwnerAlive(pid: number, host: string, seams: FinalEvidenceV2Seams): boolean | undefined {
  const observed = seams.processAlive?.(pid, host);
  if (observed !== undefined) return observed;
  if (host !== (seams.hostname?.() ?? localHostname())) return undefined;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? false : undefined;
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
  if (!stat.isDirectory() || stat.isSymbolicLink() || !sameFileIdentity(stat, directory)) {
    fail(`${label} changed during ownership claim`);
  }
}

function restoreClaimedDirectory(fs: FinalEvidenceV2FileSystem, claimed: string, path: string, directory: StableDirectory, label: string): void {
  const stat = fs.lstat(claimed);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !sameFileIdentity(stat, directory) || directoryExists(fs, path)) {
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
export function publishFinalEvidenceV2(rootInput: string, input: unknown, invocation: ProjectRunInvocation, seams: FinalEvidenceV2Seams = {}): string {
  const submitted = validateFinalEvidenceV2Manifest(input);
  if (submitted.graphRootHash !== undefined) fail('publisher computes graphRootHash from receipts');
  const fs = filesystem(seams);
  const root = requireFinalEvidenceV2Authority(rootInput, invocation);
  const graph = validateFinalEvidenceV2GraphFiles(root, submitted.graph, fs, invocation);
  const manifest: FinalEvidenceV2Manifest = { ...submitted, graphRootHash: graph.rootHash };
  validateBackedManifest(root, fs, manifest, invocation);
  requireCurrentGraphIdentity(root, fs, manifest, invocation);
  const location = paths(root);
  ensureDirectory(fs, location.omd);
  const bytes = `${canonical(manifest)}\n`;
  requireFinalEvidenceManifestAuthorization(invocation, root, Buffer.from(bytes));
  const manifestHash = hash(bytes);
  let lockFd: StableLock | undefined;
  try {
    lockFd = acquire(fs, location.lock, lockPayload('publication', manifestHash, seams));
    invokeFault(seams, 'lock-write'); assertStableLock(fs, location.lock, lockFd, 'before fsync'); fs.fsync(lockFd.fd); invokeFault(seams, 'lock-fsync'); assertStableLock(fs, location.lock, lockFd, 'before directory sync'); syncDirectory(fs, location.omd); invokeFault(seams, 'lock-directory-sync'); assertStableLock(fs, location.lock, lockFd, 'after directory sync');
    ensureDirectory(fs, location.runs);
    assertStableLock(fs, location.lock, lockFd, 'after runs directory creation');
    requireFinalEvidenceV2Authority(rootInput, invocation);
    validateBackedManifest(root, fs, manifest, invocation);
    requireCurrentGraphIdentity(root, fs, manifest, invocation);

    const record = resolve(location.runs, `sha256-${manifestHash}.json`);
    const recordTemp = temporary(location.runs, 'final-evidence-v2-record');
    try {
      fs.writeFile(recordTemp, bytes, { flag: 'wx', mode: 0o600 }); invokeFault(seams, 'record-temp-write');
      syncFile(fs, recordTemp); invokeFault(seams, 'record-temp-fsync');
      try { fs.link(recordTemp, record); } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        requireRealAncestors(root, record, fs, 'content-addressed record');
        if (!readStableRegularFile(fs, record, 'content-addressed record').equals(Buffer.from(bytes))) fail('content-addressed record collision');
      }
      cleanupTemp(fs, recordTemp);
      invokeFault(seams, 'record-rename'); syncDirectory(fs, location.runs); invokeFault(seams, 'runs-directory-sync');
    } finally { cleanupTemp(fs, recordTemp); }

    invokeFault(seams, 'revalidate');
    // Re-parse the persisted immutable bytes immediately before the commit marker.
    const persisted = readStableRegularFile(fs, record, 'immutable record');
    if (!persisted.equals(Buffer.from(bytes)) || hash(persisted) !== manifestHash) fail('immutable record changed before commit');
    requireFinalEvidenceV2Authority(rootInput, invocation);
    validateBackedManifest(root, fs, JSON.parse(persisted.toString('utf8')) as unknown, invocation);
    requireCurrentGraphIdentity(root, fs, manifest, invocation);

    const pointer: FinalEvidenceV2Pointer = { schema: FINAL_EVIDENCE_V2_POINTER_SCHEMA, record: `sha256-${manifestHash}.json`, sha256: manifestHash };
    const pointerTemp = temporary(location.omd, 'final-evidence-v2-pointer');
    try {
      fs.writeFile(pointerTemp, `${canonical(pointer)}\n`, { flag: 'wx', mode: 0o600 }); invokeFault(seams, 'pointer-temp-write');
      syncFile(fs, pointerTemp); invokeFault(seams, 'pointer-temp-fsync');
      regular(fs, pointerTemp);
      if (!fs.readFile(pointerTemp).equals(Buffer.from(`${canonical(pointer)}\n`))) fail('pointer temporary changed before commit');
      validateBackedManifest(root, fs, JSON.parse(persisted.toString('utf8')) as unknown, invocation);
      requireCurrentGraphIdentity(root, fs, manifest, invocation);
      fs.rename(pointerTemp, location.pointer); invokeFault(seams, 'pointer-rename');
      syncDirectory(fs, location.omd); invokeFault(seams, 'pointer-directory-sync');
    } finally { cleanupTemp(fs, pointerTemp); }
    return location.pointer;
  } finally {
    if (lockFd !== undefined) {
      try { releaseLock(fs, location.lock, lockFd); invokeFault(seams, 'lock-unlink'); syncDirectory(fs, location.omd); invokeFault(seams, 'lock-directory-sync'); } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}

/** Removes only an unambiguously stale lock. A live, malformed, or ambiguous lock fails closed. */
export function recoverFinalEvidenceV2Lock(rootInput: string, invocation: ProjectRunInvocation, seams: FinalEvidenceV2Seams = {}): boolean {
  const fs = filesystem(seams);
  const location = paths(requireFinalEvidenceV2Authority(rootInput, invocation));
  if (!fs.exists(location.lock)) return false;
  ensureDirectory(fs, location.omd);
  let recoveryFd: StableLock | undefined;
  let staleFd: number | undefined;
  try {
    recoveryFd = acquire(fs, location.recovery, lockPayload('publication', 'recovery', seams));
    staleFd = fs.open(location.lock, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, 0o600);
    const staleIdentity = fs.fstat(staleFd);
    const staleEntry = fs.lstat(location.lock);
    if (!staleIdentity.isFile() || staleEntry.isSymbolicLink() || !staleEntry.isFile() || staleIdentity.dev === undefined || staleIdentity.ino === undefined || staleEntry.dev !== staleIdentity.dev || staleEntry.ino !== staleIdentity.ino || (staleIdentity.nlink !== undefined && staleIdentity.nlink !== 1)) fail('lock recovery is ambiguous');
    const lock = object(readJson(fs, location.lock, 'lock'), 'lock');
    exact(lock, ['schema', 'operation', 'hash', 'host', 'pid', 'startedAt'], 'lock');
    const lockOperation = lock.operation === 'publication' || lock.operation === 'gc' ? lock.operation : fail('lock recovery is ambiguous');
    const lockHash = typeof lock.hash === 'string' && SHA256.test(lock.hash) ? lock.hash : fail('lock recovery is ambiguous');
    const lockHost = typeof lock.host === 'string' && lock.host !== '' ? lock.host : fail('lock recovery is ambiguous');
    const lockPid = typeof lock.pid === 'number' && Number.isSafeInteger(lock.pid) && lock.pid > 0 ? lock.pid : fail('lock recovery is ambiguous');
    const lockStartedAt = typeof lock.startedAt === 'number' && Number.isSafeInteger(lock.startedAt) ? lock.startedAt : fail('lock recovery is ambiguous');
    if (lock.schema !== 'final-evidence-v2-lock') fail('lock recovery is ambiguous');
    if ((seams.now?.() ?? Date.now()) - lockStartedAt < FINAL_EVIDENCE_V2_LOCK_TTL_MS) fail('lock is not stale');
    if (lockOwnerAlive(lockPid, lockHost, seams) !== false) fail('lock owner liveness is ambiguous');
    if (lockOperation === 'gc') {
      if (!fs.exists(location.gcJournal)
        && (directoryExists(fs, location.gcRunsClaim) || directoryExists(fs, location.gcQuarantineClaim))) {
        fail('GC recovery has foreign residue');
      }
      if (fs.exists(location.gcJournal)) recoverGcJournal(fs, location);
    }
    if (fs.exists(location.pointer)) recordFor(rootPath(rootInput), fs, location.runs, pointerFrom(fs, location.pointer), invocation);
    if (lockOperation === 'publication' && fs.exists(resolve(location.runs, `sha256-${lockHash}.json`))) {
      recordFor(rootPath(rootInput), fs, location.runs, { schema: FINAL_EVIDENCE_V2_POINTER_SCHEMA, record: `sha256-${lockHash}.json`, sha256: lockHash }, invocation);
    }
    const current = fs.lstat(location.lock); const opened = fs.fstat(staleFd);
    if (current.isSymbolicLink() || !current.isFile() || opened.dev !== staleIdentity.dev || opened.ino !== staleIdentity.ino || current.dev !== staleIdentity.dev || current.ino !== staleIdentity.ino || (opened.nlink !== undefined && opened.nlink !== 1)) fail('lock changed before recovery');
    fs.close(staleFd); staleFd = undefined;
    fs.unlink(location.lock); syncDirectory(fs, location.omd);
    return true;
  } finally {
    if (staleFd !== undefined) fs.close(staleFd);
    if (recoveryFd !== undefined) { releaseLock(fs, location.recovery, recoveryFd); syncDirectory(fs, location.omd); }
  }
}

/** Conservative two-stage orphan retention. Mutations serialize with publication and require an explicit non-dry-run call. */
export function garbageCollectFinalEvidenceV2(rootInput: string, invocation: ProjectRunInvocation, options: { dryRun?: boolean; now?: number; seams?: FinalEvidenceV2Seams } = {}): FinalEvidenceV2GcResult {
  const seams = options.seams ?? {};
  const fs = filesystem(seams);
  const location = paths(options.dryRun === false ? requireFinalEvidenceV2Authority(rootInput, invocation) : rootPath(rootInput));
  const active = { ...location };
  const now = options.now ?? seams.now?.() ?? Date.now();
  const dryRun = options.dryRun !== false;
  const result: FinalEvidenceV2GcResult = { dryRun, quarantined: [], deleted: [] };
  let lockFd: StableLock | undefined;
  let runsDirectory: StableDirectory | undefined;
  let quarantineDirectory: StableDirectory | undefined;
  let journal: GcJournal | undefined;
  try {
    if (!dryRun) {
      ensureDirectory(fs, location.omd);
      lockFd = acquire(fs, location.lock, lockPayload('gc', hash('gc'), seams));
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
        invokeFault(seams, 'gc-runs-claim');
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
        invokeFault(seams, 'gc-quarantine-claim');
      }
    }

    if (runsDirectory !== undefined) {
      assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent before committed-record traversal');
      const committed = committedRecord(fs, active, invocation);
      assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent after committed-record traversal');
      const runNames = fs.readdir(active.runs);
      assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent after traversal');
      for (const name of runNames) {
        if (!RECORD.test(name) || name === committed) continue;
        assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent before record traversal');
        const path = resolve(active.runs, name);
        regular(fs, path);
        const source = fs.lstat(path);
        const bytes = fs.readFile(path);
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
            invokeFault(seams, 'gc-quarantine-claim');
          }
          assertStableDirectory(fs, active.runs, runsDirectory, 'GC runs parent before move');
          assertStableDirectory(fs, active.quarantine, quarantineDirectory, 'GC quarantine parent before move');
          if (committedRecord(fs, active, invocation) === name) {
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
      if (journal?.quarantine !== undefined && quarantineDirectory !== undefined) {
        journal = { ...journal, quarantine: gcJournalParent(location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'restoring') };
        writeGcJournal(fs, location, journal);
        invokeFault(seams, 'gc-quarantine-restore');
        restoreClaimedDirectory(fs, location.gcQuarantineClaim, location.quarantine, quarantineDirectory, 'GC quarantine parent');
        syncDirectory(fs, location.omd);
        journal = { ...journal, quarantine: gcJournalParent(location.quarantine, location.gcQuarantineClaim, quarantineDirectory, 'restored') };
        writeGcJournal(fs, location, journal);
      }
      if (journal?.runs !== undefined && runsDirectory !== undefined) {
        journal = { ...journal, runs: gcJournalParent(location.runs, location.gcRunsClaim, runsDirectory, 'restoring') };
        writeGcJournal(fs, location, journal);
        invokeFault(seams, 'gc-runs-restore');
        restoreClaimedDirectory(fs, location.gcRunsClaim, location.runs, runsDirectory, 'GC runs parent');
        syncDirectory(fs, location.omd);
        journal = { ...journal, runs: gcJournalParent(location.runs, location.gcRunsClaim, runsDirectory, 'restored') };
        writeGcJournal(fs, location, journal);
      }
      if (journal !== undefined) removeGcJournal(fs, location);
    } finally {
      if (quarantineDirectory !== undefined) fs.close(quarantineDirectory.fd);
      if (runsDirectory !== undefined) fs.close(runsDirectory.fd);
      if (lockFd !== undefined) {
        try { releaseLock(fs, location.lock, lockFd); syncDirectory(fs, location.omd); } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
}

export const finalizeFinalEvidenceV2 = publishFinalEvidenceV2;
export const checkFinalEvidenceV2Manifest = validateFinalEvidenceV2Manifest;
