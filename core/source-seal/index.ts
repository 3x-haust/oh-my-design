import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

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

export function listProductionSourceFiles(rootInput: string): string[] {
  const root = resolve(rootInput);
  const files: string[] = [];
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || EXCLUDED_FILES.has(entry.name.toLowerCase())) continue;
      if (!SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
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
    values[key] = hashBytes(readFileSync(path));
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
      sha256: hashBytes(readFileSync(join(root, path))),
    })),
  };
}

export function writeSourceSeal(rootInput: string): string {
  const root = resolve(rootInput);
  const path = join(root, '.omd', 'source-seal.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(createSourceSeal(root), null, 2)}\n`);
  return path;
}

export function validateSourceSeal(rootInput: string): SourceSealFinding[] {
  const root = resolve(rootInput);
  const path = join(root, '.omd', 'source-seal.json');
  if (!existsSync(path)) {
    return [{ id: 'SOURCE-SEAL-MISSING', path: '.omd/source-seal.json', message: 'source seal is missing' }];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return [{ id: 'SOURCE-SEAL-STALE', path: '.omd/source-seal.json', message: 'source seal is not valid JSON' }];
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
