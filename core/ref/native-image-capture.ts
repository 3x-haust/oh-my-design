import { createHash } from 'node:crypto';
import { request, type Page } from 'playwright';
import { PNG } from 'pngjs';
import { browserCallback } from './browser-evaluation.ts';
import { assertPublicNetworkUrl, createPublicNetworkProxy, type PublicHostLookup } from './public-network.ts';

/** Keep the image pixels at their native size instead of screenshotting its rendered thumbnail. */
export async function captureOriginalImage(page: Page, selector: string, lookup?: PublicHostLookup,
  fetchImage?: (url: string) => Promise<{ status: number; contentType: string; bytes: Buffer }>): Promise<{
  bytes: Buffer; sourceUrl: string; sourceSha256: string; width: number; height: number;
}> {
  const source = await page.locator(selector).evaluate(browserCallback((element: Element) => {
    if (!(element instanceof HTMLImageElement)) throw new Error('DESIGN_GALLERY_IMAGE_REQUIRED: choose an img');
    const candidates = element.srcset.split(',').map(item => {
      const [url, descriptor] = item.trim().split(/\s+/);
      return { url, size: Number.parseFloat(descriptor ?? '0') || 0 };
    }).filter(item => item.url).sort((a, b) => b.size - a.size);
    return new URL(candidates[0]?.url ?? (element.currentSrc || element.src), document.baseURI).href;
  }));
  await assertPublicNetworkUrl(source, lookup);
  const fetched = fetchImage ? await fetchImage(source) : await (async () => {
    const proxy = await createPublicNetworkProxy();
    try {
      const context = await request.newContext({ proxy: { server: proxy.server } });
      try {
        const response = await context.get(source, { timeout: 20_000 });
        await assertPublicNetworkUrl(response.url());
        return { status: response.status(), contentType: response.headers()['content-type'] ?? '', bytes: Buffer.from(await response.body()) };
      } finally { await context.dispose(); }
    } finally { await proxy.close(); }
  })();
  if (fetched.status < 200 || fetched.status >= 300) throw new Error(`DESIGN_IMAGE_DOWNLOAD: HTTP ${fetched.status}`);
  const original = fetched.bytes;
  const png = original.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const mime = fetched.contentType.split(';')[0]?.trim().toLowerCase();
  const binaryPng = png && (mime === 'application/octet-stream' || mime === 'binary/octet-stream');
  if (original.length < 24 || original.length > 32_000_000 || (!fetched.contentType.startsWith('image/') && !binaryPng))
    throw new Error('DESIGN_IMAGE_DOWNLOAD: selected source is not a bounded image');
  const sourceSha256 = createHash('sha256').update(original).digest('hex');
  const bytes = png ? original : Buffer.from(await page.evaluate(browserCallback(async (input: { data: string; mime: string }) => {
    const binary = atob(input.data); const array = Uint8Array.from(binary, char => char.charCodeAt(0));
    const image = await createImageBitmap(new Blob([array], { type: input.mime }));
    if (image.width > 8192 || image.height > 8192) throw new Error('DESIGN_IMAGE_DOWNLOAD: image exceeds native dimension limit');
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0); image.close();
    return canvas.toDataURL('image/png').split(',')[1]!;
  }), { data: original.toString('base64'), mime: fetched.contentType.split(';')[0]! }), 'base64');
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error('DESIGN_IMAGE_DOWNLOAD: original could not be retained as PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192) throw new Error('DESIGN_IMAGE_DOWNLOAD: invalid native dimensions');
  if (png) PNG.sync.read(bytes);
  return { bytes, sourceUrl: source, sourceSha256, width, height };
}
