import type { Invariants, Reference } from '../types.ts';

export interface MeasurementCoverage {
  interactionProbe: 'measured' | 'not-measured';
  motionProbe: 'measured' | 'not-measured';
  energyCurve: 'measured' | 'not-measured';
}
export const PREPARED_MEASUREMENT_COVERAGE: MeasurementCoverage = Object.freeze({
  interactionProbe: 'not-measured', motionProbe: 'not-measured', energyCurve: 'not-measured',
});
export function parseMeasurementCoverage(value: unknown): MeasurementCoverage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('measurementCoverage must be a closed probe coverage object');
  const input = value as Record<string, unknown>;
  const keys = ['interactionProbe', 'motionProbe', 'energyCurve'] as const;
  if (Object.keys(input).length !== keys.length || keys.some(key => input[key] !== 'measured' && input[key] !== 'not-measured')) throw new Error('measurementCoverage has invalid keys or probe status');
  return { interactionProbe: input.interactionProbe, motionProbe: input.motionProbe, energyCurve: input.energyCurve } as MeasurementCoverage;
}
/** Project only closed probe names/statuses; never selectors, action text, or receipt bytes. */
export function referenceMeasuredInvariants(reference: Pick<Reference, 'invariants' | 'capturePreparation'>): Invariants | null {
  const invariants = reference.invariants;
  if (!invariants) return null;
  const coverage = invariants.measurementCoverage === undefined ? undefined : parseMeasurementCoverage(invariants.measurementCoverage);
  if (reference.capturePreparation !== undefined) {
    const receipt = reference.capturePreparation;
    if (receipt?.schema !== 'reference-capture-preparation-receipt-v1' || !Array.isArray(receipt.notMeasured)
      || receipt.notMeasured.length !== 3 || new Set(receipt.notMeasured).size !== 3
      || ['interaction-probe', 'motion-probe', 'energy-curve'].some(name => !(receipt.notMeasured as readonly string[]).includes(name))) throw new Error('prepared reference has invalid probe coverage');
    return { ...invariants, measurementCoverage: { ...PREPARED_MEASUREMENT_COVERAGE } };
  }
  return coverage ? { ...invariants, measurementCoverage: coverage } : invariants;
}
