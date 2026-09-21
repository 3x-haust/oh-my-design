import { decodePng } from '../motion/energy.ts';

export type SearchPixelSample = Readonly<{
  id: number;
  foreground: readonly [number, number, number];
  rects: readonly Readonly<{ left: number; top: number; right: number; bottom: number }>[];
}>;

export type RawSearchRenderedState = Readonly<{
  anchors: readonly Readonly<{ href: string; text: string; left: number; right: number; top: number; bottom: number }>[];
  body: string;
  visibleText: readonly Readonly<{ id: number; value: string }>[];
  uncertain: readonly Readonly<SearchPixelSample & { href: string | null }>[];
  viewport: Readonly<{ width: number; height: number }>;
  url: string;
}>;

export function readableSearchPixelSamples(
  bytes: Buffer,
  viewport: Readonly<{ width: number; height: number }>,
  samples: readonly SearchPixelSample[],
): ReadonlySet<number> {
  const image = decodePng(bytes);
  const scaleX = image.width / viewport.width; const scaleY = image.height / viewport.height;
  const readable = new Set<number>();
  for (const sample of samples) {
    const [fr, fg, fb] = sample.foreground;
    for (const rect of sample.rects) {
      const left = Math.max(0, Math.floor(rect.left * scaleX));
      const right = Math.min(image.width - 1, Math.ceil(rect.right * scaleX));
      const top = Math.max(0, Math.floor(rect.top * scaleY));
      const bottom = Math.min(image.height - 1, Math.ceil(rect.bottom * scaleY));
      let found = false;
      for (let y = top; y <= bottom && !found; y++) for (let x = left; x <= right && !found; x++) {
        const offset = (y * image.width + x) * image.channels;
        const r = image.pixels[offset] ?? 0; const g = image.pixels[offset + 1] ?? 0; const b = image.pixels[offset + 2] ?? 0;
        if (Math.abs(r - fr) + Math.abs(g - fg) + Math.abs(b - fb) > 90) continue;
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) {
          const nx = x + dx; const ny = y + dy;
          if (nx < left || nx > right || ny < top || ny > bottom) continue;
          const neighbour = (ny * image.width + nx) * image.channels;
          const contrast = Math.abs(r - (image.pixels[neighbour] ?? 0))
            + Math.abs(g - (image.pixels[neighbour + 1] ?? 0)) + Math.abs(b - (image.pixels[neighbour + 2] ?? 0));
          if (contrast >= 75) { found = true; break; }
        }
      }
      if (found) { readable.add(sample.id); break; }
    }
  }
  return readable;
}

export function finalizeSearchRenderedState(raw: RawSearchRenderedState, bytes: Buffer) {
  const readable = readableSearchPixelSamples(bytes, raw.viewport, raw.uncertain);
  const rejected = new Set(raw.uncertain.filter(sample => !readable.has(sample.id)).map(sample => sample.id));
  const rejectedHrefs = new Set(raw.uncertain.filter(sample => rejected.has(sample.id) && sample.href !== null)
    .map(sample => sample.href));
  return { anchors: raw.anchors.filter(anchor => !rejectedHrefs.has(anchor.href)), body: raw.body,
    visibleText: raw.visibleText.filter(entry => !rejected.has(entry.id)).map(entry => entry.value).join('\n'), url: raw.url };
}
