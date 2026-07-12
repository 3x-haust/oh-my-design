/**
 * Design-system synthesis — F2 implementation.
 *
 * All functions are pure (no I/O) so they can be unit-tested against fixtures.
 *
 * Token naming heuristic (--color-bg / --color-fg):
 *   1. Find the dominant background: most-frequent color with WCAG relative
 *      luminance > 0.8 (very light) or < 0.1 (very dark). If none qualifies,
 *      fall back to the most-frequent color overall.
 *   2. Determine bg polarity:
 *        light bg (lum > 0.5) → most-frequent dark color (lum < 0.4) = --color-fg
 *        dark  bg (lum ≤ 0.5) → most-frequent light color (lum > 0.6) = --color-fg
 *   3. Remaining colors (by frequency) → --color-accent-1, --color-accent-2, …
 */
import type { FigmaSnapshot, SnapshotNode } from './types.ts';

// ── Variant parsing ───────────────────────────────────────────────────────────

/**
 * Parse a Figma variant component name into a property map.
 *
 *   "Size=sm, State=hover" → { Size: 'sm', State: 'hover' }
 *   "Primary"              → {}   (no = pairs — not an error)
 *   "Size=md"              → { Size: 'md' }
 */
export function parseVariantName(name: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const segment of name.split(',')) {
    const trimmed = segment.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key.length > 0) result[key] = value;
  }
  return result;
}

// ── Component matrix ──────────────────────────────────────────────────────────

export interface ComponentVariant {
  componentId: string;
  name: string;
  properties: Record<string, string>;
}

export interface ComponentSetEntry {
  setId: string;
  setName: string;
  variants: ComponentVariant[];
  /** Unique property keys found across variants, e.g. ["Size", "State"] */
  propertyKeys: string[];
  /** Unique values per property key */
  propertyValues: Record<string, string[]>;
}

/**
 * Build a component × variant-property matrix from the snapshot's component set metadata.
 * Variant names come from the file-level `components` map (stored in snapshot.componentSets).
 */
export function buildComponentMatrix(snapshot: FigmaSnapshot): ComponentSetEntry[] {
  const entries: ComponentSetEntry[] = [];

  for (const cs of Object.values(snapshot.componentSets)) {
    const variants: ComponentVariant[] = cs.variants.map((v) => ({
      componentId: v.componentId,
      name: v.name,
      properties: parseVariantName(v.name),
    }));

    const propertyKeySet = new Set<string>();
    const propertyValueSets: Record<string, Set<string>> = {};
    for (const v of variants) {
      for (const [k, val] of Object.entries(v.properties)) {
        propertyKeySet.add(k);
        if (propertyValueSets[k] === undefined) propertyValueSets[k] = new Set();
        propertyValueSets[k]!.add(val);
      }
    }

    const propertyKeys = [...propertyKeySet];
    const propertyValues: Record<string, string[]> = {};
    for (const k of propertyKeys) {
      propertyValues[k] = [...(propertyValueSets[k] ?? [])];
    }

    entries.push({ setId: cs.id, setName: cs.name, variants, propertyKeys, propertyValues });
  }

  return entries;
}

// ── Token extraction ──────────────────────────────────────────────────────────

export interface ColorToken {
  hex: string;
  count: number;
}

export interface ShadowToken {
  color: string;
  offsetX: number;
  offsetY: number;
  radius: number;
  count: number;
}

export interface DesignTokens {
  /** Solid fill colors, deduped by clustering, sorted by frequency desc */
  colors: ColorToken[];
  /** Unique font sizes, sorted asc */
  typeScale: number[];
  /** Unique spacing values (itemSpacing + padding), sorted asc */
  spacing: number[];
  /** Unique corner radii > 0, sorted asc */
  radii: number[];
  /** Drop/inner shadows, sorted by frequency desc */
  shadows: ShadowToken[];
}

/**
 * Euclidean distance between two #RRGGBB hex colors in RGB space.
 * Maximum possible distance ≈ 441 (black to white).
 */
