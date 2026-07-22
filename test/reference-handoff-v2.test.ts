import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ReferenceHandoffValidationError,
  parseReferenceHandoffReceipt,
  referenceHandoffPayloadSha256,
} from '../core/ref/reference-handoff.ts';
import {
  ReferenceSelectionValidationError,
  parseReferenceSelectionV2,
  referenceSelectionV2Sha256,
} from '../core/ref/reference-selection.ts';

const hash = (character: string): string => character.repeat(64);

const slots = [
  { slotId: 'visual-system', rights: 'lawful' as const, signal: 'high-visual-system' as const, staticAxis: 'available' as const, motionAxis: 'absent' as const, obligationDisposition: 'used' as const, obligationReason: 'lawful visual system selected for composition' },
  { slotId: 'motion-observation', rights: 'lawful' as const, signal: 'high-motion' as const, staticAxis: 'absent' as const, motionAxis: 'available' as const, obligationDisposition: 'not-applicable' as const, obligationReason: 'motion is not applicable to the selected static implementation' },
];

const selection = {
  schemaVersion: 'reference-selection-v2', captureSha256: hash('a'), assemblySha256: hash('b'), projectionSha256: hash('c'), candidateId: 'candidate', slots,
};

test('selection-v2 rejects anti-references as used evidence and hashes deterministic payloads', () => {
  const parsed = parseReferenceSelectionV2(selection);
  assert.equal(referenceSelectionV2Sha256(parsed), referenceSelectionV2Sha256(parsed));
  assert.throws(() => parseReferenceSelectionV2({ ...selection, slots: [{ ...slots[0], signal: 'anti-reference', obligationDisposition: 'used' }, slots[1]] }), ReferenceSelectionValidationError);
});

test('handoff receipts retain explicit positive-motion availability and content-addressed current payloads', () => {
  const preSelection = parseReferenceSelectionV2(selection);
  const settledSelection = parseReferenceSelectionV2({
    ...selection,
    slots: [slots[0], {
      ...slots[1],
      obligationDisposition: 'rejected',
      obligationReason: 'motion evidence was reviewed and rejected for the selected static implementation',
    }],
  });
  const withoutHash = {
    schemaVersion: 'reference-handoff-v2' as const,
    role: 'composer' as const,
    captureSha256: hash('a'),
    assemblySha256: hash('b'),
    projectionSha256: hash('c'),
    preSelectionSha256: referenceSelectionV2Sha256(preSelection),
    artDirectionSha256: hash('d'),
    motionResolutionProjectionSha256: hash('e'),
    settledSelectionSha256: referenceSelectionV2Sha256(settledSelection),
    positiveMotion: { slots: [{
      slotId: 'motion-observation',
      disposition: 'rejected' as const,
      reason: 'motion evidence was reviewed and rejected for the selected static implementation',
    }] },
  };
  const receipt = { ...withoutHash, payloadSha256: referenceHandoffPayloadSha256(withoutHash) };
  assert.deepEqual(parseReferenceHandoffReceipt(receipt), receipt);
  assert.equal(receipt.preSelectionSha256, referenceSelectionV2Sha256(preSelection));
  assert.equal(receipt.settledSelectionSha256, referenceSelectionV2Sha256(settledSelection));
  assert.throws(() => parseReferenceHandoffReceipt({ ...receipt, positiveMotion: { slots: [] } }), ReferenceHandoffValidationError);
  const { settledSelectionSha256: _settledSelectionSha256, ...withoutSettlement } = receipt;
  assert.throws(() => parseReferenceHandoffReceipt(withoutSettlement), ReferenceHandoffValidationError);
  const { motionResolutionProjectionSha256: _motionResolutionProjectionSha256, ...withoutMotionResolution } = receipt;
  assert.throws(() => parseReferenceHandoffReceipt(withoutMotionResolution), ReferenceHandoffValidationError);
  const { preSelectionSha256: _preSelectionSha256, ...withoutPreSelection } = receipt;
  assert.throws(() => parseReferenceHandoffReceipt(withoutPreSelection), ReferenceHandoffValidationError);
});
test('selection-v2 rejects not-applicable motion dispositions without a rationale', () => {
  const withoutRationale = {
    ...selection,
    slots: [slots[0], { ...slots[1], obligationReason: '   ' }],
  };
  assert.throws(
    () => parseReferenceSelectionV2(withoutRationale),
    (error: unknown) => error instanceof ReferenceSelectionValidationError
      && error.reason === 'slots[1].obligationReason must be a non-empty string',
  );
});
