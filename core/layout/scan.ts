import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { authorizedFigmaCleanupEntries } from '../figma/artifact-authority.ts';
import { ARTIFACT_FAMILIES, RETIRED_ROOT_SCRATCH, classifyArtifact, type ArtifactClass } from './index.ts';

export type ScannedEntry = {
  readonly path: string;
  readonly bytes: number;
};

export type ProjectScan = {
  readonly byClass: Readonly<Record<ArtifactClass, { readonly files: number; readonly bytes: number }>>;
  readonly unclassified: readonly ScannedEntry[];
  readonly cleanable: readonly ScannedEntry[];
  readonly retired: readonly ScannedEntry[];
  readonly orphanRecords: readonly ScannedEntry[];
  readonly totalFiles: number;
  readonly totalBytes: number;
};

/** Directories whose members are named by their own content digest. */
const RECORD_DIRECTORIES: readonly string[] = [
  'intent-runs',
  'art-direction-runs',
  'evaluator-results',
  'pre-reference-selections',
  'settled-reference-selections',
  'motion-resolutions',
  'task-evidence-runs',
  'final-evidence-v2-runs',
];

const DIGEST = /[a-f0-9]{64}/g;
const RECORD_NAME = /^sha256-([a-f0-9]{64})\.json$/;

function walk(root: string, current = root, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(current);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(current, name);
    let stats;
    try {
      stats = lstatSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory() && !stats.isSymbolicLink()) walk(root, full, out);
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

const isRecordPath = (path: string): boolean =>
  RECORD_DIRECTORIES.some((dir) => path.startsWith(`${dir}/`)) && RECORD_NAME.test(path.slice(path.lastIndexOf('/') + 1));

/**
 * Which content-addressed records nothing points at any more.
 *
 * Reachability is deliberately conservative and textual: a record is retained when its digest
 * appears in any file that is not itself an unreachable record, and the closure is iterated so a
 * reachable record keeps the records it names. Deleting an audit record that something still
 * cites is unrecoverable; keeping one file too many is not.
 */
export function orphanRecords(omdRoot: string, files: readonly string[]): readonly string[] {
  const records = files.filter(isRecordPath);
  if (records.length === 0) return [];
  const digestOf = new Map<string, string>();
  for (const path of records) {
    const match = RECORD_NAME.exec(path.slice(path.lastIndexOf('/') + 1));
    const digest = match?.[1];
    if (digest !== undefined) digestOf.set(path, digest);
  }

  const reachable = new Set<string>();
  const readDigests = (path: string): readonly string[] => {
    try {
      const body = readFileSync(join(omdRoot, path), 'utf8');
      return body.match(DIGEST) ?? [];
    } catch {
      return [];
    }
  };

  const live = new Set<string>();
  for (const path of files) {
    if (isRecordPath(path)) continue;
    for (const digest of readDigests(path)) live.add(digest);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const path of records) {
      if (reachable.has(path)) continue;
      const digest = digestOf.get(path);
      if (digest === undefined || !live.has(digest)) continue;
      reachable.add(path);
      for (const nested of readDigests(path)) {
        if (!live.has(nested)) {
          live.add(nested);
          changed = true;
        }
      }
      changed = true;
    }
  }
  return records.filter((path) => !reachable.has(path));
}

/**
 * Cache is disposable only while nothing durable points into it. Task and final evidence record
 * the render/probe paths they validated, and several of those live under `.omd/.cache/`; deleting
 * a cited capture turns a passing publication into an unverifiable one. So a cache file whose path
 * is named by any non-cache record is retained even though its family is cleanable.
 */
function citedDerivedPaths(omdRoot: string, files: readonly string[]): ReadonlySet<string> {
  const cited = new Set<string>();
  const candidates = files.filter((path) => path.startsWith('.cache/') || /^figma\/(exports|renders)\//.test(path));
  if (candidates.length === 0) return cited;
  for (const path of files) {
    if (candidates.includes(path)) continue;
    let body: string;
    try {
      body = readFileSync(join(omdRoot, path), 'utf8');
    } catch {
      continue;
    }
    for (const candidate of candidates) {
      if (cited.has(candidate)) continue;
      if (body.includes(candidate)) cited.add(candidate);
    }
  }
  return cited;
}

export function scanProject(root: string): ProjectScan {
  const omdRoot = join(root, '.omd');
  const files = walk(omdRoot);
  const cited = citedDerivedPaths(omdRoot, files);
  const byClass: Record<ArtifactClass, { files: number; bytes: number }> = {
    human: { files: 0, bytes: 0 },
    refs: { files: 0, bytes: 0 },
    state: { files: 0, bytes: 0 },
    cache: { files: 0, bytes: 0 },
  };
  const unclassified: ScannedEntry[] = [];
  const cleanable: ScannedEntry[] = [];
  const retired: ScannedEntry[] = [];
  let totalBytes = 0;

  const sizeOf = (path: string): number => {
    try {
      return lstatSync(join(omdRoot, path)).size;
    } catch {
      return 0;
    }
  };

  for (const path of files) {
    const bytes = sizeOf(path);
    totalBytes += bytes;
    const isRetired = RETIRED_ROOT_SCRATCH.some((entry) => path === entry || path.startsWith(`${entry}/`));
    if (isRetired) {
      retired.push({ path, bytes });
      continue;
    }
    const family = classifyArtifact(path);
    if (family === undefined) {
      unclassified.push({ path, bytes });
      continue;
    }
    byClass[family.cls].files += 1;
    byClass[family.cls].bytes += bytes;
    if (family.cleanable === true && !cited.has(path)) cleanable.push({ path, bytes });
  }

  for (const entry of authorizedFigmaCleanupEntries(root, cited)) {
    if (!cleanable.some((candidate) => candidate.path === entry.path)) cleanable.push(entry);
  }
  const orphans = orphanRecords(omdRoot, files).map((path) => ({ path, bytes: sizeOf(path) }));

  return {
    byClass,
    unclassified,
    cleanable,
    retired,
    orphanRecords: orphans,
    totalFiles: files.length,
    totalBytes,
  };
}

export function citedFigmaArtifactPaths(root: string): ReadonlySet<string> {
  const omdRoot = join(root, '.omd');
  return citedDerivedPaths(omdRoot, walk(omdRoot));
}

export const HUMAN_ARTIFACT_PATHS: readonly string[] = ARTIFACT_FAMILIES
  .filter((entry) => entry.cls === 'human')
  .map((entry) => entry.path);
