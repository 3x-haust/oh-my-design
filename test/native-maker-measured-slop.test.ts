import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadMeasurement, measureProject } from '../core/measure/index.ts';
import { captureMeasuredSlopCheckpoint } from '../core/slop/measured-review.ts';
import { prepareNativeMaker } from '../core/runtime/native-maker-packet.ts';
import { fixture, repo } from './helpers/native-maker.ts';
import { write } from './helpers/measured-terminal.ts';
import { MAX_BROKERED_EVIDENCE_BYTES } from '../core/runtime/evidence-proxy.ts';

test('native Hand receives the current unreviewed measured repair findings and whole captures', async t => {
  const f = fixture(t);
  const assets = join(repo, 'test/fixtures/visual-measurement');
  const entry = 'src/copy/final.html';
  write(f.root, entry, readFileSync(join(assets, 'test-016-like.html')));
  cpSync(join(assets, 'assets'), join(f.root, 'src/copy/assets'), { recursive: true });
  for (const name of ['type-proof', 'composition']) {
    write(f.root, `.omd/${name}.md`, readFileSync(join(assets, `test-016-${name}.md`)));
  }
  const measurement = await measureProject({ root: f.root, writer: f.writer, invocation: f.invocation, entry });
  const checkpoint = captureMeasuredSlopCheckpoint(f.root,
    { schema: 'slop-measured-scope-v2', measurements: [measurement.packet] }, f.writer, f.invocation);
  assert.ok(checkpoint.findings.some(finding => finding.kind === 'measurement'));
  const before = readFileSync(join(f.root, '.omd/slop/latest.json'));
  const prepared = prepareNativeMaker(f);
  const packet = JSON.parse(prepared.packet.toString('utf8'));
  const repair = packet.evidence.evaluatorLineage.find(
    (item: { kind: string }) => item.kind === 'measured-slop');
  assert.ok(repair, 'the current measured checkpoint must reach Hand instead of only old execution failures');
  assert.deepEqual(repair.checkpoint, checkpoint.checkpoint);
  assert.deepEqual(repair.findings, checkpoint.findings);
  assert.ok(packet.evidence.renders.some(
    (render: { role: string }) => render.role === 'first-party-measured-repair'));
  const measured = loadMeasurement(f.root, measurement.packet);
  assert.deepEqual(repair.measurements, [measurement.packet]);
  assert.deepEqual(repair.measurementEvidence, [{ receipt: measurement.packet,
    scope: measured.scope, subjects: measured.subjects, findings: measured.findings, summary: measured.summary }]);
  assert.equal(Object.hasOwn(repair, 'packets'), false);
  assert.equal(Object.hasOwn(repair, 'captures'), false);
  const images = packet.evidence.renders.filter(
    (render: { role: string }) => render.role === 'first-party-measured-repair');
  assert.deepEqual(images.map((image: { captureSha256: string }) => image.captureSha256).sort(),
    [...new Set(measured.captures.map(capture => capture.capture.sha256))].sort());
  for (const image of images) {
    assert.deepEqual(Buffer.from(image.pngBase64, 'base64'), readFileSync(join(f.root, image.path)));
  }
  assert.deepEqual(readFileSync(join(f.root, '.omd/slop/latest.json')), before);

  const checkpointBytes = readFileSync(join(f.root, checkpoint.checkpoint.path));
  write(f.root, checkpoint.checkpoint.path, Buffer.concat([checkpointBytes, Buffer.from(' ')]));
  assert.throws(() => prepareNativeMaker(f), /measured slop bytes changed/);
  assert.deepEqual(readFileSync(join(f.root, '.omd/slop/latest.json')), before);
  write(f.root, checkpoint.checkpoint.path, checkpointBytes);

  const [capture] = measured.captures;
  assert.ok(capture);
  const captureBytes = readFileSync(join(f.root, capture.capture.path));
  write(f.root, capture.capture.path, Buffer.concat([captureBytes, Buffer.from(' ')]));
  assert.throws(() => prepareNativeMaker(f), /changed|drift/i);
  assert.deepEqual(readFileSync(join(f.root, '.omd/slop/latest.json')), before);
  write(f.root, capture.capture.path, captureBytes);

  write(f.root, 'src/copy/confirmation.ts', 'export const confirmation = "changed";');
  assert.throws(() => prepareNativeMaker(f), /source changed/);
  assert.deepEqual(readFileSync(join(f.root, '.omd/slop/latest.json')), before);
});

test('native Hand repair fits the broker limit without embedding large raw metric matrices', async t => {
  const f = fixture(t);
  const assets = join(repo, 'test/fixtures/visual-measurement');
  const entry = 'src/copy/final.html';
  const original = readFileSync(join(assets, 'test-016-like.html'), 'utf8');
  const records = Array.from({ length: 850 }, (_, index) =>
    `<p style="margin:2px;padding:2px;font-size:14px">Record ${index}: inspect this local work item.</p>`).join('');
  write(f.root, entry, original.replace('</main>', `${records}</main>`));
  cpSync(join(assets, 'assets'), join(f.root, 'src/copy/assets'), { recursive: true });
  for (const name of ['type-proof', 'composition']) {
    write(f.root, `.omd/${name}.md`, readFileSync(join(assets, `test-016-${name}.md`)));
  }
  const measurement = await measureProject({ root: f.root, writer: f.writer, invocation: f.invocation, entry,
    scope: { schema: 'visual-measurement-scope-v1', views: Array.from({ length: 20 }, (_, index) => ({
      id: `repair-state-${index}`, viewport: { width: 1280, height: 900 }, browserZoom: 1,
    })) } });
  const originalPacket = readFileSync(join(f.root, measurement.packet.path));
  assert.ok(originalPacket.byteLength > MAX_BROKERED_EVIDENCE_BYTES,
    `the real measured producer must exceed the transport limit: ${originalPacket.byteLength}`);
  const checkpoint = captureMeasuredSlopCheckpoint(f.root,
    { schema: 'slop-measured-scope-v2', measurements: [measurement.packet] }, f.writer, f.invocation);
  const prepared = prepareNativeMaker(f);
  assert.ok(prepared.packet.byteLength <= MAX_BROKERED_EVIDENCE_BYTES,
    `the complete maker packet must fit: ${prepared.packet.byteLength}`);
  const packet = JSON.parse(prepared.packet.toString('utf8'));
  const repair = packet.evidence.evaluatorLineage.find((item: { kind: string }) => item.kind === 'measured-slop');
  assert.deepEqual(repair.findings, checkpoint.findings);
  assert.deepEqual(repair.unresolved, checkpoint.findings);
  const measured = loadMeasurement(f.root, measurement.packet);
  assert.deepEqual(repair.measurementEvidence, [{ receipt: measurement.packet,
    scope: measured.scope, subjects: measured.subjects, findings: measured.findings, summary: measured.summary }]);
  assert.deepEqual(repair.views.map((view: { id: string }) => view.id).sort(),
    measured.captures.map(capture => capture.viewId).sort());
  const images = packet.evidence.renders.filter((render: { role: string }) => render.role === 'first-party-measured-repair');
  assert.deepEqual(images.map((image: { captureSha256: string }) => image.captureSha256).sort(),
    [...new Set(measured.captures.map(capture => capture.capture.sha256))].sort());
  for (const image of images) {
    assert.deepEqual(Buffer.from(image.pngBase64, 'base64'), readFileSync(join(f.root, image.path)));
  }
  assert.deepEqual(readFileSync(join(f.root, measurement.packet.path)), originalPacket);
  console.log(`measured repair bytes: original=${originalPacket.byteLength}, maker=${prepared.packet.byteLength}`);
});
