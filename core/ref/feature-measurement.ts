import { isDeepStrictEqual } from 'node:util';
import type { Blueprint, RawIr } from '../types.ts';
import type { GeometryAxis } from './geometry-comparison.ts';

/** A declared correspondence, not a whole-component or semantic-similarity heuristic. */
export const FEATURE_QUANTITIES = {
  width: ['structure', 'proportion'],
  height: ['structure', 'proportion'],
  'width-ratio': ['proportion'],
  'height-ratio': ['proportion'],
  'font-size-ratio': ['proportion'],
  'gap-x': ['structure', 'rhythm'],
  'gap-y': ['structure', 'rhythm'],
  'relative-gap-x': ['proportion'],
  'relative-gap-y': ['proportion'],
  'left-edge-offset': ['structure', 'rhythm'],
  'top-edge-offset': ['structure', 'rhythm'],
} as const satisfies Record<string, readonly GeometryAxis[]>;
export type FeatureQuantity = keyof typeof FEATURE_QUANTITIES;
export type ReferenceFeatureMeasurement = Readonly<{
  id: string;
  quantity: FeatureQuantity;
  /** Indices into the current captured blueprint, also used by its source-free projection. */
  sourceNodes: readonly number[];
  /** Visible data-omd-reference-anchor values inside the target scope; @root means that scope. */
  targetAnchors: readonly string[];
}>;
export type FeatureNodeMeasurement = Readonly<{
  x: number; y: number; width: number; height: number; fontSize: number | null;
}>;
type FeatureWitness = Readonly<{
  component: Readonly<{ width: number; height: number }>;
  nodes: readonly FeatureNodeMeasurement[];
}>;
export type ReferenceFeatureComparison = Readonly<{
  metric: 'declared-reference-feature-v1';
  definition: ReferenceFeatureMeasurement;
  source: FeatureWitness;
  target: FeatureWitness;
  sourceValue: number;
  targetValue: number;
  similarity: number;
}>;
const fail = (message: string): never => { throw new Error(`reference feature measurement: ${message}`); };
const round = (value: number): number => Math.round(value * 1e6) / 1e6;
const anchorName = (value: unknown): value is string => typeof value === 'string'
  && (value === '@root' || /^[a-z][a-z0-9-]{0,63}$/.test(value));
const arity = (quantity: FeatureQuantity): number => quantity === 'width' || quantity === 'height' ? 1 : 2;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function parseReferenceFeatureMeasurements(value: unknown, axis: string): readonly ReferenceFeatureMeasurement[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 24) return fail('measurements must contain 1..24 declared features');
  const parsed = value.map((item): ReferenceFeatureMeasurement => {
    if (!isRecord(item) || !exact(item, ['id', 'quantity', 'sourceNodes', 'targetAnchors'])) return fail('a feature has unknown or missing keys');
    const quantity = item.quantity as FeatureQuantity;
    if (!Object.hasOwn(FEATURE_QUANTITIES, quantity) || !(FEATURE_QUANTITIES[quantity] as readonly string[]).includes(axis)) {
      return fail(`quantity ${String(item.quantity)} does not measure the declared ${axis} axis`);
    }
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(item.id)) return fail('feature id must be a bounded kebab name');
    const sourceNodes = item.sourceNodes;
    const targetAnchors = item.targetAnchors;
    if (!Array.isArray(sourceNodes) || sourceNodes.length !== arity(quantity)
      || sourceNodes.some(node => !Number.isSafeInteger(node) || node < 0)
      || new Set(sourceNodes).size !== sourceNodes.length) return fail(`feature ${item.id} needs distinct source node indices with the quantity's arity`);
    if (!Array.isArray(targetAnchors) || targetAnchors.length !== arity(quantity)
      || targetAnchors.some(anchor => !anchorName(anchor))
      || new Set(targetAnchors).size !== targetAnchors.length) return fail(`feature ${item.id} needs distinct target anchors with the quantity's arity`);
    return { id: item.id, quantity, sourceNodes: [...sourceNodes] as number[], targetAnchors: [...targetAnchors] as string[] };
  });
  if (new Set(parsed.map(item => item.id)).size !== parsed.length) return fail('feature ids must be unique within an influence');
  return parsed;
}

const validWitness = (value: unknown, expectedArity: number): value is FeatureWitness => {
  if (!isRecord(value) || !exact(value, ['component', 'nodes']) || !isRecord(value.component)
    || !exact(value.component, ['width', 'height'])) return false;
  if (![value.component.width, value.component.height].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)) return false;
  return Array.isArray(value.nodes) && value.nodes.length === expectedArity && value.nodes.every(node =>
    isRecord(node) && exact(node, ['x', 'y', 'width', 'height', 'fontSize'])
    && [node.x, node.y, node.width, node.height].every(n => typeof n === 'number' && Number.isFinite(n))
    && (node.width as number) > 0 && (node.height as number) > 0
    && (node.fontSize === null || (typeof node.fontSize === 'number' && Number.isFinite(node.fontSize) && node.fontSize > 0)));
};

