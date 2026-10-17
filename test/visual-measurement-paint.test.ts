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
