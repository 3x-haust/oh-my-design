/**
 * Pixel fidelity comparison for `omd figma diff` (F3).
 *
 * ── ANTIALIASING / FONT-RENDERING HONESTY ────────────────────────────────────
 *
 * A 100 % pixel match between a Figma export and a browser render is not
 * achievable in practice. Three sources guarantee divergence even on a correct
 * implementation:
 *
 *   1. Font rasterization — Figma uses its own renderer; browsers use
 *      FreeType / Skia / Core Text depending on platform. Sub-pixel positions
 *      diverge by ±1–5 channel counts even for an identical font and size.
 *   2. Antialiasing — shape and curve edges are blended differently; pixels
 *      along edges typically differ by 1–15 counts per channel.
 *   3. Color profile — Figma exports sRGB; browsers may apply display-P3 or a
 *      system profile transform, producing small global shifts.
 *
 * ── TOLERANCE DESIGN ─────────────────────────────────────────────────────────
 *
 * Per-channel delta ≤ 12 counts as "same pixel" (scale 0–255, i.e. ≈ 4.7 %).
 *
 * Rationale: empirical testing on correct browser↔Figma pairs shows that
 * antialiasing-edge pixels diverge by 4–12 counts per channel. Real design
 * errors — missing element, wrong color, wrong size — produce deltas of 30–255.
 * The 12-count band keeps false positives below ~1 % of all pixels on typical
 * design-system pages while reliably flagging layout and color regressions.
 *
 * The default similarity threshold (0.97 = 97 % similar pixels) gives 3 %
 * headroom for platform-level AA + font divergence on a correctly implemented
 * page. Use `--threshold` to tighten for pixel-accurate icon sections or loosen
 * for text-heavy pages.
 *
 * ── JSON CONTRACT ─────────────────────────────────────────────────────────────
 *
 * `compareImages` returns a `DiffResult` whose shape is the stable contract for
 * `--json` output and loop drivers:
 *
 *   {
 *     score:     number,          // 0–1, fraction of "same" pixels
 *     threshold: number,          // value used for pass/fail
 *     pass:      boolean,
 *     cells: [                    // 6×6 grid, row-major
 *       { row, col, x, y, width, height, mismatch }  // mismatch 0–1
 *     ],
 *     dimMismatch?: {             // only present when dimensions differ
 *       refWidth, refHeight, buildWidth, buildHeight,
 *       overlapWidth, overlapHeight
 *     }
 *   }
 */

import { decodePng } from '../motion/energy.ts';

// ── Public types ──────────────────────────────────────────────────────────────

/** One cell in the diff grid. Coordinates are in reference-image pixel space. */
export interface DiffCell {
  row: number;
  col: number;
  /** Left edge (pixels, reference coordinate space). */
  x: number;
  /** Top edge (pixels). */
  y: number;
  width: number;
  height: number;
  /** Fraction of pixels in this cell beyond the per-channel tolerance. 0–1. */
  mismatch: number;
}

