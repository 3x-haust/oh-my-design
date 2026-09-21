// Composite slop score.
//
// `core/slop/index.ts` scans SOURCE for named candidate patterns, and `core/rules/builtin/slop.yaml`
// fires point-wise rules on a rendered IR. Both answer "is this pattern present?" — neither answers
// "how far is this page from the thing we are trying to avoid?", which is what a gate needs.
//
// This module produces that single number, as a distance in the shared feature space
// (core/visual-vector.ts), so the slop floor, the category-mean floor, and the mood coherence
// ceiling are comparable readings rather than three unrelated heuristics.
//
// Two deliberate limits, both lifted from `core/composition-contract/visual-richness.ts`:
//
// 1. Advisory by default. A weighted composite over a drifting aesthetic is not yet calibrated, so
//    findings carry `advisory` severity and the CLI does not fail on them. Promotion to a gate is a
//    separate, evidence-backed change.
// 2. Point-wise rules still run. A composite score can miss a single glaring tell that is cheap to
//    name, so the named-rule findings travel alongside the score rather than being replaced by it.

import {
  toVisualVector,
  visualVectorCentroid,
  visualVectorDistance,
  type RenderLoads,
  type VisualVector,
  type VisualVectorAxis,
} from '../visual-vector.ts';
import type { Invariants } from '../types.ts';

export const SLOP_SCORE_SCHEMA = 'slop-score-v1' as const;

/**
 * Advisory threshold. A page at or below this is not distinguishable from the slop centroid by more
 * than measurement noise on the axes both sides measured. Deliberately generous: a false "looks
 * generic" costs a reread, and the score does not gate.
 */
export const SLOP_ADVISORY_FLOOR = 0.18;

export type SlopAxisReading = Readonly<{
  axis: VisualVectorAxis;
  value: number | null;
  centroid: number | null;
  /** Signed gap; negative means this page sits below the centroid on this axis. */
  gap: number | null;
}>;

export type SlopScoreFinding = Readonly<{
  id: 'SLOP-CENTROID-PROXIMITY' | 'SLOP-AXIS-AGREEMENT';
  severity: 'advisory';
  message: string;
  axes?: readonly VisualVectorAxis[];
}>;

export type SlopScore = Readonly<{
  schema: typeof SLOP_SCORE_SCHEMA;
  /** NaN when nothing is comparable; that is unknown proximity, not good proximity. */
  distance: number;
  nearSlop: boolean;
  compared: readonly VisualVectorAxis[];
  excluded: readonly VisualVectorAxis[];
  readings: readonly SlopAxisReading[];
  findings: readonly SlopScoreFinding[];
}>;

export type SlopCorpusEntry = Readonly<{
  invariants: Invariants;
  loads?: RenderLoads;
}>;

/** The slop centroid is derived from the corpus, never hardcoded: a drifting aesthetic must move it. */
export function slopCentroid(corpus: readonly SlopCorpusEntry[]): VisualVector {
  if (corpus.length === 0) throw new Error('slop centroid needs at least one corpus entry');
  return visualVectorCentroid(corpus.map((entry) => toVisualVector(entry)));
}

/**
 * Scores one page against the corpus centroid.
 *
 * `axes` narrows the comparison to the axes a caller actually built a corpus for — the slop corpus
 * is unlikely to have measured gradient/blur loads, and scoring a page against an axis the corpus
 * never measured would manufacture agreement on a null.
 */
export function scoreSlop(input: Readonly<{
  invariants: Invariants;
  loads?: RenderLoads;
  corpus: readonly SlopCorpusEntry[];
  axes?: readonly VisualVectorAxis[];
}>): SlopScore {
  const vector = toVisualVector({ invariants: input.invariants, ...(input.loads === undefined ? {} : { loads: input.loads }) });
  const centroid = slopCentroid(input.corpus);
  const narrowed: VisualVector = input.axes === undefined
    ? centroid
    : Object.freeze(Object.fromEntries(
      Object.entries(centroid).map(([axis, value]) => [axis, input.axes!.includes(axis as VisualVectorAxis) ? value : null]),
    )) as VisualVector;

  const comparison = visualVectorDistance(vector, narrowed);
  const readings = comparison.compared
    .map((axis): SlopAxisReading => Object.freeze({
      axis,
      value: vector[axis],
      centroid: centroid[axis],
      gap: vector[axis] === null || centroid[axis] === null ? null : vector[axis]! - centroid[axis]!,
    }))
    .sort((a, b) => Math.abs(a.gap ?? 0) - Math.abs(b.gap ?? 0));

  const distance = comparison.distance;
  const nearSlop = Number.isFinite(distance) && distance <= SLOP_ADVISORY_FLOOR;
  const findings: SlopScoreFinding[] = [];

  if (!Number.isFinite(distance)) {
    findings.push(Object.freeze({
      id: 'SLOP-AXIS-AGREEMENT',
      severity: 'advisory',
      message: 'No axis was measured on both this page and the corpus, so proximity to the slop centroid is unknown rather than good. Measure the page before citing this score.',
    }));
  } else if (nearSlop) {
    findings.push(Object.freeze({
      id: 'SLOP-CENTROID-PROXIMITY',
      severity: 'advisory',
      message: `This page sits ${distance.toFixed(3)} from the slop centroid, within the ${SLOP_ADVISORY_FLOOR} advisory floor on ${comparison.compared.length} shared axes. Closest agreement: ${readings.slice(0, 3).map((reading) => `${reading.axis} (${reading.gap!.toFixed(3)})`).join(', ')}. A shared axis is not automatically a fault — name what this page chose deliberately before changing it.`,
      axes: Object.freeze(readings.slice(0, 3).map((reading) => reading.axis)),
    }));
  }

  return Object.freeze({
    schema: SLOP_SCORE_SCHEMA,
    distance,
    nearSlop,
    compared: comparison.compared,
    excluded: comparison.excluded,
    readings: Object.freeze(readings),
    findings: Object.freeze(findings),
  });
}
