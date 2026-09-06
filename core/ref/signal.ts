import type { Blueprint, BlueprintNode, Invariants } from '../types.ts';

export interface DesignSignal {
  readonly score: number;
  readonly missing: readonly string[];
  readonly unknown?: readonly string[];
}

/** Below this, a page has made almost no visual decisions — a warning, not a gate. */
export const LOW_SIGNAL = 0.4;

const round = (value: number, dp: number): number => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

const nodeArea = (node: BlueprintNode): number => Math.max(0, node.box.w) * Math.max(0, node.box.h);

function hasMeasuredRegions(blueprint: Blueprint): boolean {
  const byId = new Map(blueprint.nodes.map((node) => [node.id, node]));
  return blueprint.nodes.some((parent) => {
    const children = parent.children
      .map((id) => byId.get(id))
      .filter((node): node is BlueprintNode => node !== undefined && nodeArea(node) >= nodeArea(parent) * 0.05);
    if (children.length < 2 || parent.box.w <= 0 || parent.box.h <= 0) return false;
    const widthSum = children.reduce((sum, node) => sum + node.box.w, 0);
    const heightSum = children.reduce((sum, node) => sum + node.box.h, 0);
    const horizontal = widthSum <= parent.box.w * 1.15
      && Math.max(...children.map((node) => node.box.w)) <= parent.box.w * 0.9;
    const vertical = heightSum <= parent.box.h * 1.15
      && Math.max(...children.map((node) => node.box.h)) <= parent.box.h * 0.9;
    return horizontal || vertical;
  });
}

function structuralSignal(blueprint: Blueprint): DesignSignal {
  const nodes = blueprint.nodes;
  const rootArea = Math.max(1, ...nodes.map(nodeArea));
  const roleDiversity = new Set(nodes.map((node) => node.role)).size;
  const fontSizes = new Set(nodes.flatMap((node) => node.fontSize === undefined ? [] : [node.fontSize]));
  const fontWeights = new Set(nodes.flatMap((node) => node.fontWeight === undefined ? [] : [node.fontWeight]));
  const headingCount = nodes.filter((node) => node.role === 'heading').length;
  const textCount = nodes.filter((node) => node.role === 'text').length;
  const substantialMedia = nodes.some((node) => node.role === 'image' && nodeArea(node) >= rootArea * 0.1);
  const interactiveCluster = nodes.filter((node) => node.role === 'interactive').length >= 2;
  const layeredSurface = nodes.filter((node) => (
    node.radius !== undefined || node.hasShadow === true || node.fillRole === 'surface'
  )).length >= 2;
  const anchored = substantialMedia || interactiveCluster || layeredSurface;
  const repeatedAnatomy = nodes.some((parent) => {
    if (parent.children.length < 3) return false;
    const children = parent.children
      .map((id) => nodes.find((node) => node.id === id))
      .filter((node): node is BlueprintNode => node !== undefined);
    const semantic = children.filter((node) => (
      node.role === 'text' || node.role === 'interactive' || node.role === 'image'
    ));
    return semantic.length >= 3;
  });

  const checks: readonly (readonly [string, boolean])[] = [
    ['structure-size', nodes.length >= 6],
    ['structure-roles', roleDiversity >= 3],
    ['structure-hierarchy', headingCount >= 1 && textCount >= 2 && (fontSizes.size >= 2 || fontWeights.size >= 2)],
    ['structure-regions', hasMeasuredRegions(blueprint)],
    ['structure-repetition', repeatedAnatomy],
    ['structure-anchor', anchored],
  ];
  const missing = checks.filter(([, pass]) => !pass).map(([name]) => name);
  const score = anchored
    ? round(checks.reduce((sum, [, pass]) => sum + (pass ? 1 : 0), 0) / checks.length, 2)
    : 0;
  return { score, missing };
}

/**
 * Nine binary-ish component signals over an already-measured page. danluu.com has almost
 * no design — no radii, no shadows, no motion, no tokens — so as a *visual* reference it
 * teaches nothing; this catches that deterministically instead of relying on a model to notice.
 */
export function designSignal(inv: Invariants, blueprint?: Blueprint): DesignSignal {
  const unknown = inv.measurementCoverage?.interactionProbe === 'not-measured' ? ['interaction'] : [];
  const checks: readonly (readonly [string, boolean])[] = [
    ['radius', inv.radiusLadder.length >= 2], // at least two materials
    ['elevation', inv.elevationLevels >= 1],
    ['type', inv.typeScale.length >= 3], // a deliberate scale, not browser default
    ['weights', inv.weightLadder.length >= 2], // weight used as hierarchy
    ['motion', inv.motionDurations.length >= 1],
    ['tokens', inv.tokenCoverage >= 0.2],
    ['spacing', inv.spacingLadder.length >= 4], // a scale, not incidental values
    ['padding', inv.paddingWeight >= 4], // someone spaced things on purpose
    // A dead-on-hover button is the classic tell of generated work; a reference that
    // never varies on hover has nothing to teach about interaction states.
    ['interaction', unknown.length === 0 && inv.hoverCoverage >= 0.3],
  ];

  const missing = checks.filter(([name, pass]) => !pass && !unknown.includes(name)).map(([name]) => name);
  const score = round(checks.reduce((sum, [, pass]) => sum + (pass ? 1 : 0), 0) / checks.length, 2);
  // Unknown earns no point; keep the original denominator and independently measured static basis.
  const styleSignal = { score, missing, ...(unknown.length ? { unknown } : {}) };
  if (blueprint === undefined) return styleSignal;
  const structure = structuralSignal(blueprint);
  return structure.score > styleSignal.score ? { ...structure, ...(unknown.length ? { unknown } : {}) } : styleSignal;
}
