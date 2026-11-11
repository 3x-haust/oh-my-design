import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { put, THIN_ARCHIVE, THIN_BASELINE, ThinError } from './state.ts';

/**
 * A cycle restarts from the state the project had before cycle 1: the baseline. Archiving a cycle moves every file it
 * added or changed into .omd/thin/archive/cycle-<n>/ (never deleted) and puts the baseline back, so the next cycle cannot
 * read the previous composition. Surviving assets, package scaffolding and tool folders stay where they are.
 */
const IGNORED_ANYWHERE = new Set(['.git', '.omd', '.omc', 'node_modules', '.DS_Store']);
const IGNORED_AT_ROOT = new Set(['dist', 'build', 'out', '.vite', '.next', '.turbo', 'coverage', '.cache']);
const SCAFFOLD = [/^package\.json$/, /^package-lock\.json$/, /^pnpm-lock\.yaml$/, /^yarn\.lock$/, /^bun\.lockb?$/, /^tsconfig(?:\.[\w-]+)?\.json$/,
  /^vite\.config\.[cm]?[jt]s$/, /^\.gitignore$/, /^\.npmrc$/, /^\.nvmrc$/, /^eslint\.config\.[cm]?[jt]s$/];
/** Files larger than this are fingerprinted but not copied into the baseline. */
const MAX_STORED_BYTES = 20 * 1024 * 1024;

type BaselineManifest = { schema: 'omd-thin-baseline-v1'; files: Record<string, { sha256: string; stored: boolean }>; dirs: string[] };
export type ArchiveSummary = { dir: string; archived: string[]; restored: string[]; removed: string[]; unrestorable: string[] };

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
const posix = (path: string): string => path.split(sep).join('/');

function walk(root: string): { files: string[]; dirs: string[] } {
  const files: string[] = [];
  const dirs: string[] = [];
  const visit = (relativeDir: string): void => {
    for (const entry of readdirSync(join(root, relativeDir), { withFileTypes: true })) {
      if (IGNORED_ANYWHERE.has(entry.name) || (relativeDir === '' && IGNORED_AT_ROOT.has(entry.name))) continue;
      const path = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) { dirs.push(path); visit(path); } else if (entry.isFile()) files.push(path);
    }
  };
  visit('');
  return { files: files.sort(), dirs: dirs.sort() };
}

/** A path inside the project, in project-relative posix form, or an error naming it. */
export function projectRelative(root: string, path: string): string {
  const absolute = resolve(root, path);
  const relativePath = posix(relative(resolve(root), absolute));
  if (!relativePath || relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
    throw new ThinError(`${path} is not inside the project`);
  }
  return posix(normalize(relativePath));
}

const kept = (path: string, survivors: readonly string[]): boolean => SCAFFOLD.some(pattern => pattern.test(path))
  || survivors.some(survivor => path === survivor || path.startsWith(`${survivor}/`));

