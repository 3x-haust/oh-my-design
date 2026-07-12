/**
 * Tests for core/figma/diff.ts — F3 pixel fidelity comparison.
 *
 * All tests use synthetic PNG buffers built with the same helpers as
 * test/motion-energy.test.ts (makePng / uniformRgb). No network, no browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import {
  compareImages,
  formatDiffReport,
  CHANNEL_TOLERANCE,
  GRID_COLS,
  GRID_ROWS,
} from '../core/figma/diff.ts';

// ── PNG creation helpers (mirrors test/motion-energy.test.ts) ─────────────────

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
 * Uses filter type 0 (None) for every scanline — simplest for testing.
 */
function makePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 3;
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

/** Create a uniform-color PNG where every pixel has the given [r, g, b]. */
function uniformRgb(width: number, height: number, r: number, g: number, b: number): Buffer {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = r;
    pixels[i * 3 + 1] = g;
    pixels[i * 3 + 2] = b;
  }
  return makePng(width, height, pixels);
}

/**
 * Create a PNG where the top `topHeight` rows are `topRgb` and the rest
 * are `botRgb`. Used to produce images with a known changed-pixel fraction.
 */
function splitRgb(
  width: number,
  height: number,
  topHeight: number,
  topRgb: [number, number, number],
  botRgb: [number, number, number],
): Buffer {
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const [r, g, b] = y < topHeight ? topRgb : botRgb;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      pixels[i] = r!;
      pixels[i + 1] = g!;
      pixels[i + 2] = b!;
    }
  }
  return makePng(width, height, pixels);
}

// ── compareImages: basic cases ────────────────────────────────────────────────

test('compareImages: identical images → score 1, pass true at default threshold', () => {
  const img = uniformRgb(60, 60, 100, 150, 200);
  const result = compareImages(img, img);
  assert.equal(result.score, 1);
  assert.equal(result.pass, true);
  assert.equal(result.threshold, 0.97);
  assert.equal(result.dimMismatch, undefined);
});

test('compareImages: completely different images → score 0, pass false', () => {
  const ref = uniformRgb(60, 60, 0, 0, 0);    // all black
  const build = uniformRgb(60, 60, 255, 255, 255); // all white
  const result = compareImages(ref, build);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
});

test('compareImages: top half changed → score ≈ 0.5', () => {
  const size = 60;
  const ref = uniformRgb(size, size, 0, 0, 0);
  // Build: top half is very different (delta=200, above tolerance=12)
  const build = splitRgb(size, size, size / 2, [200, 200, 200], [0, 0, 0]);
  const result = compareImages(ref, build);
  // Exactly half the pixels differ, score should be 0.5
  assert.ok(result.score >= 0.49 && result.score <= 0.51, `expected ~0.5, got ${result.score}`);
  assert.equal(result.pass, false);
});

// ── compareImages: per-channel tolerance ─────────────────────────────────────

test(`compareImages: delta == CHANNEL_TOLERANCE (${CHANNEL_TOLERANCE}) counts as same`, () => {
  const ref = uniformRgb(10, 10, 100, 100, 100);
  // Delta exactly at tolerance → should count as same
  const build = uniformRgb(10, 10, 100 + CHANNEL_TOLERANCE, 100, 100);
  const result = compareImages(ref, build);
  assert.equal(result.score, 1, 'delta == tolerance should be "same"');
  assert.equal(result.pass, true);
});

test('compareImages: delta == CHANNEL_TOLERANCE + 1 counts as different', () => {
  const ref = uniformRgb(10, 10, 100, 100, 100);
  const build = uniformRgb(10, 10, 100 + CHANNEL_TOLERANCE + 1, 100, 100);
  const result = compareImages(ref, build);
  assert.equal(result.score, 0, 'delta > tolerance should be "different"');
  assert.equal(result.pass, false);
});

test('compareImages: antialiasing-range delta (delta=8) counts as same', () => {
  const ref = uniformRgb(20, 20, 128, 128, 128);
  const build = uniformRgb(20, 20, 128 + 8, 128, 128);
  const result = compareImages(ref, build);
  assert.equal(result.score, 1);
});

