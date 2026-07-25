// The award rubric, encoded from the published Awwwards evaluation system.
//
// The main jury scores Design 40% / Usability 30% / Creativity 20% / Content 10%; an Honourable
// Mention is 6.5 or above. Those four axes are human judgements and OMD does not fake a number for
// them — the blind eye owns that verdict.
//
// The Developer Award is different: its published guidelines (authored with the developers behind
// Lenis/darkroom, Osmo, Unseen, Antinomy) score six axes with explicit weights, and every one of
// them is measurable from evidence OMD already collects. That is what this module scores, so the
// harness aims at the industry's own bar instead of an invented internal one.
//
// Pure: takes collected signals, returns axis scores. The caller gathers the signals.

export const DEV_AWARD_WEIGHTS = {
  wpo: 0.2,
  rwd: 0.2,
  markup: 0.15,
  semantics: 0.2,
  animation: 0.15,
  a11y: 0.1,
} as const;

export const MAIN_JURY_WEIGHTS = {
  design: 0.4,
  usability: 0.3,
  creativity: 0.2,
  content: 0.1,
} as const;

/** An Honourable Mention is awarded at this jury score; the Developer Award needs above 7. */
export const HONORABLE_MENTION_FLOOR = 6.5;
export const DEVELOPER_AWARD_FLOOR = 7;

/**
 * No axis may fall below this, whatever the weighted mean says. The harness already holds this
 * principle everywhere else — a floor failure is conjunctive and cannot be averaged away — and
 * without it a page with clean markup and zero motion scores an award on the strength of the axes
 * it happens to satisfy. A jury does not work that way and neither does this.
 */
export const AXIS_FLOOR = 5;

export type DevAxis = keyof typeof DEV_AWARD_WEIGHTS;

export type AxisScore = {
  readonly axis: DevAxis;
  readonly weight: number;
  /** 0–10, or null when no evidence was supplied for this axis. */
  readonly score: number | null;
  /** What the score was derived from, so a reader can audit it. */
  readonly source: string;
};

export type AwardScore = {
  readonly axes: readonly AxisScore[];
  /** Weighted mean over the scored axes only, with their weights renormalised. */
  readonly weighted: number;
  /** Share of the rubric's weight that had evidence. */
  readonly coverage: number;
  readonly verdict: 'no-evidence' | 'below-hm' | 'honourable-mention' | 'developer-award';
  /** Axes scored below `AXIS_FLOOR`; any entry forces the verdict down regardless of the mean. */
  readonly floorFailures: readonly DevAxis[];
};

/** Signals the caller collects; every field is optional and an absent field excludes its axis. */
export type AwardSignals = {
  /** Lighthouse performance score, 0–1. */
  readonly performance?: number;
  /** Deterministic violation counts by category, from `omd check`. */
  readonly violations?: {
    readonly ux?: number;
    readonly hitArea?: number;
    readonly headingOrder?: number;
    readonly system?: number;
    readonly contrast?: number;
    readonly focus?: number;
    readonly token?: number;
  };
  /** True when the page reflows without horizontal overflow at a narrow viewport. */
  readonly mobileReflows?: boolean;
  /** Document-level markup facts. */
  readonly markup?: {
    readonly hasLang: boolean;
    readonly hasTitle: boolean;
    readonly hasViewportMeta: boolean;
    readonly hasDescription: boolean;
    readonly hasOpenGraph: boolean;
    readonly imagesMissingAlt: number;
  };
  /** Motion facts from `craft-capture`. */
  readonly motion?: {
    readonly scrollLinked: boolean;
    readonly peakEnergy: number;
    readonly reducedMotionSafe: boolean;
  };
  /** True when content survives with JavaScript disabled (`omd no-js`). */
  readonly noJsSafe?: boolean;
};

const clamp = (value: number): number => Math.max(0, Math.min(10, value));
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Each violation costs a point, floored at zero — a blunt but auditable and stable mapping. */
const penalise = (base: number, ...counts: (number | undefined)[]): number =>
  clamp(base - counts.reduce<number>((sum, count) => sum + (count ?? 0), 0));

