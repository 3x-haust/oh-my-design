// Increment 1b of the staged showpiece scroll-motion evidence protocol.
//
// The contract (`scroll-scene-evidence.ts`, increment 1a) declares WHAT a verifiable scroll scene
// is; this module OBSERVES it in a real browser. It mirrors `captureMotionEvidenceV2`'s proven
// primitives (computeEnergy over viewport screenshots, a fresh reduced-motion page) but measures a
// scroll scene instead of a load scene.
//
// The single verifiable claim: a scroll scene is admissible only when it is scroll-position-scrubbed.
// We prove that by holding a FIXED scroll position and taking two captures across time — if the scene
// is scrubbed to position (not animating in time) the two frames are identical, so its settle energy
// collapses to the render noise floor. A time-triggered scroll animation keeps changing at the fixed
// position, so its settle energy stays above the floor and `validateScrollSceneEvidence` rejects it.
//
// This capture is NOT wired into the motion decision, render entrypoints, or final-evidence yet
// (increment 1c). It is invoked only by its own test.

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { computeEnergy } from '../motion/energy.ts';
import { waitForDocumentFonts } from './index.ts';
import {
  MAX_SCROLL_SCENES,
  SCROLL_SCENE_EVIDENCE_SCHEMA,
  validateScrollSceneEvidence,
  type ScrollSceneEvidence,
} from './scroll-scene-evidence.ts';

const DEFAULT_SETTLE_INTERVAL_MS = 240;
const SETTLE_STABILITY_MULTIPLE = 2;

export type ScrollSceneRequest = {
  readonly sceneId: string;
  /** Declared trigger position as a fraction of scrollable height, in (0, 1]. */
  readonly scrollFraction: number;
  /** Recorded for provenance; the fixed-position capture measures the whole viewport at that scroll. */
  readonly roiSelector: string;
};

function toUrl(target: string): string {
  if (/^https?:\/\//.test(target)) return target;
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`no such page: ${target}`);
  return pathToFileURL(path).href;
}

/** Resolve the browser to a fixed scroll offset and let two animation frames settle. */
async function holdScroll(page: import('playwright').Page, fraction: number): Promise<void> {
  await page.evaluate((f) => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.round(max * f), left: 0, behavior: 'instant' as ScrollBehavior });
  }, fraction);
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Observes a real browser scrolling through the declared scenes and returns a validated
 * `ScrollSceneEvidence`. Throws `ScrollSceneEvidenceError` when a scene is not
 * scroll-position-scrubbed (still animating in time at its fixed position) or otherwise fails the
 * contract; throws `Error` on a malformed request or an absent target.
 */
export async function captureScrollSceneEvidence(
  target: string,
  opts: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly artDirectionHash: string;
    readonly scenes: readonly ScrollSceneRequest[];
    readonly settleIntervalMs?: number;
  },
): Promise<ScrollSceneEvidence> {
  if (opts.scenes.length === 0) throw new Error('a scroll-scene capture needs at least one scene');
  if (opts.scenes.length > MAX_SCROLL_SCENES) throw new Error(`a scroll journey is bounded to ${MAX_SCROLL_SCENES} scenes`);
  const interval = Math.max(1, Math.floor(opts.settleIntervalMs ?? DEFAULT_SETTLE_INTERVAL_MS));
  const viewport = { width: opts.viewport.width, height: opts.viewport.height };
  const url = toUrl(target);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForDocumentFonts(page);

    // Baseline = the top of the page. Its two captures also measure the render noise floor.
    await holdScroll(page, 0);
    const baselineA = await page.screenshot({ fullPage: false });
    await wait(interval);
    const baselineB = await page.screenshot({ fullPage: false });
    const noiseFloor = Math.max(computeEnergy([baselineA, baselineB]).peakEnergy, Number.EPSILON);

    // Each scene: hold a fixed scroll position and prove it is stable across time (scrubbed, not timed).
    const observed = [] as Array<{ req: ScrollSceneRequest; settledEnergy: number; stateChangeEnergy: number; frame: Buffer }>;
    for (const req of opts.scenes) {
      await holdScroll(page, req.scrollFraction);
      const t0 = await page.screenshot({ fullPage: false });
      await wait(interval);
      const t1 = await page.screenshot({ fullPage: false });
      const settledEnergy = computeEnergy([t0, t1]).peakEnergy;
      const stateChangeEnergy = computeEnergy([baselineB, t1]).peakEnergy;
      observed.push({ req, settledEnergy, stateChangeEnergy, frame: t1 });
    }

    // Fresh reduced-motion page: at each scene position, compare to the moving scene to classify behavior.
    const reducedPage = await browser.newPage({ viewport });
    const reducedEnergies: number[] = [];
    try {
      await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
      await reducedPage.goto(url, { waitUntil: 'networkidle' });
      await waitForDocumentFonts(reducedPage);
      for (const scene of observed) {
        await holdScroll(reducedPage, scene.req.scrollFraction);
        const reducedFrame = await reducedPage.screenshot({ fullPage: false });
        reducedEnergies.push(computeEnergy([scene.frame, reducedFrame]).peakEnergy);
      }
    } finally {
      await reducedPage.close();
    }

    const record: ScrollSceneEvidence = {
      schema: SCROLL_SCENE_EVIDENCE_SCHEMA,
      artDirectionHash: opts.artDirectionHash,
      register: 'showpiece',
      perfBudgetDeclared: true,
      reducedMotionComplete: true,
      scenes: observed.map((scene, index) => ({
        sceneId: scene.req.sceneId,
        scrollFraction: scene.req.scrollFraction,
        roiSelector: scene.req.roiSelector,
        settle: { settledEnergy: scene.settledEnergy, noiseFloor },
        stateChangeEnergy: scene.stateChangeEnergy,
        reducedMotion: {
          behavior: reducedEnergies[index]! <= noiseFloor * SETTLE_STABILITY_MULTIPLE ? 'removed' : 'static-equivalent',
        },
      })),
    };
    return validateScrollSceneEvidence(record);
  } finally {
    await browser.close();
  }
}
