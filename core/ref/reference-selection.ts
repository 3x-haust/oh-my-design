import { existsSync, lstatSync, readFileSync, type Stats } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalJson, readReferenceBoardArtifacts, sha256 } from './board-artifacts.ts';
import type { ReferenceAxis, ReferenceRights, ReferenceSignal } from './board-projection.ts';
import { requireApprovedMotionRecipeAuthorization, requireEvaluatorAssessmentAuthorization, requireEvaluatorResultAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { ProjectWriteError, replaceProjectFileAtomically, writeImmutableProjectFile } from '../runtime/project-write.ts';

export const REFERENCE_SELECTION_SCHEMA_VERSION = 'reference-selection-v1';
export const REFERENCE_SELECTION_V2_SCHEMA_VERSION = 'reference-selection-v2' as const;
export const REFERENCE_PRE_SELECTION_POINTER_SCHEMA_VERSION = 'reference-pre-selection-pointer-v1' as const;
export const OBLIGATION_DISPOSITION_VALUES = ['used', 'rejected', 'not-applicable'] as const;
export type ObligationDisposition = (typeof OBLIGATION_DISPOSITION_VALUES)[number];

export type ReferenceSelection = {
  readonly schemaVersion: typeof REFERENCE_SELECTION_SCHEMA_VERSION;
  readonly boardSha256: string;
  readonly assemblySha256: string;
  readonly candidateId: string;
};

export type ReferenceSelectionSlotV2 = {
  readonly slotId: string;
  readonly rights: ReferenceRights;
  readonly signal: ReferenceSignal;
  readonly staticAxis: ReferenceAxis;
  readonly motionAxis: ReferenceAxis;
  readonly obligationDisposition: ObligationDisposition;
  readonly obligationReason: string;
};

export type ReferenceSelectionDispositionV2 = Pick<ReferenceSelectionSlotV2, 'slotId' | 'obligationDisposition' | 'obligationReason'>;

export type ReferenceSelectionV2 = {
  readonly schemaVersion: typeof REFERENCE_SELECTION_V2_SCHEMA_VERSION;
  readonly captureSha256: string;
  readonly assemblySha256: string;
  readonly projectionSha256: string;
  readonly candidateId: string;
  readonly slots: readonly ReferenceSelectionSlotV2[];
};
type ReferencePreSelectionPointer = {
  readonly schemaVersion: typeof REFERENCE_PRE_SELECTION_POINTER_SCHEMA_VERSION;
  readonly sha256: string;
  readonly record: string;
};
export const MOTION_RESOLUTION_SCHEMA_VERSION = 'motion-resolution-v1' as const;
export type ApprovedMotionRecipeResolution = {
  readonly recipeId: string;
  readonly recipeSha256: string;
};
export type MotionResolutionProjection = {
  readonly schemaVersion: typeof MOTION_RESOLUTION_SCHEMA_VERSION;
  readonly activationSha256: string;
  readonly alternativesSha256: string;
  readonly selectionSha256: string;
  readonly handoffSha256: string;
  readonly evaluatorInvocationSha256: string;
  readonly evaluatorPayloadSha256: string;
  readonly evaluatorResultSha256: string;
  readonly motionDecision: 'one' | 'none';
  readonly slots: readonly ReferenceSelectionDispositionV2[];
  readonly approvedRecipe?: ApprovedMotionRecipeResolution;
};
export type ResolveMotionProjectionInput = Omit<MotionResolutionProjection, 'schemaVersion' | 'selectionSha256'> & {
  readonly selection: ReferenceSelectionV2;
};
export type MotionResolutionEvidenceBytes = {
  readonly assessmentBytes: Uint8Array;
  readonly resultBytes: Uint8Array;
  readonly approvedRecipeBytes?: Uint8Array;
};

export function motionResolutionProjectionSha256(projection: MotionResolutionProjection): string {
  return sha256(canonicalJson(validateMotionResolutionProjection(projection)));
}

export class ReferenceSelectionValidationError extends Error {
  override readonly name = 'ReferenceSelectionValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`reference selection is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new ReferenceSelectionValidationError(reason); };
const required = <Value>(value: Value | undefined, reason: string): Value => value === undefined ? fail(reason) : value;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const selectionPath = (root: string): string => join(root, '.omd', 'reference-selection.json');
const preSelectionV2Path = (root: string): string => join(root, '.omd', 'reference-pre-selection-v2.json');
const selectionV2Path = (root: string): string => join(root, '.omd', 'reference-selection-v2.json');
const sha = (value: unknown, label: string): string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : fail(`${label} must be 64 lowercase hexadecimal characters`);
const string = (value: unknown, label: string): string => typeof value === 'string' && value.trim() !== '' ? value : fail(`${label} must be a non-empty string`);
const preSelectionRecordPath = (digest: string): string => `pre-reference-selections/sha256-${digest}.json`;
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
    if (error instanceof ReferenceSelectionValidationError) throw error;
    return fail(`${label} is missing or unreadable`);
  }
};
const parsePreSelectionPointer = (value: unknown): ReferencePreSelectionPointer => {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'record,schemaVersion,sha256'
    || value['schemaVersion'] !== REFERENCE_PRE_SELECTION_POINTER_SCHEMA_VERSION) return fail('pre-selection pointer has unknown or missing keys');
  const digest = sha(value['sha256'], 'pre-selection pointer sha256');
  const record = string(value['record'], 'pre-selection pointer record');
  if (record !== preSelectionRecordPath(digest)) return fail('pre-selection pointer record does not match its hash');
  return { schemaVersion: REFERENCE_PRE_SELECTION_POINTER_SCHEMA_VERSION, sha256: digest, record };
};
const readImmutablePreSelectionRecord = (root: string, digest: string, record: string): ReferenceSelectionV2 => {
  const body = readRegularFile(join(root, '.omd', record), 'immutable pre-selection record');
  try {
    const selection = parseReferenceSelectionV2(JSON.parse(body));
    if (body !== canonicalJson(selection) || referenceSelectionV2Sha256(selection) !== digest) fail('immutable pre-selection record does not match its hash');
    return selection;
  } catch (error) {
    if (error instanceof ReferenceSelectionValidationError) throw error;
    return fail('immutable pre-selection record is invalid JSON');
  }
};
const writeImmutableContentAddressed = (root: string, relativePath: string, content: string, invocation: ProjectRunInvocation): void => {
  try {
    writeImmutableProjectFile({ projectRoot: root, relativePath, content, invocation });
  } catch (error) {
    if (!(error instanceof ProjectWriteError) || !error.reason.startsWith('immutable project artifact already exists:')) throw error;
    if (readRegularFile(join(root, relativePath), 'immutable project artifact') !== content) fail('immutable project artifact does not match its content address');
  }
};
const persistImmutablePreSelection = (root: string, selection: ReferenceSelectionV2, invocation: ProjectRunInvocation): ReferencePreSelectionPointer => {
  const digest = referenceSelectionV2Sha256(selection);
  const record = preSelectionRecordPath(digest);
  writeImmutableContentAddressed(root, `.omd/${record}`, canonicalJson(selection), invocation);
  return { schemaVersion: REFERENCE_PRE_SELECTION_POINTER_SCHEMA_VERSION, sha256: digest, record };
};
const axis = (value: unknown, label: string): ReferenceAxis => value === 'available' || value === 'absent' ? value : fail(`${label} must be available or absent`);
const signal = (value: unknown, label: string): ReferenceSignal => (
  value === 'high-visual-system' || value === 'high-motion' || value === 'supporting-component' || value === 'supporting-content' || value === 'anti-reference'
) ? value : fail(`${label} must be a supported signal`);
const disposition = (value: unknown, label: string): ObligationDisposition => (
  value === 'used' || value === 'rejected' || value === 'not-applicable'
) ? value : fail(`${label} must be used, rejected, or not-applicable`);
const rights = (value: unknown, label: string): ReferenceRights => (
  value === 'lawful' || value === 'restricted' || value === 'unknown'
) ? value : fail(`${label} must be lawful, restricted, or unknown`);

