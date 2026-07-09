import type { Ir, Invariants } from '../types.ts';

/**
 * Keeps the values that carry 90% of the uses, sorted ascending. Zero is dropped first —
 * on a real page `padding: 0` is the majority of every spacing value and would otherwise
 * dominate the ladder. Linear declares 11 distinct radii; the 90% cut leaves 7, which is
 * what a designer would actually name.
 */
export function ladder(histogram: Record<string, number>): number[] {
  const entries = Object.entries(histogram).filter(([key]) => key !== '0');
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return [];

  const sorted = [...entries].sort(([, a], [, b]) => b - a);
  const kept: number[] = [];
  let covered = 0;
  for (const [key, count] of sorted) {
    kept.push(Number(key));
    covered += count;
    if (covered / total >= 0.9) break;
  }
  return kept.sort((a, b) => a - b);
}

/** Splits a comma-separated shadow list on commas that are not inside parentheses. */
function splitLayers(shadow: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of shadow) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      layers.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') layers.push(current);
  return layers;
}

/**
 * True when a single shadow layer has zero x-offset, zero y-offset and zero blur — a
 * border drawn as a box-shadow. Colour and `inset` are stripped first so their digits
 * (e.g. the `0.2` in `rgba(0, 0, 0, 0.2)`) never get mistaken for offsets.
 */
function isHairlineLayer(layer: string): boolean {
  const withoutColor = layer.replace(/\([^)]*\)/g, ' ');
  const withoutInset = withoutColor.replace(/\binset\b/g, ' ');
  const lengths = withoutInset.trim().split(/\s+/).filter((t) => t.length > 0);
  const [x, y, blur] = lengths;
  if (x === undefined || y === undefined || blur === undefined) return false;
  const toNum = (v: string): number => parseFloat(v) || 0;
  return toNum(x) === 0 && toNum(y) === 0 && toNum(blur) === 0;
}

export function isHairline(shadow: string): boolean {
  const layers = splitLayers(shadow).map((l) => l.trim()).filter((l) => l.length > 0);
  if (layers.length === 0) return false;
  return layers.every(isHairlineLayer);
}

const round = (value: number, dp: number): number => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

export function extractInvariants(ir: Ir): Invariants {
  const spacingLadder = ladder(ir.stats.spacingHistogram);
  const radiusLadder = ladder(ir.stats.radiusHistogram);

  const elevationLevels = Object.keys(ir.stats.shadowHistogram)
    .filter((key) => key !== 'none' && !isHairline(key)).length;

  const centeredRatio = ir.stats.centeredTextRatio;

  const tokenableNodes = ir.nodes.filter((n) => n.fill != null || n.radius != null);
  const tokenCoverage = tokenableNodes.length === 0
    ? 1
    : round(tokenableNodes.reduce((sum, n) => sum + n.computed.tokenCoverage, 0) / tokenableNodes.length, 4);

  const paddedNodes = ir.nodes.filter((n) => n.layout?.padding != null);
  const paddingWeight = paddedNodes.length === 0
    ? 0
    : round(
      paddedNodes.reduce((sum, n) => sum + n.layout!.padding.reduce((s, v) => s + v, 0), 0) / paddedNodes.length,
      2,
    );

  return { spacingLadder, radiusLadder, elevationLevels, centeredRatio, tokenCoverage, paddingWeight };
}
