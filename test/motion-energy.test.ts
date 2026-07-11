/**
 * Tests for core/motion/energy.ts — M4 pixel-diff motion energy.
 *
 * All tests use synthetic PNG buffers created with Node's built-in deflate + CRC32.
 * No browser is required. The test helpers (makePng, uniformRgb) build minimal valid
 * PNGs with filter type 0 (None), which is the simplest case for decodePng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import { decodePng, computeEnergy } from '../core/motion/energy.ts';

// ── PNG creation helpers ──────────────────────────────────────────────────────

function uint32BE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const checksum = crc32(Buffer.concat([typeBytes, data]));
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(checksum >>> 0)]);
}

/**
 * Build a minimal valid PNG from raw RGB pixels.
 * Uses filter type 0 (None) for every scanline — simplest for testing purposes.
 */
function makePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // compression, filter, interlace

  const stride = width * 3;
  // Build raw data: one filter byte (0 = None) per scanline, then the pixel data.
  const rawRows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawRows[y * (stride + 1)] = 0; // filter: None
    for (let x = 0; x < stride; x++) {
      rawRows[y * (stride + 1) + 1 + x] = rgb[y * stride + x]!;
    }
  }

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', deflateSync(rawRows)),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Create a width×height RGB image where every pixel has the given [r,g,b] value. */
function uniformRgb(width: number, height: number, r: number, g: number, b: number): Buffer {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = r;
    pixels[i * 3 + 1] = g;
    pixels[i * 3 + 2] = b;
  }
  return makePng(width, height, pixels);
}

// ── decodePng ────────────────────────────────────────────────────────────────

test('decodePng: decodes a 2×2 RGB PNG with known pixel values', () => {
  // 2×2 image: top-left=red, top-right=green, bottom-left=blue, bottom-right=white
  const pixels = new Uint8Array([
    255, 0, 0,    // top-left: red
    0, 255, 0,    // top-right: green
    0, 0, 255,    // bottom-left: blue
    255, 255, 255, // bottom-right: white
  ]);
  const png = makePng(2, 2, pixels);
  const { width, height, channels } = decodePng(png);
  assert.equal(width, 2);
  assert.equal(height, 2);
  assert.equal(channels, 3);
});

test('decodePng: pixel values round-trip correctly', () => {
  const pixels = new Uint8Array([100, 150, 200, 50, 75, 25, 255, 0, 128, 10, 20, 30]);
  const png = makePng(4, 1, pixels);
  const decoded = decodePng(png);
  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 1);
  for (let i = 0; i < pixels.length; i++) {
    assert.equal(decoded.pixels[i], pixels[i], `pixel[${i}] mismatch`);
  }
});

test('decodePng: rejects a non-PNG buffer', () => {
  const notPng = Buffer.from('not a png at all');
  assert.throws(() => decodePng(notPng), /not a PNG/);
});

test('decodePng: rejects 16-bit depth', () => {
  // Build a PNG with IHDR claiming 16-bit depth. decodePng should throw before deflate.
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4);
  ihdr[8] = 16; ihdr[9] = 2; // 16-bit RGB
  const chunk = makePngChunk('IHDR', ihdr);
  const fake = Buffer.concat([signature, chunk]);
  assert.throws(() => decodePng(fake), /unsupported PNG bit depth/);
});

// ── computeEnergy ────────────────────────────────────────────────────────────

test('computeEnergy: identical frames → changedFraction 0 and peakEnergy 0', () => {
  const frame = uniformRgb(8, 6, 128, 64, 32);
  const result = computeEnergy([frame, frame]);
  assert.equal(result.frames, 2);
  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0]!.changedFraction, 0);
  assert.equal(result.peakEnergy, 0);
});

test('computeEnergy: completely different frames → changedFraction 1 and peakEnergy 1', () => {
  const black = uniformRgb(4, 4, 0, 0, 0);
  const white = uniformRgb(4, 4, 255, 255, 255);
  const result = computeEnergy([black, white]);
  assert.equal(result.pairs[0]!.changedFraction, 1);
  assert.equal(result.peakEnergy, 1);
});

test('computeEnergy: small diff below threshold → changedFraction 0', () => {
  // Default threshold is 10; diff of 5 should not register as changed.
  const frame1 = uniformRgb(4, 4, 100, 100, 100);
  const frame2 = uniformRgb(4, 4, 105, 105, 105); // diff = 5 < threshold 10
  const result = computeEnergy([frame1, frame2]);
  assert.equal(result.pairs[0]!.changedFraction, 0);
});

