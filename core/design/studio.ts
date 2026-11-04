import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { PNG } from 'pngjs';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { resolveRenderTarget } from '../render/serve.ts';
import type { readPersistedRoute } from '../route/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { ideaImages, ideationUnavailable, pageIdeaPreview } from './idea-image.ts';
import { newSurface } from './new-surface-advisories.ts';
import { projectBrandMarks, readmeLogos, STUDIO_LOGO, STUDIO_NO_LOGO } from './studio-floors.ts';
import { STUDIO_DIR } from './studio-paths.ts';

type Route = ReturnType<typeof readPersistedRoute>;

/**
 * A new page is made the way a designer makes one: study finished sites by measurement, borrow one site's system and
 * give it the project's own identity, spend the effort on the key visual, then cut. The page is held to the system it
 * promised by measuring the build, and compared with the site it learned from once at the end.
 */
export const STUDIO_REFS_DIR = `${STUDIO_DIR}/refs`;
export const STUDIO_SYSTEM_RECORD = `${STUDIO_DIR}/system.json`;
export const STUDIO_SYSTEM_NOTES = `${STUDIO_DIR}/system.md`;

const STUDY_VIEWPORT = { width: 1440, height: 900 } as const;
const STUDY_MAX_SCREENS = 14;
const STUDY_PREVIEW_WIDTH = 1000;
const STUDY_MAX_SECTIONS = 12;
/** Notes shorter than this cannot hold the measured numbers, the project's identity and the signature. */
const MIN_SYSTEM_NOTES = 400;
/** A system is a few deliberate steps: enough sizes for display, heading, body and detail, at most three weights. */
export const STUDIO_SYSTEM_SIZES: readonly [number, number] = [4, 9];
export const STUDIO_SYSTEM_WEIGHTS = 3;
/** The width the primary reference is shown to the reviewer at: its whole scroll readable beside the page's own captures. */
export const STUDIO_REFERENCE_REVIEW_WIDTH = 800;
/** Rendered sizes within this distance of a system size are that size (rem rounding). */
const SIZE_TOLERANCE = 0.6;

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const slug = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
};

export const STUDIO_STUDY_GUIDANCE = 'A new page starts from finished sites, studied the way a designer studies them. First write the project\'s '
  + 'character in .omd/studio/brief.md in a few words taken from its own material (its logo, its README\'s voice and humour, who uses it). Then look '
  + 'broadly (omd ref browse search cosmos|dribbble|behance|notefolio "<that character>", and sites you know) for pages that share that character, '
  + 'not the best-known site of the product\'s category: four lazygit runs all studied zed.dev and all came out alike. Pick two or three whose '
  + 'craft you want, run omd studio refs <url> <url> --json, and look at each first-screen.png, full.png and '
  + 'section crop under .omd/studio/refs/<site>/ beside its measured study.json (type ramp, weights, sections, how it frames its product).';

export const STUDIO_SYSTEM_GUIDANCE = `Choose ONE primary reference and write ${STUDIO_SYSTEM_NOTES}: the type ramp you take from its measurements `
  + '(five or six sizes, at most three weights, tracking, line heights), container width, section rhythm, how it frames product visuals, its '
  + 'button; its devices beyond measurement (the ground or texture, the typeface\'s character such as serif, mono or grotesk, colour blocks, '
  + 'illustration, how product images are cropped and framed). Take at least one of those devices and carry it in this project\'s own material: '
  + 'the reference\'s illustrated characters become this project\'s own logo character drawn through the page, its paper ground and serif become '
  + 'the same ground and a serif chosen for this voice, its colour blocks are filled with this project\'s sampled colours. A system that excludes '
  + 'every device keeps only the reference\'s numbers, and the page comes out generic. Then what comes from the project instead: accent colours sampled from its logo or product images (with no such material, from a '
  + 'studied reference\'s captures; never the muted green or blue a model reaches for by default), character from its logo, voice from its README. Name the reference\'s '
  + 'signature (the one or two moves that make it feel made by a person) and this project\'s own equivalent: a move only this project could make, '
  + 'in its own material or vocabulary, never the reference\'s brand restated. Then its motion, from study.json motion and the intro-N.png frames: '
  + 'how the first screen arrives (what leads, from what, how long, which curve), how sections reveal on scroll, what keeps moving inside its '
  + 'product visuals, hover timing; write the durations and curves you take. Then write '
  + `${STUDIO_SYSTEM_RECORD} as {"reference": "<primary url>", "sizes": [px...], "weights": [n...], "colors": [{"hex": "#rrggbb", "from": "<PNG or SVG `
  + 'in the project, or a studied reference url>"}...]}; every size and weight the page renders comes from it, and every accent from the family of a colour '
  + 'sampled where its from says (a darker or lighter step of it for contrast is the same colour).';

export type StudioStudy = Readonly<{ url: string; dir: string; firstScreen: string; full: string; sha256: string }>;

type Measured = Readonly<{
  url: string; pageHeight: number; screens: number;
  typeRamp: readonly Readonly<{ size: number; weight: number; tracking: string; lineHeight: string; family: string; count: number; example: string }>[];
  weights: readonly number[];
  sections: readonly Readonly<{ top: number; height: number; background: string; contentWidth: number | null; heading: string; largeMedia: number; words: number; crop?: string }>[];
  visuals: readonly Readonly<{ tag: string; top: number; width: number; height: number; radius: string; shadow: string; playerControls: boolean }>[];
  buttons: readonly Readonly<{ text: string; height: number; padding: string; radius: string; size: string; weight: string; background: string }>[];
  backgrounds: readonly string[]; wordsPerScreen: number; arrows: number;
}>;

