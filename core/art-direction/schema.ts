import { createHash } from 'node:crypto';

export const LEGACY_ART_DIRECTION_SCHEMA_VERSION = 'art-direction-v1' as const;
export const ART_DIRECTION_SCHEMA_VERSION = 'art-direction-v2' as const;
export const REGISTERS = ['quiet', 'confident', 'showpiece'] as const;
export const MOTION_DECISIONS = ['none', 'one'] as const;
export const LEGACY_ART_DIRECTION_RECORD_SCHEMA_VERSION = 'art-direction-record-v2' as const;
export const ART_DIRECTION_RECORD_SCHEMA_VERSION = 'art-direction-record-v3' as const;
export const ART_DIRECTION_POINTER_SCHEMA_VERSION = 'art-direction-current-v2' as const;
/** Exactly the keys a caller may author in an `omd art-direction check` payload. */
export const ART_DIRECTION_CHECK_INPUT_KEYS = [
  'route', 'alternatives', 'references', 'eligibility', 'evaluatorAssessment', 'evaluatorResult',
  'beats', 'invocation', 'deliberation', 'implementationLane', 'fallbackPath', 'performanceAccessibilityBudget',
] as const;

export type Register = (typeof REGISTERS)[number];
export type MotionDecision = (typeof MOTION_DECISIONS)[number];
export type ReferenceSignal = 'high-visual-system' | 'high-motion' | 'supporting-component' | 'supporting-content' | 'anti-reference';

export type ArtDirectionReference = {
  readonly slotId: string;
  readonly signal: ReferenceSignal;
  readonly positive: boolean;
  readonly lawful: boolean;
  readonly motionObligation: 'none' | 'accepted' | 'adapted';
};

type ArtDirectionAlternativeBase = {
  readonly register: Register;
  readonly subjectIdentityFit: string;
  readonly staticReferenceSlotIds: readonly string[];
  readonly motionReferenceSlotIds: readonly string[];
  readonly conceptRole: string;
  readonly macroCompositionHypothesis: string;
  readonly motionHypothesis: MotionDecision;
  readonly uxAccessibilityPerformanceRisks: readonly string[];
  readonly lawfulImplementationPath: string;
  readonly rejectionCondition: string;
};

export type LegacyArtDirectionAlternative = ArtDirectionAlternativeBase;
export type ArtDirectionAlternative = ArtDirectionAlternativeBase & {
  readonly metaphorQualities: readonly string[];
  readonly literalPropsToReject: readonly string[];
};

export type RejectedArtDirectionAlternative = {
  readonly register: Register;
  readonly reason: string;
  readonly citedReferenceSlotIds: readonly string[];
};

type ArtDirectionDecisionBase<SchemaVersion extends string, Alternative> = {
  readonly schemaVersion: SchemaVersion;
  readonly activationSha256: string;
  readonly intentSha256: string;
  readonly boardSha256: string;
  readonly preSelectionSha256: string;
  readonly route: string;
  readonly source: 'explicit-user' | 'agent-evidence';
  readonly consideredAlternatives: readonly Alternative[];
  readonly selectedRegister: Register;
  readonly motionDecision: MotionDecision;
  readonly conceptRole: string;
  readonly selectedStaticReferenceSlotIds: readonly string[];
  readonly selectedMotionReferenceSlotIds: readonly string[];
  readonly alternativesSha256: string;
  readonly motionResolutionProjectionSha256: string;
  readonly settledSelectionSha256: string;
  readonly implementationLane: string;
  readonly fallbackPath: string;
  readonly performanceAccessibilityBudget: string;
  readonly rejectedAlternatives: readonly RejectedArtDirectionAlternative[];
  readonly authorInvocationSha256: string;
  readonly authorPayloadSha256: string;
  readonly authorResultSha256: string;
  /** Immutable current-intent ledger receipt used by canonical copy exception binding. */
  readonly currentUserBeatExceptionReceiptSha256: string;
  readonly compositionSha256?: never;
  readonly userPrompt?: never;
};

export type LegacyArtDirectionDecision = ArtDirectionDecisionBase<
  typeof LEGACY_ART_DIRECTION_SCHEMA_VERSION,
  LegacyArtDirectionAlternative
>;
export type ArtDirectionDecision = ArtDirectionDecisionBase<
  typeof ART_DIRECTION_SCHEMA_VERSION,
  ArtDirectionAlternative
> & {
  readonly metaphorQualities: readonly string[];
  readonly literalPropsToReject: readonly string[];
};
export type ParsedArtDirectionDecision = LegacyArtDirectionDecision | ArtDirectionDecision;

type ArtDirectionRecordBase<SchemaVersion extends string, Decision> = {
  readonly schemaVersion: SchemaVersion;
  readonly decision: Decision;
  readonly decisionSha256: string;
  readonly referenceHandoffSha256: string;
  readonly intentLedgerSha256: string;
  readonly activationSha256: string;
  readonly beatIds: readonly string[];
};

export type LegacyArtDirectionRecord = ArtDirectionRecordBase<
  typeof LEGACY_ART_DIRECTION_RECORD_SCHEMA_VERSION,
  LegacyArtDirectionDecision
