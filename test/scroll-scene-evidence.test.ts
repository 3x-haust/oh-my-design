import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCROLL_SCENES,
  SCROLL_SCENE_EVIDENCE_SCHEMA,
  ScrollSceneEvidenceError,
  validateScrollSceneEvidence,
} from '../core/render/scroll-scene-evidence.ts';

const HASH = 'a'.repeat(64);

const scene = (over: Record<string, unknown> = {}) => ({
  sceneId: 's1',
  scrollFraction: 0.25,
  roiSelector: '#hero',
  settle: { settledEnergy: 0.1, noiseFloor: 1 },
  stateChangeEnergy: 5,
  reducedMotion: { behavior: 'removed' },
  ...over,
});

const evidence = (over: Record<string, unknown> = {}) => ({
  schema: SCROLL_SCENE_EVIDENCE_SCHEMA,
  artDirectionHash: HASH,
  register: 'showpiece',
  perfBudgetDeclared: true,
  reducedMotionComplete: true,
  scenes: [scene()],
  ...over,
});

test('a bounded, ordered sequence of scroll-position-scrubbed scenes validates and round-trips', () => {
  const input = evidence({
    scenes: [
      scene({ sceneId: 'intro', scrollFraction: 0.2 }),
      scene({ sceneId: 'reveal', scrollFraction: 0.55, reducedMotion: { behavior: 'static-equivalent' } }),
      scene({ sceneId: 'climax', scrollFraction: 0.9 }),
    ],
  });
  const parsed = validateScrollSceneEvidence(input);
  assert.equal(parsed.schema, SCROLL_SCENE_EVIDENCE_SCHEMA);
  assert.equal(parsed.register, 'showpiece');
  assert.deepEqual(parsed.scenes.map((s) => s.sceneId), ['intro', 'reveal', 'climax']);
});

test('a scene that keeps animating in time at a fixed scroll position cannot be settled', () => {
  // settledEnergy far above the noise floor means the frame is still changing at a fixed position:
  // a time-triggered scroll animation, not a deterministic scroll-position scrub.
  assert.throws(
    () => validateScrollSceneEvidence(evidence({ scenes: [scene({ settle: { settledEnergy: 4, noiseFloor: 1 } })] })),
    (e: unknown) => e instanceof ScrollSceneEvidenceError && /time-animating at a fixed scroll position/i.test(e.reason),
  );
});

test('a scene with no observed state change versus the baseline is rejected', () => {
  assert.throws(
    () => validateScrollSceneEvidence(evidence({ scenes: [scene({ stateChangeEnergy: 1, settle: { settledEnergy: 0.1, noiseFloor: 1 } })] })),
    /no observed state change/i,
  );
});

test('a scene that does not reduce under reduced motion is rejected', () => {
  assert.throws(
    () => validateScrollSceneEvidence(evidence({ scenes: [scene({ reducedMotion: { behavior: 'kept' } })] })),
    /removed or static-equivalent/i,
  );
});

test('scroll fractions must be within (0, 1] and strictly increase down the page', () => {
  assert.throws(() => validateScrollSceneEvidence(evidence({ scenes: [scene({ scrollFraction: 0 })] })), /within \(0, 1\]/i);
  assert.throws(() => validateScrollSceneEvidence(evidence({ scenes: [scene({ scrollFraction: 1.2 })] })), /within \(0, 1\]/i);
  assert.throws(
    () => validateScrollSceneEvidence(evidence({ scenes: [scene({ sceneId: 'a', scrollFraction: 0.6 }), scene({ sceneId: 'b', scrollFraction: 0.4 })] })),
    /strictly increase/i,
  );
});

test('duplicate scene ids are rejected', () => {
  assert.throws(
    () => validateScrollSceneEvidence(evidence({ scenes: [scene({ sceneId: 'x', scrollFraction: 0.3 }), scene({ sceneId: 'x', scrollFraction: 0.6 })] })),
    /duplicate sceneId/i,
  );
});

test('scroll journeys are showpiece-only, perf-budget-gated, and require a complete reduced-motion baseline', () => {
  assert.throws(() => validateScrollSceneEvidence(evidence({ register: 'confident' })), /showpiece-only escalation/i);
  assert.throws(() => validateScrollSceneEvidence(evidence({ perfBudgetDeclared: false })), /declared performance budget/i);
  assert.throws(() => validateScrollSceneEvidence(evidence({ reducedMotionComplete: false })), /baseline must be complete/i);
});

test('the sequence is bounded and non-empty, and the record shape is closed', () => {
  assert.throws(() => validateScrollSceneEvidence(evidence({ scenes: [] })), /non-empty array/i);
  const tooMany = Array.from({ length: MAX_SCROLL_SCENES + 1 }, (_unused, i) => scene({ sceneId: `s${i}`, scrollFraction: (i + 1) / (MAX_SCROLL_SCENES + 2) }));
  assert.throws(() => validateScrollSceneEvidence(evidence({ scenes: tooMany })), new RegExp(`bounded to ${MAX_SCROLL_SCENES} scenes`, 'i'));
  assert.throws(() => validateScrollSceneEvidence(evidence({ artDirectionHash: 'not-a-hash' })), /64 lowercase hexadecimal/i);
  assert.throws(() => validateScrollSceneEvidence({ ...evidence(), extra: 1 }), /unknown or missing keys/i);
});
