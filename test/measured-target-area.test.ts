import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { piRecord } from '../adapters/pi-reviewer-contract.ts';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { parseCompositionContract } from '../core/measure/contracts.ts';
import type { MetricValues } from '../core/measure/types.ts';

test('declared touch targets measure actual boxes and refuse non-clickable nominal areas', async t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const path = join(fixture.root, '.omd/composition.md');
  const document = readFileSync(path, 'utf8');
  const fence = /```json\s*\n([\s\S]*?)```/m.exec(document);
  assert.ok(fence?.[1]);
  const contract = piRecord(JSON.parse(fence[1]), 'composition contract');
  assert.ok(Array.isArray(contract.regions));
  contract.regions = [...contract.regions, {
    selector: '#compact-target', role: 'utility', minimumVisible: 1, minimumTargetPx: 44,
  }, {
    selector: '#padded-target', role: 'utility', minimumVisible: 1, minimumTargetPx: 44,
  }, {
    selector: '#blocked-target', role: 'utility', minimumVisible: 1, minimumTargetPx: 44,
  }, {
    selector: '#inactive-target', role: 'utility', minimumVisible: 1, minimumTargetPx: 44,
  }];
  parseCompositionContract(contract);
  writeFileSync(path, document.replace(fence[0], `\`\`\`json\n${JSON.stringify(contract)}\n\`\`\``));
  const html = fixture.html.toString().replace('<main>', `<main><section>
    <button id="compact-target" style="box-sizing:border-box;width:24px;min-height:44px;padding:0;border:0">+</button>
    <button id="padded-target" style="box-sizing:border-box;width:44px;height:44px;padding:10px;border:0"><span style="display:block;width:24px;height:24px">+</span></button>
    <button id="blocked-target" style="pointer-events:none;box-sizing:border-box;width:44px;height:44px;padding:0;border:0">+</button>
    <button id="inactive-target" disabled style="box-sizing:border-box;width:24px;height:44px;padding:0;border:0">+</button>
    <button id="undeclared-target" style="box-sizing:border-box;width:24px;height:24px;padding:0;border:0">+</button>
  </section>`);
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const source = readFileSync(join(fixture.root, 'src/index.html'));
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  for (const capture of packet.captures) {
    const ir = piRecord(JSON.parse(readFileSync(join(fixture.root, capture.ir.path), 'utf8')), 'IR');
    const measurement = piRecord(ir.measurement, 'DOM');
    assert.ok(Array.isArray(measurement.nodes));
    const nodes = measurement.nodes.map(node => piRecord(node, 'node'));
    for (const [selector, width] of [['#compact-target', 24], ['#padded-target', 44]] as const) {
      const node = nodes.find(node => Array.isArray(node.assignments) && node.assignments.includes(selector));
      assert.ok(node);
      const subject = packet.subjects.find(subject => subject.viewId === capture.viewId && subject.irNodeId === node.id);
      assert.ok(subject);
      assert.equal(subject.box.w, width);
      const failures = packet.findings.filter(finding => String(finding.code) === 'REQUIRED_TARGET_TOO_SMALL'
        && finding.subjectIds.includes(subject.id));
      assert.equal(failures.length, width === 24 ? 1 : 0);
    }
    const metric = packet.measurements.find(metric => metric.kind === 'contract-conformance' && metric.viewIds.includes(capture.viewId));
    assert.ok(metric?.kind === 'contract-conformance');
    for (const [selector, expected] of [['#padded-target', 'pass'], ['#blocked-target', 'unmeasured'], ['#inactive-target', 'not-applicable']] as const) {
      const row: MetricValues['contract-conformance']['observations'][number] | undefined = metric.value.observations
        .find(observation => observation.field === `composition.regions.${selector}.minimumTargetPx`);
      assert.ok(row);
      assert.equal(row.result, expected);
    }
    assert.equal(metric.value.observations.some(row => row.field.includes('#undeclared-target')), false);
  }
  assert.deepEqual(readFileSync(join(fixture.root, 'src/index.html')), source);
});

test('invalid target minima and unknown region fields refuse without source mutation', t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const path = join(fixture.root, '.omd/composition.md'), bytes = readFileSync(path);
  const fence = /```json\s*\n([\s\S]*?)```/m.exec(bytes.toString());
  assert.ok(fence?.[1]);
  const contract = piRecord(JSON.parse(fence[1]), 'composition contract');
  for (const extension of [{ minimumTargetPx: 0 }, { minimumTargetPx: -1 }, { minimumTargetPx: '44' }, { targetApproval: true }]) {
    assert.throws(() => parseCompositionContract({ ...contract, regions: [
      { selector: '#target', role: 'utility', minimumVisible: 1, ...extension },
    ] }), /VISUAL_MEASUREMENT/);
  }
  assert.deepEqual(readFileSync(path), bytes);
});
