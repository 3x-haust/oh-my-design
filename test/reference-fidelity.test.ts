import assert from 'node:assert/strict';
import test from 'node:test';
import type { Invariants } from '../core/types.ts';
import {
  SELECTED_REFERENCE_DISTANCE_THRESHOLD,
  createSelectedReferenceDistanceReceipt,
  parseSelectedReferenceDistanceReceipt,
  selectedReferenceDistanceSha256,
} from '../core/ref/selected-reference-distance.ts';

const hash = (value: string): string => value.repeat(64).slice(0, 64);
const base: Invariants = {
  spacingLadder: [8, 16, 24, 32],
  radiusLadder: [4, 8],
  elevationLevels: 1,
  centeredRatio: 0.25,
  tokenCoverage: 0.9,
  paddingWeight: 16,
  typeScale: [14, 18, 32],
  fontFamilies: ['Inter'],
  weightLadder: [400, 700],
  motionDurations: [],
  easingVocab: [],
  animatedShare: 0,
  hoverCoverage: 0.5,
  focusCoverage: 1,
  animatedProperties: [],
  hasReducedMotion: true,
  scrollChoreography: [],
};
const different: Invariants = {
  ...base,
  spacingLadder: [3, 5, 7],
  radiusLadder: [0],
  centeredRatio: 0.95,
  paddingWeight: 3,
  typeScale: [11, 12],
  fontFamilies: ['Georgia'],
  weightLadder: [300],
};

const input = () => ({
  selectionSha256: hash('a'),
  usageSha256: hash('b'),
  buildSha256: hash('c'),
  candidateId: 'selected-direction',
  route: '/shop',
  target: 'http://127.0.0.1:4173/shop',
  viewport: { width: 1440, height: 900 },
  slots: [
    {
      slotId: 'hero',
      referenceId: 'ref-hero',
      sourceSelector: '[data-ref="hero"]',
      targetSelector: '[data-omd="hero"]',
      referenceInvariants: base,
      targetInvariants: base,
    },
  ],
});

test('selected receipt is closed, semantic, and bound to assigned selectors', () => {
  const receipt = createSelectedReferenceDistanceReceipt(input());

  assert.equal(receipt.schemaVersion, 'selected-reference-distance-v1');
  assert.equal(receipt.threshold, 0.6);
  assert.equal(receipt.verdict, 'pass');
  assert.deepEqual(receipt.comparisons.map((row) => ({
    slotId: row.slotId,
    referenceId: row.referenceId,
    sourceSelector: row.sourceSelector,
    targetSelector: row.targetSelector,
  })), [{
    slotId: 'hero',
    referenceId: 'ref-hero',
    sourceSelector: '[data-ref="hero"]',
    targetSelector: '[data-omd="hero"]',
  }]);
  assert.deepEqual(parseSelectedReferenceDistanceReceipt(receipt), receipt);
  assert.match(selectedReferenceDistanceSha256(receipt), /^[0-9a-f]{64}$/);
});

test('selected receipt fails when any assigned slot misses the threshold', () => {
  const receipt = createSelectedReferenceDistanceReceipt({
    ...input(),
    slots: [
      input().slots[0]!,
      {
        ...input().slots[0]!,
        slotId: 'proof',
        referenceId: 'ref-proof',
        sourceSelector: '[data-ref="proof"]',
        targetSelector: '[data-omd="proof"]',
        targetInvariants: different,
      },
    ],
  });

  assert.equal(receipt.verdict, 'fail');
  assert.deepEqual(receipt.comparisons.map((row) => row.slotId), ['hero', 'proof']);
  assert.ok(receipt.comparisons[1]!.similarity < SELECTED_REFERENCE_DISTANCE_THRESHOLD);
});

test('selected receipt parser rejects forged and malformed evidence', () => {
  const receipt = createSelectedReferenceDistanceReceipt(input());
  const malformed = [
    { ...receipt, threshold: 0.59 },
    { ...receipt, verdict: 'fail' },
    { ...receipt, comparisons: [] },
    { ...receipt, comparisons: [{ ...receipt.comparisons[0]!, similarity: Number.NaN }] },
    { ...receipt, comparisons: [{ ...receipt.comparisons[0]!, similarity: Number.POSITIVE_INFINITY }] },
    { ...receipt, comparisons: [{ ...receipt.comparisons[0]!, similarity: 1.1 }] },
    { ...receipt, comparisons: [receipt.comparisons[0]!, receipt.comparisons[0]!] },
    { ...receipt, comparisons: [{ ...receipt.comparisons[0]!, drivers: ['unknown-driver'] }] },
    { ...receipt, extra: true },
  ];

  for (const value of malformed) {
    assert.throws(() => parseSelectedReferenceDistanceReceipt(value));
  }
});

test('selected receipt builder rejects empty and duplicate slot assignments', () => {
  assert.throws(() => createSelectedReferenceDistanceReceipt({ ...input(), slots: [] }));
  assert.throws(() => createSelectedReferenceDistanceReceipt({
    ...input(),
    slots: [input().slots[0]!, input().slots[0]!],
  }));
});
