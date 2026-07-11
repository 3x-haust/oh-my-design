export type Hex = string;

/** A style value paired with the token it came from. `token: null` *is* the report. */
export interface Styled {
  value: Hex | number;
  token: string | null;
  /** Set by the DOM reader: false when the browser, not the author, chose this. */
  authored?: boolean;
  /** Set by the DOM reader: the nearest painted ancestor fill, borrowed for contrast. */
  inherited?: boolean;
}

export interface Box { x: number; y: number; w: number; h: number }

export type LayoutMode = 'VERTICAL' | 'HORIZONTAL';

export interface Layout {
  mode: LayoutMode;
  gap: number;
  /** top, right, bottom, left */
  padding: [number, number, number, number];
}

export interface RawNode {
  id: string;
  name: string;
  type: 'FRAME' | 'TEXT';
  path: string;
  parent: string | null;
  box: Box;
  children: string[];
  layout?: Layout;
  fill?: Styled;
  radius?: Styled;
  color?: Hex;
  interactive?: boolean;
  inline?: boolean;

  // Read only so that slop can be detected. Convergence to the mean is invisible
  // node-by-node; it only shows up in the distribution.
  /** The element's own text, trimmed, capped. Empty for containers. */
  text?: string;
  /** Heading level, 1-6. Set only for h1..h6. */
  heading?: number;
  shadow?: Styled;
  /** The raw `background-image` when it is a gradient. */
  gradient?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';

  // Typography, set only on text-bearing nodes.
  /** The first font-family in the stack, unquoted and lowercased ("inter", "georgia"). */
  fontFamily?: string;
  /** Computed font-size in px, rounded. */
  fontSize?: number;
  /** Computed font-weight, numeric. */
  fontWeight?: number;
  /** line-height as a ratio to font-size, 2dp. 'normal' resolves to 1.2. */
  lineHeight?: number;

  /** Set on any node with a non-zero transition-duration or a named animation. */
  motion?: {
    /** ms, rounded. Transition AND animation durations both land here; zero-length transitions are dropped. */
    durations: number[];
    /** Named (i.e. not `none`) CSS animations running on this node. */
    animationNames: string[];
    /** Timing functions in play on this node, e.g. "ease-out", "cubic-bezier(...)". */
    easings: string[];
    /**
     * CSS properties being transitioned (from transition-property). Only specific property
     * names are included; 'all' and 'none' are excluded so MOTION-LAYOUT-THRASH can check
     * for named layout properties (width/height/top/left/margin) deterministically without
     * false-positives from the 'all' shorthand.
     */
    properties?: string[];
  };
}

/**
 * Everything a critic would otherwise have to count. Precomputed on purpose: a language
 * model asked to measure a contrast ratio will be right most of the time, and a designer
 * only has to catch it being wrong once to stop trusting the tool.
 */
export interface Computed {
  depth: number;
  /** null at the root. Text sits on its own surface; a container is judged against its parent. */
  contrastWithParent: number | null;
  /** Element-wise mode across siblings, excluding self — an outlier cannot vote for itself. */
  siblingPaddingMode: [number, number, number, number] | null;
  tokenCoverage: number;
  hitArea: { w: number; h: number };
  isInteractive: boolean;
  /**
   * How many siblings share this node's shape: same tag, same child count, same radius
   * and shadow. Three of them in a row is the feature-card grid every generated landing
   * page reaches for when nobody decided what matters most.
   */
  identicalSiblings: number;
}

export type Node = RawNode & { computed: Computed };

export interface Stats {
  spacingHistogram: Record<string, number>;
  colorHistogram: Record<string, number>;
  orphanStyles: Hex[];
  componentReuse: Record<string, number>;

  /** Distributions, because a monoculture is a property of the whole, not of any part. */
  radiusHistogram: Record<string, number>;
  shadowHistogram: Record<string, number>;
  /** Fraction of text-bearing nodes that are centred. 0..1 */
  centeredTextRatio: number;
  /** Every gradient on the page, verbatim. */
  gradients: string[];
}

export interface RawIr {
  meta?: Record<string, unknown>;
  tokens?: Record<string, string>;
  nodes: RawNode[];
}

export interface Ir extends RawIr {
  nodes: Node[];
  stats: Stats;
}

export type Severity = 'error' | 'warn';

/** Layer 1 is universal and free. Layer 2 is the team's own frame. Layer 3 never lives here. */
export type Layer = 1 | 2;

/**
 * `a11y` and `system` are defects: something is measurably wrong.
 * `slop` is different. Nothing here is broken — the design has simply converged on the
 * mean of everything the model has seen. Each rule is a heuristic and can be wrong about
 * a deliberate choice, which is why every one of them is a warning and none is an error.
 * `motion` covers craft defects in animation execution: missing reduced-motion support,
 * layout thrash, uniform rhythm. Separate from `slop` because these are implementation
 * correctness issues, not design-mean convergence failures.
 */
