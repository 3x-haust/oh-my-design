import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, basename, join, relative } from 'node:path';
import { extractInPage } from '../ir/dom.ts';
import { computeEnergy } from '../motion/energy.ts';
import type { EnergyCurve, MotionMeasurement, RawIr } from '../types.ts';
import { type ProjectWriteAdapter, requireProjectWriteAdapter } from '../runtime/project-write.ts';
import type { RenderedBeat, RenderedBeatProof } from '../copy/index.ts';
const MAX_NODES = 4000;
const reducedMotionRemovalThreshold = (noiseFloor: number): number => noiseFloor * 2;

const projectOutputPath = (adapter: ProjectWriteAdapter, output: string): string => {
  const outputPath = resolve(output);
  const canonicalOutput = join(realpathSync(dirname(outputPath)), basename(outputPath));
  const path = relative(adapter.projectRoot, canonicalOutput).split('\\').join('/');
  if (path === '..' || path.startsWith('../')) throw new Error('render output must be inside the adapter project root');
  return path;
};
const writeScreenshot = async (
  capture: () => Promise<Buffer>,
  adapter: ProjectWriteAdapter,
  output: string,
): Promise<string> => adapter.write(projectOutputPath(adapter, output), await capture());

export function browserEvaluationExpression(source: string, argumentExpression: string): string {
  return `(() => { const __name = (callback) => callback; return (${source})(${argumentExpression}); })()`;
}

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

type Browser = import('playwright').Browser;

/** Launch one chromium, run fn, close it. Batch capture reuses a single browser across many pages. */
export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const { chromium } = await import('playwright');
  // Always headless — OMD never opens a visible browser window in any situation.
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/** Open one page in an existing browser, navigate, wait for fonts, run fn, close the page. */
export async function onPage<T>(
  browser: Browser,
  target: string,
  viewport: Viewport,
  fn: (page: import('playwright').Page, httpStatus: number | null, resolvedUrl: string) => Promise<T>,
): Promise<T> {
  const page = await browser.newPage({ viewport });
  try {
    const resolvedUrl = toUrl(target);
    const response = await page.goto(resolvedUrl, { waitUntil: 'networkidle' });
    await waitForDocumentFonts(page);
    return await fn(page, response?.status() ?? null, resolvedUrl);
  } finally {
    await page.close();
  }
}

async function withPage<T>(
  target: string,
  viewport: Viewport,
  fn: (page: import('playwright').Page, httpStatus: number | null, resolvedUrl: string) => Promise<T>,
): Promise<T> {
  return withBrowser((browser) => onPage(browser, target, viewport, fn));
}

export function parseViewport(s = '390x844'): Viewport {
  const [width, height] = s.split('x').map(Number);
  if (!width || !height) throw new Error(`bad viewport: ${s}`);
  return { width, height };
}

export function renderPage(target: string, opts: { viewport: Viewport; out: string; squint?: boolean; fullPage?: boolean; adapter: ProjectWriteAdapter }): Promise<string> {
  return withPage(target, opts.viewport, async (page, _httpStatus, _resolvedUrl) => {
    if (opts.squint) {
      // Hierarchy isolation only: this is neither a colour-vision simulation nor a
      // literal recreation of a timed first impression.
      await page.addStyleTag({ content: 'html { filter: grayscale(1) blur(6px) !important; }' });
    }
    await writeScreenshot(() => page.screenshot({ fullPage: opts.fullPage === true }), requireProjectWriteAdapter(opts.adapter.projectRoot, opts.adapter), opts.out);
    return opts.out;
  });
}

/**
 * Render the four sketch/craft proofs — fixed and full-page, at desktop and mobile — over ONE
 * browser, two navigations (one per viewport, each yielding its fixed and full-page shot). Writes
 * `<prefix>-desktop.png`, `-mobile.png`, `-desktop-full.png`, `-mobile-full.png`. Byte-identical to
 * four separate `renderPage` calls, at one browser launch instead of four.
 */