test('compareImages: custom tolerance respected', () => {
  const ref = uniformRgb(10, 10, 100, 100, 100);
  const build = uniformRgb(10, 10, 105, 100, 100); // delta=5
  // With tolerance=4 (strict) → different; with tolerance=5 (matches) → same
  const strict = compareImages(ref, build, 0.97, 4);
  const lenient = compareImages(ref, build, 0.97, 5);
  assert.equal(strict.score, 0, 'tolerance=4 should flag delta=5 as different');
  assert.equal(lenient.score, 1, 'tolerance=5 should accept delta=5 as same');
});

// ── compareImages: threshold / pass-fail ─────────────────────────────────────

test('compareImages: score 0.95 passes at threshold 0.95, fails at 0.97', () => {
  // Engineer exactly 5% changed pixels: 60×60=3600 pixels, 180 of them differ
  // Use a 60×3 block at the top (3 rows × 60 px = 180 px) with large delta
  const size = 60;
  const ref = uniformRgb(size, size, 0, 0, 0);
  const build = splitRgb(size, size, 3, [200, 200, 200], [0, 0, 0]);
  // 3/60 = 5% changed
  const atThreshold = compareImages(ref, build, 0.95);
  const aboveThreshold = compareImages(ref, build, 0.97);
  assert.equal(atThreshold.pass, true,  `score=${atThreshold.score} should pass at 0.95`);
  assert.equal(aboveThreshold.pass, false, `score=${aboveThreshold.score} should fail at 0.97`);
});

test('compareImages: threshold stored in result', () => {
  const img = uniformRgb(10, 10, 0, 0, 0);
  const result = compareImages(img, img, 0.85);
  assert.equal(result.threshold, 0.85);
});

// ── compareImages: dimension mismatch ────────────────────────────────────────

test('compareImages: dimension mismatch → dimMismatch reported, overlap compared', () => {
  const ref = uniformRgb(60, 60, 0, 0, 0);    // 60×60 black
  const build = uniformRgb(80, 80, 0, 0, 0);  // 80×80 black
  const result = compareImages(ref, build);

  assert.ok(result.dimMismatch !== undefined, 'dimMismatch should be present');
  assert.equal(result.dimMismatch!.refWidth, 60);
  assert.equal(result.dimMismatch!.refHeight, 60);
  assert.equal(result.dimMismatch!.buildWidth, 80);
  assert.equal(result.dimMismatch!.buildHeight, 80);
  assert.equal(result.dimMismatch!.overlapWidth, 60);
  assert.equal(result.dimMismatch!.overlapHeight, 60);
  // Overlap is identical (both black) → score 1
  assert.equal(result.score, 1);
});

test('compareImages: dimension mismatch with different overlap content → correct score', () => {
  const ref = uniformRgb(60, 60, 0, 0, 0);      // 60×60 black
  const build = uniformRgb(60, 60, 255, 255, 255); // 60×60 white — completely different
  // Same size but all pixels differ
  const result = compareImages(ref, build);
  assert.equal(result.score, 0);
  assert.equal(result.dimMismatch, undefined); // same size, no mismatch descriptor
});

test('compareImages: ref larger than build → overlap is build dimensions', () => {
  const ref = uniformRgb(100, 100, 50, 50, 50);
  const build = uniformRgb(40, 40, 50, 50, 50); // identical color, smaller
  const result = compareImages(ref, build);

  assert.ok(result.dimMismatch !== undefined);
  assert.equal(result.dimMismatch!.overlapWidth, 40);
  assert.equal(result.dimMismatch!.overlapHeight, 40);
  // Overlap pixels are identical → score 1
  assert.equal(result.score, 1);
});

// ── compareImages: grid cells ─────────────────────────────────────────────────

test(`compareImages: returns exactly ${GRID_ROWS * GRID_COLS} cells`, () => {
  const img = uniformRgb(60, 60, 128, 128, 128);
  const result = compareImages(img, img);
  assert.equal(result.cells.length, GRID_ROWS * GRID_COLS);
});

