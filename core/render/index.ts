import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { extractInPage } from '../ir/dom.ts';
import type { MotionMeasurement, RawIr } from '../types.ts';

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

// ── Motion probe helpers ────────────────────────────────────────────────────
//
// These functions run inside the page (injected via page.evaluate stringification).
// They must stay self-contained: no imports, no closure over module scope, and no
// syntax that does not survive TypeScript type-stripping to plain JS.
//
// PROBE LIMIT: document.getAnimations() sees CSS animations, CSS transitions (WAAPI
// path), and explicit WAAPI calls including Framer Motion. It does NOT see rAF-driven
// libraries such as GSAP or Anime.js — those animate via requestAnimationFrame and
// bypass the Animation API entirely. A GSAP-only page will correctly report zero
// animations here. This limit is documented on MotionMeasurement and propagated to
// Invariants.animatedProperties so callers are never surprised.

function captureMotionSnapshot(): Array<{ duration: number; easing: string; properties: string[]; playState: string }> {
  const doc = document as unknown as { getAnimations?: (opts?: { subtree: boolean }) => unknown[] };
  const anims: unknown[] = doc.getAnimations?.({ subtree: true }) ?? [];
  const result: Array<{ duration: number; easing: string; properties: string[]; playState: string }> = [];
  for (const anim of anims) {
    const a = anim as { effect?: unknown; playState: string };
    const effect = a.effect;
    if (!effect) continue;
    const eff = effect as { getComputedTiming?: () => { duration?: unknown; easing?: string }; getKeyframes?: () => Record<string, unknown>[] };
    const timing = eff.getComputedTiming?.() ?? {};
    const duration = typeof timing.duration === 'number' ? timing.duration : 0;
    const easing = timing.easing ?? 'linear';
    const properties: string[] = [];
    try {
      if (typeof eff.getKeyframes === 'function') {
        const skip = new Set(['offset', 'easing', 'composite', 'computedOffset']);
        for (const kf of eff.getKeyframes()) {
          for (const k of Object.keys(kf)) {
            if (!skip.has(k) && !properties.includes(k)) properties.push(k);
          }
        }
      }
    } catch { /* getKeyframes unsupported in some browser states */ }
    result.push({ duration, easing, properties, playState: a.playState });
  }
  return result;
}

function checkReducedMotionInPage(): boolean {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        // CSSMediaRule.type === 4
        if ((rule as unknown as { type: number }).type === 4) {
          const text: string =
            (rule as unknown as { conditionText?: string; media?: { mediaText?: string } }).conditionText
            ?? (rule as unknown as { media?: { mediaText?: string } }).media?.mediaText
            ?? '';
          if (text.includes('prefers-reduced-motion')) return true;
        }
      }
    } catch { /* cross-origin stylesheet: skip */ }
  }
  return false;
}

/**
 * Live animation probe. Reads document.getAnimations({subtree:true}) at three timepoints
 * and steps through scroll positions to record per-step choreography data.
 *
 * A probe failure (no Animation API, page error, or Playwright timeout) returns null
 * rather than throwing — capture must never break because motion could not be measured.
 */
async function probeMotion(page: import('playwright').Page): Promise<MotionMeasurement | null> {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  try {
    type Snap = Array<{ duration: number; easing: string; properties: string[]; playState: string }>;

    // Three-snapshot timeline: capture animation state at load, 500ms, and 1500ms.
    // Entrance animations typically complete within this window; scroll-triggered ones do not.
    const snap0 = await page.evaluate(`(${captureMotionSnapshot.toString()})()`) as Snap;
    await sleep(500);
    const snap500 = await page.evaluate(`(${captureMotionSnapshot.toString()})()`) as Snap;
    await sleep(1000); // 1500ms total
    const snap1500 = await page.evaluate(`(${captureMotionSnapshot.toString()})()`) as Snap;

    const hasReducedMotion = await page.evaluate(`(${checkReducedMotionInPage.toString()})()`) as boolean;

    // Scroll choreography: step by 25% viewport height, record animation and element counts.
    const viewportHeight = page.viewportSize()?.height ?? 800;
    const scrollStep = Math.round(viewportHeight * 0.25);
    const scrollChoreography: MotionMeasurement['scrollChoreography'] = [];

    for (let step = 1; step <= 4; step++) {
      await page.evaluate((y: number) => window.scrollTo({ top: y, behavior: 'instant' }), step * scrollStep);
      await sleep(150); // brief settle for scroll-triggered animations to start
      const stepData = await page.evaluate(() => {
        const doc = document as unknown as { getAnimations?: (opts?: { subtree: boolean }) => Array<{ playState: string }> };
        const anims = doc.getAnimations?.({ subtree: true }) ?? [];
        const fired = anims.filter((a) => a.playState === 'running').length;
        const vH = window.innerHeight;
        const entered = Array.from(document.querySelectorAll('*')).filter((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > vH || rect.width === 0 || rect.height === 0) return false;
          const cs = getComputedStyle(el);
          const transDur = parseFloat(cs.transitionDuration) || 0;
          const animDur = parseFloat(cs.animationDuration) || 0;
          const hasAnim = cs.animationName !== 'none' && animDur > 0;
          return transDur > 0 || hasAnim;
        }).length;
        return { fired, entered };
      }) as { fired: number; entered: number };
      scrollChoreography.push({ step, fired: stepData.fired, entered: stepData.entered });
    }

    // Reset scroll so subsequent operations (e.g. screenshot) see the top of the page.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

    const allProps = [...snap0, ...snap500, ...snap1500].flatMap((a) => a.properties);
    const animatedProperties = [...new Set(allProps)].sort();

    return {
      snapshots: [
        { t: 0, animations: snap0 },
        { t: 500, animations: snap500 },
        { t: 1500, animations: snap1500 },
      ],
      animatedProperties,
      hasReducedMotion,
      scrollChoreography,
    };
  } catch {
    return null;
  }
}

