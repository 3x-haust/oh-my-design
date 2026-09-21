// Mood query loop — the two lanes that gather a board, and when to stop.
//
// A moodboard is only as good as the two questions behind it, and they pull in opposite directions:
//
//   in-category   — what does a competent product in THIS domain look like? This is the baseline
//                   the user's expectation is calibrated against, so it supplies the constraint.
//   out-of-category — what does a competent solution to the SAME problem look like elsewhere? This
//                   is where distinctiveness comes from, derived cross-domain from the domain
//                   brief's own core objects rather than from a taste vocabulary.
//
// Gathering only the first produces the statistical mean this whole system exists to avoid.
// Gathering only the second produces something novel and unusable. The loop keeps both lanes live
// and stops on convergence rather than on a round count, because "how many references is enough?"
// is a property of the set, not of the schedule.
//
// Every cap is in code. An unbounded mood loop is a crawl, and a crawl is how a design run spends
// its whole budget looking at other people's work instead of making its own.

import { createHash } from 'node:crypto';
import type { DomainBrief } from '../domain/domain-brief.ts';
import {
  MAX_MOOD_ITEMS,
  type MoodItem,
  type Moodboard,
} from './mood.ts';
import {
  toVisualVector,
  visualVectorCentroid,
  visualVectorDistance,
  visualVectorSpread,
  type VisualVector,
} from '../visual-vector.ts';
import { referenceMeasuredInvariants } from './measurement-coverage.ts';
import type { Reference } from '../types.ts';

export const MOOD_QUERY_SCHEMA = 'mood-query-v1' as const;

export const MOOD_QUERY_LANES = ['in-category', 'out-of-category'] as const;
export type MoodQueryLane = (typeof MOOD_QUERY_LANES)[number];

/** Coded caps. A mood loop that runs past these is a crawl wearing a design's name. */
export const MOOD_ROUND_CAP = 3;
export const MOOD_ITEMS_PER_ROUND_CAP = 4;
export const MOOD_CAPTURE_CAP = 10;
export const MOOD_QUERIES_PER_LANE_CAP = 3;

/**
 * Convergence: the set is settled when no item moves the centroid by more than this share of the
 * spread. A board whose last capture changes what the board means is not converged, however few
 * rounds it took.
 */
export const MOOD_CONVERGENCE_THRESHOLD = 0.15;

export type MoodQuery = Readonly<{ lane: MoodQueryLane; query: string }>;

export type MoodRound = Readonly<{
  round: number;
  queries: readonly MoodQuery[];
  added: readonly string[];
}>;

export type MoodConvergence = Readonly<{
  converged: boolean;
  /** Per-round centroid shift, most recent last. Empty until at least two rounds landed. */
  shifts: readonly number[];
  reason: string;
}>;

/**
 * Builds the round's queries from the domain brief. The in-category lane names the domain's own
 * surface grammar; the out-of-category lane crosses its core objects into another domain, which is
 * what makes the same problem look different without becoming arbitrary.
 */
export function moodQueries(brief: DomainBrief, lane: MoodQueryLane, round = 1): readonly MoodQuery[] {
  if (round < 1 || round > MOOD_ROUND_CAP) {
    throw new Error(`mood query round must be within 1..${MOOD_ROUND_CAP}`);
  }
  const surfaces = brief.surfaces.map((surface) => surface.name);
  const objects = brief.coreObjects.map((object) => object.name);
  const queries: MoodQuery[] = [];

  if (lane === 'in-category') {
    for (const query of brief.referenceQueries.mood) {
      queries.push(Object.freeze({ lane, query }));
    }
    for (const surface of surfaces.slice(round - 1, round)) {
      queries.push(Object.freeze({ lane, query: `${brief.domain} ${surface} — felt direction, not a layout` }));
    }
  } else {
    // Cross-domain derivation: a core object's function, transplanted. An ERP's "approval queue"
    // read as an air-traffic sequencing board; a booking flow read as a ticket window.
    for (const object of objects.slice(0, MOOD_QUERIES_PER_LANE_CAP)) {
      queries.push(Object.freeze({
        lane,
        query: `${object} handled outside ${brief.domain} — printed, analog, or industrial craft`,
      }));
    }
  }
  return Object.freeze(queries.slice(0, MOOD_QUERIES_PER_LANE_CAP));
}

/** Every lane must be represented, or the board has only one of the two questions in it. */
export function moodLaneBalance(rounds: readonly MoodRound[]): Readonly<Record<MoodQueryLane, number>> {
  const balance: Record<MoodQueryLane, number> = { 'in-category': 0, 'out-of-category': 0 };
  for (const round of rounds) {
    for (const query of round.queries) balance[query.lane] += 1;
  }
  return Object.freeze(balance);
}

