import { chmodSync, constants as fsConstants, closeSync, fstatSync, fsyncSync, ftruncateSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { ProjectRunInvocation } from './invocation.ts';
import { requireProjectWriteInvocation } from './invocation.ts';
import {
  hasHostBoundLocalProjectWriteAuthority,
  hostBoundLocalProjectRoot,
} from './activation.ts';

export type ProjectWriteRequest = {
  readonly projectRoot: string;
  readonly relativePath: string;
  readonly content: string | Uint8Array;
  readonly invocation: ProjectRunInvocation;
  readonly mode?: number;
};
export type ProjectLockRequest = {
  readonly projectRoot: string;
  readonly relativePath: string;
  readonly invocation: ProjectRunInvocation;
};
export type ProjectWriteAdapter = {
  readonly projectRoot: string;
  mkdir(relativePath: string): string;
  write(relativePath: string, content: string | Uint8Array): string;
  writeContentAddressed(relativePath: string, content: string | Uint8Array): string;
  remove(relativePath: string): string;
};

/**
 * Security boundary for guarded project mutation.
 *
 * OMD authenticates the host invocation, confines paths to a real project root, rejects static
 * symlink ancestors/leaves, and serializes cooperating OMD publishers. A same-UID process that can
 * rename project ancestors concurrently between operating-system calls already owns the project
 * files and is outside this in-process library boundary; containment from that actor requires an
 * OS sandbox or descriptor-relative beneath API that Node does not expose portably.
 */
export type ExternalObservationKind = 'render' | 'capture' | 'probe-cache';

export type ExternalObservationFileRequest = {
  readonly projectRoot: string;
  readonly absolutePath: string;
  readonly content: string | Uint8Array;
  readonly invocation: ProjectRunInvocation;
  readonly kind: ExternalObservationKind;
};

export type ExternalObservationDirectoryRequest = Omit<ExternalObservationFileRequest, 'content'>;
export type ExternalPrivateMirrorRequest = {
  readonly projectRoot: string;
  readonly invocation: ProjectRunInvocation;
  readonly parent: string;
  readonly files: readonly Readonly<{
    relativePath: string;
    content: string | Uint8Array;
    mode: number;
  }>[];
};
const trustedAdapters = new WeakSet<ProjectWriteAdapter>();
const trustedAdapterMetadata = new WeakMap<ProjectWriteAdapter, Readonly<{
  projectRoot: string;
  mkdir: ProjectWriteAdapter['mkdir'];
  write: ProjectWriteAdapter['write'];
  writeContentAddressed: ProjectWriteAdapter['writeContentAddressed'];
  remove: ProjectWriteAdapter['remove'];
  invocation: ProjectRunInvocation;
}>>();
const PROJECT_MUTATION_LOCK = '.omd/.project-mutation.lock';
type ActiveMutationLock = { readonly invocation: ProjectRunInvocation; readonly nonReentrant: boolean; depth: number; readonly releaseFileLock: () => void };
const activeMutationLocks = new Map<string, ActiveMutationLock>();

export class ProjectWriteError extends Error {
  override readonly name = 'ProjectWriteError';

  readonly reason: string;

  constructor(reason: string) {
    super(`guarded project write rejected: ${reason}`);
    this.reason = reason;
  }
}
function canonicalProjectRoot(projectRoot: string): string {
  if (typeof projectRoot !== 'string' || !projectRoot || projectRoot.includes('\0')) {
    throw new ProjectWriteError('project root must be an existing real directory');
  }
  try {
    const canonicalRoot = realpathSync(resolve(projectRoot));
    const metadata = lstatSync(canonicalRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new ProjectWriteError('project root must be an existing real directory');
    }
    return canonicalRoot;
  } catch (error) {
    if (error instanceof ProjectWriteError) throw error;
    throw new ProjectWriteError('project root must be an existing real directory');
  }
}
function requireRegularProjectLock(pathname: string): void {
  const metadata = lstatSync(pathname);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new ProjectWriteError('project lock must be a regular non-symlink file');
  }
}
function requireRegularProjectLeafOrMissing(pathname: string, label: string): void {
  try {
    const metadata = lstatSync(pathname);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new ProjectWriteError(`${label} must be a regular non-symlink file`);
    }
  } catch (error) {
    if (error instanceof ProjectWriteError) throw error;
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') throw error;
  }
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function openStableRegularProjectFile(pathname: string, flags: number, mode = 0o600): number {
  const descriptor = openSync(pathname, flags | fsConstants.O_NOFOLLOW, mode);
  try {
    const opened = fstatSync(descriptor);
    const entry = lstatSync(pathname);
    if (!opened.isFile() || entry.isSymbolicLink() || !entry.isFile() || !sameFileIdentity(opened, entry)) {
      throw new ProjectWriteError('project write target changed or is not a regular non-symlink file');
    }
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function writeFully(descriptor: number, content: string | Uint8Array): void {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset, null);
    if (!Number.isSafeInteger(written) || written <= 0) {
      throw new ProjectWriteError('project write made no progress');
    }
    offset += written;
  }
}
function writeStableProjectFile(target: string, content: string | Uint8Array, immutable: boolean): void {
  requireRegularProjectLeafOrMissing(target, 'project write target');
  const flags = immutable
    ? fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
    : fsConstants.O_WRONLY | fsConstants.O_CREAT;
  let descriptor: number | undefined;
  try {
    descriptor = openStableRegularProjectFile(target, flags);
    if (!immutable) ftruncateSync(descriptor, 0);
    writeFully(descriptor, content);
    fsyncSync(descriptor);
    const opened = fstatSync(descriptor);
    const entry = lstatSync(target);
    if (!sameFileIdentity(opened, entry) || entry.isSymbolicLink()) {
      throw new ProjectWriteError('project write target changed during write');
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncDirectory(directory: string): void {
  const descriptor = openSync(directory, fsConstants.O_RDONLY);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isDirectory()) throw new ProjectWriteError('project write directory changed before durability sync');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function ensureProjectDirectoryDurably(projectRoot: string, directory: string): void {
  const root = canonicalProjectRoot(projectRoot);
  const target = resolve(directory);
  if (target !== root && !isWithinProjectRoot(root, target)) {
    throw new ProjectWriteError('project directory escapes the project root');
  }
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new ProjectWriteError('project directory target must be a real directory, not a symlink');
      }
      break;
    } catch (error) {
      if (error instanceof ProjectWriteError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (current === root) throw new ProjectWriteError('project root does not exist');
      missing.push(current);
      current = dirname(current);
    }
  }
  for (const path of missing.reverse()) {
    mkdirSync(path);
    fsyncDirectory(dirname(path));
  }
}

function requireGuardedProjectWrite(
  projectRoot: string,
  invocation: ProjectRunInvocation,
): void {
  try {
    requireProjectWriteInvocation(invocation);
    if (!hasHostBoundLocalProjectWriteAuthority(invocation, projectRoot)) {
      throw new ProjectWriteError('project-write authority must be issued by the host and bound to this project root');
    }
  } catch (error) {
    if (error instanceof ProjectWriteError) throw error;
    const reason = error instanceof Error ? error.message : 'missing project-write invocation';
    throw new ProjectWriteError(reason);
  }
}

function resolveProjectPath(projectRoot: string, relativePath: string): string {
  if (!projectRoot || !relativePath || relativePath.includes('\0')) {
    throw new ProjectWriteError('projectRoot and a non-empty relativePath are required');
  }
  const root = canonicalProjectRoot(projectRoot);
  const target = resolve(root, relativePath);
  const pathFromRoot = relative(root, target);
  if (pathFromRoot === '' || pathFromRoot === '..' || pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || pathFromRoot.startsWith('/')) {
    throw new ProjectWriteError('relativePath must stay inside the project root');
  }
  return target;
}

function requireRealProjectAncestors(projectRoot: string, target: string): void {
  const root = canonicalProjectRoot(projectRoot);
  let current = dirname(target);
  for (;;) {
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new ProjectWriteError('project write ancestor must be a real directory, not a symlink');
      }
    } catch (error) {
      if (error instanceof ProjectWriteError) throw error;
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') throw error;
    }
    if (current === root) return;
    const parent = dirname(current);
    if (parent === current || !isWithinProjectRoot(root, parent)) {
      throw new ProjectWriteError('project write ancestor escapes the project root');
    }
    current = parent;
  }
}
function isWithinProjectRoot(projectRoot: string, target: string): boolean {
  const pathFromRoot = relative(canonicalProjectRoot(projectRoot), target);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function resolveExternalObservationPath(
  projectRoot: string,
  invocation: ProjectRunInvocation,
  absolutePath: string,
  kind: ExternalObservationKind,
  directory: boolean,
): string {
  if (!Object.hasOwn({ render: true, capture: true, 'probe-cache': true }, kind)) {
    throw new ProjectWriteError('external observations must be render, capture, or probe-cache output');
  }
  if (!absolutePath || absolutePath.includes('\0') || !isAbsolute(absolutePath)) {
    throw new ProjectWriteError('external observation output must be an absolute path');
  }
  if (absolutePath.split(/[\\/]+/).includes('..')) {
    throw new ProjectWriteError('external observation output must not contain traversal segments');
  }
  const boundProjectRoot = hostBoundLocalProjectRoot(invocation);
  if (!boundProjectRoot || boundProjectRoot !== canonicalProjectRoot(projectRoot)) {
    throw new ProjectWriteError('external observation requires local authority bound to the project root');
  }
  const outputRoot = resolve(boundProjectRoot, '..', '.omd-observations');
  const kindRoot = join(outputRoot, kind);
  const target = resolve(absolutePath);
  if (isWithinProjectRoot(projectRoot, target)) {
    throw new ProjectWriteError('external observation output must stay outside the project root');
  }
  if (directory ? target !== kindRoot : dirname(target) !== kindRoot || target === kindRoot) {
    throw new ProjectWriteError('external observation must use its invocation-bound named output root');
  }
  return target;
}

function ensureUnambiguousExternalDirectory(directory: string): void {
  const missing: string[] = [];
  let current = directory;
  for (;;) {
    try {
      const metadata = lstatSync(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new ProjectWriteError('external observation parent must be a real directory, not a symlink');
      }
      break;
    } catch (error) {
      if (error instanceof ProjectWriteError) throw error;
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) throw new ProjectWriteError('external observation parent does not exist');
      missing.push(current);
      current = parent;
    }
  }
  for (const path of missing.reverse()) mkdirSync(path);
}