export function parseReferenceSelection(value: unknown): ReferenceSelection {
  if (!isRecord(value)) return fail('record must be an object');
  const keys = Object.keys(value).sort(); const expected = ['assemblySha256', 'boardSha256', 'candidateId', 'schemaVersion'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail('record has unknown or missing keys');
  if (value['schemaVersion'] !== REFERENCE_SELECTION_SCHEMA_VERSION) fail(`schemaVersion must be ${REFERENCE_SELECTION_SCHEMA_VERSION}`);
  return {
    schemaVersion: REFERENCE_SELECTION_SCHEMA_VERSION,
    boardSha256: sha(value['boardSha256'], 'boardSha256'), assemblySha256: sha(value['assemblySha256'], 'assemblySha256'), candidateId: string(value['candidateId'], 'candidateId'),
  };
}

const parseSlots = (value: unknown): readonly ReferenceSelectionSlotV2[] => {
  if (!Array.isArray(value) || value.length === 0) return fail('slots must be a non-empty array');
  const slots = value.map((entry, index): ReferenceSelectionSlotV2 => {
    if (!isRecord(entry)) return fail(`slots[${index}] must be an object`);
    const keys = Object.keys(entry).sort(); const expected = ['motionAxis', 'obligationDisposition', 'obligationReason', 'rights', 'signal', 'slotId', 'staticAxis'];
    if (keys.length !== expected.length || keys.some((key, keyIndex) => key !== expected[keyIndex])) fail(`slots[${index}] has unknown or missing keys`);
    const parsed = {
      slotId: string(entry['slotId'], `slots[${index}].slotId`),
      rights: rights(entry['rights'], `slots[${index}].rights`),
      signal: signal(entry['signal'], `slots[${index}].signal`),
      staticAxis: axis(entry['staticAxis'], `slots[${index}].staticAxis`),
      motionAxis: axis(entry['motionAxis'], `slots[${index}].motionAxis`),
      obligationDisposition: disposition(entry['obligationDisposition'], `slots[${index}].obligationDisposition`),
      obligationReason: string(entry['obligationReason'], `slots[${index}].obligationReason`),
    };
    if (parsed.signal === 'anti-reference' && parsed.obligationDisposition === 'used') fail(`slots[${index}] is anti-reference evidence and cannot be used`);
    if (parsed.rights !== 'lawful' && parsed.obligationDisposition === 'used') fail(`slots[${index}] is not lawful and cannot be used`);
    if (parsed.motionAxis === 'absent' && parsed.obligationDisposition === 'used' && parsed.signal === 'high-motion') fail(`slots[${index}] cannot use an absent motion axis`);
    if (parsed.signal === 'high-motion' && parsed.motionAxis === 'available' && parsed.obligationReason.trim().length === 0) fail(`slots[${index}] requires an evidence-backed disposition reason`);
    if (parsed.signal === 'anti-reference' && parsed.obligationDisposition === 'not-applicable' && parsed.obligationReason.trim().length === 0) fail(`slots[${index}] requires an anti-reference disposition reason`);
    return parsed;
  });
  if (new Set(slots.map((slot) => slot.slotId)).size !== slots.length) fail('slots must not contain duplicate slotId values');
  return slots;
};

export function parseReferenceSelectionV2(value: unknown): ReferenceSelectionV2 {
  if (!isRecord(value)) return fail('record must be an object');
  const keys = Object.keys(value).sort(); const expected = ['assemblySha256', 'candidateId', 'captureSha256', 'projectionSha256', 'schemaVersion', 'slots'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail('record has unknown or missing keys');
  if (value['schemaVersion'] !== REFERENCE_SELECTION_V2_SCHEMA_VERSION) fail(`schemaVersion must be ${REFERENCE_SELECTION_V2_SCHEMA_VERSION}`);
  return {
    schemaVersion: REFERENCE_SELECTION_V2_SCHEMA_VERSION,
    captureSha256: sha(value['captureSha256'], 'captureSha256'), assemblySha256: sha(value['assemblySha256'], 'assemblySha256'), projectionSha256: sha(value['projectionSha256'], 'projectionSha256'), candidateId: string(value['candidateId'], 'candidateId'), slots: parseSlots(value['slots']),
  };
}
export function validateMotionResolutionProjection(value: unknown): MotionResolutionProjection {
  if (!isRecord(value)) return fail('motion resolution must be an object');
  const hasRecipe = value['approvedRecipe'] !== undefined;
  const expected = hasRecipe
    ? ['activationSha256', 'alternativesSha256', 'approvedRecipe', 'evaluatorInvocationSha256', 'evaluatorPayloadSha256', 'evaluatorResultSha256', 'handoffSha256', 'motionDecision', 'schemaVersion', 'selectionSha256', 'slots']
    : ['activationSha256', 'alternativesSha256', 'evaluatorInvocationSha256', 'evaluatorPayloadSha256', 'evaluatorResultSha256', 'handoffSha256', 'motionDecision', 'schemaVersion', 'selectionSha256', 'slots'];
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) || value['schemaVersion'] !== MOTION_RESOLUTION_SCHEMA_VERSION) return fail('motion resolution has unknown or missing keys');
  const slots = Array.isArray(value['slots']) ? value['slots'].map((entry, index) => {
    if (!isRecord(entry) || Object.keys(entry).length !== 3) return fail(`motion slots[${index}] has an invalid shape`);
    return { slotId: string(entry['slotId'], `motion slots[${index}].slotId`), obligationDisposition: disposition(entry['obligationDisposition'], `motion slots[${index}].obligationDisposition`), obligationReason: string(entry['obligationReason'], `motion slots[${index}].obligationReason`) };
  }) : fail('motion slots must be an array');
  const projection: MotionResolutionProjection = {
    schemaVersion: MOTION_RESOLUTION_SCHEMA_VERSION,
    activationSha256: sha(value['activationSha256'], 'activationSha256'), alternativesSha256: sha(value['alternativesSha256'], 'alternativesSha256'), selectionSha256: sha(value['selectionSha256'], 'selectionSha256'), handoffSha256: sha(value['handoffSha256'], 'handoffSha256'),
    evaluatorInvocationSha256: sha(value['evaluatorInvocationSha256'], 'evaluatorInvocationSha256'), evaluatorPayloadSha256: sha(value['evaluatorPayloadSha256'], 'evaluatorPayloadSha256'), evaluatorResultSha256: sha(value['evaluatorResultSha256'], 'evaluatorResultSha256'),
    motionDecision: value['motionDecision'] === 'one' || value['motionDecision'] === 'none' ? value['motionDecision'] : fail('motionDecision must be one or none'),
    slots,
    ...(hasRecipe ? (() => {
      if (!isRecord(value['approvedRecipe']) || Object.keys(value['approvedRecipe']).sort().join(',') !== 'recipeId,recipeSha256') return fail('approvedRecipe has an invalid shape');
      return { approvedRecipe: { recipeId: string(value['approvedRecipe']['recipeId'], 'approvedRecipe.recipeId'), recipeSha256: sha(value['approvedRecipe']['recipeSha256'], 'approvedRecipe.recipeSha256') } };
    })() : {}),
  };
  if (new Set(projection.slots.map((slot) => slot.slotId)).size !== projection.slots.length) return fail('motion slots must not contain duplicate slotId values');
  if (projection.motionDecision === 'one') {
    if (projection.approvedRecipe === undefined) {
      if (projection.slots.filter((slot) => slot.obligationDisposition === 'used').length !== 1
        || projection.slots.some((slot) => slot.obligationDisposition !== 'used' && slot.obligationDisposition !== 'rejected')) {
        return fail('one must use exactly one lawful pending motion slot and reject every other pending slot');
      }
    } else if (projection.slots.some((slot) => slot.obligationDisposition !== 'rejected')) {
      return fail('a recipe-backed one must reject every pending reference motion slot');
    }
  } else if (projection.approvedRecipe !== undefined || projection.slots.some((slot) => slot.obligationDisposition !== 'rejected')) return fail('none must reject every pending slot and cannot select a recipe');
  return projection;
}

