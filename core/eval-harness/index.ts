/**
 * Phase 0 eval harness — pure decision core.
 *
 * Pairwise before/after blind-choose is the ONLY gating signal. Quantitative metrics
 * (non-text carrier density, motion presence, image-diff score/threshold/pass — see
 * `DiffResult` in core/figma/diff.ts for that shape) and Awwwards-style category
 * scores (design/usability/creativity/content) are advisory: they may explain or
 * corroborate a verdict, but they can never flip `gate` from what blindChoose decided.
 *
 * NOT implemented here: a live render+blind-choose capture adapter (rendering both
 * variants and recording a human/model's blind pick) is a Phase 2 dependency — it
 * needs a browser/render runtime (see core/render/index.ts's Playwright-backed
 * `withPage`). This module is the pure decision core that consumes pre-captured
 * blindChoose signals; it does not render or capture anything itself. Follow the
 * pure-core/adapter split used by core/composition-contract/index.ts
 * (validateCompositionContractSource = pure, validateCompositionContract = adapter):
 * a future `captureBlindChoose(...)` adapter would live alongside this file once the
 * render runtime is available, calling into `evaluateOutput` below for the decision.
 */

export type BlindChooseWinner = 'after' | 'before' | 'tie';

export interface BlindChooseSignal {
  winner: BlindChooseWinner;
  /** Confidence in [0, 1], when the capture method can report one. */
  confidence?: number;
}

export type Register = 'quiet' | 'confident' | 'showpiece';

export interface QuantitativeSignals {
  /** 0–1 fraction of the layout carried by non-text elements (imagery, shape, color). */
  nonTextCarrierDensity?: number | undefined;
  motionPresent?: boolean | undefined;
  /** Reserved for image-diff-style signals (score/threshold/pass) or other numeric/boolean metrics. */
  [key: string]: number | boolean | undefined;
}

export interface AwwwardsSignals {
  design?: number | undefined;
  usability?: number | undefined;
  creativity?: number | undefined;
  content?: number | undefined;
}

export interface EvalHarnessInputs {
  blindChoose: BlindChooseSignal;
  register?: Register;
  quantitative?: QuantitativeSignals;
  awwwards?: AwwwardsSignals;
}

export interface EvalAdvisory {
  source: 'quantitative' | 'awwwards';
  message: string;
  gating: false;
}

export interface EvalVerdict {
  gate: 'pass' | 'fail';
  gatingSignal: 'blind-choose';
  reason: string;
  advisories: EvalAdvisory[];
}

/** Showpiece register requires a stronger blind-choose confidence to pass the gate. */
const SHOWPIECE_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Determines the gate from blindChoose alone. Quiet/confident/showpiece registers only
 * adjust how blindChoose itself is interpreted (e.g. a showpiece needs a confident win,
 * a quiet output is satisfied by any non-"before" verdict) — they never let quantitative
 * or Awwwards signals override the blind-choose outcome.
 */
function gateFromBlindChoose(blindChoose: BlindChooseSignal, register: Register): { pass: boolean; reason: string } {
  const { winner, confidence } = blindChoose;

  if (winner === 'before') {
    return { pass: false, reason: 'blind-choose winner was "before": the after variant did not improve on the baseline' };
  }

  if (winner === 'tie') {
    if (register === 'quiet' && confidence === undefined) {
      // Quiet register: a tie with no reported confidence is treated as "no regression",
      // which is the bar quiet output is held to. Still requires an explicit tie, never
      // inferred from quantitative/Awwwards data.
      return { pass: true, reason: 'blind-choose was a tie and register is "quiet": no regression is sufficient' };
    }
    return { pass: false, reason: 'blind-choose winner was "tie": no clear preference for the after variant' };
  }

  // winner === 'after'
  if (register === 'showpiece') {
    if (confidence === undefined || !Number.isFinite(confidence) || confidence < SHOWPIECE_CONFIDENCE_THRESHOLD) {
      return {
        pass: false,
        reason: `register is "showpiece" and requires blind-choose confidence >= ${SHOWPIECE_CONFIDENCE_THRESHOLD}, got ${confidence ?? 'undefined'}`,
      };
    }
    return { pass: true, reason: `blind-choose winner was "after" with confidence ${confidence} meeting the showpiece threshold` };
  }

  return { pass: true, reason: 'blind-choose winner was "after"' };
}

function quantitativeAdvisories(quantitative: QuantitativeSignals | undefined): EvalAdvisory[] {
  if (!quantitative) return [];
  const advisories: EvalAdvisory[] = [];
  for (const [key, value] of Object.entries(quantitative)) {
    if (value === undefined) continue;
    advisories.push({ source: 'quantitative', message: `${key}: ${value}`, gating: false });
  }
  return advisories;
}

function awwwardsAdvisories(awwwards: AwwwardsSignals | undefined): EvalAdvisory[] {
  if (!awwwards) return [];
  const advisories: EvalAdvisory[] = [];
  for (const [key, value] of Object.entries(awwwards)) {
    if (value === undefined) continue;
    advisories.push({ source: 'awwwards', message: `${key}: ${value}`, gating: false });
  }
  return advisories;
}

