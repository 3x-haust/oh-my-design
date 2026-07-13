import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { extractInPage } from '../ir/dom.ts';
import { computeEnergy } from '../motion/energy.ts';
import type { EnergyCurve, MotionMeasurement, RawIr } from '../types.ts';

const MAX_NODES = 4000;

// ── Block detection ─────────────────────────────────────────────────────────

/**
 * Thrown by extractIr when the page is behind a bot-challenge or is otherwise
 * unreachable. Callers (CLI, scout) should not retry the same URL — demote to
 * `--image` or advance to the next candidate.
 */
export class BlockedPageError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`blocked page: ${reason}`);
    this.name = 'BlockedPageError';
    this.reason = reason;
  }
}

/** Challenge-page title patterns that indicate bot/Cloudflare/WAF blocking. */
const CHALLENGE_TITLE_PATTERNS: RegExp[] = [
  /^just a moment/i,
  /^attention required/i,
  /^access denied/i,
  /^ddos.{0,20}protection/i,
  /^please (verify|wait)/i,
  /^security check/i,
  /^cloudflare/i,
  /^are you (a )?human/i,
  /^checking your browser/i,
  /^one more step/i,
  /^403\b/,
  /^error\s+403\b/i,
  /^(503|502|500)\b/,
];

/**
 * Pure heuristic, fully testable without a browser.
 *
 * Returns the block reason string when the signals indicate a bot-challenge or
 * hollow page; returns null when the page looks valid.
 *
 * Rules, in order:
 *   1. HTTP 403 or any 5xx → explicitly blocked or server error
 *   2. Challenge-page title → Cloudflare / WAF interstitial
 *   3. Near-empty body (< 200 visible chars) → hollow IR — nothing to measure
 */
export function detectBlockReason(
  title: string,
  bodyTextLength: number,
  httpStatus: number | null,
): string | null {
  if (httpStatus !== null && (httpStatus === 403 || httpStatus >= 500)) {
    return `HTTP ${httpStatus}`;
  }
  for (const pattern of CHALLENGE_TITLE_PATTERNS) {
    if (pattern.test(title.trim())) {
      return `challenge page: "${title.trim()}"`;
    }
  }
  if (bodyTextLength < 200) {
    return `near-empty body (${bodyTextLength} visible chars)`;
  }
  return null;
}

/**
 * Evaluates the loaded page inside Playwright and throws BlockedPageError when
 * blocked. Called inside withPage after navigation; never throws for probe
 * failures (those are caught locally so capture can continue best-effort).
 *
 * Block detection is only meaningful for live HTTP/HTTPS targets. A file://
 * URL cannot be challenged by Cloudflare and may have minimal body text by
 * design (a fixture page is often all CSS, no prose). Skip all checks for
 * local files so test fixtures are never falsely flagged.
 */
async function assertNotBlocked(
  page: import('playwright').Page,
  httpStatus: number | null,
  resolvedUrl: string,
): Promise<void> {
  if (resolvedUrl.startsWith('file:')) return; // local files are never bot-challenged
  const title = await page.title().catch(() => '');
  const bodyTextLength = await page
    .evaluate(() => (document.body?.innerText?.trim() ?? '').length)
    .catch(() => 999); // can't measure → assume valid so capture still runs
  const reason = detectBlockReason(title, bodyTextLength, httpStatus);
  if (reason !== null) throw new BlockedPageError(reason);
}

export interface Viewport { width: number; height: number }

const FONT_READY_TIMEOUT_MS = 5000;

/**
 * Wait for the browser's CSS Font Loading set before measuring or capturing. The timeout
 * bounds the readiness wait; `document.fonts.ready` can still resolve after a face fails.
 * Fallback, tofu, and failed faces remain explicit FontFace-inventory and render-review
 * concerns. Readiness cannot identify which physical font painted an individual glyph.
 */
export async function waitForDocumentFonts(
  page: Pick<import('playwright').Page, 'evaluate'>,
  timeoutMs = FONT_READY_TIMEOUT_MS,
): Promise<void> {
  const outcome = await page.evaluate(async (limit) => {
    if (!document.fonts?.ready) return 'unsupported';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        document.fonts.ready.then(() => 'ready' as const),
        new Promise<'timeout'>((resolveTimeout) => {
          timer = setTimeout(() => resolveTimeout('timeout'), limit);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }, timeoutMs);
  if (outcome === 'timeout') {
    throw new Error(`document.fonts.ready timed out after ${timeoutMs}ms`);
  }
}

function toUrl(target: string): string {
  if (/^https?:\/\//.test(target)) return target;
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`no such page: ${target}`);
  return pathToFileURL(path).href;
}

async function withPage<T>(
  target: string,
  viewport: Viewport,
  fn: (page: import('playwright').Page, httpStatus: number | null, resolvedUrl: string) => Promise<T>,
): Promise<T> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    const resolvedUrl = toUrl(target);
    const response = await page.goto(resolvedUrl, { waitUntil: 'networkidle' });
    await waitForDocumentFonts(page);
    const httpStatus = response?.status() ?? null;
    return await fn(page, httpStatus, resolvedUrl);
  } finally {
    await browser.close();
  }
}

