import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ReferenceUsageValidationError } from './reference-usage-parser.ts';

const prohibitedEvidenceRoots = new Set(['.git', '.omd', '.omo', 'coverage', 'dist', 'node_modules', 'test', 'tests']);
const productionExtensions = new Set(['.astro', '.css', '.go', '.html', '.js', '.jsx', '.mjs', '.mts', '.php', '.py', '.rb', '.rs', '.scss', '.svelte', '.ts', '.tsx', '.vue']);

export type ReferenceUsageFileIdentity = {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
};
export type ReferenceUsageFileSnapshot = { readonly bytes: Buffer; readonly identity: ReferenceUsageFileIdentity };

const fail = (reason: string): never => { throw new ReferenceUsageValidationError(reason); };
const inside = (parent: string, child: string): boolean => {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};
const code = (error: unknown, expected: string): boolean => error instanceof Error && 'code' in error && error.code === expected;
const rootDirectory = (rootInput: string): string => {
  const root = resolve(rootInput); const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return fail('project root must be a real directory');
  return realpathSync(root);
};
const identity = (path: string): ReferenceUsageFileIdentity => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) return fail('trusted snapshot target must be a regular non-symlink file');
  return { path, dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
};

export const trustedReferenceUsageFile = (rootInput: string, projectRelativePath: string, label: string): string => {
  if (projectRelativePath.includes('\\') || projectRelativePath.startsWith('/') || projectRelativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) return fail(`${label} must use a safe project-relative path`);
  const root = rootDirectory(rootInput); const parts = projectRelativePath.split('/'); const absolute = resolve(root, ...parts);
  if (!inside(root, absolute)) return fail(`${label} must remain inside the project`);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part); const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return fail(`${label} must not use a symlink`);
    if (index === parts.length - 1) {
      if (!stat.isFile()) return fail(`${label} must be a regular file`);
    } else if (!stat.isDirectory()) return fail(`${label} must have regular parent directories`);
    if (!inside(root, realpathSync(current))) return fail(`${label} must remain inside the project`);
  }
  return current;
};

export const sameReferenceUsageSnapshot = (left: ReferenceUsageFileSnapshot, right: ReferenceUsageFileSnapshot): boolean => {
  const a = left.identity; const b = right.identity;
  return a.path === b.path && a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && left.bytes.equals(right.bytes);
};

export const readTrustedReferenceUsageSnapshot = (root: string, path: string, label: string): ReferenceUsageFileSnapshot => {
  const beforePath = trustedReferenceUsageFile(root, path, label); const before = identity(beforePath); const bytes = readFileSync(beforePath);
  const afterPath = trustedReferenceUsageFile(root, path, label); const after = identity(afterPath);
  if (beforePath !== afterPath || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length !== after.size) return fail(`${label} changed while it was read`);
  return { bytes, identity: after };
};

export function trustedProductionEvidencePath(root: string, path: string): string {
  const first = path.split('/')[0];
  if (first === undefined || prohibitedEvidenceRoots.has(first) || !productionExtensions.has(extname(path).toLowerCase())) return fail('evidence.path must name a project-local production source file');
  return trustedReferenceUsageFile(root, path, 'production evidence');
}

export const readTrustedProductionEvidence = (root: string, path: string): ReferenceUsageFileSnapshot => {
  trustedProductionEvidencePath(root, path);
  return readTrustedReferenceUsageSnapshot(root, path, 'production evidence');
};

export const writeReferenceUsageRecord = (root: string, filename: string, body: string, label: string): void => {
  const omd = dirname(trustedReferenceUsageFile(root, '.omd/reference-board.json', 'reference board')); const target = join(omd, filename);
  const existing = (() => { try { return lstatSync(target); } catch (error) { if (code(error, 'ENOENT')) return undefined; throw error; } })();
  if (existing !== undefined && (existing.isSymbolicLink() || !existing.isFile())) fail(`${label} target must be a regular non-symlink file`);
  const temporary = join(omd, `.${filename}.${randomUUID()}.tmp`);
  try { writeFileSync(temporary, body, { flag: 'wx' }); renameSync(temporary, target); } finally { rmSync(temporary, { force: true }); }
};
