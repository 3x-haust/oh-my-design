import { deflateSync } from 'node:zlib';
import { decodePng } from '../../motion/energy.ts';
import { validateReferencePng } from '../board-security.ts';
import type { Box } from './contract.ts';

function chunk(type: string, bytes: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), bytes]); let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const prefix = Buffer.alloc(4), suffix = Buffer.alloc(4); prefix.writeUInt32BE(bytes.length); suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([prefix, body, suffix]);
}
export function cropBrowsePng(parent: Buffer, box: Box): Buffer {
  validateReferencePng(parent); const image = decodePng(parent);
  const { x, y, width, height } = box;
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0
    || x + width > image.width || y + height > image.height) throw new Error('BROWSE_CROP_BOUNDS');
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = image.channels === 4 ? 6 : 2;
  const rows = Buffer.alloc((width * image.channels + 1) * height);
  for (let row = 0; row < height; row++) {
    const start = ((y + row) * image.width + x) * image.channels;
    rows.set(image.pixels.subarray(start, start + width * image.channels), row * (width * image.channels + 1) + 1);
  }
  return Buffer.concat([parent.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export function sameBrowsePixels(left: Buffer, right: Buffer): boolean {
  validateReferencePng(left); validateReferencePng(right);
  const a = decodePng(left), b = decodePng(right);
  return a.width === b.width && a.height === b.height && a.channels === b.channels && Buffer.from(a.pixels).equals(Buffer.from(b.pixels));
}
