import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { parseCompositionContract } from '../core/measure/contracts.ts';
import { piRecord } from '../adapters/pi-reviewer-contract.ts';

function colorFixture(t: TestContext, options: {
  property: 'background' | 'border' | 'outline';
  color: string; style: string; declared?: boolean; viewIds?: string[];
}) {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const path = join(fixture.root, '.omd/composition.md'), document = readFileSync(path, 'utf8');
  const fence = /```json\s*\n([\s\S]*?)```/m.exec(document);
  assert.ok(fence?.[1]);
  const contract = piRecord(JSON.parse(fence[1]), 'composition contract');
  assert.ok(Array.isArray(contract.colors));
  const role = { role: 'required-ui', selector: '#contrast-target', property: options.property,
    value: options.color, token: null,
    ...(options.declared === false ? {} : { contrastKind: 'non-text' }),
    ...(options.viewIds ? { viewIds: options.viewIds } : {}) };
  contract.colors = [...contract.colors, role];
  writeFileSync(path, document.replace(fence[0], `\`\`\`json\n${JSON.stringify(contract)}\n\`\`\``));
  const html = fixture.html.toString().replace('<main>', `<main><section style="background:white;padding:20px">
    <button id="contrast-target" style="appearance:none;color:#111;font:16px Arial;width:200px;height:44px;background:white;${options.style}">Confirm</button>
  </section>`);
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  return { ...fixture, contract, role };
}

for (const property of ['background', 'border', 'outline'] as const) {
  test(`declared ${property} contrast rejects low contrast independently of readable text`, async t => {
    const fixture = colorFixture(t, { property, color: '#cccccc',
      style: `${property === 'background' ? 'background' : `${property}-color`}:#ccc;border-style:solid;border-width:2px;outline-style:solid;outline-width:2px;` });
    const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
    const packet = loadMeasurement(fixture.root, result.packet);
    const metric = packet.measurements.find(metric => metric.kind === 'contrast-pair');
    assert.ok(metric?.kind === 'contrast-pair');
    const sample = metric.value.pairs.find(pair => 'colorRole' in pair && pair.colorRole === 'required-ui');
    assert.ok(sample);
    assert.equal(sample.threshold, 3);
    assert.equal(sample.result, 'fail');
    assert.ok(sample.ratio !== null && sample.ratio < 3);
    assert.ok(packet.findings.some(finding => String(finding.code) === 'NON_TEXT_CONTRAST_FAIL'));
    assert.equal(packet.findings.some(finding => finding.code === 'TEXT_CONTRAST_FAIL'), false);
  });
}

test('scoped essential border accepts strong paint and excludes the other viewport', async t => {
  const fixture = colorFixture(t, { property: 'border', color: '#000000',
    style: 'border:2px solid black;', viewIds: ['mobile-390x844@1'] });
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  const metrics = packet.measurements.filter(metric => metric.kind === 'contrast-pair');
  for (const metric of metrics) {
    assert.ok(metric.kind === 'contrast-pair');
    const rows = metric.value.pairs.filter(pair => 'colorRole' in pair && pair.colorRole === 'required-ui');
    assert.equal(rows.length, metric.viewIds.includes('mobile-390x844@1') ? 1 : 0);
    for (const row of rows) assert.equal(row.result, 'pass');
  }
  assert.equal(packet.findings.some(finding => String(finding.code) === 'NON_TEXT_CONTRAST_FAIL'), false);
});

test('alpha compositing and complex paint do not invent essential contrast passes', async t => {
  for (const [color, style, expected] of [
    ['#cccccc', 'border:2px solid rgba(0,0,0,.2);', 'fail'],
    ['#000000', 'border:2px solid black;background:linear-gradient(white,black);', 'unmeasured'],
  ] as const) {
    const fixture = colorFixture(t, { property: 'border', color, style });
    const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
    const packet = loadMeasurement(fixture.root, result.packet);
    const metric = packet.measurements.find(metric => metric.kind === 'contrast-pair');
    assert.ok(metric?.kind === 'contrast-pair');
    const row = metric.value.pairs.find(pair => 'colorRole' in pair && pair.colorRole === 'required-ui');
    assert.ok(row);
    assert.equal(row.result, expected);
  }
});

test('invalid non-text scope is refused without rewriting the authored contract', t => {
  const fixture = colorFixture(t, { property: 'border', color: '#000000',
    style: 'border:2px solid black;', viewIds: ['missing-view'] });
  const bytes = readFileSync(join(fixture.root, '.omd/composition.md'));
  assert.throws(() => parseCompositionContract(fixture.contract), /view|scope/i);
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/composition.md')), bytes);
});

test('undeclared decorative borders do not acquire a mandatory contrast floor', async t => {
  const fixture = colorFixture(t, { property: 'border', color: '#cccccc',
    style: 'border:2px solid #ccc;', declared: false });
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  assert.equal(packet.findings.some(finding => finding.code === 'NON_TEXT_CONTRAST_FAIL'), false);
  assert.equal(packet.measurements.some(metric => metric.kind === 'contrast-pair'
    && metric.value.pairs.some(pair => pair.kind === 'non-text')), false);
});

test('declared inactive controls preserve the non-text contrast exception', async t => {
  const fixture = colorFixture(t, { property: 'border', color: '#cccccc',
    style: 'border:2px solid #ccc;' });
  const html = readFileSync(join(fixture.root, 'dist/index.html'), 'utf8')
    .replace('id="contrast-target"', 'id="contrast-target" disabled');
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  for (const metric of packet.measurements.filter(metric => metric.kind === 'contrast-pair')) {
    assert.ok(metric.kind === 'contrast-pair');
    const row = metric.value.pairs.find(pair => pair.colorRole === 'required-ui');
    assert.ok(row);
    assert.equal(row.result, 'not-applicable');
    assert.equal(row.reason, 'disabled-control');
  }
  assert.equal(packet.findings.some(finding => finding.code === 'NON_TEXT_CONTRAST_FAIL'), false);
});
