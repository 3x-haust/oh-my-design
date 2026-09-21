import { decodePng } from '../motion/energy.ts';

const luminance = (red: number, green: number, blue: number): number => [red, green, blue].map(channel => channel / 255)
  .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  .reduce((sum, channel, index) => sum + channel * ([.2126, .7152, .0722][index] ?? 0), 0);

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
  confirmedBytes: Buffer,
  viewport: Readonly<{ width: number; height: number }>,
  samples: readonly SearchPixelSample[],
): ReadonlySet<number> {
  if (samples.length === 0) return new Set();
  const image = decodePng(bytes); const withoutText = decodePng(withoutTextBytes); const confirmed = decodePng(confirmedBytes);
  if (image.width !== withoutText.width || image.height !== withoutText.height || image.channels !== withoutText.channels
    || image.width !== confirmed.width || image.height !== confirmed.height || image.channels !== confirmed.channels) return new Set();
  const scaleX = image.width / viewport.width; const scaleY = image.height / viewport.height;
  const readable = new Set<number>();
  for (const sample of samples) {
    if (sample.href === null) continue;
    const area = sample.rects.reduce((sum, rect) => sum + Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top), 0);
    const step = Math.max(1, Math.ceil(Math.sqrt(area * scaleX * scaleY / 8192))); let changed = 0; let unstable = false;
    for (const rect of sample.rects) {
      const left = Math.max(0, Math.floor(rect.left * scaleX)); const right = Math.min(image.width - 1, Math.ceil(rect.right * scaleX));
      const top = Math.max(0, Math.floor(rect.top * scaleY)); const bottom = Math.min(image.height - 1, Math.ceil(rect.bottom * scaleY));
      for (let y = top; y <= bottom && changed < sample.minimumChangedPixels && !unstable; y += step) for (let x = left; x <= right && changed < sample.minimumChangedPixels && !unstable; x += step) {
        const offset = (y * image.width + x) * image.channels;
        const visible = [image.pixels[offset] ?? 0, image.pixels[offset + 1] ?? 0, image.pixels[offset + 2] ?? 0];
        const background = [withoutText.pixels[offset] ?? 0, withoutText.pixels[offset + 1] ?? 0, withoutText.pixels[offset + 2] ?? 0];
        const stable = [confirmed.pixels[offset] ?? 0, confirmed.pixels[offset + 1] ?? 0, confirmed.pixels[offset + 2] ?? 0];
        if (visible.some((channel, index) => Math.abs(channel - (stable[index] ?? 0)) >= 10)) { unstable = true; continue; }
        const foregroundLuminance = luminance(visible[0] ?? 0, visible[1] ?? 0, visible[2] ?? 0);
        const backgroundLuminance = luminance(background[0] ?? 0, background[1] ?? 0, background[2] ?? 0);
        if ((Math.max(foregroundLuminance, backgroundLuminance) + .05)
          / (Math.min(foregroundLuminance, backgroundLuminance) + .05) >= 1.2) changed++;
      }
    }
    if (!unstable && changed >= sample.minimumChangedPixels) readable.add(sample.id);
  }
  return readable;
}

export function finalizeSearchRenderedState(raw: RawSearchRenderedState, bytes: Buffer, withoutTextBytes: Buffer, confirmedBytes: Buffer) {
  const readable = readableSearchPixelSamples(bytes, withoutTextBytes, confirmedBytes, raw.viewport, raw.uncertain);
  const rejected = new Set(raw.uncertain.filter(sample => !readable.has(sample.id)).map(sample => sample.id));
  const rejectedHrefs = new Set(raw.uncertain.filter(sample => rejected.has(sample.id) && sample.href !== null)
    .map(sample => sample.href));
  return { anchors: raw.anchors.filter(anchor => !rejectedHrefs.has(anchor.href)), body: raw.body,
    visibleText: raw.visibleText.filter(entry => !rejected.has(entry.id)).map(entry => entry.value).join('\n'), url: raw.url };
}
