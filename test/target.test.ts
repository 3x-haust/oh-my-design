/**
 * Tests for core/target/index.ts — RE-C visual target loop.
 *
 * All comparison tests use synthetic PNG buffers built with the same helpers
 * as test/figma-diff.test.ts and test/motion-energy.test.ts.
 * No network, no browser, no filesystem side-effects in pure comparison tests.
 *
 * The plumbing tests (register / list / find) write to a temp directory inside
 * the test scratchpad; they clean up on exit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  compareAgainstTarget,
  formatDiffReport,
  compareImages,
  registerTarget,
  listTargets,
  findTarget,
  safeName,
} from '../core/target/index.ts';

// ── PNG creation helpers (mirrors test/figma-diff.test.ts) ────────────────────

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

function makePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 3;
  const rawRows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawRows[y * (stride + 1)] = 0;
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

function uniformRgb(width: number, height: number, r: number, g: number, b: number): Buffer {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = r;
    pixels[i * 3 + 1] = g;
    pixels[i * 3 + 2] = b;
  }
  return makePng(width, height, pixels);
}

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
      pixels[i] = r!; pixels[i + 1] = g!; pixels[i + 2] = b!;
    }
  }
  return makePng(width, height, pixels);
}

// ── compareAgainstTarget: pure comparison delegation ──────────────────────────

test('compareAgainstTarget: identical images → score 1, pass true', () => {
  const img = uniformRgb(60, 60, 100, 150, 200);
  const result = compareAgainstTarget(img, img);
  assert.equal(result.score, 1);
  assert.equal(result.pass, true);
  assert.equal(result.threshold, 0.97);
});

test('compareAgainstTarget: completely different images → score 0, pass false', () => {
  const target = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(60, 60, 255, 255, 255);
  const result = compareAgainstTarget(target, build);
  assert.equal(result.score, 0);
  assert.equal(result.pass, false);
});

test('compareAgainstTarget: top half changed → score ≈ 0.5', () => {
  const size = 60;
  const target = uniformRgb(size, size, 0, 0, 0);
  const build = splitRgb(size, size, size / 2, [200, 200, 200], [0, 0, 0]);
  const result = compareAgainstTarget(target, build);
  assert.ok(result.score >= 0.49 && result.score <= 0.51, `expected ~0.5, got ${result.score}`);
  assert.equal(result.pass, false);
});

test('compareAgainstTarget: custom threshold respected', () => {
  const target = uniformRgb(60, 60, 0, 0, 0);
  const build = splitRgb(60, 60, 3, [200, 200, 200], [0, 0, 0]);
  // 3/60 = 5% changed → score ≈ 0.95
  const at95 = compareAgainstTarget(target, build, 0.95);
  const at97 = compareAgainstTarget(target, build, 0.97);
  assert.equal(at95.pass, true,  `score=${at95.score} should pass at 0.95`);
  assert.equal(at97.pass, false, `score=${at97.score} should fail at 0.97`);
});

test('compareAgainstTarget: threshold stored in result', () => {
  const img = uniformRgb(10, 10, 0, 0, 0);
  const result = compareAgainstTarget(img, img, 0.85);
  assert.equal(result.threshold, 0.85);
});

test('compareAgainstTarget: dimension mismatch → dimMismatch reported', () => {
  const target = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(80, 80, 0, 0, 0);
  const result = compareAgainstTarget(target, build);
  assert.ok(result.dimMismatch !== undefined);
  assert.equal(result.dimMismatch!.refWidth, 60);
  assert.equal(result.dimMismatch!.buildWidth, 80);
});

test('compareAgainstTarget: result has stable JSON contract fields', () => {
  const img = uniformRgb(60, 60, 100, 100, 100);
  const result = compareAgainstTarget(img, img);
  assert.equal(typeof result.score, 'number');
  assert.equal(typeof result.threshold, 'number');
  assert.equal(typeof result.pass, 'boolean');
  assert.ok(Array.isArray(result.cells));
  const cell = result.cells[0]!;
  assert.equal(typeof cell.row, 'number');
  assert.equal(typeof cell.col, 'number');
  assert.equal(typeof cell.x, 'number');
  assert.equal(typeof cell.y, 'number');
  assert.equal(typeof cell.width, 'number');
  assert.equal(typeof cell.height, 'number');
  assert.equal(typeof cell.mismatch, 'number');
});

// ── compareAgainstTarget vs compareImages: identical behaviour ─────────────────

test('compareAgainstTarget gives bit-identical result to compareImages', () => {
  const target = uniformRgb(60, 60, 0, 0, 0);
  const build = splitRgb(60, 60, 10, [255, 255, 255], [0, 0, 0]);
  const via_target = compareAgainstTarget(target, build, 0.97);
  const via_images = compareImages(target, build, 0.97);
  assert.equal(via_target.score, via_images.score);
  assert.equal(via_target.pass, via_images.pass);
  assert.equal(via_target.cells.length, via_images.cells.length);
  for (let i = 0; i < via_target.cells.length; i++) {
    assert.equal(via_target.cells[i]!.mismatch, via_images.cells[i]!.mismatch);
  }
});

test('compareAgainstTarget: identical images → all cell mismatches are 0', () => {
  const img = uniformRgb(60, 60, 200, 100, 50);
  const result = compareAgainstTarget(img, img);
  for (const cell of result.cells) {
    assert.equal(cell.mismatch, 0, `cell r${cell.row}c${cell.col} should be 0`);
  }
});

test('compareAgainstTarget: completely different → all cell mismatches are 1', () => {
  const target = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(60, 60, 255, 255, 255);
  const result = compareAgainstTarget(target, build);
  for (const cell of result.cells) {
    assert.equal(cell.mismatch, 1, `cell r${cell.row}c${cell.col} should be 1`);
  }
});

// ── formatDiffReport (re-exported from figma/diff.ts) ─────────────────────────

test('formatDiffReport re-export: shows PASS for passing result', () => {
  const img = uniformRgb(60, 60, 100, 100, 100);
  const result = compareAgainstTarget(img, img);
  const report = formatDiffReport(result);
  assert.match(report, /PASS/);
});

test('formatDiffReport re-export: shows FAIL for failing result', () => {
  const target = uniformRgb(60, 60, 0, 0, 0);
  const build = uniformRgb(60, 60, 255, 255, 255);
  const result = compareAgainstTarget(target, build);
  const report = formatDiffReport(result);
  assert.match(report, /FAIL/);
  assert.match(report, /r\d+c\d+/);
});

// ── safeName ──────────────────────────────────────────────────────────────────

test('safeName: alphanumeric name passes through unchanged', () => {
  assert.equal(safeName('hero'), 'hero');
  assert.equal(safeName('hero-v2'), 'hero-v2');
  assert.equal(safeName('hero.png'), 'hero.png');
});

test('safeName: special characters are replaced with underscores', () => {
  assert.equal(safeName('hero image'), 'hero_image');
  assert.equal(safeName('hero/mockup'), 'hero_mockup');
  assert.equal(safeName('hero@2x'), 'hero_2x');
});

// ── registerTarget / listTargets / findTarget plumbing ────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'omd-target-test-'));
}

test('registerTarget: creates .omd/target/<name>.png and manifest', () => {
  const cwd = makeTempDir();
  try {
    const img = uniformRgb(120, 80, 255, 0, 0);
    const entry = registerTarget(cwd, 'hero', 'file:///mock.png', img);

    assert.equal(entry.name, 'hero');
    assert.equal(entry.source, 'file:///mock.png');
    assert.equal(entry.viewport.width, 120);
    assert.equal(entry.viewport.height, 80);
    assert.ok(entry.path.endsWith('hero.png'));
    assert.ok(entry.registeredAt.length > 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('registerTarget: decodes viewport dimensions from the PNG', () => {
  const cwd = makeTempDir();
  try {
    const img = uniformRgb(1280, 800, 0, 128, 255);
    const entry = registerTarget(cwd, 'desktop', 'https://example.com/mock.png', img);
    assert.equal(entry.viewport.width, 1280);
    assert.equal(entry.viewport.height, 800);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('registerTarget: upserts when same name registered twice', () => {
  const cwd = makeTempDir();
  try {
    const img1 = uniformRgb(100, 100, 255, 0, 0);
    const img2 = uniformRgb(200, 150, 0, 255, 0);
    registerTarget(cwd, 'hero', 'source1.png', img1);
    registerTarget(cwd, 'hero', 'source2.png', img2);

    const targets = listTargets(cwd);
    assert.equal(targets.length, 1, 'upsert should not create a duplicate');
    assert.equal(targets[0]!.source, 'source2.png', 'second register should overwrite');
    assert.equal(targets[0]!.viewport.width, 200);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('listTargets: returns empty array when no manifest exists', () => {
  const cwd = makeTempDir();
  try {
    const targets = listTargets(cwd);
    assert.deepEqual(targets, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('listTargets: returns all registered targets in insertion order', () => {
  const cwd = makeTempDir();
  try {
    registerTarget(cwd, 'hero', 'a.png', uniformRgb(10, 10, 255, 0, 0));
    registerTarget(cwd, 'mobile', 'b.png', uniformRgb(20, 20, 0, 255, 0));
    registerTarget(cwd, 'tablet', 'c.png', uniformRgb(30, 30, 0, 0, 255));

    const targets = listTargets(cwd);
    assert.equal(targets.length, 3);
    assert.equal(targets[0]!.name, 'hero');
    assert.equal(targets[1]!.name, 'mobile');
    assert.equal(targets[2]!.name, 'tablet');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('findTarget: returns the matching entry by name', () => {
  const cwd = makeTempDir();
  try {
    registerTarget(cwd, 'hero', 'a.png', uniformRgb(10, 10, 255, 0, 0));
    registerTarget(cwd, 'mobile', 'b.png', uniformRgb(20, 20, 0, 255, 0));

    const found = findTarget(cwd, 'mobile');
    assert.ok(found !== undefined);
    assert.equal(found!.name, 'mobile');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('findTarget: returns undefined when name not found', () => {
  const cwd = makeTempDir();
  try {
    registerTarget(cwd, 'hero', 'a.png', uniformRgb(10, 10, 0, 0, 0));
    const found = findTarget(cwd, 'nonexistent');
    assert.equal(found, undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('registerTarget: name with special chars uses safe filename but preserves name field', () => {
  const cwd = makeTempDir();
  try {
    const img = uniformRgb(100, 100, 0, 0, 0);
    const entry = registerTarget(cwd, 'hero mockup', 'a.png', img);
    assert.equal(entry.name, 'hero mockup', 'name field preserves original');
    assert.ok(entry.path.includes('hero_mockup'), 'file path uses safe name');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ── threshold / exit-code semantics (via compareAgainstTarget) ────────────────

test('compareAgainstTarget: default threshold is 0.97', () => {
  const img = uniformRgb(10, 10, 0, 0, 0);
  const result = compareAgainstTarget(img, img);
  assert.equal(result.threshold, 0.97);
});

test('compareAgainstTarget: score 1 passes any threshold ≤ 1', () => {
  const img = uniformRgb(10, 10, 128, 128, 128);
  for (const t of [0.0, 0.5, 0.97, 1.0]) {
    const r = compareAgainstTarget(img, img, t);
    assert.equal(r.pass, true, `score 1 should pass at threshold ${t}`);
  }
});

test('compareAgainstTarget: score 0 fails any threshold > 0', () => {
  const target = uniformRgb(10, 10, 0, 0, 0);
  const build = uniformRgb(10, 10, 255, 255, 255);
  for (const t of [0.01, 0.5, 0.97, 1.0]) {
    const r = compareAgainstTarget(target, build, t);
    assert.equal(r.pass, false, `score 0 should fail at threshold ${t}`);
  }
});

test('compareAgainstTarget: boundary — failing every threshold scores 0', () => {
  const target = uniformRgb(4, 4, 0, 0, 0);
  const build = uniformRgb(4, 4, 255, 0, 0); // max diff on one channel
  const r = compareAgainstTarget(target, build);
  assert.equal(r.score, 0);
  assert.equal(r.pass, false);
});
