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
const SNAPSHOT_DEADLINE_MS = 5_000;

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

function assertBeforeDeadline(deadline: number): void {
  if (Date.now() > deadline) throw new OmdRuntimeSnapshotError('OMD_RUNTIME_SNAPSHOT_TIMEOUT');
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

function updateDigest(hash: ReturnType<typeof createHash>, root: string, path: string, deadline: number): void {
  assertBeforeDeadline(deadline);
  const absolute = join(root, path);
  const stat = lstatSync(absolute);
  hash.update(path).update('\0');
  if (stat.isSymbolicLink()) {
    throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_SOURCE_UNSUPPORTED: symbolic link ${path}`);
  }
  if (stat.isDirectory()) {
    hash.update('directory\0');
    for (const name of readdirSync(absolute).sort()) updateDigest(hash, root, join(path, name), deadline);
    return;
  }
  if (!stat.isFile()) throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_SOURCE_UNSUPPORTED: ${path}`);
  hash.update('file\0').update(readFileSync(absolute)).update('\0');
}

function runtimeDigest(root: string, deadline: number): string {
  assertRequiredPaths(root);
  const hash = createHash('sha256');
  for (const path of RUNTIME_PATHS) {
    if (existsSync(join(root, path))) updateDigest(hash, root, path, deadline);
    else hash.update(`missing\0${path}\0`);
  }
  return hash.digest('hex');
}

function copyRuntime(sourceRoot: string, targetRoot: string, deadline: number): void {
  for (const path of RUNTIME_PATHS) {
    assertBeforeDeadline(deadline);
    const source = join(sourceRoot, path);
    if (!existsSync(source)) continue;
    const target = join(targetRoot, path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    cpSync(source, target, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      mode: constants.COPYFILE_FICLONE,
      filter: () => { assertBeforeDeadline(deadline); return true; },
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

function updateDependencyFingerprint(
  hash: ReturnType<typeof createHash>,
  root: string,
  path: string,
  ancestors: ReadonlySet<string>,
  deadline: number,
): void {
  assertBeforeDeadline(deadline);
  const absolute = join(root, path);
  const link = lstatSync(absolute, { bigint: true });
  const physical = link.isSymbolicLink() ? realpathSync(absolute) : absolute;
  const stat = link.isSymbolicLink() ? statSync(absolute, { bigint: true }) : link;
  if (link.isSymbolicLink() && physical !== root && !physical.startsWith(`${root}${sep}`)) {
    throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_DEPENDENCIES_INVALID: external link ${path}`);
  }
  hash.update(path).update('\0')
    .update(link.isSymbolicLink() ? `link\0${physical}\0` : 'entry\0')
    .update(`${stat.dev}\0${stat.ino}\0${stat.mode}\0${stat.size}\0${stat.mtimeNs}\0${stat.ctimeNs}\0`);
  if (stat.isDirectory()) {
    if (ancestors.has(physical)) throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_DEPENDENCIES_INVALID: recursive link ${path}`);
    hash.update('directory\0');
    const next = new Set(ancestors).add(physical);
    for (const name of readdirSync(absolute).sort()) updateDependencyFingerprint(hash, root, join(path, name), next, deadline);
    return;
  }
  if (!stat.isFile()) throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_DEPENDENCIES_INVALID: ${path}`);
  hash.update('file\0');
}

function dependencyFingerprint(sourceRoot: string, deadline: number): string {
  const root = dependencyRoot(sourceRoot);
  const hash = createHash('sha256');
  for (const name of readdirSync(root).sort()) {
    if (name !== 'node_modules') updateDependencyFingerprint(hash, root, name, new Set([root]), deadline);
  }
  return hash.digest('hex');
}

function copyDependencies(sourceRoot: string, targetRoot: string, deadline: number): void {
  const root = dependencyRoot(sourceRoot);
  const recursiveLink = join(root, 'node_modules');
  cpSync(root, join(targetRoot, 'node_modules'), {
    recursive: true,
    dereference: true,
    errorOnExist: true,
    mode: constants.COPYFILE_FICLONE,
    filter: source => { assertBeforeDeadline(deadline); return source !== recursiveLink; },
  });
}

export function createOmdRuntimeSnapshot(options: OmdRuntimeSnapshotOptions): OmdRuntimeSnapshot {
  const sourceRoot = resolve(options.sourceRoot);
  const deadline = Date.now() + SNAPSHOT_DEADLINE_MS;
  let lastMismatch = '';
  for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt += 1) {
    const before = runtimeDigest(sourceRoot, deadline);
    const snapshotRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-'));
    let retained = false;
    try {
      copyRuntime(sourceRoot, snapshotRoot, deadline);
      const copied = runtimeDigest(snapshotRoot, deadline);
      let dependencyBefore = 'none';
      let dependencyAfter = 'none';
      if (before === copied && options.dependencyRoot !== null) {
        if (!existsSync(options.dependencyRoot)) throw new OmdRuntimeSnapshotError('OMD_RUNTIME_DEPENDENCIES_INVALID');
        dependencyBefore = dependencyFingerprint(options.dependencyRoot, deadline);
        copyDependencies(options.dependencyRoot, snapshotRoot, deadline);
        dependencyAfter = dependencyFingerprint(options.dependencyRoot, deadline);
      }
      const after = runtimeDigest(sourceRoot, deadline);
      if (before === copied && copied === after && dependencyBefore === dependencyAfter) {
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
      lastMismatch = `attempt ${attempt}: source=${before}/${copied}/${after}; dependencies=${dependencyBefore}/${dependencyAfter}`;
    } finally {
      if (!retained) rmSync(snapshotRoot, { recursive: true, force: true });
    }
  }
  throw new OmdRuntimeSnapshotError(`OMD_RUNTIME_SOURCE_UNSTABLE: ${lastMismatch}`);
}
