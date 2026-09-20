import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { requireDesignImageAdmission } from '../core/ref/design-image-admission.ts';
import { withBrowser } from '../core/render/index.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';

function chunk(type: string, payload: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), payload]);
  const size = Buffer.alloc(4); size.writeUInt32BE(payload.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([size, body, crc]);
}

test('crop admission refuses transparency metadata that makes the native image invisible in Chromium', async t => {
  const { root, gallery } = designAdmissionFixture(t);
  const original = readFileSync(join(root, gallery.evidence.path));
  const transparent = Buffer.concat([original.subarray(0, 33), chunk('tRNS', Buffer.from([0, 2, 0, 2, 0, 3])), original.subarray(33)]);
  const imagePath = '.omd/refs/design/transparency.png';
  writeFileSync(join(root, imagePath), transparent);
  const pixels = await withBrowser(async browser => {
    const page = await browser.newPage();
    try {
      return await page.evaluate(async urls => {
        const result: number[][] = [];
        for (const url of urls) {
          const image = new Image(); image.src = url; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
          const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable');
          context.drawImage(image, 0, 0); result.push([...context.getImageData(0, 0, 1, 1).data]);
        }
        return result;
      }, [original, transparent].map(bytes => `data:image/png;base64,${bytes.toString('base64')}`));
    } finally { await page.close(); }
  });
  assert.deepEqual(pixels, [[2, 2, 3, 255], [0, 0, 0, 0]]);
  const provenance = { sourcePage: gallery.source, captureRegion: 'Gallery image', cropBox: { x: 0, y: 0, width: 1, height: 1 }, licenseStatus: 'unknown' as const, rightsNotes: 'Study only', capturedAt: '2026-09-21T00:00:00.000Z' };
  assert.doesNotThrow(() => requireDesignImageAdmission(root, { imagePath: gallery.evidence.path, provenance }));
  assert.throws(() => requireDesignImageAdmission(root, { imagePath, provenance }), /FRAGMENT_SOURCE/);
});

test('crop admission preserves PNG colour metadata but accepts recompressed matching pixels', t => {
  const { root, gallery } = designAdmissionFixture(t);
  const original = readFileSync(join(root, gallery.evidence.path));
  const imagePath = '.omd/refs/design/reencoded.png';
  const provenance = { sourcePage: gallery.source, captureRegion: 'Gallery image', cropBox: { x: 0, y: 0, width: 1, height: 1 }, licenseStatus: 'unknown' as const, rightsNotes: 'Study only', capturedAt: '2026-09-21T00:00:00.000Z' };
  const size = original.readUInt32BE(33);
  const raw = inflateSync(original.subarray(41, 41 + size));
  const recompressed = Buffer.concat([original.subarray(0, 33), chunk('IDAT', deflateSync(raw, { level: 0 })), original.subarray(45 + size)]);
  assert.notDeepEqual(recompressed, original);
  writeFileSync(join(root, imagePath), recompressed);
  assert.doesNotThrow(() => requireDesignImageAdmission(root, { imagePath, provenance }));
  const gamma = Buffer.alloc(4); gamma.writeUInt32BE(100000);
  writeFileSync(join(root, imagePath), Buffer.concat([original.subarray(0, 33), chunk('gAMA', gamma), original.subarray(33)]));
  assert.throws(() => requireDesignImageAdmission(root, { imagePath, provenance }), /FRAGMENT_SOURCE/);
});