export type Category = 'a11y' | 'system' | 'slop' | 'motion';

export interface Rule {
  id: string;
  layer: Layer;
  category: Category;
  severity: Severity;
  /** JS expression over `node`, `ir`. Truthy selects the node. */
  when: string;
  /** JS expression over `node`, `ir`. The quantity under test. */
  value?: string;
  /** JS expression over `node`, `ir`, `value`. Falsy raises a violation. */
  assert: string;
  message: string;
  fix?: string;
}

export type RuleValue = string | number | boolean | null | number[] | { w: number; h: number };

export interface Violation {
  id: string;
  severity: Severity;
  layer: Layer;
  category: Category;
  nodeId: string;
  path: string;
  value: RuleValue;
  message: string;
}

/** A record of what the problem is believed to be. The loop rewrites it; nobody signs it. */
export interface Frame {
  why?: string;
  generator?: string;
  revision?: number;
  writtenAt?: string;
  reframedAt?: string;
  body: string;
  [key: string]: unknown;
}

/**
 * What a reference actually is: not a picture, a set of measurements.
 *
 * Jansson & Smith (1991) showed that designers reproduce the features of an example even
 * after its flaws are pointed out — across four separate tasks. Hand a model a screenshot
 * and it will produce a knockoff, which is anonymity wearing a different coat. Hand it the
 * numbers and the reasoning behind them, and it has to think.
 */
export interface Invariants {
  /** Spacing values carrying the design, smallest first. Zero is excluded: on a real page it is ~80% of all values. */
  spacingLadder: number[];
  /** Corner radii carrying the design. A single rung is a monoculture. */
  radiusLadder: number[];
  /**
   * Distinct box-shadows that are actually elevation. Hairline shadows (`0 0 0 1px`) are
   * borders drawn as shadows and are not counted — Linear has five distinct shadows and
   * four of them are hairlines.
   */
  elevationLevels: number;
  /** Fraction of text-bearing nodes that are centred. 0..1 */
  centeredRatio: number;
  /** Of the styles that could carry a token, the fraction that do. 0..1 */
  tokenCoverage: number;
  /** Mean sum of the four paddings on nodes that declare any. Higher is airier. */
  paddingWeight: number;

  // Measurements, not vibes: a generic serif-heading dark blog is invisible to spacing
  // and radius ladders alone. These six catch the two things that used to slip through —
  // typography and motion.
  /** Distinct text font sizes carrying the design, ladder-cut, ascending. */
  typeScale: number[];
  /** Distinct first-families found on text, sorted. */
  fontFamilies: string[];
  /** Distinct text font weights carrying the design, ladder-cut, ascending. */
  weightLadder: number[];
  /** Distinct transition/animation durations (ms) carrying the design, ladder-cut, ascending. */
  motionDurations: number[];
  /** Distinct timing functions in use, sorted. */
  easingVocab: string[];
  /** Fraction of all nodes carrying any motion (transition or animation). 0..1, 4dp. */
  animatedShare: number;

  // Interaction states are unmeasured elsewhere: a dead-on-hover button and a missing
  // focus ring both look identical in a static screenshot. These read the page's actual
  // behaviour, probed live (core/render/index.ts), not its resting state.
  /** hoverResponsive / probed, 2dp. 0 when probed is 0 or the probe failed (unmeasured). */
  hoverCoverage: number;
  /** focusVisible / tabStops, 2dp. 0 when tabStops is 0 or the probe failed (unmeasured). */
  focusCoverage: number;

  /**
   * CSS properties actually animated, collected from the live motion probe via
   * document.getAnimations({subtree:true}). Sorted, deduplicated.
   *
   * NOTE: rAF-driven libraries (GSAP, Anime.js) animate via requestAnimationFrame and
   * do not register with the browser's Animation API. A GSAP-only page reads as [] here —
   * that is a correct measurement of what getAnimations() can see, not a probe failure.
   * Only CSS animations, CSS transitions (WAAPI path), and explicit WAAPI calls (including
   * Framer Motion's WAAPI path) appear here.
   */
  animatedProperties: string[];
  /**
   * True when at least one stylesheet contains a @media (prefers-reduced-motion) block.
   * False when the probe was not run or found no such block.
   */
  hasReducedMotion: boolean;
  /**
   * Scroll choreography sampled at 25%, 50%, 75%, 100% of viewport height.
   * step: 1-indexed scroll step; fired: running animations at that position;
   * entered: in-viewport elements with a non-zero transition or animation at that position.
   * Empty when the probe was not run.
   */
  scrollChoreography: Array<{ step: number; fired: number; entered: number }>;
}

