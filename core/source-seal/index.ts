import { createHash } from 'node:crypto';
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { replaceProjectFileAtomically } from '../runtime/project-write.ts';

export const SOURCE_SEAL_SCHEMA_VERSION = 1;

const SOURCE_EXTENSIONS = new Set([
  '.astro', '.cjs', '.css', '.gif', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json',
  '.jsx', '.less', '.mjs', '.otf', '.png', '.sass', '.scss', '.svg', '.svelte', '.ts',
  '.tsx', '.ttf', '.vue', '.wasm', '.webp', '.woff', '.woff2',
]);

const EXCLUDED_DIRECTORIES = new Set([
  '.cache', '.git', '.next', '.nuxt', '.omd', '.output', '.svelte-kit',
  '__tests__', 'build', 'cache', 'coverage', 'dist', 'e2e', 'generated',
  'node_modules', 'out', 'temp', 'test', 'tests', 'tmp', 'vendor',
]);

const EXCLUDED_FILES = new Set([
  'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json', 'package-lock.json', 'pnpm-lock.yaml',
  'yarn.lock',
]);

export interface SourceSealArtifact {
  schemaVersion: 1;
  sealedAt: string;
  inputs: {
    copyDeckSha256: string;
    typeProofSha256: string;
    compositionSha256: string;
  };
  sources: Array<{ path: string; sha256: string }>;
}

export interface SourceSealFinding {
  id: 'SOURCE-SEAL-MISSING' | 'SOURCE-SEAL-STALE';
  path: string;
  message: string;
}

const hashBytes = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
const slash = (path: string): string => path.split(sep).join('/');
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeSourcePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) return false;
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isSourceSealArtifact(value: unknown): value is SourceSealArtifact {
  if (!isRecord(value) || value.schemaVersion !== SOURCE_SEAL_SCHEMA_VERSION || typeof value.sealedAt !== 'string') return false;
  if (!isRecord(value.inputs) || !Array.isArray(value.sources)) return false;
  for (const key of ['copyDeckSha256', 'typeProofSha256', 'compositionSha256'] as const) {
    if (typeof value.inputs[key] !== 'string' || !SHA256_PATTERN.test(value.inputs[key])) return false;
  }
  return value.sources.every((item) => (
    isRecord(item)
    && isSafeSourcePath(item.path)
    && typeof item.sha256 === 'string'
    && SHA256_PATTERN.test(item.sha256)
  ));
}

function requireRealSourcePath(root: string, path: string, leaf: 'file' | 'directory'): void {
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`source root must be a non-symlink directory: ${root}`);
  }
  const relativePath = relative(root, path);
  if (relativePath.startsWith('..') || resolve(root, relativePath) !== path) {
    throw new Error(`source path escapes root: ${path}`);
  }
  if (relativePath === '') return;
  let current = root;
  const segments = relativePath.split('/');
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (index === segments.length - 1
      ? leaf === 'file' ? !stat.isFile() : !stat.isDirectory()
      : !stat.isDirectory())) {
      throw new Error(`source path must not contain symlinks or non-${index === segments.length - 1 ? leaf : 'directory'} entries: ${slash(relative(root, current))}`);
    }
  }
}
function readStableSourceFile(root: string, path: string): Buffer {
  requireRealSourcePath(root, path, 'file');
  const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    const entry = lstatSync(path);
    if (!opened.isFile() || entry.isSymbolicLink() || !entry.isFile()
      || opened.dev !== entry.dev || opened.ino !== entry.ino) {
      throw new Error(`source file changed or is not a regular non-symlink file: ${slash(relative(root, path))}`);
    }
    const bytes = readFileSync(descriptor);
    const current = lstatSync(path);
    if (current.isSymbolicLink() || !current.isFile()
      || opened.dev !== current.dev || opened.ino !== current.ino) {
      throw new Error(`source file changed while reading: ${slash(relative(root, path))}`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}
export function listProductionSourceFiles(rootInput: string): string[] {
  const root = resolve(rootInput);
  requireRealSourcePath(root, root, 'directory');
  const files: string[] = [];
  const walk = (directory: string): void => {
    requireRealSourcePath(root, directory, 'directory');
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`source production tree contains a symlink: ${slash(relative(root, absolute))}`);
      }
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || EXCLUDED_FILES.has(entry.name.toLowerCase())) continue;
      if (!SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      requireRealSourcePath(root, absolute, 'file');
      files.push(slash(relative(root, absolute)));
    }
  };
  walk(root);
  return files.sort();
}

