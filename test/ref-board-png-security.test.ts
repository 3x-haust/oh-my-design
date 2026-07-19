import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { deflateSync, crc32 } from 'node:zlib';
import { trustedReferenceImage } from '../core/ref/board-security.ts';

type ColorType = 0 | 2 | 3 | 4 | 6;
type PngParts = { readonly data: Buffer; readonly end: Buffer; readonly header: Buffer; readonly palette: Buffer };
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const root = (context: TestContext): string => { const directory = mkdtempSync(join(tmpdir(), 'omd-ref-png-')); mkdirSync(join(directory, '.omd', 'refs'), { recursive: true }); context.after(() => rmSync(directory, { recursive: true, force: true })); return directory; };
const chunk = (type: string, bytes: Buffer): Buffer => { const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); const body = Buffer.concat([Buffer.from(type), bytes]); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([length, body, checksum]); };
const pixels = (color: ColorType): Buffer => {
  switch (color) {
    case 0: return Buffer.from([0, 1]);
    case 2: return Buffer.from([0, 1, 2, 3]);
    case 3: return Buffer.from([0, 0]);
    case 4: return Buffer.from([0, 1, 255]);
    case 6: return Buffer.from([0, 1, 2, 3, 255]);
  }
};
const parts = (color: ColorType): PngParts => { const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = color; return { header: chunk('IHDR', header), palette: chunk('PLTE', Buffer.from([0, 0, 0])), data: chunk('IDAT', deflateSync(pixels(color))), end: chunk('IEND', Buffer.alloc(0)) }; };
const image = (color: ColorType, palette = color === 3): Buffer => { const value = parts(color); return Buffer.concat([signature, value.header, ...(palette ? [value.palette] : []), value.data, value.end]); };
const validate = (directory: string, bytes: Buffer): void => { writeFileSync(join(directory, '.omd', 'refs', 'image.png'), bytes); trustedReferenceImage(directory, '.omd/refs/image.png'); };

test('reference board accepts valid grayscale, truecolor, alpha, and indexed PNG structures', (context) => {
  // Given: legal 1x1 PNGs across supported color structures.
  const directory = root(context);

  // When / Then: each complete, correctly ordered image is trusted.
  for (const color of [0, 2, 3, 4, 6] as const) assert.doesNotThrow(() => validate(directory, image(color)));
  const value = parts(2); assert.doesNotThrow(() => validate(directory, Buffer.concat([signature, value.header, chunk('teXt', Buffer.from('note')), value.data, value.end])));
});

test('reference board rejects forged PNG palette, IDAT, and IEND structures', (context) => {
  // Given: chunk sequences that have valid CRCs but violate PNG structural rules.
  const directory = root(context); const indexed = parts(3); const gray = parts(0); const split = deflateSync(pixels(2)); const first = chunk('IDAT', split.subarray(0, 2)); const second = chunk('IDAT', split.subarray(2));
  const invalid: readonly Buffer[] = [
    Buffer.concat([signature, indexed.header, indexed.data, indexed.end]), Buffer.concat([signature, gray.header, gray.palette, gray.data, gray.end]),
    Buffer.concat([signature, indexed.header, indexed.data, indexed.palette, indexed.end]), Buffer.concat([signature, indexed.header, indexed.palette, indexed.palette, indexed.data, indexed.end]),
    Buffer.concat([signature, parts(2).header, first, chunk('tEXt', Buffer.from('note')), second, parts(2).end]), Buffer.concat([signature, parts(2).header, parts(2).data]),
    Buffer.concat([signature, parts(2).header, chunk('tEX1', Buffer.from('note')), parts(2).data, parts(2).end]), Buffer.concat([signature, parts(2).header, chunk('tExt', Buffer.from('note')), parts(2).data, parts(2).end]),
  ];

  // When / Then: no invalid chunk ordering or required-chunk omission reaches image decoding.
  for (const bytes of invalid) assert.throws(() => validate(directory, bytes));
});

test('reference board rejects symlinked project, .omd, refs, and fragments ancestors', (context) => {
  const directory = root(context);
  const placeImage = (project: string, imagePath = join(project, '.omd', 'refs', 'fragments', 'image.png')): void => {
    mkdirSync(dirname(imagePath), { recursive: true });
    writeFileSync(imagePath, image(2));
  };
  const realProject = join(directory, 'real-project'); placeImage(realProject); const linkedProject = join(directory, 'linked-project'); symlinkSync(realProject, linkedProject);
  const omdProject = join(directory, 'omd-project'); const externalOmd = join(directory, 'external-omd'); mkdirSync(omdProject); mkdirSync(join(externalOmd, 'refs', 'fragments'), { recursive: true }); writeFileSync(join(externalOmd, 'refs', 'fragments', 'image.png'), image(2)); symlinkSync(externalOmd, join(omdProject, '.omd'));
  const refsProject = join(directory, 'refs-project'); const externalRefs = join(directory, 'external-refs'); mkdirSync(join(refsProject, '.omd'), { recursive: true }); mkdirSync(join(externalRefs, 'fragments'), { recursive: true }); writeFileSync(join(externalRefs, 'fragments', 'image.png'), image(2)); symlinkSync(externalRefs, join(refsProject, '.omd', 'refs'));
  const fragmentsProject = join(directory, 'fragments-project'); const externalFragments = join(directory, 'external-fragments'); mkdirSync(join(fragmentsProject, '.omd', 'refs'), { recursive: true }); mkdirSync(externalFragments); writeFileSync(join(externalFragments, 'image.png'), image(2)); symlinkSync(externalFragments, join(fragmentsProject, '.omd', 'refs', 'fragments'));

  for (const [project, imagePath] of [[linkedProject, '.omd/refs/fragments/image.png'], [omdProject, '.omd/refs/fragments/image.png'], [refsProject, '.omd/refs/fragments/image.png'], [fragmentsProject, '.omd/refs/fragments/image.png']] as const) {
    assert.throws(() => trustedReferenceImage(project, imagePath), /symlinked/);
  }
});