/**
 * Live motion probe data attached to ir.meta.motion by probeMotion() in
 * core/render/index.ts. Absent on IRs captured before this probe was added;
 * all consuming code reads defensively (presence check before access).
 *
 * PROBE LIMIT: rAF-driven libraries (GSAP, Anime.js) animate via requestAnimationFrame
 * and do not register with document.getAnimations(). Their effects are invisible to this
 * probe — a GSAP-only page reports animatedProperties: []. Only CSS animations, CSS
 * transitions exposed via WAAPI, and explicit WAAPI calls (Framer Motion's WAAPI path)
 * are captured. This limit is surfaced in Invariants.animatedProperties.
 */
export interface MotionMeasurement {
  /** Animation states sampled at t=0ms, t=500ms, t=1500ms after load. */
  snapshots: Array<{
    t: number;
    animations: Array<{ duration: number; easing: string; properties: string[]; playState: string }>;
  }>;
  /** Union of all animated CSS properties across all snapshots, sorted. */
  animatedProperties: string[];
  /** True when at least one stylesheet has a @media (prefers-reduced-motion) block. */
  hasReducedMotion: boolean;
  /**
   * Scroll-triggered choreography: per 25%vh step, animation count and animated-element
   * count visible at that scroll position.
   */
  scrollChoreography: Array<{ step: number; fired: number; entered: number }>;
}

/**
 * How closely a reference was looked at.
 *
 * `page`      the whole thing — its overall feel, its rhythm
 * `component` one part of it, scoped by a CSS selector: a search bar, a single button
 * `image`     a picture. A screenshot, a Pinterest pin, a photo of a book cover.
 */
export type RefKind = 'page' | 'component' | 'image';

export interface Reference {
  source: string;
  component: string;
  kind: RefKind;
  capturedAt: string;
  /** The CSS selector the measurements were taken from. Absent for `page` and `image`. */
  selector?: string;
  /**
   * Null for an image, and the type says so on purpose. Pixels cannot be measured this way:
   * there is no spacing ladder to read out of a JPEG. An image reference carries reasoning
   * and nothing else, which also means `ref distance` cannot check it for cloning.
   */
  invariants: Invariants | null;
  /** Why it was built that way. Written by a model that looked, then closed the tab. */
  principles: string[];
  /**
   * Number of slop-category rule violations found at capture time. Absent on references
   * captured before this field was introduced — treat absence as 0 at the usage site.
   * Two or more findings is a contamination signal: board only as an anti-reference.
   */
  slopCount?: number;
  /**
   * Who provided this URL. `'user'` when the URL came directly from the brief and was added
   * with `--from-user`; `'scout'` when the scout found it autonomously. Absent on records
   * captured before this field was introduced — treat absence as `'scout'` at usage sites.
   */
  origin?: 'user' | 'scout';
}

/** How close a page sits to a reference. 1 is identical; the warning threshold is 0.6. */
export interface RefDistance {
  reference: string;
  similarity: number;
  /** Which invariants drove the score, most-similar first. */
  drivers: string[];
}

/**
 * One `omd check` run, appended to `.omd/history.jsonl`.
 *
 * Coach cannot exist without this. "You were told about contrast forty-one times" is a
 * claim about the past, and until now nothing remembered the past: check printed and exited.
 */
export interface Run {
  ts: string;
  page: string;
  /** ruleId -> how many nodes violated it in this run. */
  counts: Record<string, number>;
  total: number;
}

export interface Recurring {
  rule: string;
  category: Category;
  /** Violations across every run. */
  total: number;
  /** How many distinct runs it showed up in. */
  runs: number;
  trend: 'improving' | 'worsening' | 'flat' | 'insufficient';
  /** Percent change between the first and second half of the runs. Null when insufficient. */
  changePct: number | null;
}

/**
 * What the user keeps getting wrong — skill, not taste.
 *
 * Taste ("you prefer dense layouts") has no right answer: professional designers agree at
 * α = 0.248. Skill ("you keep missing contrast") has one. The two must never be mixed, so
 * Coach never reads `.omd/taste/`.
 */
export interface CoachReport {
  runs: number;
  span: { from: string; to: string } | null;
  recurring: Recurring[];
  /** Slop rules the user overruled in decisions.md, and how often. */
  overrules: { rule: string; count: number }[];
  /** False when there is too little history to claim a trend. Say so rather than invent one. */
  confident: boolean;
}

export interface Choice {
  ts: string;
  among: string[];
  chose: string;
  why: string | null;
  generator: string | null;
}

// ── adapters ──

export type Host = 'codex' | 'claude';

export interface AbstractHook {
  id: string;
  event: string;
  matcher: string;
  command: string;
  timeout: number;
  statusMessage: string;
  codexFileName: string;
}

export interface AbstractAgent {
  name: string;
  description: string;
  reasoning: string;
  model: string;
  allow?: string[];
  deny?: string[];
  instructions: string;
}

export interface HookCommand {
  type: 'command';
  command: string;
  timeout: number;
  statusMessage?: string;
}

export interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
}

/** What a host actually loads: events -> matchers -> commands. */
export interface HookFile {
  hooks: Record<string, HookEntry[]>;
}

export interface Emitted {
  files: Record<string, unknown>;
}