function inputHashes(root: string): SourceSealArtifact['inputs'] {
  const omd = join(root, '.omd');
  const required = [
    ['copyDeckSha256', 'copy-deck.md'],
    ['typeProofSha256', 'type-proof.md'],
    ['compositionSha256', 'composition.md'],
  ] as const;
  const values: Partial<SourceSealArtifact['inputs']> = {};
  for (const [key, filename] of required) {
    const path = join(omd, filename);
    if (!existsSync(path)) throw new Error(`cannot seal source: missing .omd/${filename}`);
    requireRealSourcePath(root, path, 'file');
    values[key] = hashBytes(readStableSourceFile(root, path));
  }
  return values as SourceSealArtifact['inputs'];
}

export function createSourceSeal(rootInput: string, sealedAt = new Date().toISOString()): SourceSealArtifact {
  const root = resolve(rootInput);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`source root must be a non-symlink directory: ${root}`);
  return {
    schemaVersion: SOURCE_SEAL_SCHEMA_VERSION,
    sealedAt,
    inputs: inputHashes(root),
    sources: listProductionSourceFiles(root).map((path) => ({
      path,
      sha256: hashBytes(readStableSourceFile(root, join(root, path))),
    })),
  };
}

export function writeSourceSeal(rootInput: string, invocation: ProjectRunInvocation): string {
  const root = resolve(rootInput);
  return replaceProjectFileAtomically({
    projectRoot: root,
    relativePath: '.omd/source-seal.json',
    content: `${JSON.stringify(createSourceSeal(root), null, 2)}\n`,
    invocation,
  });
}

export function validateSourceSeal(rootInput: string): SourceSealFinding[] {
  const root = resolve(rootInput);
  const path = join(root, '.omd', 'source-seal.json');
  if (!existsSync(path)) {
    return [{ id: 'SOURCE-SEAL-MISSING', path: '.omd/source-seal.json', message: 'source seal is missing' }];
  }

  let parsed: unknown;
  try {
    requireRealSourcePath(root, path, 'file');
    parsed = JSON.parse(readStableSourceFile(root, path).toString('utf8')) as unknown;
  } catch {
    return [{ id: 'SOURCE-SEAL-STALE', path: '.omd/source-seal.json', message: 'source seal is not a real regular JSON file' }];
  }
  if (!isSourceSealArtifact(parsed)) {
    return [{ id: 'SOURCE-SEAL-STALE', path: '.omd/source-seal.json', message: 'source seal schema is invalid' }];
  }
  const sealed = parsed;

  let current: SourceSealArtifact;
  try {
    current = createSourceSeal(root, sealed.sealedAt);
  } catch (error) {
    return [{ id: 'SOURCE-SEAL-STALE', path: '.omd/source-seal.json', message: error instanceof Error ? error.message : String(error) }];
  }
  const findings: SourceSealFinding[] = [];
  for (const [key, filename] of [
    ['copyDeckSha256', 'copy-deck.md'],
    ['typeProofSha256', 'type-proof.md'],
    ['compositionSha256', 'composition.md'],
  ] as const) {
    if (sealed.inputs[key] !== current.inputs[key]) {
      findings.push({ id: 'SOURCE-SEAL-STALE', path: `.omd/${filename}`, message: `${filename} changed after source seal` });
    }
  }

  const sealedSources = new Map(sealed.sources.map((item) => [item.path, item.sha256]));
  const currentSources = new Map(current.sources.map((item) => [item.path, item.sha256]));
  for (const sourcePath of [...new Set([...sealedSources.keys(), ...currentSources.keys()])].sort()) {
    if (sealedSources.get(sourcePath) !== currentSources.get(sourcePath)) {
      findings.push({ id: 'SOURCE-SEAL-STALE', path: sourcePath, message: `${sourcePath} was added, removed, or changed after source seal` });
    }
  }
  return findings.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
