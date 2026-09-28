import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url).pathname;

test('gallery candidate browser evaluation works through the production tsx loader', () => {
  const script = `
    import { chromium } from 'playwright';
    import { collectGalleryImageCandidates } from './core/ref/gallery-image-candidates.ts';
    import { browserCallback } from './core/ref/browser-evaluation.ts';
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<img id="sample" width="120" height="120" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22/%3E">');
      const candidates = await collectGalleryImageCandidates(page);
      if (candidates.length !== 1 || candidates[0].selector !== '#sample') throw new Error('gallery candidates were not observed');
      const count = await page.locator('img').evaluateAll(browserCallback(elements => elements.length));
      if (count !== 1) throw new Error('locator evaluateAll did not receive elements');
      const id = await page.locator('img').evaluate(browserCallback((image, prefix) => prefix + image.id), '#');
      if (id !== '#sample') throw new Error('locator evaluate did not receive element and argument');
      await page.addInitScript(browserCallback(() => { window.__browserEvaluationGuard = 'initialized'; }));
      await page.goto('about:blank');
      if (await page.evaluate('window.__browserEvaluationGuard') !== 'initialized') throw new Error('init script did not run');
    } finally { await browser.close(); }
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: root, timeout: 30000, stdio: 'pipe' }));
});

test('browser evaluation APIs never receive raw functions in core/ref or core/render', () => {
  for (const dir of ['core/ref', 'core/render']) {
    for (const name of readdirSync(join(root, dir)).filter(name => name.endsWith('.ts'))) {
      const file = join(root, dir, name);
      const source = readFileSync(file, 'utf8');
      const raw = /\.(?:evaluate|evaluateAll|addInitScript)\s*\(\s*(?:async\s+)?(?:\([^)]*\)\s*=>|[\w$]+\s*=>|function\b|pickHoverStyle\b)|\.\$\$eval\s*\([^,]*,\s*(?:async\s+)?(?:\([^)]*\)\s*=>|[\w$]+\s*=>|function\b)/g;
      const match = raw.exec(source);
      assert.equal(match, null, `${dir}/${name}: raw browser callback at line ${match ? source.slice(0, match.index).split('\n').length : ''}`);
      for (const call of source.matchAll(/\.(?:evaluate|evaluateAll|addInitScript)\s*\(\s*([a-zA-Z_$][\w$]*)\s*[,)]/g)) {
        assert.ok(['snapshotExpression', 'reducedMotionExpression', 'SWEEP'].includes(call[1]!), `${dir}/${name}: unwrapped browser callback ${call[1]}`);
      }
    }
  }
});
