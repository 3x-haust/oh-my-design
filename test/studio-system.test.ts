import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { composeGuidance } from '../core/design/compose-guidance.ts';
import {
  observeSystemDrift, readStudioSystem, requireStudioSystem, studioPageSource, studioPending, studioStudies, studyStudioReferences,
  systemDriftFailures,
} from '../core/design/studio.ts';
import type { ProjectWriteAdapter } from '../core/runtime/project-write.ts';

type Route = Parameters<typeof composeGuidance>[0];
const route = (taskNeed: string, request = 'Build a landing page for this project.') =>
  ({ request, projectMode: 'existing', sourceContract: { referenceDiscovery: { taskNeed } } }) as unknown as Route;
const plainWriter = (root: string): ProjectWriteAdapter => ({
  projectRoot: root,
  mkdir: path => { mkdirSync(join(root, path), { recursive: true }); return join(root, path); },
  write: (path, content) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); return join(root, path); },
  writeContentAddressed: (path, content) => { writeFileSync(join(root, path), content); return join(root, path); },
  remove: path => path, removeEmptyDirectory: path => path,
});
const project = (t: { after: (fn: () => void) => void }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-studio-system-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const study = (root: string, url: string, name: string) => {
  const dir = join(root, '.omd/studio/refs', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'study.json'), JSON.stringify({ requested: url }));
  writeFileSync(join(dir, 'first-screen.png'), PNG.sync.write(new PNG({ width: 2, height: 2 })));
  writeFileSync(join(dir, 'full.png'), PNG.sync.write(new PNG({ width: 2, height: 2 })));
};
const notes = 'Primary reference Quiet Tools, measured: 72/48/24/18/14 px, weights 400 and 600, 1200 container, 160px section rhythm. '
  .repeat(5);

test('a new page waits for a study, then a system taken from a studied site with notes and the logo; other routes never wait', t => {
  const root = project(t);
  const landing = route('new-marketing');
  assert.equal(studioPending(root, route('existing-feature')), null);
  assert.equal(studioPending(root, landing), 'study');
  assert.throws(() => requireStudioSystem(root, landing), /STUDIO_STUDY_MISSING: .*omd studio refs <url> <url> --json/);
  study(root, 'https://quiet.tools/', 'quiet-tools');
  assert.equal(studioStudies(root)[0]?.url, 'https://quiet.tools/');
  assert.throws(() => requireStudioSystem(root, landing), /STUDIO_SYSTEM_MISSING: no system is written yet/);
  // A system needs a few sizes and at most three weights.
  writeFileSync(join(root, '.omd/studio/system.json'), JSON.stringify({ reference: 'https://quiet.tools', sizes: [72, 48, 24, 18], weights: [300, 400, 500, 700] }));
  assert.throws(() => readStudioSystem(root), /STUDIO_SYSTEM_INVALID: .*one to 3 weights/);
  writeFileSync(join(root, '.omd/studio/system.json'), JSON.stringify({ reference: 'https://quiet.tools', sizes: [72, 48], weights: [400] }));
  assert.throws(() => readStudioSystem(root), /STUDIO_SYSTEM_INVALID: .*4 to 9 distinct sizes/);
  // The reference must be a site that was studied.
  writeFileSync(join(root, '.omd/studio/system.json'), JSON.stringify({ reference: 'https://elsewhere.dev', sizes: [72, 48, 24, 18, 14], weights: [400, 600] }));
  assert.throws(() => requireStudioSystem(root, landing), /its reference https:\/\/elsewhere\.dev was not studied/);
  writeFileSync(join(root, '.omd/studio/system.json'), JSON.stringify({ reference: 'https://quiet.tools', sizes: [72, 48, 24, 18, 14], weights: [400, 600] }));
  assert.throws(() => requireStudioSystem(root, landing), /system\.md is missing or too thin/);
  writeFileSync(join(root, '.omd/studio/system.md'), notes);
  assert.equal(studioPending(root, landing), null);
  // A README that links its logo from the web holds the page until the logo is saved, or the project says it has none.
  writeFileSync(join(root, 'README.md'), '<p align="center"><img width="536" src="https://user-images.example.com/174470852.png"></p>\n# Tool\n');
  assert.throws(() => requireStudioSystem(root, landing), /README links its logo from the web: save .*\.omd\/studio\/logo\.png/);
  writeFileSync(join(root, '.omd/studio/logo.png'), PNG.sync.write(new PNG({ width: 4, height: 4 })));
  requireStudioSystem(root, landing);
  rmSync(join(root, '.omd/studio/logo.png'));
  writeFileSync(join(root, '.omd/studio/no-logo'), '');
  requireStudioSystem(root, landing);
});