/**
 * The sole external observation exception creates render, capture, or probe-cache
 * artifacts at the local invocation's named output root.
 */
export function writeExternalObservationFile(request: ExternalObservationFileRequest): string {
  return withProjectMutationLock(request.projectRoot, request.invocation, () => {
    requireGuardedProjectWrite(request.projectRoot, request.invocation);
    const target = resolveExternalObservationPath(request.projectRoot, request.invocation, request.absolutePath, request.kind, false);
    ensureUnambiguousExternalDirectory(dirname(target));
    try {
      writeStableProjectFile(target, request.content, true);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EEXIST') {
        throw new ProjectWriteError('external observation artifacts are immutable and cannot overwrite an existing file');
      }
      throw error;
    }
    return target;
  });
}

export function createExternalObservationDirectory(request: ExternalObservationDirectoryRequest): string {
  return withProjectMutationLock(request.projectRoot, request.invocation, () => {
    requireGuardedProjectWrite(request.projectRoot, request.invocation);
    const target = resolveExternalObservationPath(request.projectRoot, request.invocation, request.absolutePath, request.kind, true);
    ensureUnambiguousExternalDirectory(target);
    return target;
  });
}

export function createExternalPrivateMirror(request: ExternalPrivateMirrorRequest): string {
  return withProjectMutationLock(request.projectRoot, request.invocation, () => {
    requireGuardedProjectWrite(request.projectRoot, request.invocation);
    const projectRoot = canonicalProjectRoot(request.projectRoot);
    if (!isAbsolute(request.parent) || request.parent.includes('\0')) {
      throw new ProjectWriteError('private mirror parent must be an absolute path');
    }
    const parent = realpathSync(request.parent);
    const parentMetadata = lstatSync(parent);
    if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() || isWithinProjectRoot(projectRoot, parent)) {
      throw new ProjectWriteError('private mirror parent must be a real external directory');
    }
    if (request.files.length === 0) throw new ProjectWriteError('private mirror requires at least one file');
    const mirrorRoot = mkdtempSync(join(parent, 'omd-hand-repair-'));
    try {
      chmodSync(mirrorRoot, 0o700);
      for (const file of request.files) {
        const target = resolveProjectPath(mirrorRoot, file.relativePath);
        requireRealProjectAncestors(mirrorRoot, target);
        ensureProjectDirectoryDurably(mirrorRoot, dirname(target));
        requireRealProjectAncestors(mirrorRoot, target);
        writeStableProjectFile(target, file.content, false);
        chmodSync(target, file.mode);
      }
      fsyncDirectory(mirrorRoot);
      return mirrorRoot;
    } catch (error) {
      rmSync(mirrorRoot, { recursive: true, force: true });
      throw error;
    }
  });
}

