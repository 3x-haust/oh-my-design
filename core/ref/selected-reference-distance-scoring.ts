import { distances } from './distance.ts';
import {
  SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION,
  SELECTED_REFERENCE_DISTANCE_THRESHOLD,
  failSelectedReferenceDistance,
  parseSelectedReferenceDistanceReceipt,
  type CreateSelectedReferenceDistanceReceiptInput,
  type SelectedReferenceDistanceReceipt,
} from './selected-reference-distance-contract.ts';

export function createSelectedReferenceDistanceReceipt(
  input: CreateSelectedReferenceDistanceReceiptInput,
): SelectedReferenceDistanceReceipt {
  if (input.slots.length === 0) failSelectedReferenceDistance('slots must be non-empty');
  const ordered = [...input.slots].sort((left, right) => left.slotId.localeCompare(right.slotId));
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1]!.slotId === ordered[index]!.slotId) {
      failSelectedReferenceDistance('slots must have unique slotIds');
    }
  }
  const comparisons = ordered.map((slot) => {
    const [result] = distances(slot.targetInvariants, [{
      source: slot.referenceId,
      component: slot.slotId,
      kind: 'component',
      capturedAt: 'selected-reference-distance',
      selector: slot.sourceSelector,
      invariants: slot.referenceInvariants,
      principles: [],
    }]);
    const measured = result
      ?? failSelectedReferenceDistance(`slot ${slot.slotId} could not be measured`);
    return {
      slotId: slot.slotId,
      referenceId: slot.referenceId,
      sourceSelector: slot.sourceSelector,
      targetSelector: slot.targetSelector,
      similarity: measured.similarity,
      drivers: measured.drivers,
    };
  });
  return parseSelectedReferenceDistanceReceipt({
    schemaVersion: SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION,
    selectionSha256: input.selectionSha256,
    usageSha256: input.usageSha256,
    buildSha256: input.buildSha256,
    candidateId: input.candidateId,
    route: input.route,
    target: input.target,
    viewport: input.viewport,
    threshold: SELECTED_REFERENCE_DISTANCE_THRESHOLD,
    verdict: comparisons.every((row) => row.similarity >= SELECTED_REFERENCE_DISTANCE_THRESHOLD)
      ? 'pass'
      : 'fail',
    comparisons,
  });
}
