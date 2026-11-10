import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { resolveRenderTarget } from '../render/serve.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import {
  currentBoardImage, readBoardInput, sheetSlug, STUDIO_BOARD_IMAGE, STUDIO_BOARD_INPUT, STUDIO_BOARD_RECORD, STUDIO_SHEETS_DIR,
  type BoardItem, type BoardRecord, type SheetRecord,
} from './studio-stages.ts';

/**
 * The designer's canvas, as images the agent looks at: the reference board (every kept image grouped by the screen or element
 * it serves, its one job written under it) and comparison sheets (candidates set side by side, labelled, beside the board), so
 * a choice is made between things seen together rather than remembered one at a time.
 */
const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const MIME: Readonly<Record<string, string>> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const dataUri = (bytes: Buffer, ext: string): string => `data:${MIME[ext.toLowerCase()] ?? 'image/png'};base64,${bytes.toString('base64')}`;
const escape = (value: string): string => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
const host = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

const SHEET_STYLE = 'body{margin:0;background:#1d1d1f;color:#f2f2f2;font:15px/1.4 -apple-system,"Helvetica Neue",Arial,sans-serif}'
  + 'main{padding:32px;display:flex;flex-direction:column;gap:32px}h2{margin:0 0 12px;font-size:20px;font-weight:600}'
  + '.row{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}figure{margin:0;background:#2a2a2d;border-radius:8px;padding:12px}'
  + 'figure img{display:block;object-fit:contain;background:#fff}figcaption{margin-top:8px;max-width:100%}figcaption b{font-size:22px;margin-right:8px}'
  + 'figcaption small{display:block;color:#a1a1a6}';

/** Render a self-contained page (images inlined, network refused) and keep its whole height. */
async function shootHtml(html: string, width: number): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => undefined))); });
    return await page.screenshot({ fullPage: true });
  } finally { await browser.close(); }
}

export type ComposedBoard = Readonly<{ image: string; items: readonly BoardItem[]; groups: Readonly<Record<string, readonly string[]>> }>;

