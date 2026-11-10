import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { PNG } from 'pngjs';

/**
 * Generated images, made by the Codex CLI's image tool and kept in the design record (.omd/ideas) with their prompt:
 * a graphic idea (one object), a page idea (one section or screen drafted flat), a concept board (the whole product's
 * direction on one sheet) or an asset candidate (one set of the product's own icons, objects, characters or badges in
 * one style). Page ideas and concept boards are drafts and never ship as a page image; a chosen asset or graphic
 * candidate may ship once it is published with omd studio asset, which records its provenance. Without a usable Codex
 * the attempt is recorded as unavailable and the maker falls back to code (the material rig).
 */
export const IDEA_DIRECTORY = '.omd/ideas';
const IDEA_UNAVAILABLE_PATH = `${IDEA_DIRECTORY}/unavailable.json`;

/** A graphic idea (one object), a page idea (a section or screen laid out), a concept board (the whole product) or an asset candidate (one set). */
export const IDEA_KINDS = ['graphic', 'page', 'board', 'asset'] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number];
/** Drafts of whole pages or products: decision material that never ships as an image on the page. */
export const MOCKUP_KINDS: ReadonlySet<IdeaKind> = new Set(['page', 'board']);

export type IdeaRecord = Readonly<{ path: string; prompt: string; kind: IdeaKind; name: string; references: readonly string[] }>;

/** The idea images on record, oldest first. A record written before ideas had a kind is a graphic idea. */
export function ideaImages(root: string): IdeaRecord[] {
  const directory = join(root, IDEA_DIRECTORY);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => name.endsWith('.png')).sort().flatMap(name => {
    try {
      const record = JSON.parse(readFileSync(join(directory, name.replace(/\.png$/, '.json')), 'utf8')) as { prompt?: string; kind?: IdeaKind; name?: string; references?: unknown };
      const kind: IdeaKind = IDEA_KINDS.includes(record.kind as IdeaKind) ? record.kind as IdeaKind : 'graphic';
      const references = Array.isArray(record.references) ? record.references.filter((item): item is string => typeof item === 'string') : [];
      return [{ path: `${IDEA_DIRECTORY}/${name}`, prompt: String(record.prompt ?? ''), kind, name: String(record.name ?? name.replace(/-\d+\.png$/, '')), references }];
    } catch { return []; }
  });
}

export const ideationUnavailable = (root: string): boolean => existsSync(join(root, IDEA_UNAVAILABLE_PATH));

/** Ideation happened: an idea image of this kind exists, or generation was tried and is unavailable in this environment. */
export function ideationRecorded(root: string, kind: IdeaKind = 'graphic'): boolean {
  return ideationUnavailable(root) || ideaImages(root).some(idea => idea.kind === kind);
}

/** Returns the generated image when the runner can find it without the model copying it (see codexImageRunner). */
export type IdeaImageRunner = (directory: string, instruction: string, references: readonly string[]) => string | void;

/** Codex keeps each generated image under $CODEX_HOME/generated_images/<session>/; the newest one since `since`. */
function newestGeneratedImage(since: number): string | undefined {
  const root = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'generated_images');
  if (!existsSync(root)) return undefined;
  const files = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    const directory = join(root, entry.name);
    return readdirSync(directory).filter(name => name.endsWith('.png')).map(name => join(directory, name));
  }).map(path => ({ path, time: statSync(path).mtimeMs })).filter(file => file.time >= since);
  return files.sort((left, right) => right.time - left.time)[0]?.path;
}

