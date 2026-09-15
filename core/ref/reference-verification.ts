import { readReferenceBoardArtifacts, sha256 } from './board-artifacts.ts';
import { captureBlueprint } from './blueprint.ts';
import { compareReferenceGeometry, referenceGeometry, GEOMETRY_AXES, type GeometryAxis } from './geometry-comparison.ts';
import type { RawIr } from '../types.ts';
import { compareReferenceFeatures, type ReferenceFeatureComparison } from './feature-measurement.ts';

/** Read-only diagnostic: no author-supplied pass flags, no new publication authority. */
export async function verifyReferenceEvidence(root: string, input: {
  candidateId?: string;
  extract?: (selector: string, viewport: { width: number; height: number }) => Promise<RawIr>;
} = {}) {
  const artifacts = readReferenceBoardArtifacts(root);
  const candidates = artifacts.resolved.candidates.filter(candidate => input.candidateId === undefined || candidate.id === input.candidateId);
  if (!candidates.length) throw new Error('reference verification candidate does not exist');
  if (input.extract && candidates.length !== 1) throw new Error('rendered reference verification requires one explicit --candidate');
  const rows = [];
  for (const candidate of candidates) for (const piece of candidate.pieces) {
    const expectedAxes = (piece.binding ? [piece.binding.axis] : piece.take).filter((axis): axis is GeometryAxis => GEOMETRY_AXES.includes(axis as GeometryAxis));
    const common = { candidateId: candidate.id, slotId: piece.slotId, targetSelector: piece.targetSelector,
      promisedAxis: piece.binding?.axis ?? piece.take, promisedFeature: piece.reason, falsifier: piece.binding?.falsifier ?? null,
      declaredMeasurements: piece.binding?.measurements ?? [],
      expectedAxes, semanticState: 'requires-visible-inspection' as const };
    if (piece.sourceKind !== 'component-capture') {
      rows.push({ ...common, acquisition: 'non-component-evidence', comparison: null,
        limitation: 'Content, voice, rejection and image evidence do not establish measured layout similarity.' });
      continue;
    }
    const source = referenceGeometry(piece.reference.blueprint);
    const evidence = artifacts.raw.candidates.find(row => row.id === candidate.id)?.pieces.find(row => row.slotId === piece.slotId)?.evidence;
    const viewport = piece.reference.viewport;
    let comparison = null;
    let featureComparisons: readonly ReferenceFeatureComparison[] | null = null;
    let targetError: string | null = null;
    if (input.extract && source && viewport && expectedAxes.length) {
      try {
        const raw = await input.extract(piece.targetSelector, viewport);
        const target = referenceGeometry(captureBlueprint(raw.nodes, piece.targetSelector));
        if (target) comparison = compareReferenceGeometry(source, target);
        else targetError = 'Destination has no measurable visible anchors.';
        if (piece.binding?.measurements) featureComparisons = compareReferenceFeatures(piece.reference.blueprint, raw, piece.binding.measurements);
      } catch (error) { targetError = error instanceof Error ? error.message : String(error); }
    }
    rows.push({ ...common, source: piece.reference.source, sourceSelector: piece.reference.selector,
      sourceCapture: { path: piece.reference.imagePath, capturedAt: piece.reference.capturedAt, viewport,
        sha256: evidence?.kind === 'component-capture' ? evidence.imageSha256 : null },
      acquisition: source ? 'measured-component' : 'unmeasured-geometry', sourceGeometry: source,
      sourceBlueprint: piece.transfer.blueprint, comparison, featureComparisons, targetError,
      comparisonBasis: piece.binding?.measurements ? 'declared-features' : 'whole-component',
      missingAxes: expectedAxes.filter(axis => !(featureComparisons !== null && axis === piece.binding?.axis) && comparison?.scores[axis] == null),
      limitation: 'Whole-component diagnostics use role/area-rank correspondence. Declared features compare only their named measured quantities. Neither is pixel similarity, proof of semantic transfer, or visual quality; other viewports still require their own evidence.' });
  }
  return { schema: 'reference-verification-v1', captureSha256: sha256(artifacts.boardBytes), assemblySha256: sha256(artifacts.assemblyBytes),
    mode: input.extract ? 'rendered-comparison' : 'acquisition', rows };
}
