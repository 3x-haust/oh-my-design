import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installRecipe } from '../core/recipe/store.ts';
import { captureReferenceCraft } from '../core/ref/reference-craft-capture.ts';
import { checkCraftUsage } from '../core/ref/craft-usage.ts';

const PACK = fileURLToPath(new URL('../core/', import.meta.url));

/**
 * The whole point of materializing: installed code must arrive as real scroll-linked motion, not a
 * static approximation. `scroll-reveal` installs as a scroll-SCRUBBED animation
 * (`animation-timeline: view()`), which `scroll-scene-evidence-v1` requires to be time-stable at a
 * fixed position — so its proof is scroll-linkage, not time-energy. This measures the installed
 * files with the same real-browser capture `omd craft-usage` gates on: a page whose motion was
 * reimplemented from prose reads static here, an install must not.
 */
test('an installed scroll-reveal recipe reads as real scroll-linked motion in a browser', async () => {
  const out = mkdtempSync(join(tmpdir(), 'omd-installed-'));
  const result = installRecipe(PACK, 'scroll-reveal', { stack: 'vanilla', outDir: out });
  const css = readFileSync(join(out, 'scroll-reveal.css'), 'utf8');
  const js = readFileSync(join(out, 'scroll-reveal.js'), 'utf8');
  assert.ok(result.written.length >= 2, 'css and js must both land');

  // A page that uses ONLY the installed assets — nothing about the motion is authored here.
  const page = join(out, 'index.html');
  writeFileSync(page, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  :root { --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1); }
  body { margin: 0; background: #0b0b0d; color: #eee; font-family: sans-serif; }
  #hero { height: 100vh; display: flex; align-items: center; justify-content: center; font-size: 40px; }
  .spacer { height: 70vh; }
  #part { margin: 0 40px; padding: 90px 40px; background: #1a1a22; border-radius: 16px; font-size: 34px; }
${css}
</style></head>
<body>
  <div id="hero">top of the page</div>
  <div class="spacer"></div>
  <section id="part" class="reveal">A section revealed by the installed recipe, not by hand-written motion.</section>
  <div class="spacer"></div>
  <script>${js}</script>
</body></html>
`);

  const craft = await captureReferenceCraft(page, {
    source: 'installed:scroll-reveal',
    as: 'installed-reveal',
    technique: 'scroll reveal (materialized)',
    selector: '#part',
    viewport: { width: 800, height: 600 },
  });

  assert.equal(craft.motion.scrollLinked, true, 'installed scroll-reveal must read as scroll-linked motion');
  assert.equal(craft.motion.reducedMotionSafe, true, 'installed recipe must keep its reduced-motion baseline');

  // And the gate the loop actually runs must accept it: a persuasion surface that captured scroll
  // craft and installed it is no longer under-reaching.
  const finding = checkCraftUsage({ surface: 'marketing', capturedScrollCraft: true, builtScrollLinked: craft.motion.scrollLinked });
  assert.equal(finding, null, 'omd craft-usage must pass a page built from the installed recipe');
});
