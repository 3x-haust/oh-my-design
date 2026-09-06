import type { Invariants } from '../types.ts';
import { canonicalJson, sha256 } from './board-artifacts.ts';

export const SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION = 'selected-reference-distance-v1' as const;
export const SELECTED_REFERENCE_DISTANCE_THRESHOLD = 0.6 as const;
export const SELECTED_REFERENCE_DISTANCE_PATH = '.omd/selected-reference-distance.json' as const;

export type SelectedReferenceDistanceComparison = Readonly<{
  slotId: string;
  referenceId: string;
  sourceSelector: string;
  targetSelector: string;
  similarity: number;
  drivers: readonly string[];
  unmeasuredComponents?: readonly string[];
}>;

export type SelectedReferenceDistanceReceipt = Readonly<{
  schemaVersion: typeof SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION;
  selectionSha256: string;
  usageSha256: string;
  buildSha256: string;
  candidateId: string;
  route: string;
  target: string;
  viewport: Readonly<{ width: number; height: number }>;
  threshold: typeof SELECTED_REFERENCE_DISTANCE_THRESHOLD;
  verdict: 'pass' | 'fail';
  comparisons: readonly SelectedReferenceDistanceComparison[];
}>;

export type SelectedReferenceDistanceSlotInput = Readonly<{
  slotId: string;
  referenceId: string;
  sourceSelector: string;
  targetSelector: string;
  referenceInvariants: Invariants;
  targetInvariants: Invariants;
}>;

export type CreateSelectedReferenceDistanceReceiptInput = Readonly<{
  selectionSha256: string;
  usageSha256: string;
  buildSha256: string;
  candidateId: string;
  route: string;
  target: string;
  viewport: Readonly<{ width: number; height: number }>;
  slots: readonly SelectedReferenceDistanceSlotInput[];
}>;

const RECEIPT_KEYS = [
  'buildSha256',
  'candidateId',
  'comparisons',
  'route',
  'schemaVersion',
  'selectionSha256',
  'target',
  'threshold',
  'usageSha256',
  'verdict',
  'viewport',
] as const;
const COMPARISON_KEYS = [
  'drivers',
  'referenceId',
  'similarity',
  'slotId',
  'sourceSelector',
  'targetSelector',
] as const;
const DRIVER_NAMES = new Set([
  'animatedShare',
  'centeredRatio',
  'easingVocab',
  'elevationLevels',
  'focusCoverage',
  'fontFamilies',
  'hoverCoverage',
  'motionDurations',
  'paddingWeight',
  'radiusLadder',
  'spacingLadder',
  'tokenCoverage',
  'typeScale',
  'weightLadder',
]);

export class SelectedReferenceDistanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectedReferenceDistanceError';
  }
}

