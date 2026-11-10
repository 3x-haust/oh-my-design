import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { composeGuidance } from '../core/design/compose-guidance.ts';
import { installMaterialRig, MATERIAL_STAGE_SOURCE } from '../core/design/material-rig.ts';
import { readStudioConcept, STUDIO_CONCEPT_RECORD, STUDIO_ROUGH_IDEAS } from '../core/design/studio-concept.ts';
import { besideImage, blueprintOutline } from '../core/design/studio-look.ts';
import {
  findingLines, heldFindings, logoOnBox, observePageFindings, parseDeviations, rawPageFindings, repeatedTemplate, STUDIO_CONVENTIONS, type PageFinding,
} from '../core/design/studio-page-check.ts';
import { flowRegressions, readLedger, screenFindings, STUDIO_LEDGER, type ScreenRoles } from '../core/design/studio-screens.ts';
import { readStudioSystem, requireStudioSystem, studioPending, systemDriftFailures } from '../core/design/studio.ts';
import type { ProjectWriteAdapter } from '../core/runtime/project-write.ts';

type Route = Parameters<typeof composeGuidance>[0];
const route = (taskNeed: string) => ({ request: 'Build it.', projectMode: 'existing', sourceContract: { referenceDiscovery: { taskNeed } } }) as unknown as Route;
const project = (t: { after: (fn: () => void) => void }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-designer-core-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const plainWriter = (root: string): ProjectWriteAdapter => ({
  projectRoot: root,
  mkdir: path => { mkdirSync(join(root, path), { recursive: true }); return join(root, path); },
  write: (path, content) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); return join(root, path); },
  writeContentAddressed: (path, content) => { writeFileSync(join(root, path), content); return join(root, path); },
  remove: path => path, removeEmptyDirectory: path => path,
});
const concept = (objects: readonly string[]) => ({
  idea: 'The ampersand of the name cast in orange glass, holding the two words together.', object: objects[0], from: 'name',
  claim: 'Two crafts work as one team.', devices: ['the glass returns as the ground of the work section', 'a cropped curve of it divides the chapters'],
  dropped: objects.slice(1).map(object => ({ object, because: 'it could belong to any studio in the category' })),
});
const writeConcept = (root: string, value: unknown) => {
  mkdirSync(join(root, '.omd/studio'), { recursive: true });
  writeFileSync(join(root, STUDIO_CONCEPT_RECORD), JSON.stringify(value));
};
const SIX = ['a glass ampersand', 'a folded paper bridge', 'two interlocked rings', 'a loom of threads', 'a split stone', 'a pair of hands in clay'];

test('a marketing page decides its own visual idea before any reference; a product never waits for one', t => {
  const root = project(t);
  const landing = route('new-marketing');
  assert.equal(studioPending(root, route('new-product')), 'study');
  assert.equal(studioPending(root, landing), 'idea');
  assert.throws(() => requireStudioSystem(root, landing), /STUDIO_IDEA_MISSING: .*\.omd\/studio\/concept\.json.*each a different OBJECT/s);
  // The refusal names the work and writes nothing.
  assert.equal(existsSync(join(root, '.omd')), false);
  writeConcept(root, concept(SIX.slice(0, 3)));
  assert.throws(() => readStudioConcept(root), /STUDIO_IDEA_INVALID: .*holds 3 different objects; a choice is made among at least 6/);
  // The same object written six ways is one idea.
  writeConcept(root, concept(['a glass ampersand', 'A Glass Ampersand!', 'a glass-ampersand', 'a glass ampersand ', 'A GLASS AMPERSAND', 'a glass ampersand.']));
  assert.throws(() => readStudioConcept(root), /holds 1 different objects/);
  writeConcept(root, { ...concept(SIX), devices: ['only one place'] });
  assert.throws(() => readStudioConcept(root), /at least two places the object returns/);
  writeConcept(root, concept(SIX));
  assert.equal(readStudioConcept(root)?.dropped.length, STUDIO_ROUGH_IDEAS - 1);
  assert.equal(studioPending(root, landing), 'study');
  assert.throws(() => requireStudioSystem(root, landing), /STUDIO_STUDY_MISSING/);
});