/**
 * The sole synchronous project mutation entry point for a v2 run. Validation occurs
 * before resolving or creating any target, so stale/missing receipts cannot mutate.
 */
export function writeProjectFile(request: ProjectWriteRequest): string {
  return withProjectMutationLock(request.projectRoot, request.invocation, () => {
    requireGuardedProjectWrite(request.projectRoot, request.invocation);
    const target = resolveProjectPath(request.projectRoot, request.relativePath);
    requireRealProjectAncestors(request.projectRoot, target);
    ensureProjectDirectoryDurably(request.projectRoot, dirname(target));
    requireRealProjectAncestors(request.projectRoot, target);
    writeStableProjectFile(target, request.content, false);
    fsyncDirectory(dirname(target));
    return target;
  });
}

/**
 * Delete one project file under the same lock and activation every write takes.
 *
 * Cleaning is a project mutation, not a convenience: a direct `unlinkSync` outside this boundary
 * would delete records while another run holds the mutation lock, and the mutation inventory
 * rejects it for exactly that reason. Directories are never removed, and a target that is not a
 * regular file is refused rather than followed.
 */
export function removeProjectFile(request: Omit<ProjectWriteRequest, 'content'>): string {
  return withProjectMutationLock(request.projectRoot, request.invocation, () => {
    requireGuardedProjectWrite(request.projectRoot, request.invocation);
    const target = resolveProjectPath(request.projectRoot, request.relativePath);
    requireRealProjectAncestors(request.projectRoot, target);
    let stats: Stats;
    try {
      stats = lstatSync(target);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') return target;
      throw error;
    }
    if (!stats.isFile()) throw new ProjectWriteError(`${request.relativePath} is not a regular project file`);
    unlinkSync(target);
    fsyncDirectory(dirname(target));
    return target;
  });
}

