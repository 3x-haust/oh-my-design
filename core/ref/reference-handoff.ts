import { canonicalJson, readReferenceBoardArtifacts, sha256 } from './board-artifacts.ts';
import { replaceProjectFileAtomically } from '../runtime/project-write.ts';
import { readPreReferenceSelectionV2, referenceSelectionV2Sha256, validateReferenceSelectionV2 } from './reference-selection.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { ReferenceSelectionV2 } from './reference-selection.ts';

export const REFERENCE_HANDOFF_SCHEMA_VERSION = 'reference-handoff-v2' as const;
export const REFERENCE_HANDOFF_ROLES = ['art-direction', 'composer', 'hand'] as const;
export type ReferenceHandoffRole = (typeof REFERENCE_HANDOFF_ROLES)[number];

export type PositiveMotionAvailability = {
  readonly slots: readonly {
    readonly slotId: string;
    readonly disposition: 'used' | 'rejected' | 'not-applicable';
    readonly reason: string;
  }[];
};
type PositiveMotionSlot = PositiveMotionAvailability['slots'][number];

export type SettledMotionBinding = {
  readonly motionResolutionProjectionSha256: string;
  readonly settledSelectionSha256: string;
  readonly settledSelection: ReferenceSelectionV2;
};
export type ReferenceHandoffReceipt = {
  readonly schemaVersion: typeof REFERENCE_HANDOFF_SCHEMA_VERSION;
  readonly role: ReferenceHandoffRole;
  readonly captureSha256: string;
  readonly assemblySha256: string;
  readonly projectionSha256: string;
  readonly preSelectionSha256: string;
  readonly artDirectionSha256?: string;
  readonly motionResolutionProjectionSha256?: string;
  readonly settledSelectionSha256?: string;
  readonly positiveMotion: PositiveMotionAvailability;
  readonly payloadSha256: string;
};
export type DecisionBoundReferenceHandoffs = Readonly<{
  readonly composer: ReferenceHandoffReceipt;
  readonly hand: ReferenceHandoffReceipt;
}>;

