import { decodePng } from '../motion/energy.ts';
import type { MeasurementDom, MetricValues, RGBA } from './types.ts';
import { hsl, backdrop, luminance } from './color.ts';
import { area } from './geometry.ts';
/** Histogram is exact PNG RGB; ownership is explicitly a bounded DOM grid estimate. */
export function paint(dom: MeasurementDom, png: Buffer): Pick<MetricValues, 'canvas-color' | 'accent-distribution'> & { canvasPaintShare: number; mediaContrast: Map<string, number> } {
  const image = decodePng(png), histogram = new Map<string, number>();
  for (let i = 0; i < image.pixels.length; i += image.channels) { const key = `${image.pixels[i]},${image.pixels[i + 1]},${image.pixels[i + 2]}`; histogram.set(key, (histogram.get(key) ?? 0) + 1); }
  const root = dom.rootCanvas, canvasPixels = histogram.get(root.slice(0, 3).map(Math.round).join(',')) ?? 0;
  const total = image.width * image.height;
  const nodes = new Map(dom.nodes.map(n => [n.id, n]));
  const samples: { hue: number; subjectId: string | null }[] = [];
  const media = new Map<string, { sum: number; count: number }>();
  let unattributed = 0, exposedCanvasSamples = 0;
  for (const s of dom.paintSamples) {
    const x = Math.min(image.width - 1, Math.floor(s.x * image.width / dom.viewport.innerWidth)), y = Math.min(image.height - 1, Math.floor(s.y * image.height / dom.viewport.innerHeight)), i = (y * image.width + x) * image.channels;
    const pixel: RGBA = [image.pixels[i]!, image.pixels[i + 1]!, image.pixels[i + 2]!, 1], c = hsl(pixel);
    const candidate = s.subjectId ? nodes.get(s.subjectId) : undefined, box = candidate?.visibleBox;
    // Chromium hit testing can include a fractional edge outside the actually painted box.
    // Do not attribute that neighboring pixel to the media/control it rounded toward.
    const owner = box && s.x >= box.x && s.x < box.x + box.w && s.y >= box.y && s.y < box.y + box.h ? candidate : undefined;
    if (!owner || owner.unsupported.length) unattributed++;
    else if (!owner.media && backdrop(owner).every((channel, i) => channel === root[i])
      && root.slice(0, 3).every((channel, offset) => Math.round(channel) === image.pixels[i + offset])) exposedCanvasSamples++;
    if (owner?.media && !owner.unsupported.length) { const sample = media.get(owner.id) ?? { sum: 0, count: 0 }; sample.sum += Math.abs(luminance(pixel) - luminance(backdrop(owner))); sample.count++; media.set(owner.id, sample); }
    if (c.saturation >= 0.30 && c.lightness >= 0.15 && c.lightness <= 0.90) samples.push({ hue: c.hue, subjectId: owner?.id ?? null });
  }
  // Connected components under circular distance; union makes 359/1 one cluster.
  const groups: typeof samples[] = [];
  for (const s of samples.sort((a, b) => a.hue - b.hue)) {
    const adjacent = groups.filter(g => g.some(p => Math.min(Math.abs(p.hue - s.hue), 360 - Math.abs(p.hue - s.hue)) <= 25));
    if (!adjacent.length) groups.push([s]);
    else { const merged = [s, ...adjacent.flat()]; for (const g of adjacent) groups.splice(groups.indexOf(g), 1); groups.push(merged); }
  }
  const panel = dom.nodes.filter(n => n.visibleBox && n.background[3] > 0 && !['html', 'body'].includes(n.tag)).sort((a, b) => area(b.visibleBox) - area(a.visibleBox))[0];
  return {
    'canvas-color': { root, dominant: exposedCanvasSamples > 0 ? root : null, exactShare: canvasPixels / total, isTrueWhite: root[0] === 255 && root[1] === 255 && root[2] === 255 && root[3] === 1, classification: Math.max(...root.slice(0, 3)) - Math.min(...root.slice(0, 3)) <= 1 ? 'neutral' : 'tinted', largestPanel: panel?.background ?? null },
    'accent-distribution': { clusters: groups.map(g => ({ hue: (Math.atan2(g.reduce((s, p) => s + Math.sin(p.hue * Math.PI / 180), 0), g.reduce((s, p) => s + Math.cos(p.hue * Math.PI / 180), 0)) * 180 / Math.PI + 360) % 360, pixelShare: g.length / dom.paintSamples.length, sampleCount: g.length, subjectIds: [...new Set(g.flatMap(s => s.subjectId ? [s.subjectId] : []))].sort(), role: 'unassigned' as const })).sort((a, b) => a.hue - b.hue), gridStep: dom.gridStep, unattributedShare: dom.paintSamples.length ? unattributed / dom.paintSamples.length : 1, samplingErrorBound: 1 },
    canvasPaintShare: canvasPixels / total,
    mediaContrast: new Map([...media].map(([id, sample]) => [id, sample.sum / sample.count])),
  };
}
