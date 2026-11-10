import { PNG } from 'pngjs';
import type { Page } from 'playwright';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { resolveRenderTarget } from '../render/serve.ts';

/**
 * What a rendered page is held to comes in three tiers. A defect is something nobody intends (content off the edge of a phone,
 * body text that cannot be read, a logo on an accidental box): it is named until it is fixed. A
 * convention is a default a designer may break on purpose (weights 400 to 600, no label above a heading): a deviation recorded in
 * the system with its reason replaces the default. Taste is never measured here. Linear, eza.rocks, leviosa.ai.kr, wonand.com and
 * kaleoyouth.com, stripe.com, vercel.com and toss.im were measured with these checks on 2026-11-10; anything one of them does is a
 * convention or not a check at all. That moved section headings in several sizes (leviosa, toss) and one fill built two ways
 * (wonand, linear, eza, stripe) out of the defects, and taught the edge and contrast checks to pass text hidden on purpose.
 */
export type PageFindingTier = 'defect' | 'convention';
export type PageFinding = Readonly<{ tier: PageFindingTier; id: string; viewport: 'desktop' | 'mobile'; message: string;
  /** How many of the places the convention applies to break it, so a recorded deviation can be held to itself. */
  count?: number; of?: number }>;

/** The defaults a recorded deviation may replace, with what each one asks for. */
export const STUDIO_CONVENTIONS = {
  'weight-range': 'type is set in weights 400 to 600 and hierarchy comes from size',
  'eyebrow-label': 'a heading stands without a small label above it',
  'heading-subline': 'a section heading stands without an explanatory line under it',
  'hero-scale': 'the first screen leads with a headline at least 3.5 times the body size',
  'quantity-slider': 'a quantity is chosen on a slider, not a row of number buttons',
  'varied-sections': 'three sections in a row do not share one template',
  'link-arrows': 'a link or button says where it goes in words, without arrow glyphs',
  'video-chrome': 'a demo plays muted and looped on its own, without player controls',
  'paired-headline': 'a headline names one concrete thing, not two parallel clauses',
  'sampled-accents': 'accents are steps of a colour sampled from the project\'s real material',
  'heading-steps': 'section headings share one or two steps of the system',
  'button-anatomy': 'buttons of one fill share one radius and one type size',
} as const;
export type StudioConvention = keyof typeof STUDIO_CONVENTIONS;

export type StudioDeviation = Readonly<{ convention: StudioConvention; instead: string; because: string }>;

/** A reason shorter than this cannot tie the choice to the page's idea. */
export const DEVIATION_REASON_MIN = 24;

/** The deviations a system records, or the reason the list cannot be used. */
export function parseDeviations(value: unknown): readonly StudioDeviation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('deviations is a list of {"convention", "instead", "because"}');
  return value.map(item => {
    const convention: unknown = typeof item === 'object' && item !== null ? Reflect.get(item, 'convention') : undefined;
    const instead: unknown = typeof item === 'object' && item !== null ? Reflect.get(item, 'instead') : undefined;
    const because: unknown = typeof item === 'object' && item !== null ? Reflect.get(item, 'because') : undefined;
    if (typeof convention !== 'string' || !Object.hasOwn(STUDIO_CONVENTIONS, convention)) {
      throw new Error(`deviations names ${JSON.stringify(convention)}; the conventions are ${Object.keys(STUDIO_CONVENTIONS).join(', ')}`);
    }
    if (typeof instead !== 'string' || instead.trim().length < 8) throw new Error(`the ${convention} deviation says what the page does instead, in "instead"`);
    if (typeof because !== 'string' || because.trim().length < DEVIATION_REASON_MIN) {
      throw new Error(`the ${convention} deviation gives the reason in "because", tied to the page's idea (at least ${DEVIATION_REASON_MIN} characters)`);
    }
    return { convention: convention as StudioConvention, instead: instead.trim(), because: because.trim() };
  });
}

type RawPage = Readonly<{
  overflow: number;
  offEdge: readonly string[];
  lowContrast: readonly Readonly<{ text: string; ratio: number }>[];
  headingSizes: readonly number[];
  buttonStyles: readonly Readonly<{ background: string; styles: readonly string[] }>[];
  weights: readonly Readonly<{ weight: number; example: string }>[];
  eyebrows: readonly string[];
  sublines: readonly string[];
  heroSize: number | null;
  bodySize: number | null;
  numberRows: readonly string[];
  heads: number;
  sectionHeads: number;
  logos: readonly Readonly<{ x: number; y: number; width: number; height: number; label: string }>[];
}>;