export function resolveMotionProjection(input: ResolveMotionProjectionInput): MotionResolutionProjection {
  const { selection: rawSelection, ...resolution } = input;
  const selection = parseReferenceSelectionV2(rawSelection);
  const pending = selection.slots.filter((slot) => slot.signal === 'high-motion' && slot.rights === 'lawful' && slot.motionAxis === 'available' && slot.obligationDisposition === 'not-applicable');
  const projection = validateMotionResolutionProjection({ ...resolution, schemaVersion: MOTION_RESOLUTION_SCHEMA_VERSION, selectionSha256: referenceSelectionV2Sha256(selection) });
  if (projection.slots.length !== pending.length || projection.slots.some((slot) => !pending.some((pendingSlot) => pendingSlot.slotId === slot.slotId))) {
    return fail('motion resolution must settle every lawful pending motion slot exactly once');
  }
  if (projection.motionDecision === 'one' && projection.approvedRecipe === undefined
    && !pending.some((slot) => slot.slotId === projection.slots.find((slot) => slot.obligationDisposition === 'used')?.slotId)) {
    return fail('one must use one lawful pending motion slot');
  }
  return projection;
}

/**
 * Applies an evaluator-owned motion settlement to the canonical selection.
 * The resolution remains bound to the pre-settlement selection digest; the returned
 * selection is the only settled selection that composer and hand may consume.
 */
