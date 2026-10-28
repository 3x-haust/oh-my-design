import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { renderGraphic } from '../core/render/index.ts';
import { cameraAt, parseFootageSteps, PRODUCT_FOOTAGE_STEPS_SCHEMA } from '../core/render/product-footage.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function project(t: test.TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-render-graphic-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nodePath = realpathSync(process.execPath);
  const invocation = createTestNativePiInvocation({ root, host: {
    nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath: nodePath, cliSha256: hash(readFileSync(nodePath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'graphic-parent',
  } });
  writeFileSync(join(root, 'graphic.html'), `<!doctype html><html><body style="margin:0">
    <div id="art" style="margin:40px;width:120px;height:80px;border-radius:40px;background:linear-gradient(#5b74ff,#2f4bff)"></div>
  </body></html>`);
  const adapter = createTestProjectWriteAdapter(root, invocation);
  adapter.mkdir('out');
  return { root, adapter };
}

test('a coded graphic renders at 2x to one element with a transparent background', { timeout: 60_000 }, async t => {
  const { root, adapter } = project(t);
  await renderGraphic(join(root, 'graphic.html'), { viewport: { width: 400, height: 300 }, out: join(root, 'out/art.png'),
    selector: '#art', transparent: true, adapter });
  const png = PNG.sync.read(readFileSync(join(root, 'out/art.png')));
  assert.deepEqual([png.width, png.height], [240, 160]);
  // The rounded corner is outside the shape: fully transparent, not the page's white.
  assert.equal(png.data[3], 0);
  const centre = (80 * png.width + 120) * 4;
  assert.equal(png.data[centre + 3], 255);
});

test('a raster enlarged by the 2x capture is named, and a sharp one is not', { timeout: 60_000 }, async t => {
  const { root, adapter } = project(t);
  const png = (size: number) => { const image = new PNG({ width: size, height: size }); image.data.fill(200); return PNG.sync.write(image); };
  writeFileSync(join(root, 'small.png'), png(60));
  writeFileSync(join(root, 'large.png'), png(480));
  writeFileSync(join(root, 'raster.html'), `<!doctype html><body style="margin:0">
    <img src="small.png" style="width:200px;height:200px"><img src="large.png" style="width:200px;height:200px"></body>`);
  const warnings: string[] = [];
  await renderGraphic(join(root, 'raster.html'), { viewport: { width: 500, height: 300 }, out: join(root, 'out/raster.png'),
    adapter, warn: message => warnings.push(message) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /small\.png has 60x60 pixels but is drawn at 200x200 CSS px[\s\S]*6\.7x/);
});

test('the render records how much of the graphic one placed raster covers', { timeout: 60_000 }, async t => {
  const { root, adapter } = project(t);
  const image = new PNG({ width: 800, height: 600 }); image.data.fill(180);
  writeFileSync(join(root, 'shot.png'), PNG.sync.write(image));
  writeFileSync(join(root, 'framed.html'), `<!doctype html><body style="margin:0">
    <figure id="frame" style="margin:0;width:400px;height:300px;padding:10px;box-sizing:border-box;background:#eee">
    <img src="shot.png" style="width:380px;height:280px;display:block"></figure>
    <div id="coded" style="width:400px;height:300px;background:linear-gradient(#123,#456)">
    <img src="shot.png" style="width:80px;height:60px;display:block"></div></body>`);
  const warnings: string[] = [];
  const record = (out: string) => {
    const sha = hash(readFileSync(join(root, out)));
    return JSON.parse(readFileSync(join(root, `.omd/graphics/renders/${sha}.json`), 'utf8'));
  };
  await renderGraphic(join(root, 'framed.html'), { viewport: { width: 500, height: 700 }, out: join(root, 'out/framed.png'),
    selector: '#frame', adapter, warn: message => warnings.push(message) });
  assert.deepEqual(record('out/framed.png').largestRaster, { src: 'shot.png', share: 0.89 });
  assert.match(warnings.join('\n'), /shot\.png covers 89% of the graphic/);
  warnings.length = 0;
  await renderGraphic(join(root, 'framed.html'), { viewport: { width: 500, height: 700 }, out: join(root, 'out/coded.png'),
    selector: '#coded', adapter, warn: message => warnings.push(message) });
  assert.equal(record('out/coded.png').largestRaster.share, 0.04);
  assert.doesNotMatch(warnings.join('\n'), /covers/);
});

test('the render records how much of the graphic a WebGL canvas covers, and a 2D canvas does not count', { timeout: 60_000 }, async t => {
  const { root, adapter } = project(t);
  writeFileSync(join(root, 'scene.html'), `<!doctype html><body style="margin:0">
    <div id="lit" style="width:400px;height:300px"><canvas id="gl" width="400" height="300" style="display:block;width:400px;height:300px"></canvas></div>
    <div id="flat" style="width:400px;height:300px"><canvas id="c2" width="400" height="300" style="display:block;width:400px;height:300px"></canvas></div>
    <script>const gl = document.querySelector('#gl').getContext('webgl'); gl.clearColor(1, .4, .1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const c = document.querySelector('#c2').getContext('2d'); c.fillStyle = '#ccc'; c.fillRect(0, 0, 400, 300);</script></body>`);
  const share = async (selector: string, out: string) => {
    await renderGraphic(join(root, 'scene.html'), { viewport: { width: 500, height: 700 }, out: join(root, out), selector, adapter });
    return JSON.parse(readFileSync(join(root, `.omd/graphics/renders/${hash(readFileSync(join(root, out)))}.json`), 'utf8')).webglShare;
  };
  assert.equal(await share('#lit', 'out/lit.png'), 1);
  assert.equal(await share('#flat', 'out/flat.png'), 0);
});

test('a large raster the graphic page loads is recorded even when it only becomes a WebGL texture', { timeout: 60_000 }, async t => {
  const { root, adapter } = project(t);
  const big = new PNG({ width: 900, height: 700 });
  for (let i = 0; i < big.data.length; i++) big.data[i] = (i * 7919) % 251; // incompressible enough to stay large
  writeFileSync(join(root, 'screenshot.png'), PNG.sync.write(big));
  writeFileSync(join(root, 'textured.html'), `<!doctype html><body style="margin:0"><canvas id="gl" width="400" height="300"></canvas>
    <script>const image = new Image(); image.src = 'screenshot.png'; image.onload = () => { const gl = document.querySelector('#gl').getContext('webgl');
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); window.__ready = true; };</script></body>`);
  await renderGraphic(join(root, 'textured.html'), { viewport: { width: 400, height: 300 }, out: join(root, 'out/textured.png'), adapter });
  const record = JSON.parse(readFileSync(join(root, `.omd/graphics/renders/${hash(readFileSync(join(root, 'out/textured.png')))}.json`), 'utf8'));
  assert.deepEqual(record.loadedRasters, ['screenshot.png']);
  assert.equal(record.largestRaster, null, 'no <img> was placed');
});

test('a selector that matches nothing writes no image', { timeout: 60_000 }, async t => {
  const { root, adapter } = project(t);
  await assert.rejects(() => renderGraphic(join(root, 'graphic.html'), { viewport: { width: 400, height: 300 },
    out: join(root, 'out/missing.png'), selector: '#absent', adapter }), /selector matched nothing/);
  assert.equal(existsSync(join(root, 'out/missing.png')), false);
});

test('footage steps name the failing field and the camera eases between framings', () => {
  const steps = parseFootageSteps({ schema: PRODUCT_FOOTAGE_STEPS_SCHEMA, steps: [
    { do: 'click', target: '#save', focus: 2 }, { do: 'wait', ms: 500 },
  ] });
  assert.equal(steps.length, 2);
  assert.throws(() => parseFootageSteps({ schema: PRODUCT_FOOTAGE_STEPS_SCHEMA, steps: [{ do: 'click' }] }), /steps\[0\]\.target/);
  assert.throws(() => parseFootageSteps({ schema: PRODUCT_FOOTAGE_STEPS_SCHEMA, steps: [{ do: 'fly' }] }), /steps\[0\]\.do/);
  assert.throws(() => parseFootageSteps({ schema: PRODUCT_FOOTAGE_STEPS_SCHEMA, steps: [{ do: 'wait', zoom: 2 }] }), /steps\[0\]\.zoom/);
  const keys = [{ t: 0, zoom: 1, x: 0.5, y: 0.5 }, { t: 2, zoom: 2, x: 0.2, y: 0.3 }];
  assert.deepEqual(cameraAt(keys, 0.5), keys[0]);
  const mid = cameraAt(keys, 1.65);
  assert.ok(mid.zoom > 1 && mid.zoom < 2);
  assert.equal(cameraAt(keys, 3).zoom, 2);
});

test('a screen-shaped raster counts as a picture even when compressed small; square material textures do not', async () => {
  const { pictureRaster, rasterSize } = await import('../core/render/graphic-render-record.ts');
  const flat = (width: number, height: number) => { const png = new PNG({ width, height }); png.data.fill(200); return PNG.sync.write(png); };
  const screenshot = flat(1440, 920);
  assert.ok(screenshot.length < 120_000, 'compresses well under the byte limit');
  assert.deepEqual(rasterSize(screenshot), { width: 1440, height: 920 });
  assert.equal(pictureRaster(screenshot), true);
  assert.equal(pictureRaster(flat(390, 844)), true, 'a phone screen too');
  assert.equal(pictureRaster(flat(512, 512)), false, 'a matcap or noise texture is material');
  assert.equal(pictureRaster(flat(320, 200)), false, 'a small label texture is not a picture');
});
