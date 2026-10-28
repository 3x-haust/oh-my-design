import { createHash } from 'node:crypto';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { isNearUniformBlankCapture } from '../ref/blank-capture.ts';
import { onPage, withBrowser } from '../render/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { TASTE_VIEWPORTS, type TasteViewport } from './taste-comparison-contract.ts';

/**
 * Public, human-designed pages the build is compared against. Only the URLs are source-owned:
 * the pages are captured at run time and their pixels never ship with OMD or enter the design record.
 */
export const DEFAULT_TASTE_ANCHORS = Object.freeze([
  'https://linear.app',
  'https://www.raycast.com',
  'https://resend.com',
  'https://vercel.com',
  'https://leviosa.ai.kr',
  'https://kaleoyouth.com',
  'https://wonand.com',
]);
export const TASTE_ANCHORS_PER_RUN = 2;
export const TASTE_ANCHOR_DIRECTORY = '.omd/taste/anchors';
const CHALLENGE_TITLE = /just a moment|attention required|access denied|verify you are human|captcha|security check/i;
const SETTLE_MS = 800;

export type TasteAnchorCapture = Readonly<{ viewport: TasteViewport; width: number; height: number; sha256: string; path: string }>;
export type CapturedTasteAnchor = Readonly<{ url: string; captures: readonly TasteAnchorCapture[] }>;
export type SkippedTasteAnchor = Readonly<{ url: string; reason: string }>;

/** Different builds see different anchors, but one build always sees the same rotation. */
export function rotatedTasteAnchors(buildSha256: string, anchors: readonly string[] = DEFAULT_TASTE_ANCHORS): readonly string[] {
  const offset = Number.parseInt(buildSha256.slice(0, 8), 16) % anchors.length;
  return [...anchors.slice(offset), ...anchors.slice(0, offset)];
}

export function normalizeTasteAnchor(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`TASTE_ANCHOR_INVALID: ${value} is not an absolute http(s) URL`); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`TASTE_ANCHOR_INVALID: ${value} is not an absolute http(s) URL`);
  return url.href;
}

async function captureViewport(browser: import('playwright').Browser, url: string, viewport: TasteViewport): Promise<Buffer> {
  return onPage(browser, url, TASTE_VIEWPORTS[viewport], async (page, status) => {
    if (status !== 200) throw new Error(`HTTP ${status ?? 'unknown'}`);
    const title = await page.title().catch(() => '');
    if (CHALLENGE_TITLE.test(title)) throw new Error(`challenge page (${title.slice(0, 80)})`);
    // Lazy sections and scroll-revealed heroes paint only after the page has been scrolled once.
    await page.evaluate(browserCallback(() => window.scrollTo(0, document.documentElement.scrollHeight)));
    await page.waitForTimeout(SETTLE_MS / 2);
    await page.evaluate(browserCallback(() => window.scrollTo(0, 0)));
    await page.waitForTimeout(SETTLE_MS);
    const bytes = await page.screenshot({ fullPage: false });
    if (isNearUniformBlankCapture(bytes)) throw new Error('blank first screen');
    return bytes;
  });
}

/** Captures anchors in order until `limit` succeed; a blocked, challenged, failing or blank anchor is skipped and recorded. */
export async function captureTasteAnchors(writer: ProjectWriteAdapter, candidates: readonly string[], limit: number): Promise<Readonly<{
  used: readonly CapturedTasteAnchor[]; skipped: readonly SkippedTasteAnchor[];
}>> {
  const used: CapturedTasteAnchor[] = [], skipped: SkippedTasteAnchor[] = [];
  await withBrowser(async browser => {
    for (const url of candidates) {
      if (used.length >= limit) break;
      const shots: Readonly<{ viewport: TasteViewport; bytes: Buffer }>[] = [];
      try {
        for (const viewport of ['desktop', 'mobile'] as const) shots.push({ viewport, bytes: await captureViewport(browser, url, viewport) });
      } catch (error) {
        skipped.push({ url, reason: (error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 300) });
        continue;
      }
      // Third-party pixels stay out of the committed design record.
      writer.write(`${TASTE_ANCHOR_DIRECTORY}/.gitignore`, '*\n');
      used.push({ url, captures: shots.map(({ viewport, bytes }) => {
        const sha256 = createHash('sha256').update(bytes).digest('hex'), path = `${TASTE_ANCHOR_DIRECTORY}/${sha256}.png`;
        writer.writeContentAddressed(path, bytes);
        return { viewport, ...TASTE_VIEWPORTS[viewport], sha256, path };
      }) });
    }
  });
  return { used, skipped };
}