export function hexColorDistance(a: string, b: string): number {
  const parse = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

/**
 * Cluster near-identical colors.
 *
 * Colors within euclidean RGB distance < `threshold` are merged into one
 * representative (the first seen, which is the most-frequent after sorting).
 * Returns a list sorted by count descending.
 *
 * @param colors    Array of #RRGGBB strings (may contain duplicates).
 * @param threshold Euclidean RGB distance below which two colors are considered
 *                  identical. Default 15 (~6% of full 0-255 range per channel).
 */
export function clusterColors(colors: string[], threshold = 15): ColorToken[] {
  // Count raw occurrences
  const freq = new Map<string, number>();
  for (const c of colors) freq.set(c, (freq.get(c) ?? 0) + 1);

  // Sort by frequency desc so the most-used representative survives
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const clusters: ColorToken[] = [];

  for (const [hex, count] of ranked) {
    const existing = clusters.find((c) => hexColorDistance(c.hex, hex) < threshold);
    if (existing !== undefined) {
      existing.count += count;
    } else {
      clusters.push({ hex, count });
    }
  }

  return clusters.sort((a, b) => b.count - a.count);
}

/** Flatten all SnapshotNodes from all pages and frames. */
function allNodes(snapshot: FigmaSnapshot): SnapshotNode[] {
  return snapshot.pages.flatMap((p) => p.frames.flatMap((f) => f.nodes));
}

/** Extract design tokens from a normalized snapshot. */
export function extractTokens(snapshot: FigmaSnapshot): DesignTokens {
  const nodes = allNodes(snapshot);

  // Colors: solid fills only
  const rawColors: string[] = [];
  for (const node of nodes) {
    for (const fill of node.fills) {
      if (fill.type === 'solid' && fill.hex !== undefined) rawColors.push(fill.hex);
    }
  }
  const colors = clusterColors(rawColors);

  // Type scale: unique font sizes
  const fontSizes = new Set<number>();
  for (const node of nodes) {
    if (node.typography !== undefined) fontSizes.add(node.typography.fontSize);
  }
  const typeScale = [...fontSizes].sort((a, b) => a - b);

  // Spacing: itemSpacing + individual padding values > 0
  const spacingSet = new Set<number>();
  for (const node of nodes) {
    if (node.itemSpacing !== undefined && node.itemSpacing > 0) spacingSet.add(node.itemSpacing);
    if (node.padding !== undefined) {
      for (const p of node.padding) {
        if (p > 0) spacingSet.add(p);
      }
    }
  }
  const spacing = [...spacingSet].sort((a, b) => a - b);

  // Radii
  const radiiSet = new Set<number>();
  for (const node of nodes) {
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) radiiSet.add(node.cornerRadius);
  }
  const radii = [...radiiSet].sort((a, b) => a - b);

  // Shadows: drop_shadow and inner_shadow effects
  const shadowMap = new Map<string, ShadowToken>();
  for (const node of nodes) {
    for (const effect of node.effects) {
      if (
        (effect.type === 'drop_shadow' || effect.type === 'inner_shadow')
        && effect.color !== undefined
        && effect.offsetX !== undefined
        && effect.offsetY !== undefined
        && effect.radius !== undefined
      ) {
        const key = `${effect.color}|${effect.offsetX}|${effect.offsetY}|${effect.radius}`;
        const existing = shadowMap.get(key);
        if (existing !== undefined) {
          existing.count++;
        } else {
          shadowMap.set(key, {
            color: effect.color,
            offsetX: effect.offsetX,
            offsetY: effect.offsetY,
            radius: effect.radius,
            count: 1,
          });
        }
      }
    }
  }
  const shadows = [...shadowMap.values()].sort((a, b) => b.count - a.count);

  return { colors, typeScale, spacing, radii, shadows };
}

// ── CSS generation ────────────────────────────────────────────────────────────

/**
 * Compute WCAG relative luminance of a #RRGGBB hex color.
 * Returns a value in [0, 1]: 0 = black, 1 = white.
 */
