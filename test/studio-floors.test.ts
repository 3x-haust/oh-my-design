import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { observeStudioFloors, projectBrandMarks, readmeLogos, requestsThreeD, studioFloorFailures } from '../core/design/studio-floors.ts';

const MARK_PATH = 'M10 10h108v108H10z M32 32h64v64H32z M44 44h40v40H44z';
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill="#ff5a1f" d="${MARK_PATH}"/></svg>`;
const scene = (height: string) => `<canvas id="gl" style="display:block;width:100%;height:${height}"></canvas>
  <script>const c = document.querySelector('#gl'); c.width = 1280; c.height = 600; const gl = c.getContext('webgl');
  gl.clearColor(1, .4, .1, 1); gl.clear(gl.COLOR_BUFFER_BIT);</script>`;

test('a request asks for 3D in English or Korean; other numbers and words do not', () => {
  for (const request of ['3D로 보여줘', 'show it in 3d', 'a three.js hero', '입체적으로 보여줘', 'WebGL scene']) assert.equal(requestsThreeD(request), true, request);
  for (const request of ['랜딩 페이지 만들어줘', 'a 3DS game shop', 'version 13d release notes']) assert.equal(requestsThreeD(request), false, request);
});

test('the project ships its marks in a brand folder or as logo files; icons and dependencies are not marks', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-floor-marks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'source/brand'), { recursive: true });
  mkdirSync(join(root, 'icons'));
  mkdirSync(join(root, 'node_modules/pkg'), { recursive: true });
  writeFileSync(join(root, 'source/brand/mark.svg'), markSvg);
  writeFileSync(join(root, 'company-logo.png'), 'png bytes');
  writeFileSync(join(root, 'icons/checkmark.svg'), markSvg.replace('#ff5a1f', '#000'));
  writeFileSync(join(root, 'node_modules/pkg/logo.svg'), markSvg);
  const marks = projectBrandMarks(root);
  assert.deepEqual(marks.map(mark => mark.path).sort(), ['company-logo.png', join('source', 'brand', 'mark.svg')]);
  assert.deepEqual(marks.find(mark => mark.path.endsWith('mark.svg'))?.pathData, [MARK_PATH]);
});

test('the README names the logo: its header picture counts, a single-colour fallback or a README screenshot does not', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-floor-readme-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'acme/brand/readme'), { recursive: true });
  const header = markSvg.replace('#ff5a1f', 'url(#g)');
  writeFileSync(join(root, 'acme/package.json'), JSON.stringify({ name: '@team/acme-kit' }));
  writeFileSync(join(root, 'acme/brand/readme/header-light.svg'), header);
  writeFileSync(join(root, 'acme/brand/readme/header-light.png'), 'png of the header');
  writeFileSync(join(root, 'acme/brand/readme/header-dark.svg'), header.replace('viewBox', 'class="dark" viewBox'));
  writeFileSync(join(root, 'acme/brand/readme/result.png'), 'a screenshot of a result');
  writeFileSync(join(root, 'acme/brand/mark-black.svg'), markSvg.replace('#ff5a1f', '#000'));
  writeFileSync(join(root, 'acme/README.md'), `<p align="center"><picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/readme/header-dark.svg">
  <img alt="Acme Kit" src="brand/readme/header-light.svg" width="560"></picture></p>

# Acme Kit
<p align="center"><img src="brand/readme/result.png" alt="A page made with the kit"></p>
![badge](https://img.shields.io/badge/x-y)`);
  const logos = readmeLogos(root);
  assert.deepEqual(logos.map(logo => logo.path), ['header-dark.svg', 'header-light.png', 'header-light.svg'].map(file => join('acme', 'brand', 'readme', file)));
  const observed = (sources: string[], inlinePathData: string[] = []) =>
    ({ sources, inlinePathData, sceneShare: 0, firstScreenSceneShare: 0, servedFrom: 'http://127.0.0.1:1/' });
  const dataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const target = join(root, 'index.html');
  assert.deepEqual(studioFloorFailures(logos, false, target, observed([dataUri(markSvg.replace('#ff5a1f', '#000'))]), true).map(failure => failure.code), ['BRAND_MARK_NOT_SHOWN']);
  assert.match(studioFloorFailures(logos, false, target, observed([]), true)[0]?.message ?? '', /README shows its logo .*single-colour/);
  assert.deepEqual(studioFloorFailures(logos, false, target, observed([dataUri(header)]), true), []);
  assert.deepEqual(studioFloorFailures(logos, false, target, observed([], [MARK_PATH]), true), []);
});

test('a redrawn logo and a picture of a scene are refused; the shipped mark and a live scene pass', { timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-floor-page-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'brand'));
  writeFileSync(join(root, 'brand/mark.svg'), markSvg);
  const marks = projectBrandMarks(root);
  // The mark redrawn as an orange box, and the 3D shown as a flat image next to a small canvas ornament.
  writeFileSync(join(root, 'redrawn.html'), `<!doctype html><body style="margin:0"><header><span style="display:inline-block;width:24px;height:24px;background:#ff5a1f"></span> omd</header>
    <img src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="900" height="500" fill="#f60"/></svg>')}" width="900" height="500">
    <div style="width:200px">${scene('120px')}</div></body>`);
  const redrawn = await observeStudioFloors(join(root, 'redrawn.html'));
  assert.ok(redrawn.sceneShare > 0 && redrawn.sceneShare < 0.25, `small ornament: ${redrawn.sceneShare}`);
  assert.deepEqual(studioFloorFailures(marks, true, join(root, 'redrawn.html'), redrawn).map(failure => failure.code), ['BRAND_MARK_NOT_SHOWN', 'THREE_D_NOT_LIVE']);
  // The shipped file as an image, and a scene that only appears further down the page.
  writeFileSync(join(root, 'shipped.html'), `<!doctype html><body style="margin:0"><header><img src="brand/mark.svg" width="32" height="32" alt="omd"></header>
    <section style="height:1200px">Intro</section>${scene('600px')}</body>`);
  const shipped = await observeStudioFloors(join(root, 'shipped.html'));
  assert.equal(shipped.firstScreenSceneShare, 0);
  assert.ok(shipped.sceneShare >= 0.25, `live scene: ${shipped.sceneShare}`);
  assert.deepEqual(studioFloorFailures(marks, true, join(root, 'shipped.html'), shipped), []);
  // The exact SVG inlined counts as the shipped mark; a big 2D canvas is not a live scene.
  writeFileSync(join(root, 'inline.html'), `<!doctype html><body style="margin:0">${markSvg}<canvas id="flat" width="1280" height="700" style="width:100%;height:700px"></canvas>
    <script>document.querySelector('#flat').getContext('2d').fillRect(0, 0, 1280, 700);</script></body>`);
  const inline = await observeStudioFloors(join(root, 'inline.html'));
  assert.deepEqual(studioFloorFailures(marks, true, join(root, 'inline.html'), inline).map(failure => failure.code), ['THREE_D_NOT_LIVE']);
  // Without a 3D ask the scene is not owed.
  assert.deepEqual(studioFloorFailures(marks, false, join(root, 'inline.html'), inline), []);
});