export function materializeSettledReferenceSelection(
  selection: ReferenceSelectionV2,
  resolution: ResolveMotionProjectionInput,
): ReferenceSelectionV2 {
  const canonical = parseReferenceSelectionV2(selection);
  const settled = resolveMotionProjection({ ...resolution, selection: canonical });
  const bySlot = new Map(settled.slots.map((slot) => [slot.slotId, slot]));
  return parseReferenceSelectionV2({
    ...canonical,
    slots: canonical.slots.map((slot) => {
      const disposition = bySlot.get(slot.slotId);
      return disposition === undefined ? slot : {
        ...slot,
        obligationDisposition: disposition.obligationDisposition,
        obligationReason: disposition.obligationReason,
      };
    }),
  });
}
export function persistMotionResolutionProjection(
  root: string,
  input: ResolveMotionProjectionInput,
  evidence: MotionResolutionEvidenceBytes,
  invocation: ProjectRunInvocation,
): { readonly path: string; readonly projection: MotionResolutionProjection } {
  const projection = resolveMotionProjection(input);
  if (sha256(evidence.assessmentBytes) !== projection.evaluatorPayloadSha256 || sha256(evidence.resultBytes) !== projection.evaluatorResultSha256
    || (projection.approvedRecipe !== undefined && (evidence.approvedRecipeBytes === undefined || sha256(evidence.approvedRecipeBytes) !== projection.approvedRecipe.recipeSha256))) return fail('motion resolution evidence bytes do not match evaluator provenance');
  try {
    requireEvaluatorAssessmentAuthorization(invocation, root, evidence.assessmentBytes);
    requireEvaluatorResultAuthorization(invocation, root, evidence.resultBytes);
    if (projection.approvedRecipe !== undefined) requireApprovedMotionRecipeAuthorization(invocation, root, evidence.approvedRecipeBytes!);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'missing evaluator host authorization');
  }
  const digest = motionResolutionProjectionSha256(projection);
  const relativePath = `.omd/motion-resolutions/sha256-${digest}.json`;
  writeAtomically(root, relativePath, canonicalJson(projection), invocation);
  return { path: relativePath, projection };
}