/**
 * Pure evaluation core: blind-choose is the sole gating signal (see gateFromBlindChoose).
 * Quantitative metrics and Awwwards category scores are folded into `advisories` only,
 * each explicitly marked `gating: false` — no code path lets them alter `gate`.
 */
export function evaluateOutput(inputs: EvalHarnessInputs): EvalVerdict {
  const register = inputs.register ?? 'confident';
  const { pass, reason } = gateFromBlindChoose(inputs.blindChoose, register);

  const advisories: EvalAdvisory[] = [
    ...quantitativeAdvisories(inputs.quantitative),
    ...awwwardsAdvisories(inputs.awwwards),
  ];

  return {
    gate: pass ? 'pass' : 'fail',
    gatingSignal: 'blind-choose',
    reason,
    advisories,
  };
}

/**
 * One completed refinement round in the RED/GREEN loop. `redCriteria` are the acceptance
 * criteria still failing after this round (empty = GREEN, all met). `evidence` is the durable
 * proof this round actually happened — render paths, verdict artifacts, `omd decision` ids — and
 * is REQUIRED: a round with no evidence does not count. `blindChoose` compares this round's after
 * against its own before, giving the improvement direction.
 */
export interface RefinementRound {
  round: number;
  blindChoose: BlindChooseWinner;
  redCriteria: string[];
  evidence: string[];
}

export interface RefinementLoopInputs {
  rounds: RefinementRound[];
  /** Optional hard cap on rounds. Omit for an unbounded run that stops only on GREEN, a regression, or a plateau. */
  maxRounds?: number;
  /** Rounds to run before a plateau/GREEN stop is honored. Default 1. */
  minRounds?: number;
}

export type RefinementLoopStatus =
  | 'run-first-round'
  | 'continue'
  | 'green'
  | 'regressed'
  | 'plateaued'
  | 'budget-exhausted'
  | 'missing-evidence';

export interface RefinementLoopDecision {
  status: RefinementLoopStatus;
  continueLoop: boolean;
  converged: boolean;
  reason: string;
  roundsRun: number;
  /** The top unmet (RED) criterion to target next when continuing; null otherwise. */
  nextTarget: string | null;
}

/**
 * RED/GREEN refinement-loop controller. It is NOT a blind automatic retry: each round MUST leave
 * evidence, and the loop continues only while the build is still RED (acceptance criteria unmet)
 * AND blind-choose shows the latest round genuinely improved it. By default it is unbounded — it
 * runs until GREEN (all criteria met = done), a regression (revert), a plateau (tie while still
 * RED), or missing evidence. An optional `maxRounds` adds a hard cap on top. This is the deliberate,
 * evidence-driven convergence loop `protocol/human-design-loop.md` permits.
 */
export function evaluateRefinementLoop(inputs: RefinementLoopInputs): RefinementLoopDecision {
  const maxRounds = inputs.maxRounds;
  const minRounds = inputs.minRounds ?? 1;
  const rounds = inputs.rounds;
  const n = rounds.length;

  if (n === 0) {
    return { status: 'run-first-round', continueLoop: true, converged: false, reason: 'no refinement round run yet — run the first round and record its evidence', roundsRun: 0, nextTarget: null };
  }

  const last = rounds[n - 1]!;

  if (last.evidence.length === 0) {
    return { status: 'missing-evidence', continueLoop: false, converged: false, reason: `round ${last.round} recorded no evidence — a refinement round without evidence (renders + blind-choose verdict) does not count; record it before deciding`, roundsRun: n, nextTarget: null };
  }
  if (last.blindChoose === 'before') {
    return { status: 'regressed', continueLoop: false, converged: false, reason: `round ${last.round} regressed (blind-choose favored the before) — revert to the previous build and stop`, roundsRun: n, nextTarget: null };
  }
  if (last.redCriteria.length === 0 && n >= minRounds) {
    return { status: 'green', continueLoop: false, converged: true, reason: `round ${last.round} is GREEN — every acceptance criterion is met; stop`, roundsRun: n, nextTarget: null };
  }
  if (maxRounds !== undefined && n >= maxRounds) {
    return { status: 'budget-exhausted', continueLoop: false, converged: false, reason: `round budget reached (${maxRounds}) — stop with the best build so far; still RED: ${last.redCriteria.join(', ') || '(none reported)'}`, roundsRun: n, nextTarget: null };
  }
  if (last.blindChoose === 'tie' && n >= minRounds) {
    return { status: 'plateaued', continueLoop: false, converged: false, reason: `round ${last.round} plateaued (blind-choose tie) while still RED — no further improvement available; stop and report remaining: ${last.redCriteria.join(', ')}`, roundsRun: n, nextTarget: null };
  }
  return { status: 'continue', continueLoop: true, converged: false, reason: `round ${last.round} improved (blind-choose favored the after) and is still RED — run another round`, roundsRun: n, nextTarget: last.redCriteria[0] ?? null };
}