/** Persist immutable receipts without allowing a later writer to replace them. */
export function writeImmutableProjectFile(request: ProjectWriteRequest): string {
  return withProjectMutationLock(request.projectRoot, request.invocation, () => {
    requireGuardedProjectWrite(request.projectRoot, request.invocation);
    const target = resolveProjectPath(request.projectRoot, request.relativePath);
    requireRealProjectAncestors(request.projectRoot, target);
    ensureProjectDirectoryDurably(request.projectRoot, dirname(target));
    requireRealProjectAncestors(request.projectRoot, target);
    try {
      writeStableProjectFile(target, request.content, true);
      fsyncDirectory(dirname(target));
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EEXIST') throw new ProjectWriteError(`immutable project artifact already exists: ${request.relativePath}`);
      throw error;
    }
    return target;
  });
}

/**
 * Persist a content-addressed immutable receipt idempotently. The digest is in the path, so a
 * repeated write of the exact same bytes is the same receipt and must not fail a resumed run;
 * different bytes under one address stay a hard error.
 */
export function writeContentAddressedProjectFile(request: ProjectWriteRequest): string {
  try {
    return writeImmutableProjectFile(request);
  } catch (error) {
    if (!(error instanceof ProjectWriteError) || !error.reason.startsWith('immutable project artifact already exists:')) throw error;
    const target = resolveProjectPath(request.projectRoot, request.relativePath);
    const existing = readFileSync(target);
    const written = typeof request.content === 'string' ? Buffer.from(request.content, 'utf8') : Buffer.from(request.content);
    if (!existing.equals(written)) {
      throw new ProjectWriteError(`content-addressed artifact already exists with different bytes: ${request.relativePath}`);
    }
    return target;
  }
}
function acquireRawProjectLock(request: ProjectLockRequest, content = ''): () => void {
  requireGuardedProjectWrite(request.projectRoot, request.invocation);
  const target = resolveProjectPath(request.projectRoot, request.relativePath);
  const directory = dirname(target);
  requireRealProjectAncestors(request.projectRoot, target);
  requireRegularProjectLeafOrMissing(target, 'project lock');
  const temporary = `${target}.prepare-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let temporaryDescriptor: number | undefined;
  let lockDescriptor: number | undefined;
  let claimedIdentity: Stats | undefined;
  const cleanClaim = (): void => {
    if (claimedIdentity === undefined) return;
    try {
      const entry = lstatSync(target);
      if (sameFileIdentity(entry, claimedIdentity) && entry.isFile() && !entry.isSymbolicLink()) unlinkSync(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  try {
    temporaryDescriptor = openStableRegularProjectFile(
      temporary,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
    );
    writeFully(temporaryDescriptor, content);
    fsyncSync(temporaryDescriptor);
    closeSync(temporaryDescriptor);
    temporaryDescriptor = undefined;
    linkSync(temporary, target);
    claimedIdentity = lstatSync(target);
    if (!claimedIdentity.isFile() || claimedIdentity.isSymbolicLink()) {
      throw new ProjectWriteError('project lock changed during acquisition');
    }
    unlinkSync(temporary);
    const directoryDescriptor = openSync(directory, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    lockDescriptor = openStableRegularProjectFile(target, fsConstants.O_RDONLY);
    const lockIdentity = fstatSync(lockDescriptor);
    const lockEntry = lstatSync(target);
    if (!sameFileIdentity(lockIdentity, lockEntry) || lockEntry.isSymbolicLink() || !lockEntry.isFile()) {
      throw new ProjectWriteError('project lock changed during acquisition');
    }
    claimedIdentity = undefined;
    let closed = false;
    let released = false;
    return () => {
      if (released) return;
      requireGuardedProjectWrite(request.projectRoot, request.invocation);
      const opened = fstatSync(lockDescriptor as number);
      const entry = lstatSync(target);
      if (!sameFileIdentity(opened, lockIdentity) || !sameFileIdentity(opened, entry) || entry.isSymbolicLink() || !entry.isFile()) {
        throw new ProjectWriteError('project lock changed before release');
      }
      if (!closed) {
        closeSync(lockDescriptor as number);
        closed = true;
      }
      const finalEntry = lstatSync(target);
      if (!sameFileIdentity(finalEntry, lockIdentity) || finalEntry.isSymbolicLink() || !finalEntry.isFile()) {
        throw new ProjectWriteError('project lock changed during release');
      }
      unlinkSync(target);
      released = true;
    };
  } catch (error) {
    if (lockDescriptor !== undefined) closeSync(lockDescriptor);
    if (temporaryDescriptor !== undefined) closeSync(temporaryDescriptor);
    try { cleanClaim(); } finally {
      try { unlinkSync(temporary); } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanupError;
      }
    }
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ProjectWriteError(`project lock already exists: ${request.relativePath}`);
    }
    throw error;
  }
}

const mutationOwner = (): string => JSON.stringify({
  schema: 'omd-project-mutation-lock-v1',
  host: hostname(),
  pid: process.pid,
  startedAt: Date.now(),
});

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function recoverDeadMutationLock(projectRoot: string, invocation: ProjectRunInvocation): void {
  const target = resolveProjectPath(projectRoot, PROJECT_MUTATION_LOCK);
  let descriptor: number | undefined;
  try {
    descriptor = openStableRegularProjectFile(target, fsConstants.O_RDONLY);
    const before = fstatSync(descriptor);
    const entry = lstatSync(target);
    if (!sameFileIdentity(before, entry) || entry.isSymbolicLink() || !entry.isFile()) {
      throw new ProjectWriteError('project mutation lock changed during recovery');
    }
    const owner = JSON.parse(readFileSync(descriptor, 'utf8')) as {
      schema?: unknown;
      host?: unknown;
      pid?: unknown;
      startedAt?: unknown;
    };
    const after = fstatSync(descriptor);
    if (!sameFileIdentity(before, after)
      || owner.schema !== 'omd-project-mutation-lock-v1'
      || owner.host !== hostname()
      || !Number.isSafeInteger(owner.pid)
      || (owner.pid as number) <= 0
      || !Number.isSafeInteger(owner.startedAt)
      || processIsAlive(owner.pid as number)) {
      throw new ProjectWriteError('project mutation lock owner is live or ambiguous');
    }
    closeSync(descriptor);
    descriptor = undefined;
    const finalEntry = lstatSync(target);
    if (!sameFileIdentity(after, finalEntry) || finalEntry.isSymbolicLink() || !finalEntry.isFile()) {
      throw new ProjectWriteError('project mutation lock changed before stale recovery');
    }
    unlinkSync(target);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (error instanceof ProjectWriteError) throw error;
    throw new ProjectWriteError(`project mutation lock recovery failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  requireGuardedProjectWrite(projectRoot, invocation);
}

