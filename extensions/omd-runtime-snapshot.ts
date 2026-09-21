import { createHash } from 'node:crypto';
import {
  constants,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';

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

export function runtimeDependencyRoot(resolvedPackagePath: string): string {
  const marker = `${sep}node_modules${sep}`;
  const index = resolvedPackagePath.lastIndexOf(marker);
  if (index < 0) {
    throw new OmdRuntimeSnapshotError('OMD_RUNTIME_DEPENDENCIES_INVALID: package did not resolve through node_modules');
  }
  return resolvedPackagePath.slice(0, index + marker.length - 1);
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
    cpSync(source, target, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      mode: constants.COPYFILE_FICLONE,
    });
  }
}

function dependencyRoot(sourceRoot: string): string {
  const requested = resolve(sourceRoot);
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || basename(requested) !== 'node_modules') {
    throw new OmdRuntimeSnapshotError('OMD_RUNTIME_DEPENDENCIES_INVALID');
  }
  return realpathSync(requested);
}

function updateDependencyDigest(
  hash: ReturnType<typeof createHash>,
  root: string,
  path: string,
  ancestors: ReadonlySet<string>,
): void {
  const absolute = join(root, path);
  const link = lstatSync(absolute);
  const physical = link.isSymbolicLink() ? realpathSync(absolute) : absolute;
  const stat = link.isSymbolicLink() ? statSync(absolute) : link;
  if (link.isSymbolicLink() && physical !== root && !physical.startsWith(`${root}${sep}`)) {
    throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_DEPENDENCIES_INVALID: external link ${path}`);
  }
  hash.update(path).update('\0');
  if (stat.isDirectory()) {
    if (ancestors.has(physical)) throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_DEPENDENCIES_INVALID: recursive link ${path}`);
    hash.update('directory\0');
    const next = new Set(ancestors).add(physical);
    for (const name of readdirSync(absolute).sort()) updateDependencyDigest(hash, root, join(path, name), next);
    return;
  }
  if (!stat.isFile()) throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_DEPENDENCIES_INVALID: ${path}`);
  hash.update('file\0').update(readFileSync(absolute)).update('\0');
}

function dependencyDigest(sourceRoot: string): string {
  const root = dependencyRoot(sourceRoot);
  const hash = createHash('sha256');
  for (const name of readdirSync(root).sort()) {
    if (name !== 'node_modules') updateDependencyDigest(hash, root, name, new Set([root]));
  }
  return hash.digest('hex');
}

function copyDependencies(sourceRoot: string, targetRoot: string): void {
  const root = dependencyRoot(sourceRoot);
  const recursiveLink = join(root, 'node_modules');
  cpSync(root, join(targetRoot, 'node_modules'), {
    recursive: true,
    dereference: true,
    errorOnExist: true,
    mode: constants.COPYFILE_FICLONE,
    filter: source => source !== recursiveLink,
  });
}

export function createOmdRuntimeSnapshot(options: OmdRuntimeSnapshotOptions): OmdRuntimeSnapshot {
  const sourceRoot = resolve(options.sourceRoot);
  let lastMismatch = '';
  for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt += 1) {
    const before = runtimeDigest(sourceRoot);
    const snapshotRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-'));
    let retained = false;
    try {
      copyRuntime(sourceRoot, snapshotRoot);
      const copied = runtimeDigest(snapshotRoot);
      let dependencyBefore = 'none';
      let dependencyCopied = 'none';
      let dependencyAfter = 'none';
      if (before === copied && options.dependencyRoot !== null) {
        if (!existsSync(options.dependencyRoot)) throw new OmdRuntimeSnapshotError('OMD_RUNTIME_DEPENDENCIES_INVALID');
        dependencyBefore = dependencyDigest(options.dependencyRoot);
        copyDependencies(options.dependencyRoot, snapshotRoot);
        dependencyCopied = dependencyDigest(join(snapshotRoot, 'node_modules'));
        dependencyAfter = dependencyDigest(options.dependencyRoot);
      }
      const after = runtimeDigest(sourceRoot);
      if (before === copied && copied === after && dependencyBefore === dependencyCopied && dependencyCopied === dependencyAfter) {
        retained = true;
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
      lastMismatch = `attempt ${attempt}: source=${before}/${copied}/${after}; dependencies=${dependencyBefore}/${dependencyCopied}/${dependencyAfter}`;
    } finally {
      if (!retained) rmSync(snapshotRoot, { recursive: true, force: true });
    }
  }
  throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_SOURCE_UNSTABLE: ${lastMismatch}`);
}
