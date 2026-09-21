import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const RUNTIME_PATHS = [
  'package.json',
  'bin',
  'core',
  'adapters',
  'extensions',
  'src',
  'scripts',
  'dist',
  'skills',
  'agents',
  '.mcp.json',
  '.claude-plugin',
  '.codex-plugin',
  '.agents',
  'README.md',
  'README.ko.md',
  'LICENSE',
] as const;

const REQUIRED_PATHS = ['package.json', 'bin/omd.mjs', 'bin/run-ts.mjs', 'bin/omd.ts'] as const;
const MAX_COPY_ATTEMPTS = 3;

export type OmdRuntimeSnapshot = Readonly<{
  root: string;
  entryPath: string;
  dispose(): void;
}>;

export type OmdRuntimeSnapshotOptions = Readonly<{
  sourceRoot: string;
  dependencyRoot: string | null;
}>;

export class OmdRuntimeSnapshotError extends Error {
  override readonly name = 'OmdRuntimeSnapshotError';
}

function assertRequiredPaths(root: string): void {
  for (const path of REQUIRED_PATHS) {
    if (!existsSync(join(root, path))) {
      throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_SOURCE_INCOMPLETE: missing ${path}`);
    }
  }
}

function updateDigest(hash: ReturnType<typeof createHash>, root: string, path: string): void {
  const absolute = join(root, path);
  const stat = lstatSync(absolute);
  hash.update(path).update('\0');
  if (stat.isSymbolicLink()) {
    throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_SOURCE_UNSUPPORTED: symbolic link ${path}`);
  }
  if (stat.isDirectory()) {
    hash.update('directory\0');
    for (const name of readdirSync(absolute).sort()) updateDigest(hash, root, join(path, name));
    return;
  }
  if (!stat.isFile()) throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_SOURCE_UNSUPPORTED: ${path}`);
  hash.update('file\0').update(readFileSync(absolute)).update('\0');
}

function runtimeDigest(root: string): string {
  assertRequiredPaths(root);
  const hash = createHash('sha256');
  for (const path of RUNTIME_PATHS) {
    if (existsSync(join(root, path))) updateDigest(hash, root, path);
    else hash.update(`missing\0${path}\0`);
  }
  return hash.digest('hex');
}

function copyRuntime(sourceRoot: string, targetRoot: string): void {
  for (const path of RUNTIME_PATHS) {
    const source = join(sourceRoot, path);
    if (!existsSync(source)) continue;
    const target = join(targetRoot, path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    cpSync(source, target, { recursive: true, dereference: false, errorOnExist: true });
  }
}

export function createOmdRuntimeSnapshot(options: OmdRuntimeSnapshotOptions): OmdRuntimeSnapshot {
  const sourceRoot = resolve(options.sourceRoot);
  let lastMismatch = '';
  for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt += 1) {
    const before = runtimeDigest(sourceRoot);
    const snapshotRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-'));
    copyRuntime(sourceRoot, snapshotRoot);
    const copied = runtimeDigest(snapshotRoot);
    const after = runtimeDigest(sourceRoot);
    if (before === copied && copied === after) {
      if (options.dependencyRoot !== null) {
        const dependencyRoot = resolve(options.dependencyRoot);
        if (!existsSync(dependencyRoot) || basename(dependencyRoot) !== 'node_modules') {
          rmSync(snapshotRoot, { recursive: true, force: true });
          throw new OmdRuntimeSnapshotError('OMD_RUNTIME_DEPENDENCIES_INVALID');
        }
        symlinkSync(dependencyRoot, join(snapshotRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      }
      let disposed = false;
      return Object.freeze({
        root: snapshotRoot,
        entryPath: join(snapshotRoot, 'bin/omd.mjs'),
        dispose: () => {
          if (disposed) return;
          disposed = true;
          rmSync(snapshotRoot, { recursive: true, force: true });
        },
      });
    }
    lastMismatch = `attempt ${attempt}: ${before}/${copied}/${after}`;
    rmSync(snapshotRoot, { recursive: true, force: true });
  }
  throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_SOURCE_UNSTABLE: ${lastMismatch}`);
}
