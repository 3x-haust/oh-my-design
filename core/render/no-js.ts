// Measures whether a page's content survives with JavaScript disabled.
//
// This is a verbatim criterion from the Awwwards Developer Award guidelines' accessibility
// checklist ("Content accessible with no JS", alongside "Content accessible with no CSS"), and it is
// the exact failure mode a scroll-reveal introduces when it is built carelessly: elements default to
// `opacity: 0` and are revealed by an IntersectionObserver, so without JavaScript the page renders
// as a column of empty boxes. The harness now actively pushes scroll motion onto persuasion
// surfaces, which makes this the matching guardrail — reveal the content, never gate it.
//
// Deterministic: two real renders of the same URL, one with JavaScript enabled and one without,
// compared on the text a user can actually see.

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

/** Below this share of the JavaScript-enabled text, the no-JS render has lost content. */
export const NO_JS_TEXT_RATIO_FLOOR = 0.5;
/** This many sizable-but-invisible blocks in the no-JS render is a reveal gating content. */
export const NO_JS_HIDDEN_BLOCK_FLOOR = 3;

export type NoJsObservation = {
  /** Length of the visible, trimmed text with JavaScript enabled. */
  readonly withJsTextLength: number;
  /** Same measurement with JavaScript disabled. */
  readonly withoutJsTextLength: number;
  /** `withoutJsTextLength / withJsTextLength`, 1 when the page needs no JavaScript for content. */
  readonly textRatio: number;
  /** Sizable blocks rendered invisible (opacity < 0.1 / visibility hidden) without JavaScript. */
  readonly hiddenBlocks: number;
};

export type NoJsFinding = {
  readonly id: 'NOJS-CONTENT-LOSS';
  readonly message: string;
};

function toUrl(target: string): string {
  if (/^https?:\/\//.test(target)) return target;
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`no such page: ${target}`);
  return pathToFileURL(path).href;
}

/**
 * Counts elements that stay invisible *while they are in the viewport* during a scroll-through.
 *
 * This is the distinction that matters. A CSS scroll-driven reveal leaves below-fold elements at
 * their range-start, but the browser advances them as the reader scrolls — with no JavaScript at
 * all — so they are never invisible while being looked at. An IntersectionObserver reveal that
 * starts at `opacity: 0` never advances without JavaScript: the element is invisible exactly when
 * the reader has scrolled to it. Counting only "invisible while in view" separates a lawful
 * progressive enhancement from content gating.
 */
/**
 * One synchronous sweep at the current scroll position: which sizable text blocks are in view, and
 * which of those are invisible. Runs identically with JavaScript enabled or disabled, because the
 * caller — not the page — drives the scrolling and the waiting (a JS-disabled page has no timers).
 */
const SWEEP = `(() => {
  const blocks = Array.from(document.querySelectorAll('body *')).filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width >= 40 && rect.height >= 20 && (el.textContent || '').trim().length > 0;
  });
  const inView = [];
  const invisible = [];
  blocks.forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    if (!(rect.top < window.innerHeight * 0.85 && rect.bottom > window.innerHeight * 0.15)) return;
    inView.push(index);
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || Number(style.opacity) < 0.1) invisible.push(index);
  });
  const text = (document.body && document.body.innerText ? document.body.innerText : '').replace(/\\s+/g, ' ').trim();
  return { inView, invisible, textLength: text.length, scrollHeight: document.documentElement.scrollHeight };
})()`;

/**
 * Renders the target twice — with and without JavaScript — and reports what the content survives.
 * Throws on an absent target.
 */
export async function observeNoJsContent(
  target: string,
  opts: { readonly viewport: { readonly width: number; readonly height: number } },
): Promise<NoJsObservation> {
  const url = toUrl(target);
  const viewport = { width: opts.viewport.width, height: opts.viewport.height };
  const browser = await chromium.launch({ headless: true });
  try {
    type Sweep = { inView: number[]; invisible: number[]; textLength: number; scrollHeight: number };

    const measure = async (javaScriptEnabled: boolean): Promise<{ textLength: number; hidden: number }> => {
      const context = await browser.newContext({ viewport, javaScriptEnabled });
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: javaScriptEnabled ? 'networkidle' : 'domcontentloaded' });
        // The caller drives the sweep: a JS-disabled page has no timers, so the page cannot wait
        // for itself. Each step scrolls, settles, and reports which in-view blocks are invisible.
        const gated = new Set<number>();
        const revealed = new Set<number>();
        let textLength = 0;
        const stride = Math.max(120, Math.floor(viewport.height / 2));
        let y = 0;
        let limit = viewport.height;
        for (let guard = 0; guard < 60; guard += 1) {
          await page.evaluate((top) => window.scrollTo(0, top as number), y);
          await page.waitForTimeout(90);
          const sweep = await page.evaluate(SWEEP) as Sweep;
          textLength = Math.max(textLength, sweep.textLength);
          limit = sweep.scrollHeight;
          for (const index of sweep.invisible) gated.add(index);
          for (const index of sweep.inView) if (!sweep.invisible.includes(index)) revealed.add(index);
          if (y >= limit) break;
          y += stride;
        }
        // A block that was invisible at one position but visible at another was mid-animation, not
        // gated; only blocks never seen visible while in view count as content loss.
        for (const index of revealed) gated.delete(index);
        return { textLength, hidden: gated.size };
      } finally {
        await context.close();
      }
    };

    const withJs = await measure(true);
    const withoutJs = await measure(false);
    const textRatio = withJs.textLength > 0 ? withoutJs.textLength / withJs.textLength : 1;
    return {
      withJsTextLength: withJs.textLength,
      withoutJsTextLength: withoutJs.textLength,
      textRatio: Math.round(textRatio * 10000) / 10000,
      hiddenBlocks: withoutJs.hidden,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Flags `NOJS-CONTENT-LOSS` when the no-JavaScript render loses most of the page's text or leaves
 * several sizable blocks invisible — the signature of a reveal that gates content instead of
 * enhancing it. Returns null when the content survives.
 */
export function checkNoJsContent(observation: NoJsObservation): NoJsFinding | null {
  const lostText = observation.textRatio < NO_JS_TEXT_RATIO_FLOOR;
  const gatedBlocks = observation.hiddenBlocks >= NO_JS_HIDDEN_BLOCK_FLOOR;
  if (!lostText && !gatedBlocks) return null;
  const reasons: string[] = [];
  if (lostText) reasons.push(`only ${Math.round(observation.textRatio * 100)}% of the text renders without JavaScript`);
  if (gatedBlocks) reasons.push(`${observation.hiddenBlocks} sizable blocks stay invisible without JavaScript`);
  return {
    id: 'NOJS-CONTENT-LOSS',
    message:
      `${reasons.join('; ')}. A reveal must enhance content, never gate it (Awwwards developer accessibility criterion: "content accessible with no JS"). Ship the settled layout as the default state and let motion animate from it — a CSS scroll-driven animation degrades to the settled state on its own, whereas an IntersectionObserver that starts at opacity 0 leaves an empty page.`,
  };
}
