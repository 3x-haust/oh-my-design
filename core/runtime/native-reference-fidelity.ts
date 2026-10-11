import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readReferenceBoardArtifacts, sha256 } from '../ref/board-artifacts.ts';
import { validateReferenceSelectionV2 } from '../ref/reference-selection.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { finalRenderReviewerPacket } from './final-render-review.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';

const fail = (reason: string): never => { throw new Error(`NATIVE_REFERENCE_FIDELITY_INVALID:${reason}`); };
const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('assessment object required');
  return Object.fromEntries(Object.entries(value));
};
const text = (value: unknown): string => typeof value === 'string' && value.trim() !== ''
  ? value : fail('assessment evidence text required');
const digest = (value: unknown): string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
  ? value : fail('image digest required');
const exact = (row: Record<string, unknown>, keys: readonly string[]): void => {
  if (Object.keys(row).sort().join(',') !== [...keys].sort().join(',')) fail('assessment fields');
};
const viewport = (value: unknown): 'desktop' | 'mobile' =>
  value === 'desktop' || value === 'mobile' ? value : fail('target viewport');

export function referenceFidelityRequired(strategy: Readonly<{
  stages: readonly string[]; skips: readonly Readonly<{ id: string }>[];
}>): boolean {
  return strategy.stages.includes('reference-board')
    && !strategy.skips.some(({ id }) => id === 'reference-board');
}

export type SelectedReferenceOriginal = Readonly<{
  slotId: string;
  targetComponent: string;
  take: readonly string[];
  avoid: string;
  adaptation: string;
  sha256: string;
  pngBase64: string;
}>;
export type ReferenceFidelityTarget = Readonly<{ captureSha256: string; viewport: 'desktop' | 'mobile' }>;
export type ReferenceFidelityExpectation = Readonly<{
  slotId: string;
  referenceSha256: string;
  targetCaptureSha256: string;
  viewport: 'desktop' | 'mobile';
}>;
export type ReferenceFidelityAssessment = ReferenceFidelityExpectation & Readonly<{
  verdict: 'pass' | 'fail' | 'insufficient';
  recognizable: boolean;
  sourceVisualCharacter: string;
  targetVisualCharacter: string;
  preservedTraits: readonly string[];
  departures: readonly Readonly<{
    sourceTrait: string;
    targetTreatment: string;
    destinationConstraint: string;
    rationale: string;
  }>[];
  rationale: string;
}>;
export type NativeReferenceFidelityAssessment = ReferenceFidelityAssessment & Readonly<{
  verdict: 'pass'; recognizable: true;
}>;

/** Private evidence for isolated visual roles only; original pixels never enter production handoffs. */
export function collectSelectedReferenceOriginals(root: string): readonly SelectedReferenceOriginal[] {
  const selection = validateReferenceSelectionV2(root);
  const artifacts = readReferenceBoardArtifacts(root);
  if (selection.captureSha256 !== sha256(artifacts.boardBytes)
    || selection.assemblySha256 !== sha256(artifacts.assemblyBytes)
    || selection.projectionSha256 !== sha256(artifacts.projectionBytes)) return fail('selected reference snapshot changed');
  const candidate = artifacts.raw.candidates.find(({ id }) => id === selection.candidateId)
    ?? fail('selected candidate missing');
  return Object.freeze(selection.slots.filter(slot => slot.obligationDisposition === 'used').flatMap(slot => {
    const piece = candidate.pieces.find(piece => piece.slotId === slot.slotId) ?? fail('selected slot missing');
    if (piece.evidence.kind === 'classified-reference') return [];
    const bytes = readStableProjectFile({
      root, path: resolve(root, piece.evidence.imagePath), label: 'selected reference original',
      fs: nodeStableProjectFileSystem(),
    });
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== piece.evidence.imageSha256) return fail('selected original image changed');
    return [Object.freeze({ slotId: piece.slotId, targetComponent: piece.targetComponent,
      take: Object.freeze([...piece.take]), avoid: piece.avoid, adaptation: piece.adaptation,
      sha256, pngBase64: bytes.toString('base64') })];
  }));
}

/** Capture identity is shared by provisional and final critics; callers own target provenance. */
export function referenceFidelityExpectations(
  originals: readonly Pick<SelectedReferenceOriginal, 'slotId' | 'sha256'>[],
  targets: readonly ReferenceFidelityTarget[],
): readonly ReferenceFidelityExpectation[] {
  if (originals.length === 0) return Object.freeze([]);
  if (new Set(originals.map(row => row.slotId)).size !== originals.length) return fail('duplicate selected slot');
  if (targets.length === 0) return fail('target capture coverage');
  const uniqueTargets = new Map(targets.map(row => {
    const target = { captureSha256: digest(row.captureSha256), viewport: viewport(row.viewport) };
    return [`${target.viewport}:${target.captureSha256}`, target] as const;
  }));
  return Object.freeze(originals.flatMap(original => [...uniqueTargets.values()].map(target => Object.freeze({
    slotId: text(original.slotId), referenceSha256: digest(original.sha256),
    targetCaptureSha256: target.captureSha256, viewport: target.viewport,
  }))));
}

