// Reference gates — the five readings that decide whether a design is distinct, on-task, coherent,
// and lawful.
//
// Every one is a distance in the SAME space (core/visual-vector.ts), which is the whole reason that
// module exists: a slop distance of 0.4, a category-mean distance of 0.4, and a coherence distance of
// 0.4 must mean the same thing or the three gates are three unrelated heuristics wearing one name.
//
// Four of them start advisory, following the precedent in
// `core/composition-contract/visual-richness.ts`: a weighted composite over a drifting aesthetic is
// not calibrated, so it reports and does not fail the build. The fifth is hard from day one because
// it is not an aesthetic judgement — shipping someone else's pixels is a rights violation, not a
// matter of taste.

import { createHash } from 'node:crypto';
import {
  toVisualVector,
  visualVectorCentroid,
  visualVectorDistance,
  type RenderLoads,
  type VisualVector,
} from '../visual-vector.ts';
import type { Invariants } from '../types.ts';
import { moodBytesInProduction, type Moodboard } from './mood.ts';

export const REFERENCE_GATE_SCHEMA = 'reference-gate-v1' as const;

/**
 * Advisory thresholds. Each is a floor (must be at least this far) or a ceiling (must be no further
 * than this), read against a centroid in the shared space.
 */
export const DISTINCTIVENESS_FLOOR = 0.25;
export const CATEGORY_MEAN_FLOOR = 0.18;
export const COHERENCE_CEILING = 0.30;
export const NEAR_DUPLICATE_FLOOR = 0.12;

export type ReferenceGateId =
  | 'DISTINCTIVENESS_FLOOR'
  | 'CATEGORY_MEAN_FLOOR'
  | 'COHERENCE_CEILING'
  | 'NEAR_DUPLICATE'
  | 'MOOD_BYTES_IN_PRODUCTION';

export type ReferenceGateFinding = Readonly<{
  id: ReferenceGateId;
  severity: 'advisory' | 'hard';
  message: string;
  /** The measured distance this reading came from, where there is one. */
  distance?: number;
}>;

export type ReferenceGateInput = Readonly<{
  candidate: { invariants: Invariants; loads?: RenderLoads };
  /** What the domain's ordinary, competent products look like. */
  categoryMean: readonly { invariants: Invariants; loads?: RenderLoads }[];
  slop: readonly { invariants: Invariants; loads?: RenderLoads }[];
  target: readonly { invariants: Invariants; loads?: RenderLoads }[];
  siblings?: readonly { invariants: Invariants; loads?: RenderLoads }[];
}>;

const vectorOf = (entry: { invariants: Invariants; loads?: RenderLoads }): VisualVector =>
  toVisualVector({ invariants: entry.invariants, ...(entry.loads === undefined ? {} : { loads: entry.loads }) });

/** Distance from a centroid, or null when the two share no measured axis. */
function distanceTo(candidate: VisualVector, members: readonly { invariants: Invariants; loads?: RenderLoads }[]): number | null {
  if (members.length === 0) return null;
  const centroid = visualVectorCentroid(members.map(vectorOf));
  const distance = visualVectorDistance(candidate, centroid).distance;
  return Number.isFinite(distance) ? distance : null;
}

/**
 * Reads the four aesthetic gates. Each is independent: a candidate can be distinct from the slop
 * centroid and still sit on the category mean, which is a different problem with a different fix.
 */
