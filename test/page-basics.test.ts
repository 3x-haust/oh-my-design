import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { observePageBasics, pageBasicsTells } from '../core/design/page-basics.ts';

const page = (headerStyle: string, targetStyle = '') => `<!doctype html><html><body style="margin:0;font:16px sans-serif">
  <header style="${headerStyle};top:0;left:0;right:0;height:64px;background:#fff;display:flex;gap:16px;align-items:center;padding:0 24px">
    <strong>Brand</strong><a href="#start">Start</a></header>
  <main><section style="height:2200px">Hero</section><h2 id="start" style="${targetStyle}">Start here</h2><section style="height:1600px">More</section></main>
</body></html>`;

test('a long page whose header scrolls away, and a fixed header that covers its link target, are both leads', { timeout: 90_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-page-basics-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'flow.html'), page('position:relative'));
  writeFileSync(join(root, 'covered.html'), page('position:fixed'));
  writeFileSync(join(root, 'kept.html'), page('position:sticky', 'scroll-margin-top:80px'));
  const flow = await observePageBasics(join(root, 'flow.html'), 'a'.repeat(64));
  assert.deepEqual(flow.header, { found: true, staysInView: false });
  const rules = (basics: Awaited<ReturnType<typeof observePageBasics>>) => pageBasicsTells(basics).map(tell => tell.rule).filter(rule => rule !== 'PAGE-HEAD-METADATA');
  assert.deepEqual(rules(flow), ['PAGE-HEADER-SCROLLS-AWAY']);
  const covered = await observePageBasics(join(root, 'covered.html'), 'b'.repeat(64));
  assert.equal(covered.header.staysInView, true);
  assert.deepEqual(rules(covered), ['PAGE-ANCHOR-UNDER-HEADER']);
  const kept = await observePageBasics(join(root, 'kept.html'), 'c'.repeat(64));
  assert.deepEqual(pageBasicsTells(kept).map(tell => tell.rule), ['PAGE-HEAD-METADATA'], 'only the bare head remains');
  assert.ok(kept.missingHead.includes('<title>') && kept.missingHead.includes('<html lang>'));
});

test('a page with its head metadata and real links carries no shipping lead; dead links are named', { timeout: 60_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-page-shipping-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const head = '<head><title>OMD</title><meta name="description" content="Design harness"><meta name="viewport" content="width=device-width">'
    + '<link rel="icon" href="/favicon.svg"><meta property="og:image" content="/og.png"></head>';
  writeFileSync(join(root, 'complete.html'), `<!doctype html><html lang="ko">${head}<body><a href="#a">A</a><h2 id="a">A</h2></body></html>`);
  writeFileSync(join(root, 'dead.html'), `<!doctype html><html lang="ko">${head}<body><a href="#">Docs</a><a href="#missing">Install</a><a>Blog</a></body></html>`);
  assert.deepEqual(pageBasicsTells(await observePageBasics(join(root, 'complete.html'), 'd'.repeat(64))), []);
  const dead = await observePageBasics(join(root, 'dead.html'), 'e'.repeat(64));
  assert.deepEqual(dead.deadLinks, ['Docs', 'Install (#missing)', 'Blog']);
  assert.deepEqual(pageBasicsTells(dead).map(tell => tell.rule), ['PAGE-DEAD-LINKS']);
});

test('a large placed image is a lead unless it is a graphic rendered from code', { timeout: 60_000 }, async t => {
  const { mkdirSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { PNG } = await import('pngjs');
  const root = mkdtempSync(join(tmpdir(), 'omd-page-raster-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const png = (shade: number) => { const image = new PNG({ width: 80, height: 60 }); image.data.fill(shade); return PNG.sync.write(image); };
  const shot = png(120), art = png(200);
  writeFileSync(join(root, 'shot.png'), shot);
  writeFileSync(join(root, 'art.png'), art);
  mkdirSync(join(root, '.omd/graphics/renders'), { recursive: true });
  const sha = createHash('sha256').update(art).digest('hex');
  writeFileSync(join(root, `.omd/graphics/renders/${sha}.json`), JSON.stringify({ schema: 'graphic-render-v1', path: 'art.png', sha256: sha, largestRaster: null, webglShare: 1 }));
  writeFileSync(join(root, 'page.html'), '<!doctype html><body style="margin:0"><img src="shot.png" style="width:700px;height:500px;display:block">'
    + '<img src="art.png" style="width:700px;height:500px;display:block"></body>');
  const basics = await observePageBasics(join(root, 'page.html'), 'f'.repeat(64), root);
  assert.deepEqual(basics.placedRasters, ['shot.png']);
  assert.ok(pageBasicsTells(basics).some(tell => tell.rule === 'PAGE-PLACED-RASTER' && /shot\.png/.test(tell.message)));
  // When the brief's hero proof is real output, the lead asks for that output shown whole and readable, not a code graphic.
  const asProof = pageBasicsTells(basics, true).find(tell => tell.rule === 'PAGE-PLACED-RASTER');
  assert.match(asProof?.message ?? '', /real output[\s\S]*large enough that its words read/);
  assert.doesNotMatch(asProof?.message ?? '', /is a thumbnail, not a graphic/);
});
