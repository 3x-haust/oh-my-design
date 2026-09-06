import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CANDIDATE_SELECTION_POINTER_SCHEMA = 'candidate-selection-pointer-v1' as const;
export const CANDIDATE_SELECTION_POINTER_PATH = '.omd/.cache/sketches/current.json' as const;
export const CANDIDATE_EVIDENCE_FILES = Object.freeze([
  'index.html',
  'noun-swap-test.json',
  'selection.json',
  'ux-models.json',
] as const);

export type CandidateSelectionPointer = Readonly<{
  schema: typeof CANDIDATE_SELECTION_POINTER_SCHEMA;
  directory: string;
  indexSha256: string;
  selectionSha256: string;
}>;

const KEYS = new Set(['schema', 'directory', 'indexSha256', 'selectionSha256']);
const SHA256 = /^[a-f0-9]{64}$/;
const DIRECTORY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateCandidateSelectionPointer(input: unknown): CandidateSelectionPointer {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('CANDIDATE_SELECTION_POINTER_INVALID');
  }
  const value = input as Record<string, unknown>;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== KEYS.size
    || keys.some((key) => typeof key !== 'string' || !KEYS.has(key))
    || value.schema !== CANDIDATE_SELECTION_POINTER_SCHEMA
    || typeof value.directory !== 'string'
    || !DIRECTORY.test(value.directory)
    || typeof value.indexSha256 !== 'string'
    || !SHA256.test(value.indexSha256)
    || typeof value.selectionSha256 !== 'string'
    || !SHA256.test(value.selectionSha256)
  ) {
    throw new Error('CANDIDATE_SELECTION_POINTER_INVALID');
  }
  return Object.freeze({
    schema: CANDIDATE_SELECTION_POINTER_SCHEMA,
    directory: value.directory,
    indexSha256: value.indexSha256,
    selectionSha256: value.selectionSha256,
  });
}

const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

export function resolveCandidateSelection(
  projectRoot: string,
  pointer: CandidateSelectionPointer,
): readonly string[] {
  const directory = join(projectRoot, '.omd', '.cache', 'sketches', pointer.directory);
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('CANDIDATE_SELECTION_DIRECTORY_INVALID');
  }
  const paths = CANDIDATE_EVIDENCE_FILES.map(
    (name) => `.omd/.cache/sketches/${pointer.directory}/${name}`,
  );
  for (const path of paths) {
    const stat = lstatSync(join(projectRoot, path));
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('CANDIDATE_SELECTION_EVIDENCE_INVALID');
    }
  }
  if (
    sha256(join(directory, 'index.html')) !== pointer.indexSha256
    || sha256(join(directory, 'selection.json')) !== pointer.selectionSha256
  ) {
    throw new Error('CANDIDATE_SELECTION_STALE');
  }
  return Object.freeze(paths);
}