export function referenceSelectionV2Sha256(selection: ReferenceSelectionV2): string { return sha256(canonicalJson(selection)); }

/**
 * Persists the immutable settlement and atomically advances the current-selection pointer.
 * The settlement must derive from the immutable pre-selection receipt.
 */
export function persistSettledReferenceSelection(
  root: string,
  selection: ReferenceSelectionV2,
  resolution: ResolveMotionProjectionInput,
  invocation: ProjectRunInvocation,
): ReferenceSelectionV2 {
  const preSelection = readPreReferenceSelectionV2(root);
  if (referenceSelectionV2Sha256(selection) !== referenceSelectionV2Sha256(preSelection)) fail('settlement must derive from the immutable pre-selection');
  const settled = materializeSettledReferenceSelection(preSelection, resolution);
  const digest = referenceSelectionV2Sha256(settled);
  writeImmutableContentAddressed(root, `.omd/settled-reference-selections/sha256-${digest}.json`, canonicalJson(settled), invocation);
  writeAtomically(root, '.omd/reference-selection-v2.json', canonicalJson(settled), invocation);
  return settled;
}
export function readPreReferenceSelectionV2(root: string): ReferenceSelectionV2 {
  const body = readRegularFile(preSelectionV2Path(root), 'pre-selection pointer');
  try {
    const pointer = parsePreSelectionPointer(JSON.parse(body));
    if (body !== canonicalJson(pointer)) fail('pre-selection pointer is not canonical');
    return readImmutablePreSelectionRecord(root, pointer.sha256, pointer.record);
  } catch (error) {
    if (error instanceof ReferenceSelectionValidationError) throw error;
    return fail('pre-selection pointer is invalid JSON');
  }
}
export function readReferenceSelection(root: string): ReferenceSelection {
  try { return parseReferenceSelection(JSON.parse(readFileSync(selectionPath(root), 'utf8'))); }
  catch (error) { if (error instanceof ReferenceSelectionValidationError) throw error; return fail('record is missing or invalid JSON'); }
}

