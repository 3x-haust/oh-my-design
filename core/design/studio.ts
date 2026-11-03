import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { resolveRenderTarget } from '../render/serve.ts';
import type { readPersistedRoute } from '../route/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { pageIdeaPreview } from './idea-image.ts';
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

export const STUDIO_STUDY_GUIDANCE = 'A new page starts from finished sites, studied the way a designer studies them. Pick two or three real sites in '
  + 'this project\'s spirit whose craft you want, run omd studio refs <url> <url> --json, and look at each first-screen.png, full.png and '
  + 'section crop under .omd/studio/refs/<site>/ beside its measured study.json (type ramp, weights, sections, how it frames its product).';

export const STUDIO_SYSTEM_GUIDANCE = `Choose ONE primary reference and write ${STUDIO_SYSTEM_NOTES}: the type ramp you take from its measurements `
  + '(five or six sizes, at most three weights, tracking, line heights), container width, section rhythm, how it frames product visuals, its '
  + 'button; then what comes from the project instead: accent colours and character from its logo, voice from its README. Name the reference\'s '
  + 'signature (the one or two moves that make it feel made by a person) and this project\'s own equivalent: a move only this project could make, '
  + 'in its own material or vocabulary, never the reference\'s look restated. Then its motion, from study.json motion and the intro-N.png frames: '
  + 'how the first screen arrives (what leads, from what, how long, which curve), how sections reveal on scroll, what keeps moving inside its '
  + 'product visuals, hover timing; write the durations and curves you take. Then write '
  + `${STUDIO_SYSTEM_RECORD} as {"reference": "<primary url>", "sizes": [px...], "weights": [n...]}; every size and weight the page renders comes from it.`;

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
  const state = { animations: [] as Entry[], productChanges: [] as number[], introStyleChanges: 0 };
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
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'd', 'transform'] });
  if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe);
});

type MotionRecord = Readonly<{
  animations: readonly Readonly<{ t: number; scrollY: number; target: string; top: number; firstScreen: boolean; product: boolean; duration: number;
    delay: number; loop: boolean; easing: string; props: readonly string[]; from: Readonly<Record<string, string>> }>[];
  productChanges: readonly number[]; introStyleChanges: number;
}>;
const readMotion = browserCallback((): MotionRecord => Reflect.get(window, '__omdMotion') as MotionRecord);

/** How a studied site moves, in the terms a designer would write down: the intro, what each scroll reveals, what keeps moving, the curves. */
function motionSummary(record: MotionRecord, introEnd: number) {
  const tally = (values: readonly (string | number)[]) => Object.entries(values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count }));
  const intro = record.animations.filter(item => item.t <= introEnd), revealed = record.animations.filter(item => item.t > introEnd);
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
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const introEnd = await page.evaluate(() => Math.round(performance.now()));
        const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), STUDY_VIEWPORT.height * STUDY_MAX_SCREENS);
        // Scroll like a reader, a screen at a time with a pause, so lazy sections load and scroll reveals fire and finish.
        for (let y = 0; y < height; y += 700) { await page.mouse.wheel(0, 700); await page.waitForTimeout(450); }
        const motion = motionSummary(await page.evaluate(readMotion), introEnd);
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
          if (cut <= 0) return section;
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

export type StudioSystem = Readonly<{ reference: string; sizes: readonly number[]; weights: readonly number[] }>;

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
  return { reference, sizes: sizes as number[], weights: weights as number[] };
}

/** What a new surface still owes before its page is built: a study of finished sites, then the system taken from one of them. */
export function studioPending(root: string, route: Route): 'study' | 'system' | null {
  if (!newSurface(route)) return null;
  const studies = studioStudies(root);
  if (studies.length === 0) return 'study';
  const system = readStudioSystem(root);
  if (system === null || !studies.some(study => sameSite(study.url, system.reference))) return 'system';
  const notes = existsSync(join(root, STUDIO_SYSTEM_NOTES)) ? readFileSync(join(root, STUDIO_SYSTEM_NOTES), 'utf8').trim() : '';
  return notes.length < MIN_SYSTEM_NOTES || logoUnsaved(root) ? 'system' : null;
}

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
          : `${STUDIO_SYSTEM_NOTES} is missing or too thin to hold the measured system, the project's identity and the signature`;
    throw Object.assign(new Error(`STUDIO_SYSTEM_MISSING: ${reason}. ${STUDIO_SYSTEM_GUIDANCE}`), { code: 'STUDIO_SYSTEM_MISSING' });
  }
}