test('the build step and the stage name the idea and the tracks', () => {
  const marketing = composeGuidance(route('new-marketing'));
  assert.match(marketing, /built around the idea in \.omd\/studio\/concept\.json.*omd studio rig.*omd studio blueprint/);
  assert.match(marketing, /record a deviation with its reason in system\.json/);
  assert.match(marketing, /a pass that adds: hover, focus and pressed states/);
  const product = composeGuidance(route('new-product'));
  assert.match(product, /omd studio check --mode product/);
  assert.doesNotMatch(product, /concept\.json/);
});

test('a recorded deviation replaces a default; defects and unknown conventions are never waived', () => {
  assert.deepEqual(parseDeviations(undefined), []);
  assert.throws(() => parseDeviations([{ convention: 'no-such-rule', instead: 'something else', because: 'x'.repeat(30) }]), /the conventions are weight-range/);
  assert.throws(() => parseDeviations([{ convention: 'weight-range', instead: 'the wordmark weight', because: 'looks nice' }]), /gives the reason in "because"/);
  const deviations = parseDeviations([{ convention: 'link-arrows', instead: 'one arrow on the primary action', because: 'the mark itself is an arrow and the action repeats it' }]);
  const observed = [{ viewport: 'desktop' as const, offSystemSizes: [{ size: 19, example: 'Odd' }], offSystemWeights: [], arrows: ['Start →'], playerControls: 0 }];
  assert.match(systemDriftFailures(observed).join('\n'), /arrow glyphs or trailing icons/);
  const waived = systemDriftFailures(observed, null, [], true, deviations).join('\n');
  assert.doesNotMatch(waived, /arrow glyphs/);
  // The promised system is not a convention: a deviation never excuses a size outside it.
  assert.match(waived, /sizes outside the system 19px/);
  const findings: PageFinding[] = [
    { tier: 'defect', id: 'horizontal-overflow', viewport: 'mobile', message: 'scrolls sideways' },
    { tier: 'convention', id: 'weight-range', viewport: 'desktop', message: 'weights outside' },
    { tier: 'convention', id: 'eyebrow-label', viewport: 'desktop', message: 'labels', count: 2, of: 7 },
  ];
  assert.equal(heldFindings(findings, []).length, 3);
  const weight = parseDeviations([{ convention: 'weight-range', instead: 'the wordmark 800 on headlines', because: 'the object is cast from the heavy wordmark itself' }]);
  assert.deepEqual(heldFindings(findings, weight).map(item => item.id), ['horizontal-overflow', 'eyebrow-label']);
  const eyebrow = parseDeviations([{ convention: 'eyebrow-label', instead: 'a chapter number above every heading', because: 'the page is told as five numbered chapters of a manual' }]);
  // A deviation applied to two headings of seven is an accident, and becomes a defect.
  assert.deepEqual(heldFindings(findings, eyebrow).map(item => `${item.tier}:${item.id}`), ['defect:horizontal-overflow', 'convention:weight-range', 'defect:deviation-inconsistent']);
  assert.deepEqual(heldFindings([{ tier: 'convention', id: 'eyebrow-label', viewport: 'desktop', message: 'labels', count: 6, of: 7 }], eyebrow), []);
  assert.equal(findingLines([findings[0]!, findings[0]!]).length, 1);
});

test('a system file carries jobs and deviations, and refuses a deviation without a reason', t => {
  const root = project(t);
  mkdirSync(join(root, '.omd/studio'), { recursive: true });
  const base = { reference: 'https://quiet.tools', sizes: [72, 48, 24, 16, 14], weights: [400, 600] };
  writeFileSync(join(root, '.omd/studio/system.json'), JSON.stringify({ ...base, jobs: { material: 'https://glass.example' },
    deviations: [{ convention: 'hero-scale', instead: 'the object leads and the headline stays small', because: 'the glass mark is the headline; type beside it is a caption' }] }));
  const system = readStudioSystem(root);
  assert.equal(system?.jobs?.material, 'https://glass.example');
  assert.equal(system?.deviations?.[0]?.convention, 'hero-scale');
  writeFileSync(join(root, '.omd/studio/system.json'), JSON.stringify({ ...base, deviations: [{ convention: 'hero-scale', instead: 'small', because: 'why not' }] }));
  assert.throws(() => readStudioSystem(root), /says what the page does instead|gives the reason/);
});