const measureRawPage = browserCallback((): RawPage => {
  const visible = (element: Element) => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const own = (element: Element) => [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
  const outside = (element: Element) => element.closest('[data-product]') === null;
  const all = [...document.querySelectorAll('body *')].filter(visible);
  const texts = all.filter(element => own(element).length > 1);
  const rgba = (value: string): [number, number, number, number] | null => {
    const parts = /rgba?\(([^)]+)\)/.exec(value)?.[1]?.split(/[,/\s]+/).filter(Boolean).map(Number);
    return parts === undefined || parts.length < 3 ? null : [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
  };
  const luminance = ([r, g, b]: readonly number[]) => {
    const channel = (value: number) => { const unit = value / 255; return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
  };
  // The colour painted behind an element, or null when a picture, gradient or translucent layer makes it unknowable from styles.
  const ground = (element: Element): [number, number, number] | null => {
    for (let at: Element | null = element; at !== null; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.backgroundImage !== 'none' || Number(style.opacity) < 1 || style.mixBlendMode !== 'normal') return null;
      const color = rgba(style.backgroundColor);
      if (color !== null && color[3] >= 0.95) return [color[0], color[1], color[2]];
      if (color !== null && color[3] > 0.02) return null;
      if (at !== element && (style.position === 'absolute' || style.position === 'fixed')) return null;
    }
    return [255, 255, 255];
  };
  const overflow = Math.max(0, document.documentElement.scrollWidth - innerWidth);
  // Text that leaves the screen without anything clipping or scrolling it: a line the visitor cannot reach.
  const offEdge = texts.filter(element => {
    for (let at: Element | null = element; at !== null && at !== document.body; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.overflowX !== 'visible' || style.position === 'fixed') return false;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = range.getBoundingClientRect();
    // Wholly outside is hidden on purpose (a skip link parked off-screen); cut by the edge is the defect.
    return box.width > 0 && ((box.left < innerWidth - 8 && box.right > innerWidth + 4) || (box.left < -4 && box.right > 8));
  }).map(element => own(element).slice(0, 40));
  const body = texts.filter(outside).filter(element => own(element).length >= 60 && parseFloat(getComputedStyle(element).fontSize) <= 22);
  const lowContrast = body.flatMap(element => {
    const back = ground(element), front = rgba(getComputedStyle(element).color);
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    // Text kept for screen readers (a clipped 1px box) is not read by eye.
    if (box.width <= 2 || box.height <= 2 || style.clipPath !== 'none' || (style.clip !== 'auto' && style.clip !== '')) return [];
    if (back === null || front === null || front[3] < 0.95) return [];
    const light = luminance(front), dark = luminance(back);
    const ratio = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    // Text the same colour as the ground behind it is sitting on a layer the styles do not show (a picture, a canvas).
    return ratio < 3 && ratio >= 1.35 ? [{ text: own(element).slice(0, 40), ratio: Math.round(ratio * 100) / 100 }] : [];
  });
  const sizeCounts = new Map<number, number>();
  for (const element of body) { const size = Math.round(parseFloat(getComputedStyle(element).fontSize)); sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + own(element).length); }
  const bodySize = [...sizeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const headingOne = [...document.querySelectorAll('h1')].filter(visible).filter(outside)[0];
  const heroSize = headingOne === undefined ? null : Math.round(parseFloat(getComputedStyle(headingOne).fontSize));
  const sectionHeads = [...document.querySelectorAll('h2')].filter(visible).filter(outside).filter(element => element.closest('footer, nav, aside, dialog') === null);
  const headingSizes = [...new Set(sectionHeads.map(element => Math.round(parseFloat(getComputedStyle(element).fontSize))))].sort((a, b) => b - a);
  const filled = [...document.querySelectorAll('a, button')].filter(visible).filter(outside).filter(element => {
    const color = rgba(getComputedStyle(element).backgroundColor), box = element.getBoundingClientRect();
    return color !== null && color[3] > 0.9 && box.height >= 28 && box.height <= 80 && own(element).length > 0;
  });
  const byBackground = new Map<string, Set<string>>();
  for (const element of filled) {
    const style = getComputedStyle(element);
    const set = byBackground.get(style.backgroundColor) ?? new Set<string>();
    set.add(`${style.borderTopLeftRadius} radius, ${Math.round(parseFloat(style.fontSize))}px/${style.fontWeight}`);
    byBackground.set(style.backgroundColor, set);
  }
  const weightExamples = new Map<number, string>();
  for (const element of texts.filter(outside)) {
    const weight = Number(getComputedStyle(element).fontWeight);
    if (!weightExamples.has(weight)) weightExamples.set(weight, own(element).slice(0, 40));
  }
  const heads = [...document.querySelectorAll('h1, h2')].filter(visible).filter(outside);
  const eyebrows = heads.flatMap(heading => {
    const head = heading.getBoundingClientRect();
    return texts.filter(outside).filter(element => !heading.contains(element) && !element.contains(heading) && element.closest('nav, header, footer, button, a') === null).filter(element => {
      const box = element.getBoundingClientRect(), size = parseFloat(getComputedStyle(element).fontSize);
      const gap = head.top - box.bottom;
      return gap >= 0 && gap <= 56 && box.left < head.right && box.right > head.left && size <= 15 && size < parseFloat(getComputedStyle(heading).fontSize) * 0.5
        && words(own(element)) <= 5 && element.closest('h1, h2, h3') === null;
    }).map(element => `${own(element).slice(0, 30)} / ${(heading.textContent ?? '').trim().slice(0, 30)}`);
  });
  const sublines = sectionHeads.flatMap(heading => {
    const head = heading.getBoundingClientRect();
    return [...document.querySelectorAll('p')].filter(visible).filter(outside).filter(paragraph => {
      const box = paragraph.getBoundingClientRect(), gap = box.top - head.bottom, count = words(paragraph.textContent ?? '');
      return gap >= 0 && gap <= 40 && box.left < head.right && box.right > head.left && parseFloat(getComputedStyle(paragraph).fontSize) <= 22 && count >= 4 && count <= 45;
    }).slice(0, 1).map(() => (heading.textContent ?? '').trim().slice(0, 40));
  });
  const numberRows = all.filter(outside).filter(element => {
    const options = [...element.children].filter(visible).filter(child => child.matches('button, label, [role="radio"], [role="tab"]'));
    return options.length >= 3 && options.length === [...element.children].filter(visible).length
      && options.every(option => /^\s*[\d,.]+\s*[^\s\d]{0,6}\s*$/.test(option.textContent ?? ''));
  }).map(element => [...element.children].map(child => (child.textContent ?? '').trim()).join(' ').slice(0, 40));
  const logos = [...document.querySelectorAll('header img, nav img, header svg, nav svg, body > * img')].filter(visible).filter(outside).filter(element => {
    const box = element.getBoundingClientRect();
    return box.top + scrollY < 160 && box.width >= 40 && box.width <= 420 && box.height >= 14 && box.width >= box.height * 1.5;
  }).slice(0, 3).map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.left, y: box.top + scrollY, width: box.width, height: box.height, label: (element.getAttribute('alt') ?? element.getAttribute('aria-label') ?? 'logo').slice(0, 40) };
  });
  return { overflow, offEdge: [...new Set(offEdge)].slice(0, 6), lowContrast: lowContrast.slice(0, 6), headingSizes,
    buttonStyles: [...byBackground.entries()].map(([background, styles]) => ({ background, styles: [...styles] })).filter(item => item.styles.length > 1),
    weights: [...weightExamples.entries()].map(([weight, example]) => ({ weight, example })), eyebrows: [...new Set(eyebrows)].slice(0, 60),
    sublines: [...new Set(sublines)].slice(0, 60), heads: heads.length, sectionHeads: sectionHeads.length, heroSize, bodySize, numberRows: [...new Set(numberRows)].slice(0, 4), logos };
});

