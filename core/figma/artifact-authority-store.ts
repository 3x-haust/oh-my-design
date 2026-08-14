import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

export type FileIdentity = Readonly<{
  path: string;
  device: number;
  inode: number;
  birthtimeMs: number;
  size: number;
  sha256: string;
}>;
export type StableFile =
  | { readonly state: 'file'; readonly identity: FileIdentity; readonly bytes: Buffer }
  | { readonly state: 'missing' | 'invalid' };
export type AuthorityFile = Readonly<{ path: string; name: string; bytes: Buffer }>;

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const errorCode = (error: unknown): unknown => error !== null && typeof error === 'object'
  ? Reflect.get(error, 'code') : undefined;

export function canonicalFigmaProjectRoot(root: string): string {
  const canonical = realpathSync(resolve(root));
  const stats = lstatSync(canonical);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Figma authority requires a real project root');
  return canonical;
}

function stateBase(): string {
  const configured = process.env.XDG_STATE_HOME;
  if (configured !== undefined) {
    if (!isAbsolute(configured)) throw new Error('XDG_STATE_HOME must be absolute for Figma authority');
    const stats = lstatSync(configured);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('XDG_STATE_HOME must be a real directory');
    return realpathSync(configured);
  }
  return realpathSync(homedir());
}

function authorityRoot(create: boolean): string | undefined {
  const base = stateBase();
  const parts = process.env.XDG_STATE_HOME === undefined
    ? ['.local', 'state', 'oh-my-design', 'figma-artifacts-v1']
    : ['oh-my-design', 'figma-artifacts-v1'];
  let current = base;
  for (const part of parts) {
    current = join(current, part);
    try {
      const stats = lstatSync(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Figma authority path must contain only real directories');
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      if (!create) return undefined;
      mkdirSync(current, { mode: 0o700 });
    }
  }
  const mode = lstatSync(current).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error('Figma authority root must not be accessible to group or other users');
  return current;
}

function projectKey(root: string): string {
  const canonical = canonicalFigmaProjectRoot(root);
  const stats = lstatSync(canonical);
  return digest(Buffer.from(`${canonical}\0${stats.dev}\0${stats.ino}\0${stats.birthtimeMs}`, 'utf8'));
}

function projectDirectory(root: string, create: boolean): string | undefined {
  const authority = authorityRoot(create);
  if (authority === undefined) return undefined;
  const directory = join(authority, projectKey(root));
  try {
    const stats = lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Figma project authority must be a real directory');
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    if (!create) return undefined;
    mkdirSync(directory, { mode: 0o700 });
  }
  return directory;
}

export function stableFigmaFile(path: string): StableFile {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    const entry = lstatSync(path);
    if (!before.isFile() || entry.isSymbolicLink() || !entry.isFile()
      || before.dev !== entry.dev || before.ino !== entry.ino || before.birthtimeMs !== entry.birthtimeMs
      || before.nlink !== 1 || entry.nlink !== 1) return { state: 'invalid' };
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || before.birthtimeMs !== after.birthtimeMs
      || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== before.size) return { state: 'invalid' };
    return {
      state: 'file', bytes,
      identity: {
        path: join(realpathSync(dirname(resolve(path))), basename(path)), device: before.dev, inode: before.ino, birthtimeMs: before.birthtimeMs,
        size: before.size, sha256: digest(bytes),
      },
    };
  } catch (error) {
    return { state: errorCode(error) === 'ENOENT' ? 'missing' : 'invalid' };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function sameFigmaFile(actual: StableFile, expected: FileIdentity): boolean {
  return actual.state === 'file'
    && actual.identity.path === expected.path
    && actual.identity.device === expected.device
    && actual.identity.inode === expected.inode
    && actual.identity.birthtimeMs === expected.birthtimeMs
    && actual.identity.size === expected.size
    && actual.identity.sha256 === expected.sha256;
}

export function readFigmaAuthorityFiles(root: string): readonly AuthorityFile[] {
  const directory = projectDirectory(root, false);
  if (directory === undefined) return [];
  return readdirSync(directory).sort().flatMap((name): readonly AuthorityFile[] => {
    if (!/^[0-9a-f-]{36}\.json$/.test(name)) return [];
    const path = join(directory, name);
    const file = stableFigmaFile(path);
    return file.state === 'file' ? [{ path, name, bytes: file.bytes }] : [];
  });
}

export function writeFigmaAuthorityFile(root: string, id: string, bytes: Uint8Array): string {
  const directory = projectDirectory(root, true);
  if (directory === undefined) throw new Error('Figma authority directory was not created');
  const target = join(directory, `${id}.json`);
  const temporary = join(directory, `.${id}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    let offset = 0;
    while (offset < bytes.byteLength) offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
    const directoryDescriptor = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    return target;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
  }
}

export function removeFigmaAuthorityFile(root: string, path: string): void {
  const directory = projectDirectory(root, false);
  if (directory === undefined || dirname(path) !== directory) throw new Error('Figma authority record escaped its project directory');
  unlinkSync(path);
  try { rmdirSync(directory); } catch (error) { if (errorCode(error) !== 'ENOTEMPTY') throw error; }
  const authority = authorityRoot(false);
  if (authority !== undefined) {
    try { rmdirSync(authority); } catch (error) { if (errorCode(error) !== 'ENOTEMPTY') throw error; }
  }
}
