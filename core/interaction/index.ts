/**
 * Signature-interaction ideation, mechanism 1 (scout signal board) and mechanism 2
 * (ideation gate). Pure functions only — no I/O, no CLI wiring.
 *
 * The signal board here is a SEPARATE recommendation input from core/ref/distance.ts.
 * It does NOT read, derive from, or feed into that module's fixed WEIGHTS or Invariants
 * shape, and it must never be wired to alter the ≤0.6 kinship/near-duplicate gate meaning
 * there. Board entries only ever carry named measurements (numbers) and named principles
 * (strings) — screenshots or other raw imagery are refused, per the measurement/principle
 * grounding rule (no visual-mimicry ingestion).
 *
 * The ideation gate below governs whether autonomously generated interaction ideas may
 * proceed; it does not itself perform rendering or ideation. The actual render/ideation
 * runtime is a Phase 2 dependency and lives outside this module.
 */

export interface InteractionSignalInput {
  source: string;
  measurements: Record<string, number>;
  principles: string[];
  /** Never accepted: presence triggers refusal. Typed as `never` to flag misuse at compile time. */
  screenshot?: never;
}

export interface InteractionSignalEntry {
  id: string;
  source: string;
  measurements: Record<string, number>;
  principles: string[];
  kind: 'interaction-signal';
}

export interface InteractionSignalViolation {
  ok: false;
  reason: string;
}

export type InteractionSignalResult = { ok: true; entry: InteractionSignalEntry } | InteractionSignalViolation;

function signalId(source: string, measurements: Record<string, number>, principles: string[]): string {
  const parts = [source, ...Object.keys(measurements).sort(), ...principles.slice().sort()];
  return parts.join('|');
}

/**
 * Builds a scout signal board entry from named measurements/principles. Rejects any input
 * that carries a `screenshot` (or other raw-image) field — the board records interaction
 * measurements and principles only, never source pixels.
 */
export function ingestInteractionSignal(inputs: InteractionSignalInput): InteractionSignalResult {
  if (Object.prototype.hasOwnProperty.call(inputs, 'screenshot')) {
    return { ok: false, reason: 'screenshot rejected: signal board accepts measurements/principles only, no raw imagery' };
  }
  if (!inputs.source || inputs.source.trim() === '') {
    return { ok: false, reason: 'source is required' };
  }
  if (Object.keys(inputs.measurements).length === 0 && inputs.principles.length === 0) {
    return { ok: false, reason: 'at least one measurement or principle is required' };
  }
  return {
    ok: true,
    entry: {
      id: signalId(inputs.source, inputs.measurements, inputs.principles),
      source: inputs.source,
      measurements: { ...inputs.measurements },
      principles: [...inputs.principles],
      kind: 'interaction-signal',
    },
  };
}

export interface IdeationGateInputs {
  registerFit: boolean;
  perfBudgetDeclared: boolean;
  slopClean: boolean;
  handPrecedence: boolean;
  semanticFallbackPresent: boolean;
}

export interface IdeationGateResult {
  permitted: boolean;
  reasons: string[];
}

const GATE_CHECKS: ReadonlyArray<{ key: keyof IdeationGateInputs; reason: string }> = [
  { key: 'registerFit', reason: 'register-fit not satisfied' },
  { key: 'perfBudgetDeclared', reason: 'performance budget not declared' },
  { key: 'slopClean', reason: 'slop check failed' },
  { key: 'handPrecedence', reason: 'hand precedence not honored' },
  { key: 'semanticFallbackPresent', reason: 'non-canvas semantic fallback missing' },
];

/**
 * Autonomous interaction ideation is subordinate to register-fit, performance budget,
 * slop, hand precedence, and non-canvas semantic fallback gates. Ideation is permitted
 * only when every gate is satisfied; autonomy never bypasses a gate.
 */
export function evaluateIdeationGate(inputs: IdeationGateInputs): IdeationGateResult {
  const reasons = GATE_CHECKS.filter(({ key }) => !inputs[key]).map(({ reason }) => reason);
  return { permitted: reasons.length === 0, reasons };
}