export async function renderProofs(
  target: string,
  outPrefix: string,
  opts: { desktop?: Viewport; mobile?: Viewport; adapter: ProjectWriteAdapter },
): Promise<string[]> {
  const desktop = opts?.desktop ?? { width: 1280, height: 900 };
  const mobile = opts?.mobile ?? { width: 390, height: 844 };
  const written: string[] = [];
  await withBrowser(async (browser) => {
    await Promise.all(([['desktop', desktop], ['mobile', mobile]] as const).map(([name, vp]) =>
      onPage(browser, target, vp, async (page) => {
        const fixed = `${outPrefix}-${name}.png`;
        const full = `${outPrefix}-${name}-full.png`;
        await writeScreenshot(() => page.screenshot({ fullPage: false }), requireProjectWriteAdapter(opts.adapter.projectRoot, opts.adapter), fixed);
        await writeScreenshot(() => page.screenshot({ fullPage: true }), requireProjectWriteAdapter(opts.adapter.projectRoot, opts.adapter), full);
        written.push(fixed, full);
      })));
  });
  return written.sort();
}

/**
 * Screenshot a single element clipped to its bounding box. Used by
 * `omd ref add --selector … --shot` to pair a component's pixels with its
 * blueprint on one reference record. Throws when the selector matches nothing,
 * the same fail-closed contract as a scoped IR capture.
 */