export function snapshotBaseline(writer: ProjectWriteAdapter): { files: number } {
  const root = writer.projectRoot;
  if (existsSync(join(root, THIN_BASELINE, 'manifest.json'))) return { files: Object.keys(readBaseline(root).files).length };
  const { files, dirs } = walk(root);
  const manifest: BaselineManifest = { schema: 'omd-thin-baseline-v1', files: {}, dirs };
  for (const file of files) {
    const stored = statSync(join(root, file)).size <= MAX_STORED_BYTES;
    manifest.files[file] = { sha256: sha256(join(root, file)), stored };
    if (stored) put(writer, `${THIN_BASELINE}/files/${file}`, readFileSync(join(root, file)));
  }
  put(writer, `${THIN_BASELINE}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return { files: files.length };
}

function readBaseline(root: string): BaselineManifest {
  const path = join(root, THIN_BASELINE, 'manifest.json');
  if (!existsSync(path)) throw new ThinError(`${THIN_BASELINE}/manifest.json is missing; the starting state was never recorded`);
  return JSON.parse(readFileSync(path, 'utf8')) as BaselineManifest;
}

/** What archiving now would move out of the tree (added or changed since the baseline) and put back (deleted since). */
export function plannedArchive(root: string, survivors: readonly string[]): { changed: string[]; deleted: string[] } {
  const baseline = readBaseline(root);
  const { files } = walk(root);
  const present = new Set(files);
  const changed = files.filter(file => !kept(file, survivors)
    && (baseline.files[file] === undefined || baseline.files[file]!.sha256 !== sha256(join(root, file))));
  const deleted = Object.keys(baseline.files).filter(file => !present.has(file) && !kept(file, survivors));
  return { changed, deleted };
}

export function archiveCycle(writer: ProjectWriteAdapter, cycle: number, survivors: readonly string[]): ArchiveSummary {
  const root = writer.projectRoot;
  const baseline = readBaseline(root);
  const { changed, deleted } = plannedArchive(root, survivors);
  let name = `cycle-${cycle}`;
  for (let suffix = 2; existsSync(join(root, THIN_ARCHIVE, name)); suffix += 1) name = `cycle-${cycle}-${suffix}`;
  const dir = `${THIN_ARCHIVE}/${name}`;
  const summary: ArchiveSummary = { dir, archived: [], restored: [], removed: [], unrestorable: [] };
  const restore = (file: string): boolean => {
    const source = join(root, THIN_BASELINE, 'files', file);
    if (!baseline.files[file]?.stored || !existsSync(source)) return false;
    put(writer, file, readFileSync(source));
    return true;
  };
  for (const file of changed) {
    put(writer, `${dir}/files/${file}`, readFileSync(join(root, file)));
    summary.archived.push(file);
    if (baseline.files[file] === undefined) { writer.remove(file); summary.removed.push(file); }
    else if (restore(file)) summary.restored.push(file);
    else summary.unrestorable.push(file);
  }
  for (const file of deleted) {
    if (restore(file)) summary.restored.push(file); else summary.unrestorable.push(file);
  }
  const baselineDirs = new Set(baseline.dirs);
  for (const directory of walk(root).dirs.reverse()) {
    const absolute = join(root, directory);
    if (!baselineDirs.has(directory) && lstatSync(absolute).isDirectory() && readdirSync(absolute).length === 0) writer.removeEmptyDirectory(directory);
  }
  put(writer, `${dir}/manifest.json`, `${JSON.stringify({ schema: 'omd-thin-archive-v1', cycle, survivors, ...summary }, null, 2)}\n`);
  return summary;
}

/** The latest archive holding a cycle's work, or null. */
export function findArchivedCycle(root: string, cycle: number): string | null {
  const base = join(root, THIN_ARCHIVE);
  const suffix = (name: string): number => name === `cycle-${cycle}` ? 1
    : /^-\d+$/.test(name.slice(`cycle-${cycle}`.length)) ? Number(name.slice(`cycle-${cycle}-`.length)) : 0;
  const latest = (existsSync(base) ? readdirSync(base) : [])
    .filter(name => suffix(name) > 0 && existsSync(join(base, name, 'manifest.json')))
    .sort((a, b) => suffix(a) - suffix(b))
    .at(-1);
  return latest === undefined ? null : `${THIN_ARCHIVE}/${latest}`;
}

/**
 * Put an archived cycle's work back over the starting state: its files where they were, and the starting files it had
 * deleted removed again. The archive itself stays.
 */
export function restoreArchive(writer: ProjectWriteAdapter, dir: string): string[] {
  const root = writer.projectRoot;
  const summary = JSON.parse(readFileSync(join(root, dir, 'manifest.json'), 'utf8')) as ArchiveSummary;
  for (const file of summary.archived) put(writer, file, readFileSync(join(root, dir, 'files', file)));
  const archived = new Set(summary.archived);
  for (const file of summary.restored) if (!archived.has(file) && existsSync(join(root, file))) writer.remove(file);
  return summary.archived;
}
