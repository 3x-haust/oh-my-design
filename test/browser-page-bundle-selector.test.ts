import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('page bundle encodes browser selectors and snapshot strings', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const bundle = await readFile(resolve(import.meta.dirname, '../vendor/omd-browser/page-bundle.js'), 'utf8');
    await page.addScriptTag({ content: bundle });
    const result = await page.evaluate(() => {
      const id = 'control"\\\n\t\u0001';
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = 'Escaped control label';
      const input = document.createElement('input');
      input.id = id;
      const placeholder = 'quote" slash\\ line\n tab\t cr\r form\f low\u0001';
      input.placeholder = placeholder;
      document.body.append(label, input);
      const snapshot = (globalThis as typeof globalThis & {
        __omdBrowser: { takeSnapshot(options?: object): { tree: string } };
      }).__omdBrowser.takeSnapshot();
      return { tree: snapshot.tree, encodedPlaceholder: JSON.stringify(placeholder).slice(1, -1) };
    });
    assert.match(result.tree, /textbox "Escaped control label"/);
    assert.ok(result.tree.includes(`[placeholder="${result.encodedPlaceholder}"]`), result.tree);
  } finally {
    await browser.close();
  }
});