export class ReferenceHandoffValidationError extends Error {
  override readonly name = 'ReferenceHandoffValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`reference handoff is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new ReferenceHandoffValidationError(reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const sha = (value: unknown, label: string): string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : fail(`${label} must be 64 lowercase hexadecimal characters`);
const object = (value: unknown, label: string): Record<string, unknown> => isRecord(value) ? value : fail(`${label} must be an object`);
const array = (value: unknown, label: string): readonly unknown[] => Array.isArray(value) ? value : fail(`${label} must be an array`);
const role = (value: unknown): ReferenceHandoffRole => value === 'art-direction' || value === 'composer' || value === 'hand' ? value : fail('role must be art-direction, composer, or hand');
const string = (value: unknown, label: string): string => typeof value === 'string' && value.trim() !== '' ? value : fail(`${label} must be a non-empty string`);
const disposition = (value: unknown, label: string): PositiveMotionSlot['disposition'] => (
  value === 'used' || value === 'rejected' || value === 'not-applicable'
) ? value : fail(`${label} must be used, rejected, or not-applicable`);
const payload = (receipt: Omit<ReferenceHandoffReceipt, 'payloadSha256'>): Omit<ReferenceHandoffReceipt, 'payloadSha256'> => receipt;

export function referenceHandoffPayloadSha256(receipt: Omit<ReferenceHandoffReceipt, 'payloadSha256'>): string { return sha256(canonicalJson(payload(receipt))); }

export function parseReferenceHandoffReceipt(value: unknown): ReferenceHandoffReceipt {
  if (!isRecord(value)) return fail('receipt must be an object');
  const expected = ['artDirectionSha256', 'assemblySha256', 'captureSha256', 'motionResolutionProjectionSha256', 'payloadSha256', 'positiveMotion', 'preSelectionSha256', 'projectionSha256', 'role', 'schemaVersion', 'settledSelectionSha256'];
  const keys = Object.keys(value).sort();
  const hasArtDirection = Object.hasOwn(value, 'artDirectionSha256');
  const hasSettlement = Object.hasOwn(value, 'motionResolutionProjectionSha256') || Object.hasOwn(value, 'settledSelectionSha256');
  const expectedKeys = expected.filter((key) => (hasArtDirection || key !== 'artDirectionSha256')
    && (hasSettlement || (key !== 'motionResolutionProjectionSha256' && key !== 'settledSelectionSha256')));
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) fail('receipt has unknown or missing keys');
  if (value['schemaVersion'] !== REFERENCE_HANDOFF_SCHEMA_VERSION) fail(`schemaVersion must be ${REFERENCE_HANDOFF_SCHEMA_VERSION}`);
  const positiveMotionRecord = object(value['positiveMotion'], 'positiveMotion');
  const motionKeys = Object.keys(positiveMotionRecord).sort(); const expectedMotionKeys = ['slots'];
  if (motionKeys.length !== expectedMotionKeys.length || motionKeys.some((key, index) => key !== expectedMotionKeys[index])) fail('positiveMotion has unknown or missing keys');
  const motionSlots = array(positiveMotionRecord['slots'], 'positiveMotion.slots').map((entry, index): PositiveMotionSlot => {
    const motionSlot = object(entry, `positiveMotion.slots[${index}]`);
    const slotKeys = Object.keys(motionSlot).sort(); const expectedSlotKeys = ['disposition', 'reason', 'slotId'];
    if (slotKeys.length !== expectedSlotKeys.length || slotKeys.some((key, keyIndex) => key !== expectedSlotKeys[keyIndex])) fail(`positiveMotion.slots[${index}] has unknown or missing keys`);
    return {
      slotId: string(motionSlot['slotId'], `positiveMotion.slots[${index}].slotId`),
      disposition: disposition(motionSlot['disposition'], `positiveMotion.slots[${index}].disposition`),
      reason: string(motionSlot['reason'], `positiveMotion.slots[${index}].reason`),
    };
  }).sort((left, right) => left.slotId.localeCompare(right.slotId));
  if (new Set(motionSlots.map((slot) => slot.slotId)).size !== motionSlots.length) fail('positiveMotion.slots must not contain duplicates');
  const receipt: ReferenceHandoffReceipt = {
    schemaVersion: REFERENCE_HANDOFF_SCHEMA_VERSION,
    role: role(value['role']),
    captureSha256: sha(value['captureSha256'], 'captureSha256'),
    assemblySha256: sha(value['assemblySha256'], 'assemblySha256'),
    projectionSha256: sha(value['projectionSha256'], 'projectionSha256'),
    preSelectionSha256: sha(value['preSelectionSha256'], 'preSelectionSha256'),
    ...(hasArtDirection ? { artDirectionSha256: sha(value['artDirectionSha256'], 'artDirectionSha256') } : {}),
    ...(hasSettlement ? {
      motionResolutionProjectionSha256: sha(value['motionResolutionProjectionSha256'], 'motionResolutionProjectionSha256'),
      settledSelectionSha256: sha(value['settledSelectionSha256'], 'settledSelectionSha256'),
    } : {}),
    positiveMotion: { slots: motionSlots },
    payloadSha256: sha(value['payloadSha256'], 'payloadSha256'),
  };
  if (receipt.role === 'art-direction' && (receipt.artDirectionSha256 !== undefined || hasSettlement)) fail('art-direction handoff cannot bind a decision or settlement that it has not made');
  if (receipt.role !== 'art-direction' && (receipt.artDirectionSha256 === undefined || !hasSettlement)) fail(`${receipt.role} handoff requires artDirectionSha256 and settled motion bindings`);
  if (new Set(receipt.positiveMotion.slots.map((slot) => slot.slotId)).size !== receipt.positiveMotion.slots.length) fail('positive motion slots must not contain duplicates');
  const { payloadSha256, ...receiptWithoutPayload } = receipt;
  if (referenceHandoffPayloadSha256(receiptWithoutPayload) !== payloadSha256) fail('payload hash does not match receipt');
  return receipt;
}

