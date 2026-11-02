import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { captureStudioReferences, compFirstScreen, compInstruction, generateStudioComps, studioReferenceImages } from '../core/design/studio-comps.ts';
import { currentStudioConcepts, renderStudioConcepts, studioConceptPages } from '../core/design/studio.ts';
import { composeGuidance } from '../core/design/compose-guidance.ts';
import type { ProjectWriteAdapter } from '../core/runtime/project-write.ts';

const solid = (width: number, height: number, shade: number): Buffer => {
  const png = new PNG({ width, height });
  png.data.fill(shade);
  return PNG.sync.write(png);
};
const plainWriter = (root: string): ProjectWriteAdapter => ({
  projectRoot: root,
  mkdir: path => { mkdirSync(join(root, path), { recursive: true }); return join(root, path); },
  write: (path, content) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); return join(root, path); },
  writeContentAddressed: (path, content) => { writeFileSync(join(root, path), content); return join(root, path); },
  remove: path => path, removeEmptyDirectory: path => path,
});
const project = (t: { after: (fn: () => void) => void }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-comps-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const direction = (name: string) => `${name}: a quiet editorial page, one monumental object on a plinth under warm studio light, `
  + 'big Korean headlines on a strict twelve-column grid, the logo orange as the only accent.';
const prompt = (root: string, name: string, body = direction(name)) => {
  mkdirSync(join(root, '.omd/studio/concepts', name), { recursive: true });
  writeFileSync(join(root, '.omd/studio/concepts', name, 'prompt.md'), body);
};
const noRender = async () => { throw new Error('a drawn concept is not rendered in a browser'); };

test('the comp instruction carries the brief, copy, logo and reference craft, and the restraint rules', () => {
  const text = compInstruction({ brief: 'A design harness for coding agents.', copy: '사람처럼 디자인합니다.', concept: 'Editorial, one object.', logo: true, references: 3 });
  assert.match(text, /first attached image is the project's logo: place it exactly as it is/);
  assert.match(text, /other attached images are the bodies of finished sites\. Take their craft/);
  assert.match(text, /Never take their branding, colours, copy, illustrations or layout wholesale/);
  assert.match(text, /appears below it at most once, smaller and quieter/);
  assert.match(text, /no small eyebrow label above every section/);
  assert.ok(text.includes('A design harness for coding agents.') && text.includes('사람처럼 디자인합니다.') && text.includes('Editorial, one object.'));
  const bare = compInstruction({ brief: 'b', copy: '', concept: 'c', logo: false, references: 0 });
  assert.ok(!/project's logo|finished sites|Copy:/.test(bare));
});

test('a comp\'s first screen is cut at the 1440×1013 desktop ratio and narrowed to 1280×900', () => {
  const first = PNG.sync.read(compFirstScreen(solid(1440, 4000, 200)));
  assert.deepEqual([first.width, first.height], [1280, 900]);
});

test('three art directions are drawn as comps with the README logo and the references attached; a failed drawing writes nothing', async t => {
  const root = project(t);
  mkdirSync(join(root, 'kit/brand/readme'), { recursive: true });
  writeFileSync(join(root, 'kit/package.json'), JSON.stringify({ name: 'kit' }));
  writeFileSync(join(root, 'kit/brand/readme/header-light.png'), solid(40, 10, 90));
  writeFileSync(join(root, 'kit/README.md'), '<p><img alt="Kit" src="brand/readme/header-light.png"></p>\n# Kit\n');
  mkdirSync(join(root, '.omd/studio/refs'), { recursive: true });
  writeFileSync(join(root, '.omd/studio/refs/linear-app.png'), solid(10, 10, 20));
  writeFileSync(join(root, '.omd/studio/brief.md'), 'Kit lays out pages for agents.');
  for (const name of ['atelier', 'journey', 'specimen']) prompt(root, name);
  assert.deepEqual(studioConceptPages(root).map(page => page.kind), ['comp', 'comp', 'comp']);
  const calls: { instruction: string; attachments: readonly string[] }[] = [];
  const shades = new Map([['atelier', 10], ['journey', 120], ['specimen', 240]]);
  const writer = plainWriter(root);
  const rendered = await renderStudioConcepts(root, writer, noRender, () => new Date(0), concepts => generateStudioComps(root, concepts,
    async (directory, instruction, attachments) => {
      calls.push({ instruction, attachments });
      const name = [...shades.keys()].find(key => instruction.includes(`${key}: a quiet`))!;
      writeFileSync(join(directory, 'comp.png'), solid(1440, 3000, shades.get(name)!));
    }));
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0]!.attachments.map(path => path.slice(root.length + 1)), [join('kit', 'brand', 'readme', 'header-light.png'), '.omd/studio/refs/linear-app.png']);
  assert.ok(calls.every(call => call.instruction.includes('Kit lays out pages for agents.')));
  assert.deepEqual(rendered.concepts.map(concept => [concept.name, concept.comp?.path, concept.captures.map(capture => capture.viewport).join()]), [
    ['atelier', '.omd/studio/concepts/atelier/comp.png', 'desktop'],
    ['journey', '.omd/studio/concepts/journey/comp.png', 'desktop'],
    ['specimen', '.omd/studio/concepts/specimen/comp.png', 'desktop']]);
  assert.equal(currentStudioConcepts(root).length, 3);
  // An edited direction or a replaced comp is no longer the drawn concept.
  prompt(root, 'journey', `${direction('journey')} Darker.`);
  writeFileSync(join(root, '.omd/studio/concepts/specimen/comp.png'), solid(10, 10, 1));
  assert.deepEqual(currentStudioConcepts(root).map(concept => concept.name), ['atelier']);

  // A direction too thin to draw is refused before anything runs; a drawing that fails names why and keeps the record.
  prompt(root, 'specimen', 'minimal');
  await assert.rejects(renderStudioConcepts(root, writer, noRender, () => new Date(0), async () => { throw new Error('not reached'); }),
    /STUDIO_COMP_PROMPT: specimen needs a real art direction/);
  prompt(root, 'specimen');
  const before = readFileSync(join(root, '.omd/studio/concepts.json'), 'utf8');
  await assert.rejects(renderStudioConcepts(root, writer, noRender, () => new Date(0), concepts => generateStudioComps(root, concepts,
    async () => { throw new Error('exit 1: not logged in'); })), /STUDIO_COMP_UNAVAILABLE: atelier: exit 1: not logged in.*write each concept as a full-page HTML sketch/);
  assert.equal(readFileSync(join(root, '.omd/studio/concepts.json'), 'utf8'), before);
});

test('the build step points a picked comp out as the target; a sketched pick keeps the concept wording', () => {
  const route = { request: '랜딩 페이지 만들어줘', projectMode: 'greenfield', sourceContract: { referenceDiscovery: { taskNeed: 'new-marketing' } } } as unknown as Parameters<typeof composeGuidance>[0];
  assert.match(composeGuidance(route, '.omd/studio/concepts/atelier/comp.png'), /Build the picked comp \(\.omd\/studio\/concepts\/atelier\/comp\.png\) .*it is the target/);
  assert.match(composeGuidance(route), /Build the picked concept in the project/);
});

test('reference capture keeps the body below the first screen of whole pages and skips what it cannot use', { timeout: 120_000 }, async t => {
  const root = project(t);
  const server = createServer((request, response) => {
    if (request.url === '/missing') { response.writeHead(404); response.end('no'); return; }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(request.url === '/short' ? '<body style="margin:0;height:400px">short</body>'
      : '<body style="margin:0"><section style="height:900px;background:#eee">hero</section><section style="height:2400px;background:#123">body</section></body>');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>(done => server.close(() => done())));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const result = await captureStudioReferences(plainWriter(root), [`${origin}/long`, `${origin}/short`, `${origin}/missing`, 'ftp://example.com']);
  assert.deepEqual(result.captured.map(item => item.path), ['.omd/studio/refs/127-0-0-1.png']);
  const body = PNG.sync.read(readFileSync(join(root, result.captured[0]!.path)));
  assert.equal(body.width, 1000);
  // The capture starts below the first screen: its first row is the dark body, not the light hero.
  assert.ok(body.data[0]! < 60, `first pixel ${body.data[0]}`);
  assert.deepEqual(result.skipped.map(item => item.reason), ['the page is shorter than two screens', 'HTTP 404', 'not an http(s) URL']);
  assert.deepEqual(studioReferenceImages(root), ['.omd/studio/refs/127-0-0-1.png']);
});