>;
export type ArtDirectionRecord = ArtDirectionRecordBase<
  typeof ART_DIRECTION_RECORD_SCHEMA_VERSION,
  ArtDirectionDecision
>;
export type ParsedArtDirectionRecord = LegacyArtDirectionRecord | ArtDirectionRecord;

export type ArtDirectionPointer = {
  readonly schemaVersion: typeof ART_DIRECTION_POINTER_SCHEMA_VERSION;
  readonly record: string;
  readonly sha256: string;
};

const SHA256 = /^[a-f0-9]{64}$/;
const RECORD = /^art-direction-runs\/sha256-([a-f0-9]{64})\.json$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function artDirectionSha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
const LEGACY_DECISION_KEYS = ['activationSha256', 'alternativesSha256', 'authorInvocationSha256', 'authorPayloadSha256', 'authorResultSha256', 'boardSha256', 'conceptRole', 'consideredAlternatives', 'currentUserBeatExceptionReceiptSha256', 'fallbackPath', 'implementationLane', 'intentSha256', 'motionDecision', 'motionResolutionProjectionSha256', 'performanceAccessibilityBudget', 'preSelectionSha256', 'rejectedAlternatives', 'route', 'schemaVersion', 'selectedMotionReferenceSlotIds', 'selectedRegister', 'selectedStaticReferenceSlotIds', 'settledSelectionSha256', 'source'] as const;
const DECISION_KEYS = [...LEGACY_DECISION_KEYS, 'literalPropsToReject', 'metaphorQualities'] as const;
const LEGACY_ALTERNATIVE_KEYS = ['conceptRole', 'lawfulImplementationPath', 'macroCompositionHypothesis', 'motionHypothesis', 'motionReferenceSlotIds', 'register', 'rejectionCondition', 'staticReferenceSlotIds', 'subjectIdentityFit', 'uxAccessibilityPerformanceRisks'] as const;
const ALTERNATIVE_KEYS = [...LEGACY_ALTERNATIVE_KEYS, 'literalPropsToReject', 'metaphorQualities'] as const;
const REJECTION_KEYS = ['citedReferenceSlotIds', 'reason', 'register'] as const;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim() !== '');
}
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim() !== '');
}

export function validateArtDirectionDecisionShape(value: unknown): ParsedArtDirectionDecision {
  if (!isRecord(value)) throw new ArtDirectionValidationError('decision has an invalid exact shape');
  const current = value.schemaVersion === ART_DIRECTION_SCHEMA_VERSION;
  const legacy = value.schemaVersion === LEGACY_ART_DIRECTION_SCHEMA_VERSION;
  const decisionKeys = current ? DECISION_KEYS : legacy ? LEGACY_DECISION_KEYS : [];
  const alternativeKeys = current ? ALTERNATIVE_KEYS : LEGACY_ALTERNATIVE_KEYS;
  if ((!current && !legacy) || !exactKeys(value, decisionKeys)
    || typeof value.route !== 'string' || value.route.trim() === '' || typeof value.conceptRole !== 'string' || value.conceptRole.trim() === ''
    || typeof value.implementationLane !== 'string' || value.implementationLane.trim() === '' || typeof value.fallbackPath !== 'string'
    || value.fallbackPath.trim() === '' || typeof value.performanceAccessibilityBudget !== 'string' || value.performanceAccessibilityBudget.trim() === ''
    || (current && (!isNonEmptyStringArray(value.metaphorQualities) || !isNonEmptyStringArray(value.literalPropsToReject)))
    || (value.source !== 'explicit-user' && value.source !== 'agent-evidence') || !isRegister(value.selectedRegister)
    || !isMotionDecision(value.motionDecision) || !isNonEmptyStringArray(value.selectedStaticReferenceSlotIds)
    || !isStringArray(value.selectedMotionReferenceSlotIds) || !Array.isArray(value.consideredAlternatives)
    || !Array.isArray(value.rejectedAlternatives)) {
    throw new ArtDirectionValidationError('decision has an invalid exact shape');
  }
  const hashes = ['activationSha256', 'intentSha256', 'boardSha256', 'preSelectionSha256', 'alternativesSha256', 'motionResolutionProjectionSha256', 'settledSelectionSha256', 'authorInvocationSha256', 'authorPayloadSha256', 'authorResultSha256', 'currentUserBeatExceptionReceiptSha256'];
  if (hashes.some((field) => typeof value[field] !== 'string' || !SHA256.test(value[field]))) throw new ArtDirectionValidationError('decision contains an invalid hash');
  const alternativeCount = value.consideredAlternatives.length;
  const registers = new Set(value.consideredAlternatives.map((alternative) => isRecord(alternative) ? alternative.register : ''));
  // Shape validation is not current-user authority; the resolver verifies the actual register lock.
  if (alternativeCount === 0 || registers.size !== alternativeCount || !registers.has(value.selectedRegister)
    || (alternativeCount === 1 && value.source !== 'explicit-user')
    || value.consideredAlternatives.some((alternative) => !isRecord(alternative) || !exactKeys(alternative, alternativeKeys)
      || !isRegister(alternative.register) || !isMotionDecision(alternative.motionHypothesis)
      || (current && (!isNonEmptyStringArray(alternative.metaphorQualities) || !isNonEmptyStringArray(alternative.literalPropsToReject)))
      || !isNonEmptyStringArray(alternative.staticReferenceSlotIds) || !isStringArray(alternative.motionReferenceSlotIds)
      || !isNonEmptyStringArray(alternative.uxAccessibilityPerformanceRisks)
      || ['conceptRole', 'lawfulImplementationPath', 'macroCompositionHypothesis', 'rejectionCondition', 'subjectIdentityFit'].some((field) => typeof alternative[field] !== 'string' || alternative[field].trim() === ''))
    || value.rejectedAlternatives.length !== alternativeCount - 1
    || new Set(value.rejectedAlternatives.map(rejected => isRecord(rejected) ? rejected.register : '')).size !== alternativeCount - 1
    || value.rejectedAlternatives.some((rejected) => !isRecord(rejected)
      || !exactKeys(rejected, REJECTION_KEYS) || !isRegister(rejected.register) || rejected.register === value.selectedRegister
      || !registers.has(rejected.register)
      || typeof rejected.reason !== 'string' || rejected.reason.trim() === '' || !isNonEmptyStringArray(rejected.citedReferenceSlotIds))) {
    throw new ArtDirectionValidationError('decision alternatives or rejections have an invalid exact shape');
  }
  if (current) {
    const selected = value.consideredAlternatives.find((alternative) => isRecord(alternative) && alternative.register === value.selectedRegister);
    if (!isRecord(selected)
      || canonicalJson(selected.metaphorQualities) !== canonicalJson(value.metaphorQualities)
      || canonicalJson(selected.literalPropsToReject) !== canonicalJson(value.literalPropsToReject)) {
      throw new ArtDirectionValidationError('decision does not bind the selected metaphor contract');
    }
  }
  return value as unknown as ParsedArtDirectionDecision;
}

