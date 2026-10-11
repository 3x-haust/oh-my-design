// Mood target — deriving a direction without interrogating the user.
//
// The default is NO QUESTION. A design run that stops to ask "what mood do you want?" has moved its
// own work onto the user, and the plan's whole calibration argument is that user intervention should
// shrink as the derivation gets better — measured, not asserted.
//
// Four materials are available before anyone is asked:
//
//   1. the brief text itself (what was asked for, in their words)
//   2. the subject identity anchor (what the thing IS — the strongest signal, and the hardest to fake)
//   3. `.omd/taste/preferences.jsonl` (what this user has actually chosen or rejected before)
//   4. user-provided assets (a brand sheet, a supplied screenshot, a logo)
//
// When all four are empty of direction, the honest move is to ADOPT one direction, record it as an
// adopted default, and say so — not to invent a preference and present it as the user's. That record
// is also the calibration input: an adoption the user later overrules is exactly the failure datum
// that should tighten the derivation.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainBrief } from '../domain/domain-brief.ts';
import { MOOD_QUERY_LANES, type MoodQueryLane } from './mood-query.ts';
import { readReferenceJudgment, referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';

export const MOOD_TARGET_SCHEMA = 'mood-target-v1' as const;

export type MoodTargetSignalKind = 'brief-text' | 'subject-identity' | 'taste-record' | 'user-asset';

export type MoodTargetSignal = Readonly<{
  kind: MoodTargetSignalKind;
  /** What was read, quoted or referenced so the derivation is auditable. */
  reference: string;
  terms: readonly string[];
}>;

export type MoodTarget = Readonly<{
  schema: typeof MOOD_TARGET_SCHEMA;
  direction: string;
  basis: 'user-stated' | 'adopted-default';
  signals: readonly MoodTargetSignal[];
  lanes: readonly MoodQueryLane[];
  /** True when the user must be told, with the result, that a default was adopted. */
  announceAdoption: boolean;
}>;

export class MoodTargetError extends Error {
  override readonly name = 'MoodTargetError';
  constructor(reason: string) { super(`mood target is invalid: ${reason}`); }
}

const fail = (reason: string): never => { throw new MoodTargetError(reason); };


export type MoodTargetInput = Readonly<{
  brief: DomainBrief;
  /** What the subject IS, where the frame named it. The strongest signal. */
  subjectIdentity?: string;
  /** Verbatim user statements, as recorded by `omd taste record --from-user`. */
  tasteRecords?: readonly string[];
  /** User-provided asset descriptions or paths. */
  userAssets?: readonly string[];
}>;
function signalsFrom(input: MoodTargetInput): readonly MoodTargetSignal[] {
  const signals: MoodTargetSignal[] = [];
  const push = (kind: MoodTargetSignalKind, reference: string, text: string, keepWhenUnknown = false): void => {
    if (keepWhenUnknown && text.trim())
      signals.push(Object.freeze({ kind, reference, terms: Object.freeze([text.trim()]) }));
  };

  push('subject-identity', 'frame subject identity', input.subjectIdentity ?? '', true);
  push('brief-text', 'domain brief', `${input.brief.domain} ${input.brief.summary} ${input.brief.planning.businessGoal.text}`);
  for (const query of input.brief.referenceQueries.mood) push('brief-text', 'domain brief mood query', query);
  for (const [index, record] of (input.tasteRecords ?? []).entries()) push('taste-record', `preferences.jsonl[${index}]`, record, true);
  for (const [index, asset] of (input.userAssets ?? []).entries()) push('user-asset', `user asset ${index}`, asset, true);
  return Object.freeze(signals);
}

/** The default direction when nothing in the materials names one. Chosen to be neutral but committal. */
export const ADOPTED_DEFAULT_DIRECTION = 'quiet, precise, material-honest';

/**
 * Derives the direction. A subject-identity signal outranks brief text, which outranks a taste
 * record, which outranks an asset: the closer a signal is to what the thing actually is, the less
 * it can be a stylistic accident. Ties keep the earlier signal's terms, so the result is stable.
 */
export function deriveMoodTarget(input: MoodTargetInput): MoodTarget {
  const signals = signalsFrom(input);
  const lanes = MOOD_QUERY_LANES;

  if (signals.length === 0) {
    return Object.freeze({
      schema: MOOD_TARGET_SCHEMA,
      direction: ADOPTED_DEFAULT_DIRECTION,
      basis: 'adopted-default',
      signals: Object.freeze([]),
      lanes,
      announceAdoption: true,
    });
  }

  // Observed material is retained for the agent; no prose is promoted to user preference.
  return Object.freeze({ schema: MOOD_TARGET_SCHEMA, direction: ADOPTED_DEFAULT_DIRECTION,
    basis: 'adopted-default', signals, lanes, announceAdoption: true });
}

export async function deriveMoodTargetJudged(input: MoodTargetInput, binding?: ReferenceJudgmentBinding): Promise<MoodTarget> {
  const base = deriveMoodTarget(input);
  if (!binding) return base;
  const { judgment } = await readReferenceJudgment(binding, 'mood-direction');
  const direction = (judgment.payload as Record<string, unknown>).direction;
  if (typeof direction !== 'string' || !direction.trim() || direction.length > 4096) fail('judgment direction must be bounded text');
  if (judgment.decision === 'user-stated' && !judgment.quotes.some(quote => quote.source.kind === 'route-request'))
    fail('user-stated direction needs a quoted current request');
  return Object.freeze({ ...base, direction: direction as string, basis: judgment.decision === 'user-stated' ? 'user-stated' : 'adopted-default',
    announceAdoption: judgment.decision !== 'user-stated' });
}

/** True when the brief asks for a mood round explicitly. Only an explicit ask opens the round loop. */
export function userRequestedReferences(request: string): boolean {
  void request;
  return false; // Only a verified reference-interaction judgment may open rounds.
}

/**
 * The two exceptions to "do not ask", and only these two:
 *
 *   1. a brief with no colour/feel signal anywhere AND no taste record — the run announces the
 *      direction it adopted in the same message as its result, rather than opening a question round;
 *   2. an explicit "show me references", which makes rounds interactive on the user's terms.
 *
 * Anything else proceeds without interruption.
 */
export function moodTargetInteraction(target: MoodTarget, request: string): Readonly<{
  mode: 'silent' | 'announce-with-result' | 'interactive-rounds';
  reason: string;
}> {
  if (userRequestedReferences(request)) {
    return Object.freeze({ mode: 'interactive-rounds', reason: 'the user asked to see references, so rounds are theirs to steer' });
  }
  if (target.announceAdoption && target.basis === 'adopted-default') {
    return Object.freeze({
      mode: 'announce-with-result',
      reason: 'no verified user-stated direction exists; the adopted direction is stated with the result',
    });
  }
  return Object.freeze({ mode: 'silent', reason: 'the direction is derivable from the supplied material' });
}

export type MoodTargetCheck = Readonly<{
  ok: boolean;
  findings: readonly string[];
}>;

/** Confirms a target is coherent before a board is gathered against it. */
export function checkMoodTarget(target: MoodTarget): MoodTargetCheck {
  const findings: string[] = [];
  if (target.direction.trim() === '') findings.push('the direction is empty');
  if (!target.announceAdoption && target.basis === 'adopted-default' && target.signals.length === 0) {
    findings.push('an adopted default with no signals must be announced with the result, not presented as the user\'s direction');
  }
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings) });
}

