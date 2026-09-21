import { decodePng } from '../motion/energy.ts';

export const HIDE_SEARCH_TEXT_STYLE = 'a, a * { -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: currentColor !important; }';

export type SearchPixelSample = Readonly<{
  id: number;
  href: string | null;
  minimumChangedPixels: number;
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
  withoutTextBytes: Buffer,
  viewport: Readonly<{ width: number; height: number }>,
  samples: readonly SearchPixelSample[],
): ReadonlySet<number> {
  const image = decodePng(bytes); const withoutText = decodePng(withoutTextBytes);
  if (image.width !== withoutText.width || image.height !== withoutText.height || image.channels !== withoutText.channels) return new Set();
  const scaleX = image.width / viewport.width; const scaleY = image.height / viewport.height;
  const readable = new Set<number>();
  for (const sample of samples) {
    if (sample.href === null) continue;
    const area = sample.rects.reduce((sum, rect) => sum + Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top), 0);
    const step = Math.max(1, Math.ceil(Math.sqrt(area * scaleX * scaleY / 8192))); let changed = 0;
    for (const rect of sample.rects) {
      const left = Math.max(0, Math.floor(rect.left * scaleX)); const right = Math.min(image.width - 1, Math.ceil(rect.right * scaleX));
      const top = Math.max(0, Math.floor(rect.top * scaleY)); const bottom = Math.min(image.height - 1, Math.ceil(rect.bottom * scaleY));
      for (let y = top; y <= bottom && changed < sample.minimumChangedPixels; y += step) for (let x = left; x <= right && changed < sample.minimumChangedPixels; x += step) {
        const offset = (y * image.width + x) * image.channels;
        const difference = Math.abs((image.pixels[offset] ?? 0) - (withoutText.pixels[offset] ?? 0))
          + Math.abs((image.pixels[offset + 1] ?? 0) - (withoutText.pixels[offset + 1] ?? 0))
          + Math.abs((image.pixels[offset + 2] ?? 0) - (withoutText.pixels[offset + 2] ?? 0));
        if (difference >= 30) changed++;
      }
    }
    if (changed >= sample.minimumChangedPixels) readable.add(sample.id);
  }
  return readable;
}

export function finalizeSearchRenderedState(raw: RawSearchRenderedState, bytes: Buffer, withoutTextBytes: Buffer) {
  const readable = readableSearchPixelSamples(bytes, withoutTextBytes, raw.viewport, raw.uncertain);
  const rejected = new Set(raw.uncertain.filter(sample => !readable.has(sample.id)).map(sample => sample.id));
  const rejectedHrefs = new Set(raw.uncertain.filter(sample => rejected.has(sample.id) && sample.href !== null)
    .map(sample => sample.href));
  return { anchors: raw.anchors.filter(anchor => !rejectedHrefs.has(anchor.href)), body: raw.body,
    visibleText: raw.visibleText.filter(entry => !rejected.has(entry.id)).map(entry => entry.value).join('\n'), url: raw.url };
}
