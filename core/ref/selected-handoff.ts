import { canonicalJson, readReferenceBoardArtifacts, sha256 } from './board-artifacts.ts';
import type { ReferenceAssemblyPiece, ReferenceEvidenceProjectionPiece } from './board-projection.ts';
import {
  REFERENCE_HANDOFF_ROLES,
  validateReferenceHandoffCurrentness,
  type ReferenceHandoffRole,
} from './reference-handoff.ts';
import {
  readContainedRegularFile,
  referenceSelectionV2Sha256,
  validatePreReferenceSelectionV2,
  validateReferenceSelectionV2,
} from './reference-selection.ts';
import { validateReferenceLocaleBindingCurrentness } from './reference-locale-binding.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkReferenceApplication, type ReferenceApplicationProjection } from './reference-application.ts';
import { readPublishedReferenceResearch } from './reference-research.ts';
import { loadRefs } from './store.ts';
import { currentReferenceDirectionSourceContract, readApprovedReferenceAppearanceIntent } from './reference-direction-admission.ts';

export type SelectedReferenceHandoff = Readonly<{
  schemaVersion: 'selected-reference-handoff-v1';
  role: ReferenceHandoffRole;
  referenceHandoffSha256: string;
  captureSha256: string;
  assemblySha256: string;
  projectionSha256: string;
  selectionSha256: string;
  artDirectionSha256?: string;
  screenApplication?: ReferenceApplicationProjection;
  visualCharacter?: readonly string[];
  candidateId: string;
  route: string;
  pieces: readonly (ReferenceAssemblyPiece & Readonly<{
    evidence: ReferenceEvidenceProjectionPiece;
    availability: 'selected' | 'pending-motion-review';
  }>)[];
  sha256: string;
}>;
export type SelectedReferenceCurrentRoute = Readonly<{ sourceContractSha256: string; request: string }>;

