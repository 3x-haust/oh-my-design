import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { pageIdeaPreview } from './idea-image.ts';
import { readmeLogos } from './studio-floors.ts';

/**
 * A new page is drawn before it is built, the way a designer comps a page before anyone writes code: each concept is a
 * full-page comp image drawn from the brief, the real copy, the project's own logo and whole pages of finished sites,
 * whose craft (hierarchy, spacing, the small exact details that carry substance) it takes and whose branding it leaves.
 * The comp never ships; the picked one is the target the page is built to and reviewed against.
 */
export const STUDIO_REFS_DIR = '.omd/studio/refs';
const REF_VIEWPORT = { width: 1440, height: 900 } as const;
/** How much of a reference page below its first screen the comp sees: the sections that show how a page carries detail. */
const REF_BODY_HEIGHT = 4600;
const REF_PREVIEW_WIDTH = 1000;
const COMP_PREVIEW_WIDTH = 1280;
/** The first screen of a 1440-wide comp, as a 1280×900 capture beside the anchors' first screens in the blind pick. */
const COMP_FIRST_SCREEN = { width: 1440, height: 1013 } as const;
export const COMP_TIMEOUT_MS = 900_000;
/** The width the picked comp is shown to the first-render reviewer at: its whole scroll readable beside the page's own captures. */
export const STUDIO_COMP_REVIEW_WIDTH = 800;

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const slug = (url: string): string => new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

export type StudioReference = Readonly<{ url: string; path: string; sha256: string }>;