export function validateArtDirectionRecord(value: unknown): ParsedArtDirectionRecord {
  if (!isRecord(value)) throw new ArtDirectionValidationError('record must be an object');
  const record = value;
  const decision = record.decision;
  const current = record.schemaVersion === ART_DIRECTION_RECORD_SCHEMA_VERSION;
  const legacy = record.schemaVersion === LEGACY_ART_DIRECTION_RECORD_SCHEMA_VERSION;
  const keys = Object.keys(record).sort();
  const expected = ['activationSha256', 'beatIds', 'decision', 'decisionSha256', 'intentLedgerSha256', 'referenceHandoffSha256', 'schemaVersion'];
  if ((!current && !legacy) || keys.length !== expected.length || keys.some((key, index) => key !== expected[index])
    || !isRecord(decision)
    || (current && decision.schemaVersion !== ART_DIRECTION_SCHEMA_VERSION)
    || (legacy && decision.schemaVersion !== LEGACY_ART_DIRECTION_SCHEMA_VERSION)
    || typeof record.decisionSha256 !== 'string' || !SHA256.test(record.decisionSha256)
    || typeof record.referenceHandoffSha256 !== 'string' || !SHA256.test(record.referenceHandoffSha256)
    || typeof record.intentLedgerSha256 !== 'string' || !SHA256.test(record.intentLedgerSha256)
    || typeof record.activationSha256 !== 'string' || !SHA256.test(record.activationSha256)
    || !Array.isArray(record.beatIds)
    || !record.beatIds.every((id) => typeof id === 'string' && /^B-\d+$/.test(id))
    || new Set(record.beatIds).size !== record.beatIds.length
    || artDirectionSha256(decision) !== record.decisionSha256
    || decision.intentSha256 !== record.intentLedgerSha256
    || decision.activationSha256 !== record.activationSha256) {
    throw new ArtDirectionValidationError('record has an invalid shape or content hash');
  }
  validateArtDirectionDecisionShape(decision);
  return record as unknown as ParsedArtDirectionRecord;
}

export function validateArtDirectionPointer(value: unknown): ArtDirectionPointer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ArtDirectionValidationError('current pointer must be an object');
  const pointer = value as Record<string, unknown>;
  const keys = Object.keys(pointer).sort();
  const expected = ['record', 'schemaVersion', 'sha256'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])
    || pointer.schemaVersion !== ART_DIRECTION_POINTER_SCHEMA_VERSION
    || typeof pointer.record !== 'string' || !RECORD.test(pointer.record)
    || typeof pointer.sha256 !== 'string' || !SHA256.test(pointer.sha256)) {
    throw new ArtDirectionValidationError('current pointer has an invalid shape');
  }
  return pointer as ArtDirectionPointer;
}

export class ArtDirectionValidationError extends Error {
  override readonly name = 'ArtDirectionValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`art direction is invalid: ${reason}`);
    this.reason = reason;
  }
}

export function isRegister(value: unknown): value is Register {
  return typeof value === 'string' && (REGISTERS as readonly string[]).includes(value);
}

export function isMotionDecision(value: unknown): value is MotionDecision {
  return typeof value === 'string' && (MOTION_DECISIONS as readonly string[]).includes(value);
}