export function readReferenceGates(input: ReferenceGateInput): readonly ReferenceGateFinding[] {
  const candidate = vectorOf(input.candidate);
  const findings: ReferenceGateFinding[] = [];

  const distinctiveness = distanceTo(candidate, input.slop);
  if (distinctiveness !== null && distinctiveness < DISTINCTIVENESS_FLOOR) {
    findings.push(Object.freeze({
      id: 'DISTINCTIVENESS_FLOOR',
      severity: 'advisory',
      distance: distinctiveness,
      message: `this candidate sits ${distinctiveness.toFixed(3)} from the slop centroid, below the ${DISTINCTIVENESS_FLOOR} floor. It is close to the shape this system exists to avoid. The fix is a committed choice the candidate has not yet made — a real type voice, a material decision, a composition with a point of view — not a colour swap.`,
    }));
  }

  const categoryMean = distanceTo(candidate, input.categoryMean);
  if (categoryMean !== null && categoryMean < CATEGORY_MEAN_FLOOR) {
    findings.push(Object.freeze({
      id: 'CATEGORY_MEAN_FLOOR',
      severity: 'advisory',
      distance: categoryMean,
      message: `this candidate sits ${categoryMean.toFixed(3)} from the category mean, below the ${CATEGORY_MEAN_FLOOR} floor. Sitting on the mean is what the user has already seen from every competitor; it satisfies the expectation and supplies no reason to choose. Distinctiveness may violate an expectation; a task requirement may not.`,
    }));
  }

  const coherence = distanceTo(candidate, input.target);
  if (coherence !== null && coherence > COHERENCE_CEILING) {
    findings.push(Object.freeze({
      id: 'COHERENCE_CEILING',
      severity: 'advisory',
      distance: coherence,
      message: `this candidate sits ${coherence.toFixed(3)} from the adopted direction, above the ${COHERENCE_CEILING} ceiling. Novelty is not the goal by itself: a design that does not read as the thing it is has traded its task for surprise.`,
    }));
  }

  const siblings = input.siblings ?? [];
  if (siblings.length > 0) {
    const nearest = siblings.map(vectorOf)
      .map((sibling) => visualVectorDistance(candidate, sibling).distance)
      .filter((distance) => Number.isFinite(distance))
      .sort((left, right) => left - right)[0];
    if (nearest !== undefined && nearest < NEAR_DUPLICATE_FLOOR) {
      findings.push(Object.freeze({
        id: 'NEAR_DUPLICATE',
        severity: 'advisory',
        distance: nearest,
        message: `this candidate sits ${nearest.toFixed(3)} from another candidate in the same run, below the ${NEAR_DUPLICATE_FLOOR} floor. Two candidates this close are one candidate counted twice, so the choice between them is not a choice.`,
      }));
    }
  }

  return Object.freeze(findings);
}

/**
 * The hard rights gate, and the only non-advisory member. Mood captures are study material; if one
 * reaches production by path, digest, or identical bytes, that is a rights violation rather than a
 * design opinion, so it fails regardless of what the aesthetic readings say.
 */
export function readMoodRightsGate(
  board: Moodboard,
  sources: readonly { path: string; bytes: Buffer }[],
): readonly ReferenceGateFinding[] {
  const offenders = moodBytesInProduction(board, sources);
  if (offenders.length === 0) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    id: 'MOOD_BYTES_IN_PRODUCTION' as const,
    severity: 'hard' as const,
    message: `${offenders.join(', ')} carry a mood capture's bytes, path, or digest. A moodboard fixes a direction; its pixels are never shipped. Replace the reference with your own material.`,
  })]);
}

export type ReferenceGateReport = Readonly<{
  schema: typeof REFERENCE_GATE_SCHEMA;
  findings: readonly ReferenceGateFinding[];
  /** True when any hard finding is present; advisory findings never set this. */
  blocked: boolean;
}>;

export function referenceGateReport(findings: readonly ReferenceGateFinding[]): ReferenceGateReport {
  return Object.freeze({
    schema: REFERENCE_GATE_SCHEMA,
    findings: Object.freeze([...findings]),
    blocked: findings.some((finding) => finding.severity === 'hard'),
  });
}

/**
 * Slot-level reading for a visual-only crop.
 *
 * One crop may not supply several destination zones: a single image stretched across hero and proof
 * is collage, not transfer. The comparison is between the crop's declared destination and each zone
 * it claims, so the finding names the zones rather than the file.
 */
export function readSlotDestinations(input: Readonly<{
  cropId: string;
  destinations: readonly { zoneId: string; invariants: Invariants; loads?: RenderLoads }[];
}>): readonly ReferenceGateFinding[] {
  if (input.destinations.length <= 1) return Object.freeze([]);
  const vectors = input.destinations.map((destination) => vectorOf(destination));
  const centroid = visualVectorCentroid(vectors);
  const incoherent = input.destinations.filter((destination, index) =>
    visualVectorDistance(vectors[index]!, centroid).distance > COHERENCE_CEILING);
  if (incoherent.length === 0) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    id: 'COHERENCE_CEILING' as const,
    severity: 'advisory' as const,
    message: `crop ${input.cropId} is claimed for ${input.destinations.length} destinations (${input.destinations.map((destination) => destination.zoneId).join(', ')}), and ${incoherent.map((destination) => destination.zoneId).join(', ')} ${incoherent.length === 1 ? 'sits' : 'sit'} far from the others. One crop supplying several zones is a collage; each zone's evidence should come from the part that solves it.`,
  })]);
}

/** Stable identity so a gate report can be bound to the candidate it judged. */
export function referenceGateSha256(report: ReferenceGateReport): string {
  return createHash('sha256').update(JSON.stringify({
    findings: report.findings.map((finding) => `${finding.id}:${finding.severity}:${finding.distance ?? 'none'}`),
  })).digest('hex');
}