const positiveMotion = (selection: ReferenceSelectionV2): PositiveMotionAvailability => ({
  slots: selection.slots
    .filter((slot) => slot.signal === 'high-motion' && slot.motionAxis === 'available')
    .map((slot): PositiveMotionSlot => ({
      slotId: slot.slotId,
      disposition: slot.obligationDisposition,
      reason: slot.obligationReason,
    }))
    .sort((left, right) => left.slotId.localeCompare(right.slotId)),
});
function validateSettledSelection(base: ReferenceSelectionV2, settlement: SettledMotionBinding): void {
  if (settlement.settledSelectionSha256 !== referenceSelectionV2Sha256(settlement.settledSelection)
    || settlement.settledSelection.captureSha256 !== base.captureSha256
    || settlement.settledSelection.assemblySha256 !== base.assemblySha256
    || settlement.settledSelection.projectionSha256 !== base.projectionSha256
    || settlement.settledSelection.candidateId !== base.candidateId
    || settlement.settledSelection.slots.length !== base.slots.length) {
    fail('settled selection is not content-addressed from the current canonical selection');
  }
  for (const slot of base.slots) {
    const settled = settlement.settledSelection.slots.find((entry) => entry.slotId === slot.slotId);
    if (settled === undefined || settled.rights !== slot.rights || settled.signal !== slot.signal
      || settled.staticAxis !== slot.staticAxis || settled.motionAxis !== slot.motionAxis
      || (!(slot.signal === 'high-motion' && slot.rights === 'lawful' && slot.motionAxis === 'available' && slot.obligationDisposition === 'not-applicable')
        && (settled.obligationDisposition !== slot.obligationDisposition || settled.obligationReason !== slot.obligationReason))) {
      fail('settled selection may only settle current lawful pending motion slots');
    }
  }
}

export function createReferenceHandoffReceipt(
  root: string,
  handoffRole: ReferenceHandoffRole,
  artDirectionSha256?: string,
  settlement?: SettledMotionBinding,
): ReferenceHandoffReceipt {
  const currentSelection = validateReferenceSelectionV2(root);
  const selection = readPreReferenceSelectionV2(root);
  if (handoffRole === 'art-direction' && (artDirectionSha256 !== undefined || settlement !== undefined)) fail('art-direction handoff cannot bind a decision or settlement that it has not made');
  if (handoffRole !== 'art-direction' && (artDirectionSha256 === undefined || !/^[0-9a-f]{64}$/.test(artDirectionSha256) || settlement === undefined
    || !/^[0-9a-f]{64}$/.test(settlement.motionResolutionProjectionSha256))) {
    fail(`${handoffRole} handoff requires artDirectionSha256 and a content-addressed settled motion selection`);
  }
  if (handoffRole === 'art-direction' && referenceSelectionV2Sha256(currentSelection) !== referenceSelectionV2Sha256(selection)) fail('art-direction handoff requires the current immutable pre-selection');
  if (settlement !== undefined && handoffRole !== 'art-direction' && referenceSelectionV2Sha256(currentSelection) !== settlement.settledSelectionSha256) fail('handoff settlement is not the current settled selection');
  if (settlement !== undefined) validateSettledSelection(selection, settlement);
  const artifacts = readReferenceBoardArtifacts(root);
  const receiptWithoutPayload = {
    schemaVersion: REFERENCE_HANDOFF_SCHEMA_VERSION,
    role: handoffRole,
    captureSha256: sha256(artifacts.boardBytes),
    assemblySha256: sha256(artifacts.assemblyBytes),
    projectionSha256: sha256(artifacts.projectionBytes),
    preSelectionSha256: referenceSelectionV2Sha256(selection),
    ...(artDirectionSha256 === undefined ? {} : { artDirectionSha256 }),
    ...(settlement === undefined ? {} : {
      motionResolutionProjectionSha256: settlement.motionResolutionProjectionSha256,
      settledSelectionSha256: settlement.settledSelectionSha256,
    }),
    positiveMotion: settlement === undefined ? positiveMotion(selection) : positiveMotion(settlement.settledSelection),
  } as const;
  return { ...receiptWithoutPayload, payloadSha256: referenceHandoffPayloadSha256(receiptWithoutPayload) };
}
export function writeReferenceHandoffReceipt(
  root: string,
  handoffRole: ReferenceHandoffRole,
  invocation: ProjectRunInvocation,
  artDirectionSha256?: string,
  settlement?: SettledMotionBinding,
): { path: string; receipt: ReferenceHandoffReceipt } {
  const receipt = createReferenceHandoffReceipt(root, handoffRole, artDirectionSha256, settlement);
  const path = `.omd/reference-handoffs/${handoffRole}.json`;
  replaceProjectFileAtomically({ projectRoot: root, relativePath: path, content: canonicalJson(receipt), invocation });
  return { path, receipt };
}