const raw = (over: Partial<Parameters<typeof rawPageFindings>[1]> = {}): Parameters<typeof rawPageFindings>[1] => ({
  overflow: 0, offEdge: [], lowContrast: [], headingSizes: [48], buttonStyles: [], weights: [{ weight: 400, example: 'Body' }, { weight: 600, example: 'Head' }],
  eyebrows: [], sublines: [], heroSize: 88, bodySize: 16, numberRows: [], logos: [], heads: 6, sectionHeads: 5, ...over });
const ids = (findings: readonly PageFinding[]) => findings.map(item => `${item.tier}:${item.id}`);

test('each page check names its problem and stays quiet on a page without it', () => {
  assert.deepEqual(rawPageFindings('desktop', raw(), []), []);
  assert.deepEqual(ids(rawPageFindings('mobile', raw({ overflow: 42 }), [])), ['defect:horizontal-overflow']);
  assert.deepEqual(ids(rawPageFindings('mobile', raw({ overflow: 1 }), [])), []);
  assert.deepEqual(ids(rawPageFindings('mobile', raw({ offEdge: ['Enterprise pricing'] }), [])), ['defect:off-screen-text']);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ lowContrast: [{ text: 'A long faint paragraph', ratio: 2.1 }] }), [])), ['defect:body-contrast']);
  assert.deepEqual(ids(rawPageFindings('desktop', raw(), ['Acme'])), ['defect:logo-on-box']);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ weights: [{ weight: 800, example: 'Loud' }, { weight: 300, example: 'Thin' }] }), [])), ['convention:weight-range']);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ weights: [{ weight: 510, example: 'Medium' }] }), [])), []);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ eyebrows: ['FEATURES / Ship faster'] }), [])), ['convention:eyebrow-label']);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ sublines: ['Ship faster'] }), [])), ['convention:heading-subline']);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ heroSize: 40 }), [])), ['convention:hero-scale']);
  // A phone's headline is small by nature; scale is read at desktop.
  assert.deepEqual(ids(rawPageFindings('mobile', raw({ heroSize: 40 }), [])), []);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ numberRows: ['10 20 50 100'] }), [])), ['convention:quantity-slider']);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ headingSizes: [56, 40, 28] }), [])), ['convention:heading-steps']);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ headingSizes: [56, 40] }), [])), []);
  assert.deepEqual(ids(rawPageFindings('desktop', raw({ buttonStyles: [{ background: 'rgb(0, 0, 0)', styles: ['8px radius, 16px/500', '999px radius, 16px/500'] }] }), [])), ['convention:button-anatomy']);
  for (const finding of rawPageFindings('desktop', raw({ weights: [{ weight: 800, example: 'Loud' }], eyebrows: ['A / B'], sublines: ['C'], heroSize: 40, numberRows: ['1 2 3'], headingSizes: [1, 2, 3] }), [])) {
    assert.ok(Object.hasOwn(STUDIO_CONVENTIONS, finding.id), `${finding.id} is a named convention a deviation can address`);
  }
  const section = (lead: 'product' | 'picture' | 'text', height = 900) => ({ height, largeMedia: lead === 'picture' ? 1 : 0, product: lead === 'product' ? 1 : 0, splitHeader: false, words: 60 });
  assert.match(repeatedTemplate([section('product'), section('picture'), section('picture'), section('picture'), section('text')]) ?? '', /sections 2 to 4 share one template/);
  assert.equal(repeatedTemplate([section('product'), section('picture'), section('text'), section('picture'), section('picture', 1800)]), null);
});

