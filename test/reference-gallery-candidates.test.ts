import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withBrowser } from '../core/render/index.ts';
import { collectGalleryImageCandidates } from '../core/ref/gallery-image-candidates.ts';

const image = (name: string, width: number, hidden = false) => `<img alt="${name}" ${hidden ? 'style="display:none"' : ''} width="${width}" height="200" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200'%3E%3C/svg%3E">`;

test('gallery candidates have unique CSS selectors ordered by rendered area; hidden and ambiguous images are excluded', async () => {
  await withBrowser(async browser => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<div>${image('first', 150)}${image('second', 250)}<div style="opacity:0">${image('hidden', 300, true)}</div>${image('small', 50)}</div>`);
      await page.locator('img[alt="second"]').evaluate((img: HTMLImageElement) => img.decode());
      const candidates = await collectGalleryImageCandidates(page);
      assert.deepEqual(candidates.map(candidate => candidate.width), [250, 150]);
      for (const candidate of candidates) {
        assert.equal(await page.locator(candidate.selector).count(), 1);
        assert.ok(candidate.naturalWidth >= 100 && candidate.naturalHeight >= 100);
      }
      assert.equal((await collectGalleryImageCandidates(page, 1)).length, 1);
      await page.locator('img[alt="second"]').evaluate(img => { img.parentElement!.style.display = 'none'; });
      assert.equal((await collectGalleryImageCandidates(page)).length, 0);
    } finally { await page.close(); }
  });
});
