import type { RawNode } from '../types.ts';
import type { Blueprint, BlueprintNode, ColorRole, NodeRole, TextLengthClass } from '../types.ts';

/**
 * WCAG relative luminance from a hex string like '#AABBCC'.
 * Returns 0 for unrecognised values.
 */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0;
  const f = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = f(parseInt(clean.slice(0, 2), 16) / 255);
  const g = f(parseInt(clean.slice(2, 4), 16) / 255);
  const b = f(parseInt(clean.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * HSL saturation (0..1) from a hex string. Near-grey colors return 0.
 * Used to identify accent colors that stand out by hue rather than by luminance.
 */
export function hexSaturation(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

export interface ColorEntry {
  hex: string;
  count: number;
  /** True for background/fill colors; false for text colors. */
  isFill: boolean;
}

/**
 * Cluster component colors into semantic roles using usage frequency and relative luminance.
 * Literal hex values never leave this function; only roles are stored in the blueprint.
 *
 * Assignment order (each hex is claimed by the first matching rule):
 * 1. accent  — minority color (count < max) with highest HSL saturation > 0.25;
 *              text colors are preferred over fills since interactive elements often use text
 * 2. bg      — most-frequent fill (darker fill wins ties)
 * 3. surface — remaining fills (elevated panels, cards)
 * 4. fg      — most-frequent text color (darker text wins ties)
 * 5. muted   — remaining text colors
 *
 * This is a pure function: identical input → identical output.
 */
export function clusterColorRoles(colors: ColorEntry[]): Map<string, ColorRole> {
  const result = new Map<string, ColorRole>();
  if (colors.length === 0) return result;

  const maxCount = Math.max(...colors.map((c) => c.count));

  // Accent: a minority saturated color that stands out from the structural palette.
  // Text colors are preferred (CTAs, links), then fills (branded buttons).
  // A color at max frequency is structural — it cannot be an accent.
  const accentCandidate = [...colors]
    .filter((c) => c.count < maxCount && hexSaturation(c.hex) > 0.25)
    .sort((a, b) => {
      // Text colors first; within same kind, higher saturation wins.
      if (a.isFill !== b.isFill) return a.isFill ? 1 : -1;
      return hexSaturation(b.hex) - hexSaturation(a.hex);
    })[0];
  if (accentCandidate) result.set(accentCandidate.hex, 'accent');

  // Fills: most-frequent → bg; rest → surface.
  // Ties in frequency are broken by luminance (darker fill = more dominant backdrop).
  const fills = colors
    .filter((c) => c.isFill && !result.has(c.hex))
    .sort((a, b) => b.count - a.count || relativeLuminance(a.hex) - relativeLuminance(b.hex));
  fills.forEach((f, i) => result.set(f.hex, i === 0 ? 'bg' : 'surface'));

  // Text colors: most-frequent → fg; rest → muted.
  const texts = colors
    .filter((c) => !c.isFill && !result.has(c.hex))
    .sort((a, b) => b.count - a.count || relativeLuminance(a.hex) - relativeLuminance(b.hex));
  texts.forEach((t, i) => result.set(t.hex, i === 0 ? 'fg' : 'muted'));

  return result;
}

/** Derive the semantic role of a node from its IR fields. */
export function deriveNodeRole(node: Pick<RawNode, 'type' | 'interactive' | 'heading' | 'name'>): NodeRole {
  if (node.interactive) return 'interactive';
  if (node.heading !== undefined) return 'heading';
  if (node.type === 'TEXT') return 'text';
  // Heuristic for image elements: the DOM extractor encodes the tag name as the first
  // segment of node.name (tagname.firstClass). Match common image container tags.
  const tag = (node.name.split('.')[0] ?? '').toLowerCase();
  if (tag === 'img' || tag === 'svg' || tag === 'picture' || tag === 'figure') return 'image';
  return 'container';
}

/** Derive the text length class from node text content. Copy is never stored. */
export function deriveTextLength(text: string): TextLengthClass {
  if (text.length <= 20) return 'label';
  if (text.length <= 80) return 'phrase';
  return 'paragraph';
}

/**
 * Build a Blueprint from a component's raw nodes.
 *
 * What is stored per node: role, box dimensions, layout metrics (padding, gap, direction),
 * typography metrics (fontSize, fontWeight, lineHeight), surface geometry (radius, shadow),
 * color roles (bg/surface/fg/muted/accent — no literal hex values), motion timings, and a
 * text length class (label/phrase/paragraph — no actual copy).
 *
 * What is NOT stored: text content, literal color values, alignment (not measured by the
 * IR extractor), border details (not measured by the IR extractor).
 *
 * Inherited fills — transparent nodes that show an ancestor's backdrop — are excluded from
 * the color inventory and from each node's fillRole so the component's own palette is what
 * gets clustered.
 *
 * @param nodes     Raw nodes from extractIr, already scoped to the selector.
 * @param selector  The CSS selector that bounded this capture (stored as metadata).
 */
export function captureBlueprint(nodes: RawNode[], selector: string): Blueprint {
  // Build color frequency map. Keyed by hex+kind so the same color can appear as both a
  // fill (background) and a text color — they are different roles in different slots.
  const colorMap = new Map<string, ColorEntry>();
  const trackColor = (hex: string, isFill: boolean): void => {
    const key = `${hex}:${isFill ? 'f' : 't'}`;
    const entry = colorMap.get(key);
    if (entry) entry.count += 1;
    else colorMap.set(key, { hex, count: 1, isFill });
  };

  for (const node of nodes) {
    // Only authored (non-inherited) fills represent the node's own background.
    const fill = node.fill;
    if (fill && typeof fill.value === 'string' && !fill.inherited) {
      trackColor(fill.value, true);
    }
    if (node.color) trackColor(node.color, false);
  }

  const colorRoleMap = clusterColorRoles([...colorMap.values()]);

  const bpNodes: BlueprintNode[] = nodes.map((node): BlueprintNode => {
    const role = deriveNodeRole(node);

    const bp: BlueprintNode = {
      id: node.id,
      role,
      children: [...node.children],
      box: { w: node.box.w, h: node.box.h },
    };

    // Layout: store padding and gap only when non-trivial; direction always when present.
    if (node.layout) {
      bp.padding = node.layout.padding;
      if (node.layout.gap > 0) bp.gap = node.layout.gap;
      bp.direction = node.layout.mode;
    }

    // Typography: only the fields the extractor actually measured.
    if (node.fontSize != null) bp.fontSize = node.fontSize;
    if (node.fontWeight != null) bp.fontWeight = node.fontWeight;
    if (node.lineHeight != null) bp.lineHeight = node.lineHeight;

    // Surface geometry.
    const rv = node.radius?.value;
    if (typeof rv === 'number' && rv > 0) bp.radius = rv;
    if (node.shadow?.value) bp.hasShadow = true;

    // Color roles — literal hexes never leave this function.
    const fillHex = node.fill?.value;
    if (typeof fillHex === 'string' && !node.fill?.inherited) {
      const cr = colorRoleMap.get(fillHex);
      if (cr) bp.fillRole = cr;
    }
    if (node.color) {
      const cr = colorRoleMap.get(node.color);
      if (cr) bp.textRole = cr;
    }

    // Motion timings: durations and easings, no animation names.
    if (node.motion?.durations?.length) bp.motionDurations = [...node.motion.durations];
    if (node.motion?.easings?.length) bp.motionEasings = [...node.motion.easings];

    // Text length class — content stripped, only length signal remains.
    if (node.text) bp.textLength = deriveTextLength(node.text);

    return bp;
  });

  return { selector, capturedAt: new Date().toISOString(), nodes: bpNodes };
}
