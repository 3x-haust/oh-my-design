import { decodePng } from '../motion/energy.ts';
import { contrastRatio, luminance } from './color.ts';
import type { MeasureNode, MeasurementDom, MetricValues, RGBA } from './types.ts';

type Pair = MetricValues['contrast-pair']['pairs'][number];

/**
 * Text over a gradient, an image or a blend has no single DOM backdrop colour, so its contrast is
 * read from the rendered pixels instead. Inside the text's own box, pixels close to the text colour are
 * glyphs and antialiasing; the rest are backdrop. The ratio reported is the 10th percentile against
 * those backdrop pixels, so a light patch behind part of the word still counts against it.
 * Only a solid, fully opaque text colour whose sole limitation is the backdrop is resolved this way.
 */
export function resolveBackdropContrast(pairs: readonly Pair[], dom: MeasurementDom, png: Buffer): { pairs: Pair[]; resolved: Set<string> } {
  const nodes = new Map(dom.nodes.map(node => [node.id, node]));
  const resolved = new Set<string>();
  let image: ReturnType<typeof decodePng> | null = null;
  const out = pairs.map(pair => {
    const node = nodes.get(pair.subjectId);
    if (!node || pair.kind === 'non-text' || pair.result !== 'unmeasured' || pair.reason !== 'complex-backdrop'
      || node.foreground[3] !== 1 || !node.visibleBox) return pair;
    image ??= decodePng(png);
    const samples = backdropSamples(node, image, dom.viewport.innerWidth, dom.viewport.innerHeight);
    if (samples.length < 12) return pair;
    const ratios = samples.map(sample => contrastRatio(node.foreground, sample)).sort((a, b) => a - b);
    const ratio = ratios[Math.floor(ratios.length * 0.1)]!;
    const worst = samples.find(sample => contrastRatio(node.foreground, sample) === ratio) ?? samples[0]!;
    resolved.add(node.id);
    return { ...pair, backdrop: worst, ratio, result: ratio >= pair.threshold ? 'pass' as const : 'fail' as const, reason: 'pixel-sampled-backdrop' };
  });
  return { pairs: out, resolved };
}

function backdropSamples(node: MeasureNode, image: ReturnType<typeof decodePng>, viewportWidth: number, viewportHeight: number): RGBA[] {
  const box = node.visibleBox!, sx = image.width / viewportWidth, sy = image.height / viewportHeight;
  const x0 = Math.max(0, Math.floor(box.x * sx)), y0 = Math.max(0, Math.floor(box.y * sy));
  const x1 = Math.min(image.width, Math.ceil((box.x + box.w) * sx)), y1 = Math.min(image.height, Math.ceil((box.y + box.h) * sy));
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  const textLuminance = luminance(node.foreground), pixels: RGBA[] = [];
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * image.width + x) * image.channels;
    pixels.push([image.pixels[i]!, image.pixels[i + 1]!, image.pixels[i + 2]!, 1]);
  }
  if (!pixels.length) return [];
  // Glyph and antialiasing pixels sit near the text colour; keep the half of the luminance range away from it.
  const distances = pixels.map(pixel => Math.abs(luminance(pixel) - textLuminance));
  const farthest = Math.max(...distances);
  return pixels.filter((_, index) => distances[index]! >= farthest * 0.5);
}