function mutationRelease(root: string, invocation: ProjectRunInvocation, state: ActiveMutationLock): () => void {
  let released = false;
  return () => {
    if (released) return;
    requireGuardedProjectWrite(root, invocation);
    state.depth -= 1;
    if (state.depth === 0) {
      state.releaseFileLock();
      activeMutationLocks.delete(root);
    }
    released = true;
  };
}

/**
 * Serializes every cooperating project mutation with final publication and destructive GC.
 * A dead same-host owner is recovered only after stable inode checks and an ESRCH liveness result.
 */
export function acquireProjectMutationLock(
  projectRoot: string,
  invocation: ProjectRunInvocation,
  options: { nonReentrant?: boolean } = {},
): () => void {
  requireGuardedProjectWrite(projectRoot, invocation);
  const root = canonicalProjectRoot(projectRoot);
  const active = activeMutationLocks.get(root);
  if (active !== undefined) {
    if (active.invocation !== invocation || active.nonReentrant || options.nonReentrant) {
      throw new ProjectWriteError('project mutation lock is owned by another invocation');
    }
    active.depth += 1;
    return mutationRelease(root, invocation, active);
  }

  ensureProjectDirectoryDurably(root, resolve(root, '.omd'));
  let releaseFileLock: () => void;
  try {
    releaseFileLock = acquireRawProjectLock(
      { projectRoot: root, relativePath: PROJECT_MUTATION_LOCK, invocation },
      mutationOwner(),
    );
  } catch (error) {
    if (!(error instanceof ProjectWriteError) || !error.reason.includes('already exists')) throw error;
    recoverDeadMutationLock(root, invocation);
    releaseFileLock = acquireRawProjectLock(
      { projectRoot: root, relativePath: PROJECT_MUTATION_LOCK, invocation },
      mutationOwner(),
    );
  }
  const state: ActiveMutationLock = { invocation, nonReentrant: options.nonReentrant === true, depth: 1, releaseFileLock };
  activeMutationLocks.set(root, state);
  return mutationRelease(root, invocation, state);
}

