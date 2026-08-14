import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export type StableProjectFileIdentity = Readonly<{
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  dev?: number;
  ino?: number;
}>;
export interface StableProjectFileSystem {
  readFile(path: string | number): Buffer;
  lstat(path: string): StableProjectFileIdentity;
  open(path: string, flags: number, mode: number): number;
  fstat(fd: number): StableProjectFileIdentity;
  close(fd: number): void;
}
export type StableProjectFileRead = Readonly<{
  root: string;
  path: string;
  label: string;
  fs: StableProjectFileSystem;
}>;
type OpenDirectory = Readonly<{ path: string; descriptor: number; identity: StableProjectFileIdentity }>;

export class StableProjectFileReadError extends Error {
  constructor(message: string) { super(message); this.name = 'StableProjectFileReadError'; }
}
export function nodeStableProjectFileSystem(): StableProjectFileSystem {
  return Object.freeze({
    readFile(path: string | number): Buffer { return readFileSync(path); },
    lstat(path: string): StableProjectFileIdentity { return lstatSync(path); },
    open(path: string, flags: number, mode: number): number {
      return (flags & fsConstants.O_DIRECTORY) === 0
        ? openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, mode)
        : openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW, mode);
    },
    fstat(descriptor: number): StableProjectFileIdentity { return fstatSync(descriptor); },
    close(descriptor: number): void { closeSync(descriptor); },
  });
}

function fail(message: string): never { throw new StableProjectFileReadError(message); }
function sameIdentity(left: StableProjectFileIdentity, right: StableProjectFileIdentity): boolean {
  return left.dev !== undefined && left.ino !== undefined
    && left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}
function openDirectory(request: StableProjectFileRead, path: string): OpenDirectory {
  const before = request.fs.lstat(path);
  if (!before.isDirectory() || before.isSymbolicLink()) fail(`${request.label} has a symlink or non-directory ancestor`);
  const descriptor = request.fs.open(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW, 0o600);
  try {
    const opened = request.fs.fstat(descriptor);
    const entry = request.fs.lstat(path);
    if (!opened.isDirectory() || !entry.isDirectory() || entry.isSymbolicLink()
      || !sameIdentity(before, opened) || !sameIdentity(opened, entry)) fail(`${request.label} ancestor changed before stable read`);
    return { path, descriptor, identity: opened };
  } catch (error) {
    request.fs.close(descriptor);
    throw error;
  }
}
function ancestorPaths(root: string, path: string, label: string): readonly string[] {
  const outside = relative(root, path);
  if (outside === '' || outside === '..' || outside.startsWith(`..${sep}`) || resolve(root, outside) !== path) fail(`${label} escapes the project root`);
  let current = root;
  return [root, ...outside.split(sep).slice(0, -1).map((segment) => {
    current = resolve(current, segment);
    return current;
  })];
}

/** Reads a regular project file while holding no-follow descriptors for every trusted ancestor. */
export function readStableProjectFile(input: StableProjectFileRead): Buffer {
  const request = { ...input, root: resolve(input.root), path: resolve(input.path) };
  const ancestors: OpenDirectory[] = [];
  try {
    try {
      for (const path of ancestorPaths(request.root, request.path, request.label)) ancestors.push(openDirectory(request, path));
      const before = request.fs.lstat(request.path);
      if (!before.isFile() || before.isSymbolicLink()) fail(`${request.label} is not a regular non-symlink file`);
      const descriptor = request.fs.open(request.path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, 0o600);
      try {
        const opened = request.fs.fstat(descriptor);
        const entry = request.fs.lstat(request.path);
        if (!opened.isFile() || !entry.isFile() || entry.isSymbolicLink()
          || !sameIdentity(before, opened) || !sameIdentity(opened, entry)) fail(`${request.label} changed or is not a regular non-symlink file`);
        const bytes = request.fs.readFile(descriptor);
        const after = request.fs.fstat(descriptor);
        const current = request.fs.lstat(request.path);
        if (!sameIdentity(opened, after) || !current.isFile() || current.isSymbolicLink() || !sameIdentity(opened, current)
          || ancestors.some((ancestor) => !sameIdentity(ancestor.identity, request.fs.lstat(ancestor.path)))) fail(`${request.label} changed while it was read`);
        return bytes;
      } finally { request.fs.close(descriptor); }
    } catch (error) {
      if (error instanceof StableProjectFileReadError) throw error;
      throw new StableProjectFileReadError(`${request.label} could not be read stably`);
    }
  } finally {
    for (const ancestor of ancestors.reverse()) request.fs.close(ancestor.descriptor);
  }
}