export function readReferenceSelectionV2(root: string): ReferenceSelectionV2 {
  try { return parseReferenceSelectionV2(JSON.parse(readRegularFile(selectionV2Path(root), 'settled v2 selection'))); }
  catch (error) { if (error instanceof ReferenceSelectionValidationError) throw error; return fail('v2 record is missing or invalid JSON'); }
}

export function validateReferenceSelection(root: string, manifestPath?: string): ReferenceSelection {
  const selection = readReferenceSelection(root); const artifacts = readReferenceBoardArtifacts(root, manifestPath === undefined ? undefined : resolve(root, manifestPath));
  if (selection.boardSha256 !== sha256(artifacts.boardBytes)) fail('board hash does not match the current validated board');
  if (selection.assemblySha256 !== sha256(artifacts.assemblyBytes)) fail('assembly hash does not match the current sanitized assembly');
  if (!artifacts.assembly.candidates.some((candidate) => candidate.id === selection.candidateId)) fail('candidateId does not exist in the current assembly');
  return selection;
}

export function validateReferenceSelectionV2(root: string, manifestPath?: string): ReferenceSelectionV2 {
  const selection = readReferenceSelectionV2(root); const artifacts = readReferenceBoardArtifacts(root, manifestPath === undefined ? undefined : resolve(root, manifestPath));
  if (selection.captureSha256 !== sha256(artifacts.boardBytes)) fail('capture hash does not match the current canonical capture');
  if (selection.assemblySha256 !== sha256(artifacts.assemblyBytes)) fail('assembly hash does not match the current sanitized assembly');
  if (selection.projectionSha256 !== sha256(artifacts.projectionBytes)) fail('projection hash does not match the current typed projection');
  const candidate = required(artifacts.projection.candidates.find((entry) => entry.id === selection.candidateId), 'candidateId does not exist in the current projection');
  if (candidate.pieces.length !== selection.slots.length) fail('slots must cover every selected candidate piece exactly once');
  for (const slot of selection.slots) {
    const projection = required(candidate.pieces.find((entry) => entry.slotId === slot.slotId), `slotId ${slot.slotId} does not exist in the selected candidate`);
    if (slot.rights !== projection.rights || slot.staticAxis !== projection.staticAxis || slot.motionAxis !== projection.motionAxis || slot.signal !== projection.signal) fail(`slotId ${slot.slotId} does not match the canonical projection`);
    if (slot.signal === 'anti-reference' && slot.obligationDisposition === 'used') fail(`slotId ${slot.slotId} is anti-reference evidence and cannot be used`);
    if (projection.rights !== 'lawful' && slot.obligationDisposition === 'used') fail(`slotId ${slot.slotId} is not lawful and cannot be used`);
  }
  if (!selection.slots.some((slot) => slot.signal === 'high-visual-system' && slot.rights === 'lawful' && slot.obligationDisposition === 'used')) fail('selection requires one lawful high-visual-system positive used slot');
  return selection;
}

const writeAtomically = (root: string, relativePath: string, body: string, invocation: ProjectRunInvocation): string =>
  replaceProjectFileAtomically({ projectRoot: root, relativePath, content: body, invocation });