export const failSelectedReferenceDistance = (message: string): never => {
  throw new SelectedReferenceDistanceError(message);
};
const record = (value: unknown, label: string): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : failSelectedReferenceDistance(`${label} must be an object`)
);
const exactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    failSelectedReferenceDistance(`${label} has unknown or missing keys`);
  }
};
const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '' || /[\u0000-\u001f\u007f]/u.test(value)) {
    return failSelectedReferenceDistance(`${label} must be non-empty single-line text`);
  }
  return value;
};
const digest = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  return /^[0-9a-f]{64}$/u.test(parsed)
    ? parsed
    : failSelectedReferenceDistance(`${label} must be a sha256 digest`);
};
const finiteScore = (value: unknown, label: string): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : failSelectedReferenceDistance(`${label} must be a finite score from 0 to 1`)
);
const viewport = (
  value: unknown,
): Readonly<{ width: number; height: number }> => {
  const parsed = record(value, 'viewport');
  exactKeys(parsed, ['height', 'width'], 'viewport');
  const width = parsed['width'];
  const height = parsed['height'];
  if (!Number.isSafeInteger(width) || (width as number) <= 0) {
    failSelectedReferenceDistance('viewport.width must be a positive integer');
  }
  if (!Number.isSafeInteger(height) || (height as number) <= 0) {
    failSelectedReferenceDistance('viewport.height must be a positive integer');
  }
  return { width: width as number, height: height as number };
};
const comparison = (
  value: unknown,
  index: number,
): SelectedReferenceDistanceComparison => {
  const parsed = record(value, `comparisons[${index}]`);
  exactKeys(parsed, parsed['unmeasuredComponents'] === undefined ? COMPARISON_KEYS : [...COMPARISON_KEYS, 'unmeasuredComponents'], `comparisons[${index}]`);
  const rawDrivers = parsed['drivers'];
  if (!Array.isArray(rawDrivers)
    || rawDrivers.some((driver) => typeof driver !== 'string' || !DRIVER_NAMES.has(driver))) {
    failSelectedReferenceDistance(`comparisons[${index}].drivers contains an unknown driver`);
  }
  const drivers = rawDrivers as string[];
  const unmeasured = parsed['unmeasuredComponents'];
  if (unmeasured !== undefined && (!Array.isArray(unmeasured) || unmeasured.length === 0
    || new Set(unmeasured).size !== unmeasured.length
    || unmeasured.some(name => !['hoverCoverage', 'focusCoverage'].includes(name) || drivers.includes(name)))) {
    failSelectedReferenceDistance(`comparisons[${index}].unmeasuredComponents must name excluded probe axes, never drivers`);
  }
  return {
    slotId: text(parsed['slotId'], `comparisons[${index}].slotId`),
    referenceId: text(parsed['referenceId'], `comparisons[${index}].referenceId`),
    sourceSelector: text(parsed['sourceSelector'], `comparisons[${index}].sourceSelector`),
    targetSelector: text(parsed['targetSelector'], `comparisons[${index}].targetSelector`),
    similarity: finiteScore(parsed['similarity'], `comparisons[${index}].similarity`),
    drivers: Object.freeze([...drivers]),
    ...(unmeasured === undefined ? {} : { unmeasuredComponents: Object.freeze([...(unmeasured as string[])]) }),
  };
};

export function parseSelectedReferenceDistanceReceipt(
  value: unknown,
): SelectedReferenceDistanceReceipt {
  const parsed = record(value, 'selected reference distance receipt');
  exactKeys(parsed, RECEIPT_KEYS, 'selected reference distance receipt');
  if (parsed['schemaVersion'] !== SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION) {
    failSelectedReferenceDistance(`schemaVersion must be ${SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION}`);
  }
  if (parsed['threshold'] !== SELECTED_REFERENCE_DISTANCE_THRESHOLD) {
    failSelectedReferenceDistance(`threshold must be ${SELECTED_REFERENCE_DISTANCE_THRESHOLD}`);
  }
  const rawComparisons = parsed['comparisons'];
  if (!Array.isArray(rawComparisons) || rawComparisons.length === 0) {
    failSelectedReferenceDistance('comparisons must be a non-empty array');
  }
  const comparisons = Object.freeze((rawComparisons as unknown[]).map(comparison));
  for (let index = 1; index < comparisons.length; index += 1) {
    if (comparisons[index - 1]!.slotId >= comparisons[index]!.slotId) {
      failSelectedReferenceDistance('comparisons must have unique slotIds sorted ascending');
    }
  }
  const verdict = parsed['verdict'];
  if (verdict !== 'pass' && verdict !== 'fail') {
    failSelectedReferenceDistance('verdict must be pass or fail');
  }
  const parsedVerdict = verdict as 'pass' | 'fail';
  const expectedVerdict = comparisons.every((row) => row.similarity >= SELECTED_REFERENCE_DISTANCE_THRESHOLD)
    ? 'pass'
    : 'fail';
  if (parsedVerdict !== expectedVerdict) {
    failSelectedReferenceDistance('verdict does not match comparison scores');
  }
  return {
    schemaVersion: SELECTED_REFERENCE_DISTANCE_SCHEMA_VERSION,
    selectionSha256: digest(parsed['selectionSha256'], 'selectionSha256'),
    usageSha256: digest(parsed['usageSha256'], 'usageSha256'),
    buildSha256: digest(parsed['buildSha256'], 'buildSha256'),
    candidateId: text(parsed['candidateId'], 'candidateId'),
    route: text(parsed['route'], 'route'),
    target: text(parsed['target'], 'target'),
    viewport: viewport(parsed['viewport']),
    threshold: SELECTED_REFERENCE_DISTANCE_THRESHOLD,
    verdict: parsedVerdict,
    comparisons,
  };
}

export function selectedReferenceDistanceSha256(
  receipt: SelectedReferenceDistanceReceipt,
): string {
  return sha256(Buffer.from(canonicalJson(parseSelectedReferenceDistanceReceipt(receipt))));
}
