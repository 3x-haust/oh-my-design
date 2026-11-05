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
  observeSystemDrift, readStudioSystem, requireStudioSystem, studioPageSource, studioPending, studioReferenceDepth, studioStudies,
  coupletHeadings, pairedSlogan, studyStudioReferences, systemDriftFailures,
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
  // The accents are sampled from real material: a colour that is not in the file it names, or a file that is no image, holds the page.
  assert.throws(() => requireStudioSystem(root, landing), /system\.json names no colors/);
  writeFileSync(join(root, 'mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" fill="#E0457B"/><rect fill="#fc0"/></svg>');
  const palette = (colors: readonly object[]) => writeFileSync(join(root, '.omd/studio/system.json'),
    JSON.stringify({ reference: 'https://quiet.tools', sizes: [72, 48, 24, 18, 14], weights: [400, 600], colors }));
  palette([{ hex: '#236747', from: 'mark.svg' }]);
  assert.throws(() => requireStudioSystem(root, landing), /the colour #236747 is not in mark\.svg: sample it from the file's own pixels/);
  palette([{ hex: '#e0457b', from: 'README.md' }]);
  assert.throws(() => requireStudioSystem(root, landing), /names README\.md, which is neither|sample from a PNG or SVG/);
  palette([{ hex: '#e0457b', from: '../mark.svg' }]);
  assert.throws(() => requireStudioSystem(root, landing), /outside the project/);
  // A studied reference's captures are material too (the fixture captures are transparent, so nothing is found in them).
  palette([{ hex: '#e0457b', from: 'https://quiet.tools/' }]);
  assert.throws(() => requireStudioSystem(root, landing), /the colour #e0457b is not in https:\/\/quiet\.tools\//);
  palette([{ hex: '#e0457b', from: 'mark.svg' }, { hex: '#ffcc00', from: 'mark.svg' }]);
  // Then the first screen is drawn as page ideas before any source: one is not a choice; two are, or a recorded unavailability.
  assert.equal(studioPending(root, landing), 'concept');
  assert.throws(() => requireStudioSystem(root, landing), /STUDIO_CONCEPT_MISSING: 0 of 2 page ideas drawn\. .*omd imagegen --kind page/);
  const idea = (name: string, kind: string) => {
    mkdirSync(join(root, '.omd/ideas'), { recursive: true });
    writeFileSync(join(root, `.omd/ideas/${name}.png`), PNG.sync.write(new PNG({ width: 2, height: 2 })));
    writeFileSync(join(root, `.omd/ideas/${name}.json`), JSON.stringify({ prompt: 'hero', kind }));
  };
  idea('hero-1', 'page');
  idea('mark-1', 'graphic');
  assert.throws(() => requireStudioSystem(root, landing), /1 of 2 page ideas drawn/);
  idea('hero-2', 'page');
  assert.equal(studioPending(root, landing), null);
  rmSync(join(root, '.omd/ideas'), { recursive: true });
  mkdirSync(join(root, '.omd/ideas'));
  writeFileSync(join(root, '.omd/ideas/unavailable.json'), '{"reason":"no image tool"}');
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
  let visits = 0;
  const server = createServer((request, response) => {
    if (request.url === '/missing') { response.writeHead(404); response.end('no'); return; }
    // A site that serves its first visitors a one-screen variant: the study reads it again as a new visitor.
    if (request.url === '/tools' && ++visits === 2) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<body style="margin:0;height:100vh;overflow:hidden"><h1 style="font:600 40px Arial">Portal</h1></body>');
      return;
    }
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
  assert.ok(measured.pageHeight > 2000 && visits >= 3, `${measured.pageHeight} after ${visits} visits`);
  assert.ok(existsSync(join(dir, measured.sections[0].crop)));
  assert.deepEqual([PNG.sync.read(readFileSync(join(dir, 'first-screen.png'))).width, PNG.sync.read(readFileSync(join(dir, 'full.png'))).width], [1440, 1000]);
  assert.equal(studioStudies(root)[0]?.url, `${origin}/tools`);
  // How it moves: the headline's rise is in the intro, with its duration and curve, and the arriving first screen is kept as frames.
  assert.equal(measured.motion.intro, 1);
  assert.deepEqual(measured.motion.durations, [{ value: '700', count: 1 }]);
  assert.equal(measured.motion.introSequence[0].easing, 'cubic-bezier(0.22, 1, 0.36, 1)');
  assert.ok([1, 2, 3].every(index => existsSync(join(dir, `intro-${index}.png`))));
});

test('a headline of short sentences that end alike is named as a paired slogan; a concrete headline or a contrast pair is not', () => {
  // Five of seven lazygit runs wrote this headline; the reviewer named the cadence as machine-made.
  for (const slogan of ['Git은 강력하게. 작업은 간단하게.', 'Build faster. Ship faster.', '더 빠르게. 더 쉽게. 더 가볍게.']) assert.equal(pairedSlogan(slogan), true, slogan);
  for (const headline of ['변경을 골라 커밋하세요.', 'Git 명령어 대신, 변경 사항을 보면서 작업하세요.', '리베이스에 TODO 파일이 꼭 필요할까요?',
    '명령어는 덜. 할 수 있는 일은 더.', 'Less noise. More signal.', '이 변경에서 한 줄만 커밋하고 싶다면. 스페이스 하나로 스테이징하세요.', 'Lazygit']) {
    assert.equal(pairedSlogan(headline), false, headline);
  }
  const observation = { viewport: 'desktop' as const, offSystemSizes: [], offSystemWeights: [], arrows: [], playerControls: 0 };
  assert.match(systemDriftFailures([{ ...observation, headings: ['Git은 강력하게. 작업은 간단하게.', '변경을 골라 커밋하세요.'] }]).join('\n'),
    /paired slogans "Git은 강력하게\. 작업은 간단하게\.": a headline names a concrete thing the product does/);
  assert.deepEqual(systemDriftFailures([{ ...observation, headings: ['변경을 골라 커밋하세요.'] }]), []);
  // test-331: with the full-stop pair named, every heading became a comma couplet. The page's shape is named, not one good line.
  const couplets = ['로고와 말투는, 원래 프로젝트에서.', 'URL은 구현할 원본으로, 또는 참고할 영감으로.', 'Figma 프레임이 있다면, 그 프레임이 기준입니다.', '다음 디자인은, 여기서 시작하세요.'];
  assert.deepEqual(coupletHeadings(couplets), couplets);
  assert.match(systemDriftFailures([{ ...observation, headings: couplets }]).join('\n'),
    /4 of 4 headings take one two-part shape "로고와 말투는, 원래 프로젝트에서\."/);
  const varied = ['Git 명령어 대신, 변경 사항을 보면서 작업하세요.', '변경을 골라 커밋하세요.', '리베이스에 TODO 파일이 꼭 필요할까요?', 'brew install lazygit', '커밋 그래프'];
  assert.deepEqual(coupletHeadings(varied), []);
  assert.deepEqual(coupletHeadings(couplets.slice(0, 2)), []);
  // Accents stay in the family of a sampled colour: a darker step of the logo's magenta passes, the default forest green does not.
  const palette = [{ hex: '#e0457b', from: 'mark.svg' }];
  assert.deepEqual(systemDriftFailures([{ ...observation, accents: ['#a8264f'] }], null, palette), []);
  assert.match(systemDriftFailures([{ ...observation, accents: ['#236747', '#a8264f'] }], null, palette).join('\n'),
    /desktop: accents outside the sampled palette #236747 \(the system samples #e0457b from mark\.svg\)/);
  assert.deepEqual(systemDriftFailures([{ ...observation, accents: ['#236747'] }]), [], 'a system without colors is not held to them');
});

test('the build is measured against its system: off-system type, arrow glyphs and player chrome, never inside a recreated product', { timeout: 120_000 }, async t => {
  const root = project(t);
  const page = join(root, 'index.html');
  writeFileSync(page, '<!doctype html><body style="margin:0;font:400 18px Arial"><h1 style="font:600 48px Arial">Quiet</h1>'
    + '<style>.more::after{content:" →"}</style><a class="more" href="#b">More</a>'
    + '<p style="font-size:13px">tiny caption</p><a href="#a">Docs ↗</a><button style="font:700 18px Arial">Go</button>'
    + '<div data-product style="font:400 11px monospace">terminal row</div><video controls width="320" height="180"></video></body>');
  const observations = await observeSystemDrift(page, { reference: 'https://quiet.tools', sizes: [48, 24, 18, 14], weights: [400, 600] });
  const desktop = observations.find(item => item.viewport === 'desktop')!;
  assert.deepEqual(desktop.offSystemSizes.map(item => item.size), [13]);
  assert.deepEqual(desktop.offSystemWeights.map(item => item.weight), [700]);
  // An arrow drawn with ::after content is as much an arrow as one typed into the link.
  assert.deepEqual(desktop.arrows, ['More →', 'Docs ↗']);
  assert.equal(desktop.playerControls, 1);
  assert.equal(desktop.stillVideos, 1);
  // The unstyled links paint in the browser's own blue, which no sampled palette holds.
  assert.deepEqual(desktop.accents, ['#0000ee']);
  assert.deepEqual(desktop.headings, ['Quiet']);
  // The recreated product above is one narrow row: no key visual. Nothing arrives either. Mobile is not asked.
  assert.equal(desktop.keyVisual, false);
  assert.equal(desktop.arrives, false);
  assert.equal(observations.find(item => item.viewport === 'mobile')!.keyVisual, undefined);
  const failures = systemDriftFailures(observations);
  assert.match(failures.join('\n'), /desktop: sizes outside the system 13px \("tiny caption"\)/);
  assert.match(failures.join('\n'), /arrow glyphs or trailing icons on links or buttons "More →", "Docs ↗"/);
  assert.match(failures.join('\n'), /1 video with visible player controls/);
  assert.match(failures.join('\n'), /desktop: no key visual built in code in the first screen/);
  assert.match(failures.join('\n'), /desktop: the first screen does not arrive/);
  // test-328, a mobile app, was asked for seven screens, a key visual and an intro taken from its reference's marketing site.
  // An app keeps the system checks and drops the landing ones.
  const app = systemDriftFailures(observations, { screens: 7, revealsOnScroll: true }, [], false).join('\n');
  assert.match(app, /desktop: sizes outside the system 13px/);
  assert.doesNotMatch(app, /screens against|key visual|does not arrive|reveals as the page scrolls/);
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
  // test-317 drew its link arrows as 16px svgs after the words and held its demos behind a play button. A leading icon and a demo that plays
  // muted and looped on its own pass.
  const icon = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>';
  const links = await desktopOf(`<!doctype html><body style="font:400 18px Arial"><a href="#d">Docs ${icon}</a><a href="#g">${icon} GitHub</a>`
    + '<video width="320" height="180" poster="data:,"></video><video autoplay muted loop playsinline width="320" height="180"></video></body>');
  assert.deepEqual(links.arrows, ['Docs [icon]']);
  assert.equal(links.stillVideos, 1);
  const named = systemDriftFailures([links]).join('\n');
  assert.match(named, /arrow glyphs or trailing icons on links or buttons "Docs \[icon\]"/);
  assert.match(named, /1 video waits for a click; a demo plays muted and looped on its own/);
  assert.deepEqual(systemDriftFailures([{ viewport: 'desktop', offSystemSizes: [], offSystemWeights: [], arrows: [], playerControls: 0 }]), []);
});

test('the build step names the designer method: system, key visual first, depth, subtraction and one comparison', () => {
  const text = composeGuidance(route('new-marketing', '랜딩 페이지 만들어줘'));
  assert.match(text, /on the system in \.omd\/studio\/system\.json/);
  assert.match(text, /The key visual first: .*playing the product.s real flow on its own.*a screen recording is not a key visual/);
  assert.match(text, /reference's rhythm and depth/);
  // test-314/315 turned every README capability into the same demo block; the page leads with a few stories.
  assert.match(text, /the few stories that make the case/);
  assert.match(text, /remaining capabilities gathered densely in one place/);
  assert.match(text, /Motion is part of the system.*the first screen arrives.*prefers-reduced-motion/);
  assert.match(text, /omd studio check --page/);
  assert.match(text, /beside the reference's first-screen\.png and full\.png/);
  assert.match(text, /typography-korean\.md/);
  // Five lazygit runs converged on the same paired slogan; the reviewer named the cadence as machine-made.
  assert.match(text, /never a paired slogan of two parallel clauses or an abstract promise of ease/);
});

test('the studio commands load from the CLI entry, whatever module the CLI imports first', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/omd.ts', import.meta.url)), 'studio', 'refs', 'ftp://example.com', '--json'],
    { encoding: 'utf8', timeout: 60_000 });
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /before initialization/);
  assert.deepEqual(JSON.parse(run.stdout).skipped, [{ url: 'ftp://example.com', reason: 'not an http(s) URL' }]);
});

test("a page is held to its reference's depth and to revealing on scroll when the reference does", { timeout: 120_000 }, async t => {
  const root = project(t);
  study(root, 'https://quiet.tools/', 'quiet-tools');
  writeFileSync(join(root, '.omd/studio/system.json'), JSON.stringify({ reference: 'https://quiet.tools', sizes: [48, 24, 18, 14], weights: [400, 600] }));
  assert.equal(studioReferenceDepth(root), null);
  writeFileSync(join(root, '.omd/studio/refs/quiet-tools/study.json'), JSON.stringify({ requested: 'https://quiet.tools/', screens: 9.1, motion: { onScroll: 24 } }));
  const reference = studioReferenceDepth(root)!;
  assert.deepEqual(reference, { screens: 9.1, revealsOnScroll: true });
  const page = join(root, 'index.html');
  const sections = (count: number, reveal: boolean) => `<!doctype html><body style="margin:0;font:400 18px Arial">${reveal
    ? '<style>.in{animation:rise .5s cubic-bezier(.16,1,.3,1) both}@keyframes rise{from{opacity:0;transform:translateY(24px)}}</style>' : ''}${
    Array.from({ length: count }, (_, index) => `<section style="height:900px"><h2 style="font:600 48px Arial">Part ${index}</h2></section>`).join('')}${reveal
    ? '<script>new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add("in"))).observe(document.querySelectorAll("section")[2])</script>' : ''}</body>`;
  const system = { reference: 'https://quiet.tools', sizes: [48, 24, 18, 14], weights: [400, 600] };
  writeFileSync(page, sections(3, false));
  const shallow = await observeSystemDrift(page, system);
  const failures = systemDriftFailures(shallow, reference).join('\n');
  assert.match(failures, /desktop: the page is 3(\.1)? screens against the reference's 9\.1/);
  // test-314 met the depth with ten identical text-beside-demo sections; depth asks for varied arrangements.
  assert.match(failures, /never one demo block repeated down the page/);
  assert.match(failures, /desktop: nothing reveals as the page scrolls/);
  // Without a reference to measure against, depth and reveals are not asked.
  assert.doesNotMatch(systemDriftFailures(shallow).join('\n'), /screens against|reveals/);
  writeFileSync(page, sections(6, true));
  const deep = await observeSystemDrift(page, system);
  assert.ok((deep.find(item => item.viewport === 'desktop')!.revealed ?? 0) > 0);
  assert.doesNotMatch(systemDriftFailures(deep, reference).join('\n'), /screens against|reveals/);
});