const measurePage = browserCallback((): Measured => {
  const round = (value: number) => Math.round(value * 10) / 10;
  const visible = (element: Element) => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const all = [...document.querySelectorAll('body *')].filter(visible);
  const texts = all.filter(element => [...element.childNodes].some(node => node.nodeType === 3 && (node.textContent ?? '').trim().length > 1));
  const styles = new Map<string, { count: number; example: string }>();
  for (const element of texts) {
    const style = getComputedStyle(element);
    const key = [round(parseFloat(style.fontSize)), style.fontWeight, style.letterSpacing === 'normal' ? '0' : style.letterSpacing,
      style.lineHeight, (style.fontFamily.split(',')[0] ?? '').replace(/["']/g, '')].join('|');
    const entry = styles.get(key) ?? { count: 0, example: (element.textContent ?? '').trim().slice(0, 50) };
    entry.count += 1;
    styles.set(key, entry);
  }
  const typeRamp = [...styles.entries()].map(([key, entry]) => {
    const [size, weight, tracking, lineHeight, family] = key.split('|');
    return { size: Number(size), weight: Number(weight), tracking: tracking ?? '0', lineHeight: lineHeight ?? '', family: family ?? '', ...entry };
  }).filter(entry => entry.count >= 2 || entry.size >= 24).sort((a, b) => b.size - a.size || b.count - a.count).slice(0, 24);
  const pageHeight = document.documentElement.scrollHeight;
  const blocks = all.filter(element => { const box = element.getBoundingClientRect(); return box.width >= innerWidth * 0.8 && box.height >= 240 && box.height < pageHeight * 0.9; })
    .map(element => ({ element, top: Math.round(element.getBoundingClientRect().top + scrollY), height: Math.round(element.getBoundingClientRect().height) }))
    .sort((a, b) => a.top - b.top || b.height - a.height);
  const sections: Measured['sections'][number][] = [];
  for (const { element, top, height } of blocks) {
    if (sections.some(section => top >= section.top && top + height <= section.top + section.height + 2)) continue;
    const inner = [...element.querySelectorAll('*')].filter(visible).map(child => child.getBoundingClientRect().width).filter(width => width > 200 && width < innerWidth - 20);
    sections.push({ top, height, background: getComputedStyle(element).backgroundColor, contentWidth: inner.length > 0 ? Math.round(Math.max(...inner)) : null,
      heading: ([...element.querySelectorAll('h1,h2,h3')].find(visible)?.textContent ?? '').trim().slice(0, 60),
      largeMedia: [...element.querySelectorAll('img,video,canvas,svg,picture')].filter(visible).filter(media => { const box = media.getBoundingClientRect(); return box.width * box.height > 60_000; }).length,
      words: ((element as HTMLElement).innerText ?? '').split(/\s+/).filter(Boolean).length });
  }
  const visuals = all.filter(element => /^(IMG|VIDEO|CANVAS|SVG|PICTURE)$/i.test(element.tagName))
    .map(element => ({ element, box: element.getBoundingClientRect() })).filter(({ box }) => box.width * box.height > 120_000).slice(0, 12)
    .map(({ element, box }) => {
      let frame: Element = element;
      for (let depth = 0; depth < 4 && frame.parentElement; depth += 1) {
        const style = getComputedStyle(frame);
        if (style.borderRadius !== '0px' || style.boxShadow !== 'none') break;
        frame = frame.parentElement;
      }
      const style = getComputedStyle(frame);
      return { tag: element.tagName.toLowerCase(), top: Math.round(box.top + scrollY), width: Math.round(box.width), height: Math.round(box.height),
        radius: style.borderRadius, shadow: style.boxShadow.slice(0, 100), playerControls: element instanceof HTMLVideoElement && element.controls };
    });
  const buttons = [...document.querySelectorAll('a,button')].filter(visible).filter(element => {
    const style = getComputedStyle(element);
    return style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.borderStyle !== 'none';
  }).slice(0, 6).map(element => {
    const style = getComputedStyle(element);
    return { text: (element.textContent ?? '').trim().slice(0, 30), height: Math.round(element.getBoundingClientRect().height), padding: style.padding,
      radius: style.borderRadius, size: style.fontSize, weight: style.fontWeight, background: style.backgroundColor };
  });
  const areas = new Map<string, number>();
  for (const element of all) {
    const box = element.getBoundingClientRect(), color = getComputedStyle(element).backgroundColor;
    if (color !== 'rgba(0, 0, 0, 0)' && box.width > 600) areas.set(color, (areas.get(color) ?? 0) + box.width * box.height);
  }
  const text = document.body.innerText;
  return { url: location.href, pageHeight, screens: Math.round(pageHeight / innerHeight * 10) / 10, typeRamp,
    weights: [...new Set(texts.map(element => Number(getComputedStyle(element).fontWeight)))].sort((a, b) => a - b), sections, visuals, buttons,
    backgrounds: [...areas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([color]) => color),
    wordsPerScreen: Math.round(text.split(/\s+/).filter(Boolean).length / (pageHeight / innerHeight)), arrows: (text.match(/[↗→↘]/g) ?? []).length };
});

function crop(full: PNG, top: number, height: number): Buffer {
  const out = new PNG({ width: full.width, height });
  PNG.bitblt(full, out, 0, top, full.width, height, 0, 0);
  return PNG.sync.write(out);
}

/** Capture and measure finished sites: the first screen, the whole page, each section on its own, and the numbers behind them. */
/**
 * Installed before any page script: records every animation the page starts (CSS, transitions, Web Animations) with when, where
 * and how, and every change made inside a [data-product] visual or to a first-screen element's style during the intro, so motion
 * driven by script counts too.
 */
const recordMotion = browserCallback((): void => {
  type Entry = { t: number; scrollY: number; target: string; top: number; firstScreen: boolean; product: boolean; duration: number; delay: number;
    loop: boolean; easing: string; props: string[]; from: Record<string, string> };
  const state = { animations: [] as Entry[], productChanges: [] as number[], introStyleChanges: 0, scrollStyleChanges: 0 };
  Reflect.set(window, '__omdMotion', state);
  const seen = new WeakSet<Animation>();
  const describe = (element: Element) => {
    const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${element.tagName.toLowerCase()}${text ? ` "${text}"` : ''}`;
  };
  const poll = () => {
    for (const animation of document.getAnimations()) {
      if (seen.has(animation)) continue;
      seen.add(animation);
      const effect = animation.effect as KeyframeEffect | null, target = effect?.target;
      if (!effect || !(target instanceof Element) || state.animations.length >= 400) continue;
      const timing = effect.getComputedTiming(), frames = effect.getKeyframes(), easing = String(effect.getTiming().easing);
      const props = [...new Set(frames.flatMap(frame => Object.keys(frame).filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))))];
      const box = target.getBoundingClientRect();
      state.animations.push({ t: Math.round(performance.now()), scrollY: Math.round(window.scrollY), target: describe(target),
        top: Math.round(box.top + window.scrollY), firstScreen: window.scrollY === 0 && box.top < window.innerHeight, product: target.closest('[data-product]') !== null,
        duration: Math.round(Number(timing.duration) || 0), delay: Math.round(timing.delay ?? 0), loop: timing.iterations === Infinity,
        easing: (easing === 'linear' && typeof frames[0]?.easing === 'string' ? String(frames[0].easing) : easing).slice(0, 60),
        props, from: Object.fromEntries(props.map(key => [key, String(frames[0]?.[key] ?? '').slice(0, 50)])) });
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
  const observe = () => new MutationObserver(records => {
    for (const record of records) {
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      if (element === null) continue;
      if (element.closest('[data-product]') !== null) state.productChanges.push(Math.round(performance.now()));
      else if (record.attributeName === 'style' && window.scrollY === 0 && performance.now() < 3000 && element.getBoundingClientRect().top < window.innerHeight) state.introStyleChanges += 1;
      else if (record.attributeName === 'style' && window.scrollY > 0) state.scrollStyleChanges += 1;
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'd', 'transform'] });
  if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe);
});

type MotionRecord = Readonly<{
  animations: readonly Readonly<{ t: number; scrollY: number; target: string; top: number; firstScreen: boolean; product: boolean; duration: number;
    delay: number; loop: boolean; easing: string; props: readonly string[]; from: Readonly<Record<string, string>> }>[];
  productChanges: readonly number[]; introStyleChanges: number; scrollStyleChanges: number;
}>;
const readMotion = browserCallback((): MotionRecord => Reflect.get(window, '__omdMotion') as MotionRecord);

/** How a studied site moves, in the terms a designer would write down: the intro, what each scroll reveals, what keeps moving, the curves. */
function motionSummary(arrival: MotionRecord, reading: MotionRecord, introEnd: number) {
  const tally = (values: readonly (string | number)[]) => Object.entries(values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count }));
  const intro = arrival.animations, revealed = reading.animations.filter(item => item.t > introEnd);
  const record = { animations: [...intro, ...revealed], productChanges: [...arrival.productChanges, ...reading.productChanges] };
  const sample = (items: MotionRecord['animations']) => items.filter((item, index, list) => index === 0 || item.target !== list[index - 1]!.target || item.top !== list[index - 1]!.top)
    .slice(0, 16).map(({ t, scrollY, target, duration, delay, easing, from, loop, product }) => ({ t, scrollY, target, duration, delay, easing, from, loop, product }));
  return { intro: intro.length, onScroll: revealed.length, loops: record.animations.filter(item => item.loop).length,
    productChanges: record.productChanges.length, durations: tally(record.animations.filter(item => !item.loop).map(item => item.duration)),
    easings: tally(record.animations.map(item => item.easing)), properties: tally(record.animations.flatMap(item => item.props)),
    introSequence: sample(intro), scrollSamples: sample(revealed) };
}

export async function studyStudioReferences(writer: ProjectWriteAdapter, urls: readonly string[]): Promise<Readonly<{
  studied: readonly Readonly<{ url: string; dir: string; screens: number; sections: number; weights: readonly number[] }>[];
  skipped: readonly Readonly<{ url: string; reason: string }>[] }>> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const studied = [], skipped: { url: string; reason: string }[] = [];
  try {
    for (const url of urls) {
      if (!/^https?:\/\//i.test(url)) { skipped.push({ url, reason: 'not an http(s) URL' }); continue; }
      const page = await browser.newPage({ viewport: STUDY_VIEWPORT });
      try {
        await page.addInitScript(recordMotion);
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
        if (response !== null && response.status() >= 400) { skipped.push({ url, reason: `HTTP ${response.status()}` }); continue; }
        // The first screen as it arrives: what leads, what follows, when it settles.
        const intro: Buffer[] = [];
        for (const wait of [300, 500, 900]) { await page.waitForTimeout(wait); intro.push(await page.screenshot()); }
        await page.waitForTimeout(1500);
        const arrival = await page.evaluate(readMotion);
        // The page is read from a settled load. Some sites split visitors between variants (zed.dev served a one-screen company
        // portal about half the time); a one-screen read is loaded again as a new visitor, so a long product page is not studied as one screen.
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await page.context().clearCookies();
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => null);
          await page.waitForTimeout(1500);
          if (await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight * 1.05)) break;
        }
        const introEnd = await page.evaluate(() => Math.round(performance.now()));
        const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), STUDY_VIEWPORT.height * STUDY_MAX_SCREENS);
        // Scroll like a reader, a screen at a time with a pause, so lazy sections load and scroll reveals fire and finish.
        for (let y = 0; y < height; y += 700) { await page.mouse.wheel(0, 700); await page.waitForTimeout(450); }
        const motion = motionSummary(arrival, await page.evaluate(readMotion), introEnd);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(800);
        const measured = await page.evaluate(measurePage);
        const firstScreen = await page.screenshot();
        const fullShot = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: STUDY_VIEWPORT.width, height } });
        const dir = `${STUDIO_REFS_DIR}/${slug(url)}`;
        writer.mkdir(dir);
        writer.write(`${dir}/first-screen.png`, firstScreen);
        intro.forEach((frame, index) => writer.write(`${dir}/intro-${index + 1}.png`, pageIdeaPreview(frame, STUDY_PREVIEW_WIDTH)));
        writer.write(`${dir}/full.png`, pageIdeaPreview(fullShot, STUDY_PREVIEW_WIDTH));
        const full = PNG.sync.read(fullShot);
        const sections = measured.sections.slice(0, STUDY_MAX_SECTIONS).map((section, index) => {
          const cut = Math.min(section.height, 1800, full.height - section.top);
          if (cut <= 0 || section.top < 0) return section;
          const name = `section-${String(index + 1).padStart(2, '0')}.png`;
          writer.write(`${dir}/${name}`, pageIdeaPreview(crop(full, section.top, cut), STUDY_PREVIEW_WIDTH));
          return { ...section, crop: name };
        });
        writer.write(`${dir}/study.json`, `${JSON.stringify({ ...measured, requested: url, sections, motion }, null, 1)}\n`);
        studied.push({ url, dir, screens: measured.screens, sections: sections.length, weights: measured.weights });
      } catch (error) {
        skipped.push({ url, reason: error instanceof Error ? error.message.split('\n')[0]!.slice(0, 160) : String(error) });
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  return { studied, skipped };
}

/** The sites studied so far, by the URL each study was asked for. */
export function studioStudies(root: string): readonly StudioStudy[] {
  const base = join(root, STUDIO_REFS_DIR);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    const dir = `${STUDIO_REFS_DIR}/${entry.name}`;
    try {
      const study: unknown = JSON.parse(readFileSync(join(root, dir, 'study.json'), 'utf8'));
      const url = typeof study === 'object' && study !== null ? Reflect.get(study, 'requested') : undefined;
      const firstScreen = `${dir}/first-screen.png`, full = `${dir}/full.png`;
      if (typeof url !== 'string' || !existsSync(join(root, firstScreen)) || !existsSync(join(root, full))) return [];
      return [{ url, dir, firstScreen, full, sha256: sha256(readFileSync(join(root, full))) }];
    } catch { return []; }
  }).sort((a, b) => a.dir.localeCompare(b.dir));
}

export type StudioColor = Readonly<{ hex: string; from: string }>;
export type StudioSystem = Readonly<{ reference: string; sizes: readonly number[]; weights: readonly number[]; colors?: readonly StudioColor[] }>;

const STUDIO_MAX_COLORS = 6;
/** How close (RGB distance) a sampled pixel must be to the recorded colour. */
const SAMPLE_TOLERANCE = 28;
/** Accents within this hue distance of a recorded colour belong to its family. */
export const ACCENT_HUE_TOLERANCE = 20;

const channels = (hex: string): readonly [number, number, number] =>
  [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Hue in degrees and HSL saturation and lightness (0..1). */
export function hsl(hex: string): Readonly<{ hue: number; saturation: number; lightness: number }> {
  const [r, g, b] = channels(hex).map(value => value / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), lightness = (max + min) / 2, delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation, lightness };
}

const sampleCache = new Map<string, boolean>();
/** Whether the PNG or SVG at path holds the colour; null for any other kind of file. */
function holdsColour(path: string, hex: string): boolean | null {
  const kind = extname(path).toLowerCase();
  if (kind !== '.png' && kind !== '.svg') return null;
  const key = `${path}\0${hex}`;
  const cached = sampleCache.get(key);
  if (cached !== undefined) return cached;
  const [r, g, b] = channels(hex);
  const near = (red: number, green: number, blue: number) => Math.hypot(red - r, green - g, blue - b) <= SAMPLE_TOLERANCE;
  let held = false;
  if (kind === '.svg') {
    const text = readFileSync(path, 'utf8');
    held = [...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].some(match => {
      const value = match[1]!.length === 3 ? [...match[1]!].map(digit => digit + digit).join('') : match[1]!;
      return near(...channels(`#${value}`));
    });
  } else {
    const image = PNG.sync.read(readFileSync(path));
    // Every pixel of a small mark; a page-length capture is sampled on a grid, which still finds any colour that covers an area.
    const step = image.width * image.height > 2_000_000 ? 3 : 1;
    for (let y = 0; y < image.height && !held; y += step) {
      for (let x = 0; x < image.width; x += step) {
        const at = (image.width * y + x) * 4;
        if (image.data[at + 3]! >= 128 && near(image.data[at]!, image.data[at + 1]!, image.data[at + 2]!)) { held = true; break; }
      }
    }
  }
  sampleCache.set(key, held);
  return held;
}

/** Why the system's palette is not yet sampled from real material, or null when every colour is found where its from says. */
export function paletteIssue(root: string, system: StudioSystem, studies: readonly StudioStudy[] = studioStudies(root)): string | null {
  const colors = system.colors ?? [];
  if (colors.length === 0) return `${STUDIO_SYSTEM_RECORD} names no colors: sample the accents from the project's logo or product images, or from a studied reference's captures`;
  for (const { hex, from } of colors) {
    const study = studies.find(item => sameSite(item.url, from));
    const files = study !== undefined ? [study.firstScreen, study.full] : [normalize(from)];
    if (files.some(file => file.startsWith('..') || file.startsWith('/'))) return `the colour ${hex} names ${from}, outside the project`;
    if (files.some(file => !existsSync(join(root, file)))) return `the colour ${hex} names ${from}, which is neither a file in the project nor a studied reference`;
    const held = files.map(file => holdsColour(join(root, file), hex));
    if (held.every(value => value === null)) return `the colour ${hex} names ${from}; sample from a PNG or SVG`;
    if (!held.some(value => value === true)) return `the colour ${hex} is not in ${from}: sample it from the file's own pixels`;
  }
  return null;
}

const sameSite = (left: string, right: string): boolean => {
  try { return slug(left) === slug(right); } catch { return false; }
};

/** The study of the site the system was taken from, or null before there is one. */
export function primaryStudy(root: string): StudioStudy | null {
  let system: StudioSystem | null;
  try { system = readStudioSystem(root); } catch { return null; }
  return system === null ? null : studioStudies(root).find(study => sameSite(study.url, system.reference)) ?? null;
}

/** The system the page promised, or the reason it cannot be used; null when none is written yet. */
export function readStudioSystem(root: string): StudioSystem | null {
  if (!existsSync(join(root, STUDIO_SYSTEM_RECORD))) return null;
  const invalid = (reason: string): never => {
    throw Object.assign(new Error(`STUDIO_SYSTEM_INVALID: ${STUDIO_SYSTEM_RECORD} ${reason}. ${STUDIO_SYSTEM_GUIDANCE}`), { code: 'STUDIO_SYSTEM_INVALID' });
  };
  let value: unknown;
  try { value = JSON.parse(readFileSync(join(root, STUDIO_SYSTEM_RECORD), 'utf8')); } catch { return invalid('is not JSON'); }
  if (typeof value !== 'object' || value === null) return invalid('is not an object');
  const reference = Reflect.get(value, 'reference'), sizes = Reflect.get(value, 'sizes'), weights = Reflect.get(value, 'weights');
  if (typeof reference !== 'string') return invalid('names no primary reference');
  const numbers = (list: unknown) => Array.isArray(list) && list.every(item => typeof item === 'number' && Number.isFinite(item) && item > 0);
  if (!numbers(sizes) || new Set(sizes as number[]).size < STUDIO_SYSTEM_SIZES[0] || (sizes as number[]).length > STUDIO_SYSTEM_SIZES[1]) {
    return invalid(`needs ${STUDIO_SYSTEM_SIZES[0]} to ${STUDIO_SYSTEM_SIZES[1]} distinct sizes in px`);
  }
  if (!numbers(weights) || (weights as number[]).length === 0 || new Set(weights as number[]).size > STUDIO_SYSTEM_WEIGHTS) {
    return invalid(`needs one to ${STUDIO_SYSTEM_WEIGHTS} weights`);
  }
  const colors = Reflect.get(value, 'colors');
  if (colors === undefined) return { reference, sizes: sizes as number[], weights: weights as number[] };
  if (!Array.isArray(colors) || colors.length === 0 || colors.length > STUDIO_MAX_COLORS || !colors.every(color => typeof color === 'object' && color !== null
    && typeof Reflect.get(color, 'hex') === 'string' && /^#[0-9a-f]{6}$/i.test(Reflect.get(color, 'hex')) && typeof Reflect.get(color, 'from') === 'string')) {
    return invalid(`colors needs one to ${STUDIO_MAX_COLORS} {"hex": "#rrggbb", "from": "<file or studied url>"} entries`);
  }
  return { reference, sizes: sizes as number[], weights: weights as number[],
    colors: colors.map(color => ({ hex: String(Reflect.get(color, 'hex')).toLowerCase(), from: String(Reflect.get(color, 'from')) })) };
}

/** Page ideas a new surface draws before its source, so the build starts from a chosen composition instead of a default one. */
export const STUDIO_PAGE_IDEAS = 2;
export const STUDIO_CONCEPT_GUIDANCE = `Before the page source, draw ${STUDIO_PAGE_IDEAS} or 3 ideas for the first screen: omd imagegen --kind page --name `
  + 'hero-<n> --prompt "<the exact headline and copy, what sits where and how large, the key visual made from the product\'s real look, the '
  + 'type and the devices the system takes, the sampled colours>". Make each a genuinely different composition (a different arrangement of '
  + 'words, key visual and action, not a colour variant), look at them, choose one and write in system.md what must survive into the HTML. '
  + 'A mobile app\'s ideas are its main screen at phone size: add --viewport mobile. The images are ideation only and never ship; where no image tool works, omd imagegen records that and the page proceeds.';

/** What a new surface still owes before its page is built: a study of finished sites, the system taken from one of them, then page ideas. */
export function studioPending(root: string, route: Route): 'study' | 'system' | 'concept' | null {
  if (!newSurface(route)) return null;
  const studies = studioStudies(root);
  if (studies.length === 0) return 'study';
  const system = readStudioSystem(root);
  if (system === null || !studies.some(study => sameSite(study.url, system.reference))) return 'system';
  if (notesThin(root) || logoUnsaved(root) || paletteIssue(root, system, studies) !== null) return 'system';
  return ideationUnavailable(root) || ideaImages(root).filter(idea => idea.kind === 'page').length >= STUDIO_PAGE_IDEAS ? null : 'concept';
}

const notesThin = (root: string): boolean =>
  (existsSync(join(root, STUDIO_SYSTEM_NOTES)) ? readFileSync(join(root, STUDIO_SYSTEM_NOTES), 'utf8').trim() : '').length < MIN_SYSTEM_NOTES;

/**
 * A project with a README nearly always has a logo, but many READMEs link it from the web (an uploaded image with no alt text),
 * where no file check finds it; without the file the page gets a drawn substitute in place of the real mark.
 */
function logoUnsaved(root: string): boolean {
  return readmeLogos(root).length === 0 && projectBrandMarks(root).length === 0 && !existsSync(join(root, STUDIO_LOGO))
    && !existsSync(join(root, STUDIO_NO_LOGO)) && readdirSync(root).some(name => /^readme(?:\.[a-z-]+)?\.md$/i.test(name));
}

/** The page's own source; a package manifest, config or font may be scaffolded before the system. */
export function studioPageSource(path: string): boolean {
  const normalized = path.replace(/^\.\//, '').replace(/\\/g, '/');
  if (normalized.startsWith('.omd/')) return false;
  return /(?:^|\/)index\.html$/.test(normalized) || (/(?:^|\/)src\//.test(normalized) && /\.(?:tsx?|jsx?|css|html)$/.test(normalized));
}

/** Refusal boundary at page-source writes, the first render and finish: a new surface is built on a system taken from a studied site. */
export function requireStudioSystem(root: string, route: Route): void {
  const pending = studioPending(root, route);
  if (pending === 'study') {
    throw Object.assign(new Error(`STUDIO_STUDY_MISSING: study finished sites before the page. ${STUDIO_STUDY_GUIDANCE}`), { code: 'STUDIO_STUDY_MISSING' });
  }
  if (pending === 'system') {
    const system = readStudioSystem(root);
    const reason = system === null ? 'no system is written yet'
      : !studioStudies(root).some(study => sameSite(study.url, system.reference)) ? `its reference ${system.reference} was not studied with omd studio refs`
        : logoUnsaved(root) ? `no logo file was found and the README links its logo from the web: save the project's logo exactly as published to ${STUDIO_LOGO} (PNG), or write an empty ${STUDIO_NO_LOGO} when it has none`
          : notesThin(root) ? `${STUDIO_SYSTEM_NOTES} is missing or too thin to hold the measured system, the project's identity and the signature`
            : paletteIssue(root, system) ?? 'the system is incomplete';
    throw Object.assign(new Error(`STUDIO_SYSTEM_MISSING: ${reason}. ${STUDIO_SYSTEM_GUIDANCE}`), { code: 'STUDIO_SYSTEM_MISSING' });
  }
  if (pending === 'concept') {
    const drawn = ideaImages(root).filter(idea => idea.kind === 'page').length;
    throw Object.assign(new Error(`STUDIO_CONCEPT_MISSING: ${drawn} of ${STUDIO_PAGE_IDEAS} page ideas drawn. ${STUDIO_CONCEPT_GUIDANCE}`), { code: 'STUDIO_CONCEPT_MISSING' });
  }
}

export type SystemDriftObservation = Readonly<{
  viewport: 'desktop' | 'mobile';
  offSystemSizes: readonly Readonly<{ size: number; example: string }>[];
  offSystemWeights: readonly Readonly<{ weight: number; example: string }>[];
  arrows: readonly string[];
  playerControls: number;
  /** Visible videos that wait for a click instead of playing muted and looped. */
  stillVideos?: number;
  /** Visible h1/h2 texts outside data-product, for the paired-slogan check. */
  headings?: readonly string[];
  /** Saturated colours the page paints its own links, buttons and headings in, outside data-product, as #rrggbb. */
  accents?: readonly string[];
  /** Desktop only: the first screen holds a key visual built in code. */
  keyVisual?: boolean;
  /** Desktop only: something in the first screen animates as the page loads. */
  arrives?: boolean;
  /** Desktop only: the key visual keeps changing on its own after the page has loaded. */
  performs?: boolean;
  /** Desktop only: page length in screens, and how many animations or script-driven style changes scrolling set off below the first screen. */
  screens?: number;
  revealed?: number;
}>;

/** What the primary reference sets for depth and scroll motion, from its study. */
export type StudioReferenceDepth = Readonly<{ screens: number; revealsOnScroll: boolean }>;

/** The primary study's length (capped at the study's own screen cap) and whether it reveals sections as it scrolls. */
export function studioReferenceDepth(root: string): StudioReferenceDepth | null {
  const study = primaryStudy(root);
  if (study === null) return null;
  try {
    const measured: unknown = JSON.parse(readFileSync(join(root, study.dir, 'study.json'), 'utf8'));
    const screens = Number(Reflect.get(measured as object, 'screens'));
    const motion: unknown = Reflect.get(measured as object, 'motion');
    const onScroll = typeof motion === 'object' && motion !== null ? Number(Reflect.get(motion, 'onScroll')) : 0;
    return Number.isFinite(screens) && screens > 0 ? { screens: Math.min(screens, STUDY_MAX_SCREENS), revealsOnScroll: onScroll >= REVEALING_REFERENCE } : null;
  } catch { return null; }
}

const observeDrift = browserCallback(({ sizes, weights, tolerance }: Readonly<{ sizes: readonly number[]; weights: readonly number[]; tolerance: number }>): Omit<SystemDriftObservation, 'viewport'> => {
  const visible = (element: Element) => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  // A recreated product interface keeps its own sizes; the page marks it with data-product.
  const texts = [...document.querySelectorAll('body *')].filter(visible).filter(element => element.closest('[data-product]') === null)
    .filter(element => [...element.childNodes].some(node => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0));
  const example = (element: Element) => (element.textContent ?? '').trim().slice(0, 40);
  const offSizes = new Map<number, string>(), offWeights = new Map<number, string>();
  for (const element of texts) {
    const style = getComputedStyle(element);
    const size = Math.round(parseFloat(style.fontSize) * 10) / 10, weight = Number(style.fontWeight);
    if (!sizes.some(value => Math.abs(value - size) <= tolerance) && !offSizes.has(size)) offSizes.set(size, example(element));
    if (!weights.includes(weight) && !offWeights.has(weight)) offWeights.set(weight, example(element));
  }
  // Arrows set as text or drawn with ::before/::after content.
  const arrow = /[↗→↘↙←↓↑]/;
  const arrows = [...document.querySelectorAll('a, button')].filter(visible)
    .filter(element => arrow.test(example(element)) || ['::before', '::after'].some(pseudo => arrow.test(getComputedStyle(element, pseudo).content)))
    .map(element => arrow.test(example(element)) ? example(element) : `${example(element)} ${getComputedStyle(element, '::after').content.replace(/^"|"$/g, '').trim()}`.trim());
  // The same arrow drawn as a small icon after the words (test-317 swapped the glyph for a 16px svg).
  for (const element of [...document.querySelectorAll('a, button')].filter(visible)) {
    const icon = element.lastElementChild, words = example(element);
    if (icon === null || words === '' || !['svg', 'img'].includes(icon.tagName.toLowerCase()) || (icon.textContent ?? '').trim() !== '') continue;
    const box = icon.getBoundingClientRect();
    const text = document.createRange();
    text.selectNodeContents(element);
    if (box.width > 0 && box.width <= 24 && box.height <= 24 && box.left >= text.getBoundingClientRect().left + 8 && !arrows.includes(words)) arrows.push(`${words} [icon]`);
  }
  return { offSystemSizes: [...offSizes.entries()].map(([size, text]) => ({ size, example: text })),
    offSystemWeights: [...offWeights.entries()].map(([weight, text]) => ({ weight, example: text })),
    arrows: [...new Set(arrows)].slice(0, 12), playerControls: [...document.querySelectorAll('video')].filter(video => visible(video) && video.controls).length,
    stillVideos: [...document.querySelectorAll('video')].filter(video => visible(video) && !(video.autoplay && video.muted && video.loop)).length,
    headings: [...document.querySelectorAll('h1, h2')].filter(visible).filter(element => element.closest('[data-product]') === null)
      .map(element => (element.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40),
    accents: [...new Set([...document.querySelectorAll('a, button, h1, h2, h3')].filter(visible).filter(element => element.closest('[data-product]') === null)
      .flatMap(element => { const style = getComputedStyle(element); return [style.color, style.backgroundColor]; })
      .flatMap(value => {
        const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value);
        if (match === null || Number(match[4] ?? 1) < 0.5) return [];
        const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])].map(channel => channel / 255) as [number, number, number];
        const max = Math.max(r, g, b), min = Math.min(r, g, b), lightness = (max + min) / 2;
        const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
        // An accent is a colour a visitor reads as a hue: neither near grey nor near black or white.
        if (saturation < 0.3 || lightness < 0.12 || lightness > 0.9) return [];
        return [`#${[match[1], match[2], match[3]].map(channel => Number(channel).toString(16).padStart(2, '0')).join('')}`];
      }))].slice(0, 12) };
});

/**
 * A headline of two or three short sentences that end alike ("Git은 강력하게. 작업은 간단하게.", "Build faster. Ship faster.") is the
 * paired slogan five of seven lazygit runs wrote and the reviewer named as machine-made. Narrow by design: only short sentences with the
 * same closing character; a contrast pair with different endings is left to the prompt.
 */
export function pairedSlogan(text: string): boolean {
  const sentences = text.split(/[.。!?！？]+/).map(part => part.replace(/[\s,·]/g, '')).filter(Boolean);
  if (sentences.length < 2 || sentences.length > 3 || sentences.some(part => part.length < 3 || part.length > 16)) return false;
  return sentences.every(part => part.slice(-1) === sentences[0]!.slice(-1));
}

// The key visual a designer builds first: marked data-product, at least half the width, in the first screen, made of live text or a
// large drawn canvas/svg. A recording or screenshot dropped into a frame is the product's footage, not its look made for the page.
const observeKeyVisual = browserCallback((): boolean => [...document.querySelectorAll('[data-product]')].some(element => {
  const box = element.getBoundingClientRect(), style = getComputedStyle(element);
  if (box.width < window.innerWidth * 0.5 || box.top >= window.innerHeight || box.bottom <= 0 || style.visibility === 'hidden' || style.display === 'none') return false;
  const lines = [...element.querySelectorAll('*')]
    .filter(child => [...child.childNodes].some(node => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0)).length;
  const drawn = [...element.querySelectorAll('canvas, svg')].some(child => child.getBoundingClientRect().width >= window.innerWidth * 0.4);
  return lines >= 8 || drawn;
}));

const PERFORM_WINDOW_MS = 3500;
/** A page shorter than this share of its reference has compressed what the reference shows at full size. */
const DEPTH_SHARE = 0.5;
/** A reference that starts this many animations as it is read reveals its sections on scroll. */
const REVEALING_REFERENCE = 3;

/** The first screen arrives (an intro animation, or script-driven style changes in its first seconds) and the key visual keeps performing. */
async function observeFirstScreenMotion(page: import('playwright').Page, keyVisual: boolean): Promise<Pick<SystemDriftObservation, 'keyVisual' | 'arrives' | 'performs'>> {
  await page.waitForTimeout(300);
  const settled = await page.evaluate(readMotion);
  await page.waitForTimeout(PERFORM_WINDOW_MS);
  const later = await page.evaluate(readMotion);
  const arrives = later.animations.some(item => item.firstScreen && !item.loop && item.t < 4000) || later.introStyleChanges > 0;
  const settledAt = settled.animations.at(-1)?.t ?? 0;
  const performs = later.productChanges.length > settled.productChanges.length
    || later.animations.some(item => item.product && (item.loop || item.t > settledAt));
  return { keyVisual, arrives, performs };
}

/** Measure the build against its system at desktop and mobile, scrolled through so revealed sections are seen. */
export async function observeSystemDrift(target: string, system: StudioSystem): Promise<readonly SystemDriftObservation[]> {
  const { chromium } = await import('playwright');
  const resolved = await resolveRenderTarget(target);
  const browser = await chromium.launch({ headless: true });
  try {
    const observations: SystemDriftObservation[] = [];
    for (const [viewport, size] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
      const page = await browser.newPage({ viewport: size });
      try {
        if (viewport === 'desktop') await page.addInitScript(recordMotion);
        await page.goto(resolved.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
        const keyVisual = viewport === 'desktop' ? await observeFirstScreenMotion(page, await page.evaluate(observeKeyVisual)) : {};
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < Math.min(height, 30_000); y += size.height) { await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(250); }
        const reading = viewport === 'desktop' ? await page.evaluate(readMotion) : null;
        const depth = reading === null ? {} : {
          screens: Math.round(height / size.height * 10) / 10,
          revealed: reading.animations.filter(item => item.scrollY > 0 && !item.loop).length + reading.scrollStyleChanges,
        };
        observations.push({ viewport, ...await page.evaluate(observeDrift, { sizes: system.sizes, weights: system.weights, tolerance: SIZE_TOLERANCE }), ...keyVisual, ...depth });
      } finally { await page.close(); }
    }
    return observations;
  } finally {
    await browser.close();
    await resolved.close();
  }
}

/** What a designer would mark up on the build: a page much shallower than its reference or still where it reveals, no key visual or a still one, a first screen that does not arrive, type outside the promised system, arrow glyphs on links and buttons, player chrome, a paired slogan for a headline. */
export function systemDriftFailures(observations: readonly SystemDriftObservation[], reference: StudioReferenceDepth | null = null,
  palette: readonly StudioColor[] = []): readonly string[] {
  const failures: string[] = [];
  const hues = palette.map(color => hsl(color.hex)).filter(color => color.saturation >= 0.2).map(color => color.hue);
  const inFamily = (hex: string) => hues.some(hue => Math.min(Math.abs(hue - hsl(hex).hue), 360 - Math.abs(hue - hsl(hex).hue)) <= ACCENT_HUE_TOLERANCE);
  for (const { viewport, offSystemSizes, offSystemWeights, arrows, playerControls, stillVideos = 0, headings = [], accents = [], keyVisual, arrives, performs, screens, revealed } of observations) {
    if (reference !== null && screens !== undefined && screens < reference.screens * DEPTH_SHARE) failures.push(`${viewport}: the page is ${screens} screens against the reference's ${reference.screens}: its depth comes from showing each thing at full size; give the stories the project leads with full-size sections with their real demos, each in an arrangement of its own as the reference varies them (a full-bleed demo, a pair, a cropped detail), gather the remaining capabilities densely, not more whitespace, and never one demo block repeated down the page`);
    if (reference?.revealsOnScroll && revealed === 0) failures.push(`${viewport}: nothing reveals as the page scrolls, while the reference reveals its sections as they enter (take its distance, duration, curve and stagger; rest under prefers-reduced-motion)`);
    if (arrives === false) failures.push(`${viewport}: the first screen does not arrive: nothing in it animates as the page loads (take the reference's intro: what leads, from what, how long, which curve)`);
    if (keyVisual === true && performs === false) failures.push(`${viewport}: the key visual stands still: nothing inside data-product changes on its own in the ${PERFORM_WINDOW_MS / 1000}s after load (play the product's real flow in it: states change, rows arrive, a cursor works; rest under prefers-reduced-motion)`);
    if (keyVisual === false) failures.push(`${viewport}: no key visual built in code in the first screen (an element marked data-product, at least half the width, made of the product's live interface or a large drawn canvas/svg; a recording or screenshot in a frame is not one)`);
    if (offSystemSizes.length > 0) failures.push(`${viewport}: sizes outside the system ${offSystemSizes.slice(0, 6).map(item => `${item.size}px ("${item.example}")`).join(', ')}`);
    if (offSystemWeights.length > 0) failures.push(`${viewport}: weights outside the system ${offSystemWeights.slice(0, 4).map(item => `${item.weight} ("${item.example}")`).join(', ')}`);
    if (arrows.length > 0) failures.push(`${viewport}: arrow glyphs or trailing icons on links or buttons ${arrows.slice(0, 6).map(text => `"${text}"`).join(', ')}`);
    if (playerControls > 0) failures.push(`${viewport}: ${playerControls} video${playerControls === 1 ? '' : 's'} with visible player controls`);
    if (stillVideos > 0) failures.push(`${viewport}: ${stillVideos} video${stillVideos === 1 ? ' waits' : 's wait'} for a click; a demo plays muted and looped on its own (autoplay muted loop playsinline), with no play button over it, and rests under prefers-reduced-motion`);
    const offPalette = palette.length === 0 ? [] : accents.filter(hex => !inFamily(hex));
    if (offPalette.length > 0) failures.push(`${viewport}: accents outside the sampled palette ${offPalette.slice(0, 4).join(', ')} (the system samples ${palette.map(color => `${color.hex} from ${color.from}`).join(', ')}); paint links, buttons and headings in a step of a sampled colour, or sample the colour you mean from real material`);
    const slogans = headings.filter(pairedSlogan);
    if (slogans.length > 0) failures.push(`paired slogans ${slogans.slice(0, 3).map(text => `"${text}"`).join(', ')}: a headline names a concrete thing the product does or a real moment of using it, in the project's own words`);
  }
  return [...new Set(failures)];
}

/** Refusal boundary at the first render and finish of a new page: it renders the system it promised. */
export async function requireStudioSystemHeld(root: string, route: Route, target: string): Promise<void> {
  if (!newSurface(route)) return;
  const system = readStudioSystem(root);
  if (system === null) return;
  const failures = systemDriftFailures(await observeSystemDrift(target, system), studioReferenceDepth(root), system.colors ?? []);
  if (failures.length > 0) {
    throw Object.assign(new Error(`STUDIO_SYSTEM_DRIFT: the page leaves the system in ${STUDIO_SYSTEM_RECORD}. ${failures.join('; ')}. Build the `
      + 'key visual first: the product\'s own look recreated in HTML/CSS (or drawn) at large size, moving with real input, marked data-product. Set each '
      + 'element in one of the system\'s sizes and weights (or widen the system in its notes when the reference really has that step); a link '
      + 'or button says where it goes in words, without arrow glyphs; a demo video plays muted and looped with no player chrome. A recreated '
      + 'product interface marked data-product keeps its own sizes.'), { code: 'STUDIO_SYSTEM_DRIFT' });
  }
}
