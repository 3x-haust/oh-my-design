import { lstatSync, readlinkSync, readdirSync, realpathSync, type Stats } from 'node:fs';
import { isAbsolute, join, posix, resolve } from 'node:path';

export const FIXED_DERIVED_PROJECT_ROOTS = Object.freeze(['dist', 'node_modules'] as const);
export type FixedDerivedProjectRoot = (typeof FIXED_DERIVED_PROJECT_ROOTS)[number];

type DerivedEntry = Readonly<{ kind: 'directory' | 'file' | 'symlink'; target?: string }>;

function sameDirectory(left: Stats, right: Stats): boolean {
  return left.isDirectory() && right.isDirectory() && !left.isSymbolicLink() && !right.isSymbolicLink()
    && left.dev === right.dev && left.ino === right.ino
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export function fixedDerivedProjectRoot(path: string): FixedDerivedProjectRoot | undefined {
  const root = path.split('/')[0];
  return FIXED_DERIVED_PROJECT_ROOTS.find((candidate) => candidate === root);
}

export function isFixedDerivedProjectPath(path: string): boolean {
  return fixedDerivedProjectRoot(path) !== undefined;
}

/** Resolves only npm's direct `.bin` links and never permits them to leave `node_modules`. */
export function npmBinLinkTarget(path: string, target: string): string | undefined {
  if (!/^node_modules\/\.bin\/[^/]+$/.test(path) || target === '' || target.includes('\0')
    || target.includes('\\') || isAbsolute(target)) return undefined;
  const resolved = posix.normalize(posix.join(posix.dirname(path), target));
  if (!resolved.startsWith('node_modules/') || resolved.startsWith('node_modules/.bin/')) return undefined;
  return resolved;
}

function validateLink(path: string, target: string, entries: ReadonlyMap<string, DerivedEntry>): void {
  const resolved = npmBinLinkTarget(path, target);
  if (resolved === undefined || entries.get(resolved)?.kind !== 'file') {
    throw new Error(`derived project tree contains an unsafe symlink: ${path}`);
  }
  let ancestor = posix.dirname(resolved);
  while (ancestor !== 'node_modules') {
    if (entries.get(ancestor)?.kind !== 'directory') {
      throw new Error(`derived project tree contains an unsafe symlink target: ${path}`);
    }
    ancestor = posix.dirname(ancestor);
  }
}

/**
 * Validates a fixed derived tree without following links or trusting project ignore files.
 * `dist` is link-free because its exact served bytes are revalidated downstream; npm's
 * conventional relative `.bin` links are the sole dependency-tree link exception.
 */
export function validateFixedDerivedProjectRoot(
  projectRoot: string,
  rootName: FixedDerivedProjectRoot,
): void {
  const absoluteRoot = resolve(projectRoot, rootName);
  const rootStat = lstatSync(absoluteRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || realpathSync(absoluteRoot) !== absoluteRoot) {
    throw new Error(`derived project root must be a real directory: ${rootName}`);
  }
  const entries = new Map<string, DerivedEntry>([[rootName, Object.freeze({ kind: 'directory' })]]);
  const links: Array<Readonly<{ path: string; target: string }>> = [];
  const walk = (directory: string, relativeDirectory: string): void => {
    const before = lstatSync(directory);
    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new Error(`derived project tree contains an unsafe directory: ${relativeDirectory}`);
    }
    const names = readdirSync(directory).sort((left, right) => left.localeCompare(right, 'en'));
    for (const name of names) {
      if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
        throw new Error(`derived project tree contains an unsafe entry: ${relativeDirectory}`);
      }
      const path = `${relativeDirectory}/${name}`;
      const absolute = join(directory, name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(absolute);
        entries.set(path, Object.freeze({ kind: 'symlink', target }));
        links.push(Object.freeze({ path, target }));
      } else if (stat.isDirectory()) {
        entries.set(path, Object.freeze({ kind: 'directory' }));
        walk(absolute, path);
      } else if (stat.isFile()) {
        entries.set(path, Object.freeze({ kind: 'file' }));
      } else {
        throw new Error(`derived project tree contains a special entry: ${path}`);
      }
    }
    const afterNames = readdirSync(directory).sort((left, right) => left.localeCompare(right, 'en'));
    const after = lstatSync(directory);
    if (names.length !== afterNames.length || names.some((name, index) => name !== afterNames[index])
      || !sameDirectory(before, after)) {
      throw new Error(`derived project tree changed while it was validated: ${relativeDirectory}`);
    }
  };
  walk(absoluteRoot, rootName);
  for (const link of links) {
    if (rootName !== 'node_modules') {
      throw new Error(`derived project tree contains an unsafe symlink: ${link.path}`);
    }
    validateLink(link.path, link.target, entries);
  }
}

/** Validates every present fixed root, including dangling root links that `existsSync` misses. */
export function validateFixedDerivedProjectRoots(projectRoot: string): void {
  for (const rootName of FIXED_DERIVED_PROJECT_ROOTS) {
    try { lstatSync(resolve(projectRoot, rootName)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    validateFixedDerivedProjectRoot(projectRoot, rootName);
  }
}
