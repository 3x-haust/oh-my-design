import { chromium } from 'playwright';
import { canonicalJson } from './json.ts';
import { validateReferencePng } from '../board-security.ts';
import { referenceServiceFamily } from '../design-discovery-sources.ts';
import { compareBrowseVectors } from './budget.ts';
import { asset } from './observation.ts';
import { browseFail, type BrowseKeep, type PublishedAsset } from './contract.ts';

export async function renderBrowseContactSheet(sessionId: string, tray: readonly BrowseKeep[],
  images: ReadonlyMap<string, Buffer>, options: { page: number; columns: 2 | 3 | 4 }): Promise<PublishedAsset[]> {
  const keeps = tray.slice((options.page - 1) * 12, options.page * 12);
  if (!keeps.length) browseFail('BROWSE_EMPTY_SHEET', 'no keeps on this tray page');
  const width = options.columns * 360, height = Math.ceil(keeps.length / options.columns) * 320;
  const cells = keeps.map((keep, index) => {
    const bytes = images.get(keep.image.sha256) ?? browseFail('BROWSE_ASSET_MISSING', 'tray asset missing', 2); validateReferencePng(bytes);
    return { keepId: keep.id, image: keep.image, sourceFamily: referenceServiceFamily(keep.source), reason: keep.reason,
      rights: keep.rights, role: keep.role, direction: keep.direction, visibility: keep.visibility,
      box: { x: (index % options.columns) * 360, y: Math.floor(index / options.columns) * 320, width: 360, height: 320 },
      data: `data:image/png;base64,${bytes.toString('base64')}` };
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0;background:white;color:#111;font:14px sans-serif"></body></html>');
    await page.evaluate(async cells => {
      await Promise.all(cells.map(async cell => {
        const article = document.createElement('article');
        article.style.cssText = `position:absolute;left:${cell.box.x}px;top:${cell.box.y}px;width:336px;height:296px;padding:12px;overflow:hidden`;
        const img = document.createElement('img'); img.src = cell.data; img.style.cssText = 'display:block;width:336px;height:220px;object-fit:contain;background:#eee';
        const label = document.createElement('div'); label.textContent = `${cell.keepId.slice(0, 8)} | ${cell.sourceFamily} | ${cell.rights}\n${cell.reason}`;
        label.style.cssText = 'white-space:pre-wrap;overflow:hidden;max-height:70px;line-height:18px';
        article.append(img, label); document.body.append(article); await img.decode();
      }));
      await document.fonts.ready;
    }, cells);
    const png = asset(sessionId, 'sheets', await page.screenshot(), 'png');
    const metadata = { schema: 'reference-browse-contact-sheet-v1', image: png.receipt, page: options.page, columns: options.columns,
      visibility: keeps.some(keep => keep.visibility === 'user-session') ? 'user-session' : 'public',
      cells: cells.map(({ data: _data, ...cell }) => cell),
      comparisons: keeps.flatMap((left, index) => keeps.slice(index + 1).map(right => ({ left: left.id, right: right.id,
        duplicatePixels: left.image.sha256 === right.image.sha256, ...compareBrowseVectors(left.vector, right.vector) }))) };
    return [png, asset(sessionId, 'sheets', Buffer.from(`${canonicalJson(metadata)}\n`), 'json')];
  } finally { await browser.close(); }
}