export function validateReferenceHandoffCurrentness(root: string, receiptValue: unknown): ReferenceHandoffReceipt {
  const receipt = parseReferenceHandoffReceipt(receiptValue);
  const selection = validateReferenceSelectionV2(root);
  const preSelection = readPreReferenceSelectionV2(root);
  const artifacts = readReferenceBoardArtifacts(root);
  if (receipt.captureSha256 !== sha256(artifacts.boardBytes)) fail('capture hash is stale');
  if (receipt.assemblySha256 !== sha256(artifacts.assemblyBytes)) fail('assembly hash is stale');
  if (receipt.projectionSha256 !== sha256(artifacts.projectionBytes)) fail('projection hash is stale');
  if (receipt.preSelectionSha256 !== referenceSelectionV2Sha256(preSelection)) fail('immutable pre-selection hash is stale');
  if (receipt.role !== 'art-direction' && receipt.settledSelectionSha256 !== referenceSelectionV2Sha256(selection)) fail('settled selection hash is stale');
  const currentMotion = receipt.role === 'art-direction' ? positiveMotion(preSelection) : positiveMotion(selection);
  if (receipt.role === 'art-direction') {
    if (canonicalJson(receipt.positiveMotion) !== canonicalJson(currentMotion)) fail('positive motion availability is stale');
  } else if (receipt.positiveMotion.slots.length !== currentMotion.slots.length
    || receipt.positiveMotion.slots.some((slot) => !currentMotion.slots.some((current) => current.slotId === slot.slotId))
    || receipt.positiveMotion.slots.some((slot) => slot.disposition === 'not-applicable')) {
    fail('settled motion dispositions do not cover the current canonical motion slots');
  }
  return receipt;
}
export function validateDecisionBoundReferenceHandoffs(
  handoffs: DecisionBoundReferenceHandoffs,
  artDirectionSha256: string,
): DecisionBoundReferenceHandoffs {
  if (!/^[0-9a-f]{64}$/.test(artDirectionSha256)) fail('art direction hash must be a SHA-256 digest');
  const composer = parseReferenceHandoffReceipt(handoffs.composer);
  const hand = parseReferenceHandoffReceipt(handoffs.hand);
  if (composer.role !== 'composer' || hand.role !== 'hand') fail('decision-bound handoffs require composer then hand receipts');
  if (composer.artDirectionSha256 !== artDirectionSha256 || hand.artDirectionSha256 !== artDirectionSha256) fail('composer and hand handoffs must bind the same decision');
  if (composer.motionResolutionProjectionSha256 === undefined || composer.settledSelectionSha256 === undefined
    || hand.motionResolutionProjectionSha256 !== composer.motionResolutionProjectionSha256 || hand.settledSelectionSha256 !== composer.settledSelectionSha256) {
    fail('composer and hand handoffs must bind the same settled motion resolution');
  }
  for (const field of ['captureSha256', 'assemblySha256', 'projectionSha256', 'preSelectionSha256'] as const) {
    if (composer[field] !== hand[field]) fail(`composer and hand handoffs disagree on ${field}`);
  }
  if (canonicalJson(composer.positiveMotion) !== canonicalJson(hand.positiveMotion)) fail('composer and hand handoffs disagree on motion dispositions');
  return { composer, hand };
}
