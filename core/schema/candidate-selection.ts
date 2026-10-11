import { CANDIDATE_SELECTION_POINTER_SCHEMA } from '../brief/candidate-selection.ts';
import type { InputSkeleton } from './inputs.ts';

export const CANDIDATE_SELECTION_INPUT: InputSkeleton = {
  name: 'candidate-selection', path: '.omd/.cache/candidate-selection-input.json',
  command: 'omd candidate select --input .omd/.cache/candidate-selection-input.json --json',
  keys: ['schema', 'directory', 'indexSha256', 'selectionSha256', 'captureStates'],
  constraints: [
    'Sketch owns only its assigned .omd/.cache/sketches/<id>/ directory. The coordinator evaluates candidates and publishes the selected current pointer through candidate select.',
    'The selected directory must contain nonempty index.html, noun-swap-test.json, selection.json and ux-models.json; directory is one basename, never a path.',
    'After real candidate generation/rendered selection, obtain both exact current file hashes with omd hash. Never guess hashes, fabricate candidates or copy a selection verdict onto changed source.',
    'The publisher captures the selected first-party candidate at fixed 1280x900 and 390x844 viewports and writes a v2 pointer binding its complete served tree and both PNGs. Hand receives those current images by default; raw third-party reference images remain private. Bundle candidate assets locally.',
    'Every newly captured candidate also preserves its exact served source tree in content-addressed candidate-source-history storage and records the present composition, frame, copy and type input digests. This is recoverable history, not approval or automatic restoration. Historical input digests stay unchanged when production later rebinds its own proofs; they never establish current composition authority. Changed candidate source requires a fresh capture, and inputs may not change during that capture.',
    'Optional captureStates declares 1-12 complementary local states with unique names other than initial. Each state has exactly name, startRoute, route, actions and assertions. Routes are canonical local paths; actions use bounded click/fill/select/press selectors; assertions require visible/hidden selectors and optional text. The publisher executes each plan in fresh contexts at both fixed viewports, binds plans and whole PNGs to the same served tree, and refuses failed assertions or external networking. Never supply screenshots or unobserved state labels.',
    'The mandatory initial desktop/mobile pair remains the early representative target. Complementary pairs let the critic choose exactly one matching candidate state per selected source slot/viewport; all approved first-party images reach production through resolved candidate evidence.',
  ],
  skeleton: { schema: CANDIDATE_SELECTION_POINTER_SCHEMA, directory: '<selected-candidate-id>',
    indexSha256: '<omd hash .omd/.cache/sketches/<id>/index.html>',
    selectionSha256: '<omd hash .omd/.cache/sketches/<id>/selection.json>' },
};
