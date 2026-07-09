export function contrastRatio(hexA, hexB) {
  const luminance = (hex) => {
    const clean = hex.replace('#', '');
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = [0, 2, 4].map((i) => f(parseInt(clean.slice(i, i + 2), 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const la = luminance(hexA);
  const lb = luminance(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function depthOf(node, byId) {
  let depth = 0;
  let current = node;
  while (current.parent) {
    current = byId[current.parent];
    depth += 1;
  }
  return depth;
}

function contrastWithParent(node, byId) {
  if (!node.parent) return null;
  const parentFill = byId[node.parent]?.fill?.value;

  // Text sits on whatever surface it declares, falling back to the parent's.
  // A container is always measured against its parent — measuring it against
  // its own fill would silently return 1.0 and hide a dark-on-dark card.
  const [self, background] =
    node.type === 'TEXT'
      ? [node.color ?? node.fill?.value, node.fill?.value ?? parentFill]
      : [node.fill?.value, parentFill];

  if (self == null || background == null) return null;
  return contrastRatio(self, background);
}

function modeOf(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v < best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function siblingPaddingMode(node, byId, childrenByParent) {
  if (!node.layout?.padding) return null;
  const siblingIds = node.parent ? childrenByParent.get(node.parent) ?? [] : [];
  const siblings = siblingIds
    .map((id) => byId[id])
    .filter((s) => s && s.id !== node.id && s.layout?.padding);
  if (siblings.length === 0) return null;
  return node.layout.padding.map((_, i) => modeOf(siblings.map((s) => s.layout.padding[i])));
}

const TOKENABLE_PROPS = ['fill', 'radius'];

function tokenCoverage(node) {
  const present = TOKENABLE_PROPS.filter((p) => node[p] != null);
  if (present.length === 0) return 1;
  const tokenised = present.filter((p) => node[p].token != null);
  return tokenised.length / present.length;
}

export function normalize(rawIr) {
  const ir = structuredClone(rawIr);
  const byId = Object.fromEntries(ir.nodes.map((n) => [n.id, n]));
  const childrenByParent = new Map();
  for (const n of ir.nodes) {
    if (!n.parent) continue;
    if (!childrenByParent.has(n.parent)) childrenByParent.set(n.parent, []);
    childrenByParent.get(n.parent).push(n.id);
  }

  const spacingHistogram = {};
  const colorHistogram = {};
  const componentReuse = {};

  for (const node of ir.nodes) {
    node.computed = {
      depth: depthOf(node, byId),
      contrastWithParent: contrastWithParent(node, byId),
      siblingPaddingMode: siblingPaddingMode(node, byId, childrenByParent),
      tokenCoverage: tokenCoverage(node),
      hitArea: { w: node.box.w, h: node.box.h },
      isInteractive: Boolean(node.interactive),
    };

    if (node.layout?.padding) {
      for (const v of node.layout.padding) {
        spacingHistogram[v] = (spacingHistogram[v] ?? 0) + 1;
      }
    }
    if (node.layout?.gap != null) {
      spacingHistogram[node.layout.gap] = (spacingHistogram[node.layout.gap] ?? 0) + 1;
    }
    if (node.fill) {
      colorHistogram[node.fill.value] = (colorHistogram[node.fill.value] ?? 0) + 1;
    }
    componentReuse[node.name] = (componentReuse[node.name] ?? 0) + 1;
  }

  const orphanStyles = Object.entries(colorHistogram)
    .filter(([, count]) => count === 1)
    .map(([value]) => value)
    .sort();

  return {
    ...ir,
    nodes: ir.nodes,
    stats: { spacingHistogram, colorHistogram, orphanStyles, componentReuse },
  };
}
