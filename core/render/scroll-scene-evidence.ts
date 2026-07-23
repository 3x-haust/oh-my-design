// Additive, not-yet-wired evidence contract for a showpiece scroll-scene sequence.
//
// The single-load-scene motion contract (`captureMotionEvidenceV2`) deliberately excludes
// scroll-triggered motion because a *time-triggered* scroll animation cannot be deterministically
// settled or verified. A scroll scene is verifiable only when it is scroll-position-scrubbed: at a
// FIXED scroll position its rendered state is stable across time (scrubbed to position, not animating
// in time). This module defines that verification contract as the foundational brick of a staged
// showpiece scroll-motion evidence protocol. It is intentionally not wired into the motion decision,
// the render capture, or final-evidence yet; capture and wiring are separate later increments.

export const SCROLL_SCENE_EVIDENCE_SCHEMA = 'scroll-scene-evidence-v1' as const;

/** Bounded so a "journey" stays a designed sequence, never an unbounded scroll-jack. */
export const MAX_SCROLL_SCENES = 6;

/** At a fixed scroll position a scrubbed scene must be stable: residual energy stays within noise. */
const SETTLE_STABILITY_MULTIPLE = 2;
const HEX64 = /^[a-f0-9]{64}$/;

export type ScrollSceneSettle = {
  /** Energy between two captures taken at the SAME fixed scroll position. */
  readonly settledEnergy: number;
  /** Per-scene render noise floor. */
  readonly noiseFloor: number;
};

export type ScrollScene = {
  readonly sceneId: string;
  /** Declared trigger position as a fraction of scrollable height, in (0, 1]. */
  readonly scrollFraction: number;
  readonly roiSelector: string;
  /** Proof the scene is scroll-position-scrubbed (stable at a fixed position), not time-animating. */
  readonly settle: ScrollSceneSettle;
  /** Energy of the scene's state versus the top/baseline: a real, observed state change. */
  readonly stateChangeEnergy: number;
  /** Reduced-motion behavior for this scene: it must be removed or reduced to a static equivalent. */
  readonly reducedMotion: { readonly behavior: 'removed' | 'static-equivalent' };
};

export type ScrollSceneEvidence = {
  readonly schema: typeof SCROLL_SCENE_EVIDENCE_SCHEMA;
  readonly artDirectionHash: string;
  /** Scroll-scene sequences are a showpiece-only escalation. */
  readonly register: 'showpiece';
  /** Gate: a scroll journey requires a declared performance budget. */
  readonly perfBudgetDeclared: true;
  /**
   * The no-scroll / reduced-motion baseline is complete: every content region is present and the
   * page is fully functional without any scroll motion. This is the evidence guarantee that keeps
   * the scroll sequence a progressive enhancement, never a gate on content.
   */
  readonly reducedMotionComplete: true;
  readonly scenes: readonly ScrollScene[];
};

