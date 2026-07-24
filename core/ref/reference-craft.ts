// Reference role ② — craft — measured and verifiable.
//
// A reference serves two roles (see `protocol/reference-assembly.md`): role ① is detailed component
// design (structure, captured by a scoped blueprint); role ② is CRAFT — the motion, scroll animation,
// and sculptural moment that top-tier work is actually known for. Role ① is a static structure you can
// copy. Role ② cannot be copied by looking: seeing an award site's scroll-scrubbed shader does not give
// the generator the skill to build it, so a reproduction tends to degrade into a static ghost of the
// original. This module closes that how-gap by MEASURING craft instead of asserting it.
//
// A `reference-craft-v1` record is the measured motion signature of one scoped reference part:
// its peak pixel-energy (from `computeEnergy` over real screenshots), whether it is scroll-linked,
// and whether it keeps a reduced-motion baseline. `verifyCraftReproduction` then gates a generated
// part against the reference it claims to reproduce: the reproduction must actually move
// (energy above an absolute floor AND within a fidelity ratio of the reference), must preserve a
// scroll-linked reference's scroll response, and must itself be reduced-motion safe. A degraded,
// static, or scroll-dropping reproduction fails — the reference does not pass just because a
// generation was attempted.

export const REFERENCE_CRAFT_SCHEMA = 'reference-craft-v1' as const;

/** A reproduction must move: its peak energy must clear this absolute floor (fraction of pixels). */
export const CRAFT_ENERGY_FLOOR = 0.01;
/** And it must reach at least this fraction of the reference's measured energy — not a faint ghost. */
export const CRAFT_ENERGY_RATIO = 0.6;

export type CraftMotion = {
  /** Peak per-interval pixel-change energy of the scoped part, 0..1 (see `core/motion/energy.ts`). */
  readonly peakEnergy: number;
  /** True when the part's rendered state responds to scroll position (a reveal, parallax, scrub). */
  readonly scrollLinked: boolean;
  /** True when the part keeps a complete, functional baseline under `prefers-reduced-motion: reduce`. */
  readonly reducedMotionSafe: boolean;
};

export type ReferenceCraft = {
  readonly schema: typeof REFERENCE_CRAFT_SCHEMA;
  /** Sanitized reference id / source — no rationale, authorship, or raw bytes. */
  readonly source: string;
  /** Slug the reference is filed under. */
  readonly as: string;
  /** The CSS selector that scoped this capture — proof it measures ONE part, not a whole page. */
  readonly selector: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly motion: CraftMotion;
  /** The named technique the craft uses, e.g. "scroll-scrubbed shader gradient". */
  readonly technique: string;
};

export class ReferenceCraftError extends Error {
  override readonly name = 'ReferenceCraftError';
  readonly reason: string;
  constructor(reason: string) {
    super(`reference craft is invalid: ${reason}`);
    this.reason = reason;
  }
}

