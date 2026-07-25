// Produces a `reference-craft-v1` record from real-browser OBSERVATION, so a craft signature is
// measured, never hand-asserted. It mirrors the scroll-scene capture's proven primitives
// (`computeEnergy` over viewport screenshots, `waitForDocumentFonts`, a fresh reduced-motion page)
// but measures the two things role ② craft is about:
//
//   1. does the part MOVE — peak pixel-energy over time at load, and over time right after the part
//      is scrolled into view (a reveal-on-entry animation still resolving);
//   2. is it SCROLL-LINKED — either the part (or a descendant) drives a CSS scroll timeline
//      (`animation-timeline: scroll()/view()`), or scrolling it into view produced reveal energy.
//
// It also records whether the part keeps a baseline under reduced motion (content present). The
// result is a validated `reference-craft-v1`; `verifyCraftReproduction` then gates a build against it.

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { computeEnergy } from '../motion/energy.ts';
import { waitForDocumentFonts } from '../render/index.ts';
import {
  CRAFT_ENERGY_FLOOR,
  REFERENCE_CRAFT_SCHEMA,
  validateReferenceCraft,
  type ReferenceCraft,
} from './reference-craft.ts';

const DEFAULT_SETTLE_INTERVAL_MS = 240;

export type ReferenceCraftCaptureOptions = {
  /** Sanitized reference id / source recorded on the result. */
  readonly source: string;
  /** Slug the reference is filed under. */
  readonly as: string;
  /** The named technique observed (the scout names what it is capturing). */
  readonly technique: string;
  readonly viewport: { readonly width: number; readonly height: number };
  /** CSS selector scoping the captured part; when absent the whole document is measured. */
  readonly selector?: string | null;
  readonly settleIntervalMs?: number;
};

function toUrl(target: string): string {
  if (/^https?:\/\//.test(target)) return target;
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`no such page: ${target}`);
  return pathToFileURL(path).href;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Two animation frames so a scroll or reveal settles before a capture. */
async function settleFrames(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/** True when the scoped subtree (or the document) drives a CSS scroll/view timeline. */
async function usesScrollTimeline(page: import('playwright').Page, selector: string | null): Promise<boolean> {
  return page.evaluate((sel) => {
    const root: ParentNode = sel ? (document.querySelector(sel) ?? document) : document;
    const scope = sel && document.querySelector(sel) ? [document.querySelector(sel)!, ...Array.from(root.querySelectorAll('*'))] : Array.from(document.querySelectorAll('*'));
    for (const el of scope) {
      const timeline = getComputedStyle(el as Element).getPropertyValue('animation-timeline').trim();
      if (timeline && timeline !== 'auto' && timeline !== 'none') return true;
    }
    return false;
  }, selector);
}

async function scrollIntoView(page: import('playwright').Page, selector: string | null): Promise<void> {
  await page.evaluate((sel) => {
    const el = sel ? document.querySelector(sel) : null;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    else {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.round(max * 0.5), left: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, selector);
}

async function partHasContent(page: import('playwright').Page, selector: string | null): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = (sel ? document.querySelector(sel) : document.body) as HTMLElement | null;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const hasBox = rect.width > 1 && rect.height > 1;
    const hasText = (el.textContent ?? '').trim().length > 0;
    const hasMedia = el.querySelector('img, svg, canvas, video, picture') !== null;
    return hasBox && (hasText || hasMedia);
  }, selector);
}

/** Visual properties a scroll-scrubbed animation drives; compared across two scroll positions. */
const SCRUB_PROPERTIES = ['opacity', 'transform', 'filter', 'backgroundColor', 'color', 'clipPath'] as const;

/**
 * True when the part's own rendered style changes with scroll POSITION — the signature of a
 * scroll-position-scrubbed animation (`animation-timeline: view()/scroll()`, GSAP `scrub: true`).
 *
 * Such an animation is deliberately STABLE across time at a fixed position — that is exactly what
 * `scroll-scene-evidence-v1` demands — so time-energy cannot see it. Comparing computed style at two
 * positions is deterministic and immune to the clipping/alignment errors a pixel comparison of a
 * moving element suffers.
 */
async function isScrubbed(page: import('playwright').Page, selector: string | null): Promise<boolean> {
  if (!selector) return false;
  const sample = async (fraction: number): Promise<string[] | null> =>
    page.evaluate(([sel, f, props]) => {
      const el = document.querySelector(sel as string);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      window.scrollBy({ top: rect.top - window.innerHeight * (f as number), left: 0, behavior: 'instant' as ScrollBehavior });
      return new Promise<string[]>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const style = getComputedStyle(el);
          resolve((props as readonly string[]).map((p) => style[p as keyof CSSStyleDeclaration] as string));
        }));
      });
    }, [selector, fraction, SCRUB_PROPERTIES] as const);

  const entering = await sample(0.9);
  const settled = await sample(0.35);
  if (!entering || !settled) return false;
  return entering.some((value, index) => value !== settled[index]);
}

