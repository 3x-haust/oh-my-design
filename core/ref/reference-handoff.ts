import { lstatSync, readFileSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, readReferenceBoardArtifacts, sha256 } from './board-artifacts.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically } from '../runtime/project-write.ts';
import {
  materializeSettledReferenceSelection,
  motionResolutionProjectionSha256,
  parseReferenceSelectionV2,
  referenceSelectionV2Sha256,
  validatePreReferenceSelectionV2,
  validateReferenceSelectionV2,
  validateMotionResolutionProjection,
} from './reference-selection.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { ReferenceSelectionV2 } from './reference-selection.ts';
import { artDirectionSha256, validateArtDirectionPointer, validateArtDirectionRecord } from '../art-direction/schema.ts';

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

export const referencePositiveMotion = (selection: ReferenceSelectionV2): PositiveMotionAvailability => ({
  slots: selection.slots
    .filter((slot) => slot.signal === 'high-motion' && slot.motionAxis === 'available')
    .map((slot): PositiveMotionSlot => ({
      slotId: slot.slotId,
      disposition: slot.obligationDisposition,
      reason: slot.obligationReason,
    }))
    .sort((left, right) => left.slotId.localeCompare(right.slotId)),
});
const sameFile = (left: Stats, right: Stats): boolean => left.dev === right.dev && left.ino === right.ino && left.size === right.size;
const readRegularFile = (path: string, label: string): string => {
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink()) return fail(`${label} must be a regular non-symlink file`);
    const body = readFileSync(path, 'utf8');
    const after = lstatSync(path);
    if (!after.isFile() || after.isSymbolicLink() || !sameFile(before, after)) return fail(`${label} changed while it was read`);
    return body;
  } catch (error) {
    if (error instanceof ReferenceHandoffValidationError) throw error;
    return fail(`${label} is missing or unreadable`);
  }
};
export type ReferenceSettlementSnapshot = {
  readonly pointerBytes: Buffer;
  readonly recordBytes: Buffer;
  readonly artDirectionHandoffBytes: Buffer;
  readonly motionResolutionBytes: Buffer;
  readonly settledSelectionBytes: Buffer;
  readonly immutableSettledSelectionBytes: Buffer;
  readonly preSelection: ReferenceSelectionV2;
  readonly captureSha256: string;
  readonly assemblySha256: string;
  readonly projectionSha256: string;
};

export type ValidatedReferenceSettlement = {
  readonly artDirectionSha256: string;
  readonly motionResolutionProjectionSha256: string;
  readonly settledSelectionSha256: string;
  readonly settledSelection: ReferenceSelectionV2;
};