const bindingKey = (row: ReferenceFidelityExpectation): string =>
  JSON.stringify([row.slotId, row.referenceSha256, row.targetCaptureSha256, row.viewport]);
const counterpartKey = (row: ReferenceFidelityExpectation): string =>
  JSON.stringify([row.slotId, row.referenceSha256, row.viewport]);

/** Structure and identity are executable; recognizable visual meaning belongs to the isolated critic. */
export function parseReferenceFidelityAssessments(
  input: unknown, expectations: readonly ReferenceFidelityExpectation[],
): readonly ReferenceFidelityAssessment[] {
  if (expectations.length === 0 && input === undefined) return Object.freeze([]);
  const counterparts = new Set(expectations.map(counterpartKey));
  if (!Array.isArray(input) || input.length !== counterparts.size) return fail('assessment coverage');
  const expected = new Set(expectations.map(bindingKey));
  if (expected.size !== expectations.length) return fail('duplicate expectation coverage');
  const assessments = new Map<string, ReferenceFidelityAssessment>();
  for (const value of input) {
    const row = object(value);
    exact(row, ['slotId', 'referenceSha256', 'targetCaptureSha256', 'viewport', 'verdict', 'recognizable',
      'sourceVisualCharacter', 'targetVisualCharacter', 'preservedTraits', 'departures', 'rationale']);
    const binding = { slotId: text(row.slotId), referenceSha256: digest(row.referenceSha256),
      targetCaptureSha256: digest(row.targetCaptureSha256), viewport: viewport(row.viewport) };
    const key = bindingKey(binding);
    const counterpart = counterpartKey(binding);
    if (!expected.has(key) || assessments.has(counterpart)) return fail('assessment coverage or image binding');
    if ((row.verdict !== 'pass' && row.verdict !== 'fail' && row.verdict !== 'insufficient')
      || typeof row.recognizable !== 'boolean') return fail('assessment verdict');
    if (!Array.isArray(row.preservedTraits)
      || !Array.isArray(row.departures)) return fail('assessment visual character and departures required');
    if (row.verdict === 'pass' && (!row.recognizable || row.preservedTraits.length === 0)) return fail('assessment contradicts acceptance');
    const departures = row.departures.map(value => {
      const departure = object(value);
      exact(departure, ['sourceTrait', 'targetTreatment', 'destinationConstraint', 'rationale']);
      return Object.freeze({ sourceTrait: text(departure.sourceTrait), targetTreatment: text(departure.targetTreatment),
        destinationConstraint: text(departure.destinationConstraint), rationale: text(departure.rationale) });
    });
    assessments.set(counterpart, Object.freeze({
      ...binding, verdict: row.verdict, recognizable: row.recognizable,
      sourceVisualCharacter: text(row.sourceVisualCharacter), targetVisualCharacter: text(row.targetVisualCharacter),
      preservedTraits: Object.freeze(row.preservedTraits.map(text)), departures: Object.freeze(departures),
      rationale: text(row.rationale),
    }));
  }
  return Object.freeze([...counterparts].map(key => assessments.get(key) ?? fail('assessment coverage')));
}

export function validateNativeReferenceFidelityAssessments(
  input: unknown, expectations: readonly ReferenceFidelityExpectation[],
): readonly NativeReferenceFidelityAssessment[] {
  return Object.freeze(parseReferenceFidelityAssessments(input, expectations).map(row => {
    if (row.verdict !== 'pass' || !row.recognizable) return fail('assessment rejected or insufficient');
    return Object.freeze({ ...row, verdict: 'pass' as const, recognizable: true as const });
  }));
}

/** Re-derive final capture provenance for both publication and persisted execution consumers. */
export function validateCurrentReferenceFidelityAssessments(
  root: string, invocation: ProjectRunInvocation, observationSha256s: readonly string[], assessments: unknown,
): readonly NativeReferenceFidelityAssessment[] {
  const route = readPersistedRoute(root, invocation);
  const selected = referenceFidelityRequired(route.strategy);
  if (!selected) return validateNativeReferenceFidelityAssessments(assessments, []);
  const packet = object(JSON.parse(finalRenderReviewerPacket({
    root, invocation, packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s },
  }).toString('utf8')));
  const renders = object(packet.evidence).renders;
  if (!Array.isArray(renders)) return fail('final render coverage');
  const targets = renders.map(value => {
    const row = object(value);
    return { captureSha256: digest(row.captureSha256), viewport: viewport(row.viewport) };
  });
  return validateNativeReferenceFidelityAssessments(assessments,
    referenceFidelityExpectations(collectSelectedReferenceOriginals(root), targets));
}