export type SystemDriftObservation = Readonly<{
  viewport: 'desktop' | 'mobile';
  offSystemSizes: readonly Readonly<{ size: number; example: string }>[];
  offSystemWeights: readonly Readonly<{ weight: number; example: string }>[];
  arrows: readonly string[];
  playerControls: number;
  /** Desktop only: the first screen holds a key visual built in code. */
  keyVisual?: boolean;
  /** Desktop only: something in the first screen animates as the page loads. */
  arrives?: boolean;
  /** Desktop only: the key visual keeps changing on its own after the page has loaded. */
  performs?: boolean;
}>;

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
  const arrows = [...document.querySelectorAll('a, button')].filter(visible).map(example).filter(text => /[↗→↘↙←↓↑]/.test(text));
  return { offSystemSizes: [...offSizes.entries()].map(([size, text]) => ({ size, example: text })),
    offSystemWeights: [...offWeights.entries()].map(([weight, text]) => ({ weight, example: text })),
    arrows: [...new Set(arrows)].slice(0, 12), playerControls: [...document.querySelectorAll('video')].filter(video => visible(video) && video.controls).length };
});

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
        for (let y = 0; y < Math.min(height, 30_000); y += size.height) { await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(150); }
        observations.push({ viewport, ...await page.evaluate(observeDrift, { sizes: system.sizes, weights: system.weights, tolerance: SIZE_TOLERANCE }), ...keyVisual });
      } finally { await page.close(); }
    }
    return observations;
  } finally {
    await browser.close();
    await resolved.close();
  }
}

/** What a designer would mark up on the build: no key visual or a still one, a first screen that does not arrive, type outside the promised system, arrow glyphs on links and buttons, player chrome. */
export function systemDriftFailures(observations: readonly SystemDriftObservation[]): readonly string[] {
  const failures: string[] = [];
  for (const { viewport, offSystemSizes, offSystemWeights, arrows, playerControls, keyVisual, arrives, performs } of observations) {
    if (arrives === false) failures.push(`${viewport}: the first screen does not arrive: nothing in it animates as the page loads (take the reference's intro: what leads, from what, how long, which curve)`);
    if (keyVisual === true && performs === false) failures.push(`${viewport}: the key visual stands still: nothing inside data-product changes on its own in the ${PERFORM_WINDOW_MS / 1000}s after load (play the product's real flow in it: states change, rows arrive, a cursor works; rest under prefers-reduced-motion)`);
    if (keyVisual === false) failures.push(`${viewport}: no key visual built in code in the first screen (an element marked data-product, at least half the width, made of the product's live interface or a large drawn canvas/svg; a recording or screenshot in a frame is not one)`);
    if (offSystemSizes.length > 0) failures.push(`${viewport}: sizes outside the system ${offSystemSizes.slice(0, 6).map(item => `${item.size}px ("${item.example}")`).join(', ')}`);
    if (offSystemWeights.length > 0) failures.push(`${viewport}: weights outside the system ${offSystemWeights.slice(0, 4).map(item => `${item.weight} ("${item.example}")`).join(', ')}`);
    if (arrows.length > 0) failures.push(`${viewport}: arrow glyphs on links or buttons ${arrows.slice(0, 6).map(text => `"${text}"`).join(', ')}`);
    if (playerControls > 0) failures.push(`${viewport}: ${playerControls} video${playerControls === 1 ? '' : 's'} with visible player controls`);
  }
  return [...new Set(failures)];
}

/** Refusal boundary at the first render and finish of a new page: it renders the system it promised. */
export async function requireStudioSystemHeld(root: string, route: Route, target: string): Promise<void> {
  if (!newSurface(route)) return;
  const system = readStudioSystem(root);
  if (system === null) return;
  const failures = systemDriftFailures(await observeSystemDrift(target, system));
  if (failures.length > 0) {
    throw Object.assign(new Error(`STUDIO_SYSTEM_DRIFT: the page leaves the system in ${STUDIO_SYSTEM_RECORD}. ${failures.join('; ')}. Build the `
      + 'key visual first: the product\'s own look recreated in HTML/CSS (or drawn) at large size, moving with real input, marked data-product. Set each '
      + 'element in one of the system\'s sizes and weights (or widen the system in its notes when the reference really has that step); a link '
      + 'or button says where it goes in words, without arrow glyphs; a demo video plays muted and looped with no player chrome. A recreated '
      + 'product interface marked data-product keeps its own sizes.'), { code: 'STUDIO_SYSTEM_DRIFT' });
  }
}