/**
 * Acquire a project-scoped exclusive lock under the project-wide mutation transaction.
 * Both releases are idempotent; the mutation lock remains held for this lock's lifetime.
 */
export function acquireProjectLock(request: ProjectLockRequest): () => void {
  const releaseMutation = acquireProjectMutationLock(request.projectRoot, request.invocation);
  let releaseRaw: (() => void) | undefined;
  try {
    releaseRaw = acquireRawProjectLock(request);
  } catch (error) {
    releaseMutation();
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    try { releaseRaw?.(); } finally { releaseMutation(); }
    released = true;
  };
}

function withProjectMutationLock<T>(projectRoot: string, invocation: ProjectRunInvocation, operation: () => T): T {
  const release = acquireProjectMutationLock(projectRoot, invocation);
  try { return operation(); } finally { release(); }
}

/** Atomically replace a mutable pointer after its immutable target is durable. */
export function replaceProjectFileAtomically(request: ProjectWriteRequest): string {
  return withProjectMutationLock(request.projectRoot, request.invocation, () => {
    requireGuardedProjectWrite(request.projectRoot, request.invocation);
    const target = resolveProjectPath(request.projectRoot, request.relativePath);
    requireRealProjectAncestors(request.projectRoot, target);
    const directory = dirname(target);
    ensureProjectDirectoryDurably(request.projectRoot, directory);
    requireRealProjectAncestors(request.projectRoot, target);
    requireRegularProjectLeafOrMissing(target, 'project pointer');
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      writeStableProjectFile(temporary, request.content, true);
      if (request.mode !== undefined) {
        if (!Number.isInteger(request.mode) || request.mode < 0 || request.mode > 0o777) {
          throw new ProjectWriteError('project file mode is invalid');
        }
        chmodSync(temporary, request.mode);
        const temporaryDescriptor = openStableRegularProjectFile(temporary, fsConstants.O_RDONLY);
        try { fsyncSync(temporaryDescriptor); } finally { closeSync(temporaryDescriptor); }
      }
      requireRegularProjectLeafOrMissing(target, 'project pointer');
      requireRealProjectAncestors(request.projectRoot, target);
      renameSync(temporary, target);
      fsyncDirectory(directory);
    } finally {
      try { unlinkSync(temporary); } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'ENOENT') throw error;
      }
    }
    return target;
  });
}
export function createProjectDirectory(
  projectRoot: string,
  relativePath: string,
  invocation: ProjectRunInvocation,
): string {
  return withProjectMutationLock(projectRoot, invocation, () => {
    requireGuardedProjectWrite(projectRoot, invocation);
    const target = resolveProjectPath(projectRoot, relativePath);
    requireRealProjectAncestors(projectRoot, target);
    try {
      const metadata = lstatSync(target);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new ProjectWriteError('project directory target must be a real directory, not a symlink');
      }
    } catch (error) {
      if (error instanceof ProjectWriteError) throw error;
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') throw error;
    }
    ensureProjectDirectoryDurably(projectRoot, target);
    requireRealProjectAncestors(projectRoot, target);
    const metadata = lstatSync(target);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new ProjectWriteError('project directory target must be a real directory, not a symlink');
    }
    return target;
  });
}


