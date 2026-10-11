import type { Reference } from '../types.ts';
import type { ReferenceInfluenceBinding } from './board-contract.ts';
import { requireReferenceDirectionAdmission } from './reference-direction-admission.ts';
import { requireReferenceZoneAdmission } from './reference-zone-admission.ts';

export function requireReferenceBoardVisualAdmission(root: string, reference: Reference, scope: Readonly<{
  sourceContractSha256: string;
  binding?: ReferenceInfluenceBinding;
  take: readonly string[];
}>): void {
  try {
    requireReferenceDirectionAdmission(root, reference, scope.sourceContractSha256, 'direction');
    return;
  } catch (error) {
    if (!(error instanceof Error) || !scope.binding
      || !['REFERENCE_DIRECTION_ADMISSION_MISSING', 'REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY'].includes(error.message)) {
      throw error;
    }
  }
  const binding = scope.binding;
  if (!binding || !scope.take.includes(binding.axis)) throw new Error('REFERENCE_ZONE_SCOPE_INVALID');
  for (const axis of scope.take) {
    if (axis !== 'structure' && axis !== 'proportion' && axis !== 'density' && axis !== 'rhythm') {
      throw new Error('REFERENCE_ZONE_STATIC_AXIS_REQUIRED');
    }
    const admission = requireReferenceZoneAdmission(root, {
      reference, sourceContractSha256: scope.sourceContractSha256,
      zoneId: binding.zoneId, axis, viewport: binding.sourceViewport,
    });
    if (admission.decisionId !== binding.decisionId || admission.requiredState !== binding.sourceState
      || admission.falsifier !== binding.falsifier) throw new Error('REFERENCE_ZONE_SCOPE_INVALID');
  }
}