// ── Filmstrip ───────────────────────────────────────────────────────────────

/**
 * Captures 4–6 viewport screenshots at ~300ms intervals from load, then writes:
 *   - numbered frame PNGs: `<base>-frame-0.png`, `<base>-frame-1.png`, …
 *   - an HTML index at `<base>.html` that lays frames out horizontally
 *
 * The HTML index is the deliverable: `omd-eye` reads it to see what appeared when.
 * No image-compositing dependency is needed — the HTML renders the filmstrip in the
 * browser, and the eye reads the rendered result.
 *
 * Returns the paths of the frame PNGs (not the index).
 */
export async function renderFilmstrip(
  target: string,
  opts: { viewport: Viewport; out: string; frames?: number; interval?: number },
): Promise<string[]> {
  const frameCount = Math.min(Math.max(opts.frames ?? 5, 4), 6);
  const interval = opts.interval ?? 300;
  const base = opts.out.replace(/\.html$/i, '');
  const dir = dirname(resolve(base));
  const name = basename(base);

  return withPage(target, opts.viewport, async (page) => {
    mkdirSync(dir, { recursive: true });
    const framePaths: string[] = [];

    for (let i = 0; i < frameCount; i++) {
      if (i > 0) await new Promise<void>((r) => setTimeout(r, interval));
      const framePath = join(dir, `${name}-frame-${i}.png`);
      // Viewport screenshot (not fullPage) so each frame shows the same viewport region
      // and the temporal sequence is directly comparable.
      await page.screenshot({ path: framePath, fullPage: false });
      framePaths.push(framePath);
    }

    // HTML index: frames laid out horizontally so the eye can see the temporal sequence.
    const indexPath = join(dir, `${name}.html`);
    const figures = framePaths.map((p, i) =>
      `<figure><figcaption>t=${i * interval}ms</figcaption>`
      + `<img src="${basename(p)}" loading="lazy" alt="frame ${i}"></figure>`,
    );
    const html = [
      '<!doctype html><meta charset="utf-8">',
      `<title>Filmstrip — ${name}</title>`,
      '<style>',
      'body{margin:0;background:#111;color:#ddd;font:11px/1.4 system-ui;',
      '     display:flex;gap:3px;padding:8px;overflow-x:auto;min-height:100vh}',
      'figure{margin:0;flex-shrink:0;text-align:center}',
      'figcaption{padding:4px 0 6px}',
      'img{display:block;height:320px;width:auto;border:1px solid #333}',
      '</style>',
      ...figures,
    ].join('\n');
    writeFileSync(indexPath, html);

    return framePaths;
  });
}

export function extractIr(target: string, opts: { viewport: Viewport; selector?: string | null }): Promise<RawIr> {
  return withPage(target, opts.viewport, async (page) => {
    // Node strips the types, so toString() yields runnable JS for the browser.
    const raw = await page.evaluate(
      `(${extractInPage.toString()})(${MAX_NODES}, ${JSON.stringify(opts.selector ?? null)})`,
    ) as RawIr;
    const interaction = await probeInteraction(page);
    const motion = await probeMotion(page);
    return { ...raw, meta: { ...(raw.meta ?? {}), interaction, motion } };
  });
}
