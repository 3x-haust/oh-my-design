import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGraphicRenderRecord } from '../render/graphic-render-record.ts';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { resolveRenderTarget } from '../render/serve.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { readDesignBrief } from './design-brief.ts';

/**
 * Basics a designer keeps without being asked, observed on the real page by scrolling and following its own
 * links: the header stays in reach on a long page (25 of 26 finished landings measured on 2026-10-23 keep a
 * conventional header fixed or sticky; NN/g, "Sticky Headers"), and an in-page link lands its target below that
 * header rather than under it (MDN scroll-padding-top / scroll-margin-top). Each is a lead for the reviewer.
 */
export const PAGE_BASICS_SCHEMA = 'page-basics-v1';
const DIRECTORY = '.omd/first-render/basics';
const VIEWPORT = { width: 1280, height: 900 } as const;

export type PageBasics = Readonly<{
  schema: typeof PAGE_BASICS_SCHEMA;
  reportSha256: string;
  pageScreens: number;
  header: Readonly<{ found: boolean; staysInView: boolean }>;
  anchorsUnderHeader: readonly string[];
  missingHead: readonly string[];
  deadLinks: readonly string[];
  placedRasters: readonly string[];
}>;

export type PageBasicsTell = Readonly<{ viewId: 'page'; rule: string; path: string; message: string }>;

const findHeader = browserCallback((): { top: number; bottom: number; height: number } | null => {
  const candidates = [...document.querySelectorAll('header, [role="banner"], body > nav, body > div > nav')];
  const header = candidates.find(element => {
    const box = element.getBoundingClientRect();
    return box.width >= innerWidth * 0.6 && box.top + scrollY < 160 && box.height > 0 && box.height < innerHeight * 0.4;
  });
  if (!header) return null;
  header.setAttribute('data-omd-basics-header', '');
  const box = header.getBoundingClientRect();
  return { top: box.top, bottom: box.bottom, height: box.height };
});

const headerNow = browserCallback((): { top: number; bottom: number; visible: boolean } | null => {
  const header = document.querySelector('[data-omd-basics-header]');
  if (!header) return null;
  const box = header.getBoundingClientRect();
  const style = getComputedStyle(header);
  return { top: box.top, bottom: box.bottom, visible: style.visibility !== 'hidden' && Number(style.opacity) > 0.1 && box.bottom > 4 };
});

const headerAnchors = browserCallback((): string[] => {
  const header = document.querySelector('[data-omd-basics-header]');
  return [...(header?.querySelectorAll('a[href^="#"]') ?? [])].map(link => link.getAttribute('href') ?? '')
    .filter(href => href.length > 1 && document.getElementById(decodeURIComponent(href.slice(1))) !== null).slice(0, 6);
});

// The shipping basics every page carries (web.dev / MDN head metadata) and links that go nowhere.
const shippingBasics = browserCallback((): { missingHead: string[]; deadLinks: string[] } => {
  const head = (selector: string, attribute: string) => (document.querySelector(selector)?.getAttribute(attribute) ?? '').trim() !== '';
  const missingHead = [
    ...(document.title.trim() ? [] : ['<title>']),
    ...(head('meta[name="description"]', 'content') ? [] : ['meta description']),
    ...(head('meta[name="viewport"]', 'content') ? [] : ['meta viewport']),
    ...(head('link[rel~="icon"]', 'href') ? [] : ['favicon (link rel="icon")']),
    ...(head('meta[property="og:image"]', 'content') ? [] : ['Open Graph image (meta property="og:image")']),
    ...(document.documentElement.getAttribute('lang')?.trim() ? [] : ['<html lang>']),
  ];
  const deadLinks = [...document.querySelectorAll('a')].flatMap(link => {
    const href = link.getAttribute('href');
    const label = (link.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30) || link.getAttribute('aria-label') || 'unnamed link';
    if (href === null || href.trim() === '' || href === '#' || /^javascript:/i.test(href)) return [label];
    return href.startsWith('#') && document.getElementById(decodeURIComponent(href.slice(1))) === null ? [`${label} (${href})`] : [];
  }).slice(0, 8);
  return { missingHead, deadLinks };
});

