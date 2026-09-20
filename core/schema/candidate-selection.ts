import { CANDIDATE_SELECTION_POINTER_SCHEMA } from '../brief/candidate-selection.ts';
import type { InputSkeleton } from './inputs.ts';

export const CANDIDATE_SELECTION_INPUT: InputSkeleton = {
  name: 'candidate-selection', path: '.omd/.cache/candidate-selection-input.json',
  command: 'omd candidate select --input .omd/.cache/candidate-selection-input.json --json',
  keys: ['schema', 'directory', 'indexSha256', 'selectionSha256'],
  constraints: [
    'Sketch owns only its assigned .omd/.cache/sketches/<id>/ directory. The coordinator evaluates candidates and publishes the selected current pointer through candidate select.',
    'The selected directory must contain nonempty index.html, noun-swap-test.json, selection.json and ux-models.json; directory is one basename, never a path.',
    'After real candidate generation/rendered selection, obtain both exact current file hashes with omd hash. Never guess hashes, fabricate candidates or copy a selection verdict onto changed source.',
  ],
  skeleton: { schema: CANDIDATE_SELECTION_POINTER_SCHEMA, directory: '<selected-candidate-id>',
    indexSha256: '<omd hash .omd/.cache/sketches/<id>/index.html>',
    selectionSha256: '<omd hash .omd/.cache/sketches/<id>/selection.json>' },
};