/**
 * Binds project writes to an invocation that the host has already validated for the
 * current run. There is deliberately no ambient or default invocation: legacy
 * callers must receive this adapter from their trusted active invocation.
 */
export function createProjectWriteAdapter(
  projectRoot: string,
  invocation: ProjectRunInvocation,
): ProjectWriteAdapter {
  requireGuardedProjectWrite(projectRoot, invocation);
  const resolvedProjectRoot = canonicalProjectRoot(projectRoot);
  const adapter: ProjectWriteAdapter = {
    projectRoot: resolvedProjectRoot,
    mkdir(relativePath) {
      return createProjectDirectory(resolvedProjectRoot, relativePath, invocation);
    },
    write(relativePath, content) {
      return writeProjectFile({ projectRoot: resolvedProjectRoot, relativePath, content, invocation });
    },
    writeContentAddressed(relativePath, content) {
      return writeContentAddressedProjectFile({ projectRoot: resolvedProjectRoot, relativePath, content, invocation });
    },
    remove(relativePath) {
      return removeProjectFile({ projectRoot: resolvedProjectRoot, relativePath, invocation });
    },
  };
  trustedAdapters.add(adapter);
  trustedAdapterMetadata.set(adapter, Object.freeze({
    projectRoot: resolvedProjectRoot,
    mkdir: adapter.mkdir,
    write: adapter.write,
    writeContentAddressed: adapter.writeContentAddressed,
    remove: adapter.remove,
    invocation,
  }));
  return Object.freeze(adapter);
}

export function requireProjectWriteAdapter(
  projectRoot: string,
  adapter: ProjectWriteAdapter | undefined,
): ProjectWriteAdapter {
  const metadata = adapter === undefined ? undefined : trustedAdapterMetadata.get(adapter);
  if (!adapter || !metadata
    || adapter.projectRoot !== metadata.projectRoot
    || adapter.mkdir !== metadata.mkdir
    || adapter.write !== metadata.write
    || adapter.writeContentAddressed !== metadata.writeContentAddressed
    || adapter.remove !== metadata.remove
    || !Object.isFrozen(adapter)
    || !trustedAdapters.has(adapter)) {
    throw new ProjectWriteError('a trusted immutable project-write adapter is required');
  }
  if (canonicalProjectRoot(metadata.projectRoot) !== canonicalProjectRoot(projectRoot)) {
    throw new ProjectWriteError('project-write adapter belongs to a different project root');
  }
  return adapter;
}

export function requireProjectWriteAdapterForInvocation(
  projectRoot: string,
  adapter: ProjectWriteAdapter | undefined,
  invocation: ProjectRunInvocation,
): ProjectWriteAdapter {
  const trusted = requireProjectWriteAdapter(projectRoot, adapter);
  if (trustedAdapterMetadata.get(trusted)?.invocation !== invocation) {
    throw new ProjectWriteError('project-write adapter belongs to a different invocation');
  }
  return trusted;
}

export function projectWriteTarget(projectRoot: string, relativePath: string): string {
  return resolveProjectPath(projectRoot, relativePath);
}