function scoreAxes(signals: AwardSignals): AxisScore[] {
  const v = signals.violations ?? {};
  const axes: AxisScore[] = [];

  axes.push(signals.performance === undefined
    ? { axis: 'wpo', weight: DEV_AWARD_WEIGHTS.wpo, score: null, source: 'no lighthouse report supplied' }
    : { axis: 'wpo', weight: DEV_AWARD_WEIGHTS.wpo, score: clamp(signals.performance * 10), source: 'lighthouse performance score' });

  axes.push(signals.mobileReflows === undefined
    ? { axis: 'rwd', weight: DEV_AWARD_WEIGHTS.rwd, score: null, source: 'no mobile reflow observation supplied' }
    : {
      axis: 'rwd',
      weight: DEV_AWARD_WEIGHTS.rwd,
      score: penalise(signals.mobileReflows ? 10 : 5, v.hitArea, v.ux),
      source: 'mobile reflow + hit-area/ux violations',
    });

  axes.push(signals.markup === undefined
    ? { axis: 'markup', weight: DEV_AWARD_WEIGHTS.markup, score: null, source: 'no document markup facts supplied' }
    : {
      axis: 'markup',
      weight: DEV_AWARD_WEIGHTS.markup,
      score: penalise(
        10,
        signals.markup.hasLang ? 0 : 2,
        signals.markup.hasTitle ? 0 : 2,
        signals.markup.hasViewportMeta ? 0 : 2,
        v.system,
      ),
      source: 'lang/title/viewport meta + system violations',
    });

  axes.push(signals.markup === undefined
    ? { axis: 'semantics', weight: DEV_AWARD_WEIGHTS.semantics, score: null, source: 'no document markup facts supplied' }
    : {
      axis: 'semantics',
      weight: DEV_AWARD_WEIGHTS.semantics,
      score: penalise(
        10,
        signals.markup.hasDescription ? 0 : 1,
        signals.markup.hasOpenGraph ? 0 : 1,
        Math.min(3, signals.markup.imagesMissingAlt),
        v.headingOrder,
      ),
      source: 'description/OpenGraph/alt coverage + heading order',
    });

  axes.push(signals.motion === undefined
    ? { axis: 'animation', weight: DEV_AWARD_WEIGHTS.animation, score: null, source: 'no motion measurement supplied' }
    : {
      axis: 'animation',
      weight: DEV_AWARD_WEIGHTS.animation,
      // Motion is scored on presence, kind, and safety — the guideline's own emphasis
      // ("a consistent animation strategy", "reduced motion", "content accessible with no JS").
      score: clamp(
        (signals.motion.scrollLinked || signals.motion.peakEnergy > 0.01 ? 6 : 0)
        + (signals.motion.reducedMotionSafe ? 2 : 0)
        + (signals.noJsSafe === false ? 0 : 2),
      ),
      source: 'craft-capture motion + reduced-motion + no-JS survival',
    });

  axes.push((v.contrast === undefined && v.focus === undefined && signals.noJsSafe === undefined)
    ? { axis: 'a11y', weight: DEV_AWARD_WEIGHTS.a11y, score: null, source: 'no accessibility observation supplied' }
    : {
      axis: 'a11y',
      weight: DEV_AWARD_WEIGHTS.a11y,
      score: penalise(10, v.contrast, v.focus, signals.noJsSafe === false ? 3 : 0),
      source: 'contrast/focus violations + no-JS content survival',
    });

  return axes;
}

/**
 * Scores a page against the Developer Award rubric from collected signals. Axes with no evidence are
 * excluded and the remaining weights are renormalised, so a partial run reports an honest partial
 * score with its coverage rather than a fabricated whole.
 */
export function scoreAward(signals: AwardSignals): AwardScore {
  const axes = scoreAxes(signals);
  const scored = axes.filter((axis): axis is AxisScore & { score: number } => axis.score !== null);
  const totalWeight = scored.reduce((sum, axis) => sum + axis.weight, 0);
  if (totalWeight === 0) return { axes, weighted: 0, coverage: 0, verdict: 'no-evidence', floorFailures: [] };
  const weighted = round2(scored.reduce((sum, axis) => sum + axis.score * (axis.weight / totalWeight), 0));
  const coverage = round2(totalWeight);
  // Conjunctive: a floor failure on any scored axis is not averaged away.
  const floorFailures = scored.filter((axis) => axis.score < AXIS_FLOOR).map((axis) => axis.axis);
  const verdict = floorFailures.length > 0
    ? 'below-hm'
    : weighted > DEVELOPER_AWARD_FLOOR
      ? 'developer-award'
      : weighted >= HONORABLE_MENTION_FLOOR ? 'honourable-mention' : 'below-hm';
  return { axes, weighted, coverage, verdict, floorFailures };
}
