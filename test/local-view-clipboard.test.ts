import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { withLocalView } from '../core/render/stateful.ts';

test('a clicked copy button can write the clipboard in the local view, as in a visitor\'s browser', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-local-clipboard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), `<!doctype html><button id="copy" onclick="navigator.clipboard.writeText('npx x').then(() => { document.body.dataset.copied = 'yes'; }, e => { document.body.dataset.copied = e.name; })">복사</button>`);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const copied = await withLocalView(browser, root, { page: 'dist/index.html', viewport: { width: 390, height: 844 } }, async page => {
    await page.click('#copy');
    await page.waitForFunction(() => document.body.dataset.copied !== undefined);
    return page.evaluate(() => document.body.dataset.copied);
  });
  assert.equal(copied, 'yes');
});
