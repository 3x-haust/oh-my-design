import { spawnSync } from 'node:child_process';
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

/** Where the agent saves the project's logo when the README only links it from the web, or says it has none. */
export const STUDIO_LOGO = '.omd/studio/logo.png';
export const STUDIO_NO_LOGO = '.omd/studio/no-logo';
/** Where a new page records the source and licence of each image it ships that the project did not already have. */
export const STUDIO_IMAGES = '.omd/studio/images.json';
/** Licences an added image may carry: the project's own work, a render of the page's own code, or terms with no extra clauses. */
const OPEN_IMAGE_LICENCES = new Set(['own', 'rendered', 'cc0-1.0', 'public-domain']);
/** Photo sites whose own licences add clauses (no compiling a similar service, no selling unaltered copies): never CC0. */
const STOCK_HOSTS = /(^|\.)(unsplash\.com|pexels\.com|pixabay\.com|freepik\.com|shutterstock\.com|istockphoto\.com|gettyimages\.com|stock\.adobe\.com)$/i;
/** Below this size a raster is an icon or a texture tile, not an image the page shows. */
const IMAGE_MIN_BYTES = 20_000;

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

const imageAttribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
const nameKey = (value: string): string => value.toLowerCase().replace(/^@[^/]+\//, '').replace(/[^a-z0-9]/g, '');

/**
 * The logo a project's README shows as its identity: a local image whose alt text is the project's name or whose file
 * is named as a logo, with the light/dark sources of the same picture and the same image in other formats. When a
 * README shows one, that is the mark the page owes; a single-colour fallback or a retyped wordmark is not it.
 */
export function readmeLogos(root: string): readonly BrandMark[] {
  const readmes: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 2) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIPPED.has(entry.name)) continue;
      if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
      else if (entry.isFile() && /^readme(?:\.[a-z-]+)?\.md$/i.test(entry.name)) readmes.push(join(dir, entry.name));
    }
  };
  walk(root, 0);
  const files = new Set<string>();
  for (const readme of readmes) {
    const text = readFileSync(readme, 'utf8');
    const dir = dirname(readme);
    let packageName = '';
    try { packageName = String(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name ?? ''); } catch { /* no package */ }
    const names = new Set([packageName, /^#\s+(.+)$/m.exec(text)?.[1] ?? '', dir.split(/[\\/]/).pop() ?? ''].map(nameKey).filter(Boolean));
    const isLogo = (src: string, alt: string) => !/^[a-z]+:/i.test(src) && /\.(?:svg|png)$/i.test(src)
      && (names.has(nameKey(alt)) || /(?:logo|lockup|wordmark|brandmark|emblem)/i.test(src.split('/').pop() ?? ''));
    const pictures = [...text.matchAll(/<picture[\s\S]*?<\/picture>/gi)].map(match => match[0]);
    const groups = [
      ...pictures.map(picture => ({ tags: [...picture.matchAll(/<(?:img|source)\b[^>]*>/gi)].map(match => match[0]) })),
      ...[...text.replace(/<picture[\s\S]*?<\/picture>/gi, '').matchAll(/<img\b[^>]*>/gi)].map(match => ({ tags: [match[0]] })),
    ];
    for (const { tags } of groups) {
      const image = tags.find(tag => /^<img/i.test(tag));
      const srcs = tags.flatMap(tag => (imageAttribute(tag, 'src') ?? imageAttribute(tag, 'srcset') ?? '').split(',').map(part => part.trim().split(/\s+/)[0] ?? ''));
      if (image && isLogo(imageAttribute(image, 'src') ?? '', imageAttribute(image, 'alt') ?? '')) for (const src of srcs) if (src) files.add(resolve(dir, src));
    }
    for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) if (isLogo(match[2] ?? '', match[1] ?? '')) files.add(resolve(dir, match[2] ?? ''));
  }
  // The same image in its other format (header-light.svg beside header-light.png) is the same logo.
  for (const file of [...files]) for (const ext of ['.svg', '.png']) files.add(file.replace(/\.(?:svg|png)$/i, ext));
  return [...files].filter(file => existsSync(file) && statSync(file).isFile() && statSync(file).size <= 2_000_000).sort().map(file => {
    const bytes = readFileSync(file);
    const pathData = /\.svg$/i.test(file) ? [...bytes.toString('utf8').matchAll(/\sd="([^"]{40,})"/g)].map(match => normalizedPathData(match[1] ?? '')) : [];
    return { path: relative(root, file), sha256: sha256(bytes), pathData };
  });
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

/** Git blob ids of every file the project had committed when the page was made: images it already owns. */
function committedBlobs(root: string): ReadonlySet<string> {
  const listed = spawnSync('git', ['ls-tree', '-r', 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) return new Set();
  return new Set(listed.stdout.split('\n').map(line => /^\d+ blob ([0-9a-f]{40})\t/.exec(line)?.[1]).filter((id): id is string => id !== undefined));
}

const blobId = (bytes: Buffer): string => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

type ImageRecord = Readonly<{ file: string; source: string; licence: string }>;

function imageRecords(root: string): readonly ImageRecord[] {
  try {
    const value: unknown = JSON.parse(readFileSync(join(root, STUDIO_IMAGES), 'utf8'));
    return Array.isArray(value) ? value.filter((row): row is ImageRecord => typeof row === 'object' && row !== null
      && typeof row.file === 'string' && typeof row.source === 'string' && typeof row.licence === 'string') : [];
  } catch { return []; }
}

const stockSource = (source: string): boolean => { try { return STOCK_HOSTS.test(new URL(source).hostname); } catch { return false; } };

/**
 * Rasters the page shows that the project did not have committed, with no record of an open source. Test-346 shipped the most
 * familiar bookshelf photograph on Unsplash inside its example: a stock site's own licence adds clauses, and a stock picture is
 * the template's picture.
 */
export function unrecordedImages(root: string, target: string, observed: StudioFloorObservation & Readonly<{ servedFrom: string }>): readonly string[] {
  const committed = committedBlobs(root);
  const records = imageRecords(root).flatMap(record => {
    const path = join(root, record.file);
    return existsSync(path) ? [{ ...record, sha256: sha256(readFileSync(path)) }] : [];
  });
  const named: string[] = [];
  for (const src of observed.sources) {
    if (src.startsWith('data:') || !/\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(src)) continue;
    const bytes = sourceBytes(target, observed.servedFrom, src);
    if (bytes === null || bytes.length < IMAGE_MIN_BYTES || committed.has(blobId(bytes))) continue;
    const record = records.find(row => row.sha256 === sha256(bytes));
    const file = decodeURIComponent(new URL(src).pathname.split('/').pop() ?? src);
    if (record === undefined) named.push(`${file} (no record)`);
    else if (stockSource(record.source)) named.push(`${file} (from ${new URL(record.source).hostname}, whose licence adds clauses)`);
    else if (!OPEN_IMAGE_LICENCES.has(record.licence.toLowerCase())) named.push(`${file} (licence ${record.licence})`);
  }
  return [...new Set(named)];
}

export type StudioFloorFailure = Readonly<{ code: 'BRAND_MARK_NOT_SHOWN' | 'THREE_D_NOT_LIVE' | 'IMAGE_SOURCE_UNRECORDED'; message: string }>;

/** `marks` from the README's logo when it shows one (`readme`), otherwise every mark the project ships. */
export function studioFloorFailures(marks: readonly BrandMark[], wantsThreeD: boolean, target: string,
  observed: StudioFloorObservation & Readonly<{ servedFrom: string }>, readme = false): readonly StudioFloorFailure[] {
  const failures: StudioFloorFailure[] = [];
  if (marks.length > 0) {
    const shas = new Set(marks.map(mark => mark.sha256));
    const vectors = new Set(marks.flatMap(mark => mark.pathData));
    const shown = observed.sources.some(src => { const bytes = sourceBytes(target, observed.servedFrom, src); return bytes !== null && shas.has(sha256(bytes)); })
      || observed.inlinePathData.some(d => vectors.has(normalizedPathData(d)));
    if (!shown) {
      const named = marks.slice(0, 4).map(mark => mark.path).join(', ');
      failures.push({ code: 'BRAND_MARK_NOT_SHOWN', message: readme
        ? `BRAND_MARK_NOT_SHOWN: the project's README shows its logo as ${named} but the page does not show that file. Use it as the `
          + 'README does wherever the brand appears (copy it into public/ or import it, or inline its exact SVG); a single-colour '
          + 'fallback, another mark from the kit, a redrawn shape or the name retyped in a page font is not the logo.'
        : `BRAND_MARK_NOT_SHOWN: the project ships its mark (${named}${marks.length > 4 ? ', …' : ''}) `
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

/** Refusal boundary at the first render of a new page: its mark is the README's logo file (or a shipped mark), asked-for 3D is live and every added image has an open source. */
export async function requireStudioFloors(root: string, route: Route, target: string): Promise<void> {
  if (!newSurface(route)) return;
  const saved = existsSync(join(root, STUDIO_LOGO))
    ? [{ path: STUDIO_LOGO, sha256: sha256(readFileSync(join(root, STUDIO_LOGO))), pathData: [] }] : [];
  const logos = saved.length > 0 ? saved : readmeLogos(root);
  const marks = logos.length > 0 ? logos : projectBrandMarks(root);
  const wantsThreeD = requestsThreeD(route.request);
  const observed = await observeStudioFloors(target);
  const failures = [...studioFloorFailures(marks, wantsThreeD, target, observed, logos.length > 0)];
  const images = unrecordedImages(root, target, observed);
  if (images.length > 0) {
    failures.push({ code: 'IMAGE_SOURCE_UNRECORDED', message: `IMAGE_SOURCE_UNRECORDED: the page ships ${images.slice(0, 4).join(', ')}, which the `
      + 'project did not have. An image ships only when the project owns it, it is drawn or rendered from the page\'s own code, or its '
      + `licence adds no clauses (CC0, public domain); record each in ${STUDIO_IMAGES} as [{"file": "<path in the project>", "source": "<url or `
      + '"omd render <page>">", "licence": "own|rendered|CC0-1.0|public-domain"}]. Stock photo sites (Unsplash, Pexels, Pixabay) license '
      + 'on terms of their own and their pictures are the template\'s pictures: draw the thing in code instead.' });
  }
  if (failures.length > 0) throw Object.assign(new Error(failures.map(failure => failure.message).join('\n')), { code: failures[0]!.code });
}
