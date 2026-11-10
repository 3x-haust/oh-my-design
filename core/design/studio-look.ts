import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { resolveRenderTarget } from '../render/serve.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { pageIdeaPreview } from './idea-image.ts';
import { STUDIO_DIR } from './studio-paths.ts';
import { primaryStudy, studioStudies, type StudioSection, type StudioStudy } from './studio.ts';

/**
 * A designer keeps the reference open beside the canvas. `omd studio look` shoots the build the way the reference was shot
 * (first screen, each screen of the scroll, the whole page, at desktop and phone width) and sets it beside the primary
 * reference in one image, so the next pass starts from what is visibly different, not from a remembered description.
 */
export const STUDIO_LOOK_DIR = `${STUDIO_DIR}/look`;
const LOOK_VIEWPORTS = [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const;
const LOOK_MAX_SCREENS = 12;
const BESIDE_WIDTH = 900;
const PAPER = [38, 38, 40] as const;

/** Two images set side by side on one ground, each at the same width, tops aligned. */
export function besideImage(left: Buffer, right: Buffer, width = BESIDE_WIDTH, maxHeight = 6000): Buffer {
  const a = PNG.sync.read(pageIdeaPreview(left, width)), b = PNG.sync.read(pageIdeaPreview(right, width));
  const gap = 24, height = Math.min(Math.max(a.height, b.height), maxHeight) + gap * 2;
  const out = new PNG({ width: width * 2 + gap * 3, height });
  for (let index = 0; index < out.data.length; index += 4) {
    out.data[index] = PAPER[0]; out.data[index + 1] = PAPER[1]; out.data[index + 2] = PAPER[2]; out.data[index + 3] = 255;
  }
  PNG.bitblt(a, out, 0, 0, a.width, Math.min(a.height, maxHeight), gap, gap);
  PNG.bitblt(b, out, 0, 0, b.width, Math.min(b.height, maxHeight), width + gap * 2, gap);
  return PNG.sync.write(out);
}

export type StudioLook = Readonly<{ dir: string; round: number; files: readonly string[]; beside: readonly string[]; reference: string | null }>;

/** Shoot the build and set it beside the primary reference; each call is a new numbered round so the passes can be reviewed. */
export async function lookAtBuild(root: string, writer: ProjectWriteAdapter, target: string): Promise<StudioLook> {
  const { chromium } = await import('playwright');
  const base = join(root, STUDIO_LOOK_DIR);
  const round = (existsSync(base) ? readdirSync(base).filter(name => /^\d+$/.test(name)).length : 0) + 1;
  const dir = `${STUDIO_LOOK_DIR}/${String(round).padStart(2, '0')}`;
  writer.mkdir(dir);
  const resolved = await resolveRenderTarget(target);
  const browser = await chromium.launch({ headless: true });
  const files: string[] = [], beside: string[] = [];
  let first: Buffer | null = null, full: Buffer | null = null;
  try {
    for (const [viewport, size] of LOOK_VIEWPORTS) {
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
      try {
        await page.goto(resolved.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
        const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), size.height * LOOK_MAX_SCREENS);
        const write = (name: string, bytes: Buffer) => { writer.write(`${dir}/${name}`, bytes); files.push(`${dir}/${name}`); };
        const firstShot = await page.screenshot();
        write(`${viewport}-first.png`, firstShot);
        // Read like a visitor: a screen at a time, pausing so reveals fire and finish before each shot.
        for (let index = 1, y = size.height; y < height; index += 1, y += size.height) {
          await page.evaluate(top => window.scrollTo(0, top), y);
          await page.waitForTimeout(700);
          write(`${viewport}-screen-${String(index + 1).padStart(2, '0')}.png`, pageIdeaPreview(await page.screenshot(), size.width));
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        const fullShot = pageIdeaPreview(await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: size.width, height } }), viewport === 'desktop' ? 1000 : size.width);
        write(`${viewport}-full.png`, fullShot);
        if (viewport === 'desktop') { first = firstShot; full = fullShot; }
      } finally { await page.close(); }
    }
  } finally {
    await browser.close();
    await resolved.close();
  }
  const study = primaryStudy(root) ?? studioStudies(root)[0] ?? null;
  if (study !== null && first !== null && full !== null) {
    writer.write(`${dir}/beside-first.png`, besideImage(readFileSync(join(root, study.firstScreen)), first));
    writer.write(`${dir}/beside-full.png`, besideImage(readFileSync(join(root, study.full)), full, 700, 9000));
    beside.push(`${dir}/beside-first.png`, `${dir}/beside-full.png`);
  }
  return { dir, round, files, beside, reference: study?.url ?? null };
}

