import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { browserFixturePng } from './helpers/browser-observation-decision-links.ts';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { loadContracts } from '../core/measure/inputs.ts';
import { paint } from '../core/measure/paint.ts';
import { layout } from '../core/measure/layout.ts';
import type { MeasuredIr, MetricValues, Subject } from '../core/measure/types.ts';
test('media salience uses captured pixel contrast, not an image element inherited text color', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  writeFileSync(join(fixture.root, 'dist/assets/black.png'), browserFixturePng(32, 32));
  writeFileSync(join(fixture.root, 'dist/index.html'), fixture.html.toString().replace('<main>', '<main><img src="assets/black.png" alt="" style="display:block;width:96px;height:96px;color:white">'));
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' }), packet = loadMeasurement(fixture.root, result.packet);
  const capture = packet.captures[0]!, raw = JSON.parse(readFileSync(join(fixture.root, capture.ir.path), 'utf8')) as MeasuredIr;
  const image = raw.measurement.nodes.find(n => n.tag === 'img')!, pixels = readFileSync(join(fixture.root, capture.capture.path));
  const stats = paint(raw.measurement, pixels);
  assert.deepEqual(image.foreground, [255, 255, 255, 1]);
  assert.equal(stats.mediaContrast.get(image.id), 1);
  const salience = layout(raw.measurement, loadContracts(fixture.root).contracts, stats.canvasPaintShare, stats.mediaContrast)['salience-regions'];
  assert.ok(salience.regions.some(r => r.subjectId === image.id && r.score > 0));
});

test('inactive control descendants retain contrast exceptions without exempting active labels', async t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const markup = `<section style="background:white;color:#aaa">
    <button disabled style="color:inherit"><span data-omd-content-id="native-inactive">Native inactive</span></button>
    <button aria-disabled="true" style="color:inherit"><span data-omd-content-id="aria-inactive">Aria inactive</span></button>
    <button style="color:inherit"><span data-omd-content-id="active">Active</span></button>
    <fieldset disabled><legend><button style="color:inherit"><span data-omd-content-id="legend-active">Legend active</span></button></legend>
    <button style="color:inherit"><span data-omd-content-id="fieldset-inactive">Fieldset inactive</span></button></fieldset>
    <div aria-disabled="true"><p data-omd-content-id="ordinary-copy">Ordinary copy</p></div>
  </section>`;
  const html = fixture.html.toString().replace('<main>', `<main>${markup}`);
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet), capture = packet.captures[0];
  assert.ok(capture);
  const raw = JSON.parse(readFileSync(join(fixture.root, capture.ir.path), 'utf8')) as MeasuredIr;
  const metric = packet.measurements.find(metric => metric.kind === 'contrast-pair'
    && metric.viewIds.includes(capture.viewId));
  assert.ok(metric?.kind === 'contrast-pair');
  for (const [id, disabled] of [['native-inactive', true], ['aria-inactive', true],
    ['fieldset-inactive', true], ['active', false], ['legend-active', false],
    ['ordinary-copy', false]] as const) {
    const node = raw.measurement.nodes.find(node => node.contentId === id);
    assert.ok(node, id);
    assert.equal(node.disabled, disabled, id);
    const subject: Subject | undefined = packet.subjects.find(candidate => candidate.irNodeId === node.id
      && candidate.viewId === capture.viewId);
    assert.ok(subject, id);
    const sample: MetricValues['contrast-pair']['pairs'][number] | undefined =
      metric.value.pairs.find(pair => pair.subjectId === subject.id);
    assert.ok(sample, id);
    assert.equal(sample.result, disabled ? 'not-applicable' : 'fail', id);
    assert.equal(packet.findings.some(finding => finding.code === 'TEXT_CONTRAST_FAIL'
      && finding.subjectIds.includes(subject.id)), !disabled, id);
  }
});