const flat = (width: number, height: number, paint: (x: number, y: number) => readonly [number, number, number]) => {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const [r, g, b] = paint(x, y), index = (width * y + x) * 4;
    png.data[index] = r; png.data[index + 1] = g; png.data[index + 2] = b; png.data[index + 3] = 255;
  }
  return png;
};

test('a logo that brings its own flat panel is seen in its pixels; a logo on the page is not', () => {
  const page = [246, 245, 242] as const, panel = [255, 255, 255] as const;
  const boxed = flat(120, 52, (x, y) => x >= 6 && x < 114 && y >= 6 && y < 46 ? panel : page);
  assert.equal(logoOnBox(boxed, 6), true);
  assert.equal(logoOnBox(flat(120, 52, () => page), 6), false);
  // A coloured badge is a designed shape, not a leftover background.
  assert.equal(logoOnBox(flat(120, 52, (x, y) => x >= 6 && x < 114 && y >= 6 && y < 46 ? [255, 90, 31] : page), 6), false);
});

const html = (body: string, style = '') => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:400 16px/1.5 system-ui;color:#111;background:#fff}h1{font-size:clamp(40px,6vw,88px);font-weight:600;margin:0}img{max-width:100%;height:auto}h2{font-size:40px;font-weight:600;margin:0}
section{padding:96px 24px;max-width:1100px}${style}</style></head><body>${body}</body></html>`;
const LONG = 'A paragraph long enough to count as running text, set at body size so that it is measured for contrast and width.';

test('the checker measures a real rendered page: defects on a broken one, none on a sound one', async t => {
  const root = project(t);
  const sound = join(root, 'sound.html'), broken = join(root, 'broken.html');
  writeFileSync(sound, html(`<section><h1>One clear thing</h1><p>${LONG}</p></section><section><h2>How it works</h2><div><img alt="" width="600" height="300"></div></section>`));
  writeFileSync(broken, html(`<section><p class="kicker">NEW RELEASE</p><h1>One clear thing</h1><p class="faint">${LONG}</p><div class="wide">A fixed row that cannot shrink below nine hundred pixels wide</div></section>