export const STUDIO_BLUEPRINT = `${STUDIO_DIR}/blueprint.md`;

type StudyRecord = Readonly<{ requested?: string; typeRamp?: readonly Readonly<{ size: number; weight: number; count: number }>[]; weights?: readonly number[];
  sections?: readonly StudioSection[] }>;

/**
 * The reference's skeleton with everything that belongs to its brand left out: the order of sections, how tall each is, what
 * leads it and how it is laid out, the type steps. No copy, colour, image or name crosses over; each section ends in a slot
 * for this project's own content, so the structure is filled, not copied.
 */
export function blueprintOutline(study: StudyRecord, screen = 900): string {
  const sections = study.sections ?? [];
  const sizes = [...new Set((study.typeRamp ?? []).filter(step => step.count >= 2 || step.size >= 24).map(step => Math.round(step.size)))].sort((a, b) => b - a).slice(0, 8);
  const lead = (section: StudioSection) => (section.product ?? 0) > 0 ? 'the product at work' : section.largeMedia > 1 ? `${section.largeMedia} large pictures` : section.largeMedia === 1 ? 'one large picture' : 'type';
  const layout = (section: StudioSection) => section.splitHeader === true ? 'headline with a short text beside it' : 'headline over its content';
  const lines = sections.map((section, index) => {
    const before = sections[index - 1];
    const ground = before !== undefined && before.background !== section.background ? ', the ground changes here' : '';
    const density = Math.round(section.words / Math.max(section.height / screen, 0.25));
    return [`## ${index + 1}. ${(section.height / screen).toFixed(1)} screens, led by ${lead(section)}`,
      `- Layout: ${layout(section)}${section.contentWidth === null ? '' : `, content ${section.contentWidth}px wide`}${ground}`,
      `- Heading: ${section.heading === '' ? 'none' : `${section.heading.trim().split(/\s+/).length} words`}; about ${density} words a screen`,
      ...(section.crop === undefined ? [] : [`- Look at: ${section.crop}`]),
      '- This project\'s content for this section: ______'].join('\n');
  });
  return ['# Reference skeleton (structure only: no copy, colour, image or name)',
    `Type steps: ${sizes.length > 0 ? `${sizes.join(' / ')} px` : 'not measured'}; weights ${(study.weights ?? []).join(', ') || 'not measured'}.`,
    `${sections.length} sections over ${(sections.reduce((sum, section) => sum + section.height, 0) / screen).toFixed(1)} screens. Fill each slot with what this project really has; `
      + 'drop a section the project has nothing true for, and give the page\'s own idea the place the reference gives its signature.',
    ...lines].join('\n\n');
}

/** Write the skeleton of a studied site (the primary reference unless a study is named). */
export function writeBlueprint(root: string, writer: ProjectWriteAdapter, url?: string): Readonly<{ path: string; reference: string; sections: number }> {
  const studies = studioStudies(root);
  const match = (study: StudioStudy) => url !== undefined && (study.url === url || study.url.replace(/\/+$/, '') === url.replace(/\/+$/, '') || study.dir.endsWith(`/${url}`));
  const study = url === undefined ? primaryStudy(root) ?? studies[0] : studies.find(match);
  if (study === undefined || study === null) throw new Error(`STUDIO_STUDY_MISSING: ${url === undefined ? 'no site is studied yet' : `${url} is not studied`}; run omd studio refs <url> --json first`);
  const record = JSON.parse(readFileSync(join(root, study.dir, 'study.json'), 'utf8')) as StudyRecord;
  writer.write(STUDIO_BLUEPRINT, `${blueprintOutline(record)}\n`);
  return { path: STUDIO_BLUEPRINT, reference: study.url, sections: record.sections?.length ?? 0 };
}