/** Whole finished pages captured for the comps: the body below the first screen, where a page shows how it carries detail. */
export async function captureStudioReferences(writer: ProjectWriteAdapter, urls: readonly string[]): Promise<Readonly<{
  captured: readonly StudioReference[]; skipped: readonly Readonly<{ url: string; reason: string }>[] }>> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const captured: StudioReference[] = [], skipped: { url: string; reason: string }[] = [];
  writer.mkdir(STUDIO_REFS_DIR);
  try {
    for (const url of urls) {
      if (!/^https?:\/\//i.test(url)) { skipped.push({ url, reason: 'not an http(s) URL' }); continue; }
      const page = await browser.newPage({ viewport: REF_VIEWPORT });
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => null);
        if (response !== null && response.status() >= 400) { skipped.push({ url, reason: `HTTP ${response.status()}` }); continue; }
        await page.waitForTimeout(1500);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        // Lazy sections load only once scrolled past.
        for (let y = 0; y < Math.min(height, REF_VIEWPORT.height + REF_BODY_HEIGHT); y += 700) {
          await page.evaluate(top => window.scrollTo(0, top), y);
          await page.waitForTimeout(250);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(600);
        if (height < REF_VIEWPORT.height * 2) { skipped.push({ url, reason: 'the page is shorter than two screens' }); continue; }
        const shot = await page.screenshot({ fullPage: true,
          clip: { x: 0, y: REF_VIEWPORT.height, width: REF_VIEWPORT.width, height: Math.min(REF_BODY_HEIGHT, height - REF_VIEWPORT.height) } });
        const bytes = pageIdeaPreview(shot, REF_PREVIEW_WIDTH);
        const path = `${STUDIO_REFS_DIR}/${slug(url)}.png`;
        writer.write(path, bytes);
        captured.push({ url, path, sha256: sha256(bytes) });
      } catch (error) {
        skipped.push({ url, reason: error instanceof Error ? error.message.split('\n')[0]!.slice(0, 160) : String(error) });
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  return { captured, skipped };
}

export function studioReferenceImages(root: string): readonly string[] {
  const dir = join(root, STUDIO_REFS_DIR);
  return existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.png')).sort().map(name => `${STUDIO_REFS_DIR}/${name}`) : [];
}

/** The rules every comp is drawn under; the concept's own prompt says what makes it a different page. */
export function compInstruction(input: Readonly<{ brief: string; copy: string; concept: string; logo: boolean; references: number }>): string {
  return [
    'Use your image generation tool to generate exactly one image, then stop. Do not run shell commands and do not build the page in HTML.',
    'Draw a full-page desktop landing page comp: one tall image 1440px wide holding the whole scroll from the header to the footer, as a '
      + 'senior designer at a top independent studio presents a comp to a client. It must read as designed by a person with taste: no small '
      + 'eyebrow label above every section, no generic split hero with a floating object, no icon grids or card grids, no gradient blobs, no app '
      + 'window screenshots or screens inside screens, no invented example results, testimonials, logos or numbers.',
    input.logo ? 'The first attached image is the project\'s logo: place it exactly as it is, never redrawn or restyled.' : '',
    'The page\'s identity comes from the project itself, as a designer finds it in the repository: the logo\'s own colours, shapes and '
      + 'character set the palette and the mood, and the README\'s voice sets the tone. Never dress the project in a neutral palette it does not '
      + 'have; a playful project looks playful, a severe one severe. Carry one bold idea from that identity through the whole page, so it is '
      + 'remembered as this project\'s site and could not pass for a documentation template.',
    input.references > 0 ? `The ${input.logo ? 'other ' : ''}attached images are the bodies of finished sites. Take how they are made: one strict `
      + 'grid, a hierarchy that steps down clearly, the pacing between dense and open screens, substance shown through exact details, finish in '
      + 'the small parts. Never take their branding, colours, copy, illustrations or layout wholesale.' : '',
    'The story unfolds over the scroll: the first screen carries one message and its object; each later screen one idea at full size; no '
      + 'tabs, accordions or carousels. A 3D object, when the page has one, is the first screen\'s protagonist and appears below it at most once, '
      + 'smaller and quieter; never repeat giant crops of it section after section.',
    'Set the real copy below exactly, large enough to read; invent no capabilities, numbers or claims.',
    `Brief:\n${input.brief.trim()}`,
    input.copy.trim() ? `Copy:\n${input.copy.trim()}` : '',
    `This concept:\n${input.concept.trim()}`,
  ].filter(Boolean).join('\n\n');
}

/** Where the agent saves the project's logo when the README only links it from the web. */
export const STUDIO_LOGO = '.omd/studio/logo.png';
/** Written instead when the project has no logo at all. */
export const STUDIO_NO_LOGO = '.omd/studio/no-logo';

/** A PNG of the project's logo for the comp to place as is: one the agent saved, else the README logo's raster form. */
export function compLogo(root: string): string | null {
  if (existsSync(join(root, STUDIO_LOGO))) return STUDIO_LOGO;
  return readmeLogos(root).find(mark => mark.path.endsWith('.png'))?.path ?? null;
}

/**
 * A project with a README nearly always has a logo, but many READMEs link it from the web (an uploaded image with no alt text), where
 * no file check finds it. Drawing on without it gives comps a typed wordmark in place of the real mark, so the agent saves it first.
 */
export function compLogoMissing(root: string): boolean {
  return compLogo(root) === null && !existsSync(join(root, STUDIO_NO_LOGO))
    && readdirSync(root).some(name => /^readme(?:\.[a-z-]+)?\.md$/i.test(name));
}

export type CompRunner = (directory: string, instruction: string, attachments: readonly string[]) => Promise<string | void>;

/** Codex keeps a session's generated images under $CODEX_HOME/generated_images/<session id>/; the newest one of this session. */
export function sessionImage(sessionId: string, codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')): string | undefined {
  const dir = join(codexHome, 'generated_images', sessionId);
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir).filter(name => name.endsWith('.png')).map(name => join(dir, name))
    .map(path => ({ path, time: statSync(path).mtimeMs })).sort((left, right) => right.time - left.time)[0]?.path;
}

/** The session id `codex exec` prints in its header, which names where that run's images are stored. */
export const codexSessionId = (output: string): string | undefined => /^session id:\s*([0-9a-f-]{36})\s*$/im.exec(output)?.[1];

/**
 * Runs one comp; comps run side by side, so three take the time of one. The image is read from the work folder or from
 * this run's own session in Codex's store, never the newest image overall, which may belong to a comp running beside it.
 */
export const codexCompRunner: CompRunner = (directory, instruction, attachments) => new Promise((done, failed) => {
  const child = spawn('codex', ['exec', '-s', 'workspace-write', '--skip-git-repo-check', '-C', directory,
    ...attachments.flatMap(path => ['-i', path]), '-'], { stdio: ['pipe', 'ignore', 'pipe'] });
  let head = '', stderr = '';
  child.stderr.on('data', chunk => {
    if (head.length < 4000) head = `${head}${String(chunk)}`.slice(0, 4000);
    stderr = `${stderr}${String(chunk)}`.slice(-4000);
  });
  const timer = setTimeout(() => child.kill('SIGTERM'), COMP_TIMEOUT_MS);
  child.on('error', error => { clearTimeout(timer); failed(error); });
  child.on('close', code => {
    clearTimeout(timer);
    if (code !== 0) {
      const reason = stderr.trim().split('\n').filter(line => /error|denied|login|auth|quota|limit|network|failed/i.test(line)).at(-1)?.slice(0, 200);
      failed(new Error(`exit ${code}${reason ? `: ${reason}` : ''}`));
      return;
    }
    const local = readdirSync(directory).filter(name => name.endsWith('.png')).map(name => join(directory, name))[0];
    const session = codexSessionId(head);
    done(local ?? (session === undefined ? undefined : sessionImage(session)));
  });
  child.stdin.end(instruction);
});

export type GeneratedComp = Readonly<{ name: string; comp: Buffer; firstScreen: Buffer }>;

/** The first screen of a comp, as the pick compares it beside the anchors' first screens. */
export function compFirstScreen(bytes: Buffer): Buffer {
  const source = PNG.sync.read(bytes);
  const scale = source.width / COMP_FIRST_SCREEN.width;
  const height = Math.min(source.height, Math.round(COMP_FIRST_SCREEN.height * scale));
  const top = new PNG({ width: source.width, height });
  source.data.copy(top.data, 0, 0, source.width * height * 4);
  return pageIdeaPreview(PNG.sync.write(top), COMP_PREVIEW_WIDTH);
}

/** Draw every concept's comp at once. A concept whose comp fails names why; the maker may then sketch it in HTML instead. */
export async function generateStudioComps(root: string, concepts: readonly Readonly<{ name: string; prompt: string }>[],
  run: CompRunner = codexCompRunner): Promise<readonly GeneratedComp[]> {
  const read = (path: string) => existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '';
  const logo = compLogo(root);
  const references = studioReferenceImages(root);
  const attachments = [...(logo === null ? [] : [join(root, logo)]), ...references.map(path => join(root, path))];
  const results = await Promise.allSettled(concepts.map(async concept => {
    const work = mkdtempSync(join(tmpdir(), 'omd-comp-'));
    try {
      const instruction = compInstruction({ brief: read('.omd/studio/brief.md'), copy: read('.omd/studio/copy.md'), concept: concept.prompt,
        logo: logo !== null, references: references.length });
      const stored = await run(work, `${instruction}\n\nSave the image as ${join(work, 'comp.png')}.`, attachments);
      const path = existsSync(join(work, 'comp.png')) ? join(work, 'comp.png') : stored;
      if (!path || !existsSync(path)) throw new Error('Codex finished without an image');
      const comp = readFileSync(path);
      PNG.sync.read(comp);
      return { name: concept.name, comp, firstScreen: compFirstScreen(comp) };
    } finally { rmSync(work, { recursive: true, force: true }); }
  }));
  const failed = results.flatMap((result, index) => result.status === 'rejected'
    ? [`${concepts[index]!.name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`] : []);
  if (failed.length > 0) {
    throw Object.assign(new Error(`STUDIO_COMP_UNAVAILABLE: ${failed.join('; ')}. Comps need a signed-in Codex CLI with image generation; `
      + 'without one, write each concept as a full-page HTML sketch (index.html) in its folder instead.'), { code: 'STUDIO_COMP_UNAVAILABLE' });
  }
  return results.map(result => (result as PromiseFulfilledResult<GeneratedComp>).value);
}