export function relativeLuminance(hex: string): number {
  const linearise = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const r = linearise(parseInt(hex.slice(1, 3), 16) / 255);
  const g = linearise(parseInt(hex.slice(3, 5), 16) / 255);
  const b = linearise(parseInt(hex.slice(5, 7), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Generate a :root CSS custom properties file from extracted tokens.
 *
 * See module-level doc-comment for the token naming heuristic.
 */
export function generateCss(tokens: DesignTokens): string {
  const { colors, typeScale, spacing, radii, shadows } = tokens;

  const lines: string[] = [
    '/* Design tokens extracted from Figma snapshot by `omd figma system`.',
    ' *',
    ' * Naming heuristic for color tokens:',
    ' *   --color-bg  : most-frequent color with luminance > 0.8 (light) or < 0.1 (dark).',
    ' *                 Falls back to the most-frequent color if no extreme is found.',
    ' *   --color-fg  : most-frequent dark color (lum < 0.4) when bg is light,',
    ' *                 or most-frequent light color (lum > 0.6) when bg is dark.',
    ' *   --color-accent-N : remaining colors by frequency.',
    ' */',
    ':root {',
  ];

  if (colors.length > 0) {
    // Find dominant background
    let bgIdx = colors.findIndex((c) => {
      const lum = relativeLuminance(c.hex);
      return lum > 0.8 || lum < 0.1;
    });
    if (bgIdx === -1) bgIdx = 0; // fallback: most-frequent

    const bgColor = colors[bgIdx]!;
    const bgLum = relativeLuminance(bgColor.hex);

    lines.push('  /* Background */');
    lines.push(`  --color-bg: ${bgColor.hex};`);

    const rest = colors.filter((_, i) => i !== bgIdx);

    // Find foreground among the remaining
    let fgIdx: number;
    if (bgLum > 0.5) {
      // light bg → dark fg
      fgIdx = rest.findIndex((c) => relativeLuminance(c.hex) < 0.4);
    } else {
      // dark bg → light fg
      fgIdx = rest.findIndex((c) => relativeLuminance(c.hex) > 0.6);
    }
    if (fgIdx === -1 && rest.length > 0) fgIdx = 0;

    if (rest.length > 0 && fgIdx >= 0) {
      lines.push('  /* Foreground */');
      lines.push(`  --color-fg: ${rest[fgIdx]!.hex};`);

      const accents = rest.filter((_, i) => i !== fgIdx);
      if (accents.length > 0) {
        lines.push('  /* Accent */');
        for (let i = 0; i < accents.length; i++) {
          lines.push(`  --color-accent-${i + 1}: ${accents[i]!.hex};`);
        }
      }
    } else {
      for (let i = 0; i < rest.length; i++) {
        lines.push(`  --color-accent-${i + 1}: ${rest[i]!.hex};`);
      }
    }
  }

  if (typeScale.length > 0) {
    lines.push('  /* Type scale */');
    for (let i = 0; i < typeScale.length; i++) {
      lines.push(`  --type-scale-${i + 1}: ${typeScale[i]!}px;`);
    }
  }

  if (spacing.length > 0) {
    lines.push('  /* Spacing */');
    for (let i = 0; i < spacing.length; i++) {
      lines.push(`  --spacing-${i + 1}: ${spacing[i]!}px;`);
    }
  }

  if (radii.length > 0) {
    lines.push('  /* Corner radius */');
    for (let i = 0; i < radii.length; i++) {
      lines.push(`  --radius-${i + 1}: ${radii[i]!}px;`);
    }
  }

  if (shadows.length > 0) {
    lines.push('  /* Shadows */');
    const top = shadows.slice(0, 5);
    for (let i = 0; i < top.length; i++) {
      const s = top[i]!;
      lines.push(`  --shadow-${i + 1}: ${s.offsetX}px ${s.offsetY}px ${s.radius}px ${s.color};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ── Markdown generation ───────────────────────────────────────────────────────

function mdTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const pad = (s: string, w: number) => s.padEnd(w);
  const headerRow = `| ${headers.map((h, i) => pad(h, widths[i]!)).join(' | ')} |`;
  const sepRow = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
  const dataRows = rows.map((r) => `| ${r.map((c, i) => pad(c, widths[i]!)).join(' | ')} |`);
  return [headerRow, sepRow, ...dataRows].join('\n');
}

/**
 * Generate a human-readable .omd/figma/design-system.md from tokens and matrix.
 */
export function generateMarkdown(
  tokens: DesignTokens,
  matrix: ComponentSetEntry[],
  fileName: string,
): string {
  const sections: string[] = [
    `# Design System — ${fileName}`,
    '',
    '_Generated by `omd figma system`_',
    '',
  ];

  // Color palette
  sections.push('## Color Palette', '');
  if (tokens.colors.length > 0) {
    sections.push(mdTable(['Hex', 'Count'], tokens.colors.map((c) => [c.hex, String(c.count)])));
  } else {
    sections.push('_No solid fills found._');
  }
  sections.push('');

  // Type scale
  sections.push('## Type Scale', '');
  if (tokens.typeScale.length > 0) {
    sections.push(mdTable(['Step', 'Size'], tokens.typeScale.map((s, i) => [String(i + 1), `${s}px`])));
  } else {
    sections.push('_No text nodes found._');
  }
  sections.push('');

  // Spacing
  sections.push('## Spacing', '');
  if (tokens.spacing.length > 0) {
    sections.push(tokens.spacing.map((s) => `- ${s}px`).join('\n'));
  } else {
    sections.push('_No auto-layout spacing found._');
  }
  sections.push('');

  // Radii
  sections.push('## Corner Radii', '');
  if (tokens.radii.length > 0) {
    sections.push(tokens.radii.map((r) => `- ${r}px`).join('\n'));
  } else {
    sections.push('_No corner radii found._');
  }
  sections.push('');

  // Shadows
  sections.push('## Shadows', '');
  if (tokens.shadows.length > 0) {
    const top = tokens.shadows.slice(0, 10);
    sections.push(
      top
        .map((s) => `- \`${s.offsetX}px ${s.offsetY}px ${s.radius}px ${s.color}\` (×${s.count})`)
        .join('\n'),
    );
  } else {
    sections.push('_No shadows found._');
  }
  sections.push('');

  // Component inventory
  sections.push('## Component Inventory', '');
  if (matrix.length === 0) {
    sections.push('_No component sets found._');
    sections.push('');
  } else {
    for (const cs of matrix) {
      sections.push(`### ${cs.setName}`, '');
      if (cs.variants.length === 0) {
        sections.push('_No variants found._');
        sections.push('');
        continue;
      }

      const keys = cs.propertyKeys;
      if (keys.length === 0) {
        sections.push(`${cs.variants.length} variant(s) — names contain no key=value properties.`);
        sections.push('');
        continue;
      }

      const rows = cs.variants.map((v) => [
        v.name,
        ...keys.map((k) => v.properties[k] ?? '—'),
      ]);
      sections.push(mdTable(['Variant', ...keys], rows));
      sections.push('');
    }
  }

  return sections.join('\n');
}
