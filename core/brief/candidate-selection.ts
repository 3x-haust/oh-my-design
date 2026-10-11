import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCandidateVisual, parseCandidateVisual, type CandidateVisualEvidence } from './candidate-visual.ts';
import { parseViewState, type ViewState } from '../render/stateful.ts';
import { checkCandidateSelection, parseCandidatePointerV2, type CandidatePointerV2 } from './candidate-choice.ts';
export { candidateDirectionState, publishCandidateSelection, readCurrentCandidateSelection } from './candidate-choice.ts';

export const CANDIDATE_SELECTION_POINTER_SCHEMA = 'candidate-selection-pointer-v1' as const;
export const CANDIDATE_SELECTION_POINTER_PATH = '.omd/.cache/sketches/current.json' as const;
export const CANDIDATE_EVIDENCE_FILES = Object.freeze([
  'index.html',
  'noun-swap-test.json',
  'selection.json',
  'ux-models.json',
] as const);

export type LegacyCandidateSelectionPointer = Readonly<{
  schema: typeof CANDIDATE_SELECTION_POINTER_SCHEMA | 'candidate-selection-pointer-v2';
  directory: string;
  indexSha256: string;
  selectionSha256: string;
  captureStates?: readonly ViewState[];
  visual?: CandidateVisualEvidence;
}>;

export type CandidateSelectionPointer = LegacyCandidateSelectionPointer | CandidatePointerV2;

const KEYS = new Set(['schema', 'directory', 'indexSha256', 'selectionSha256']);
const SHA256 = /^[a-f0-9]{64}$/;
const DIRECTORY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function parseCandidateCaptureStates(input: unknown): readonly ViewState[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 12
    || Object.keys(input).length !== input.length) throw new Error('CANDIDATE_CAPTURE_STATES_INVALID');
  const states = input.map(parseViewState);
  if (states.some(state => state.name === 'initial')
    || new Set(states.map(state => state.name)).size !== states.length) throw new Error('CANDIDATE_CAPTURE_STATES_INVALID');
  return states;
}

export function validateCandidateSelectionPointer(input: unknown): CandidateSelectionPointer {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('CANDIDATE_SELECTION_POINTER_INVALID');
  }
  const value = input as Record<string, unknown>;
  // The two branches used v2 for different closed schemas; mixed forms still refuse.
  if (value.schema === 'candidate-selection-pointer-v2' && Object.hasOwn(value, 'selection')) {
    return parseCandidatePointerV2(value);
  }
  const keys = Reflect.ownKeys(value);
  const expected = new Set([...KEYS, ...(Object.hasOwn(value, 'captureStates') ? ['captureStates'] : []),
    ...(value.schema === 'candidate-selection-pointer-v2' ? ['visual'] : [])]);
  if (
    keys.length !== expected.size
    || keys.some((key) => typeof key !== 'string' || !expected.has(key))
    || (value.schema !== CANDIDATE_SELECTION_POINTER_SCHEMA && value.schema !== 'candidate-selection-pointer-v2')
    || typeof value.directory !== 'string'
    || !DIRECTORY.test(value.directory)
    || typeof value.indexSha256 !== 'string'
    || !SHA256.test(value.indexSha256)
    || typeof value.selectionSha256 !== 'string'
    || !SHA256.test(value.selectionSha256)
  ) {
    throw new Error('CANDIDATE_SELECTION_POINTER_INVALID');
  }
  const captureStates = Object.hasOwn(value, 'captureStates') ? parseCandidateCaptureStates(value.captureStates) : undefined;
  return Object.freeze({
    schema: value.schema,
    directory: value.directory,
    indexSha256: value.indexSha256,
    selectionSha256: value.selectionSha256,
    ...(captureStates === undefined ? {} : { captureStates }),
    ...(value.schema === 'candidate-selection-pointer-v2' ? { visual: parseCandidateVisual(value.visual, captureStates) } : {}),
  });
}

const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

export function resolveCandidateSelection(
  projectRoot: string,
  pointer: CandidateSelectionPointer,
): readonly string[] {
  if ('selection' in pointer) {
    const selected = checkCandidateSelection(projectRoot, pointer);
    return [pointer.selection.path, selected.candidateSet.path, selected.selectedSource.path,
      ...selected.previews.flatMap(p => [p.png.path, p.capture.path])];
  }
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
  if (pointer.schema === 'candidate-selection-pointer-v2') {
    if (pointer.visual === undefined) throw new Error('CANDIDATE_VISUAL_REQUIRED');
    return Object.freeze([...paths, ...checkCandidateVisual(projectRoot, pointer.directory, pointer.visual, pointer.captureStates)]);
  }
  return Object.freeze(paths);
}
