import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  NO_JS_HIDDEN_BLOCK_FLOOR,
  checkNoJsContent,
  observeNoJsContent,
} from '../core/render/no-js.ts';

const fixture = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const viewport = { width: 900, height: 700 };

test('a reveal that starts at opacity 0 and needs JS is caught as content loss', async () => {
  const observation = await observeNoJsContent(fixture('nojs-gated.html'), { viewport });
  assert.ok(observation.hiddenBlocks >= NO_JS_HIDDEN_BLOCK_FLOOR, `expected gated blocks, got ${observation.hiddenBlocks}`);
  const finding = checkNoJsContent(observation);
  assert.equal(finding?.id, 'NOJS-CONTENT-LOSS');
  assert.match(finding!.message, /stay invisible without JavaScript/);
});

test('a CSS scroll-driven reveal that animates from the settled default survives without JS', async () => {
  const observation = await observeNoJsContent(fixture('nojs-safe.html'), { viewport });
  assert.equal(observation.hiddenBlocks, 0, 'no block may be gated behind JavaScript');
  assert.ok(observation.textRatio >= 0.99, `text must survive; ratio ${observation.textRatio}`);
  assert.equal(checkNoJsContent(observation), null);
});

test('checkNoJsContent reports each reason and passes a surviving page', () => {
  const lostText = checkNoJsContent({ withJsTextLength: 1000, withoutJsTextLength: 100, textRatio: 0.1, hiddenBlocks: 0 });
  assert.match(lostText!.message, /only 10% of the text renders without JavaScript/);
  const gated = checkNoJsContent({ withJsTextLength: 1000, withoutJsTextLength: 1000, textRatio: 1, hiddenBlocks: NO_JS_HIDDEN_BLOCK_FLOOR });
  assert.match(gated!.message, /sizable blocks stay invisible/);
  assert.equal(checkNoJsContent({ withJsTextLength: 1000, withoutJsTextLength: 1000, textRatio: 1, hiddenBlocks: 0 }), null);
  // A page with no text at all must not divide by zero into a false positive.
  assert.equal(checkNoJsContent({ withJsTextLength: 0, withoutJsTextLength: 0, textRatio: 1, hiddenBlocks: 0 }), null);
});

test('the installed scroll-reveal recipe does not gate content behind JavaScript', async () => {
  // The recipe ships a CSS scroll-driven path with an IntersectionObserver only as a @supports
  // fallback, so on a browser with scroll-driven support the content is never JS-gated.
  const { installRecipe } = await import('../core/recipe/store.ts');
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const pack = fileURLToPath(new URL('../core/', import.meta.url));
  const out = mkdtempSync(join(tmpdir(), 'omd-nojs-'));
  installRecipe(pack, 'scroll-reveal', { stack: 'vanilla', outDir: out });
  const css = readFileSync(join(out, 'scroll-reveal.css'), 'utf8');
  const js = readFileSync(join(out, 'scroll-reveal.js'), 'utf8');
  const page = join(out, 'index.html');
  writeFileSync(page, `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    :root { --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1); }
    body { margin: 0; background: #0b0b0d; color: #eee; font-family: sans-serif; }
    section { margin: 40px; padding: 60px 40px; background: #1a1a22; font-size: 22px; line-height: 1.5; }
${css}
  </style></head><body>
    <section class="reveal">Product overview paragraph that a reader needs to understand what this page sells.</section>
    <section class="reveal">Second block of substantive copy describing how the mechanism works end to end.</section>
    <section class="reveal">Third block covering pricing, guarantees, and why the reader should act now.</section>
    <section class="reveal">Fourth block with the closing argument and the specific next step requested.</section>
    <script>${js}</script>
  </body></html>`);
  const observation = await observeNoJsContent(page, { viewport });
  assert.equal(checkNoJsContent(observation), null, `installed recipe must not gate content: ${JSON.stringify(observation)}`);
});
