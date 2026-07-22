import { constants as fsConstants, closeSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import type { Stats } from 'node:fs';
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
};
export type ExternalObservationKind = 'render' | 'capture' | 'probe-cache';

export type ExternalObservationFileRequest = {
  readonly projectRoot: string;
  readonly absolutePath: string;
  readonly content: string | Uint8Array;
  readonly invocation: ProjectRunInvocation;
  readonly kind: ExternalObservationKind;
};

export type ExternalObservationDirectoryRequest = Omit<ExternalObservationFileRequest, 'content'>;
const trustedAdapters = new WeakSet<ProjectWriteAdapter>();

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

function writeStableProjectFile(target: string, content: string | Uint8Array, immutable: boolean): void {
  requireRegularProjectLeafOrMissing(target, 'project write target');
  const flags = immutable
    ? fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
    : fsConstants.O_WRONLY | fsConstants.O_CREAT;
  let descriptor: number | undefined;
  try {
    descriptor = openStableRegularProjectFile(target, flags);
    if (!immutable) ftruncateSync(descriptor, 0);
    if (typeof content === 'string') {
      writeSync(descriptor, content);
    } else {
      writeSync(descriptor, content, 0, content.byteLength, null);
    }
    const opened = fstatSync(descriptor);
    const entry = lstatSync(target);
    if (!sameFileIdentity(opened, entry) || entry.isSymbolicLink()) {
      throw new ProjectWriteError('project write target changed during write');
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
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
}

export function createExternalObservationDirectory(request: ExternalObservationDirectoryRequest): string {
  requireGuardedProjectWrite(request.projectRoot, request.invocation);
  const target = resolveExternalObservationPath(request.projectRoot, request.invocation, request.absolutePath, request.kind, true);
  ensureUnambiguousExternalDirectory(target);
  return target;
}

/**
 * The sole synchronous project mutation entry point for a v2 run. Validation occurs
 * before resolving or creating any target, so stale/missing receipts cannot mutate.
 */
export function writeProjectFile(request: ProjectWriteRequest): string {
  requireGuardedProjectWrite(request.projectRoot, request.invocation);
  const target = resolveProjectPath(request.projectRoot, request.relativePath);
  requireRealProjectAncestors(request.projectRoot, target);
  mkdirSync(dirname(target), { recursive: true });
  requireRealProjectAncestors(request.projectRoot, target);
  writeStableProjectFile(target, request.content, false);
  return target;
}

/** Persist immutable receipts without allowing a later writer to replace them. */
export function writeImmutableProjectFile(request: ProjectWriteRequest): string {
  requireGuardedProjectWrite(request.projectRoot, request.invocation);
  const target = resolveProjectPath(request.projectRoot, request.relativePath);
  requireRealProjectAncestors(request.projectRoot, target);
  mkdirSync(dirname(target), { recursive: true });
  requireRealProjectAncestors(request.projectRoot, target);
  try {
    writeStableProjectFile(target, request.content, true);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EEXIST') throw new ProjectWriteError(`immutable project artifact already exists: ${request.relativePath}`);
    throw error;
  }
  return target;
}
/**
 * Acquire a project-scoped exclusive lock. The returned release is safe to call
 * repeatedly after a successful cleanup.
 */
export function acquireProjectLock(request: ProjectLockRequest): () => void {
  requireGuardedProjectWrite(request.projectRoot, request.invocation);
  const target = resolveProjectPath(request.projectRoot, request.relativePath);
  requireRealProjectAncestors(request.projectRoot, target);
  requireRegularProjectLeafOrMissing(target, 'project lock');
  let descriptor: number | undefined;
  try {
    descriptor = openStableRegularProjectFile(target, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL);
    requireRegularProjectLock(target);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EEXIST') throw new ProjectWriteError(`project lock already exists: ${request.relativePath}`);
    throw error;
  }

  if (descriptor === undefined) {
    throw new ProjectWriteError('project lock could not be opened');
  }
  const lockDescriptor = descriptor;
  const lockIdentity = fstatSync(lockDescriptor);
  const lockEntry = lstatSync(target);
  if (!sameFileIdentity(lockIdentity, lockEntry) || lockEntry.isSymbolicLink() || !lockEntry.isFile()) {
    closeSync(lockDescriptor);
    throw new ProjectWriteError('project lock changed during acquisition');
  }
  let closed = false;
  let released = false;
  return () => {
    if (released) return;
    requireGuardedProjectWrite(request.projectRoot, request.invocation);
    const opened = fstatSync(lockDescriptor);
    const entry = lstatSync(target);
    if (!sameFileIdentity(opened, lockIdentity) || !sameFileIdentity(opened, entry) || entry.isSymbolicLink() || !entry.isFile()) {
      throw new ProjectWriteError('project lock changed before release');
    }
    if (!closed) {
      closeSync(lockDescriptor);
      closed = true;
    }
    const finalEntry = lstatSync(target);
    if (!sameFileIdentity(finalEntry, lockIdentity) || finalEntry.isSymbolicLink() || !finalEntry.isFile()) {
      throw new ProjectWriteError('project lock changed during release');
    }
    unlinkSync(target);
    released = true;
  };
}

/** Atomically replace a mutable pointer after its immutable target is durable. */
export function replaceProjectFileAtomically(request: ProjectWriteRequest): string {
  requireGuardedProjectWrite(request.projectRoot, request.invocation);
  const target = resolveProjectPath(request.projectRoot, request.relativePath);
  requireRealProjectAncestors(request.projectRoot, target);
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true });
  requireRealProjectAncestors(request.projectRoot, target);
  requireRegularProjectLeafOrMissing(target, 'project pointer');
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    writeStableProjectFile(temporary, request.content, true);
    requireRegularProjectLeafOrMissing(target, 'project pointer');
    requireRealProjectAncestors(request.projectRoot, target);
    renameSync(temporary, target);
  } finally {
    try { unlinkSync(temporary); } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') throw error;
    }
  }
  return target;
}
export function createProjectDirectory(
  projectRoot: string,
  relativePath: string,
  invocation: ProjectRunInvocation,
): string {
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
  mkdirSync(target, { recursive: true });
  requireRealProjectAncestors(projectRoot, target);
  const metadata = lstatSync(target);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new ProjectWriteError('project directory target must be a real directory, not a symlink');
  }
  return target;
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
  };
  trustedAdapters.add(adapter);
  return adapter;
}

export function requireProjectWriteAdapter(
  projectRoot: string,
  adapter: ProjectWriteAdapter | undefined,
): ProjectWriteAdapter {
  if (!adapter || typeof adapter.mkdir !== 'function' || typeof adapter.write !== 'function' || !trustedAdapters.has(adapter)) {
    throw new ProjectWriteError('a trusted active project-write adapter is required');
  }
  if (canonicalProjectRoot(adapter.projectRoot) !== canonicalProjectRoot(projectRoot)) {
    throw new ProjectWriteError('project-write adapter belongs to a different project root');
  }
  return adapter;
}

export function projectWriteTarget(projectRoot: string, relativePath: string): string {
  return resolveProjectPath(projectRoot, relativePath);
}
