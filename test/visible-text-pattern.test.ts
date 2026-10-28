import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { visibleTextPattern } from '../adapters/trusted-browser-runner.ts';

test('assertion text matches a heading as a visitor reads it across a line break', async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<h2 id="broken">다음 요청부터,<br>디자인의 과정까지.</h2><p id="other">다른 문장 (1.0)</p>');
  const count = (selector: string, text: string) => page.locator(selector).filter({ hasText: visibleTextPattern(text) }).count();
  assert.equal(await count('#broken', '다음 요청부터, 디자인의 과정까지.'), 1);
  assert.equal(await count('#broken', '다음 요청부터,디자인의 과정까지.'), 1);
  assert.equal(await count('#other', '다른 문장 (1.0)'), 1);
  assert.equal(await count('#broken', '다음 요청까지, 디자인의 과정부터.'), 0);
  assert.equal(await count('#other', '다른 문장 (1x0)'), 0);
});
