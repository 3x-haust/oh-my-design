import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOOD_CAPTURE_CAP,
  MOOD_ITEMS_PER_ROUND_CAP,
  MOOD_QUERY_LANES,
  MOOD_ROUND_CAP,
  MOOD_QUERIES_PER_LANE_CAP,
  moodConvergence,
  moodLaneBalance,
  moodLaneFindings,
  moodQueries,
  moodRoundSha256,
  requireMoodRoundWithinCaps,
  type MoodRound,
} from '../core/ref/mood-query.ts';
import { MOODBOARD_SCHEMA, moodImagePath, parseMoodboard, type Moodboard } from '../core/ref/mood.ts';
import { toVisualVector } from '../core/visual-vector.ts';
import type { DomainBrief } from '../core/domain/domain-brief.ts';
import type { Invariants } from '../core/types.ts';

const evidence = [{ status: 'observed' as const, reference: 'https://example.com' }];

function brief(overrides: Partial<DomainBrief> = {}): DomainBrief {
  return {
    schema: 'domain-brief-v1',
    request: 'a booking flow for a small cinema',
    domain: 'cinema booking',
    summary: 'Reserve seats for a screening.',
    surfaces: [
      { name: 'screening list', purpose: 'choose a film', evidence },
      { name: 'seat map', purpose: 'pick seats', evidence },
    ],
    coreObjects: [
      { name: 'screening', evidence },
      { name: 'seat', evidence },
      { name: 'ticket', evidence },
    ],
    audience: { description: 'regular attendees', evidence },
    referenceQueries: {
      component: ['seat selection control'],
      craft: ['transitional seat map motion'],
      mood: ['warm, printed, evening'],
    },
    planning: {
      businessGoal: { text: 'sell tickets without a phone call', userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'r', excerpt: 'x' }] },
      successSignal: { text: 'bookings complete online', userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'r', excerpt: 'x' }] },
      nonGoals: [],
    },
    ...overrides,
  };
}

const board = (direction = 'warm, printed, evening'): Moodboard => ({ schema: MOODBOARD_SCHEMA, direction, items: [] });

test('both lanes are queried, and the out-of-category lane is derived cross-domain from core objects', () => {
  const inCategory = moodQueries(brief(), 'in-category');
  const outOfCategory = moodQueries(brief(), 'out-of-category');

  assert.ok(inCategory.length > 0 && outOfCategory.length > 0);
  assert.ok(inCategory.every((query) => query.lane === 'in-category'));
  assert.ok(outOfCategory.every((query) => query.lane === 'out-of-category'));

  assert.ok(inCategory.some((query) => query.query.includes('warm, printed, evening')), 'the brief mood queries seed the in-category lane');
  assert.ok(outOfCategory.every((query) => query.query.includes('cinema booking')), 'the cross-domain lane names the domain it departs from');
  assert.ok(outOfCategory.some((query) => query.query.includes('seat')), 'the cross-domain lane crosses the brief\'s own core objects');
});

test('every lane query list is capped in code', () => {
  for (const lane of MOOD_QUERY_LANES) {
    assert.ok(moodQueries(brief(), lane).length <= MOOD_QUERIES_PER_LANE_CAP);
  }
  assert.throws(() => moodQueries(brief(), 'in-category', 0), /within 1/);
  assert.throws(() => moodQueries(brief(), 'in-category', MOOD_ROUND_CAP + 1), /within 1/);
});

test('round, item, and capture caps refuse rather than silently trimming', () => {
  const rounds: MoodRound[] = [];
  assert.doesNotThrow(() => requireMoodRoundWithinCaps(rounds));

  const full: MoodRound[] = [{ round: 1, queries: [], added: new Array(MOOD_CAPTURE_CAP).fill('x') }];
  assert.throws(() => requireMoodRoundWithinCaps(full), /capped at \d+ captures/);

  const manyRounds: MoodRound[] = new Array(MOOD_ROUND_CAP).fill(null).map((_v, i) => ({ round: i + 1, queries: [], added: [] }));
  assert.throws(() => requireMoodRoundWithinCaps(manyRounds), /capped at \d+ rounds/);

  const overItems: MoodRound[] = [{ round: 1, queries: [], added: new Array(MOOD_ITEMS_PER_ROUND_CAP + 1).fill('x') }];
  assert.doesNotThrow(() => requireMoodRoundWithinCaps(overItems), 'per-round item count is the round\'s own business');
});