export function validateReferenceSettlementSnapshot(snapshot: ReferenceSettlementSnapshot): ValidatedReferenceSettlement {
  const parse = <T>(bytes: Buffer, label: string, parser: (value: unknown) => T): T => {
    try { return parser(JSON.parse(bytes.toString('utf8'))); } catch { return fail(`${label} is invalid JSON`); }
  };
  const pointer = parse(snapshot.pointerBytes, 'current art-direction pointer', validateArtDirectionPointer);
  if (pointer.record !== `art-direction-runs/sha256-${pointer.sha256}.json`) {
    return fail('current art-direction pointer does not match its record hash');
  }
  const record = parse(snapshot.recordBytes, 'current art-direction record', validateArtDirectionRecord);
  if (artDirectionSha256(record) !== pointer.sha256) {
    return fail('current art-direction record does not match its pointer');
  }
  const artHandoff = parse(snapshot.artDirectionHandoffBytes, 'current art-direction handoff', parseReferenceHandoffReceipt);
  const preSelectionSha256 = referenceSelectionV2Sha256(snapshot.preSelection);
  if (snapshot.artDirectionHandoffBytes.toString('utf8') !== canonicalJson(artHandoff)
    || artHandoff.role !== 'art-direction'
    || artHandoff.payloadSha256 !== record.referenceHandoffSha256
    || artHandoff.captureSha256 !== snapshot.captureSha256
    || artHandoff.assemblySha256 !== snapshot.assemblySha256
    || artHandoff.projectionSha256 !== snapshot.projectionSha256
    || artHandoff.preSelectionSha256 !== preSelectionSha256
    || canonicalJson(artHandoff.positiveMotion) !== canonicalJson(referencePositiveMotion(snapshot.preSelection))) {
    return fail('current art-direction record does not bind the persisted art-direction handoff');
  }
  if (record.decision.preSelectionSha256 !== preSelectionSha256) {
    return fail('current art-direction record does not bind the immutable pre-selection');
  }
  const motion = parse(snapshot.motionResolutionBytes, 'persisted motion resolution', validateMotionResolutionProjection);
  if (motion.alternativesSha256 !== record.decision.alternativesSha256
    || motion.handoffSha256 !== artHandoff.payloadSha256
    || motion.evaluatorInvocationSha256 !== record.decision.authorInvocationSha256
    || motion.evaluatorPayloadSha256 !== record.decision.authorPayloadSha256
    || motion.evaluatorResultSha256 !== record.decision.authorResultSha256
    || motion.motionDecision !== record.decision.motionDecision) {
    return fail('motion resolution provenance disagrees with the current art direction');
  }
  const motionSelectedSlots = motion.slots.filter(slot => slot.obligationDisposition === 'used').map(slot => slot.slotId).sort();
  if (JSON.stringify(motionSelectedSlots) !== JSON.stringify([...record.decision.selectedMotionReferenceSlotIds].sort())) {
    return fail('motion resolution selected slots disagree with the current art direction');
  }
  if (snapshot.motionResolutionBytes.toString('utf8') !== canonicalJson(motion)
    || motionResolutionProjectionSha256(motion) !== record.decision.motionResolutionProjectionSha256
    || motion.activationSha256 !== record.activationSha256
    || motion.selectionSha256 !== preSelectionSha256) {
    return fail('persisted motion resolution does not bind the current art-direction record');
  }
  const settledSelection = parse(snapshot.settledSelectionBytes, 'current settled selection', parseReferenceSelectionV2);
  const immutableSettled = parse(snapshot.immutableSettledSelectionBytes, 'immutable settled selection record', parseReferenceSelectionV2);
  if (snapshot.settledSelectionBytes.toString('utf8') !== canonicalJson(settledSelection)
    || snapshot.immutableSettledSelectionBytes.toString('utf8') !== canonicalJson(immutableSettled)
    || referenceSelectionV2Sha256(immutableSettled) !== record.decision.settledSelectionSha256
    || canonicalJson(immutableSettled) !== canonicalJson(settledSelection)) {
    return fail('current settled selection does not match its immutable record');
  }
  const expectedSettled = materializeSettledReferenceSelection(snapshot.preSelection, { ...motion, selection: snapshot.preSelection });
  if (canonicalJson(expectedSettled) !== canonicalJson(settledSelection)) {
    return fail('current settled selection does not match the persisted motion resolution');
  }
  const selectedMotion = new Set(record.decision.selectedMotionReferenceSlotIds);
  for (const slot of settledSelection.slots) {
    if (slot.signal === 'high-motion' && slot.rights === 'lawful' && slot.motionAxis === 'available'
      && slot.obligationDisposition !== (selectedMotion.has(slot.slotId) ? 'used' : 'rejected')) {
      return fail(`settled selection disagrees with the final motion decision for ${slot.slotId}`);
    }
  }
  return {
    artDirectionSha256: pointer.sha256,
    motionResolutionProjectionSha256: record.decision.motionResolutionProjectionSha256,
    settledSelectionSha256: record.decision.settledSelectionSha256,
    settledSelection,
  };
}