/** Caps applied before a round runs, so an over-asked round is refused rather than trimmed silently. */
export function requireMoodRoundWithinCaps(rounds: readonly MoodRound[]): void {
  const next = rounds.length + 1;
  if (next > MOOD_ROUND_CAP) {
    throw new Error(`mood loop is capped at ${MOOD_ROUND_CAP} rounds; converge or decide with what the board holds`);
  }
  const total = rounds.reduce((sum, round) => sum + round.added.length, 0);
  if (total >= MOOD_CAPTURE_CAP) {
    throw new Error(`mood loop is capped at ${MOOD_CAPTURE_CAP} captures; ${total} are already recorded`);
  }
  if (total >= MAX_MOOD_ITEMS) {
    throw new Error(`moodboard is bounded to ${MAX_MOOD_ITEMS} items`);
  }
}

/**
 * Convergence over the visual vectors of the board's own measurements.
 *
 * A mood capture is visual-only by design, so it usually carries no vector of its own. Where the
 * caller can supply measured vectors for members of the set, the shift is computed over those; with
 * none available the loop reports `unknown` rather than pretending it converged, and the caller
 * falls back to the round cap. This is why the caps are in code and the threshold is not the only
 * stopping rule.
 */
export function moodConvergence(
  vectors: readonly VisualVector[],
  board: Moodboard,
): MoodConvergence {
  if (vectors.length < 2) {
    return Object.freeze({
      converged: false,
      shifts: Object.freeze([]),
      reason: 'fewer than two measured vectors available, so the loop is bounded by its round cap',
    });
  }
  const spread = visualVectorSpread(vectors);
  const measured = Object.values(spread).filter((value): value is number => value !== null);
  const scale = measured.length === 0 ? 0 : Math.max(...measured);
  const shifts: number[] = [];
  for (let index = 2; index <= vectors.length; index += 1) {
    const before = visualVectorCentroid(vectors.slice(0, index - 1));
    const after = visualVectorCentroid(vectors.slice(0, index));
    const moved = visualVectorDistance(before, after).distance;
    // A negligible spread means the set already agrees on every measured axis, so there is no scale
    // to divide by. Comparing against a near-zero divisor instead of an exact zero turns float
    // residue into a large ratio, which would report a settled set as still moving.
    const settled = scale < 1e-9 || moved < 1e-9;
    shifts.push(Number.isFinite(moved) ? (settled ? 0 : moved / scale) : Number.NaN);
  }
  const last = shifts.at(-1);
  const converged = last !== undefined && Number.isFinite(last) && last <= MOOD_CONVERGENCE_THRESHOLD;
  return Object.freeze({
    converged,
    shifts: Object.freeze(shifts),
    reason: last === undefined
      ? 'no shift recorded yet'
      : converged
        ? `the last capture moved the centroid ${last.toFixed(3)} of the spread, within the ${MOOD_CONVERGENCE_THRESHOLD} threshold`
        : `the last capture moved the centroid ${last.toFixed(3)} of the spread, still above the ${MOOD_CONVERGENCE_THRESHOLD} threshold`,
  });
}

/** Stable identity for a round, so a re-run records the same round rather than a new one. */
export function moodRoundSha256(round: MoodRound): string {
  const canonical = JSON.stringify({
    round: round.round,
    queries: round.queries.map((query) => `${query.lane}:${query.query}`),
    added: [...round.added],
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Lane balance finding for the board. Named so a reader sees the gap instead of reading a
 * single-lane board as a finished direction.
 */
export function moodLaneFindings(board: Moodboard, rounds: readonly MoodRound[]): readonly string[] {
  const balance = moodLaneBalance(rounds);
  if (rounds.length === 0) return Object.freeze([]);
  const missing = MOOD_QUERY_LANES.filter((lane) => balance[lane] === 0);
  if (missing.length === 0) return Object.freeze([]);
  return Object.freeze([
    `moodboard "${board.direction}" was gathered from ${missing.join(' and ')} only. The in-category lane is the baseline the user's expectation is calibrated against; the out-of-category lane is where distinctiveness comes from. A board with one lane answers half the question.`,
  ]);
}

/** The measured vectors a caller can supply for references that do carry measurements. */
export function moodVectorsFor(items: readonly Reference[]): readonly VisualVector[] {
  return Object.freeze(items.flatMap((item) => {
    const measured = referenceMeasuredInvariants(item);
    return measured === null ? [] : [toVisualVector({ invariants: measured })];
  }));
}

export function moodItemIds(board: Moodboard): readonly string[] {
  return Object.freeze(board.items.map((item: MoodItem) => item.id));
}