test('lane balance counts queries per lane and reports a single-lane board', () => {
  const rounds: MoodRound[] = [{
    round: 1,
    queries: moodQueries(brief(), 'in-category'),
    added: ['a'],
  }];
  const balance = moodLaneBalance(rounds);
  assert.equal(balance['in-category'], moodQueries(brief(), 'in-category').length);
  assert.equal(balance['out-of-category'], 0);

  const findings = moodLaneFindings(board(), rounds);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!, /out-of-category only/);
  assert.deepEqual(moodLaneFindings(board(), []), [], 'a board with no recorded rounds makes no lane claim');
});

test('convergence reports unknown rather than converged when there is nothing measured', () => {
  const converged = moodConvergence([], board());
  assert.equal(converged.converged, false);
  assert.match(converged.reason, /round cap/);

  const single = moodConvergence([toVisualVector({ invariants: invariants() })], board());
  assert.equal(single.converged, false);
  assert.match(single.reason, /round cap/);
});

test('convergence tracks the centroid shift across the set', () => {
  const tight = [
    toVisualVector({ invariants: invariants({ spacingLadder: [8, 16] }) }),
    toVisualVector({ invariants: invariants({ spacingLadder: [8, 16] }) }),
    toVisualVector({ invariants: invariants({ spacingLadder: [8, 16] }) }),
  ];
  const settled = moodConvergence(tight, board());
  assert.equal(settled.converged, true);
  assert.ok(settled.shifts.every((shift) => shift === 0));

  const drifting = [
    toVisualVector({ invariants: invariants({ spacingLadder: [8, 16] }) }),
    toVisualVector({ invariants: invariants({ spacingLadder: [8, 16] }) }),
    toVisualVector({ invariants: invariants({ spacingLadder: [3, 5, 9, 15, 26, 44], radiusLadder: [2, 6, 14], tokenCoverage: 1, centeredRatio: 0.9 }) }),
  ];
  const unsettled = moodConvergence(drifting, board());
  assert.equal(unsettled.converged, false);
  assert.match(unsettled.reason, /still above/);
});

test('a round has a stable identity', () => {
  const round: MoodRound = { round: 1, queries: moodQueries(brief(), 'in-category'), added: ['a', 'b'] };
  assert.equal(moodRoundSha256(round), moodRoundSha256({ ...round }));
  assert.notEqual(moodRoundSha256(round), moodRoundSha256({ ...round, added: ['b', 'a'] }));
});

function invariants(overrides: Partial<Invariants> = {}): Invariants {
  return {
    spacingLadder: [4, 8, 16, 24, 32], radiusLadder: [4, 8, 12], elevationLevels: 3,
    centeredRatio: 0.2, tokenCoverage: 0.9, paddingWeight: 40, typeScale: [14, 16, 24, 40],
    fontFamilies: ['inter', 'source-serif'], weightLadder: [400, 500, 700], motionDurations: [150, 300],
    easingVocab: ['ease-out'], animatedShare: 0.25, hoverCoverage: 0.8, focusCoverage: 0.6,
    animatedProperties: ['opacity'], hasReducedMotion: true, scrollChoreography: [],
    measurementCoverage: { interactionProbe: 'measured', motionProbe: 'measured', energyCurve: 'measured' },
    ...overrides,
  } as Invariants;
}

test('a mood item path never leaves the mood store helper', () => {
  assert.equal(moodImagePath('/r', 'a'.repeat(64)), `.omd/refs/mood/${'a'.repeat(64)}.png`);
});
