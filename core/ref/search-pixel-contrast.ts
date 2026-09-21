import { decodePng } from '../motion/energy.ts';

export type SearchPixelSample = Readonly<{
  id: number;
  foreground: readonly [number, number, number];
  points: readonly Readonly<{ x: number; y: number }>[];
  bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>;
}>;
export type SearchPixelRequest = Readonly<Omit<SearchPixelSample, 'points'> & { nodeIndex: number }>;

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
    const bounds = { left: sample.bounds.left * scaleX, right: sample.bounds.right * scaleX,
      top: sample.bounds.top * scaleY, bottom: sample.bounds.bottom * scaleY };
    let matches = 0;
    for (const point of sample.points.slice(0, 256)) {
      const expectedX = Math.round(point.x * scaleX); const expectedY = Math.round(point.y * scaleY);
      let edge = false;
      for (let y = expectedY - 1; y <= expectedY + 1 && !edge; y++) for (let x = expectedX - 1; x <= expectedX + 1 && !edge; x++) {
        if (x < 0 || x >= image.width || y < 0 || y >= image.height) continue;
        const offset = (y * image.width + x) * image.channels;
        const r = image.pixels[offset] ?? 0; const g = image.pixels[offset + 1] ?? 0; const b = image.pixels[offset + 2] ?? 0;
        if (Math.abs(r - fr) + Math.abs(g - fg) + Math.abs(b - fb) > 90) continue;
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) {
          const nx = x + dx; const ny = y + dy;
          if (nx < bounds.left || nx > bounds.right || ny < bounds.top || ny > bounds.bottom
            || nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
          const neighbour = (ny * image.width + nx) * image.channels;
          if (Math.abs(r - (image.pixels[neighbour] ?? 0)) + Math.abs(g - (image.pixels[neighbour + 1] ?? 0))
            + Math.abs(b - (image.pixels[neighbour + 2] ?? 0)) >= 75) { edge = true; break; }
        }
      }
      if (edge && ++matches >= Math.min(3, sample.points.length)) { readable.add(sample.id); break; }
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
