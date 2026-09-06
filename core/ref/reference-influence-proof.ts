import { canonicalJson, sha256 } from './board-artifacts.ts';
import type { ReferenceAssembly } from './board-projection.ts';
import { referenceSelectionV2Sha256, type ReferenceSelectionV2 } from './reference-selection.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { REFERENCE_INFLUENCE_AXIS_VALUES, type ReferenceInfluenceAxis } from '../deliberation/contracts.ts';

export const REFERENCE_INFLUENCE_PROOF_SCHEMA = 'reference-influence-proof-v1' as const;
export const REFERENCE_INFLUENCE_EVIDENCE_KINDS = [
  'dom-structure', 'box-geometry', 'density-measure', 'spacing-measure', 'motion-measure',
  'content-assertion', 'copy-review', 'absence-assertion',
] as const;
export type ReferenceInfluenceEvidenceKind = (typeof REFERENCE_INFLUENCE_EVIDENCE_KINDS)[number];

const EVIDENCE_BY_AXIS: Readonly<Record<ReferenceInfluenceAxis, readonly ReferenceInfluenceEvidenceKind[]>> = {
  structure: ['dom-structure', 'box-geometry'],
  proportion: ['box-geometry'],
  density: ['density-measure'],
  rhythm: ['spacing-measure'],
  motion: ['motion-measure'],
  content: ['content-assertion'],
  voice: ['copy-review'],
  rejection: ['absence-assertion'],
};

export type ReferenceInfluenceObservation = {
  readonly slotId: string;
  readonly axis: ReferenceInfluenceAxis;
  readonly targetSelector: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly falsifier: string;
  readonly evidenceKind: ReferenceInfluenceEvidenceKind;
  readonly evidencePath: string;
  readonly evidenceSha256: string;
  readonly observedFeature: string;
  readonly featureObserved: boolean;
  readonly falsifierObserved: boolean;
  readonly verdict: 'pass' | 'fail';
};

export type ReferenceInfluenceProof = {
  readonly schema: typeof REFERENCE_INFLUENCE_PROOF_SCHEMA;
  readonly assemblySha256: string;
  readonly selectionSha256: string;
  readonly buildSha256: string;
  readonly candidateId: string;
  readonly observations: readonly ReferenceInfluenceObservation[];
  readonly verdict: 'pass' | 'fail';
};

export class ReferenceInfluenceProofError extends Error {
  override readonly name = 'ReferenceInfluenceProofError';
}

const fail = (message: string): never => { throw new ReferenceInfluenceProofError(`reference influence proof is invalid: ${message}`); };
const object = (value: unknown, label: string): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : fail(`${label} must be an object`);
const exact = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} has unknown or missing keys`);
};
const text = (value: unknown, label: string): string => typeof value === 'string' && value.trim() !== '' ? value : fail(`${label} must be a non-empty string`);
const hash = (value: unknown, label: string): string => {
  const result = text(value, label); return /^[0-9a-f]{64}$/.test(result) ? result : fail(`${label} must be 64 lowercase hexadecimal characters`);
};
const dimension = (value: unknown, label: string): number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fail(`${label} must be a positive integer`);
const axis = (value: unknown, label: string): ReferenceInfluenceAxis => REFERENCE_INFLUENCE_AXIS_VALUES.includes(value as ReferenceInfluenceAxis) ? value as ReferenceInfluenceAxis : fail(`${label} is unsupported`);
const evidenceKind = (value: unknown, label: string): ReferenceInfluenceEvidenceKind => REFERENCE_INFLUENCE_EVIDENCE_KINDS.includes(value as ReferenceInfluenceEvidenceKind) ? value as ReferenceInfluenceEvidenceKind : fail(`${label} is unsupported`);
const evidencePath = (value: unknown, label: string): string => {
  const result = text(value, label);
  if (result.startsWith('/') || result.includes('\\') || result.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} must be a normalized project-relative path`);
  if (!result.startsWith('evidence/') && !result.startsWith('.omd/evidence/')) fail(`${label} must live under evidence/ or .omd/evidence/`);
  return result;
};

const parseObservation = (value: unknown, index: number): ReferenceInfluenceObservation => {
  const label = `observations[${index}]`; const parsed = object(value, label);
  exact(parsed, ['axis', 'evidenceKind', 'evidencePath', 'evidenceSha256', 'falsifier', 'falsifierObserved', 'featureObserved', 'observedFeature', 'slotId', 'targetSelector', 'verdict', 'viewport'], label);
  const viewport = object(parsed['viewport'], `${label}.viewport`); exact(viewport, ['height', 'width'], `${label}.viewport`);
  const parsedAxis = axis(parsed['axis'], `${label}.axis`); const parsedKind = evidenceKind(parsed['evidenceKind'], `${label}.evidenceKind`);
  if (!EVIDENCE_BY_AXIS[parsedAxis].includes(parsedKind)) fail(`${label} evidence kind ${parsedKind} cannot prove ${parsedAxis}`);
  if (typeof parsed['featureObserved'] !== 'boolean' || typeof parsed['falsifierObserved'] !== 'boolean') fail(`${label} observed flags must be boolean`);
  const expectedVerdict = parsed['featureObserved'] === true && parsed['falsifierObserved'] === false ? 'pass' : 'fail';
  if (parsed['verdict'] !== expectedVerdict) fail(`${label}.verdict must be ${expectedVerdict}`);
  return {
    slotId: text(parsed['slotId'], `${label}.slotId`), axis: parsedAxis,
    targetSelector: text(parsed['targetSelector'], `${label}.targetSelector`),
    viewport: { width: dimension(viewport['width'], `${label}.viewport.width`), height: dimension(viewport['height'], `${label}.viewport.height`) },
    falsifier: text(parsed['falsifier'], `${label}.falsifier`), evidenceKind: parsedKind,
    evidencePath: evidencePath(parsed['evidencePath'], `${label}.evidencePath`),
    evidenceSha256: hash(parsed['evidenceSha256'], `${label}.evidenceSha256`), observedFeature: text(parsed['observedFeature'], `${label}.observedFeature`),
    featureObserved: parsed['featureObserved'] as boolean, falsifierObserved: parsed['falsifierObserved'] as boolean, verdict: expectedVerdict,
  };
};

