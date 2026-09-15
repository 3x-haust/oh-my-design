import assert from 'node:assert/strict';
import test from 'node:test';
import type { Invariants, Reference } from '../core/types.ts';
import { componentCaptureTransfer, copyComponentCaptureTransfer } from '../core/ref/board-transfer.ts';
import { PREPARED_MEASUREMENT_COVERAGE, parseMeasurementCoverage } from '../core/ref/measurement-coverage.ts';
import { designSignal } from '../core/ref/signal.ts';
import { distances, similarity, topKinshipPairs } from '../core/ref/distance.ts';
import { createSelectedReferenceDistanceReceipt } from '../core/ref/selected-reference-distance-scoring.ts';
import { parseSelectedReferenceDistanceReceipt } from '../core/ref/selected-reference-distance-contract.ts';

const measured: Invariants = {
  spacingLadder: [4, 8, 16, 32], radiusLadder: [4, 12], elevationLevels: 2, centeredRatio: 0.1,
  tokenCoverage: 0.8, paddingWeight: 24, typeScale: [14, 20, 32], fontFamilies: ['sans'], weightLadder: [400, 700],
  motionDurations: [100], easingVocab: ['ease'], animatedShare: 0.2,
  hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [],
};
const prepared = (): Invariants => ({ ...measured, measurementCoverage: { ...PREPARED_MEASUREMENT_COVERAGE } });
const reference = (invariants: Invariants, source = 'https://private-source.example'): Reference => ({
  source, component: 'menu', kind: 'component', selector: '#private-selector', capturedAt: '2026-09-06T00:00:00.000Z',
  invariants, principles: ['Keep hierarchy distinct.'],
  blueprint: { selector: '#private-selector', capturedAt: '2026-09-06T00:00:00.000Z', nodes: [{ id: 'private-node', role: 'container', children: [], box: { w: 100, h: 100 } }] },
});

test('source-free transfer and its copy preserve unknown probes without receipt or selector leakage', () => {
  const legacy = componentCaptureTransfer(reference(measured), 'legacy');
  const captured = reference(measured);
  captured.capturePreparation = {
    schema: 'reference-capture-preparation-receipt-v1', executedActions: [{ kind: 'click', selector: '#private-toggle' }],
    observations: [{ selector: '#private-selector', state: 'visible', passed: true }], observedAt: '2026-09-06T00:00:00.000Z',
    viewport: { width: 390, height: 844 }, notMeasured: ['interaction-probe', 'motion-probe', 'energy-curve'],
  };
  const transfer = componentCaptureTransfer(captured, 'prepared');
  const copied = copyComponentCaptureTransfer(transfer);
  assert.deepEqual(copied.invariants.measurementCoverage, PREPARED_MEASUREMENT_COVERAGE);
  assert.equal(legacy.invariants.measurementCoverage, undefined);
  assert.equal(copied.invariants.hoverCoverage, legacy.invariants.hoverCoverage);
  assert.equal(copied.invariants.hasReducedMotion, legacy.invariants.hasReducedMotion);
  assert.notDeepEqual(copied, legacy);
  assert.notEqual(copied.invariants.measurementCoverage, transfer.invariants.measurementCoverage);
  assert.doesNotMatch(JSON.stringify(copied), /private-|capturePreparation|executedActions|observations|selector|observedAt|390|844/);
  const poisoned = { ...transfer, invariants: { ...transfer.invariants, measurementCoverage: { ...PREPARED_MEASUREMENT_COVERAGE, selector: '#secret' } } };
  assert.throws(() => copyComponentCaptureTransfer(poisoned), /measurementCoverage/);
  assert.throws(() => parseMeasurementCoverage({ ...PREPARED_MEASUREMENT_COVERAGE, motionProbe: 'https://private.example' }), /measurementCoverage/);
});

test('signal reports unmeasured interaction as unknown without awarding a point or shrinking its denominator', () => {
  const zero = designSignal(measured); const unknown = designSignal(prepared());
  assert.ok(zero.missing.includes('interaction')); assert.equal(zero.unknown, undefined);
  assert.ok(!unknown.missing.includes('interaction')); assert.deepEqual(unknown.unknown, ['interaction']);
  assert.equal(unknown.score, zero.score); assert.ok(unknown.score < 1);
  assert.equal(designSignal({ ...prepared(), hoverCoverage: 1 }).score, unknown.score, 'unmeasured defaults cannot earn points');
});

test('partial comparisons exclude unknown drivers while explicit measured zero remains a measured mismatch', () => {
  const target = { ...measured, hoverCoverage: 1, focusCoverage: 1 };
  const actualZero = { ...measured, measurementCoverage: { interactionProbe: 'measured' as const, motionProbe: 'measured' as const, energyCurve: 'not-measured' as const } };
  const [partial] = distances(target, [reference(prepared())]); assert.ok(partial);
  assert.deepEqual(partial.unmeasuredComponents, ['hoverCoverage', 'focusCoverage']);
  assert.ok(!partial.drivers.includes('hoverCoverage') && !partial.drivers.includes('focusCoverage'));
  assert.ok(similarity(target, actualZero) < partial.similarity);
  const receipt = createSelectedReferenceDistanceReceipt({
    selectionSha256: 'a'.repeat(64), usageSha256: 'b'.repeat(64), buildSha256: 'c'.repeat(64), candidateId: 'candidate',
    route: '/', target: 'index.html', viewport: { width: 390, height: 844 },
    slots: [{ slotId: 'menu', referenceId: 'ref-menu', sourceSelector: '#source', targetSelector: '#target', referenceInvariants: prepared(), targetInvariants: target }],
  });
  assert.deepEqual(parseSelectedReferenceDistanceReceipt(receipt).comparisons[0]?.unmeasuredComponents, partial.unmeasuredComponents);
  assert.throws(() => parseSelectedReferenceDistanceReceipt({ ...receipt, comparisons: [{ ...receipt.comparisons[0], drivers: ['hoverCoverage'] }] }), /unmeasuredComponents/);
});

test('unknown probes do not let identical static captures escape kinship or make different static captures duplicates', () => {
  const same = topKinshipPairs([reference(prepared(), 'https://one.example'), reference(prepared(), 'https://two.example')]);
  assert.equal(same.length, 1); assert.ok(same[0]!.similarity >= 0.85);
  assert.deepEqual(same[0]!.unmeasuredComponents, ['hoverCoverage', 'focusCoverage']);
  const different = { ...prepared(), spacingLadder: [7, 21], radiusLadder: [2, 30], typeScale: [17, 50], fontFamilies: ['serif'], paddingWeight: 2, elevationLevels: 0 };
  assert.equal(topKinshipPairs([reference(prepared(), 'https://one.example'), reference(different, 'https://two.example')]).length, 0);
  assert.deepEqual(topKinshipPairs([reference(measured, 'https://one.example'), reference(measured, 'https://two.example')])[0]?.unmeasuredComponents,
    ['hoverCoverage', 'focusCoverage'], 'legacy zero-valued probes are omitted by the score and must be disclosed');
  const confirmedZero = { ...measured, measurementCoverage: { interactionProbe: 'measured' as const, motionProbe: 'measured' as const, energyCurve: 'not-measured' as const } };
  assert.deepEqual(topKinshipPairs([reference(confirmedZero, 'https://one.example'), reference(confirmedZero, 'https://two.example')])[0]?.unmeasuredComponents, undefined,
    'explicitly measured zero coverage remains comparable');
});
