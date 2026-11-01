import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { resolveRenderTarget } from '../render/serve.ts';
import type { readPersistedRoute } from '../route/index.ts';
import { newSurface } from './new-surface-advisories.ts';

type Route = ReturnType<typeof readPersistedRoute>;

/**
 * Two things a new page owes the person who asked for it, observed on the real build before any review:
 * the project's own mark shown as the file it ships (not redrawn in CSS or retyped), and, when they asked
 * for 3D, a live WebGL scene on the page rather than a picture of one.
 */
const VIEWPORT = { width: 1280, height: 900 } as const;
/** A scene smaller than a quarter of a screen is an ornament, not the 3D the person asked to see. */
export const LIVE_SCENE_SHARE = 0.25;
const MAX_SCREENS = 10;
const SKIPPED = new Set(['node_modules', '.git', '.omd', '.omc', 'dist', 'build', 'coverage', '.next', 'out']);

/** The request asks to see something in 3D. */
export function requestsThreeD(request: string): boolean {
  return /(?:^|[^a-z0-9])3d(?![a-z0-9])|three\.?js|webgl|입체|3차원/i.test(request);
}

export type BrandMark = Readonly<{ path: string; sha256: string; pathData: readonly string[] }>;

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const normalizedPathData = (value: string): string => value.replace(/[\s,]+/g, ' ').trim();

/** Logo and lockup files the project ships (anything in a brand folder, or files named as logos), with their vector paths. */
export function projectBrandMarks(root: string): readonly BrandMark[] {
  const marks: BrandMark[] = [];
  const walk = (dir: string, depth: number, inBrandDir: boolean) => {
    if (depth > 4 || marks.length >= 60) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIPPED.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1, inBrandDir || /^(?:brand|brands|logo|logos|identity)$/i.test(entry.name));
      else if (entry.isFile() && /\.(?:svg|png)$/i.test(entry.name)
        && (inBrandDir || /(?:logo|lockup|wordmark|brandmark|emblem)/i.test(entry.name)) && statSync(path).size <= 2_000_000) {
        const bytes = readFileSync(path);
        const pathData = /\.svg$/i.test(entry.name)
          ? [...bytes.toString('utf8').matchAll(/\sd="([^"]{40,})"/g)].map(match => normalizedPathData(match[1] ?? ''))
          : [];
        marks.push({ path: relative(root, path), sha256: sha256(bytes), pathData });
      }
    }
  };
  walk(root, 0, false);
  return marks;
}

export type StudioFloorObservation = Readonly<{
  /** Image, background and embedded sources the page shows, and the vector paths drawn inline. */
  sources: readonly string[];
  inlinePathData: readonly string[];
  /** Largest share of one screen a live WebGL canvas covers anywhere on the page, and in the first screen. */
  sceneShare: number;
  firstScreenSceneShare: number;
}>;

const shownSources = browserCallback((): { sources: string[]; inlinePathData: string[] } => {
  const sources = new Set<string>();
  for (const image of document.querySelectorAll('img')) if (image.currentSrc || image.src) sources.add(image.currentSrc || image.src);
  for (const element of document.querySelectorAll('image, use, object, embed')) {
    const value = element.getAttribute('href') ?? element.getAttribute('xlink:href') ?? element.getAttribute('data') ?? element.getAttribute('src');
    if (value && !value.startsWith('#')) sources.add(new URL(value, location.href).href);
  }
  for (const element of document.querySelectorAll('body *')) {
    for (const match of getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) sources.add(match[1] ?? '');
  }
  const inlinePathData = [...document.querySelectorAll('svg path[d]')].map(path => path.getAttribute('d') ?? '').filter(d => d.length >= 40);
  return { sources: [...sources].filter(Boolean).slice(0, 400), inlinePathData: inlinePathData.slice(0, 400) };
});

// A canvas holding a WebGL context answers null for a 2D one; a blank canvas takes the 2D context and does not count.
const visibleSceneShare = browserCallback((): number => {
  const area = innerWidth * innerHeight;
  return [...document.querySelectorAll('canvas')].reduce((largest, canvas) => {
    const style = getComputedStyle(canvas);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.1) return largest;
    if (canvas.getContext('2d') !== null) return largest;
    const box = canvas.getBoundingClientRect();
    const w = Math.min(box.right, innerWidth) - Math.max(box.left, 0);
    const h = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0);
    return w > 0 && h > 0 ? Math.max(largest, w * h / area) : largest;
  }, 0);
});

