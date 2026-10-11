import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import type { AcquisitionPage } from './acquisition-engine.ts';
import { browserCallback } from './browser-evaluation.ts';
import { assertPublicNetworkUrl, type PublicHostLookup } from './public-network.ts';

export async function assertUserBrowserImageIdentity(page: AcquisitionPage, selector: string, sourceUrl: string,
  requireGalleryImage = false): Promise<void> {
  await page.evaluate(`${browserCallback(({ css, source, gallery }: { css: string; source: string; gallery: boolean }) => {
    const matches = document.querySelectorAll(css);
    if (matches.length !== 1) throw Error('DESIGN_IMAGE_SELECTOR_AMBIGUOUS: choose exactly one img selector');
    const image = matches[0];
    if (!(image instanceof HTMLImageElement)
      || image !== Reflect.get(globalThis, Symbol.for('omd.reference.selectedImage')) || !image.isConnected
      || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)
      throw Error('DESIGN_IMAGE_CHANGED: selected image was replaced or did not finish loading');
    const box = image.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) throw Error('DESIGN_IMAGE_CHANGED: selected image is not visible');
    for (let element: Element | null = image; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) <= 0)
        throw Error('DESIGN_IMAGE_CHANGED: selected image is not visible');
    }
    if (gallery && (box.width < 100 || box.height < 100 || image.naturalWidth < 100 || image.naturalHeight < 100))
      throw Error('DESIGN_GALLERY_IMAGE_REQUIRED: select one loaded, visible UI image');
    const sources = image.srcset.split(',').map(item => {
      const [src, descriptor] = item.trim().split(/\s+/);
      return { src, size: Number.parseFloat(descriptor ?? '0') || 0 };
    }).filter(item => item.src).sort((a, b) => b.size - a.size);
    const current = new URL(sources[0]?.src ?? image.currentSrc ?? image.src, document.baseURI).href;
    if (current !== source) throw Error('DESIGN_IMAGE_CHANGED: selected image source changed');
  })}(${JSON.stringify({ css: selector, source: sourceUrl, gallery: requireGalleryImage })})`);
}

export async function captureUserBrowserOriginalImage(page: AcquisitionPage, selector: string, lookup?: PublicHostLookup,
  requireGalleryImage = false) {
  const url = await page.evaluate<string>(`${browserCallback((css: string) => {
    const matches = document.querySelectorAll(css);
    if (matches.length !== 1) throw Error('DESIGN_IMAGE_SELECTOR_AMBIGUOUS: choose exactly one img selector');
    const image = matches[0];
    if (!(image instanceof HTMLImageElement)
      || image !== Reflect.get(globalThis, Symbol.for('omd.reference.selectedImage')) || !image.isConnected)
      throw Error('DESIGN_IMAGE_CHANGED: selected image was replaced');
    const sources = image.srcset.split(',').map(item => {
      const [src, descriptor] = item.trim().split(/\s+/);
      return { src, size: Number.parseFloat(descriptor ?? '0') || 0 };
    }).filter(item => item.src).sort((a, b) => b.size - a.size);
    return new URL(sources[0]?.src ?? image.currentSrc ?? image.src, document.baseURI).href;
  })}(${JSON.stringify(selector)})`);
  await assertUserBrowserImageIdentity(page, selector, url, requireGalleryImage);
  await assertPublicNetworkUrl(url, lookup);
  const result = await page.evaluate<{ png: string; original: string; width: number; height: number }>(`${browserCallback(async (source: string) => {
    const response = await fetch(source, { credentials: 'omit' });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error('DESIGN_IMAGE_DOWNLOAD: original image unavailable');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 24 || bytes.length > 32_000_000) throw Error('DESIGN_IMAGE_DOWNLOAD: image exceeds size limit');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
    const image = await createImageBitmap(new Blob([bytes], { type: response.headers.get('content-type')! }));
    if (!image.width || !image.height || image.width > 8192 || image.height > 8192)
      throw Error('DESIGN_IMAGE_DOWNLOAD: image exceeds native dimension limit');
    const png = bytes.subarray(0, 8).every((value, i) => value === [137, 80, 78, 71, 13, 10, 26, 10][i]);
    if (png) {
      const width = image.width, height = image.height;
      image.close();
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { png: btoa(binary), original: digest, width, height };
    }
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0); image.close();
    return { png: canvas.toDataURL('image/png').split(',')[1]!, original: digest, width: canvas.width, height: canvas.height };
  })}(${JSON.stringify(url)})`);
  await assertUserBrowserImageIdentity(page, selector, url, requireGalleryImage);
  const bytes = Buffer.from(result.png, 'base64');
  if (bytes.length < 24 || bytes.length > 32_000_000
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.readUInt32BE(16) !== result.width || bytes.readUInt32BE(20) !== result.height)
    throw new Error('DESIGN_IMAGE_DOWNLOAD: native PNG dimensions changed');
  PNG.sync.read(bytes);
  return { bytes, sourceUrl: url, sourceSha256: result.original,
    width: result.width, height: result.height, sha256: createHash('sha256').update(bytes).digest('hex') };
}
