import { closeSync, constants, lstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ArtifactClass = 'static-instance' | 'schema' | 'vector' | 'docs' | 'source' | 'raw-evidence';
export interface ArtifactClassification { path: string; class: ArtifactClass; }
export interface TypedExclusion { path: string; kind: 'file' | 'directory'; }
export interface MembershipSpec {
  schemaVersion: string;
  externalFiles?: string[];
  roots: string[];
  exclusions?: TypedExclusion[];
  requiredPaths?: string[];
  lockOutputPath: string;
  artifacts?: ArtifactClassification[];
}
export interface MemberFile { path: string; byteLength: number; mediaType: string; mode: number; sha256: string; }

const forbiddenDigestKeys = new Set(['bundleLockFileSha256', 'manifestSetSha256']);
const artifactClasses = new Set<ArtifactClass>(['static-instance', 'schema', 'vector', 'docs', 'source', 'raw-evidence']);

/** RFC8785-compatible canonicalization for JSON values accepted by this contract. */
export function canonicalJson(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON rejects non-finite numbers');
    if (Object.is(value, -0)) return '0';
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, JsonValue>;
  return `{${Object.keys(object).sort((a, b) => byteCompare(a, b)).map(key => `${JSON.stringify(key)}:${canonicalJson(object[key]!)}`).join(',')}}`;
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
export const byteCompare = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

export function validateRepoPath(path: string): string {
  if (typeof path !== 'string' || path.length === 0 || path === '.' || path.includes('\\') || path.includes('\0') || path.startsWith('/')) throw new Error(`unsafe repository path: ${String(path)}`);
  const parts = path.split('/');
  if (parts.some(part => part.length === 0 || part === '.' || part === '..')) throw new Error(`unsafe repository path: ${path}`);
  return path;
}

export function repoPath(root: string, path: string): string {
  validateRepoPath(path);
  const absolute = resolve(root, ...path.split('/'));
  const rel = relative(root, absolute);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`path escapes repository: ${path}`);
  return absolute;
}

export function readRegularNoFollow(path: string): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`not a regular file: ${path}`);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const after = statSync(path);
    if (before.dev !== after.dev || before.ino !== after.ino || !after.isFile()) throw new Error(`file changed while opening: ${path}`);
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

function walk(root: string, relativePath: string, out: string[]): void {
  const absolute = repoPath(root, relativePath);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${relativePath}`);
  if (stat.isFile()) { out.push(relativePath); return; }
  if (!stat.isDirectory()) throw new Error(`special file is forbidden: ${relativePath}`);
  for (const name of readdirSync(absolute).sort(byteCompare)) walk(root, `${relativePath}/${name}`, out);
}

function parseSpec(value: unknown): MembershipSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('membership must be an object');
  const spec = value as MembershipSpec;
  if (!Array.isArray(spec.roots) || !spec.roots.length || typeof spec.lockOutputPath !== 'string') throw new Error('membership requires roots and lockOutputPath');
  return spec;
}

export function readMembership(root: string, membershipPath: string): MembershipSpec {
  const path = repoPath(root, membershipPath);
  return parseSpec(JSON.parse(readRegularNoFollow(path).toString('utf8')));
}

export function mediaType(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.ts')) return 'text/typescript';
  if (path.endsWith('.md')) return 'text/markdown';
  if (path.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function checkForbiddenKeys(bytes: Buffer, path: string): void {
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { return; }
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenDigestKeys.has(key)) throw new Error(`forbidden lock digest key in static instance: ${path}`);
      visit(child);
    }
  };
  visit(parsed);
}

/** Computes X ∪ recursive(R) − exact typed E, with no glob or implicit exclusions. */
export function computeMembership(rootInput: string, spec: MembershipSpec, options: { lockMode?: 'create' | 'validate'; ignoreInode?: { dev: number; ino: number } } = {}): MemberFile[] {
  const root = realpathSync(rootInput);
  const lock = validateRepoPath(spec.lockOutputPath);
  const roots = spec.roots.map(validateRepoPath);
  const external = (spec.externalFiles ?? []).map(validateRepoPath);
  if (!roots.some(entry => lock === entry || lock.startsWith(`${entry}/`))) throw new Error(`lock output is outside membership roots: ${lock}`);
  const exclusions = spec.exclusions ?? [];
  const classifications = new Map<string, ArtifactClass>();
  for (const item of spec.artifacts ?? []) {
    const path = validateRepoPath(item.path);
    if (classifications.has(path)) throw new Error(`duplicate artifact classification: ${path}`);
    if (!artifactClasses.has(item.class)) throw new Error(`unknown artifact classification: ${item.class}`);
    classifications.set(path, item.class);
  }
  const excluded = new Set<string>();
  excluded.add(lock);
  const lockAbsolute = repoPath(root, lock);
  const lockPresent = exists(lockAbsolute);
  if (options.lockMode === 'create' && lockPresent) throw new Error(`lock output exists before creation: ${lock}`);
  if (options.lockMode === 'validate' && !lockPresent) throw new Error(`lock output is required: ${lock}`);
  if (lockPresent) {
    const stat = lstatSync(lockAbsolute);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`lock output is not a regular file: ${lock}`);
  }
  for (const item of exclusions) {
    const path = validateRepoPath(item.path);
    const absolute = repoPath(root, path);
    if (!exists(absolute)) {
      if (path === lock && options.lockMode === 'create') {
        excluded.add(path);
        continue;
      }
      throw new Error(`missing exclusion: ${path}`);
    }
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || (item.kind === 'file' ? !stat.isFile() : !stat.isDirectory())) throw new Error(`exclusion kind mismatch: ${path}`);
    excluded.add(path);
  }
  const candidates = new Map<string, string>();
  const add = (path: string, source: string): void => {
    if ([...excluded].some(exclusion => path === exclusion || path.startsWith(`${exclusion}/`))) return;
    const prior = candidates.get(path);
    if (prior && prior !== source) throw new Error(`membership collision: ${path}`);
    candidates.set(path, source);
  };
  for (const entry of [...new Set(roots)]) {
    const found: string[] = [];
    walk(root, entry, found);
    for (const path of found) add(path, `root:${entry}`);
  }
  for (const entry of [...new Set(external)]) {
    const stat = lstatSync(repoPath(root, entry));
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`external file is not regular: ${entry}`);
    add(entry, `external:${entry}`);
  }
  const members = new Set(candidates.keys());
  for (const path of spec.requiredPaths ?? []) {
    const safe = validateRepoPath(path);
    if (!members.has(safe)) throw new Error(`required path is not a member: ${safe}`);
  }
  const result: MemberFile[] = [];
  for (const path of [...members].sort(byteCompare)) {
    const absolute = repoPath(root, path);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`member is not regular: ${path}`);
    if (options.ignoreInode && stat.dev === options.ignoreInode.dev && stat.ino === options.ignoreInode.ino) continue;
    const bytes = readRegularNoFollow(absolute);
    if (classifications.get(path) === 'static-instance') checkForbiddenKeys(bytes, path);
    result.push({ path, byteLength: bytes.length, mediaType: mediaType(path), mode: stat.mode & 0o777, sha256: sha256(bytes) });
  }
  return result;
}
function exists(path: string): boolean { try { lstatSync(path); return true; } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
export function membershipDigest(entries: MemberFile[]): string { return sha256(canonicalJson(entries as unknown as JsonValue)); }
export function isAdjacentTemp(path: string, output: string): boolean { return dirname(path) === dirname(output) && path.startsWith(`${output}.tmp-`); }