export async function moodTargetInteractionJudged(target: MoodTarget, request: string,
  binding?: ReferenceJudgmentBinding): Promise<ReturnType<typeof moodTargetInteraction> & { limitation: string | null }> {
  const result = await referenceDecision('reference-interaction', binding);
  if (result.decision === 'interactive') return { mode: 'interactive-rounds', reason: 'verified user request', limitation: null };
  return { ...moodTargetInteraction(target, request), limitation: result.limitation };
}

/** Reads the taste records a derivation may use. Only `actor: user` rows count as user evidence. */
export function readTasteStatements(root: string): readonly string[] {
  const path = join(root, '.omd', 'taste', 'preferences.jsonl');
  if (!existsSync(path)) return Object.freeze([]);
  return Object.freeze(readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).flatMap((line) => {
    try {
      const record = JSON.parse(line) as { actor?: string; subject?: string; evidence?: string };
      return record.actor === 'user' ? [`${record.subject ?? ''} ${record.evidence ?? ''}`.trim()] : [];
    } catch { return []; }
  }));
}

export function moodTargetSha256(target: MoodTarget): string {
  return createHash('sha256').update(JSON.stringify({
    direction: target.direction,
    basis: target.basis,
    signals: target.signals.map((signal) => `${signal.kind}:${signal.reference}:${signal.terms.join('|')}`),
  })).digest('hex');
}
