// Novelty enforcement — the machinery that keeps candidates from collapsing into one.
//
// Isolated generators already exist: each candidate is produced without seeing the others, which is
// what makes them independent rather than variations on the first idea. Two failure modes survive
// that isolation, and this module closes both:
//
//   1. Every generator aims at the same target, so they converge on the same answer from different
//      directions. Fixed by assigning each generator a DIFFERENT anti-reference — a distinct
//      "do not end up looking like this" seed. Anti-reference is already a first-class reference
//      state (`reference-selection.ts`), so this reuses it rather than inventing a second concept.
//
//   2. Two candidates still land close together. Fixed by measuring the pair in the shared visual
//      space (`core/visual-vector.ts`) and discarding the later one, because two candidates that
//      close are one candidate counted twice, and the choice between them is not a choice.
//
// Discards are recorded with their reason. A silently dropped candidate looks like it was never
// generated, and the run loses the evidence that its own generators were not independent.

import { createHash } from 'node:crypto';
import {
  toVisualVector,
  visualVectorDistance,
  type RenderLoads,
} from '../visual-vector.ts';
import type { Invariants } from '../types.ts';
import { NEAR_DUPLICATE_FLOOR } from './reference-gates.ts';

export const NOVELTY_SCHEMA = 'candidate-novelty-v1' as const;

/** How many distinct anti-reference seeds a run of N generators may draw from. */
export const MAX_ANTI_REFERENCE_SEEDS = 8;

export type NoveltyCandidate = Readonly<{
  id: string;
  generator: string;
  invariants: Invariants;
  loads?: RenderLoads;
}>;

export type AntiReferenceSeed = Readonly<{
  id: string;
  /** What this generator must not converge on, in one clause. */
  avoid: string;
}>;

export type CandidateDecision = Readonly<{
  candidateId: string;
  generator: string;
  outcome: 'kept' | 'discarded';
  /** Present when discarded: the candidate it collapsed into, and the measured distance. */
  collapsedInto?: string;
  distance?: number;
  reason: string;
}>;

/**
 * Assigns one anti-reference seed per generator, deterministically and without repetition while the
 * seed pool allows it. Repetition is lawful only once distinct seeds run out, and is then recorded,
 * since two generators told to avoid the same thing are less independent than the run intends.
 */
export function assignAntiReferenceSeeds(
  generators: readonly string[],
  seeds: readonly AntiReferenceSeed[],
): readonly { generator: string; seed: AntiReferenceSeed; reused: boolean }[] {
  if (generators.length === 0) return Object.freeze([]);
  if (seeds.length === 0) {
    throw new Error('novelty requires at least one anti-reference seed; a generator with nothing to avoid converges on the mean');
  }
  if (seeds.length > MAX_ANTI_REFERENCE_SEEDS) {
    throw new Error(`anti-reference seeds are bounded to ${MAX_ANTI_REFERENCE_SEEDS}`);
  }
  const pool = [...seeds].sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(generators.map((generator, index) => Object.freeze({
    generator,
    seed: pool[index % pool.length]!,
    reused: index >= pool.length,
  })));
}

/**
 * The seeds a run can draw on when it has nothing else: the tells this system exists to avoid, each
 * phrased as a thing a generator must not become. Drawn from named conditions rather than a style
 * list, so a seed stays meaningful as aesthetics drift.
 */
export const DEFAULT_ANTI_REFERENCE_SEEDS: readonly AntiReferenceSeed[] = Object.freeze([
  Object.freeze({ id: 'even-grid-sameness', avoid: 'every section landing on the same width, gap, and weight' }),
  Object.freeze({ id: 'centred-everything', avoid: 'centring every block as the default composition' }),
  Object.freeze({ id: 'uniform-emphasis', avoid: 'giving every element equal visual weight so nothing leads' }),
  Object.freeze({ id: 'decoration-without-job', avoid: 'ornament that carries no task, brand, or hierarchy consequence' }),
  Object.freeze({ id: 'single-rung-spacing', avoid: 'one spacing value repeated until the page has no rhythm' }),
  Object.freeze({ id: 'generic-title-subtitle', avoid: 'a heading followed automatically by explanatory subtitle copy' }),
]);