export class ScrollSceneEvidenceError extends Error {
  override readonly name = 'ScrollSceneEvidenceError';
  readonly reason: string;
  constructor(reason: string) {
    super(`scroll-scene evidence is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new ScrollSceneEvidenceError(reason); };
const asRecord = (v: unknown, reason: string): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(reason);
const asNonEmptyString = (v: unknown, reason: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v : fail(reason);
const asFiniteNonNegative = (v: unknown, reason: string): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fail(reason);
const exactKeys = (record: Record<string, unknown>, expected: readonly string[], reason: string): void => {
  const keys = Object.keys(record).sort();
  const want = [...expected].sort();
  if (keys.length !== want.length || keys.some((key, index) => key !== want[index])) fail(reason);
};

function validateScene(value: unknown, index: number, priorFraction: number): ScrollScene {
  const record = asRecord(value, `scenes[${index}] must be an object`);
  exactKeys(record, ['reducedMotion', 'roiSelector', 'sceneId', 'scrollFraction', 'settle', 'stateChangeEnergy'], `scenes[${index}] has unknown or missing keys`);
  const sceneId = asNonEmptyString(record.sceneId, `scenes[${index}].sceneId must be a non-empty string`);
  const roiSelector = asNonEmptyString(record.roiSelector, `scenes[${index}].roiSelector must be a non-empty string`);
  const scrollFraction = record.scrollFraction;
  if (typeof scrollFraction !== 'number' || !Number.isFinite(scrollFraction) || scrollFraction <= 0 || scrollFraction > 1) {
    return fail(`scenes[${index}].scrollFraction must be within (0, 1]`);
  }
  if (scrollFraction <= priorFraction) fail(`scenes[${index}].scrollFraction must strictly increase down the page`);
  const settle = asRecord(record.settle, `scenes[${index}].settle must be an object`);
  exactKeys(settle, ['noiseFloor', 'settledEnergy'], `scenes[${index}].settle has unknown or missing keys`);
  const noiseFloor = asFiniteNonNegative(settle.noiseFloor, `scenes[${index}].settle.noiseFloor must be finite and non-negative`);
  if (noiseFloor <= 0) fail(`scenes[${index}].settle.noiseFloor must be positive`);
  const settledEnergy = asFiniteNonNegative(settle.settledEnergy, `scenes[${index}].settle.settledEnergy must be finite and non-negative`);
  // Deterministic scroll-position settle: at a fixed position the scene is stable across time.
  if (settledEnergy > noiseFloor * SETTLE_STABILITY_MULTIPLE) {
    fail(`scenes[${index}] is time-animating at a fixed scroll position, not scroll-position-scrubbed; it cannot be deterministically settled`);
  }
  const stateChangeEnergy = asFiniteNonNegative(record.stateChangeEnergy, `scenes[${index}].stateChangeEnergy must be finite and non-negative`);
  // A real observed state change versus the baseline: above the noise floor.
  if (stateChangeEnergy <= noiseFloor) fail(`scenes[${index}] shows no observed state change versus the baseline`);
  const reducedMotion = asRecord(record.reducedMotion, `scenes[${index}].reducedMotion must be an object`);
  exactKeys(reducedMotion, ['behavior'], `scenes[${index}].reducedMotion has unknown or missing keys`);
  const behavior = reducedMotion.behavior === 'removed' || reducedMotion.behavior === 'static-equivalent'
    ? reducedMotion.behavior
    : fail(`scenes[${index}].reducedMotion.behavior must be removed or static-equivalent`);
  return { sceneId, scrollFraction, roiSelector, settle: { settledEnergy, noiseFloor }, stateChangeEnergy, reducedMotion: { behavior } };
}

/**
 * Validates a scroll-scene evidence record. Throws `ScrollSceneEvidenceError` on any violation.
 * A record is valid only when it is a showpiece escalation with a declared perf budget, a complete
 * reduced-motion baseline, and a bounded, strictly ordered sequence of scroll-position-scrubbed
 * scenes, each of which is deterministically settled at its fixed position, shows a real observed
 * state change, and reduces to a removed or static equivalent under reduced motion.
 */
export function validateScrollSceneEvidence(value: unknown): ScrollSceneEvidence {
  const record = asRecord(value, 'evidence must be an object');
  exactKeys(record, ['artDirectionHash', 'perfBudgetDeclared', 'reducedMotionComplete', 'register', 'scenes', 'schema'], 'evidence has unknown or missing keys');
  if (record.schema !== SCROLL_SCENE_EVIDENCE_SCHEMA) fail(`schema must be ${SCROLL_SCENE_EVIDENCE_SCHEMA}`);
  const artDirectionHash = asNonEmptyString(record.artDirectionHash, 'artDirectionHash must be a non-empty string');
  if (!HEX64.test(artDirectionHash)) fail('artDirectionHash must be 64 lowercase hexadecimal characters');
  if (record.register !== 'showpiece') fail('a scroll-scene sequence is a showpiece-only escalation');
  if (record.perfBudgetDeclared !== true) fail('a scroll journey requires a declared performance budget');
  if (record.reducedMotionComplete !== true) fail('the no-scroll / reduced-motion baseline must be complete before a scroll sequence is lawful');
  const rawScenes = record.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) return fail('scenes must be a non-empty array');
  if (rawScenes.length > MAX_SCROLL_SCENES) fail(`a scroll journey is bounded to ${MAX_SCROLL_SCENES} scenes`);
  const ids = new Set<string>();
  let priorFraction = 0;
  const scenes: ScrollScene[] = [];
  for (let index = 0; index < rawScenes.length; index += 1) {
    const parsed = validateScene(rawScenes[index], index, priorFraction);
    if (ids.has(parsed.sceneId)) fail(`duplicate sceneId: ${parsed.sceneId}`);
    ids.add(parsed.sceneId);
    priorFraction = parsed.scrollFraction;
    scenes.push(parsed);
  }
  return {
    schema: SCROLL_SCENE_EVIDENCE_SCHEMA,
    artDirectionHash,
    register: 'showpiece',
    perfBudgetDeclared: true,
    reducedMotionComplete: true,
    scenes,
  };
}
