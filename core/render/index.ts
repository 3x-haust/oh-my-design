import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractInPage } from '../ir/dom.ts';
import type { RawIr } from '../types.ts';

const MAX_NODES = 4000;

export interface Viewport { width: number; height: number }

function toUrl(target: string): string {
  if (/^https?:\/\//.test(target)) return target;
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`no such page: ${target}`);
  return pathToFileURL(path).href;
}

async function withPage<T>(target: string, viewport: Viewport, fn: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(toUrl(target), { waitUntil: 'networkidle' });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export function parseViewport(s = '390x844'): Viewport {
  const [width, height] = s.split('x').map(Number);
  if (!width || !height) throw new Error(`bad viewport: ${s}`);
  return { width, height };
}

export function renderPage(target: string, opts: { viewport: Viewport; out: string }): Promise<string> {
  return withPage(target, opts.viewport, async (page) => {
    await page.screenshot({ path: opts.out, fullPage: true });
    return opts.out;
  });
}

/** Interactive elements: same definition as dom.ts's INTERACTIVE, as a CSS selector. */
const INTERACTIVE_SELECTOR = "a, button, input, select, textarea, summary, [role='button'], [onclick]";

/** Style properties a hover state plausibly changes. Any difference counts as "responsive". */
const HOVER_KEYS = [
  'backgroundColor', 'color', 'borderColor', 'boxShadow', 'transform', 'opacity', 'textDecorationLine', 'filter',
] as const;

const MAX_PROBED = 25;

export interface InteractionMeasurement {
  /** Interactive, visible elements actually probed (capped at 25). */
  probed: number;
  /** Of those, how many changed at least one hover-relevant style on :hover. */
  hoverResponsive: number;
  /** Tab-key stops that landed on a real element (capped at 25 presses). */
  tabStops: number;
  /** Of those stops, how many show a visible focus indicator (outline or box-shadow). */
  focusVisible: number;
}

function pickHoverStyle(el: Element): Record<string, string> {
  const cs = getComputedStyle(el);
  return {
    backgroundColor: cs.backgroundColor,
    color: cs.color,
    borderColor: cs.borderColor,
    boxShadow: cs.boxShadow,
    transform: cs.transform,
    opacity: cs.opacity,
    textDecorationLine: cs.textDecorationLine,
    filter: cs.filter,
  };
}

/**
 * Real Playwright input, not synthetic events: `dispatchEvent` cannot trigger `:hover` or
 * `:focus-visible`, so `handle.hover()` moves the actual mouse and `keyboard.press('Tab')`
 * drives real keyboard focus. A probe failure (a covered element, a page with no
 * interactive elements) must never break capture — every failure point is caught locally
 * and the whole pass returns null rather than throwing.
 */
async function probeInteraction(page: import('playwright').Page): Promise<InteractionMeasurement | null> {
  try {
    const handles = await page.$$(INTERACTIVE_SELECTOR);
    const visible: import('playwright').ElementHandle[] = [];
    for (const handle of handles) {
      if (visible.length >= MAX_PROBED) break;
      if (await handle.isVisible().catch(() => false)) visible.push(handle);
    }

    let hoverResponsive = 0;
    for (const handle of visible) {
      try {
        const before = await handle.evaluate(pickHoverStyle);
        await handle.hover({ timeout: 2000 });
        const after = await handle.evaluate(pickHoverStyle);
        if (HOVER_KEYS.some((k) => before[k] !== after[k])) hoverResponsive += 1;
      } catch {
        // Not hoverable (covered, detached mid-probe): does not count either way.
      }
    }
    // Reset the real cursor so the last-hovered element's :hover does not bleed into
    // the focus-visible pass below.
    await page.mouse.move(0, 0).catch(() => {});

    await page.evaluate(() => document.body.focus());
    let tabStops = 0;
    let focusVisible = 0;
    for (let i = 0; i < MAX_PROBED; i += 1) {
      await page.keyboard.press('Tab');
      const indicator = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) return null;
        const cs = getComputedStyle(el);
        const outlined = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
        return outlined || cs.boxShadow !== 'none';
      });
      if (indicator === null) continue;
      tabStops += 1;
      if (indicator) focusVisible += 1;
    }

    return { probed: visible.length, hoverResponsive, tabStops, focusVisible };
  } catch {
    return null;
  }
}

export function extractIr(target: string, opts: { viewport: Viewport; selector?: string | null }): Promise<RawIr> {
  return withPage(target, opts.viewport, async (page) => {
    // Node strips the types, so toString() yields runnable JS for the browser.
    const raw = await page.evaluate(
      `(${extractInPage.toString()})(${MAX_NODES}, ${JSON.stringify(opts.selector ?? null)})`,
    ) as RawIr;
    const interaction = await probeInteraction(page);
    return { ...raw, meta: { ...(raw.meta ?? {}), interaction } };
  });
}