// Large raster images in the first screens: each should be a graphic rendered from code, not a pasted screenshot.
const largeRasters = browserCallback((): { src: string; name: string }[] => [...document.querySelectorAll('img')].flatMap(image => {
  const box = image.getBoundingClientRect();
  const src = image.currentSrc || image.src;
  if (!src || /\.svg(?:[?#]|$)|^data:image\/svg/i.test(src) || box.top + scrollY > innerHeight * 3) return [];
  return box.width * box.height >= innerWidth * innerHeight * 0.12 ? [{ src, name: src.split('/').pop()?.split('?')[0] ?? src }] : [];
}));

const targetTop = browserCallback((href: string): number | null =>
  document.getElementById(decodeURIComponent(href.slice(1)))?.getBoundingClientRect().top ?? null);

/** A placed image's bytes, read from the build it was served from, matched against the graphics rendered from code. */
function renderedGraphic(root: string | undefined, target: string, src: string, servedFrom: string): boolean {
  if (root === undefined) return true;
  let path: string;
  try {
    const url = new URL(src);
    path = url.protocol === 'file:' ? fileURLToPath(url) : join(dirname(resolve(target)), decodeURIComponent(url.pathname.replace(new URL(servedFrom).pathname.replace(/[^/]*$/, ''), '')));
  } catch { return true; }
  if (!existsSync(path)) return true;
  const sha = createHash('sha256').update(readFileSync(path)).digest('hex');
  return readGraphicRenderRecord(root, sha) !== null;
}

export async function observePageBasics(target: string, reportSha256: string, root?: string): Promise<PageBasics> {
  const { chromium } = await import('playwright');
  const resolved = await resolveRenderTarget(target);
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, reducedMotion: 'reduce' });
    await page.goto(resolved.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const shipping = await page.evaluate(shippingBasics);
    const placedRasters = (await page.evaluate(largeRasters)).filter(image => !renderedGraphic(root, target, image.src, resolved.url)).map(image => image.name).filter((name, index, all) => all.indexOf(name) === index).slice(0, 6);
    const header = await page.evaluate(findHeader);
    let staysInView = false;
    const anchorsUnderHeader: string[] = [];
    if (header !== null) {
      await page.evaluate(top => window.scrollTo(0, top), Math.max(0, Math.min(2000, height - VIEWPORT.height)));
      await page.waitForTimeout(500);
      const scrolled = await page.evaluate(headerNow);
      staysInView = scrolled !== null && scrolled.visible && scrolled.top > -4 && scrolled.top < 40;
      for (const href of await page.evaluate(headerAnchors)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(150);
        await page.locator(`[data-omd-basics-header] a[href="${href.replaceAll('"', '\\"')}"]`).first().click({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(700);
        const now = await page.evaluate(headerNow);
        const top = await page.evaluate(targetTop, href);
        // A target hidden behind a header that stayed on screen; clamped targets near the page end are not counted.
        const atEnd = await page.evaluate(() => Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2);
        if (now !== null && now.visible && now.top > -4 && top !== null && top < now.bottom - 4 && !atEnd) anchorsUnderHeader.push(href);
      }
    }
    return { schema: PAGE_BASICS_SCHEMA, reportSha256, pageScreens: Math.round(height / VIEWPORT.height * 10) / 10,
      header: { found: header !== null, staysInView }, anchorsUnderHeader, ...shipping, placedRasters };
  } finally {
    await browser.close();
    await resolved.close();
  }
}

const recordPath = (reportSha256: string): string => `${DIRECTORY}/${reportSha256}.json`;

export async function capturePageBasics(root: string, target: string, reportSha256: string, writer: ProjectWriteAdapter): Promise<PageBasics> {
  const basics = await observePageBasics(target, reportSha256, root);
  writer.mkdir(DIRECTORY);
  writer.write(recordPath(reportSha256), `${JSON.stringify(basics, null, 2)}\n`);
  return basics;
}

export function readPageBasics(root: string, reportSha256: string): PageBasics | null {
  const path = join(root, recordPath(reportSha256));
  if (!existsSync(path)) return null;
  try {
    const basics = JSON.parse(readFileSync(path, 'utf8')) as PageBasics;
    return basics.schema === PAGE_BASICS_SCHEMA && basics.reportSha256 === reportSha256 ? basics : null;
  } catch { return null; }
}

/** The leads a page's basics give the reviewer and the maker. */
export function pageBasicsTells(basics: PageBasics | null, proofShowsOutput = false): PageBasicsTell[] {
  if (basics === null) return [];
  const tells: PageBasicsTell[] = [];
  if (basics.header.found && !basics.header.staysInView && basics.pageScreens >= 2.5) {
    tells.push({ viewId: 'page', rule: 'PAGE-HEADER-SCROLLS-AWAY', path: 'header', message: `On a page ${basics.pageScreens} screens long the header `
      + 'scrolls away; 25 of 26 finished landings measured keep a conventional header in view (sticky or fixed, with its own background).' });
  }
  if (basics.anchorsUnderHeader.length) {
    tells.push({ viewId: 'page', rule: 'PAGE-ANCHOR-UNDER-HEADER', path: basics.anchorsUnderHeader.join(' '), message: `In-page links `
      + `${basics.anchorsUnderHeader.join(', ')} land their target under the fixed header; give the targets scroll-margin-top (or the page scroll-padding-top) equal to the header height.` });
  }
  if ((basics.placedRasters ?? []).length) {
    // When the brief's hero proof is the product's real output or interface, an image of that output is the proof itself.
    tells.push({ viewId: 'page', rule: 'PAGE-PLACED-RASTER', path: 'img', message: proofShowsOutput
      ? `Large images placed as pictures: ${basics.placedRasters.join(', ')}. The brief's hero proof is the product's real output, and an image `
        + 'of that output may carry it: show it as the protagonist, whole and large enough that its words read, not a thumbnail in a frame. '
        + 'Any other large image is a lit object built in code and rendered with omd render --graphic, or product footage from omd record.'
      : `Large images that are not graphics rendered from code: `
        + `${basics.placedRasters.join(', ')}. A landing's visual is a lit object built in code and rendered with omd render --graphic, or real `
        + 'product footage from omd record; a screenshot or photo pasted into a frame is a thumbnail, not a graphic.' });
  }
  if (basics.missingHead.length) {
    tells.push({ viewId: 'page', rule: 'PAGE-HEAD-METADATA', path: 'head', message: `The page ships without ${basics.missingHead.join(', ')}; `
      + 'every finished page carries a real title and description, the viewport meta, a favicon, a social preview image and its language.' });
  }
  if (basics.deadLinks.length) {
    tells.push({ viewId: 'page', rule: 'PAGE-DEAD-LINKS', path: 'a', message: `Links that go nowhere: ${basics.deadLinks.join(', ')}. `
      + 'Point each at a real destination or section, or make it a button that does something; remove the ones that have neither.' });
  }
  return tells;
}

/** The brief says the hero proves the product with its real output or working interface, not a concept graphic. */
export function proofShowsOutput(root: string): boolean {
  const mode = readDesignBrief(root)?.heroProof.mode;
  return mode === 'real-output' || mode === 'working-product';
}