export class CraftFidelityError extends Error {
  override readonly name = 'CraftFidelityError';
  readonly reason: string;
  constructor(reason: string) {
    super(`craft reproduction failed: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new ReferenceCraftError(reason); };

const asRecord = (v: unknown, reason: string): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(reason);
const asNonEmptyString = (v: unknown, reason: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : fail(reason);
const asBool = (v: unknown, reason: string): boolean =>
  typeof v === 'boolean' ? v : fail(reason);

function exactKeys(record: Record<string, unknown>, expected: readonly string[], reason: string): void {
  const keys = Object.keys(record).sort();
  const want = [...expected].sort();
  if (keys.length !== want.length || keys.some((key, index) => key !== want[index])) fail(reason);
}

function validateMotion(value: unknown): CraftMotion {
  const record = asRecord(value, 'motion must be an object');
  exactKeys(record, ['peakEnergy', 'reducedMotionSafe', 'scrollLinked'], 'motion has unknown or missing keys');
  const peakEnergy = record.peakEnergy;
  if (typeof peakEnergy !== 'number' || !Number.isFinite(peakEnergy) || peakEnergy < 0 || peakEnergy > 1) {
    return fail('motion.peakEnergy must be a number within [0, 1]');
  }
  return {
    peakEnergy,
    scrollLinked: asBool(record.scrollLinked, 'motion.scrollLinked must be a boolean'),
    reducedMotionSafe: asBool(record.reducedMotionSafe, 'motion.reducedMotionSafe must be a boolean'),
  };
}

function validateViewport(value: unknown): { width: number; height: number } {
  const record = asRecord(value, 'viewport must be an object');
  exactKeys(record, ['height', 'width'], 'viewport has unknown or missing keys');
  const width = record.width;
  const height = record.height;
  if (typeof width !== 'number' || !Number.isInteger(width) || width <= 0) fail('viewport.width must be a positive integer');
  if (typeof height !== 'number' || !Number.isInteger(height) || height <= 0) fail('viewport.height must be a positive integer');
  return { width: width as number, height: height as number };
}

/** Validates a `reference-craft-v1` record. Throws `ReferenceCraftError` on any violation. */
export function validateReferenceCraft(value: unknown): ReferenceCraft {
  const record = asRecord(value, 'record must be an object');
  exactKeys(record, ['as', 'motion', 'schema', 'selector', 'source', 'technique', 'viewport'], 'record has unknown or missing keys');
  if (record.schema !== REFERENCE_CRAFT_SCHEMA) fail(`schema must be ${REFERENCE_CRAFT_SCHEMA}`);
  return {
    schema: REFERENCE_CRAFT_SCHEMA,
    source: asNonEmptyString(record.source, 'source must be a non-empty string'),
    as: asNonEmptyString(record.as, 'as must be a non-empty string'),
    selector: asNonEmptyString(record.selector, 'selector must be a non-empty string'),
    viewport: validateViewport(record.viewport),
    motion: validateMotion(record.motion),
    technique: asNonEmptyString(record.technique, 'technique must be a non-empty string'),
  };
}

export type CraftFidelityResult = {
  readonly ok: true;
  /** Reproduction energy as a fraction of the reference's energy. */
  readonly energyRatio: number;
};

/**
 * Gates a generated part against the reference craft it claims to reproduce. Both are validated
 * `reference-craft-v1` records. Throws `CraftFidelityError` when the reproduction is a degraded ghost
 * (energy below the absolute floor or below the fidelity ratio of the reference), drops a scroll-linked
 * reference's scroll response, or is not itself reduced-motion safe. Returns the measured energy ratio
 * on success. Seeing the reference is not reproducing it; only a measured match passes.
 */
export function verifyCraftReproduction(reference: ReferenceCraft, generated: ReferenceCraft): CraftFidelityResult {
  const ref = validateReferenceCraft(reference);
  const gen = validateReferenceCraft(generated);

  if (gen.motion.peakEnergy < CRAFT_ENERGY_FLOOR) {
    throw new CraftFidelityError(
      `reproduction is static: peak energy ${gen.motion.peakEnergy} is below the ${CRAFT_ENERGY_FLOOR} floor — the craft was not built, only approximated`,
    );
  }
  const energyRatio = ref.motion.peakEnergy > 0 ? gen.motion.peakEnergy / ref.motion.peakEnergy : 1;
  if (energyRatio < CRAFT_ENERGY_RATIO) {
    throw new CraftFidelityError(
      `reproduction is a faint ghost: ${gen.motion.peakEnergy} is ${energyRatio.toFixed(2)}× the reference's ${ref.motion.peakEnergy}, below the ${CRAFT_ENERGY_RATIO} fidelity ratio`,
    );
  }
  if (ref.motion.scrollLinked && !gen.motion.scrollLinked) {
    throw new CraftFidelityError('reproduction dropped the reference\'s scroll-linked response');
  }
  if (!gen.motion.reducedMotionSafe) {
    throw new CraftFidelityError('reproduction has no reduced-motion baseline — motion craft may never gate content');
  }
  return { ok: true, energyRatio: Math.round(energyRatio * 10000) / 10000 };
}
