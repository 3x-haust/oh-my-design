import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';
import { ReferenceBoardResolutionError } from './board-contract.ts';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_COMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const fail = (reason: string): never => { throw new ReferenceBoardResolutionError(`component capture image ${reason}`); };
const inside = (parent: string, child: string): boolean => {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};
const insideOrSame = (parent: string, child: string): boolean => parent === child || inside(parent, child);
type ReferenceRoot = { readonly refs: string; readonly realRefs: string };
const trustedDirectory = (path: string, label: string, parent?: string): string => {
  try {
    const entry = lstatSync(path);
    if (entry.isSymbolicLink()) fail(`path must not use a symlinked ${label}`);
    if (!entry.isDirectory()) fail(`${label} must be a real directory`);
    const realPath = realpathSync(path);
    if (parent !== undefined && !insideOrSame(parent, realPath)) fail(`${label} must remain beneath the real project root`);
    return realPath;
  } catch (error) {
    if (error instanceof ReferenceBoardResolutionError) throw error;
    return fail(`${label} is missing or unreadable`);
  }
};
export const trustedProjectRoot = (root: string): string => trustedDirectory(resolve(root), 'project root');
const referenceRoot = (root: string): ReferenceRoot => {
  const realRoot = trustedProjectRoot(root);
  const omd = trustedDirectory(join(root, '.omd'), 'project .omd directory', realRoot);
  return { refs: join(root, '.omd', 'refs'), realRefs: trustedDirectory(join(root, '.omd', 'refs'), 'project .omd/refs directory', omd) };
};
const trustedReferenceEntry = (root: string, value: string, directory: boolean): string => {
  if (isAbsolute(value) || value.includes('%') || value.split(/[\\/]/).includes('..')) fail('path must be a plain relative path beneath .omd/refs');
  const reference = referenceRoot(root);
  const path = resolve(root, value);
  if (!(directory ? insideOrSame(reference.refs, path) : inside(reference.refs, path))) fail(`path must be ${directory ? 'a directory beneath' : 'a PNG beneath'} .omd/refs`);
  const parts = relative(reference.refs, path).split(sep).filter((part) => part !== '');
  let current = reference.refs;
  let realParent = reference.realRefs;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const isDirectory = index < parts.length - 1 || directory;
    const label = isDirectory ? 'reference directory' : 'reference file';
    realParent = trustedEntry(current, label, realParent, isDirectory);
  }
  return realParent;
};
const trustedEntry = (path: string, label: string, parent: string, directory: boolean): string => {
  try {
    const entry = lstatSync(path);
    if (entry.isSymbolicLink()) fail(`path must not use a symlinked ${label}`);
    if (directory ? !entry.isDirectory() : !entry.isFile()) fail(`path must resolve to a regular ${directory ? 'directory' : 'file'} beneath .omd/refs`);
    const realPath = realpathSync(path);
    if (!inside(parent, realPath)) fail('path must remain beneath .omd/refs');
    return realPath;
  } catch (error) {
    if (error instanceof ReferenceBoardResolutionError) throw error;
    return fail('path is missing or unreadable');
  }
};
const crc32 = (bytes: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const inflatedPixels = (data: readonly Buffer[], maxOutputLength: number): Buffer => {
  try { return inflateSync(Buffer.concat(data), { maxOutputLength }); } catch { return fail('has unreadable PNG pixel data'); }
};
const imageBytes = (path: string): Buffer => {
  try { return readFileSync(path); } catch { return fail('path is unreadable'); }
};
const isPng = (bytes: Buffer): void => {
  if (bytes.length > MAX_COMPRESSED_BYTES || bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) fail('must be a valid PNG');
  let offset = PNG_SIGNATURE.length; let sawHeader = false; let sawPalette = false; let sawData = false; let dataClosed = false; let sawEnd = false; let width = 0; let height = 0; let channels = 0; let colorType = -1; let bitDepth = -1;
  const data: Buffer[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('has a truncated PNG chunk');
    const length = bytes.readUInt32BE(offset); const end = offset + 12 + length;
    if (end > bytes.length) fail('has a truncated PNG chunk');
    const typeBytes = bytes.subarray(offset + 4, offset + 8); const thirdByte = typeBytes[2] ?? fail('has an invalid PNG chunk type');
    if (typeBytes.some((byte) => !((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) || thirdByte < 65 || thirdByte > 90) fail('has an invalid PNG chunk type');
    const type = typeBytes.toString('ascii'); const payload = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) fail('has an invalid PNG chunk CRC');
    if (!sawHeader && (type !== 'IHDR' || length !== 13)) fail('must start with an IHDR PNG chunk');
    if (type === 'IHDR') {
      if (sawHeader) fail('has a duplicate IHDR PNG chunk');
      sawHeader = true; width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
      bitDepth = payload[8] ?? fail('has an incomplete IHDR PNG chunk'); colorType = payload[9] ?? fail('has an incomplete IHDR PNG chunk');
      if (width === 0 || height === 0 || width * height > MAX_PIXELS || payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) fail('uses an unsupported PNG format');
      if (colorType === 0 && [1, 2, 4, 8, 16].includes(bitDepth)) channels = bitDepth;
      else if (colorType === 2 && [8, 16].includes(bitDepth)) channels = 3 * bitDepth;
      else if (colorType === 3 && [1, 2, 4, 8].includes(bitDepth)) channels = bitDepth;
      else if (colorType === 4 && [8, 16].includes(bitDepth)) channels = 2 * bitDepth;
      else if (colorType === 6 && [8, 16].includes(bitDepth)) channels = 4 * bitDepth;
      else fail('uses an unsupported PNG color type or bit depth');
    } else if (type === 'PLTE') {
      if (!sawHeader || sawPalette || sawData || sawEnd || colorType === 0 || colorType === 4 || length === 0 || length % 3 !== 0 || length > 768 || (colorType === 3 && length > 3 * (1 << bitDepth))) fail('has an invalid PLTE PNG chunk');
      sawPalette = true;
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd || dataClosed || (colorType === 3 && !sawPalette)) fail('has IDAT data in an invalid position');
      sawData = true; data.push(payload);
    } else if (type === 'IEND') {
      if (!sawHeader || !sawData || length !== 0 || sawEnd || end !== bytes.length) fail('has an invalid IEND PNG chunk');
      sawEnd = true;
    } else {
      if ((type.charCodeAt(0) & 32) === 0) fail('has an unsupported critical PNG chunk');
      if (sawData) dataClosed = true;
    }
    offset = end;
  }
  if (!sawHeader || !sawData || !sawEnd || channels === 0) fail('is missing required PNG chunks');
  const rowBytes = 1 + Math.ceil((width * channels) / 8);
  const raw = inflatedPixels(data, rowBytes * height);
  if (raw.length !== rowBytes * height) fail('has invalid PNG pixel data length');
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * rowBytes];
    if (filter === undefined || filter > 4) fail('has an invalid PNG row filter');
  }
};

export function trustedReferenceImage(root: string, imagePath: string): string {
  if (extname(imagePath).toLowerCase() !== '.png') fail('path must be a PNG beneath .omd/refs');
  const path = trustedReferenceEntry(root, imagePath, false);
  isPng(imageBytes(path));
  return path;
}

export const trustedReferenceDirectory = (root: string, path: string): string => trustedReferenceEntry(root, path, true);

export const trustedComponentCaptureImage = trustedReferenceImage;