/** A logo file that carries its own flat panel: its corners are one neutral colour that differs from the page around it. */
export function logoOnBox(shot: PNG, margin: number): boolean {
  const at = (x: number, y: number): readonly [number, number, number, number] => {
    const index = (shot.width * Math.min(Math.max(Math.round(y), 0), shot.height - 1) + Math.min(Math.max(Math.round(x), 0), shot.width - 1)) * 4;
    return [shot.data[index]!, shot.data[index + 1]!, shot.data[index + 2]!, shot.data[index + 3]!];
  };
  const near = (left: readonly number[], right: readonly number[], limit: number) => Math.hypot(left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!) <= limit;
  const inset = margin + 3, far = 1;
  const inside = [at(inset, inset), at(shot.width - inset, inset), at(inset, shot.height - inset), at(shot.width - inset, shot.height - inset)];
  const around = [at(far, far), at(shot.width - far, far), at(far, shot.height - far), at(shot.width - far, shot.height - far)];
  const neutral = (pixel: readonly number[]) => Math.max(pixel[0]!, pixel[1]!, pixel[2]!) - Math.min(pixel[0]!, pixel[1]!, pixel[2]!) <= 14;
  return inside.every(pixel => near(pixel, inside[0]!, 8) && neutral(pixel)) && around.every(pixel => near(pixel, around[0]!, 8))
    && !near(inside[0]!, around[0]!, 5);
}