test('compareImages: identical images → all cell mismatches are 0', () => {
  const img = uniformRgb(60, 60, 200, 100, 50);
  const result = compareImages(img, img);
  for (const cell of result.cells) {
    assert.equal(cell.mismatch, 0, `cell r${cell.row}c${cell.col} should be 0`);
  }
});

test('compareImages: completely different → all cell mismatches are 1', () => {
  const ref = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(60, 60, 255, 255, 255);
  const result = compareImages(ref, build);
  for (const cell of result.cells) {
    assert.equal(cell.mismatch, 1, `cell r${cell.row}c${cell.col} should be 1`);
  }
});

test('compareImages: cells have correct row/col indices', () => {
  const img = uniformRgb(60, 60, 0, 0, 0);
  const result = compareImages(img, img);
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = result.cells[row * GRID_COLS + col]!;
      assert.equal(cell.row, row);
      assert.equal(cell.col, col);
    }
  }
});

test('compareImages: cell x/y coordinates are non-overlapping and ordered', () => {
  const img = uniformRgb(60, 60, 0, 0, 0);
  const result = compareImages(img, img);

  // Each row's cells should have increasing x values
  for (let row = 0; row < GRID_ROWS; row++) {
    let prevXEnd = 0;
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = result.cells[row * GRID_COLS + col]!;
      assert.ok(cell.x >= prevXEnd, `r${row}c${col}: x=${cell.x} should be >= prevXEnd=${prevXEnd}`);
      prevXEnd = cell.x + cell.width;
    }
  }

  // Last column's x + width should reach the full image width (60)
  for (let row = 0; row < GRID_ROWS; row++) {
    const lastCell = result.cells[row * GRID_COLS + GRID_COLS - 1]!;
    assert.equal(lastCell.x + lastCell.width, 60, `row ${row}: last cell should reach width 60`);
  }
});

test('compareImages: top-half-changed localizes mismatch to top rows', () => {
  const size = 60;
  const ref = uniformRgb(size, size, 0, 0, 0);
  // Top 30 rows change drastically, bottom 30 are identical
  const build = splitRgb(size, size, 30, [255, 255, 255], [0, 0, 0]);
  const result = compareImages(ref, build);

  // Top-half cells (row 0–2) should have high mismatch; bottom half (row 3–5) near 0
  const topCells = result.cells.filter((c) => c.row < 3);
  const botCells = result.cells.filter((c) => c.row >= 3);

  for (const c of topCells) {
    assert.ok(c.mismatch > 0.9, `top cell r${c.row}c${c.col} mismatch=${c.mismatch} should be >0.9`);
  }
  for (const c of botCells) {
    assert.ok(c.mismatch < 0.1, `bot cell r${c.row}c${c.col} mismatch=${c.mismatch} should be <0.1`);
  }
});

// ── compareImages: small / edge images ───────────────────────────────────────

test('compareImages: 1×1 identical images → score 1', () => {
  const img = uniformRgb(1, 1, 128, 128, 128);
  const result = compareImages(img, img);
  assert.equal(result.score, 1);
  assert.equal(result.pass, true);
});

test('compareImages: 1×1 different images → score 0', () => {
  const ref = uniformRgb(1, 1, 0, 0, 0);
  const build = uniformRgb(1, 1, 255, 255, 255);
  const result = compareImages(ref, build);
  assert.equal(result.score, 0);
});

test('compareImages: image smaller than grid (6×6 grid on 3×3 image) does not throw', () => {
  const img = uniformRgb(3, 3, 100, 100, 100);
  assert.doesNotThrow(() => compareImages(img, img));
  const result = compareImages(img, img);
  assert.equal(result.score, 1);
});

// ── formatDiffReport ──────────────────────────────────────────────────────────

test('formatDiffReport: shows PASS for passing result', () => {
  const img = uniformRgb(60, 60, 100, 100, 100);
  const result = compareImages(img, img);
  const report = formatDiffReport(result);
  assert.match(report, /PASS/);
  assert.match(report, /100\.0%/); // score
});

test('formatDiffReport: shows FAIL for failing result', () => {
  const ref = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(60, 60, 255, 255, 255);
  const result = compareImages(ref, build);
  const report = formatDiffReport(result);
  assert.match(report, /FAIL/);
});