export function parseViewport(s = '390x844'): Viewport {
  const [width, height] = s.split('x').map(Number);
  if (!width || !height) throw new Error(`bad viewport: ${s}`);
  return { width, height };
}

export function renderPage(target: string, opts: { viewport: Viewport; out: string; squint?: boolean; fullPage?: boolean }): Promise<string> {
  return withPage(target, opts.viewport, async (page, _httpStatus, _resolvedUrl) => {
    if (opts.squint) {
      // Hierarchy isolation only: this is neither a colour-vision simulation nor a
      // literal recreation of a timed first impression.
      await page.addStyleTag({ content: 'html { filter: grayscale(1) blur(6px) !important; }' });
    }
    await page.screenshot({ path: opts.out, fullPage: opts.fullPage === true });
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

  return withPage(target, opts.viewport, async (page, _httpStatus, _resolvedUrl) => {
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

    // Energy curve: compute pixel-diff scores between adjacent frames and write alongside
    // the HTML index. This measurement sees ALL motion including GSAP/rAF — closing the
    // getAnimations() blind spot documented on MotionMeasurement. Any decode failure is
    // caught silently so a non-standard PNG format never breaks the filmstrip capture.
    try {
      const frameBuffers = framePaths.map((p) => readFileSync(p));
      const energyCurve = computeEnergy(frameBuffers);
      const energyPath = join(dir, `${name}-energy.json`);
      writeFileSync(energyPath, `${JSON.stringify(energyCurve, null, 2)}\n`);
    } catch {
      // Best-effort: energy is a bonus measurement; a failure must not break capture.
    }

    return framePaths;
  });
}

/**
 * Capture a pixel-diff motion energy curve by taking frames in a live browser session.
 *
 * Unlike renderFilmstrip, this does not write any files — it returns the EnergyCurve
 * directly for embedding in reference records (`omd ref add`). Uses the same
 * Playwright capture path as renderFilmstrip but in a fresh session.
 *
 * Returns null on any failure: a blocked page, unsupported PNG format, or Playwright
 * error must never prevent a reference from being saved.
 *
 * PROBE NOTE: like renderFilmstrip, this sees ALL pixel-level motion including GSAP/rAF,
 * complementing the getAnimations() probe in extractIr which cannot see rAF-driven libs.
 */
export async function captureEnergy(
  target: string,
  opts: { viewport: Viewport; frames?: number; interval?: number },
): Promise<EnergyCurve | null> {
  const frameCount = Math.min(Math.max(opts.frames ?? 4, 2), 6);
  const interval = opts.interval ?? 300;
  try {
    return await withPage(target, opts.viewport, async (page) => {
      const buffers: Buffer[] = [];
      for (let i = 0; i < frameCount; i++) {
        if (i > 0) await new Promise<void>((r) => setTimeout(r, interval));
        buffers.push(await page.screenshot({ fullPage: false }));
      }
      return computeEnergy(buffers);
    });
  } catch {
    return null;
  }
}

export function extractIr(target: string, opts: { viewport: Viewport; selector?: string | null }): Promise<RawIr> {
  return withPage(target, opts.viewport, async (page, httpStatus, resolvedUrl) => {
    // Fail fast on blocked/challenge pages before attempting DOM extraction.
    // A blocked page produces a hollow IR (no tokens, near-empty nodes) that
    // silently scores low signal — the tool reports the wrong cause. Better to
    // name it here and let the caller (scout, CLI) choose the fallback.
    await assertNotBlocked(page, httpStatus, resolvedUrl);

    // Node strips the types, so toString() yields runnable JS for the browser.
    const raw = await page.evaluate(
      `(${extractInPage.toString()})(${MAX_NODES}, ${JSON.stringify(opts.selector ?? null)})`,
    ) as RawIr;
    const interaction = await probeInteraction(page);
    const motion = await probeMotion(page);
    return { ...raw, meta: { ...(raw.meta ?? {}), interaction, motion } };
  });
}