const LOGO_MARGIN = 6;

/** The findings of one rendered viewport, from what was measured in the page and the logo's own pixels. */
export function rawPageFindings(viewport: 'desktop' | 'mobile', raw: RawPage, boxedLogos: readonly string[]): readonly PageFinding[] {
  const findings: PageFinding[] = [];
  const add = (tier: PageFindingTier, id: string, message: string, count?: number, of?: number) =>
    findings.push({ tier, id, viewport, message, ...(count !== undefined && of !== undefined ? { count, of } : {}) });
  if (raw.overflow > 1) add('defect', 'horizontal-overflow', `the page scrolls sideways by ${raw.overflow}px: find the element wider than the screen (a fixed width, a long unbroken string, a grid without minmax(0, 1fr)) and let it shrink or wrap`);
  if (raw.offEdge.length > 0) add('defect', 'off-screen-text', `text runs off the screen ${raw.offEdge.slice(0, 3).map(text => `"${text}"`).join(', ')}: set it inside the width, or put it in a box that scrolls or clips on purpose`);
  if (raw.lowContrast.length > 0) add('defect', 'body-contrast', `body text too faint to read ${raw.lowContrast.slice(0, 3).map(item => `"${item.text}" at ${item.ratio}:1`).join(', ')}: take a darker step of the text colour (4.5:1 for running text)`);
  for (const label of boxedLogos) add('defect', 'logo-on-box', `the logo "${label}" sits on a flat panel that is not the page behind it: use the mark on a transparent ground (remove the file's own background rectangle) so it sits on the page`);
  if (raw.headingSizes.length > 2) add('convention', 'heading-steps', `section headings are set in ${raw.headingSizes.length} sizes (${raw.headingSizes.join(', ')}px): one role takes one step of the system; a second step is a second role, used on purpose`);
  for (const button of raw.buttonStyles.slice(0, 2)) add('convention', 'button-anatomy', `buttons of one fill are built ${button.styles.length} ways (${button.styles.join(' / ')}): one control, one anatomy`);
  const heavy = raw.weights.filter(item => item.weight > 600 || item.weight < 400);
  if (heavy.length > 0) add('convention', 'weight-range', `weights outside 400 to 600 ${heavy.slice(0, 3).map(item => `${item.weight} ("${item.example}")`).join(', ')}: carry hierarchy by size`);
  if (raw.eyebrows.length > 0) add('convention', 'eyebrow-label', `small labels above headings ${raw.eyebrows.slice(0, 3).map(text => `"${text}"`).join(', ')}: the heading says it alone`, raw.eyebrows.length, raw.heads);
  if (raw.sublines.length > 0) add('convention', 'heading-subline', `explanatory lines under section headings ${raw.sublines.slice(0, 3).map(text => `"${text}"`).join(', ')}: let the section's own content explain it`, raw.sublines.length, raw.sectionHeads);
  if (viewport === 'desktop' && raw.heroSize !== null && raw.bodySize !== null && raw.heroSize < raw.bodySize * 3.5) {
    add('convention', 'hero-scale', `the headline is ${raw.heroSize}px against ${raw.bodySize}px body text (${(raw.heroSize / raw.bodySize).toFixed(1)}x): the first screen hooks with one thing far larger than the rest`);
  }
  if (raw.numberRows.length > 0) add('convention', 'quantity-slider', `a quantity is chosen from a row of buttons ${raw.numberRows.slice(0, 2).map(text => `"${text}"`).join(', ')}: a slider reads as an amount`);
  return findings;
}

