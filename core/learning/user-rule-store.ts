import { randomUUID } from 'node:crypto';
import {
  closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, realpathSync, renameSync, unlinkSync, writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const DIRECTORY_PARTS = ['oh-my-design', 'learning-v1'] as const;
const INDEX_NAME = 'rules.json';
const errorCode = (error: unknown): unknown => error !== null && typeof error === 'object'
  ? Reflect.get(error, 'code') : undefined;

function stateBase(environment: NodeJS.ProcessEnv): Readonly<{ base: string; parts: readonly string[] }> {
  const configured = environment.XDG_STATE_HOME;
  if (configured !== undefined) {
    if (!isAbsolute(configured)) throw new Error('XDG_STATE_HOME must be absolute');
    const stat = lstatSync(configured);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('XDG_STATE_HOME must be a real directory');
    return { base: realpathSync(configured), parts: DIRECTORY_PARTS };
  }
  return { base: realpathSync(homedir()), parts: ['.local', 'state', ...DIRECTORY_PARTS] };
}

function ensureDirectory(path: string, privateMode: boolean): void {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('learning store path must contain only real directories');
    if (privateMode && (stat.mode & 0o077) !== 0) throw new Error('learning store must not be accessible to group or other users');
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    mkdirSync(path, { mode: privateMode ? 0o700 : 0o755 });
  }
}

function storeDirectory(environment: NodeJS.ProcessEnv, create: boolean): string | undefined {
  const location = stateBase(environment);
  let current = location.base;
  for (const [index, part] of location.parts.entries()) {
    current = join(current, part);
    if (!create && !existsSync(current)) return undefined;
    ensureDirectory(current, index >= location.parts.length - DIRECTORY_PARTS.length);
  }
  return current;
}

function readStable(path: string): Buffer {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor);
    const entry = lstatSync(path);
    if (!before.isFile() || entry.isSymbolicLink() || before.dev !== entry.dev || before.ino !== entry.ino
      || before.nlink !== 1 || entry.nlink !== 1) {
      throw new Error('learning store index must be a stable regular file');
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || bytes.byteLength !== before.size) {
      throw new Error('learning store index changed while it was read');
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

export function readUserLearningRuleIndex(environment: NodeJS.ProcessEnv = process.env): unknown | undefined {
  const directory = storeDirectory(environment, false);
  if (directory === undefined) return undefined;
  const path = join(directory, INDEX_NAME);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readStable(path).toString('utf8')) as unknown;
}

/** Writes only to the private per-user state store; project state never crosses this boundary. */
export function writeUserLearningRuleIndex(bytes: Uint8Array, environment: NodeJS.ProcessEnv = process.env): string {
  const directory = storeDirectory(environment, true);
  if (directory === undefined) throw new Error('learning store directory is unavailable');
  const target = join(directory, INDEX_NAME);
  const temporary = join(directory, `.${basename(target)}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
      if (!Number.isSafeInteger(written) || written <= 0) throw new Error('learning store write made no progress');
      offset += written;
    }
    fsyncSync(descriptor);
    closeSync(descriptor); descriptor = undefined;
    if (existsSync(target)) {
      const stat = lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || dirname(realpathSync(target)) !== directory) {
        throw new Error('learning store target must be a real file in the learning store');
      }
    }
    renameSync(temporary, target);
    const directoryDescriptor = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    return resolve(target);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
  }
}