<section><h2 style="font-weight:800">How it works</h2><p>${LONG.slice(0, 60)}</p></section>`,
  '.kicker{font-size:12px;margin:0 0 12px}.faint{color:#c9c9c9}.wide{width:900px}'));
  const good = await observePageFindings(sound);
  assert.deepEqual(good.filter(item => item.tier === 'defect'), []);
  const bad = await observePageFindings(broken);
  const found = new Set(ids(bad));
  for (const id of ['defect:horizontal-overflow', 'defect:body-contrast', 'convention:eyebrow-label', 'convention:weight-range', 'convention:heading-subline']) {
    assert.ok(found.has(id), `${id} in ${[...found].join(', ')}`);
  }
});

const roles = (over: Partial<ScreenRoles> = {}): ScreenRoles => ({ title: '28px/600', sectionTitle: '18px/600', body: '14px/400', primary: '36px tall, 8px radius, 14px/500, rgb(20, 20, 20)',
  field: '36px tall, 8px radius, 14px', controls: ['Save', 'Export CSV', 'Search orders'], routes: ['/orders', '/settings'], sizes: [14, 18, 28], weights: [400, 500, 600], ...over });

test('a product is held across screens: one role one build, type inside the system, no sideways scroll', () => {
  const system = { sizes: [14, 18, 28], weights: [400, 500, 600] };
  assert.deepEqual(screenFindings([{ screen: 'orders', roles: roles(), overflow: 0 }, { screen: 'settings', roles: roles({ field: null }), overflow: 0 }], system), []);
  const drift = screenFindings([{ screen: 'orders', roles: roles(), overflow: 0 },
    { screen: 'settings', roles: roles({ primary: '44px tall, 999px radius, 16px/700, rgb(20, 20, 20)', sizes: [14, 21, 28] }), overflow: 18 }], system);
  assert.deepEqual([...new Set(drift.map(item => item.id))].sort(), ['horizontal-overflow', 'off-system-type', 'role-styled-differently']);
  assert.match(drift.map(item => item.message).join('\n'), /the primary button are built 2 ways across screens.*settings sets type in 21px/s);
});

test('a redesign keeps what people could do unless the ledger records the change', t => {
  const root = project(t);
  assert.equal(readLedger(root), null);
  mkdirSync(join(root, '.omd/studio'), { recursive: true });
  writeFileSync(join(root, STUDIO_LEDGER), JSON.stringify({ keep: [], change: [] }));
  assert.throws(() => readLedger(root), /STUDIO_LEDGER_INVALID: .*needs "keep"/);
  writeFileSync(join(root, STUDIO_LEDGER), JSON.stringify({ keep: ['the mark and its green', 'every route'],
    change: [{ what: 'Export CSV', to: 'Export in the row menu', because: 'export applies to selected rows, not the page' }] }));
  const ledger = readLedger(root)!;
  const before = { name: 'orders', url: 'http://old/orders', route: '/orders', controls: ['Save', 'Export CSV', 'Search orders'], routes: ['/orders/new', '/settings'] };
  assert.deepEqual(flowRegressions(before, { controls: ['Save', 'Search orders', 'Export'], routes: ['/orders/new', '/settings'] }, ledger), []);
  const lost = flowRegressions(before, { controls: ['Save'], routes: ['/settings'] }, ledger);
  assert.deepEqual(lost.map(item => item.id), ['flow-regression', 'flow-regression']);
  assert.match(lost[0]!.message, /controls on the old screen are gone "Search orders"/);
  assert.match(lost[1]!.message, /led to \/orders\/new/);
});

test('the blueprint carries structure and none of the reference\'s words; side-by-side keeps both images', () => {
  const outline = blueprintOutline({ typeRamp: [{ size: 96, weight: 500, count: 1 }, { size: 18, weight: 400, count: 40 }], weights: [400, 500],
    sections: [{ top: 0, height: 900, background: 'rgb(255, 255, 255)', contentWidth: 1200, heading: 'Acme ships your invoices', largeMedia: 0, words: 40, product: 1 },
      { top: 900, height: 1350, background: 'rgb(10, 10, 10)', contentWidth: 1200, heading: 'Trusted by Globex', largeMedia: 2, words: 120, splitHeader: true }] });
  assert.match(outline, /## 1\. 1\.0 screens, led by the product at work/);
  assert.match(outline, /## 2\. 1\.5 screens, led by 2 large pictures[\s\S]*headline with a short text beside it[\s\S]*the ground changes here/);
  assert.match(outline, /Type steps: 96 \/ 18 px/);
  assert.doesNotMatch(outline, /Acme|Globex|rgb\(/);
  const beside = PNG.sync.read(besideImage(PNG.sync.write(new PNG({ width: 400, height: 300 })), PNG.sync.write(new PNG({ width: 200, height: 500 })), 200));
  assert.deepEqual([beside.width, beside.height], [200 * 2 + 72, 500 + 48]);
});

test('the material stage ships as source the project owns and is never overwritten', t => {
  const root = project(t);
  const source = readFileSync(MATERIAL_STAGE_SOURCE, 'utf8');
  for (const part of ['glass', 'clay', 'porcelain', 'ink-metal', 'prefers-reduced-motion', 'NeutralToneMapping', 'SVGLoader', 'export function createMaterialStage']) assert.ok(source.includes(part), part);
  const first = installMaterialRig(root, plainWriter(root));
  assert.deepEqual(first.files, ['src/stage/materialStage.ts']);
  assert.equal(readFileSync(join(root, 'src/stage/materialStage.ts'), 'utf8'), source);
  writeFileSync(join(root, 'src/stage/materialStage.ts'), '// tuned by hand\n');
  assert.match(installMaterialRig(root, plainWriter(root)).next, /already here and was left as it is/);
  assert.equal(readFileSync(join(root, 'src/stage/materialStage.ts'), 'utf8'), '// tuned by hand\n');
  assert.throws(() => installMaterialRig(root, plainWriter(root), '../outside'), /names a folder inside the project/);
  assert.deepEqual(readdirSync(join(root, 'src')), ['stage']);
});