async function boxedLogos(page: Page, logos: RawPage['logos']): Promise<readonly string[]> {
  const boxed: string[] = [];
  for (const logo of logos) {
    const clip = { x: Math.max(0, logo.x - LOGO_MARGIN), y: Math.max(0, logo.y - LOGO_MARGIN), width: logo.width + LOGO_MARGIN * 2, height: logo.height + LOGO_MARGIN * 2 };
    try {
      if (logoOnBox(PNG.sync.read(await page.screenshot({ clip })), LOGO_MARGIN)) boxed.push(logo.label);
    } catch { /* a logo that cannot be shot is not judged */ }
  }
  return boxed;
}

/** Measure one page (a built file, a folder or a URL) at desktop and phone width. */
export async function observePageFindings(target: string): Promise<readonly PageFinding[]> {
  const { chromium } = await import('playwright');
  const resolved = await resolveRenderTarget(target);
  const browser = await chromium.launch({ headless: true });
  try {
    const findings: PageFinding[] = [];
    for (const [viewport, size] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
      const page = await browser.newPage({ viewport: size });
      try {
        await page.goto(resolved.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < Math.min(height, 30_000); y += size.height) { await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(200); }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        const raw = await page.evaluate(measureRawPage);
        findings.push(...rawPageFindings(viewport, raw, await boxedLogos(page, raw.logos)));
      } finally { await page.close(); }
    }
    return findings;
  } finally {
    await browser.close();
    await resolved.close();
  }
}

/** Three sections in a row built on one template, from the sections measured at desktop (what leads each, split header, height in half screens). */
export function repeatedTemplate(sections: readonly Readonly<{ height: number; largeMedia: number; product?: number; splitHeader?: boolean; words: number }>[]): string | null {
  const key = (section: (typeof sections)[number]) => `${(section.product ?? 0) > 0 ? 'product' : section.largeMedia > 0 ? 'picture' : 'text'}|${section.splitHeader === true}|${Math.round(section.height / 450)}`;
  for (let index = 1; index + 2 < sections.length; index += 1) {
    const run = sections.slice(index, index + 3).map(key);
    if (run.every(value => value === run[0])) return `sections ${index + 1} to ${index + 3} share one template (${run[0]!.split('|')[0]} led, the same height): give each story its own composition`;
  }
  return null;
}

/** A deviation applied to fewer than this share of the places it could be reads as an accident, not a choice. */
export const DEVIATION_CONSISTENT_SHARE = 0.6;

/**
 * Defects always stand. A convention stands until the system records a deviation for it; then the page is held to its own
 * choice: a label above two headings out of seven is neither the default nor the deviation.
 */
export function heldFindings(findings: readonly PageFinding[], deviations: readonly StudioDeviation[]): readonly PageFinding[] {
  const waived = new Map<string, StudioDeviation>(deviations.map(deviation => [deviation.convention, deviation]));
  return findings.flatMap((finding): PageFinding[] => {
    if (finding.tier === 'defect') return [finding];
    const deviation = waived.get(finding.id);
    if (deviation === undefined) return [finding];
    if (finding.count !== undefined && finding.of !== undefined && finding.of >= 3 && finding.count < finding.of * DEVIATION_CONSISTENT_SHARE) {
      return [{ tier: 'defect', id: 'deviation-inconsistent', viewport: finding.viewport, message: `the system records a deviation from ${finding.id} ("${deviation.instead}") `
        + `and the page applies it to ${finding.count} of ${finding.of}: apply the choice everywhere it belongs, or drop it` }];
    }
    return [];
  });
}

export function findingLines(findings: readonly PageFinding[]): readonly string[] {
  const seen = new Set<string>();
  return findings.flatMap(finding => {
    const line = `${finding.tier === 'defect' ? 'defect' : 'convention'} [${finding.id}] ${finding.viewport}: ${finding.message}`;
    if (seen.has(`${finding.id}|${finding.message}`)) return [];
    seen.add(`${finding.id}|${finding.message}`);
    return [line];
  });
}
