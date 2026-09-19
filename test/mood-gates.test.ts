import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_MEAN_FLOOR,
  COHERENCE_CEILING,
  DISTINCTIVENESS_FLOOR,
  NEAR_DUPLICATE_FLOOR,
  readMoodRightsGate,
  readReferenceGates,
  readSlotDestinations,
  referenceGateReport,
  referenceGateSha256,
} from '../core/ref/reference-gates.ts';
import {
  ADOPTED_DEFAULT_DIRECTION,
  MOOD_TARGET_SCHEMA,
  checkMoodTarget,
  deriveMoodTarget,
  moodTargetInteraction,
  moodTargetSha256,
  userRequestedReferences,
} from '../core/ref/mood-target.ts';
import { MOODBOARD_SCHEMA, moodImagePath, type Moodboard } from '../core/ref/mood.ts';
import type { DomainBrief } from '../core/domain/domain-brief.ts';
import type { Invariants } from '../core/types.ts';

const evidence = [{ status: 'observed' as const, reference: 'https://example.com' }];

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

const entry = (overrides: Partial<Invariants> = {}) => ({ invariants: invariants(overrides) });

const generic = (): Invariants => invariants({
  spacingLadder: [16], radiusLadder: [8], typeScale: [16], fontFamilies: ['inter'],
  weightLadder: [400], motionDurations: [200], easingVocab: ['ease'], elevationLevels: 1,
  centeredRatio: 0.95, tokenCoverage: 0.1, paddingWeight: 16,
});

const committed = (): Invariants => invariants({
  spacingLadder: [3, 7, 13, 21, 34], radiusLadder: [2, 6, 14], typeScale: [12, 15, 19, 27, 44],
  fontFamilies: ['fraunces', 'iosevka', 'atkinson'], weightLadder: [300, 500, 800],
  motionDurations: [90, 220, 640], easingVocab: ['cubic-bezier(0.2, 0, 0, 1)'], elevationLevels: 4,
  centeredRatio: 0.05, tokenCoverage: 1, paddingWeight: 120,
});

test('the four aesthetic gates are advisory and read the shared space', () => {
  const findings = readReferenceGates({
    candidate: entry(generic()),
    categoryMean: [entry(generic())],
    slop: [entry(generic())],
    target: [entry(committed())],
  });
  assert.ok(findings.length > 0);
  assert.ok(findings.every((finding) => finding.severity === 'advisory'));
  assert.ok(findings.some((finding) => finding.id === 'DISTINCTIVENESS_FLOOR'));
  assert.ok(findings.some((finding) => finding.id === 'CATEGORY_MEAN_FLOOR'));
  assert.ok(findings.every((finding) => typeof finding.distance === 'number'));
});

test('an empty reference set makes no claim rather than a passing one', () => {
  const findings = readReferenceGates({ candidate: entry(generic()), categoryMean: [], slop: [], target: [] });
  assert.deepEqual(findings, [], 'nothing to compare against is silence, not a pass');
});

test('a committed candidate clears the floors and stays under the coherence ceiling', () => {
  const findings = readReferenceGates({
    candidate: entry(committed()),
    categoryMean: [entry(generic())],
    slop: [entry(generic())],
    target: [entry(committed())],
  });
  assert.deepEqual(findings, []);
});

test('near-duplicate siblings are named as one candidate counted twice', () => {
  const findings = readReferenceGates({
    candidate: entry(committed()),
    categoryMean: [], slop: [], target: [],
    siblings: [entry(committed())],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'NEAR_DUPLICATE');
  assert.ok(findings[0]!.distance! < NEAR_DUPLICATE_FLOOR);
});

test('the mood rights gate is the only hard gate', () => {
  const board: Moodboard = {
    schema: MOODBOARD_SCHEMA,
    direction: 'warm, printed',
    items: [{
      id: 'a', source: 'https://example.com/p', qualities: ['warm'],
      imagePath: moodImagePath('/r', 'a'.repeat(64)), sha256: 'a'.repeat(64),
      capturedAt: '2026-09-15T00:00:00.000Z', scope: 'whole', evidence: 'visual-only',
    }],
  };
  assert.deepEqual(readMoodRightsGate(board, [{ path: 'src/a.css', bytes: Buffer.from('own work') }]), []);

  const offending = readMoodRightsGate(board, [{ path: 'src/a.css', bytes: Buffer.from(`url("${board.items[0]!.imagePath}")`) }]);
  assert.equal(offending.length, 1);
  assert.equal(offending[0]!.severity, 'hard');
  assert.equal(offending[0]!.id, 'MOOD_BYTES_IN_PRODUCTION');

  const report = referenceGateReport([
    ...readReferenceGates({ candidate: entry(generic()), categoryMean: [entry(generic())], slop: [entry(generic())], target: [] }),
    ...offending,
  ]);
  assert.equal(report.blocked, true, 'a hard finding blocks even alongside advisory ones');
  assert.equal(referenceGateReport([{ id: 'NEAR_DUPLICATE', severity: 'advisory', message: 'x' }]).blocked, false);
});

test('one crop claiming several destinations is named as a collage', () => {
  assert.deepEqual(readSlotDestinations({ cropId: 'c1', destinations: [{ zoneId: 'hero', invariants: committed() }] }), []);
  const findings = readSlotDestinations({
    cropId: 'c1',
    destinations: [
      { zoneId: 'hero', invariants: committed() },
      { zoneId: 'proof', invariants: generic() },
    ],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /collage/);
  assert.match(findings[0]!.message, /hero|proof/);
});

test('a gate report has a stable identity', () => {
  const report = referenceGateReport([{ id: 'NEAR_DUPLICATE', severity: 'advisory', message: 'x', distance: 0.05 }]);
  assert.equal(referenceGateSha256(report), referenceGateSha256(referenceGateReport([...report.findings])));
});

function brief(overrides: Partial<DomainBrief> = {}): DomainBrief {
  return {
    schema: 'domain-brief-v1',
    request: 'a landing page for a synth',
    domain: 'instrument',
    summary: 'Explain the instrument.',
    surfaces: [{ name: 'landing', purpose: 'decide', evidence }],
    coreObjects: [{ name: 'patch', evidence }],
    audience: { description: 'musicians', evidence },
    referenceQueries: { component: ['control'], craft: ['motion'], mood: ['warm, analog, tactile'] },
    planning: {
      businessGoal: { text: 'explain the instrument', userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'r', excerpt: 'x' }] },
      successSignal: { text: 'visitors understand it', userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'r', excerpt: 'x' }] },
      nonGoals: [],
    },
    ...overrides,
  };
}

