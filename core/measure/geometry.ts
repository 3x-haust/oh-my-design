import type { Box } from '../types.ts';
export const area = (b: Box | null): number => b ? b.w * b.h : 0;
export function intersect(a: Box, b: Box): Box | null { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y; return w > 0 && h > 0 ? { x, y, w, h } : null; }
/** Exact rectangle union, never sums parent/child areas. */
export function unionArea(boxes: (Box | null)[]): number {
  const bs = boxes.filter((b): b is Box => b !== null && b.w > 0 && b.h > 0), xs = [...new Set(bs.flatMap(b => [b.x, b.x + b.w]))].sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < xs.length; i++) {
    const left = xs[i - 1]!, right = xs[i]!;
    const intervals = bs.filter(b => b.x < right && b.x + b.w > left).map(b => [b.y, b.y + b.h] as const).sort((a, b) => a[0] - b[0]);
    let length = 0, end = -Infinity;
    for (const [lo, hi] of intervals) { length += Math.max(0, hi - Math.max(lo, end)); end = Math.max(end, hi); }
    total += (right - left) * length;
  }
  return total;
}
export const quantile = (ns: number[], q: number): number => { const sorted = [...ns].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0; };