export const codexImageRunner: IdeaImageRunner = (directory, instruction, references) => {
  const started = Date.now() - 1_000;
  const result = spawnSync('codex', ['exec', '-s', 'workspace-write', '--skip-git-repo-check', '-C', directory,
    ...references.flatMap(path => ['-i', path]), '-'], { input: instruction, encoding: 'utf8', timeout: 600_000, stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.error !== undefined || result.status !== 0) {
    // The last line Codex printed says why (not logged in, quota, network); it carries no project content.
    const reason = `${result.stderr ?? ''}`.trim().split('\n').filter(line => /error|denied|login|auth|quota|limit|network|failed/i.test(line)).at(-1)?.slice(0, 200);
    throw new Error(`IDEA_IMAGE_UNAVAILABLE: the Codex CLI could not generate an image (${result.error?.message ?? `exit ${result.status}`}${reason ? `: ${reason}` : ''}). `
      + 'Sketch the idea directly in code instead; idea images are optional.');
  }
  // Inside a sandboxed host Codex cannot nest its own command sandbox, so the image is taken from where Codex
  // stored it rather than relying on the model to copy it.
  return newestGeneratedImage(started);
};

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'idea';

export type IdeaImageResult = Readonly<{ path: string; prompt: string; kind: IdeaKind; references: readonly string[] }>;

/** The tool that drew every idea on record: Codex's built-in image generation, reached through codex exec. */
export const IDEA_IMAGE_TOOL = 'codex exec (image_generation)';

const PROMPT_HINT: Readonly<Record<IdeaKind, string>> = {
  graphic: 'describe the section\'s claim, the protagonist object, its material and light, and the framing',
  page: 'describe the section\'s exact copy, the layout (what sits where and how large), the type, the graphic or product proof and its place, and the palette',
  board: 'describe the product, its key screens or sections with their real content, the palette, the type, the asset style and the mood the board must show',
  asset: 'describe the set: which items (one per job), their one shared style (form, material, light, line, colour), the size they are seen at, and the plain background',
};

const TRANSIENT_FAILURE = /rate limit|too many requests|\b429\b|ECONNRESET|stream disconnected/i;

const ONE_IMAGE = 'Use your image generation tool to generate exactly one image, then stop. Do not run shell commands.';

/** What the image tool is told for each kind; the prompt itself is the designer's. */
export function ideaInstruction(kind: IdeaKind, prompt: string, viewport: 'desktop' | 'mobile', referenced: boolean): string {
  const lines = kind === 'page' ? [
    ONE_IMAGE,
    // A mobile app is drafted at the size it is used: a landscape draft of a phone screen settles a layout the app never has.
    viewport === 'mobile'
      ? 'It is a designer\'s draft of one mobile app screen seen flat at phone width, a tall portrait frame about 390 by 844, not a device '
        + 'mockup and not a desktop layout: it will not ship, it settles the screen\'s composition before it is built in HTML.'
      : 'It is a designer\'s draft of one landing-page section seen flat at desktop width, a wide landscape frame, not a device mockup '
        + 'and not a whole tall page: it will not ship, it settles the section\'s composition before it is built in HTML.',
    'Draw one composition only: when the description offers alternatives, draw the first; each other alternative is its own idea image.',
    'Set the given copy exactly, large enough to read, with real hierarchy between headline, body and actions.',
    `Section: ${prompt}`,
  ] : kind === 'board' ? [
    ONE_IMAGE,
    'It is a designer\'s concept board for a whole product, one wide landscape sheet about 1536 by 1024: several of its key '
      + (viewport === 'mobile' ? 'screens at phone size side by side' : 'screens or page sections side by side')
      + ', its palette as swatches, a type specimen, and samples of its own icons, illustrations or objects in one style. It will not ship; it '
      + 'settles the product\'s visual direction before any screen is built.',
    referenced ? 'The attached sheet is the designer\'s reference board: each image on it has one job written under it. Take what each is kept '
      + 'for (a layout, an icon style, a material), never its subject, copy, logo or brand.' : '',
    'Real content in the product\'s language, readable; no device frames, no real people, no other company\'s logo.',
    `Product: ${prompt}`,
  ] : kind === 'asset' ? [
    ONE_IMAGE,
    'It is one candidate set of a product\'s own assets, drawn to be cut out and shipped in the product: every item in one consistent style '
      + '(the same form language, material, light, line weight and palette), each item whole and separate from its neighbours with clear space '
      + 'around it, laid out in an even grid on one plain flat background colour that appears in none of the items, no cast shadow reaching the '
      + 'background, no text, no labels, no frame.',
    referenced ? 'The attached image is the chosen concept board: match its style and palette exactly; do not copy its screens.' : '',
    'No real people, no photographs, no product screenshots, no other company\'s logo.',
    `Set: ${prompt}`,
  ] : [
    ONE_IMAGE,
    'It is an idea image for a designer exploring the key visual of a section: one object. If chosen it may be cut out and shipped as the '
      + 'product\'s own asset, so draw it whole on a plain flat background with clear space around it.',
    referenced ? 'The attached images are kept references: take their level of craft, light and material, never their subject or branding.' : '',
    'No text, captions or UI chrome inside the image unless the idea needs one short label. No real people, no product screenshots.',
    `Idea: ${prompt}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function generateIdeaImage(root: string, writer: ProjectWriteAdapter,
  input: Readonly<{ name: string; prompt: string; references?: readonly string[]; kind?: IdeaKind; viewport?: 'desktop' | 'mobile' }>,
  run: IdeaImageRunner = codexImageRunner): IdeaImageResult {
  const prompt = input.prompt.trim(), kind = input.kind ?? 'graphic';
  if (prompt.length < 20) throw new Error(`IDEA_IMAGE_PROMPT: ${PROMPT_HINT[kind]}`);
  // A page idea is drafted from the brief and the references as described in words: attached gallery pixels pull the
  // draft into a copy of someone else's layout.
  if (kind === 'page' && input.references?.length) {
    throw new Error('IDEA_IMAGE_REFERENCE: a page idea takes no attached reference; describe in the prompt what the kept references show (their hierarchy, spacing, type contrast), not their pixels');
  }
  const references = (input.references ?? []).map(path => {
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) throw new Error(`IDEA_IMAGE_REFERENCE: ${path} does not exist`);
    return absolute;
  });
  const work = mkdtempSync(join(tmpdir(), 'omd-idea-'));
  try {
    const attempt = (): string | void => run(work, ideaInstruction(kind, prompt, input.viewport ?? 'desktop', references.length > 0), references);
    let generated = join(work, 'idea.png');
    try {
      // A rate limit, timeout or dropped connection is not an absent tool: try again before recording unavailability.
      for (let tries = 1; ; tries += 1) {
        try {
          const stored = attempt();
          if (!existsSync(generated) && stored) generated = stored;
          if (!existsSync(generated)) throw new Error('IDEA_IMAGE_UNAVAILABLE: Codex finished without an idea.png; sketch the idea in code instead.');
          break;
        } catch (error) {
          if (tries >= 3 || !(error instanceof Error && TRANSIENT_FAILURE.test(error.message))) throw error;
        }
      }
    } catch (error) {
      // Recorded so the graphics stage knows ideation was tried and the maker may sketch in code instead.
      if (error instanceof Error && error.message.startsWith('IDEA_IMAGE_UNAVAILABLE')) {
        writer.mkdir(IDEA_DIRECTORY);
        writer.write(IDEA_UNAVAILABLE_PATH, `${JSON.stringify({ reason: error.message }, null, 2)}\n`);
      }
      throw error;
    }
    const bytes = readFileSync(generated);
    writer.mkdir(IDEA_DIRECTORY);
    const name = slug(input.name);
    let index = 1;
    while (existsSync(join(root, IDEA_DIRECTORY, `${name}-${index}.png`))) index += 1;
    const path = `${IDEA_DIRECTORY}/${name}-${index}.png`;
    writer.write(path, bytes);
    // The tool works: an earlier recorded unavailability no longer excuses a skipped stage.
    if (existsSync(join(root, IDEA_UNAVAILABLE_PATH))) writer.remove(IDEA_UNAVAILABLE_PATH);
    writer.write(`${IDEA_DIRECTORY}/${name}-${index}.json`, `${JSON.stringify({ prompt, kind, name, tool: IDEA_IMAGE_TOOL,
      ...(input.viewport === 'mobile' ? { viewport: 'mobile' } : {}), references: input.references ?? [] }, null, 2)}\n`);
    return { path, prompt, kind, references: input.references ?? [] };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The width a page idea is shown to a reviewer at: enough to read its composition, small enough to travel with the page's own captures. */
export const PAGE_IDEA_PREVIEW_WIDTH = 1024;

/** A deterministic, narrower copy of a page idea for review (box-averaged); an image already narrow enough is returned as is. */
export function pageIdeaPreview(bytes: Buffer, previewWidth = PAGE_IDEA_PREVIEW_WIDTH): Buffer {
  const source = PNG.sync.read(bytes);
  if (source.width <= previewWidth) return bytes;
  const scale = source.width / previewWidth, width = previewWidth, height = Math.max(1, Math.round(source.height / scale));
  const target = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = Math.floor(x * scale), x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale)), y0 = Math.floor(y * scale), y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    const sum = [0, 0, 0, 0];
    let count = 0;
    for (let sy = y0; sy < Math.min(y1, source.height); sy++) for (let sx = x0; sx < Math.min(x1, source.width); sx++) {
      const i = (sy * source.width + sx) * 4;
      for (let c = 0; c < 4; c++) sum[c]! += source.data[i + c]!;
      count++;
    }
    const o = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) target.data[o + c] = Math.round(sum[c]! / Math.max(1, count));
  }
  return PNG.sync.write(target);
}