test('formatDiffReport: shows no-bad-cells message when score is perfect', () => {
  const img = uniformRgb(60, 60, 50, 50, 50);
  const result = compareImages(img, img);
  const report = formatDiffReport(result);
  assert.match(report, /no cells above 5%/);
});

test('formatDiffReport: lists bad cells with coordinate ranges', () => {
  // Make a result with known high-mismatch cells
  const ref = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(60, 60, 255, 255, 255);
  const result = compareImages(ref, build);
  const report = formatDiffReport(result);
  // Should mention row/col notation
  assert.match(report, /r\d+c\d+/);
  // Should mention x/y ranges
  assert.match(report, /x \d+–\d+/);
  assert.match(report, /y \d+–\d+/);
});

test('formatDiffReport: includes dimension mismatch line when dims differ', () => {
  const ref = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(80, 80, 0, 0, 0);
  const result = compareImages(ref, build);
  const report = formatDiffReport(result);
  assert.match(report, /dimension mismatch/);
  assert.match(report, /60×60/);
  assert.match(report, /80×80/);
});

test('formatDiffReport: does not include dimension mismatch when dims match', () => {
  const img = uniformRgb(60, 60, 0, 0, 0);
  const result = compareImages(img, img);
  const report = formatDiffReport(result);
  assert.ok(!report.includes('dimension mismatch'), 'should not mention dim mismatch');
});

test('formatDiffReport: bad cells sorted worst-first', () => {
  // Top 10 rows differ (big mismatch in top cells), bottom rows identical
  const ref = uniformRgb(60, 60, 0, 0, 0);
  const build = splitRgb(60, 60, 10, [255, 255, 255], [0, 0, 0]);
  const result = compareImages(ref, build);
  const report = formatDiffReport(result);
  // First bad cell listed should have higher mismatch than last
  const lines = report.split('\n').filter((l) => l.trim().startsWith('r'));
  if (lines.length >= 2) {
    const extractPct = (l: string): number => {
      const m = l.match(/([\d.]+)% mismatch/);
      return m ? parseFloat(m[1]!) : 0;
    };
    const first = extractPct(lines[0]!);
    const last = extractPct(lines[lines.length - 1]!);
    assert.ok(first >= last, `first cell mismatch (${first}%) should be >= last (${last}%)`);
  }
});

// ── DiffResult JSON shape (contract stability) ────────────────────────────────

test('compareImages: result has stable JSON contract fields', () => {
  const img = uniformRgb(60, 60, 100, 100, 100);
  const result = compareImages(img, img, 0.97);

  // Required top-level fields
  assert.equal(typeof result.score, 'number');
  assert.equal(typeof result.threshold, 'number');
  assert.equal(typeof result.pass, 'boolean');
  assert.ok(Array.isArray(result.cells));

  // Required cell fields
  const cell = result.cells[0]!;
  assert.equal(typeof cell.row, 'number');
  assert.equal(typeof cell.col, 'number');
  assert.equal(typeof cell.x, 'number');
  assert.equal(typeof cell.y, 'number');
  assert.equal(typeof cell.width, 'number');
  assert.equal(typeof cell.height, 'number');
  assert.equal(typeof cell.mismatch, 'number');
});

test('compareImages: dimMismatch field absent when dimensions match', () => {
  const img = uniformRgb(60, 60, 0, 0, 0);
  const result = compareImages(img, img);
  // Must not be present (not just undefined — strict contract)
  assert.ok(!('dimMismatch' in result) || result.dimMismatch === undefined);
});

test('compareImages: dimMismatch field present and complete when dimensions differ', () => {
  const ref = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(80, 90, 0, 0, 0);
  const result = compareImages(ref, build);
  assert.ok(result.dimMismatch !== undefined);
  const d = result.dimMismatch!;
  // All six fields present
  assert.equal(typeof d.refWidth, 'number');
  assert.equal(typeof d.refHeight, 'number');
  assert.equal(typeof d.buildWidth, 'number');
  assert.equal(typeof d.buildHeight, 'number');
  assert.equal(typeof d.overlapWidth, 'number');
  assert.equal(typeof d.overlapHeight, 'number');
});
