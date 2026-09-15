import type { Blueprint, BlueprintNode } from '../types.ts';
import { isDeepStrictEqual } from 'node:util';

/** Deterministic structural diagnostics, NOT a perceptual percentage or a beauty score. */
export const GEOMETRY_AXES = ['structure', 'proportion', 'density', 'rhythm'] as const;
export type GeometryAxis = typeof GEOMETRY_AXES[number];
type Anchor = { role: BlueprintNode['role']; x: number; y: number; w: number; h: number; type: number | null };
export type GeometrySignature = {
  schema: 'reference-geometry-v1';
  anchors: readonly Anchor[];
  aspectRatio: number;
  gaps: readonly number[];
};
export type GeometryComparison = {
  metric: 'measured-relative-geometry-v1';
  source: GeometrySignature;
  target: GeometrySignature;
  scores: Record<GeometryAxis, number | null>;
  matchedAnchors: number;
  missingSourceAnchors: number;
  additionalTargetAnchors: number;
};
const round = (value: number): number => Math.round(value * 1e6) / 1e6;
const ratio = (a: number, b: number): number => a === b ? 1 : Math.min(a, b) / Math.max(a, b);
const mean = (values: number[]): number | null => values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null;

/** Positions must come from capture, not a flex/grid reconstruction. Hidden/zero-area boxes add no agreement. */
export function referenceGeometry(blueprint: Blueprint | undefined): GeometrySignature | null {
  const nodes = blueprint?.nodes;
  const root = nodes?.[0];
  if (!root || root.box.w <= 0 || root.box.h <= 0 || !Number.isFinite(root.box.w + root.box.h)) return null;
  if (nodes!.some(node => !node.position || !Number.isFinite(node.position.x + node.position.y + node.box.w + node.box.h))) return null;
  const leaves = nodes!.filter(node => node.role !== 'container' && node.box.w > 0 && node.box.h > 0);
  if (!leaves.length) return null;
  const bodySizes = leaves.filter(node => node.role === 'text' && (node.fontSize ?? 0) > 0).map(node => node.fontSize!).sort((a, b) => a - b);
  const bodySize = bodySizes.length ? bodySizes[Math.floor(bodySizes.length / 2)]! : null;
  const anchors = leaves.map((node): Anchor => ({ role: node.role,
    x: round(node.position!.x / root.box.w), y: round(node.position!.y / root.box.h),
    w: round(node.box.w / root.box.w), h: round(node.box.h / root.box.h),
    type: bodySize && node.fontSize ? round(node.fontSize / bodySize) : null,
  })).sort((a, b) => a.role.localeCompare(b.role) || b.w * b.h - a.w * a.h || a.y - b.y || a.x - b.x);
  // Nearest painted-anchor separation measures block margins and positioned layouts too, not
  // merely authored flex/grid gap declarations. One anchor supplies no inter-anchor rhythm.
  const gaps = anchors.length < 2 ? [] : anchors.map((a, index) => round(Math.min(...anchors.flatMap((b, other) => {
    if (index === other) return [];
    const dx = Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w);
    const dy = Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h) * root.box.h / root.box.w;
    return [Math.hypot(dx, dy)];
  })))).sort((a, b) => a - b);
  return { schema: 'reference-geometry-v1', anchors, aspectRatio: round(root.box.w / root.box.h), gaps };
}

/** Role/area rank is an explicit correspondence heuristic, not a claim of semantic identity. */
export function compareReferenceGeometry(source: GeometrySignature, target: GeometrySignature): GeometryComparison {
  const roles: BlueprintNode['role'][] = ['heading', 'text', 'interactive', 'image'];
  const pairs = roles.flatMap(role => {
    const a = source.anchors.filter(anchor => anchor.role === role);
    const b = target.anchors.filter(anchor => anchor.role === role);
    return a.slice(0, b.length).map((anchor, index) => [anchor, b[index]!] as const);
  });
  const coverage = pairs.length / Math.max(source.anchors.length, target.anchors.length, 1);
  const structure = mean(pairs.map(([a, b]) => Math.max(0, 1 - Math.hypot((a.x + a.w / 2) - (b.x + b.w / 2), (a.y + a.h / 2) - (b.y + b.h / 2)))));
  const proportions = pairs.flatMap(([a, b]) => [ratio(a.w, b.w), ratio(a.h, b.h), ...(a.type === null || b.type === null ? [] : [ratio(a.type, b.type)])]);
  // Occupancy uses a fixed union grid, so nested/overlapping text boxes cannot inflate density.
  // Density has no one-to-one role correspondence: repeated items and equivalent HTML tags can
  // change anchor counts without changing occupied space. Keep coverage in the structural axes,
  // not as a second, unrelated penalty on this area ratio. Neither quantity proves semantic use.
  const occupancy = (signature: GeometrySignature): number => {
    let filled = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      if (signature.anchors.some(a => (x + .5) / 40 >= a.x && (x + .5) / 40 < a.x + a.w && (y + .5) / 40 >= a.y && (y + .5) / 40 < a.y + a.h)) filled++;
    }
    return filled / 1600;
  };
  const rhythm = source.gaps.length && target.gaps.length
    ? mean(source.gaps.map((gap, i) => ratio(gap, target.gaps[Math.min(i, target.gaps.length - 1)]!)))
    : null;
  return { metric: 'measured-relative-geometry-v1', source, target,
    scores: { structure: structure === null ? null : round(structure * coverage),
      proportion: proportions.length ? round(mean(proportions)! * coverage * ratio(source.aspectRatio, target.aspectRatio)) : null,
      density: occupancy(source) === 0 && occupancy(target) === 0 ? null : round(ratio(occupancy(source), occupancy(target))), rhythm },
    matchedAnchors: pairs.length, missingSourceAnchors: source.anchors.length - pairs.length,
    additionalTargetAnchors: target.anchors.length - pairs.length };
}

export function parseGeometryComparison(value: unknown): GeometryComparison {
  const item = value as GeometryComparison | null;
  const valid = (signature: GeometrySignature | undefined): signature is GeometrySignature => !!signature
    && signature.schema === 'reference-geometry-v1' && Number.isFinite(signature.aspectRatio) && signature.aspectRatio > 0
    && Array.isArray(signature.anchors) && signature.anchors.length > 0 && signature.anchors.length <= 10000
    && signature.anchors.every(a => a && ['heading', 'text', 'interactive', 'image'].includes(a.role)
      && [a.x, a.y, a.w, a.h].every(Number.isFinite) && a.w > 0 && a.h > 0
      && (a.type === null || (Number.isFinite(a.type) && a.type > 0)))
    && Array.isArray(signature.gaps) && signature.gaps.every(gap => Number.isFinite(gap) && gap >= 0);
  if (!item || !valid(item.source) || !valid(item.target)) throw new Error('invalid measured geometry signature');
  const derived = compareReferenceGeometry(item.source, item.target);
  // Recompute scores and diagnostics. A caller cannot turn a measured mismatch into a pass flag.
  if (!isDeepStrictEqual(item, derived)) throw new Error('geometry comparison differs from its measurements');
  return derived;
}