function quantityValue(quantity: FeatureQuantity, witness: FeatureWitness): number {
  const a = witness.nodes[0]!; const b = witness.nodes[1]!;
  switch (quantity) {
    case 'width': return a.width;
    case 'height': return a.height;
    case 'width-ratio': return a.width / b.width;
    case 'height-ratio': return a.height / b.height;
    case 'font-size-ratio':
      if (a.fontSize === null || b.fontSize === null) return fail('font-size-ratio needs measured font sizes on both named nodes');
      return a.fontSize / b.fontSize;
    case 'gap-x': return b.x - a.x - a.width;
    case 'gap-y': return b.y - a.y - a.height;
    case 'relative-gap-x': return (b.x - a.x - a.width) / witness.component.width;
    case 'relative-gap-y': return (b.y - a.y - a.height) / witness.component.height;
    case 'left-edge-offset': return b.x - a.x;
    case 'top-edge-offset': return b.y - a.y;
  }
}

function compareFeature(definition: ReferenceFeatureMeasurement, source: FeatureWitness, target: FeatureWitness): ReferenceFeatureComparison {
  if (!validWitness(source, arity(definition.quantity)) || !validWitness(target, arity(definition.quantity))) return fail('feature witnesses need complete finite measured geometry');
  const sourceValue = round(quantityValue(definition.quantity, source));
  const targetValue = round(quantityValue(definition.quantity, target));
  if (!Number.isFinite(sourceValue) || !Number.isFinite(targetValue)) return fail('the declared quantity is not finite');
  // Captured IR boxes are rounded CSS pixels. One-pixel rounding is only a tolerance for
  // a zero absolute gap/alignment; nonzero distances and dimension/type ratios use min/max.
  const absolute = ['gap-x', 'gap-y', 'left-edge-offset', 'top-edge-offset'].includes(definition.quantity);
  const zeroEquivalent = absolute && Math.abs(sourceValue) <= 1 && Math.abs(targetValue) <= 1;
  const similarity = sourceValue === targetValue || zeroEquivalent ? 1
    : Math.sign(sourceValue) !== Math.sign(targetValue) ? 0
      : round(Math.min(Math.abs(sourceValue), Math.abs(targetValue)) / Math.max(Math.abs(sourceValue), Math.abs(targetValue)));
  return { metric: 'declared-reference-feature-v1', definition, source, target, sourceValue, targetValue, similarity };
}

export function sourceFeatureWitness(blueprint: Blueprint | undefined, definition: ReferenceFeatureMeasurement): FeatureWitness {
  const root = blueprint?.nodes[0];
  if (!root) return fail('the selected source has no captured blueprint');
  const nodes = definition.sourceNodes.map(index => {
    const node = blueprint!.nodes[index];
    if (!node?.position) return fail(`source node ${index} has no captured position; recapture, never infer it`);
    return { x: node.position.x, y: node.position.y, width: node.box.w, height: node.box.h, fontSize: node.fontSize ?? null };
  });
  const witness = { component: { width: root.box.w, height: root.box.h }, nodes };
  if (!validWitness(witness, arity(definition.quantity))) return fail('source feature nodes have invalid or empty captured geometry');
  if (!Number.isFinite(quantityValue(definition.quantity, witness))) return fail('the source quantity is not finite');
  return witness;
}

export function targetFeatureWitness(raw: RawIr, definition: ReferenceFeatureMeasurement): FeatureWitness {
  const root = raw.nodes[0];
  if (!root) return fail('the target scope is empty');
  const nodes = definition.targetAnchors.map(anchor => {
    const matches = anchor === '@root' ? [root] : raw.nodes.filter(node => node.referenceMeasurement?.anchor === anchor);
    if (matches.length !== 1) return fail(`target anchor ${anchor} must identify exactly one node inside the complete target scope (found ${matches.length})`);
    const node = matches[0]!;
    if (node.referenceMeasurement?.visible !== true) return fail(`target anchor ${anchor} is not visibly rendered`);
    return { x: node.box.x - root.box.x, y: node.box.y - root.box.y, width: node.box.w, height: node.box.h,
      fontSize: node.referenceMeasurement?.fontSize ?? node.fontSize ?? null };
  });
  const witness = { component: { width: root.box.w, height: root.box.h }, nodes };
  if (!validWitness(witness, arity(definition.quantity))) return fail('target feature nodes have invalid or empty measured geometry');
  if (!Number.isFinite(quantityValue(definition.quantity, witness))) return fail('the target quantity is not finite');
  return witness;
}

export function compareReferenceFeatures(blueprint: Blueprint | undefined, raw: RawIr, definitions: readonly ReferenceFeatureMeasurement[]): readonly ReferenceFeatureComparison[] {
  return definitions.map(definition => compareFeature(definition, sourceFeatureWitness(blueprint, definition), targetFeatureWitness(raw, definition)));
}

export function parseReferenceFeatureComparisons(value: unknown, axis: string): readonly ReferenceFeatureComparison[] {
  if (!Array.isArray(value) || value.length === 0) return fail('feature comparisons must be nonempty');
  const definitions = parseReferenceFeatureMeasurements(value.map(item => isRecord(item) ? item.definition : null), axis);
  return value.map((item, index) => {
    if (!isRecord(item)) return fail('feature comparison must be an object');
    const derived = compareFeature(definitions[index]!, item.source as FeatureWitness, item.target as FeatureWitness);
    if (!isDeepStrictEqual(item, derived)) return fail('feature comparison differs from its measured witnesses');
    return derived;
  });
}
