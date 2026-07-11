import { inflateSync } from 'node:zlib';
import type { EnergyCurve, FrameEnergy } from '../types.ts';

// ── Minimal PNG decoder ──────────────────────────────────────────────────────
//
// Playwright viewport screenshots are always non-interlaced 8-bit RGB (color type 2)
// or RGBA (color type 6). This narrow scope — four filter equations plus zlib inflate —
// handles that exact case in ~80 lines without a pngjs dependency.
//
// Interlaced PNGs, palette PNGs, and bit depths other than 8 throw immediately.
// Those formats never appear in Playwright output; if one did, the caller's try/catch
// turns the failure into a null result rather than breaking capture.

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode an 8-bit RGB or RGBA PNG buffer into a flat pixel array.
 *
 * Supports color types 2 (RGB) and 6 (RGBA), bit depth 8, non-interlaced only —
 * exactly what Playwright viewport screenshots produce.
 */
export function decodePng(data: Buffer): {
  width: number;
  height: number;
  pixels: Uint8Array;
  channels: number;
} {
  for (let i = 0; i < 8; i++) {
    if (data[i] !== PNG_SIG[i]) throw new Error('not a PNG: bad signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 12 <= data.length) {
    const chunkLen = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('ascii');
    const chunk = data.subarray(offset + 8, offset + 8 + chunkLen);
    offset += 12 + chunkLen; // length(4) + type(4) + data(N) + crc(4)

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const bitDepth = chunk[8]!;
      const colorType = chunk[9]!;
      const interlace = chunk[12]!;
      if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth: ${bitDepth} (only 8 supported)`);
      if (colorType === 2) channels = 3;
      else if (colorType === 6) channels = 4;
      else throw new Error(`unsupported PNG color type: ${colorType} (only RGB=2 and RGBA=6 supported)`);
      if (interlace !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idatChunks.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (width === 0 || height === 0 || channels === 0) {
    throw new Error('PNG IHDR not found or has zero dimensions');
  }

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * channels);
  let srcOff = 0;

  for (let y = 0; y < height; y++) {
    const filterType = raw[srcOff++]!;
    const dstRow = y * stride;

    for (let x = 0; x < stride; x++) {
      const rawVal = raw[srcOff + x]! & 0xff;
      const a = x >= channels ? pixels[dstRow + x - channels]! : 0;
      const b = y > 0 ? pixels[dstRow - stride + x]! : 0;
      const c = (x >= channels && y > 0) ? pixels[dstRow - stride + x - channels]! : 0;

      let val: number;
      switch (filterType) {
        case 0: val = rawVal; break;                                            // None
        case 1: val = (rawVal + a) & 0xff; break;                              // Sub
        case 2: val = (rawVal + b) & 0xff; break;                              // Up
        case 3: val = (rawVal + Math.floor((a + b) / 2)) & 0xff; break;        // Average
        case 4: val = (rawVal + paethPredictor(a, b, c)) & 0xff; break;        // Paeth
        default: throw new Error(`unknown PNG filter type: ${filterType}`);
      }
      pixels[dstRow + x] = val;
    }
    srcOff += stride;
  }

  return { width, height, pixels, channels };
}

const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/**
 * Compute per-interval pixel-difference energy from a sequence of PNG frame buffers.
 *
 * Energy = fraction of pixels whose max per-channel RGB difference exceeds
 * `diffThreshold` (default 10, scale 0–255). Alpha is ignored — only the visible RGB
 * signal is compared.
 *
 * Region summary: the frame is split into three equal vertical thirds (top / mid / bottom).
 * `regionFractions[i]` is the fraction of that third's pixels that changed — answering
 * "where did the motion happen" without requiring layout data.
 *
 * IMPORTANT: this function sees ALL pixel-level motion, including GSAP and rAF-driven
 * libraries that `document.getAnimations()` cannot detect. Where
 * `ir.meta.motion.animatedProperties` may read as [] for a GSAP-only page, a non-zero
 * energy curve confirms motion occurred — closing the getAnimations() blind spot documented
 * on MotionMeasurement and Invariants.animatedProperties.
 *
 * Pure and deterministic: given the same PNG buffers and threshold it always returns the
 * same result. Safe to call in unit tests with synthetic buffers.
 *
 * @param buffers   Ordered PNG buffers, earliest frame first. Fewer than 2 → empty pairs.
 * @param diffThreshold  Per-channel difference threshold (0–255, default 10).
 */
export function computeEnergy(buffers: Buffer[], diffThreshold = 10): EnergyCurve {
  const frames = buffers.map((b) => decodePng(b));
  const pairs: FrameEnergy[] = [];

  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i]!;
    const b = frames[i + 1]!;

    // Dimension mismatch: treat as fully changed (conservative, not a normal case).
    if (a.width !== b.width || a.height !== b.height) {
      pairs.push({ pairIndex: i, changedFraction: 1, regionFractions: [1, 1, 1] });
      continue;
    }

    const { width, height, channels } = a;
    const totalPixels = width * height;
    const thirdH = Math.floor(height / 3);
    // Bottom region absorbs any remainder from the floor.
    const regionTotal = [thirdH * width, thirdH * width, (height - 2 * thirdH) * width];
    const regionChanged = [0, 0, 0];
    let totalChanged = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        let maxDiff = 0;
        // Compare RGB channels only — ignore alpha (channel index 3) even if present.
        const rgbChannels = Math.min(3, channels);
        for (let ch = 0; ch < rgbChannels; ch++) {
          const diff = Math.abs((a.pixels[idx + ch]! & 0xff) - (b.pixels[idx + ch]! & 0xff));
          if (diff > maxDiff) maxDiff = diff;
        }
        if (maxDiff > diffThreshold) {
          totalChanged++;
          const region = y < thirdH ? 0 : y < thirdH * 2 ? 1 : 2;
          regionChanged[region]!++;
        }
      }
    }

    const changedFraction = round4(totalChanged / Math.max(totalPixels, 1));
    const regionFractions: [number, number, number] = [
      round4(regionChanged[0]! / Math.max(regionTotal[0]!, 1)),
      round4(regionChanged[1]! / Math.max(regionTotal[1]!, 1)),
      round4(regionChanged[2]! / Math.max(regionTotal[2]!, 1)),
    ];

    pairs.push({ pairIndex: i, changedFraction, regionFractions });
  }

  const peakEnergy = pairs.length > 0
    ? round4(Math.max(...pairs.map((p) => p.changedFraction)))
    : 0;

  return { frames: buffers.length, pairs, peakEnergy };
}
