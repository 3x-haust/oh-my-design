import { PNG } from 'pngjs';

export type ElementGeometry = Readonly<{
  x: number; y: number; width: number; height: number;
  viewport: { width: number; height: number }; url: string; identity: number;
}>;

/** Crop using the actual PNG-to-CSS pixel scale; never publish a clipped target. */
export function cropUserBrowserPng(bytes: Buffer, geometry: ElementGeometry): Buffer {
  if (bytes.length > 32_000_000) throw new Error('OMD Browser screenshot exceeds the crop budget');
  if (bytes.length < 24 || bytes.readUInt32BE(16) > 8192 || bytes.readUInt32BE(20) > 8192)
    throw new Error('OMD Browser screenshot dimensions exceed the crop budget');
  const png = PNG.sync.read(bytes);
  const { x, y, width, height, viewport } = geometry;
  if (![x, y, width, height, viewport.width, viewport.height].every(Number.isFinite)
    || x < 0 || y < 0 || width <= 0 || height <= 0 || viewport.width <= 0 || viewport.height <= 0
    || x + width > viewport.width || y + height > viewport.height)
    throw new Error('OMD Browser selected element does not fit in the viewport');
  const left = Math.floor(x * png.width / viewport.width);
  const top = Math.floor(y * png.height / viewport.height);
  const right = Math.ceil((x + width) * png.width / viewport.width);
  const bottom = Math.ceil((y + height) * png.height / viewport.height);
  if (left < 0 || top < 0 || right > png.width || bottom > png.height || right <= left || bottom <= top)
    throw new Error('OMD Browser screenshot geometry changed');
  const result = new PNG({ width: right - left, height: bottom - top });
  PNG.bitblt(png, result, left, top, result.width, result.height, 0, 0);
  return PNG.sync.write(result);
}
