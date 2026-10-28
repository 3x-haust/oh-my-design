import type { MeasureNode, MetricValues, RGBA } from './types.ts';
import type { CompositionContract } from './contracts.ts';
export function parseFlatColor(value: string): RGBA | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) { const h = hex[1]!.length === 3 ? [...hex[1]!].map(c => c + c).join('') : hex[1]!; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]; }
  const rgb = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(value);
  if (!rgb) return null;
  const color: RGBA = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  return color.slice(0, 3).every(c => c <= 255) && color[3] <= 1 ? color : null;
}
export function composite(f: RGBA, b: RGBA): RGBA { const alpha = f[3] + b[3] * (1 - f[3]); return alpha === 0 ? [0, 0, 0, 0] : [(f[0] * f[3] + b[0] * b[3] * (1 - f[3])) / alpha, (f[1] * f[3] + b[1] * b[3] * (1 - f[3])) / alpha, (f[2] * f[3] + b[2] * b[3] * (1 - f[3])) / alpha, alpha]; }
export function luminance(c: RGBA): number { const rgb = c.slice(0, 3).map(c => { const n = c / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722; }
export function contrastRatio(a: RGBA, b: RGBA): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export function contrastThreshold(size: number, weight: number): number { return size >= 24 || size >= 18.6666667 && weight >= 700 ? 3 : 4.5; }
export function backdrop(n: MeasureNode): RGBA { return [...n.backgrounds].reverse().reduce<RGBA>((b, f) => composite(f, b), [255, 255, 255, 1]); }
export function rolePaint(n: MeasureNode, property: CompositionContract['colors'][number]['property']): RGBA[] | null {
  if (property === 'text') return n.unsupported.some(s => s === 'native-control-text' || s === 'native-option-text') ? null : [n.foreground];
  if (n.unsupported.some(s => ['complex-backdrop', 'ancestor-opacity', 'unsupported-color', 'opaque-content', 'pseudo-content'].includes(s))) return null;
  if (property === 'background') return [backdrop(n)];
  const colors = n.paints?.[property];
  return colors?.map(color => composite(color, property === 'outline' ? backdrop({ ...n, backgrounds: n.backgrounds.slice(1) }) : backdrop(n))) ?? null;
}
export function contrast(nodes: MeasureNode[], colors: CompositionContract['colors'] = []): MetricValues['contrast-pair'] {
  const pairs: MetricValues['contrast-pair']['pairs'] = nodes.filter(n => n.visibleBox && n.text.trim()).map(n => {
    const unsupported = n.unsupported.filter(s => ['complex-backdrop', 'ancestor-opacity', 'occluded-text', 'unsupported-color'].includes(s));
    const bg = unsupported.length ? null : backdrop(n), ratio = bg ? contrastRatio(composite(n.foreground, bg), bg) : null, threshold = contrastThreshold(n.size, n.weight);
    return { subjectId: n.id, foreground: n.foreground, backdrop: bg, chain: n.backgrounds, size: n.size, weight: n.weight, ratio, threshold, result: n.disabled ? 'not-applicable' : ratio === null ? 'unmeasured' : ratio >= threshold ? 'pass' : 'fail', reason: n.disabled ? 'disabled-control' : unsupported.length ? unsupported.join(',') : null };
  });
  for (const color of colors.filter(c => c.contrastKind === 'non-text')) for (const n of nodes.filter(n => n.visibleBox && n.assignments.includes(color.selector))) {
    const outer = backdrop({ ...n, backgrounds: n.backgrounds.slice(1) }), inner = backdrop(n);
    const paints = rolePaint(n, color.property);
    const backgrounds = color.property === 'border' ? [inner, outer] : [outer];
    const samples = paints?.flatMap(foreground => backgrounds.map(bg => ({ foreground, backdrop: bg, ratio: contrastRatio(foreground, bg) })));
    const sample = samples?.sort((a, b) => a.ratio - b.ratio)[0];
    pairs.push({ subjectId: n.id, kind: 'non-text', colorRole: color.role, foreground: sample?.foreground ?? n.background,
      backdrop: sample?.backdrop ?? null, chain: n.backgrounds, size: n.size, weight: n.weight, ratio: sample?.ratio ?? null, threshold: 3,
      result: n.disabled ? 'not-applicable' : !sample ? 'unmeasured' : sample.ratio >= 3 ? 'pass' : 'fail',
      reason: n.disabled ? 'disabled-control' : !sample ? 'unsupported-or-absent-non-text-paint' : null });
  }
  return { pairs };
}
export function hsl(c: RGBA): { hue: number; saturation: number; lightness: number } {
  const [r, g, b] = c.slice(0, 3).map(v => v / 255) as [number, number, number], max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, l = (max + min) / 2;
  const h = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: (h * 60 + 360) % 360, saturation: delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)), lightness: l };
}