export function selectReferenceCandidate(root: string, candidateId: string, invocation: ProjectRunInvocation): ReferenceSelection {
  const artifacts = readReferenceBoardArtifacts(root);
  if (!artifacts.assembly.candidates.some((candidate) => candidate.id === candidateId)) fail('candidateId does not exist in the current assembly');
  const selection: ReferenceSelection = { schemaVersion: REFERENCE_SELECTION_SCHEMA_VERSION, boardSha256: sha256(artifacts.boardBytes), assemblySha256: sha256(artifacts.assemblyBytes), candidateId };
  writeAtomically(root, '.omd/reference-selection.json', `${JSON.stringify(selection)}\n`, invocation);
  return selection;
}

export function selectReferenceCandidateV2(root: string, candidateId: string, dispositions: readonly ReferenceSelectionDispositionV2[], invocation: ProjectRunInvocation): ReferenceSelectionV2 {
  const artifacts = readReferenceBoardArtifacts(root);
  const candidate = required(artifacts.projection.candidates.find((entry) => entry.id === candidateId), 'candidateId does not exist in the current projection');
  if (candidate.pieces.length !== dispositions.length) fail('slots must cover every selected candidate piece exactly once');
  const dispositionsBySlot = new Map<string, ReferenceSelectionDispositionV2>(dispositions.map((entry): readonly [string, ReferenceSelectionDispositionV2] => [entry.slotId, entry]));
  if (dispositionsBySlot.size !== dispositions.length) fail('slots must not contain duplicate slotId values');
  const slots: readonly ReferenceSelectionSlotV2[] = candidate.pieces.map((projection): ReferenceSelectionSlotV2 => {
    const selected = required(dispositionsBySlot.get(projection.slotId), `slotId ${projection.slotId} is missing a disposition`);
    return {
      slotId: projection.slotId,
      rights: projection.rights,
      signal: projection.signal,
      staticAxis: projection.staticAxis,
      motionAxis: projection.motionAxis,
      obligationDisposition: selected.obligationDisposition,
      obligationReason: selected.obligationReason,
    };
  });
  const selection = parseReferenceSelectionV2({ schemaVersion: REFERENCE_SELECTION_V2_SCHEMA_VERSION, captureSha256: sha256(artifacts.boardBytes), assemblySha256: sha256(artifacts.assemblyBytes), projectionSha256: sha256(artifacts.projectionBytes), candidateId, slots });
  if (!selection.slots.some((slot) => slot.signal === 'high-visual-system' && slot.rights === 'lawful' && slot.obligationDisposition === 'used')) fail('selection requires one lawful high-visual-system positive used slot');
  const pointer = persistImmutablePreSelection(root, selection, invocation);
  writeAtomically(root, '.omd/reference-pre-selection-v2.json', canonicalJson(pointer), invocation);
  writeAtomically(root, '.omd/reference-selection-v2.json', canonicalJson(selection), invocation);
  return selection;
}
export function selectReferenceCandidateV2Autonomously(root: string, candidateId: string, invocation: ProjectRunInvocation): ReferenceSelectionV2 {
  const artifacts = readReferenceBoardArtifacts(root);
  const candidate = required(artifacts.projection.candidates.find((entry) => entry.id === candidateId), 'candidateId does not exist in the current projection');
  const dispositions = candidate.pieces.map((piece): ReferenceSelectionDispositionV2 => ({
    slotId: piece.slotId,
    obligationDisposition: piece.rights === 'lawful' && piece.signal !== 'anti-reference' && !(piece.signal === 'high-motion' && piece.motionAxis === 'absent') && piece.signal !== 'high-motion' ? 'used' : piece.signal === 'high-motion' && piece.motionAxis === 'available' ? 'not-applicable' : 'rejected',
    obligationReason: piece.rights !== 'lawful'
      ? 'not lawful for production use'
      : piece.signal === 'anti-reference'
        ? 'anti-reference is recorded as a constraint, not borrowed'
        : piece.signal === 'high-motion' && piece.motionAxis === 'absent'
          ? 'motion evidence is unavailable'
          : piece.signal === 'high-motion'
            ? 'available motion awaits evaluator resolution'
            : 'lawful selected reference is available for adapted use',
  }));
  return selectReferenceCandidateV2(root, candidateId, dispositions, invocation);
}

export const referenceSelectionExists = (root: string): boolean => existsSync(selectionPath(root));
export const referenceSelectionV2Exists = (root: string): boolean => existsSync(selectionV2Path(root));