/** Compose the authored board into one sheet grouped by what each image is for, and record what it was composed from. */
export async function composeBoard(root: string, writer: ProjectWriteAdapter): Promise<ComposedBoard> {
  const items = readBoardInput(root);
  if (items === null) throw Object.assign(new Error(`STUDIO_BOARD_MISSING: write ${STUDIO_BOARD_INPUT} first`), { code: 'STUDIO_BOARD_MISSING' });
  const groups = new Map<string, BoardItem[]>();
  for (const item of items) groups.set(item.for, [...groups.get(item.for) ?? [], item]);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${SHEET_STYLE}figure img{width:340px;height:340px}figure{width:340px}</style></head><body><main>`
    + [...groups.entries()].map(([forWhat, group]) => `<section><h2>${escape(forWhat)}</h2><div class="row">${group.map(item => {
      const bytes = readFileSync(join(root, item.image));
      return `<figure><img src="${dataUri(bytes, extname(item.image))}"><figcaption>${escape(item.job)}<small>${escape(item.source ? host(item.source) : item.image)}</small></figcaption></figure>`;
    }).join('')}</div></section>`).join('') + '</main></body></html>';
  // As wide as the largest group needs (each figure 340px plus padding and gap), at most four across.
  const across = Math.min(4, Math.max(...[...groups.values()].map(group => group.length)));
  const png = await shootHtml(html, Math.max(800, across * 384 + 64));
  writer.mkdir('.omd/studio');
  writer.write(STUDIO_BOARD_IMAGE, png);
  const record: BoardRecord = { schema: 'studio-board-v1', input: sha256(readFileSync(join(root, STUDIO_BOARD_INPUT))), image: { path: STUDIO_BOARD_IMAGE, sha256: sha256(png) },
    items: items.map(item => ({ ...item, sha256: sha256(readFileSync(join(root, item.image))) })) };
  writer.write(STUDIO_BOARD_RECORD, `${JSON.stringify(record, null, 2)}\n`);
  return { image: STUDIO_BOARD_IMAGE, items, groups: Object.fromEntries([...groups.entries()].map(([key, group]) => [key, group.map(item => item.job)])) };
}

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const isPage = (member: string): boolean => /^https?:\/\//i.test(member) || /\.html?$/i.test(member);

/** A built screen as the visitor meets it: its first screens at the viewport, at most three screens tall. */
async function shootPage(target: string, viewport: 'desktop' | 'mobile'): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const resolved = await resolveRenderTarget(target);
  const browser = await chromium.launch({ headless: true });
  try {
    const size = VIEWPORTS[viewport];
    const page = await browser.newPage({ viewport: size });
    await page.goto(resolved.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), size.height * 3);
    return await page.screenshot({ clip: { x: 0, y: 0, width: size.width, height }, fullPage: true });
  } finally {
    await browser.close();
    await resolved.close();
  }
}

/**
 * Set candidates side by side, labelled A, B, C..., with the reference board beside them. Members are generated images or other
 * project images (concept boards, asset candidates) or built screens (URLs or HTML files, shot at the viewport).
 */
export async function composeSheet(root: string, writer: ProjectWriteAdapter, name: string, members: readonly string[],
  viewport: 'desktop' | 'mobile' = 'desktop'): Promise<SheetRecord> {
  const slug = sheetSlug(name);
  if (slug === '') throw new Error('STUDIO_SHEET: --name needs letters or digits');
  if (members.length < 2) throw new Error('STUDIO_SHEET: a comparison sets at least two candidates side by side');
  if (new Set(members).size !== members.length) throw new Error('STUDIO_SHEET: a candidate is listed twice');
  const shots: { label: string; source: string; bytes: Buffer; ext: string }[] = [];
  for (const [index, member] of members.entries()) {
    const label = String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26)) : '');
    if (isPage(member)) {
      const target = /^https?:\/\//i.test(member) ? member : join(root, member);
      if (target !== member && !existsSync(target)) throw new Error(`STUDIO_SHEET: ${member} does not exist`);
      shots.push({ label, source: member, bytes: await shootPage(target, viewport), ext: '.png' });
      continue;
    }
    if (!MIME[extname(member).toLowerCase()]) throw new Error(`STUDIO_SHEET: ${member} is neither an image (PNG, JPEG, WebP) nor a page (URL or HTML file)`);
    if (!existsSync(join(root, member))) throw new Error(`STUDIO_SHEET: ${member} does not exist`);
    shots.push({ label, source: member, bytes: readFileSync(join(root, member)), ext: extname(member) });
  }
  const board = currentBoardImage(root);
  const width = viewport === 'mobile' ? 300 : 560;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${SHEET_STYLE}.member img{width:${width}px;max-height:${viewport === 'mobile' ? 1000 : 760}px}`
    + '.member{width:' + width + 'px}.board img{width:760px}.board{width:760px}</style></head><body><main><div class="row">'
    + shots.map(shot => `<figure class="member"><img src="${dataUri(shot.bytes, shot.ext)}"><figcaption><b>${shot.label}</b>${escape(shot.source.split('/').pop() ?? shot.source)}</figcaption></figure>`).join('')
    + (board === null ? '' : `<figure class="board"><img src="${dataUri(readFileSync(join(root, board)), '.png')}"><figcaption>the reference board</figcaption></figure>`)
    + '</div></main></body></html>';
  // Each figure is its image plus 24px of padding and a 20px gap; the board sits on the same row when it fits.
  const png = await shootHtml(html, Math.max(1200, Math.min(4800, shots.length * (width + 44) + (board === null ? 0 : 804) + 64)));
  writer.mkdir(STUDIO_SHEETS_DIR);
  const image = `${STUDIO_SHEETS_DIR}/${slug}.png`;
  writer.write(image, png);
  const record: SheetRecord = { schema: 'studio-sheet-v1', name: slug, members: shots.map(shot => ({ label: shot.label, source: shot.source, sha256: sha256(shot.bytes) })),
    board: board === null ? null : sha256(readFileSync(join(root, board))), image: { path: image, sha256: sha256(png) } };
  writer.write(`${STUDIO_SHEETS_DIR}/${slug}.json`, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
