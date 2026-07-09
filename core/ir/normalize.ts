import type { Computed, Hex, Ir, Node, RawIr, RawNode, Stats } from '../types.ts';

type Padding = [number, number, number, number];

export function contrastRatio(hexA: Hex, hexB: Hex): number {
  const luminance = (hex: Hex): number => {
    const clean = hex.replace('#', '');
    const f = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = [0, 2, 4].map((i) => f(parseInt(clean.slice(i, i + 2), 16) / 255)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const la = luminance(hexA);
  const lb = luminance(hexB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type Index = Map<string, RawNode>;

function depthOf(node: RawNode, byId: Index): number {
  let depth = 0;
  let current = node;
  while (current.parent) {
    const parent = byId.get(current.parent);
    if (!parent) break;
    current = parent;
    depth += 1;
  }
  return depth;
}

function contrastWithParent(node: RawNode, byId: Index): number | null {
  if (!node.parent) return null;
  const parentFill = byId.get(node.parent)?.fill?.value;

  // Text sits on whatever surface it declares, falling back to the parent's. A container
  // is always measured against its parent — measuring it against its own fill would
  // silently return 1.0 and hide a dark card on a dark page.
  const [self, background] =
    node.type === 'TEXT'
      ? [node.color ?? node.fill?.value, node.fill?.value ?? parentFill]
      : [node.fill?.value, parentFill];

  if (typeof self !== 'string' || typeof background !== 'string') return null;
  return contrastRatio(self, background);
}

function modeOf(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? 0;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v < best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function siblingPaddingMode(node: RawNode, byId: Index, childrenOf: Map<string, string[]>): Padding | null {
  const own = node.layout?.padding;
  if (!own) return null;

  const siblings = (node.parent ? childrenOf.get(node.parent) ?? [] : [])
    .map((id) => byId.get(id))
    .filter((s): s is RawNode => Boolean(s) && s!.id !== node.id && Boolean(s!.layout?.padding));

  if (siblings.length === 0) return null;
  return own.map((_, i) => modeOf(siblings.map((s) => s.layout!.padding[i] ?? 0))) as Padding;
}

const TOKENABLE = ['fill', 'radius'] as const;

function tokenCoverage(node: RawNode): number {
  const present = TOKENABLE.filter((p) => node[p] != null);
  if (present.length === 0) return 1;
  return present.filter((p) => node[p]!.token != null).length / present.length;
}

// Same tag(-ish) name, same child count, same radius, same shadow — the feature-card grid
// every generated landing page reaches for when nobody decided what matters most.
function shapeSignature(node: RawNode): string {
  const name = node.name.split('.')[0];
  return `${name}|${node.children.length}|${node.radius?.value ?? 'none'}|${node.shadow?.value ?? 'none'}`;
}

function identicalSiblings(node: RawNode, childrenOf: Map<string, string[]>, byId: Index): number {
  if (!node.parent) return 0;
  const sibIds = childrenOf.get(node.parent) ?? [];
  const mySig = shapeSignature(node);
  let count = 0;
  for (const id of sibIds) {
    const sibling = byId.get(id);
    if (sibling && shapeSignature(sibling) === mySig) count += 1;
  }
  return count;
}

function computeStats(nodes: RawNode[]): Stats {
  const spacingHistogram: Record<string, number> = {};
  const colorHistogram: Record<string, number> = {};
  const componentReuse: Record<string, number> = {};
  const radiusHistogram: Record<string, number> = {};
  const shadowHistogram: Record<string, number> = {};
  const bump = (bag: Record<string, number>, key: string | number): void => {
    bag[key] = (bag[key] ?? 0) + 1;
  };

  const gradients: string[] = [];
  const seenGradients = new Set<string>();
  let textNodes = 0;
  let centeredTextNodes = 0;

  for (const node of nodes) {
    if (node.layout?.padding) for (const v of node.layout.padding) bump(spacingHistogram, v);
    if (node.layout?.gap != null) bump(spacingHistogram, node.layout.gap);
    if (node.fill) bump(colorHistogram, String(node.fill.value));
    bump(componentReuse, node.name);
    if (node.radius) bump(radiusHistogram, node.radius.value);
    if (node.shadow) bump(shadowHistogram, node.shadow.value);
    if (node.gradient && !seenGradients.has(node.gradient)) {
      seenGradients.add(node.gradient);
      gradients.push(node.gradient);
    }
    if (node.text) {
      textNodes += 1;
      if (node.textAlign === 'center') centeredTextNodes += 1;
    }
  }

  const orphanStyles = Object.entries(colorHistogram)
    .filter(([, count]) => count === 1)
    .map(([value]) => value)
    .sort();

  const centeredTextRatio = textNodes === 0 ? 0 : Math.round((centeredTextNodes / textNodes) * 10000) / 10000;

  return {
    spacingHistogram,
    colorHistogram,
    orphanStyles,
    componentReuse,
    radiusHistogram,
    shadowHistogram,
    centeredTextRatio,
    gradients,
  };
}

export function normalize(rawIr: RawIr): Ir {
  const clone = structuredClone(rawIr);
  const byId: Index = new Map(clone.nodes.map((n) => [n.id, n]));

  const childrenOf = new Map<string, string[]>();
  for (const n of clone.nodes) {
    if (!n.parent) continue;
    const bucket = childrenOf.get(n.parent);
    if (bucket) bucket.push(n.id);
    else childrenOf.set(n.parent, [n.id]);
  }

  const nodes: Node[] = clone.nodes.map((node) => {
    const computed: Computed = {
      depth: depthOf(node, byId),
      contrastWithParent: contrastWithParent(node, byId),
      siblingPaddingMode: siblingPaddingMode(node, byId, childrenOf),
      tokenCoverage: tokenCoverage(node),
      hitArea: { w: node.box.w, h: node.box.h },
      isInteractive: Boolean(node.interactive),
      identicalSiblings: identicalSiblings(node, childrenOf, byId),
    };
    return { ...node, computed };
  });

  return { ...clone, nodes, stats: computeStats(clone.nodes) };
}