/**
 * Observes a real browser and returns a validated `reference-craft-v1` for one scoped part.
 * Measures peak motion energy at load and on scroll-into-view, classifies scroll-linkage from a CSS
 * scroll timeline or observed reveal energy, and records whether the part keeps a reduced-motion
 * baseline. Throws on a malformed viewport/selector or an absent target.
 */
export async function captureReferenceCraft(target: string, opts: ReferenceCraftCaptureOptions): Promise<ReferenceCraft> {
  const interval = Math.max(1, Math.floor(opts.settleIntervalMs ?? DEFAULT_SETTLE_INTERVAL_MS));
  const viewport = { width: opts.viewport.width, height: opts.viewport.height };
  const selector = opts.selector ?? null;
  const url = toUrl(target);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForDocumentFonts(page);

    // 1. Load-window motion: does the part animate at rest, at the top of the page, over time?
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior }));
    await settleFrames(page);
    const loadA = await page.screenshot({ fullPage: false });
    await wait(interval);
    const loadB = await page.screenshot({ fullPage: false });
    const loadEnergy = computeEnergy([loadA, loadB]).peakEnergy;

    // 2. Reveal-on-entry motion: scroll the part into view, then measure time-energy as it resolves.
    await scrollIntoView(page, selector);
    const revealA = await page.screenshot({ fullPage: false });
    await wait(interval);
    const revealB = await page.screenshot({ fullPage: false });
    const revealEnergy = computeEnergy([revealA, revealB]).peakEnergy;

    // 3. Scroll-linkage: a CSS scroll/view timeline, an observed reveal on entry, or a rendered-style
    //    change across scroll positions (scrubbed motion, which is time-stable by contract and so
    //    invisible to the energy measurements above).
    const scrollTimeline = await usesScrollTimeline(page, selector);
    const scrubbed = scrollTimeline ? true : await isScrubbed(page, selector);
    const scrollLinked = scrollTimeline || scrubbed || revealEnergy >= CRAFT_ENERGY_FLOOR;
    const peakEnergy = Math.min(1, Math.max(loadEnergy, revealEnergy));

    // 4. Reduced-motion baseline: a fresh reduced-motion page must still present the part's content.
    const reducedPage = await browser.newPage({ viewport });
    let reducedMotionSafe: boolean;
    try {
      await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
      await reducedPage.goto(url, { waitUntil: 'networkidle' });
      await waitForDocumentFonts(reducedPage);
      await scrollIntoView(reducedPage, selector);
      await settleFrames(reducedPage);
      reducedMotionSafe = await partHasContent(reducedPage, selector);
    } finally {
      await reducedPage.close();
    }

    return validateReferenceCraft({
      schema: REFERENCE_CRAFT_SCHEMA,
      source: opts.source,
      as: opts.as,
      selector: selector ?? ':root',
      viewport,
      motion: { peakEnergy, scrollLinked, reducedMotionSafe },
      technique: opts.technique,
    });
  } finally {
    await browser.close();
  }
}
