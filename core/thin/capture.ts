import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { resolveRenderTarget } from '../render/serve.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { assertRobotsAllow } from './robots.ts';
import { put, ThinError } from './state.ts';

/**
 * Seeing for the thin loop, with no route or browse session behind it: capture a page (the result, the chosen real work,
 * a before-state) at desktop and phone width, look at a gallery's search results as one image, and keep one reference
 * image with its one job. Galleries refuse the "HeadlessChrome" product token, so pages are opened as plain Chrome.
 * A remote page or image opens only where its site's robots.txt lets an AI agent in (`robots.ts`); the galleries named
 * here are ones whose robots.txt invites agents that fetch for a person. Pinterest, Behance, Are.na and Godly ask AI
 * agents to stay out, so they are not offered.
 */
export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const GALLERIES: Readonly<Record<string, (query: string) => string>> = {
  dribbble: query => `https://dribbble.com/search/${encodeURIComponent(query)}`,
  cosmos: query => `https://www.cosmos.so/search/elements/${encodeURIComponent(query)}`,
  siteinspire: query => `https://www.siteinspire.com/search?query=${encodeURIComponent(query)}`,
};
export const THIN_GALLERIES = Object.keys(GALLERIES);
const MAX_CAPTURE_HEIGHT = 14_000;

export const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'capture';

async function withBrowser<T>(work: (open: (viewport: { width: number; height: number }, mobile: boolean) => Promise<Page>) => Promise<T>): Promise<T> {
  const { chromium } = await import('playwright');
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const probe = await browser.newPage();
    const agent = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome/', 'Chrome/');
    await probe.close();
    return await work(async (viewport, mobile) => (await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile,
      userAgent: agent })).newPage());
  } finally { await browser.close(); }
}

async function settle(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
  if (response === null && page.url() === 'about:blank') throw new ThinError(`could not open ${url}`);
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = page.viewportSize()?.height ?? 900;
  for (let y = 0; y < Math.min(height, MAX_CAPTURE_HEIGHT); y += step) {
    await page.evaluate(top => window.scrollTo(0, top), y);
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

/** Desktop and phone captures of one page, full length, as `<name>-desktop.png` and `<name>-mobile.png`. */
export async function shoot(target: string, writer: ProjectWriteAdapter, outDir: string, name: string): Promise<string[]> {
  const resolved = await resolveRenderTarget(target);
  try {
    await assertRobotsAllow(resolved.url);
    return await withBrowser(async open => {
      const files: string[] = [];
      for (const [label, viewport] of Object.entries(VIEWPORTS)) {
        const page = await open(viewport, label === 'mobile');
        await settle(page, resolved.url);
        const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), MAX_CAPTURE_HEIGHT);
        const file = `${outDir}/${name}-${label}.png`;
        put(writer, file, await page.screenshot({ fullPage: true, ...(height >= MAX_CAPTURE_HEIGHT
          ? { clip: { x: 0, y: 0, width: viewport.width, height: MAX_CAPTURE_HEIGHT } } : {}) }));
        files.push(file);
      }
      return files;
    });
  } finally { await resolved.close(); }
}

export type GalleryItem = { image: string; link: string | null; alt: string };

/** One gallery search (or any URL), seen as one image of its results, with the item images it shows. */
export async function searchGallery(source: string, query: string, writer: ProjectWriteAdapter, outDir: string): Promise<{ file: string; url: string; items: GalleryItem[] }> {
  const gallery = GALLERIES[source.toLowerCase()];
  const url = gallery ? gallery(query) : /^https?:\/\//.test(source) ? source.replace('%s', encodeURIComponent(query)) : null;
  if (url === null) throw new ThinError(`refs searches ${THIN_GALLERIES.join(', ')} or an https URL (with %s for the query)`);
  await assertRobotsAllow(url);
  return withBrowser(async open => {
    const page = await open({ width: 1440, height: 1600 }, false);
    await settle(page, url);
    await page.waitForTimeout(1_500);
    const file = `${outDir}/${slug(gallery ? source : new URL(url).hostname)}-${slug(query)}.png`;
    put(writer, file, await page.screenshot());
    const items = await page.evaluate(() => [...document.images]
      .filter(image => image.getBoundingClientRect().width >= 200 && image.getBoundingClientRect().height >= 120)
      .map(image => ({ image: image.currentSrc || image.src, link: image.closest('a')?.href ?? null, alt: (image.alt || '').slice(0, 120) }))
      .filter(item => /^https?:/.test(item.image)).slice(0, 30));
    return { file, url, items };
  });
}

/** Keep one reference image for one job, listed in `jobs.md` beside it. */
export async function keepImage(url: string, job: string, writer: ProjectWriteAdapter, outDir: string): Promise<string> {
  if (!/^https?:\/\//.test(url)) throw new ThinError('keep takes the https URL of one image');
  await assertRobotsAllow(url);
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' },
    signal: AbortSignal.timeout(30_000) });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.startsWith('image/')) throw new ThinError(`${url} did not return an image (${response.status} ${type})`);
  const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg';
  const root = writer.projectRoot;
  let name = `${slug(job)}.${extension}`;
  for (let index = 2; existsSync(join(root, outDir, name)); index += 1) name = `${slug(job)}-${index}.${extension}`;
  put(writer, `${outDir}/${name}`, Buffer.from(await response.arrayBuffer()));
  const jobs = join(root, outDir, 'jobs.md');
  put(writer, `${outDir}/jobs.md`, `${existsSync(jobs) ? readFileSync(jobs, 'utf8') : ''}- ${name}: ${job} (${url})\n`);
  return `${outDir}/${name}`;
}