test('page source is any index.html or src file outside the design record, including a site in its own folder', () => {
  assert.equal(studioPageSource('index.html'), true);
  assert.equal(studioPageSource('website/src/App.tsx'), true);
  assert.equal(studioPageSource('website/index.html'), true);
  assert.equal(studioPageSource('package.json'), false);
  assert.equal(studioPageSource('src/data.json'), false);
  assert.equal(studioPageSource('.omd/studio/concepts/a/index.html'), false);
});

test('a study keeps the first screen, the whole page, each section and the measured system; unusable URLs are skipped', { timeout: 120_000 }, async t => {
  const root = project(t);
  const server = createServer((request, response) => {
    if (request.url === '/missing') { response.writeHead(404); response.end('no'); return; }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<body style="margin:0;font:400 18px Arial">'
      + '<style>@keyframes rise{from{opacity:0;transform:translateY(20px)}}h1{animation:rise 700ms cubic-bezier(0.22,1,0.36,1) both}</style>'
      + '<section style="height:900px;background:#eee"><h1 style="font:600 64px Arial;margin:0">Quiet tools</h1><p>One</p><p>Two</p></section>'
      + '<section style="height:1400px;background:#123;color:#fff"><h2 style="font:600 40px Arial">Detail</h2><p>Three</p><p>Four</p></section></body>');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>(done => server.close(() => done())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const result = await studyStudioReferences(plainWriter(root), [`${origin}/tools`, `${origin}/missing`, 'ftp://example.com']);
  assert.deepEqual(result.studied.map(item => item.dir), ['.omd/studio/refs/127-0-0-1-tools']);
  assert.deepEqual(result.skipped.map(item => item.reason), ['HTTP 404', 'not an http(s) URL']);
  const dir = join(root, '.omd/studio/refs/127-0-0-1-tools');
  const measured = JSON.parse(readFileSync(join(dir, 'study.json'), 'utf8'));
  assert.equal(measured.requested, `${origin}/tools`);
  assert.ok(measured.typeRamp.some((style: { size: number; weight: number }) => style.size === 64 && style.weight === 600), JSON.stringify(measured.typeRamp));
  assert.ok(measured.sections.length >= 2);
  assert.ok(existsSync(join(dir, measured.sections[0].crop)));
  assert.deepEqual([PNG.sync.read(readFileSync(join(dir, 'first-screen.png'))).width, PNG.sync.read(readFileSync(join(dir, 'full.png'))).width], [1440, 1000]);
  assert.equal(studioStudies(root)[0]?.url, `${origin}/tools`);
  // How it moves: the headline's rise is in the intro, with its duration and curve, and the arriving first screen is kept as frames.
  assert.equal(measured.motion.intro, 1);
  assert.deepEqual(measured.motion.durations, [{ value: '700', count: 1 }]);
  assert.equal(measured.motion.introSequence[0].easing, 'cubic-bezier(0.22, 1, 0.36, 1)');
  assert.ok([1, 2, 3].every(index => existsSync(join(dir, `intro-${index}.png`))));
});

test('the build is measured against its system: off-system type, arrow glyphs and player chrome, never inside a recreated product', { timeout: 120_000 }, async t => {
  const root = project(t);
  const page = join(root, 'index.html');
  writeFileSync(page, '<!doctype html><body style="margin:0;font:400 18px Arial"><h1 style="font:600 48px Arial">Quiet</h1>'
    + '<p style="font-size:13px">tiny caption</p><a href="#a">Docs ↗</a><button style="font:700 18px Arial">Go</button>'
    + '<div data-product style="font:400 11px monospace">terminal row</div><video controls width="320" height="180"></video></body>');
  const observations = await observeSystemDrift(page, { reference: 'https://quiet.tools', sizes: [48, 24, 18, 14], weights: [400, 600] });
  const desktop = observations.find(item => item.viewport === 'desktop')!;
  assert.deepEqual(desktop.offSystemSizes.map(item => item.size), [13]);
  assert.deepEqual(desktop.offSystemWeights.map(item => item.weight), [700]);
  assert.deepEqual(desktop.arrows, ['Docs ↗']);
  assert.equal(desktop.playerControls, 1);
  // The recreated product above is one narrow row: no key visual. Nothing arrives either. Mobile is not asked.
  assert.equal(desktop.keyVisual, false);
  assert.equal(desktop.arrives, false);
  assert.equal(observations.find(item => item.viewport === 'mobile')!.keyVisual, undefined);
  const failures = systemDriftFailures(observations);
  assert.match(failures.join('\n'), /desktop: sizes outside the system 13px \("tiny caption"\)/);
  assert.match(failures.join('\n'), /arrow glyphs on links or buttons "Docs ↗"/);
  assert.match(failures.join('\n'), /1 video with visible player controls/);
  assert.match(failures.join('\n'), /desktop: no key visual built in code in the first screen/);
  assert.match(failures.join('\n'), /desktop: the first screen does not arrive/);
  // The product's interface rebuilt at width in the first screen is the key visual; the same frame holding a recording is not.
  const built = (inner: string) => `<!doctype html><body style="margin:0;font:400 18px Arial"><h1 style="font:600 48px Arial">Quiet</h1>`
    + `<div data-product style="width:1000px;height:500px;font:400 11px monospace">${inner}</div></body>`;
  const rows = Array.from({ length: 10 }, (_, line) => `<div>row ${line}</div>`).join('');
  const system = { reference: 'https://quiet.tools', sizes: [48, 24, 18, 14], weights: [400, 600] };
  const desktopOf = async (html: string) => { writeFileSync(page, html); return (await observeSystemDrift(page, system)).find(item => item.viewport === 'desktop')!; };
  // Built but still: a key visual that never changes on its own is named; one that keeps working, under a headline that rises in, passes.
  const still = await desktopOf(built(rows));
  assert.deepEqual([still.keyVisual, still.performs], [true, false]);
  assert.match(systemDriftFailures([still]).join('\n'), /the key visual stands still/);
  const alive = await desktopOf(built(rows).replace('<h1 ', '<style>@keyframes rise{from{opacity:0;transform:translateY(12px)}}h1{animation:rise .6s both}</style><h1 ')
    + `<script>let n = 0; setInterval(() => { document.querySelector('[data-product] div').textContent = 'row ' + ++n; }, 300);</script>`);
  assert.deepEqual([alive.keyVisual, alive.arrives, alive.performs], [true, true, true]);
  assert.deepEqual(systemDriftFailures([alive]), []);
  assert.equal((await desktopOf(built('<video muted loop width="1000" height="500"></video>'))).keyVisual, false);
  assert.deepEqual(systemDriftFailures([{ viewport: 'desktop', offSystemSizes: [], offSystemWeights: [], arrows: [], playerControls: 0 }]), []);
});

test('the build step names the designer method: system, key visual first, depth, subtraction and one comparison', () => {
  const text = composeGuidance(route('new-marketing', '랜딩 페이지 만들어줘'));
  assert.match(text, /on the system in \.omd\/studio\/system\.json/);
  assert.match(text, /The key visual first: .*playing the product.s real flow on its own.*a screen recording is not a key visual/);
  assert.match(text, /reference's rhythm and depth/);
  assert.match(text, /Motion is part of the system.*the first screen arrives.*prefers-reduced-motion/);
  assert.match(text, /omd studio check --page/);
  assert.match(text, /beside the reference's first-screen\.png and full\.png/);
  assert.match(text, /typography-korean\.md/);
});

test('the studio commands load from the CLI entry, whatever module the CLI imports first', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/omd.ts', import.meta.url)), 'studio', 'refs', 'ftp://example.com', '--json'],
    { encoding: 'utf8', timeout: 60_000 });
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /before initialization/);
  assert.deepEqual(JSON.parse(run.stdout).skipped, [{ url: 'ftp://example.com', reason: 'not an http(s) URL' }]);
});