test('computeEnergy: diff exactly at threshold → not counted (> threshold, not >=)', () => {
  const frame1 = uniformRgb(4, 4, 100, 100, 100);
  const frame2 = uniformRgb(4, 4, 110, 100, 100); // diff = 10 = threshold, not >
  const result = computeEnergy([frame1, frame2]);
  assert.equal(result.pairs[0]!.changedFraction, 0);
});

test('computeEnergy: diff just above threshold → changedFraction 1', () => {
  const frame1 = uniformRgb(4, 4, 100, 100, 100);
  const frame2 = uniformRgb(4, 4, 111, 100, 100); // diff = 11 > threshold 10
  const result = computeEnergy([frame1, frame2]);
  assert.equal(result.pairs[0]!.changedFraction, 1);
});

test('computeEnergy: top-third motion only → top regionFraction > 0, others 0', () => {
  // 6 rows: top 2 change (rows 0-1), mid 2 stay (rows 2-3), bottom 2 stay (rows 4-5).
  const w = 4;
  const h = 6;
  const pixels1 = new Uint8Array(w * h * 3).fill(100);
  const pixels2 = new Uint8Array(w * h * 3).fill(100);
  // Change top two rows only (rows 0 and 1 = first third with floor(6/3)=2 rows).
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < w; x++) {
      pixels2[(y * w + x) * 3] = 200; // diff = 100 > threshold 10
    }
  }
  const result = computeEnergy([makePng(w, h, pixels1), makePng(w, h, pixels2)]);
  const [top, mid, bottom] = result.pairs[0]!.regionFractions;
  assert.ok(top! > 0, 'top region should have changed pixels');
  assert.equal(mid, 0, 'mid region should be unchanged');
  assert.equal(bottom, 0, 'bottom region should be unchanged');
});

test('computeEnergy: dimension mismatch → changedFraction 1', () => {
  const small = uniformRgb(4, 4, 0, 0, 0);
  const large = uniformRgb(8, 8, 255, 255, 255);
  const result = computeEnergy([small, large]);
  assert.equal(result.pairs[0]!.changedFraction, 1);
  assert.deepEqual(result.pairs[0]!.regionFractions, [1, 1, 1]);
});

test('computeEnergy: three frames → two pairs with correct pairIndex', () => {
  const f0 = uniformRgb(4, 3, 0, 0, 0);
  const f1 = uniformRgb(4, 3, 255, 0, 0);  // high diff vs f0
  const f2 = uniformRgb(4, 3, 255, 0, 0);  // same as f1 → no diff
  const result = computeEnergy([f0, f1, f2]);
  assert.equal(result.frames, 3);
  assert.equal(result.pairs.length, 2);
  assert.equal(result.pairs[0]!.pairIndex, 0);
  assert.equal(result.pairs[1]!.pairIndex, 1);
  assert.ok(result.pairs[0]!.changedFraction > 0, 'pair 0 should show motion');
  assert.equal(result.pairs[1]!.changedFraction, 0, 'pair 1 should show no motion');
  assert.equal(result.peakEnergy, result.pairs[0]!.changedFraction);
});

test('computeEnergy: single frame → no pairs and peakEnergy 0', () => {
  const frame = uniformRgb(4, 4, 128, 128, 128);
  const result = computeEnergy([frame]);
  assert.equal(result.frames, 1);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.peakEnergy, 0);
});

test('computeEnergy: custom diffThreshold respected', () => {
  // diff = 50; threshold 60 → not counted; threshold 40 → counted.
  const frame1 = uniformRgb(4, 4, 100, 100, 100);
  const frame2 = uniformRgb(4, 4, 150, 100, 100); // max diff = 50
  const notCounted = computeEnergy([frame1, frame2], 60);
  const counted = computeEnergy([frame1, frame2], 40);
  assert.equal(notCounted.pairs[0]!.changedFraction, 0, 'threshold 60 should not count diff 50');
  assert.equal(counted.pairs[0]!.changedFraction, 1, 'threshold 40 should count diff 50');
});

test('computeEnergy: partial row change produces correct fraction', () => {
  // 4×4 image; change only 2 of 16 pixels.
  const w = 4;
  const h = 4;
  const px1 = new Uint8Array(w * h * 3).fill(100);
  const px2 = new Uint8Array(w * h * 3).fill(100);
  // Change pixels at (0,0) and (1,0) — top row, leftmost two pixels.
  px2[0] = 255; px2[3] = 255; // pixel 0 and pixel 1, R channel
  const result = computeEnergy([makePng(w, h, px1), makePng(w, h, px2)]);
  // 2 out of 16 pixels changed.
  assert.equal(result.pairs[0]!.changedFraction, 2 / 16);
});