/**
 * Discards near-duplicate candidates. The first candidate in a colliding pair is kept: it exists,
 * it was generated independently, and discarding it would reward whoever happened to be listed
 * second rather than any property of the work.
 */
export function discardNearDuplicates(
  candidates: readonly NoveltyCandidate[],
  floor = NEAR_DUPLICATE_FLOOR,
): readonly CandidateDecision[] {
  const kept: { candidate: NoveltyCandidate; vector: ReturnType<typeof toVisualVector> }[] = [];
  const decisions: CandidateDecision[] = [];

  for (const candidate of candidates) {
    const vector = toVisualVector({ invariants: candidate.invariants, ...(candidate.loads === undefined ? {} : { loads: candidate.loads }) });
    let nearest: { id: string; distance: number } | null = null;
    for (const existing of kept) {
      const distance = visualVectorDistance(vector, existing.vector).distance;
      if (!Number.isFinite(distance)) continue;
      if (nearest === null || distance < nearest.distance) nearest = { id: existing.candidate.id, distance };
    }
    if (nearest !== null && nearest.distance < floor) {
      decisions.push(Object.freeze({
        candidateId: candidate.id,
        generator: candidate.generator,
        outcome: 'discarded' as const,
        collapsedInto: nearest.id,
        distance: nearest.distance,
        reason: `sits ${nearest.distance.toFixed(3)} from ${nearest.id}, below the ${floor} near-duplicate floor. Two candidates this close are one candidate counted twice, so keeping both would present a choice that is not one.`,
      }));
      continue;
    }
    kept.push({ candidate, vector });
    decisions.push(Object.freeze({
      candidateId: candidate.id,
      generator: candidate.generator,
      outcome: 'kept' as const,
      reason: nearest === null
        ? 'the first candidate in this run'
        : `sits ${nearest.distance.toFixed(3)} from ${nearest.id}, above the ${floor} near-duplicate floor`,
    }));
  }

  return Object.freeze(decisions);
}

export function keptCandidateIds(decisions: readonly CandidateDecision[]): readonly string[] {
  return Object.freeze(decisions.filter((decision) => decision.outcome === 'kept').map((decision) => decision.candidateId));
}

export function discardedCandidateIds(decisions: readonly CandidateDecision[]): readonly string[] {
  return Object.freeze(decisions.filter((decision) => decision.outcome === 'discarded').map((decision) => decision.candidateId));
}

/**
 * The record writer's row: the decision log already owns `.omd/decisions.md`, so this returns the
 * lines to append rather than writing them, keeping one writer for that file.
 */
export function candidateDecisionLines(
  decisions: readonly CandidateDecision[],
  seeds: readonly { generator: string; seed: AntiReferenceSeed; reused: boolean }[],
): readonly string[] {
  const seedByGenerator = new Map(seeds.map((entry) => [entry.generator, entry]));
  return Object.freeze(decisions.map((decision) => {
    const seed = seedByGenerator.get(decision.generator);
    const seedNote = seed === undefined
      ? ''
      : `; anti-reference \`${seed.seed.id}\` (${seed.seed.avoid})${seed.reused ? ' — reused, so this generator shares its avoid-target' : ''}`;
    const outcome = decision.outcome === 'kept' ? 'kept' : `discarded into \`${decision.collapsedInto}\``;
    return `- \`${decision.candidateId}\` (${decision.generator}): ${outcome} — ${decision.reason}${seedNote}`;
  }));
}

export function noveltySha256(decisions: readonly CandidateDecision[]): string {
  return createHash('sha256').update(JSON.stringify(decisions.map((decision) => ({
    id: decision.candidateId,
    generator: decision.generator,
    outcome: decision.outcome,
    collapsedInto: decision.collapsedInto ?? null,
  })))).digest('hex');
}