/** Observe the build the way a visitor meets it: motion allowed, scrolled screen by screen so scenes that start on view start. */
export async function observeStudioFloors(target: string): Promise<StudioFloorObservation & Readonly<{ servedFrom: string }>> {
  const { chromium } = await import('playwright');
  const resolved = await resolveRenderTarget(target);
  const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto(resolved.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    const firstScreenSceneShare = await page.evaluate(visibleSceneShare);
    let sceneShare = firstScreenSceneShare;
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let screen = 1; screen < MAX_SCREENS && screen * VIEWPORT.height < height; screen += 1) {
      await page.evaluate(top => window.scrollTo(0, top), screen * VIEWPORT.height);
      await page.waitForTimeout(600);
      sceneShare = Math.max(sceneShare, await page.evaluate(visibleSceneShare));
    }
    const shown = await page.evaluate(shownSources);
    const round = (value: number) => Math.round(value * 100) / 100;
    return { ...shown, sceneShare: round(sceneShare), firstScreenSceneShare: round(firstScreenSceneShare), servedFrom: resolved.url };
  } finally {
    await browser.close();
    await resolved.close();
  }
}

/** The bytes behind a source the page shows: a data URI, or a file in the build it was served from. */
function sourceBytes(target: string, servedFrom: string, src: string): Buffer | null {
  try {
    if (src.startsWith('data:')) {
      const comma = src.indexOf(',');
      const meta = src.slice(5, comma);
      return meta.endsWith(';base64') ? Buffer.from(src.slice(comma + 1), 'base64') : Buffer.from(decodeURIComponent(src.slice(comma + 1)));
    }
    const url = new URL(src);
    const base = new URL(servedFrom);
    if (url.protocol !== 'file:' && url.origin !== base.origin) return null;
    const path = url.protocol === 'file:' ? fileURLToPath(url)
      : join(dirname(resolve(target)), decodeURIComponent(url.pathname.replace(base.pathname.replace(/[^/]*$/, ''), '')));
    return existsSync(path) ? readFileSync(path) : null;
  } catch { return null; }
}

export type StudioFloorFailure = Readonly<{ code: 'BRAND_MARK_NOT_SHOWN' | 'THREE_D_NOT_LIVE'; message: string }>;

export function studioFloorFailures(marks: readonly BrandMark[], wantsThreeD: boolean, target: string,
  observed: StudioFloorObservation & Readonly<{ servedFrom: string }>): readonly StudioFloorFailure[] {
  const failures: StudioFloorFailure[] = [];
  if (marks.length > 0) {
    const shas = new Set(marks.map(mark => mark.sha256));
    const vectors = new Set(marks.flatMap(mark => mark.pathData));
    const shown = observed.sources.some(src => { const bytes = sourceBytes(target, observed.servedFrom, src); return bytes !== null && shas.has(sha256(bytes)); })
      || observed.inlinePathData.some(d => vectors.has(normalizedPathData(d)));
    if (!shown) {
      const named = marks.slice(0, 4).map(mark => mark.path).join(', ');
      failures.push({ code: 'BRAND_MARK_NOT_SHOWN', message: `BRAND_MARK_NOT_SHOWN: the project ships its mark (${named}${marks.length > 4 ? ', …' : ''}) `
        + 'but the page shows none of those files. Use the file itself wherever the brand appears (copy it into public/ or import it, '
        + 'or inline its exact SVG); never redraw it in CSS or retype it as text.' });
    }
  }
  if (wantsThreeD && observed.sceneShare < LIVE_SCENE_SHARE) {
    failures.push({ code: 'THREE_D_NOT_LIVE', message: `THREE_D_NOT_LIVE: the request asks for 3D, but no live WebGL scene covers a quarter of a `
      + `screen anywhere on the page (largest ${Math.round(observed.sceneShare * 100)}%). Build the scene in three.js on the page itself; a rendered `
      + 'PNG, a video of a scene or a CSS-tilted shape is a picture of 3D, not 3D the visitor can see live.' });
  }
  return failures;
}

/** Refusal boundary at the first render of a new page: its mark is the shipped file and asked-for 3D is live. */
export async function requireStudioFloors(root: string, route: Route, target: string): Promise<void> {
  if (!newSurface(route)) return;
  const marks = projectBrandMarks(root);
  const wantsThreeD = requestsThreeD(route.request);
  if (marks.length === 0 && !wantsThreeD) return;
  const failures = studioFloorFailures(marks, wantsThreeD, target, await observeStudioFloors(target));
  if (failures.length > 0) throw Object.assign(new Error(failures.map(failure => failure.message).join('\n')), { code: failures[0]!.code });
}
