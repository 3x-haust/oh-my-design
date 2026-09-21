import type { Page } from 'playwright';
import type { SearchPixelRequest, SearchPixelSample } from './search-pixel-contrast.ts';

export async function collectSearchGlyphSamples(
  page: Page,
  requests: readonly Readonly<SearchPixelRequest & { href: string | null }>[],
): Promise<readonly Readonly<SearchPixelSample & { href: string | null }>[]> {
  if (requests.length === 0) return [];
  const sampled = await page.locator('body').evaluate((body, targets) => {
    const wanted = new Map(targets.map(target => [target.nodeIndex, target.id]));
    const nodes = new Map<number, Text>();
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT); let index = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode(), index++) {
      if (wanted.has(index)) nodes.set(index, node as Text);
    }
    return targets.map(target => {
      const node = nodes.get(target.nodeIndex); const parent = node?.parentElement;
      if (!node || !(parent instanceof HTMLElement)) return { id: target.id, points: [] };
      const style = getComputedStyle(parent); const raw = node.textContent ?? ''; const points: Array<{ x: number; y: number }> = [];
      const probe = document.createElement('canvas'); const probeContext = probe.getContext('2d', { willReadFrequently: true });
      if (!probeContext) return { id: target.id, points };
      const font = style.font || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      probeContext.font = font;
      for (let offset = 0; offset < raw.length && offset < 128 && points.length < 512; offset++) {
        let glyph = raw[offset] ?? ''; if (/\s/u.test(glyph)) continue;
        if (style.textTransform === 'uppercase') glyph = glyph.toLocaleUpperCase();
        else if (style.textTransform === 'lowercase') glyph = glyph.toLocaleLowerCase();
        const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect(); range.detach(); if (rect.width <= 0 || rect.height <= 0) continue;
        probeContext.font = font; const metrics = probeContext.measureText(glyph);
        const width = Math.max(1, Math.ceil(Math.min(rect.width, metrics.width + 4))); const height = Math.max(1, Math.ceil(rect.height));
        probe.width = width; probe.height = height; probeContext.font = font; probeContext.fillStyle = '#000';
        probeContext.textBaseline = 'alphabetic';
        const baseline = Math.min(height, Math.max(1, (height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2));
        const origin = style.direction === 'rtl' ? Math.max(0, width - metrics.width) : 0;
        probeContext.fillText(glyph, origin, baseline);
        const pixels = probeContext.getImageData(0, 0, width, height).data;
        const left = style.direction === 'rtl' ? rect.right - width : rect.left;
        for (let y = 0; y < height && points.length < 512; y++) for (let x = 0; x < width && points.length < 512; x++) {
          if ((pixels[(y * width + x) * 4 + 3] ?? 0) >= 64) points.push({ x: left + x + .5, y: rect.top + y + .5 });
        }
      }
      return { id: target.id, points };
    });
  }, requests.map(request => ({ id: request.id, nodeIndex: request.nodeIndex })));
  const byId = new Map(sampled.map(sample => [sample.id, sample.points]));
  return requests.map(request => ({ id: request.id, href: request.href, foreground: request.foreground,
    bounds: request.bounds, points: byId.get(request.id) ?? [] }));
}
