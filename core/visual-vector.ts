// Shared visual feature space.
//
// Slop score, category mean, mood centroid, and render comparison must all be distances in ONE
// space, or their three gates are not comparable: a slop distance of 0.4 and a mood distance of 0.4
// would mean different things. This module is that single space. It does not introduce a second
// vocabulary — it projects the measured `Invariants` (core/types.ts) plus a few render-derived
// loads into one fixed-order numeric vector, and every consumer normalises the same way.
//
// Two rules keep it honest:
//
// 1. A missing measurement is not a maximal difference. `Invariants` distinguishes "measured 0"
//    from "never measured" (empty ladders, measurementCoverage, ambiguous interaction probes), and
//    `core/ref/distance.ts` already carries the reasoning. Missing axes are therefore *excluded* and
//    the remaining weights renormalise, exactly as that module does.
// 2. The vector is a projection, not the source of truth. `Invariants` stays canonical so an
//    existing reference record does not need rewriting to participate.

import type { Invariants } from './types.ts';

export const VISUAL_VECTOR_SCHEMA = 'visual-vector-v1' as const;

/**
 * The fixed axis order. Every vector is emitted in this order so a stored centroid stays
 * comparable across runs and versions of this file; append new axes, never reorder.
 */
export const VISUAL_VECTOR_AXES = [
  'spacingRhythm',
  'radiusProfile',
  'typeVoice',
  'weightVoice',
  'fontVoice',
  'motionVoice',
  'easingVoice',
  'elevationProfile',
  'layoutEnergy',
  'materialDensity',
  'tokenDiscipline',
  'interactionCoverage',
  'motionLoad',
  'energyLoad',
  'centeredComposition',
] as const;

export type VisualVectorAxis = (typeof VISUAL_VECTOR_AXES)[number];

/** Every axis is 0..1; `null` means unmeasured and must not be read as 0. */
export type VisualVector = Readonly<Record<VisualVectorAxis, number | null>>;

/**
 * Render-derived loads that `Invariants` does not carry. Both are optional: a record built before
 * this module, or one whose capture had no filmstrip, leaves them unmeasured rather than zero.
 */
export type RenderLoads = Readonly<{
  /** Fraction of sampled pixels the palette treats as gradient rather than flat fill. */
  gradientLoad?: number;
  /** Fraction of sampled pixels carrying blur or backdrop material. */
  blurLoad?: number;
}>;

export type VisualVectorInput = Readonly<{
  invariants: Invariants;
  loads?: RenderLoads;
}>;

/**
 * The axes `Invariants` supplies, with the same treatment `core/ref/distance.ts` applies:
 * ladder/vocabulary axes are unmeasured when empty, and a scalar backed by an interaction probe
 * that never ran is unmeasured rather than 0.
 *
 * Derived scalars summarise a ladder by its shape, not its contents, so two designs on the same
 * 8pt grid agree without being charged for rungs they do not share. The rung-level comparison
 * already exists in `core/ref/distance.ts` (`similarity`/`jaccard`); this vector is the coarser
 * space the gates compare in, and both read the same `Invariants`.
 */
/**
 * Vocabulary richness as a 0..1 share: a single font or easing is one voice, four or more is a full
 * vocabulary. Saturating rather than normalising by the max keeps the axis comparable across pages —
 * dividing by the largest count in a set would make the same page score differently in a different
 * corpus.
 */
function voice(values: readonly (number | string)[]): number | null {
  if (values.length === 0) return null;
  return clamp01((new Set(values).size - 1) / 3);
}

/** Ladder richness mapped to 0..1: one rung is a monoculture, five or more is a full scale. */
function ladderProfile(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const distinct = new Set(values).size;
  return clamp01((distinct - 1) / 4);
}

/** Smoother ladder shape: mid-range rungs count more than the extremes that every scale shares. */
function ladderSpread(values: readonly number[]): number | null {
  if (values.length < 2) return values.length === 0 ? null : 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= 0) return 0;
  return clamp01(Math.log1p(max - min) / Math.log1p(max));
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** A count with no natural ceiling saturates: four elevation levels already reads as "many". */
const saturating = (value: number, ceiling: number): number => clamp01(value / ceiling);