test('the subject identity outranks brief text, which outranks taste records', () => {
  const target = deriveMoodTarget({
    brief: brief(),
    subjectIdentity: 'a modular synthesizer with patch cables',
    tasteRecords: ['user rejected the glossy dark theme'],
  });
  assert.equal(target.schema, MOOD_TARGET_SCHEMA);
  assert.equal(target.basis, 'user-stated');
  assert.equal(target.signals[0]!.kind, 'subject-identity');
  assert.match(target.direction, /analog|instrument|tactile|hardware|signal|warm|precise|matte|loose|layered|paper|ink|metal|night/);
  assert.deepEqual([...target.lanes], ['in-category', 'out-of-category']);
});

test('no signal at all adopts a direction and says so rather than inventing a preference', () => {
  const silent = brief({
    domain: 'archive', summary: 'A page.',
    referenceQueries: { component: ['x'], craft: ['y'], mood: ['zzz'] },
    coreObjects: [{ name: 'thing', evidence }],
    planning: {
      businessGoal: { text: 'let visitors find a record' },
      successSignal: { text: 'they find it' },
      nonGoals: [],
    },
  });
  const target = deriveMoodTarget({ brief: silent });
  assert.equal(target.basis, 'adopted-default');
  assert.equal(target.direction, ADOPTED_DEFAULT_DIRECTION);
  assert.equal(target.announceAdoption, true);
  assert.deepEqual(target.signals, []);

  const interaction = moodTargetInteraction(target, 'make me a page');
  assert.equal(interaction.mode, 'announce-with-result');
  assert.match(interaction.reason, /adopted a direction/);
});

test('a derivable direction never interrupts the user', () => {
  const target = deriveMoodTarget({ brief: brief(), subjectIdentity: 'a modular synthesizer' });
  const interaction = moodTargetInteraction(target, 'build the landing page');
  assert.equal(interaction.mode, 'silent');
  assert.equal(interaction.reason.length > 0, true);
});

test('only an explicit request opens interactive rounds', () => {
  for (const request of ['show me references first', 'can you show me references?', '레퍼런스 보여줘']) {
    assert.equal(userRequestedReferences(request), true, request);
    const target = deriveMoodTarget({ brief: brief() });
    assert.equal(moodTargetInteraction(target, request).mode, 'interactive-rounds');
  }
  for (const request of ['build the landing page', 'make it look good', 'design the pricing section']) {
    assert.equal(userRequestedReferences(request), false, request);
  }
});

test('a target is checked for coherence before a board is gathered against it', () => {
  const good = deriveMoodTarget({ brief: brief(), subjectIdentity: 'a modular synthesizer' });
  assert.equal(checkMoodTarget(good).ok, true);

  const structural = { ...good, direction: '16px gutters, 12-column grid' };
  const checked = checkMoodTarget(structural);
  assert.equal(checked.ok, false);
  assert.ok(checked.findings.some((finding) => /measurement/.test(finding)));

  const empty = { ...good, direction: '   ' };
  assert.ok(checkMoodTarget(empty).findings.some((finding) => /empty/.test(finding)));

  const unannounced = { ...good, direction: 'quiet', basis: 'adopted-default' as const, signals: [], announceAdoption: false };
  assert.ok(checkMoodTarget(unannounced).findings.some((finding) => /announced/.test(finding)));
});

test('a target has a stable identity', () => {
  const target = deriveMoodTarget({ brief: brief(), subjectIdentity: 'a modular synthesizer' });
  assert.equal(moodTargetSha256(target), moodTargetSha256(deriveMoodTarget({ brief: brief(), subjectIdentity: 'a modular synthesizer' })));
});