export function projectSelectedVisualCharacter(sources: readonly Readonly<{ url: string; visualRole?: string;
  visualAssessment?: { selection?: { appearanceIntent: string } } }>[], selectedSources: ReadonlySet<string>): readonly string[] {
  const descriptions = sources.filter(source => source.visualRole === 'visual-direction' && selectedSources.has(source.url))
    .flatMap(source => source.visualAssessment?.selection?.appearanceIntent ? [source.visualAssessment.selection.appearanceIntent] : []);
  if (descriptions.some(value => /https?:\/\/|www\.|\.omd\//i.test(value))) throw new Error('selected visual character must not expose reference identities');
  return descriptions;
}

/** Read the selected canonical content, not just its lineage receipt. No project writes. */
export function readSelectedReferenceHandoff(
  root: string,
  role: ReferenceHandoffRole,
  currentRoute?: SelectedReferenceCurrentRoute,
): SelectedReferenceHandoff {
  if (!REFERENCE_HANDOFF_ROLES.includes(role)) throw new Error('reference handoff role must be art-direction, composer, or hand');
  const receiptPath = `.omd/reference-handoffs/${role}.json`;
  const receiptBytes = readContainedRegularFile(root, receiptPath, 'current reference handoff');
  const receipt = validateReferenceHandoffCurrentness(root, JSON.parse(receiptBytes.toString('utf8')));
  if (receipt.role !== role) throw new Error('reference handoff role does not match the requested owner');
  const selection = role === 'art-direction'
    ? validatePreReferenceSelectionV2(root)
    : validateReferenceSelectionV2(root);
  const artifacts = readReferenceBoardArtifacts(root);
  if (artifacts.manifest.schemaVersion === 'reference-board-v3' && artifacts.manifest.localeContextSha256 !== null) {
    validateReferenceLocaleBindingCurrentness(root);
  }
  const selectionSha256 = referenceSelectionV2Sha256(selection);
  if (receipt.captureSha256 !== sha256(artifacts.boardBytes)
    || receipt.assemblySha256 !== sha256(artifacts.assemblyBytes)
    || receipt.projectionSha256 !== sha256(artifacts.projectionBytes)
    || selectionSha256 !== (role === 'art-direction' ? receipt.preSelectionSha256 : receipt.settledSelectionSha256)) {
    throw new Error('selected reference content changed during handoff');
  }
  const candidate = artifacts.assembly.candidates.find(entry => entry.id === selection.candidateId);
  const projection = artifacts.projection.candidates.find(entry => entry.id === selection.candidateId);
  if (!candidate || !projection) throw new Error('selected reference candidate is missing');
  const pieces: SelectedReferenceHandoff['pieces'] = candidate.pieces.flatMap(piece => {
    const slot = selection.slots.find(entry => entry.slotId === piece.slotId);
    const evidence = projection.pieces.find(entry => entry.slotId === piece.slotId);
    if (!slot || !evidence) throw new Error('selected reference slot is missing');
    if (slot.rights !== 'lawful' || slot.signal === 'anti-reference') return [];
    const pending = role === 'art-direction' && slot.signal === 'high-motion'
      && slot.motionAxis === 'available' && slot.obligationDisposition === 'not-applicable';
    if (slot.obligationDisposition !== 'used' && !pending) return [];
    return [{ ...piece, evidence, availability: pending ? 'pending-motion-review' as const : 'selected' as const }];
  });
  const research = existsSync(resolve(root, '.omd/reference-research.json')) ? readPublishedReferenceResearch(root) : null;
  if (research !== null && currentRoute === undefined) throw new Error('current route binding is required for reference handoff');
  const selectedSources = new Set(artifacts.raw.candidates.find(entry => entry.id === candidate.id)?.pieces
    .filter(piece => pieces.some(selected => selected.slotId === piece.slotId))
    .map(piece => piece.evidence.kind === 'image-fragment' ? piece.evidence.sourcePage : piece.evidence.source) ?? []);
  const directionSourceContract = research === null ? null : currentReferenceDirectionSourceContract(root);
  const visualCharacter = research ? directionSourceContract !== null && research.schema === 'reference-research-v8'
    ? [...selectedSources].filter(source => research.designReference.sources.some(item =>
      item.url === source && item.visualRole === 'visual-direction')).flatMap(source => {
      const reference = loadRefs(root, { includeDomain: true }).find(item => item.researchLane === 'design' && item.source === source);
      if (reference === undefined) throw new Error('REFERENCE_DIRECTION_ADMISSION_MISSING');
      return readApprovedReferenceAppearanceIntent(root, reference, directionSourceContract);
    })
    : projectSelectedVisualCharacter(research.designReference.sources, selectedSources) : [];
  const screenApplication = research === null ? undefined : checkReferenceApplication(root, {
    expectedSourceContractSha256: currentRoute!.sourceContractSha256,
    expectedRequest: currentRoute!.request,
    benchmarkRequired: research.domainReference.benchmarkSha256 !== null,
  });
  const content = {
    schemaVersion: 'selected-reference-handoff-v1' as const,
    role,
    referenceHandoffSha256: receipt.payloadSha256,
    captureSha256: receipt.captureSha256,
    assemblySha256: receipt.assemblySha256,
    projectionSha256: receipt.projectionSha256,
    selectionSha256,
    ...(receipt.artDirectionSha256 === undefined ? {} : { artDirectionSha256: receipt.artDirectionSha256 }),
    ...(screenApplication === undefined ? {} : { screenApplication }),
    ...(visualCharacter.length ? { visualCharacter } : {}),
    candidateId: candidate.id,
    route: candidate.route,
    pieces,
  };
  // Other host processes may publish while this read runs. A coherent old/new mixture is not a handoff.
  validateReferenceHandoffCurrentness(root, receipt);
  if (!readContainedRegularFile(root, receiptPath, 'current reference handoff').equals(receiptBytes)) {
    throw new Error('reference handoff changed during export');
  }
  return { ...content, sha256: sha256(canonicalJson(content)) };
}
