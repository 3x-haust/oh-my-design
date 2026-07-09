import type { Invariants, Reference, RefDistance } from '../types.ts';

/**
 * Jaccard: shared rungs over total distinct rungs.
 *
 * The question is not "does this page use 8px" — nearly every page does. It is "does this
 * page have the same rhythm": the same rungs, and no others. Two designs on the 8pt grid
 * share 4/8/16 by convention, not by copying, and Jaccard's union denominator is what
 * charges them for the rungs they do not share.
 *
 * Measured against Szymkiewicz–Simpson overlap, which normalises by the shorter ladder:
 * that scored an ordinary five-rung 8pt scale at 0.82 against Linear's thirteen rungs,
 * because a short ladder sits inside a long one by construction. Containment is not
 * similarity.
 */
function jaccard(a: number[], b: number[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;

  let shared = 0;
  for (const v of setA) if (setB.has(v)) shared += 1;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 1 : shared / union;
}

const ratioDiff = (a: number, b: number): number => 1 - Math.abs(a - b) / Math.max(a, b, 1);

/**
 * Padding is felt as a proportion, not a difference: 10px against 40px is a different
 * design, 100px against 130px is the same design. `ratioDiff` disagreed, scoring the
 * identical 30px gap 0.25 and 0.77. Comparing logs makes the metric scale-free.
 */
function logRatio(a: number, b: number): number {
  if (a === b) return 1;
  const la = Math.log1p(Math.max(a, 0));
  const lb = Math.log1p(Math.max(b, 0));
  const span = Math.max(la, lb, 1);
  return Math.max(0, 1 - Math.abs(la - lb) / span);
}

const WEIGHTS = {
  spacingLadder: 0.25,
  radiusLadder: 0.25,
  elevationLevels: 0.15,
  centeredRatio: 0.10,
  tokenCoverage: 0.10,
  paddingWeight: 0.15,
} as const;

type Component = keyof typeof WEIGHTS;

function componentScores(a: Invariants, b: Invariants): Record<Component, number> {
  return {
    spacingLadder: jaccard(a.spacingLadder, b.spacingLadder),
    radiusLadder: jaccard(a.radiusLadder, b.radiusLadder),
    elevationLevels: ratioDiff(a.elevationLevels, b.elevationLevels),
    centeredRatio: 1 - Math.abs(a.centeredRatio - b.centeredRatio),
    tokenCoverage: 1 - Math.abs(a.tokenCoverage - b.tokenCoverage),
    paddingWeight: logRatio(a.paddingWeight, b.paddingWeight),
  };
}

/**
 * Weighted GEOMETRIC mean, not arithmetic.
 *
 * An arithmetic mean lets agreement on the cheap components hide disagreement on the
 * expensive ones. Two pages with nothing in common but a shared centred-text ratio, token
 * coverage and padding weight already floor at 0.50 — over half the copying threshold —
 * before their spacing and radius ladders are even consulted. Measured: Linear's thirteen
 * spacing rungs against an ordinary five-rung 8pt scale scored 0.632, flagged as a copy,
 * on ladder scores of 0.385 and 0.143.
 *
 * A design's identity lives in its ladders. Under a geometric mean a near-zero on either
 * one drags the product down and no amount of incidental agreement rescues it.
 */
export function similarity(a: Invariants, b: Invariants): number {
  const scores = componentScores(a, b);
  const keys = Object.keys(WEIGHTS) as Component[];

  // log(0) is -Infinity, which would make every dissimilar pair score exactly 0 and lose
  // all ordering among them. The floor keeps them comparable.
  const EPSILON = 1e-3;
  let logSum = 0;
  for (const key of keys) logSum += WEIGHTS[key] * Math.log(Math.max(scores[key], EPSILON));

  return Math.min(1, Math.max(0, Math.exp(logSum)));
}

export function distances(page: Invariants, refs: Reference[]): RefDistance[] {
  return refs
    .map((ref) => {
      const scores = componentScores(page, ref.invariants);
      const drivers = (Object.keys(WEIGHTS) as Component[])
        .filter((key) => scores[key] >= 0.8)
        .sort((x, y) => scores[y] - scores[x]);
      return { reference: ref.source, similarity: similarity(page, ref.invariants), drivers };
    })
    .sort((a, b) => b.similarity - a.similarity);
}