const readCurrentSettlementGraph = (root: string): ValidatedReferenceSettlement => {
  const preSelection = validatePreReferenceSelectionV2(root);
  const artifacts = readReferenceBoardArtifacts(root);
  const pointerBytes = Buffer.from(readRegularFile(join(root, '.omd', 'art-direction.json'), 'current art-direction pointer'));
  let pointer;
  try { pointer = validateArtDirectionPointer(JSON.parse(pointerBytes.toString('utf8'))); } catch { return fail('current art-direction pointer is invalid JSON'); }
  const recordBytes = Buffer.from(readRegularFile(join(root, '.omd', pointer.record), 'current art-direction record'));
  let record;
  try { record = validateArtDirectionRecord(JSON.parse(recordBytes.toString('utf8'))); } catch { return fail('current art-direction record is invalid JSON'); }
  return validateReferenceSettlementSnapshot({
    pointerBytes,
    recordBytes,
    artDirectionHandoffBytes: Buffer.from(readRegularFile(join(root, '.omd', 'reference-handoffs', 'art-direction.json'), 'current art-direction handoff')),
    motionResolutionBytes: Buffer.from(readRegularFile(join(root, '.omd', 'motion-resolutions', `sha256-${record.decision.motionResolutionProjectionSha256}.json`), 'persisted motion resolution')),
    settledSelectionBytes: Buffer.from(readRegularFile(join(root, '.omd', 'reference-selection-v2.json'), 'current settled selection')),
    immutableSettledSelectionBytes: Buffer.from(readRegularFile(join(root, '.omd', 'settled-reference-selections', `sha256-${record.decision.settledSelectionSha256}.json`), 'immutable settled selection record')),
    preSelection,
    captureSha256: sha256(artifacts.boardBytes),
    assemblySha256: sha256(artifacts.assemblyBytes),
    projectionSha256: sha256(artifacts.projectionBytes),
  });
};
export function createReferenceHandoffReceipt(
  root: string,
  handoffRole: ReferenceHandoffRole,
): ReferenceHandoffReceipt {
  const selection = validatePreReferenceSelectionV2(root);
  const artifacts = readReferenceBoardArtifacts(root);
  if (handoffRole === 'art-direction') {
    const receiptWithoutPayload = {
      schemaVersion: REFERENCE_HANDOFF_SCHEMA_VERSION,
      role: handoffRole,
      captureSha256: sha256(artifacts.boardBytes),
      assemblySha256: sha256(artifacts.assemblyBytes),
      projectionSha256: sha256(artifacts.projectionBytes),
      preSelectionSha256: referenceSelectionV2Sha256(selection),
      positiveMotion: referencePositiveMotion(selection),
    } as const;
    return { ...receiptWithoutPayload, payloadSha256: referenceHandoffPayloadSha256(receiptWithoutPayload) };
  }
  const graph = readCurrentSettlementGraph(root);
  const receiptWithoutPayload = {
    schemaVersion: REFERENCE_HANDOFF_SCHEMA_VERSION,
    role: handoffRole,
    captureSha256: sha256(artifacts.boardBytes),
    assemblySha256: sha256(artifacts.assemblyBytes),
    projectionSha256: sha256(artifacts.projectionBytes),
    preSelectionSha256: referenceSelectionV2Sha256(selection),
    artDirectionSha256: graph.artDirectionSha256,
    motionResolutionProjectionSha256: graph.motionResolutionProjectionSha256,
    settledSelectionSha256: graph.settledSelectionSha256,
    positiveMotion: referencePositiveMotion(graph.settledSelection),
  } as const;
  return { ...receiptWithoutPayload, payloadSha256: referenceHandoffPayloadSha256(receiptWithoutPayload) };
}
export function writeReferenceHandoffReceipt(
  root: string,
  handoffRole: ReferenceHandoffRole,
  invocation: ProjectRunInvocation,
): { path: string; receipt: ReferenceHandoffReceipt } {
  const release = acquireProjectMutationLock(root, invocation);
  try {
    const receipt = createReferenceHandoffReceipt(root, handoffRole);
    const path = `.omd/reference-handoffs/${handoffRole}.json`;
    replaceProjectFileAtomically({ projectRoot: root, relativePath: path, content: canonicalJson(receipt), invocation });
    return { path, receipt };
  } finally {
    release();
  }
}
export function validateReferenceHandoffCurrentness(root: string, receiptValue: unknown): ReferenceHandoffReceipt {
  const receipt = parseReferenceHandoffReceipt(receiptValue);
  const preSelection = validatePreReferenceSelectionV2(root);
  const artifacts = readReferenceBoardArtifacts(root);
  if (receipt.captureSha256 !== sha256(artifacts.boardBytes)) fail('capture hash is stale');
  if (receipt.assemblySha256 !== sha256(artifacts.assemblyBytes)) fail('assembly hash is stale');
  if (receipt.projectionSha256 !== sha256(artifacts.projectionBytes)) fail('projection hash is stale');
  if (receipt.preSelectionSha256 !== referenceSelectionV2Sha256(preSelection)) fail('immutable pre-selection hash is stale');
  if (receipt.role === 'art-direction') {
    if (canonicalJson(receipt.positiveMotion) !== canonicalJson(referencePositiveMotion(preSelection))) fail('positive motion availability is stale');
    return receipt;
  }
  const graph = readCurrentSettlementGraph(root);
  if (receipt.artDirectionSha256 !== graph.artDirectionSha256
    || receipt.motionResolutionProjectionSha256 !== graph.motionResolutionProjectionSha256
    || receipt.settledSelectionSha256 !== graph.settledSelectionSha256
    || canonicalJson(receipt.positiveMotion) !== canonicalJson(referencePositiveMotion(graph.settledSelection))) {
    fail('settled handoff does not match the current persisted settlement graph');
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
