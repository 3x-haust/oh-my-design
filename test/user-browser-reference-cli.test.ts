import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import test from 'node:test';
import { writeUserBrowserConsent } from '../core/ref/browser-consent.ts';
import { loadRefs } from '../core/ref/store.ts';

const CLI = new URL('../bin/omd.ts', import.meta.url).pathname;
const FIXTURE = new URL('./fixtures/user-browser-reference-driver.mjs', import.meta.url).pathname;
function runCli(root: string, driver: string, preparation: string, selector?: string) {
  return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'ref', 'add', 'https://example.com/', '--as', 'work',
      '--lane', 'design', '--from-user', '--viewport', '1280x900', '--no-energy', '--preparation', preparation,
      ...(selector ? ['--selector', selector] : [])], {
      cwd: root, env: { ...process.env, HOME: root, OMD_REFERENCE_BROWSER_ENGINE: 'user-browser',
        OMD_BROWSER_DRIVER_PATH: driver, OMD_TEST_BROWSER_EXECUTABLE: chromium.executablePath() },
    });
    let stderr = '';
    child.stdout.resume(); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('close', code => resolve({ code, stderr }));
  });
}
test('single CLI design capture retains observed preparation and exact viewport pixels', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-user-reference-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const driver = join(root, 'driver'); mkdirSync(driver);
  const index = `export * from ${JSON.stringify(pathToFileURL(FIXTURE).href)};\n`;
  const pageBundle = 'export {};\n';
  writeFileSync(join(driver, 'index.js'), index); writeFileSync(join(driver, 'page-bundle.js'), pageBundle);
  writeFileSync(join(driver, 'manifest.json'), JSON.stringify({ schema: 1, component: 'omd-browser',
    files: { 'index.js': createHash('sha256').update(index).digest('hex'),
      'page-bundle.js': createHash('sha256').update(pageBundle).digest('hex') } }));
  writeUserBrowserConsent('consented', root);
  const input = join(root, 'preparation.json');
  writeFileSync(input, JSON.stringify({ schema: 'reference-capture-preparation-v1', actions: [],
    assertions: [{ selector: '#work', state: 'visible' }] }));
  const result = await runCli(root, driver, input);
  assert.equal(result.code, 0, result.stderr);
  const reference = loadRefs(root)[0];
  assert.ok(reference);
  assert.deepEqual(reference.capturePreparation?.observations, [{ selector: '#work', state: 'visible', passed: true }]);
  assert.equal(reference.acquisition?.captureMethod, 'viewport');
  assert.ok(reference.imagePath);
  const image = readFileSync(join(root, reference.imagePath));
  assert.equal(image.readUInt32BE(16), 2560);
  assert.equal(image.readUInt32BE(20), 1800);
  writeFileSync(input, JSON.stringify({ schema: 'reference-capture-preparation-v1',
    actions: [{ kind: 'click', selector: '#work' }], assertions: [{ selector: '#work', state: 'visible' }] }));
  const refused = await runCli(root, driver, input);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /USER_BROWSER_PREPARATION_ACTION_UNSUPPORTED/);
  assert.equal(loadRefs(root).length, 1);
  assert.deepEqual(readFileSync(join(root, reference.imagePath)), image);
});

test('single CLI ordinary img capture publishes the complete source image and provenance', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-user-original-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = PNG.sync.write(new PNG({ width: 1280, height: 960 }));
  const source = 'https://example.com/original.png';
  const driver = join(root, 'driver'); mkdirSync(driver);
  const fixture = readFileSync(FIXTURE, 'utf8');
  const index = fixture
    .replace("import { chromium } from 'playwright';",
      `import { chromium } from ${JSON.stringify(import.meta.resolve('playwright'))};`)
    .replace("  await page.route('https://example.com/', route =>",
      `  await page.route(${JSON.stringify(source)}, route => route.fulfill({
    contentType: 'image/png', body: Buffer.from(${JSON.stringify(original.toString('base64'))}, 'base64') }));
  await page.route('https://example.com/', route =>`)
    .replace('<section id="work">',
      `<img id="screen" src="${source}" style="width:160px;height:120px"><section id="work">`);
  assert.notEqual(index, fixture);
  writeFileSync(join(driver, 'index.js'), index);
  const pageBundle = 'export {};\n'; writeFileSync(join(driver, 'page-bundle.js'), pageBundle);
  writeFileSync(join(driver, 'manifest.json'), JSON.stringify({ schema: 1, component: 'omd-browser',
    files: { 'index.js': createHash('sha256').update(index).digest('hex'),
      'page-bundle.js': createHash('sha256').update(pageBundle).digest('hex') } }));
  writeUserBrowserConsent('consented', root);
  const input = join(root, 'preparation.json');
  writeFileSync(input, JSON.stringify({ schema: 'reference-capture-preparation-v1', actions: [],
    assertions: [{ selector: '#work', state: 'visible' }] }));
  const result = await runCli(root, driver, input, '#screen');
  assert.equal(result.code, 0, result.stderr);
  const reference = loadRefs(root)[0];
  assert.ok(reference?.imagePath);
  assert.equal(reference.kind, 'image');
  assert.equal(reference.acquisition?.sourceImage, source);
  assert.equal(reference.acquisition?.sourceImageSha256, createHash('sha256').update(original).digest('hex'));
  assert.deepEqual(reference.acquisition?.imageDimensions, { width: 1280, height: 960 });
  assert.equal(createHash('sha256').update(readFileSync(join(root, reference.imagePath))).digest('hex'),
    createHash('sha256').update(original).digest('hex'));
});