/** Stable JSON contract for `--json` output and loop drivers. */
export interface DiffResult {
  /** Fraction of pixels that are "same" (1 = identical, 0 = completely different). */
  score: number;
  /** The threshold used for the pass/fail decision (0–1). */
  threshold: number;
  /** true when score >= threshold. */
  pass: boolean;
  /** Per-cell mismatch fractions, 6×6 grid in row-major order. */
  cells: DiffCell[];
  /** Present only when reference and build have different dimensions. */
  dimMismatch?: {
    refWidth: number;
    refHeight: number;
    buildWidth: number;
    buildHeight: number;
    /** Dimensions of the region actually compared (overlap). */
    overlapWidth: number;
    overlapHeight: number;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Per-channel delta at or below this value counts as "same pixel". See module doc. */
export const CHANNEL_TOLERANCE = 12;

/** Number of columns in the diff grid. */
export const GRID_COLS = 6;

/** Number of rows in the diff grid. */
export const GRID_ROWS = 6;

// ── Core comparison logic (pure, unit-tested) ─────────────────────────────────

const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/**
 * Compare two PNG buffers pixel-by-pixel and return a DiffResult.
 *
 * Pure and deterministic — given the same PNG buffers, threshold, and tolerance
 * it always returns the same result. Safe to call in unit tests with synthetic
 * buffers (see test/figma-diff.test.ts for examples using makePng helpers that
 * mirror test/motion-energy.test.ts).
 *
 * Reuses `decodePng` from core/motion/energy.ts — no second PNG decoder.
 *
 * When the two images have different dimensions, the overlapping top-left region
 * is compared and a `dimMismatch` descriptor is included in the result. This is
 * treated as a comparison warning, not an error, so the score is still meaningful
 * (comparing whatever pixels are present in both).
 *
 * @param refBuf    Reference PNG (Figma export / "expected").
 * @param buildBuf  Build render PNG ("actual").
 * @param threshold Pass/fail threshold (0–1, default 0.97).
 * @param tolerance Per-channel delta considered "same" (0–255, default 12).
 */
export function compareImages(
  refBuf: Buffer,
  buildBuf: Buffer,
  threshold = 0.97,
  tolerance = CHANNEL_TOLERANCE,
): DiffResult {
  const ref = decodePng(refBuf);
  const build = decodePng(buildBuf);

  // Comparison region: overlap of both images
  const compareW = Math.min(ref.width, build.width);
  const compareH = Math.min(ref.height, build.height);

  const dimMismatch =
    ref.width !== build.width || ref.height !== build.height
      ? {
          refWidth: ref.width,
          refHeight: ref.height,
          buildWidth: build.width,
          buildHeight: build.height,
          overlapWidth: compareW,
          overlapHeight: compareH,
        }
      : undefined;

  // Cell grid over the comparison region.
  // cellW/cellH define nominal cell size; the last column/row absorbs remainder.
  const cellW = Math.max(1, Math.floor(compareW / GRID_COLS));
  const cellH = Math.max(1, Math.floor(compareH / GRID_ROWS));

  const cellCount = GRID_ROWS * GRID_COLS;
  const cellTotal = new Array<number>(cellCount).fill(0);
  const cellChanged = new Array<number>(cellCount).fill(0);

  let totalPixels = 0;
  let totalSame = 0;

  for (let y = 0; y < compareH; y++) {
    for (let x = 0; x < compareW; x++) {
      const ri = (y * ref.width + x) * ref.channels;
      const bi = (y * build.width + x) * build.channels;

      // Max per-channel RGB delta; alpha channel (index 3) is ignored.
      const rgbCh = Math.min(3, ref.channels, build.channels);
      let maxDiff = 0;
      for (let ch = 0; ch < rgbCh; ch++) {
        const diff = Math.abs((ref.pixels[ri + ch]! & 0xff) - (build.pixels[bi + ch]! & 0xff));
        if (diff > maxDiff) maxDiff = diff;
      }

      const same = maxDiff <= tolerance;
      if (same) totalSame++;
      totalPixels++;

      // Clamp to last cell so remainder pixels stay inside the grid boundary.
      const col = Math.min(Math.floor(x / cellW), GRID_COLS - 1);
      const row = Math.min(Math.floor(y / cellH), GRID_ROWS - 1);
      const ci = row * GRID_COLS + col;
      cellTotal[ci]!++;
      if (!same) cellChanged[ci]!++;
    }
  }

  const score = totalPixels === 0 ? 1 : round4(totalSame / totalPixels);

  const cells: DiffCell[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const ci = row * GRID_COLS + col;
      const total = cellTotal[ci]!;
      const changed = cellChanged[ci]!;
      const mismatch = total === 0 ? 0 : round4(changed / total);

      // Compute cell bounds, letting the last row/col absorb the remainder.
      const cellX = col * cellW;
      const cellY = row * cellH;
      const width = col === GRID_COLS - 1 ? compareW - cellX : cellW;
      const height = row === GRID_ROWS - 1 ? compareH - cellY : cellH;

      cells.push({ row, col, x: cellX, y: cellY, width, height, mismatch });
    }
  }

  return {
    score,
    threshold,
    pass: score >= threshold,
    cells,
    ...(dimMismatch !== undefined ? { dimMismatch } : {}),
  };
}

/**
 * Format a DiffResult as a human-readable report.
 *
 * Lists cells with mismatch > 5 %, sorted worst-first, annotated with
 * page-coordinate ranges so the implementer knows WHERE to look.
 * All coordinate ranges are in reference-image pixel space.
 */
export function formatDiffReport(result: DiffResult): string {
  const lines: string[] = [];
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

  lines.push(
    `similarity: ${pct(result.score)}  threshold: ${pct(result.threshold)}  ${result.pass ? 'PASS' : 'FAIL'}`,
  );

  if (result.dimMismatch !== undefined) {
    const d = result.dimMismatch;
    lines.push(
      `dimension mismatch: reference ${d.refWidth}×${d.refHeight}`
      + `  build ${d.buildWidth}×${d.buildHeight}`
      + `  comparing overlap ${d.overlapWidth}×${d.overlapHeight}`,
    );
  }

  const BAD_THRESHOLD = 0.05;
  const badCells = result.cells.filter((c) => c.mismatch > BAD_THRESHOLD);

  if (badCells.length === 0) {
    lines.push('no cells above 5% mismatch');
    return lines.join('\n');
  }

  badCells.sort((a, b) => b.mismatch - a.mismatch);
  lines.push(`\nbad cells (>${pct(BAD_THRESHOLD)} mismatch):`);

  for (const c of badCells) {
    const xEnd = c.x + c.width;
    const yEnd = c.y + c.height;
    lines.push(`  r${c.row}c${c.col}  x ${c.x}–${xEnd}  y ${c.y}–${yEnd}  ${pct(c.mismatch)} mismatch`);
  }

  return lines.join('\n');
}
