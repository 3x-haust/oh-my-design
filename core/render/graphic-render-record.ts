import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What `omd render --graphic` saw when it captured a graphic: how much of the captured area the largest
 * placed raster (an <img> or a CSS url() background) covers. A screenshot or photo dropped into a frame is
 * an image, not a graphic built in code, and the taste comparison refuses it. It also records how much of the
 * captured area a WebGL canvas covers: a landing's section graphic is a lit object built in three.js, and a CSS
 * drawing of cards, sheets and labels is a diagram.
 */
export const GRAPHIC_RENDER_DIRECTORY = '.omd/graphics/renders';
export const RASTER_DOMINANT_SHARE = 0.5;
export const WEBGL_GRAPHIC_SHARE = 0.25;
/** A raster this large loaded by a graphic page is a photo or screenshot; built geometry and small textures are not. */
export const LARGE_RASTER_BYTES = 120_000;

/** Width and height read from a PNG, GIF, JPEG or WebP header; null when the format is not recognised. */
export function rasterSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 10 && bytes.toString('ascii', 0, 3) === 'GIF') return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const bits = bytes.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * A raster a graphic page loads that is a photo or screenshot rather than a material texture: large in bytes, or a
 * screen-shaped image of real size. Square textures (matcaps, noise, normal maps) are material, not pictures.
 */
export function pictureRaster(bytes: Buffer): boolean {
  if (bytes.length >= LARGE_RASTER_BYTES) return true;
  const size = rasterSize(bytes);
  if (size === null || size.width === 0 || size.height === 0) return false;
  const aspect = size.width / size.height;
  return size.width * size.height >= 300_000 && (aspect >= 1.2 || aspect <= 1 / 1.2);
}

export type GraphicRenderRecord = Readonly<{
  schema: 'graphic-render-v1';
  path: string;
  sha256: string;
  largestRaster: Readonly<{ src: string; share: number }> | null;
  webglShare?: number;
  loadedRasters?: readonly string[];
}>;

export const graphicRenderRecordPath = (sha256: string): string => `${GRAPHIC_RENDER_DIRECTORY}/${sha256}.json`;

export function readGraphicRenderRecord(root: string, sha256: string): GraphicRenderRecord | null {
  const path = join(root, graphicRenderRecordPath(sha256));
  if (!existsSync(path)) return null;
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as GraphicRenderRecord;
    return record.schema === 'graphic-render-v1' && record.sha256 === sha256 ? record : null;
  } catch {
    return null;
  }
}
