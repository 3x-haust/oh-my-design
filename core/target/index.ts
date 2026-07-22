/**
 * Visual target loop — RE-C (일반 시각 타깃 루프).
 *
 * Generalises the Figma pixel-diff loop to work against ANY image reference —
 * a mockup, a screenshot, a live-URL render — so "make it look like this picture"
 * becomes a measured convergence loop.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────
 *
 * An LLM judges spatial layout poorly by eye. Telling a model "make the hero taller"
 * or "the padding looks off" requires the model to estimate pixel distances from
 * a render it has never measured. The pixel diff replaces that eyeballing with
 * numbers: a score (0–1), a pass/fail decision at a threshold, and a 6×6 grid
 * that names the worst-mismatch cells so each iteration targets a specific region
 * rather than re-guessing the whole layout.
 *
 * ── REUSE ───────────────────────────────────────────────────────────────────────
 *
 * This module reuses two existing in-repo primitives:
 *
 *   - `compareImages` from `core/figma/diff.ts`   — diff math + grid logic
 *   - `formatDiffReport` from `core/figma/diff.ts` — human-readable grid report
 *   - `decodePng` from `core/motion/energy.ts`     — PNG decoder (no new dep)
 *
 * The `DiffResult` / `DiffCell` types are re-exported so callers never depend on
 * the figma module path directly.
 *
 * ── JSON CONTRACT ────────────────────────────────────────────────────────────────
 *
 * `compareAgainstTarget` returns the same `DiffResult` shape as `compareImages`
 * so `--json` output and loop drivers work identically for both figma diff and
 * target diff:
 *
 *   {
 *     score:     number,          // 0–1, fraction of "same" pixels
 *     threshold: number,
 *     pass:      boolean,
 *     cells: [{ row, col, x, y, width, height, mismatch }],
 *     dimMismatch?: { refWidth, refHeight, buildWidth, buildHeight,
 *                     overlapWidth, overlapHeight }
 *   }
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from '../motion/energy.ts';
import { compareImages, formatDiffReport } from '../figma/diff.ts';
import { type ProjectWriteAdapter, requireProjectWriteAdapter } from '../runtime/project-write.ts';

// ── Re-exports (stable contract) ─────────────────────────────────────────────

export type { DiffResult, DiffCell } from '../figma/diff.ts';
export { compareImages, formatDiffReport } from '../figma/diff.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TargetViewport {
  width: number;
  height: number;
}

/** One entry in the target manifest. */
export interface TargetEntry {
  /** Human-readable name used with `--target <name>`. */
  name: string;
  /** Original source: a file path or a URL. */
  source: string;
  /** Absolute path to the stored PNG inside `.omd/target/`. */
  path: string;
  /** Dimensions decoded from the target PNG — used as the render viewport. */
  viewport: TargetViewport;
  registeredAt: string;
}

interface TargetManifest {
  targets: TargetEntry[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function targetDir(cwd: string): string {
  return join(cwd, '.omd', 'target');
}

function manifestPath(cwd: string): string {
  return join(targetDir(cwd), 'manifest.json');
}

function loadManifest(cwd: string): TargetManifest {
  const p = manifestPath(cwd);
  if (!existsSync(p)) return { targets: [] };
  return JSON.parse(readFileSync(p, 'utf8')) as TargetManifest;
}

function saveManifest(cwd: string, manifest: TargetManifest, adapter: ProjectWriteAdapter): void {
  requireProjectWriteAdapter(cwd, adapter)
    .write('.omd/target/manifest.json', JSON.stringify(manifest, null, 2));
}

/** Sanitise a target name into a safe file basename. */
export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a PNG buffer as a named visual target.
 *
 * Decodes the buffer to read its dimensions (the intended render viewport),
 * writes the PNG to `.omd/target/<safeName>.png`, and upserts the manifest.
 *
 * @param cwd    Project working directory (`.omd/` is created here).
 * @param name   Human-readable target name (used with `--target <name>`).
 * @param source Original source identifier (URL or file path) — stored for reference.
 * @param buf    Valid PNG buffer.
 */
export function registerTarget(
  cwd: string,
  name: string,
  source: string,
  buf: Buffer,
  adapter: ProjectWriteAdapter,
): TargetEntry {
  const writer = requireProjectWriteAdapter(cwd, adapter);
  const pngPath = writer.write(`.omd/target/${safeName(name)}.png`, buf);

  // Decode to get dimensions — decodePng from core/motion/energy.ts, no new dep.
  const { width, height } = decodePng(buf);

  const entry: TargetEntry = {
    name,
    source,
    path: pngPath,
    viewport: { width, height },
    registeredAt: new Date().toISOString(),
  };

  const manifest = loadManifest(cwd);
  const idx = manifest.targets.findIndex((t) => t.name === name);
  if (idx >= 0) {
    manifest.targets[idx] = entry;
  } else {
    manifest.targets.push(entry);
  }
  saveManifest(cwd, manifest, writer);

  return entry;
}

/** Return all registered targets for the project at `cwd`. */
export function listTargets(cwd: string): TargetEntry[] {
  return loadManifest(cwd).targets;
}

/**
 * Look up one registered target by name.
 * Returns `undefined` when no target with that name has been registered.
 */
export function findTarget(cwd: string, name: string): TargetEntry | undefined {
  return loadManifest(cwd).targets.find((t) => t.name === name);
}

/**
 * Compare a build PNG buffer against a target PNG buffer.
 *
 * Pure wrapper around `compareImages` from `core/figma/diff.ts` — same
 * algorithm, same JSON contract, same tolerance constants. The `DiffResult`
 * returned here is bitwise-identical to what `omd figma diff` would produce
 * for the same pair of images.
 *
 * @param targetBuf  Reference PNG (the registered visual target).
 * @param buildBuf   Build render PNG (the "actual" to be improved).
 * @param threshold  Pass/fail threshold (0–1, default 0.97).
 */
export function compareAgainstTarget(
  targetBuf: Buffer,
  buildBuf: Buffer,
  threshold = 0.97,
): ReturnType<typeof compareImages> {
  return compareImages(targetBuf, buildBuf, threshold);
}