export function renderElement(target: string, opts: { viewport: Viewport; selector: string; out: string; adapter: ProjectWriteAdapter }): Promise<string> {
  return withPage(target, opts.viewport, async (page) => {
    const el = await page.$(opts.selector);
    if (!el) throw new Error(`no element matches selector: ${opts.selector}`);
    await writeScreenshot(() => el.screenshot(), requireProjectWriteAdapter(opts.adapter.projectRoot, opts.adapter), opts.out);
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
  const anims: unknown[] = document.getAnimations();
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
 * Live animation probe. Reads document.getAnimations({subtree:true}) only in the fixed load
 * window (0ms, 500ms, 1500ms). The canonical observable scene is load-only: this probe never
 * scrolls, hovers, clicks, or otherwise manufactures an interaction trigger. A probe failure
 * (no Animation API, page error, or Playwright timeout) returns null rather than throwing.
 */
async function probeMotion(page: import('playwright').Page): Promise<MotionMeasurement | null> {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const snapshotExpression = browserEvaluationExpression(captureMotionSnapshot.toString(), '');
  const reducedMotionExpression = browserEvaluationExpression(checkReducedMotionInPage.toString(), '');
  try {
    type Snap = Array<{ duration: number; easing: string; properties: string[]; playState: string }>;

    // Fixed load-window timeline. A selected `one` scene must begin at load and settle here.
    const snap0 = await page.evaluate(snapshotExpression) as Snap;
    await sleep(500);
    const snap500 = await page.evaluate(snapshotExpression) as Snap;
    await sleep(1000);
    const snap1500 = await page.evaluate(snapshotExpression) as Snap;

    const hasReducedMotion = await page.evaluate(reducedMotionExpression) as boolean;

    // Keep the legacy field empty: scroll scenes are not part of the observable motion contract.
    const scrollChoreography: MotionMeasurement['scrollChoreography'] = [];

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
  opts: { viewport: Viewport; out: string; frames?: number; interval?: number; adapter: ProjectWriteAdapter },
): Promise<string[]> {
  const frameCount = Math.min(Math.max(opts.frames ?? 5, 4), 6);
  const interval = opts.interval ?? 300;
  const base = opts.out.replace(/\.html$/i, '');
  const dir = dirname(resolve(base));
  const name = basename(base);

  const adapter = requireProjectWriteAdapter(opts.adapter.projectRoot, opts.adapter);
  return withPage(target, opts.viewport, async (page, _httpStatus, _resolvedUrl) => {
    const outputDirectory = projectOutputPath(adapter, dir);
    if (outputDirectory) adapter.mkdir(outputDirectory);
    const framePaths: string[] = [];

    for (let i = 0; i < frameCount; i++) {
      if (i > 0) await new Promise<void>((r) => setTimeout(r, interval));
      const framePath = join(dir, `${name}-frame-${i}.png`);
      // Viewport screenshot (not fullPage) so each frame shows the same viewport region
      // and the temporal sequence is directly comparable.
      await writeScreenshot(() => page.screenshot({ fullPage: false }), adapter, framePath);
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
    adapter.write(projectOutputPath(adapter, indexPath), html);

    // Energy curve: compute pixel-diff scores between adjacent frames and write alongside
    // the HTML index. This measurement sees ALL motion including GSAP/rAF — closing the
    // getAnimations() blind spot documented on MotionMeasurement. Any decode failure is
    // caught silently so a non-standard PNG format never breaks the filmstrip capture.
    try {
      const frameBuffers = framePaths.map((p) => readFileSync(p));
      const energyCurve = computeEnergy(frameBuffers);
      const energyPath = join(dir, `${name}-energy.json`);
      adapter.write(projectOutputPath(adapter, energyPath), `${JSON.stringify(energyCurve, null, 2)}\n`);
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

/** Page-level IR extraction: block check, DOM extract, interaction/motion probes. */
async function extractIrCore(
  page: import('playwright').Page,
  httpStatus: number | null,
  resolvedUrl: string,
  selector: string | null,
): Promise<RawIr> {
  // Fail fast on blocked/challenge pages before attempting DOM extraction.
  await assertNotBlocked(page, httpStatus, resolvedUrl);
  const raw = await page.evaluate(
    browserEvaluationExpression(extractInPage.toString(), `${MAX_NODES}, ${JSON.stringify(selector ?? null)}`),
  ) as RawIr;
  const interaction = await probeInteraction(page);
  const motion = await probeMotion(page);
  return { ...raw, meta: { ...(raw.meta ?? {}), interaction, motion } };
}

export function extractIr(target: string, opts: { viewport: Viewport; selector?: string | null }): Promise<RawIr> {
  return withPage(target, opts.viewport, (page, httpStatus, resolvedUrl) =>
    extractIrCore(page, httpStatus, resolvedUrl, opts.selector ?? null));
}

/**
 * One navigation on a shared browser: extract the IR and, optionally, a scoped element screenshot.
 * Doing both on a single page is the per-reference win for batch capture — one launch, one
 * navigation, instead of a separate browser per IR/energy/shot.
 */
export async function capturePageForRef(
  browser: Browser,
  target: string,
  viewport: Viewport,
  opts: { selector?: string | null; shotOut?: string; adapter?: ProjectWriteAdapter },
): Promise<{ raw: RawIr; shotSaved: boolean }> {
  return onPage(browser, target, viewport, async (page, httpStatus, resolvedUrl) => {
    const raw = await extractIrCore(page, httpStatus, resolvedUrl, opts.selector ?? null);
    let shotSaved = false;
    if (opts.shotOut && opts.selector) {
      const el = await page.$(opts.selector);
      if (el) {
        if (!opts.adapter) throw new Error('scoped reference screenshot requires a project-write adapter');
        await writeScreenshot(() => el.screenshot(), requireProjectWriteAdapter(opts.adapter.projectRoot, opts.adapter), opts.shotOut);
        shotSaved = true;
      }
    }
    return { raw, shotSaved };
  });
}
/**
 * Executes one real browser trigger and saves ROI screenshots as independently
 * verifiable receipts. Callers supply immutable run/build/reference bindings.
 */
export async function captureMotionEvidenceV2(
  target: string,
  opts: {
    viewport: Viewport; outDir: string; runId: string; buildHash: string; artDirectionHash: string;
    referenceSlotId?: string; sourceInfluence?: MotionSourceInfluence; selector: string; adapter: ProjectWriteAdapter;
    trigger: 'load'; intervalMs?: number;
  },
): Promise<MotionEvidenceV2> {
  const interval = opts.intervalMs ?? 150;
  const adapter = requireProjectWriteAdapter(opts.adapter.projectRoot, opts.adapter);
  const outputDirectory = projectOutputPath(adapter, opts.outDir);
  if (outputDirectory) adapter.mkdir(outputDirectory);
  return withBrowser((browser) => onPage(browser, target, opts.viewport, async (page) => {
    const transcript: { event: 'load'; timestampMs: number }[] = [{ event: 'load', timestampMs: 0 }];
    const started = Date.now();
    const element = await page.$(opts.selector);
    if (!element) throw new Error(`no element matches ROI selector: ${opts.selector}`);
    const activeAnimations = await page.evaluate(() => document.getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const effect = animation.effect;
        const target = typeof KeyframeEffect !== 'undefined' && effect instanceof KeyframeEffect
          ? effect.target
          : null;
        const rect = target instanceof Element ? target.getBoundingClientRect() : null;
        return {
          name: (animation as CSSAnimation).animationName || animation.id || 'unnamed',
          targetIsDocument: target === document.documentElement || target === document.body
            || (rect !== null && rect.left <= 0 && rect.top <= 0 && rect.right >= innerWidth && rect.bottom >= innerHeight),
        };
      }));
    if (activeAnimations.length > 1) throw new Error('one motion decision rejects multiple concurrent load concepts');
    if (activeAnimations.some((animation) => !animation.targetIsDocument)) throw new Error('motion scene contains an unrelated sibling animation rather than a whole-page production boundary');
    const roi = { x: 0, y: 0, width: opts.viewport.width, height: opts.viewport.height };
    const receipt = async (name: string): Promise<ObservedCaptureReceipt> => {
      const output = join(opts.outDir, `${opts.runId}-${name}.png`);
      const bytes = await page.screenshot({ fullPage: false });
      const path = adapter.write(projectOutputPath(adapter, output), bytes);
      return { path, bytesBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') };
    };
    const baseline = await receipt('baseline');
    await new Promise<void>((resolveInterval) => setTimeout(resolveInterval, Math.max(1, Math.floor(interval / 3))));
    const start = await receipt('start');
    const startTimestampMs = Date.now() - started;
    const noiseFloor = Math.max(computeEnergy([Buffer.from(baseline.bytesBase64, 'base64'), Buffer.from(start.bytesBase64, 'base64')]).peakEnergy, Number.EPSILON);
    if (opts.trigger !== 'load') throw new Error('positive motion evidence only accepts an observed load scene; scroll and pointer affordances cannot satisfy it');
    await new Promise<void>((resolveInterval) => setTimeout(resolveInterval, interval));
    const mid = await receipt('mid');
    const midTimestampMs = Date.now() - started;
    await new Promise<void>((resolveInterval) => setTimeout(resolveInterval, interval));
    const end = await receipt('end');
    const endTimestampMs = Date.now() - started;
    const energy = computeEnergy([Buffer.from(start.bytesBase64, 'base64'), Buffer.from(mid.bytesBase64, 'base64'), Buffer.from(end.bytesBase64, 'base64')]);
    if (energy.peakEnergy <= noiseFloor) throw new Error('selector-local ROI did not exceed its measured noise floor');
    const reducedPage = await browser.newPage({ viewport: opts.viewport });
    let reduced: ObservedCaptureReceipt;
    let reducedEnergy: number;
    try {
      await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
      await reducedPage.goto(toUrl(target), { waitUntil: 'networkidle' });
      await waitForDocumentFonts(reducedPage);
      const reducedElement = await reducedPage.$(opts.selector);
      if (!reducedElement) throw new Error(`reduced-motion page has no ROI selector: ${opts.selector}`);
      const reducedBox = await reducedElement.boundingBox();
      if (!reducedBox) throw new Error(`reduced-motion ROI selector is not visible: ${opts.selector}`);
      const reducedRoi = { x: Math.max(0, reducedBox.x), y: Math.max(0, reducedBox.y), width: Math.min(reducedBox.width, opts.viewport.width - Math.max(0, reducedBox.x)), height: Math.min(reducedBox.height, opts.viewport.height - Math.max(0, reducedBox.y)) };
      if (reducedRoi.width <= 1 || reducedRoi.height <= 1) throw new Error(`reduced-motion ROI selector is outside viewport: ${opts.selector}`);
      const stableFrames: Buffer[] = [];
      for (let frame = 0; frame < 3; frame++) {
        if (frame > 0) await new Promise<void>((resolveInterval) => setTimeout(resolveInterval, interval));
        stableFrames.push(await reducedPage.screenshot({ clip: reducedRoi }));
      }
      if (computeEnergy(stableFrames).peakEnergy > noiseFloor) throw new Error('fresh reduced-motion page did not remain stable across three frames');
      const bytes = stableFrames[2]!;
      const path = adapter.write(projectOutputPath(adapter, join(opts.outDir, `${opts.runId}-reduced.png`)), bytes);
      reduced = { path, bytesBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') };
      reducedEnergy = computeEnergy([Buffer.from(end.bytesBase64, 'base64'), bytes]).peakEnergy;
    } finally {
      await reducedPage.close();
    }
    const reducedMotionBehavior = reducedEnergy <= reducedMotionRemovalThreshold(noiseFloor) ? 'removed' : 'static-equivalent';
    return {
      schema: MOTION_EVIDENCE_V2_SCHEMA, artDirectionHash: opts.artDirectionHash, motionDecision: 'one',
      observed: {
        browser: { name: 'chromium', version: browser.version() }, runId: opts.runId, buildHash: opts.buildHash, viewport: opts.viewport,
        triggerTranscript: transcript, sourceInfluence: opts.sourceInfluence ?? (opts.referenceSlotId ? { kind: 'reference-slot', referenceSlotId: opts.referenceSlotId } : (() => { throw new Error('motion evidence requires a source reference slot or approved recipe'); })()),
      },
      scenes: [{
        trigger: opts.trigger, roiSelector: opts.selector, roi, boundary: 'viewport', activeAnimationCount: activeAnimations.length,
        calibration: { noiseFloor, roiEnergy: energy.peakEnergy },
        start: { timestampMs: startTimestampMs, capture: start }, mid: { timestampMs: midTimestampMs, capture: mid }, end: { timestampMs: endTimestampMs, capture: end },
        reducedMotion: { capture: reduced, behavior: reducedMotionBehavior },
      }],
    };
  }));
}
export const MOTION_EVIDENCE_V2_SCHEMA = 'motion-evidence-v2' as const;

export type ObservedCaptureReceipt = {
  readonly path: string;
  readonly bytesBase64: string;
  readonly sha256: string;
};

export type MotionSourceInfluence =
  | { readonly kind: 'reference-slot'; readonly referenceSlotId: string }
  | { readonly kind: 'approved-recipe'; readonly recipeId: string; readonly recipeSha256: string };

export type MotionEvidenceV2 = {
  readonly schema: typeof MOTION_EVIDENCE_V2_SCHEMA;
  readonly artDirectionHash: string;
  readonly motionDecision: 'one';
  readonly observed: {
    readonly browser: { readonly name: 'chromium'; readonly version: string };
    readonly runId: string;
    readonly buildHash: string;
    readonly viewport: Viewport;
    readonly triggerTranscript: readonly { readonly event: 'load'; readonly timestampMs: number }[];
    readonly sourceInfluence: MotionSourceInfluence;
  };
  readonly scenes: readonly [{
    readonly trigger: 'load';
    readonly roiSelector: string;
    readonly roi: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly boundary: 'viewport';
    readonly activeAnimationCount: number;
    readonly calibration: { readonly noiseFloor: number; readonly roiEnergy: number };
    readonly start: { readonly timestampMs: number; readonly capture: ObservedCaptureReceipt };
    readonly mid: { readonly timestampMs: number; readonly capture: ObservedCaptureReceipt };
    readonly end: { readonly timestampMs: number; readonly capture: ObservedCaptureReceipt };
    readonly reducedMotion: {
      readonly capture: ObservedCaptureReceipt;
      readonly behavior: 'removed' | 'static-equivalent';
    };
  }];
};

export class MotionEvidenceValidationError extends Error {
  override readonly name = 'MotionEvidenceValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`motion evidence is invalid: ${reason}`);
    this.reason = reason;
  }
}

const EVIDENCE_SHA256 = /^[a-f0-9]{64}$/;

function motionFail(reason: string): never { throw new MotionEvidenceValidationError(reason); }
function motionObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) motionFail(`${field} must be an object`);
  return value as Record<string, unknown>;
}
function motionExact(value: Record<string, unknown>, keys: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) motionFail(`${field} has unexpected keys`);
}
function motionHash(value: unknown, field: string): void {
  if (typeof value !== 'string' || !EVIDENCE_SHA256.test(value)) motionFail(`${field} must be a lowercase SHA-256 hash`);
}
function motionText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') motionFail(`${field} must be non-empty text`);
  return value;
}
function motionPositive(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) motionFail(`${field} must be positive`);
  return value;
}
function motionReceipt(value: unknown, field: string): ObservedCaptureReceipt {
  const receipt = motionObject(value, field);
  motionExact(receipt, ['path', 'bytesBase64', 'sha256'], field);
  const path = motionText(receipt.path, `${field}.path`);
  const bytesBase64 = motionText(receipt.bytesBase64, `${field}.bytesBase64`);
  motionHash(receipt.sha256, `${field}.sha256`);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(bytesBase64, 'base64');
  } catch {
    motionFail(`${field}.bytesBase64 must decode`);
  }
  if (bytes.length === 0 || bytes.toString('base64') !== bytesBase64 || createHash('sha256').update(bytes).digest('hex') !== receipt.sha256) {
    motionFail(`${field} bytes do not match sha256`);
  }
  if (!existsSync(path) || !readFileSync(path).equals(bytes)) motionFail(`${field} path does not contain captured bytes`);
  return receipt as ObservedCaptureReceipt;
}
function motionTimestamp(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) motionFail(`${field} must be a non-negative finite number`);
  return value;
}

/**
 * Validates the single meaningful motion scene allowed for a `one` direction.
 * Hover/focus affordances and tiny decorative pulses are deliberately absent from
 * the trigger vocabulary, so they cannot be promoted into a motion obligation.
 */
/**
 * Validates an execution receipt rather than declarative frame hashes. Every frame
 * must be recoverable from its path and its digest is recomputed from the captured
 * bytes, so opaque or forged hashes cannot satisfy a scene obligation.
 */
export function validateMotionEvidenceV2(
  value: unknown,
  decision?: { readonly motionDecision: 'none' | 'one'; readonly buildHash?: string; readonly artDirectionHash?: string },
): MotionEvidenceV2 {
  const evidence = motionObject(value, 'evidence');
  motionExact(evidence, ['schema', 'artDirectionHash', 'motionDecision', 'observed', 'scenes'], 'evidence');
  if (evidence.schema !== MOTION_EVIDENCE_V2_SCHEMA) motionFail('unsupported schema');
  motionHash(evidence.artDirectionHash, 'artDirectionHash');
  if (evidence.motionDecision !== 'one') motionFail('motionDecision must be one');
  if (decision?.artDirectionHash !== undefined && evidence.artDirectionHash !== decision.artDirectionHash) motionFail('motion evidence art direction is not current');
  if (decision?.motionDecision !== undefined && decision.motionDecision !== 'one') motionFail('cannot bind motion evidence to a none decision');
  if (!Array.isArray(evidence.scenes) || evidence.scenes.length !== 1) motionFail('one requires exactly one whole-page load scene');

  const observed = motionObject(evidence.observed, 'observed');
  motionExact(observed, ['browser', 'runId', 'buildHash', 'viewport', 'triggerTranscript', 'sourceInfluence'], 'observed');
  const browser = motionObject(observed.browser, 'observed.browser');
  motionExact(browser, ['name', 'version'], 'observed.browser');
  if (browser.name !== 'chromium') motionFail('observed browser must be chromium');
  motionText(browser.version, 'observed.browser.version');
  motionText(observed.runId, 'observed.runId');
  motionHash(observed.buildHash, 'observed.buildHash');
  if (decision?.buildHash !== undefined && observed.buildHash !== decision.buildHash) motionFail('observed build does not match decision build');
  const viewport = motionObject(observed.viewport, 'observed.viewport');
  motionExact(viewport, ['width', 'height'], 'observed.viewport');
  for (const dimension of ['width', 'height'] as const) {
    if (!Number.isInteger(viewport[dimension]) || (viewport[dimension] as number) <= 0) motionFail(`observed.viewport.${dimension} must be positive integer`);
  }
  if (!Array.isArray(observed.triggerTranscript) || observed.triggerTranscript.length === 0) motionFail('trigger transcript requires observed events');
  let lastTranscriptTime = -1;
  const transcriptEvents = new Set<string>();
  for (const [index, entry] of observed.triggerTranscript.entries()) {
    const transcript = motionObject(entry, `observed.triggerTranscript[${index}]`);
    motionExact(transcript, ['event', 'timestampMs'], `observed.triggerTranscript[${index}]`);
    if (transcript.event !== 'load') motionFail('trigger transcript contains unsupported event');
    const timestamp = motionTimestamp(transcript.timestampMs, `observed.triggerTranscript[${index}].timestampMs`);
    if (timestamp < lastTranscriptTime) motionFail('trigger transcript timestamps must be monotonic');
    lastTranscriptTime = timestamp;
    transcriptEvents.add(transcript.event as string);
  }
  if (!transcriptEvents.has('load')) motionFail('trigger transcript must include load');
  const influence = motionObject(observed.sourceInfluence, 'observed.sourceInfluence');
  if (influence.kind === 'reference-slot') {
    motionExact(influence, ['kind', 'referenceSlotId'], 'observed.sourceInfluence');
    motionText(influence.referenceSlotId, 'observed.sourceInfluence.referenceSlotId');
  } else if (influence.kind === 'approved-recipe') {
    motionExact(influence, ['kind', 'recipeId', 'recipeSha256'], 'observed.sourceInfluence');
    motionText(influence.recipeId, 'observed.sourceInfluence.recipeId');
    motionHash(influence.recipeSha256, 'observed.sourceInfluence.recipeSha256');
  } else {
    motionFail('source influence must bind a reference slot or approved recipe');
  }

  const scene = motionObject(evidence.scenes[0], 'scenes[0]');
  motionExact(scene, ['trigger', 'roiSelector', 'roi', 'boundary', 'activeAnimationCount', 'calibration', 'start', 'mid', 'end', 'reducedMotion'], 'scenes[0]');
  if (scene.trigger !== 'load') motionFail('scenes[0].trigger must be a declared load scene');
  if (scene.boundary !== 'viewport') motionFail('motion scene must declare the whole viewport production boundary');
  if (!Number.isInteger(scene.activeAnimationCount) || (scene.activeAnimationCount as number) < 0 || (scene.activeAnimationCount as number) > 1) motionFail('motion scene must inventory zero or one active production animation');
  if (!transcriptEvents.has(scene.trigger)) motionFail('scene trigger is absent from observed transcript');
  motionText(scene.roiSelector, 'scenes[0].roiSelector');
  const roi = motionObject(scene.roi, 'scenes[0].roi');
  motionExact(roi, ['x', 'y', 'width', 'height'], 'scenes[0].roi');
  for (const dimension of ['x', 'y', 'width', 'height'] as const) {
    if (typeof roi[dimension] !== 'number' || !Number.isFinite(roi[dimension])) motionFail(`scenes[0].roi.${dimension} must be finite`);
  }
  if ((roi.width as number) <= 1 || (roi.height as number) <= 1 || (roi.x as number) < 0 || (roi.y as number) < 0
    || (roi.x as number) + (roi.width as number) > (viewport.width as number) || (roi.y as number) + (roi.height as number) > (viewport.height as number)) motionFail('scene must be a visible non-trivial viewport rectangle');
  if ((roi.x as number) !== 0 || (roi.y as number) !== 0 || (roi.width as number) !== (viewport.width as number) || (roi.height as number) !== (viewport.height as number)) motionFail('motion scene must inventory the whole viewport, not a caller-selected ROI');
  const calibration = motionObject(scene.calibration, 'scenes[0].calibration');
  motionExact(calibration, ['noiseFloor', 'roiEnergy'], 'scenes[0].calibration');
  const noise = motionPositive(calibration.noiseFloor, 'scenes[0].calibration.noiseFloor');
  const energy = motionPositive(calibration.roiEnergy, 'scenes[0].calibration.roiEnergy');
  if (energy <= noise) motionFail('ROI energy must exceed calibrated noise floor');

  const timestamps: number[] = [];
  const captures: ObservedCaptureReceipt[] = [];
  for (const stage of ['start', 'mid', 'end'] as const) {
    const frame = motionObject(scene[stage], `scenes[0].${stage}`);
    motionExact(frame, ['timestampMs', 'capture'], `scenes[0].${stage}`);
    timestamps.push(motionTimestamp(frame.timestampMs, `scenes[0].${stage}.timestampMs`));
    captures.push(motionReceipt(frame.capture, `scenes[0].${stage}.capture`));
  }
  const observedEnergy = computeEnergy(captures.map((capture) => Buffer.from(capture.bytesBase64, 'base64'))).peakEnergy;
  if (energy !== observedEnergy) motionFail('ROI energy does not match captured pixel evidence');
  if (!(timestamps[0]! < timestamps[1]! && timestamps[1]! < timestamps[2]!)) motionFail('ROI timestamps must be strictly start < mid < end');
  const reduced = motionObject(scene.reducedMotion, 'scenes[0].reducedMotion');
  motionExact(reduced, ['capture', 'behavior'], 'scenes[0].reducedMotion');
  const reducedReceipt = motionReceipt(reduced.capture, 'scenes[0].reducedMotion.capture');
  if (reduced.behavior !== 'removed' && reduced.behavior !== 'static-equivalent') motionFail('reduced-motion counterpart must remove motion or show a static equivalent');
  const observedReducedEnergy = computeEnergy([
    Buffer.from(captures[2]!.bytesBase64, 'base64'),
    Buffer.from(reducedReceipt.bytesBase64, 'base64'),
  ]).peakEnergy;
  const observedBehavior = observedReducedEnergy <= reducedMotionRemovalThreshold(noise) ? 'removed' : 'static-equivalent';
  if (reduced.behavior !== observedBehavior) motionFail('reduced-motion behavior does not match captured pixel evidence');
  return evidence as MotionEvidenceV2;
}
/**
 * Host-observed Beat receipt. The collector never accepts caller-provided Beat
 * entries: it extracts the live DOM at both fixed harness viewports.
 */
export async function captureRenderedBeatReceipt(
  target: string,
  opts: { readonly adapter: ProjectWriteAdapter; readonly out: string; readonly artDirectionHash: string; readonly copyDeckSha256: string; readonly beatIds: readonly string[] },
): Promise<RenderedBeatProof> {
  const adapter = requireProjectWriteAdapter(opts.adapter.projectRoot, opts.adapter);
  const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }] as const;
  const renderedBeats: RenderedBeat[] = [];
  await withBrowser(async (browser) => {
    for (const viewport of viewports) {
      await onPage(browser, target, viewport, async (page, httpStatus, resolvedUrl) => {
        await assertNotBlocked(page, httpStatus, resolvedUrl);
        const observed = await page.evaluate((observedViewport) => [...document.querySelectorAll<HTMLElement>('[data-omd-beat]')].map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const parent = element.parentElement?.closest<HTMLElement>('[data-omd-beat]');
          return {
            id: element.dataset.omdBeat ?? '',
            boundary: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
              && rect.width > 1 && rect.height > 1,
            distinctRegions: element.querySelectorAll('[data-omd-beat]').length,
            ancestorBeatIds: parent?.dataset.omdBeat ? [parent.dataset.omdBeat] : [],
            rendered: true as const,
            observedViewport,
          };
        }), viewport);
        renderedBeats.push(...observed);
      });
    }
  });
  const proof: RenderedBeatProof = {
    schema: 'rendered-beat-receipt-v1',
    artDirectionHash: opts.artDirectionHash,
    copyDeckSha256: opts.copyDeckSha256,
    beatIds: [...opts.beatIds],
    renderedBeats,
    captureViewports: viewports,
  };
  adapter.write(projectOutputPath(adapter, opts.out), `${JSON.stringify(proof)}\n`);
  return proof;
}
