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

/** Same idea as `jaccard`, over strings: font families, easing functions. */
function jaccardStrings(a: string[], b: string[]): number {
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
  spacingLadder: 0.12,
  radiusLadder: 0.12,
  typeScale: 0.13,
  fontFamilies: 0.09,
  weightLadder: 0.05,
  motionDurations: 0.06,
  easingVocab: 0.04,
  animatedShare: 0.03,
  elevationLevels: 0.09,
  centeredRatio: 0.07,
  tokenCoverage: 0.07,
  paddingWeight: 0.07,
  // Interaction states: hover-response and focus-visible coverage. .03 each, taken from
  // spacingLadder/radiusLadder (.15 -> .12) so the table still sums to 1.00.
  hoverCoverage: 0.03,
  focusCoverage: 0.03,
} as const;

type Component = keyof typeof WEIGHTS;

function componentScores(a: Invariants, b: Invariants): Record<Component, number> {
  return {
    spacingLadder: jaccard(a.spacingLadder, b.spacingLadder),
    radiusLadder: jaccard(a.radiusLadder, b.radiusLadder),
    typeScale: jaccard(a.typeScale, b.typeScale),
    fontFamilies: jaccardStrings(a.fontFamilies, b.fontFamilies),
    weightLadder: jaccard(a.weightLadder, b.weightLadder),
    motionDurations: jaccard(a.motionDurations, b.motionDurations),
    easingVocab: jaccardStrings(a.easingVocab, b.easingVocab),
    animatedShare: 1 - Math.abs(a.animatedShare - b.animatedShare),
    elevationLevels: ratioDiff(a.elevationLevels, b.elevationLevels),
    centeredRatio: 1 - Math.abs(a.centeredRatio - b.centeredRatio),
    tokenCoverage: 1 - Math.abs(a.tokenCoverage - b.tokenCoverage),
    paddingWeight: logRatio(a.paddingWeight, b.paddingWeight),
    hoverCoverage: 1 - Math.abs(a.hoverCoverage - b.hoverCoverage),
    focusCoverage: 1 - Math.abs(a.focusCoverage - b.focusCoverage),
  };
}

/**
 * Components backed by a ladder/vocabulary array, as opposed to a scalar. Only these can
 * be "unmeasured" on one side — a scalar always has a value (0 is a real measurement, an
 * empty ladder is the absence of one).
 */
const ARRAY_COMPONENTS = [
  'spacingLadder', 'radiusLadder', 'typeScale', 'fontFamilies', 'weightLadder',
  'motionDurations', 'easingVocab',
] as const satisfies readonly Component[];

function arrayFor(inv: Invariants, key: (typeof ARRAY_COMPONENTS)[number]): readonly (number | string)[] {
  return inv[key];
}

/**
 * Scalar components where 0 is ambiguous: a page where every interactive element truly
 * fails to respond scores identically to a page that was never probed at all (an
 * unmeasured pre-interaction reference, or a probe failure). Both read as `hoverCoverage:
 * 0` / `focusCoverage: 0`. Scoring a real page against an old reference with `1 -
 * |a-b|` would then punish it for a coverage gap that was never actually measured on the
 * reference's side — so, like the array components above, exclude the component (and
 * renormalise) whenever either side reads exactly 0.
 */
const ZERO_EXCLUDABLE_COMPONENTS = ['hoverCoverage', 'focusCoverage'] as const satisfies readonly Component[];

/**
 * F1: an empty ladder is not "measured and maximally different" — it is unmeasured. A
 * pre-typography reference defaults typeScale/fontFamilies/weightLadder/motionDurations/
 * easingVocab to `[]` (core/ref/store.ts withInvariantDefaults). Scoring that against a
 * populated ladder with jaccard hits the empty-vs-populated branch (0, not the
 * both-empty-is-1 branch), which the geometric mean then floors to EPSILON and drags the
 * whole product toward zero — collapsing an old reference's similarity to its own,
 * identical page to ~0.08–0.15. Excluding the component when either side is empty (and
 * renormalising the remaining weights) treats "unmeasured" as neutral instead of as a
 * maximal mismatch. Both-empty is excluded too — no longer a reward for two designs that
 * simply never used the feature, since there is nothing there to have agreed on.
 */
function excludedComponents(a: Invariants, b: Invariants): ReadonlySet<Component> {
  const excluded = new Set<Component>();
  for (const key of ARRAY_COMPONENTS) {
    if (arrayFor(a, key).length === 0 || arrayFor(b, key).length === 0) excluded.add(key);
  }
  for (const key of ZERO_EXCLUDABLE_COMPONENTS) {
    if (a[key] === 0 || b[key] === 0) excluded.add(key);
  }
  return excluded;
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
  const excluded = excludedComponents(a, b);
  const keys = (Object.keys(WEIGHTS) as Component[]).filter((key) => !excluded.has(key));

  // F1: if every array component is unmeasured on one side or the other, nothing is left
  // to compare — two totally unmeasured things cannot be distinguished, so treat them as
  // identical rather than maximally different (the old empty-scores-0 behaviour).
  if (keys.length === 0) return 1;

  // Renormalise: the excluded components' weight is redistributed proportionally over
  // what remains, so the included weights still sum to 1.
  const weightSum = keys.reduce((sum, key) => sum + WEIGHTS[key], 0);

  // log(0) is -Infinity, which would make every dissimilar pair score exactly 0 and lose
  // all ordering among them. The floor keeps them comparable.
  const EPSILON = 1e-3;
  let logSum = 0;
  for (const key of keys) logSum += (WEIGHTS[key] / weightSum) * Math.log(Math.max(scores[key], EPSILON));

  return Math.min(1, Math.max(0, Math.exp(logSum)));
}

export function distances(page: Invariants, refs: Reference[]): RefDistance[] {
  return refs
    .filter((ref): ref is Reference & { invariants: Invariants } => ref.invariants !== null)
    .map((ref) => {
      const scores = componentScores(page, ref.invariants);
      const excluded = excludedComponents(page, ref.invariants);
      // F1: drivers are computed from the included components only — an excluded
      // (unmeasured) component cannot have driven the score.
      const drivers = (Object.keys(WEIGHTS) as Component[])
        .filter((key) => !excluded.has(key) && scores[key] >= 0.8)
        .sort((x, y) => scores[y] - scores[x]);
      return { reference: ref.source, similarity: similarity(page, ref.invariants), drivers };
    })
    .sort((a, b) => b.similarity - a.similarity);
}