test('a scroll reveal is measured in its settled state, as reduced motion shows it', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  // Hidden and shifted until scrolled into view, shown at once under reduced motion: what the page asks for.
  const reveal = `<style>.reveal{opacity:0;transform:translateY(40px)} @media (prefers-reduced-motion: reduce){.reveal{opacity:1;transform:none}}</style>
    <section class="reveal" style="background:white;color:#111"><p data-omd-content-id="revealed">Revealed section copy</p></section>`;
  const html = fixture.html.toString().replace('<main>', `<main>${reveal}`);
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' }), packet = loadMeasurement(fixture.root, result.packet);
  const raw = JSON.parse(readFileSync(join(fixture.root, packet.captures[0]!.ir.path), 'utf8')) as MeasuredIr;
  const copy = raw.measurement.nodes.find(node => node.text?.includes('Revealed section copy'));
  assert.ok(copy, 'the revealed copy is measured');
  assert.ok(!packet.findings.some(finding => finding.code === 'MEASUREMENT_INCOMPLETE' && JSON.stringify(finding).includes('transformed-geometry')),
    'no transformed-geometry gap from a reveal');
});

test('text under a settled or translated parent is measured; rotated text still is not', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const markup = `<section style="transform:translateY(0);background:white;color:#111"><p data-omd-content-id="settled">Settled reveal copy</p></section>
    <section style="transform:translate(12px, 4px);background:white;color:#111"><p data-omd-content-id="shifted">Shifted copy</p></section>
    <section style="transform:rotate(-3deg);background:white;color:#111"><p data-omd-content-id="tilted">Tilted copy</p></section>`;
  const html = fixture.html.toString().replace('<main>', `<main>${markup}`);
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' }), packet = loadMeasurement(fixture.root, result.packet);
  const raw = JSON.parse(readFileSync(join(fixture.root, packet.captures[0]!.ir.path), 'utf8')) as MeasuredIr;
  const unsupported = (text: string) => raw.measurement.nodes.find(node => node.text?.includes(text))?.unsupported ?? ['missing'];
  assert.ok(!unsupported('Settled reveal copy').includes('transformed-geometry'), 'identity matrix left by a reveal');
  assert.ok(!unsupported('Shifted copy').includes('transformed-geometry'), 'a pure translation');
  assert.ok(unsupported('Tilted copy').includes('transformed-geometry'), 'rotation still distorts what is measured');
});

test('text a fixed header covers at the top of the page, before any scroll, is still occluded', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  // At rest a fixed header overlapping the first paragraph is a layout defect the measurer must keep reporting.
  const markup = `<header style="position:fixed;top:0;left:0;right:0;height:240px;background:white;z-index:9">Header</header>
    <p data-omd-content-id="covered" style="margin:20px 0 0;background:white;color:#111">Covered first paragraph</p>`;
  const html = fixture.html.toString().replace('<main>', `<main>${markup}`);
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' }), packet = loadMeasurement(fixture.root, result.packet);
  const raw = JSON.parse(readFileSync(join(fixture.root, packet.captures[0]!.ir.path), 'utf8')) as MeasuredIr;
  const covered = raw.measurement.nodes.find(node => node.text?.includes('Covered first paragraph'));
  assert.ok(covered?.unsupported.includes('occluded-text'));
});

test('a page that keeps changing stays unstable, while one that settles after a late change is measured stable', async t => {
  const run = async (script: string) => {
    const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
    const html = fixture.html.toString().replace('<main>', `<main><p id="tick" style="color:#111">0</p><script>${script}</script>`);
    for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
    const packet = loadMeasurement(fixture.root, (await measureProject({ ...fixture, entry: 'dist/index.html' })).packet);
    return packet.captures.map(capture => capture.stability.status);
  };
  // A counter that never stops differs on every attempt.
  assert.ok((await run('let n=0;setInterval(()=>{document.getElementById("tick").textContent=String(++n)},40)')).includes('unstable'));
  // A single late change (a swapped label after a short delay) has settled by the retake.
  assert.ok((await run('setTimeout(()=>{document.getElementById("tick").textContent="ready"},300)')).every(status => status === 'stable'));
});