export function parseReferenceInfluenceProof(value: unknown): ReferenceInfluenceProof {
  const parsed = object(value, 'proof');
  exact(parsed, ['assemblySha256', 'buildSha256', 'candidateId', 'observations', 'schema', 'selectionSha256', 'verdict'], 'proof');
  if (parsed['schema'] !== REFERENCE_INFLUENCE_PROOF_SCHEMA) fail(`proof must be ${REFERENCE_INFLUENCE_PROOF_SCHEMA}`);
  const rawObservations = Array.isArray(parsed['observations']) ? parsed['observations'] : fail(`proof must be ${REFERENCE_INFLUENCE_PROOF_SCHEMA}`);
  const observations: ReferenceInfluenceObservation[] = rawObservations.map(parseObservation);
  const keys = observations.map((observation) => `${observation.slotId}\u0000${observation.viewport.width}x${observation.viewport.height}`);
  if (new Set(keys).size !== keys.length) fail('observations must not duplicate a slot and viewport');
  const expectedVerdict = observations.length > 0 && observations.every((observation) => observation.verdict === 'pass') ? 'pass' : 'fail';
  if (parsed['verdict'] !== expectedVerdict) fail(`proof verdict must be ${expectedVerdict}`);
  return {
    schema: REFERENCE_INFLUENCE_PROOF_SCHEMA,
    assemblySha256: hash(parsed['assemblySha256'], 'assemblySha256'), selectionSha256: hash(parsed['selectionSha256'], 'selectionSha256'),
    buildSha256: hash(parsed['buildSha256'], 'buildSha256'), candidateId: text(parsed['candidateId'], 'candidateId'), observations, verdict: expectedVerdict,
  };
}

export function validateReferenceInfluenceProof(
  value: unknown,
  assembly: ReferenceAssembly,
  selection: ReferenceSelectionV2,
): ReferenceInfluenceProof {
  if (assembly.schemaVersion !== 'reference-assembly-v2') fail('promise-scoped proof requires reference-assembly-v2');
  const proof = parseReferenceInfluenceProof(value);
  if (proof.assemblySha256 !== sha256(canonicalJson(assembly))) fail('assemblySha256 is stale');
  if (proof.selectionSha256 !== referenceSelectionV2Sha256(selection)) fail('selectionSha256 is stale');
  if (proof.candidateId !== selection.candidateId) fail('candidateId does not match selection');
  const candidate = assembly.candidates.find((entry) => entry.id === selection.candidateId) ?? fail('selected candidate is missing from assembly');
  const used = new Set(selection.slots.filter((slot) => slot.obligationDisposition === 'used').map((slot) => slot.slotId));
  const expected = candidate.pieces.filter((piece) => used.has(piece.slotId));
  const expectedKeys = new Set(expected.flatMap((piece) => {
    const binding = piece.binding ?? fail(`selected slot ${piece.slotId} is missing its influence binding`);
    return binding.targetViewports.map((viewport) => `${piece.slotId}\u0000${viewport.width}x${viewport.height}`);
  }));
  const actualKeys = new Set(proof.observations.map((observation) => `${observation.slotId}\u0000${observation.viewport.width}x${observation.viewport.height}`));
  if (expectedKeys.size !== actualKeys.size || [...expectedKeys].some((key) => !actualKeys.has(key))) fail('observations do not exactly cover every used influence and required viewport');
  for (const observation of proof.observations) {
    const piece = candidate.pieces.find((entry) => entry.slotId === observation.slotId) ?? fail(`observation references unknown slot ${observation.slotId}`);
    const binding = piece.binding ?? fail(`slot ${piece.slotId} is missing its influence binding`);
    if (observation.axis !== binding.axis) fail(`slot ${piece.slotId} launders ${binding.axis} through ${observation.axis}`);
    if (observation.targetSelector !== piece.targetSelector) fail(`slot ${piece.slotId} target selector drifted`);
    if (observation.falsifier !== binding.falsifier) fail(`slot ${piece.slotId} falsifier drifted`);
  }
  return proof;
}

/** Re-samples every cited evidence file and binds the promise verdict to its current bytes. */
export function validateReferenceInfluenceProofCurrentness(
  root: string,
  value: unknown,
  assembly: ReferenceAssembly,
  selection: ReferenceSelectionV2,
): ReferenceInfluenceProof {
  const proof = validateReferenceInfluenceProof(value, assembly, selection);
  for (const observation of proof.observations) {
    const bytes = readContainedRegularFile(root, observation.evidencePath, `reference influence evidence ${observation.evidencePath}`);
    if (sha256(bytes) !== observation.evidenceSha256) fail(`evidenceSha256 is stale for ${observation.evidencePath}`);
  }
  return proof;
}