export function toVisualVector(input: VisualVectorInput): VisualVector {
  const { invariants, loads } = input;
  const interactionMeasured = invariants.measurementCoverage?.interactionProbe !== 'not-measured';
  return Object.freeze({
    spacingRhythm: ladderProfile(invariants.spacingLadder),
    radiusProfile: ladderProfile(invariants.radiusLadder),
    typeVoice: ladderSpread(invariants.typeScale),
    weightVoice: ladderProfile(invariants.weightLadder),
    fontVoice: voice(invariants.fontFamilies),
    motionVoice: voice(invariants.motionDurations),
    easingVoice: voice(invariants.easingVocab),
    elevationProfile: saturating(invariants.elevationLevels, 4),
    layoutEnergy: clamp01(invariants.paddingWeight / 200),
    materialDensity: clamp01(invariants.animatedShare),
    tokenDiscipline: clamp01(invariants.tokenCoverage),
    interactionCoverage: interactionMeasured
      ? clamp01((invariants.hoverCoverage + invariants.focusCoverage) / 2)
      : null,
    motionLoad: loads?.gradientLoad === undefined ? null : clamp01(loads.gradientLoad),
    energyLoad: loads?.blurLoad === undefined ? null : clamp01(loads.blurLoad),
    centeredComposition: clamp01(invariants.centeredRatio),
  });
}

export type VisualVectorComparison = Readonly<{
  /** Root-mean-square distance over the axes both sides measured. */
  distance: number;
  /** Axes compared, for auditability: a distance over 3 axes is weaker evidence than one over 12. */
  compared: readonly VisualVectorAxis[];
  excluded: readonly VisualVectorAxis[];
}>;

/**
 * Distance in the shared space: RMS over shared measured axes, so an unmeasured axis neither
 * inflates nor deflates the result. Two inputs that share no measured axis return `null` distance —
 * they are not 1.0 apart, they are incomparable, and a gate must not read that as evidence.
 */
export function visualVectorDistance(a: VisualVector, b: VisualVector): VisualVectorComparison {
  const compared: VisualVectorAxis[] = [];
  const excluded: VisualVectorAxis[] = [];
  let sumSquares = 0;

  for (const axis of VISUAL_VECTOR_AXES) {
    const left = a[axis];
    const right = b[axis];
    if (left === null || right === null) {
      excluded.push(axis);
      continue;
    }
    compared.push(axis);
    sumSquares += (left - right) ** 2;
  }

  return Object.freeze({
    distance: compared.length === 0 ? Number.NaN : Math.sqrt(sumSquares / compared.length),
    compared: Object.freeze(compared),
    excluded: Object.freeze(excluded),
  });
}

/**
 * Centroid of a set of vectors, computed per axis over the members that measured it. Returns null
 * for an axis no member measured, so a downstream gate excludes it instead of treating it as 0.
 */
export function visualVectorCentroid(vectors: readonly VisualVector[]): VisualVector {
  if (vectors.length === 0) throw new Error('visual vector centroid needs at least one vector');
  const centroid: Record<string, number | null> = {};
  for (const axis of VISUAL_VECTOR_AXES) {
    const measured = vectors.map((vector) => vector[axis]).filter((value): value is number => value !== null);
    centroid[axis] = measured.length === 0
      ? null
      : measured.reduce((sum, value) => sum + value, 0) / measured.length;
  }
  return Object.freeze(centroid) as VisualVector;
}

/**
 * Spread per axis: the mean absolute deviation from the centroid. A tight spread means the set
 * agrees on that axis; a wide one means the axis does not characterise the set.
 */
export function visualVectorSpread(vectors: readonly VisualVector[]): VisualVector {
  const centroid = visualVectorCentroid(vectors);
  const spread: Record<string, number | null> = {};
  for (const axis of VISUAL_VECTOR_AXES) {
    const center = centroid[axis];
    if (center === null) {
      spread[axis] = null;
      continue;
    }
    const measured = vectors.map((vector) => vector[axis]).filter((value): value is number => value !== null);
    spread[axis] = measured.reduce((sum, value) => sum + Math.abs(value - center), 0) / measured.length;
  }
  return Object.freeze(spread) as VisualVector;
}

/** Serialises in fixed axis order so a stored vector stays diffable and content-addressable. */
export function serializeVisualVector(vector: VisualVector): string {
  const entries = VISUAL_VECTOR_AXES.map((axis) => {
    const value = vector[axis];
    return `${axis}=${value === null ? 'unmeasured' : value.toFixed(4)}`;
  });
  return `${VISUAL_VECTOR_SCHEMA}\n${entries.join('\n')}\n`;
}
