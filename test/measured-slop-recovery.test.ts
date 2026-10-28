import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { measureProject } from '../core/measure/index.ts';
import { assertVerifiedPacket, loadMeasurement } from '../core/measure/files.ts';
import { MeasurementIndex } from '../core/measure/citations.ts';
import {
  captureMeasuredSlopCheckpoint, checkMeasuredSlopReview,
  measuredSlopReviewInput, publishMeasuredSlopReview,
} from '../core/slop/measured-review.ts';

test('unreviewed measured findings survive repair and require current resolution without historical approval', async t => {
  const f = measurementFixture('clean');
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const html = f.html.toString().replace('</ul>',
    '<li>Proof of identity</li><li>Employment record</li><li>Household statement</li>'
    + '<li>Current address</li><li>Income history</li><li>Supporting documents</li></ul>');
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(f.root, path), html);
  const source = join(f.root, 'src/heading.html');
  writeFileSync(source, '<h1>Build work that<br>people remember</h1>');
  const before = await measureProject({ ...f, entry: 'dist/index.html' });
  const a = captureMeasuredSlopCheckpoint(f.root,
    { schema: 'slop-measured-scope-v2', measurements: [before.packet] }, f.writer, f.invocation);
  assert.equal(a.findings.length, 1, JSON.stringify(a.findings));
  const pointerPath = join(f.root, '.omd/slop/latest.json');
  const pointerA = readFileSync(pointerPath);
  assert.throws(() => captureMeasuredSlopCheckpoint(f.root,
    { schema: 'slop-measured-scope-v2', measurements: [before.packet] }, f.writer, f.invocation), /fresh|triage/);
  assert.deepEqual(readFileSync(pointerPath), pointerA);
  const packetA = loadMeasurement(f.root, before.packet);
  const retained = [a.checkpoint.path, before.packet.path,
    ...packetA.captures.flatMap(c => [c.capture.path, c.ir.path])];
  const snapshots = retained.map(path => ({ path, bytes: readFileSync(join(f.root, path)) }));

  writeFileSync(source, '<h1>Build work that people remember</h1>');
  const repairedHtml = html.replace('Prepare your application', 'Review your application');
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(f.root, path), repairedHtml);
  assert.throws(() => loadMeasurement(f.root, before.packet), /source changed/);
  assert.throws(() => new MeasurementIndex(f.root, [before.packet]), /source changed/);
  const typePath = join(f.root, '.omd/type-proof.md');
  const typeBytes = readFileSync(typePath);
  writeFileSync(typePath, 'Invalid current owner contract');
  const historical = loadMeasurement(f.root, before.packet, { current: false });
  assert.deepEqual(historical.captures, packetA.captures);
  assert.throws(() => assertVerifiedPacket(historical), /natively verified/);
  writeFileSync(typePath, typeBytes);
  const after = await measureProject({ ...f, entry: 'dist/index.html' });
  const scope = { schema: 'slop-measured-scope-v2', measurements: [after.packet] };

  for (const snapshot of snapshots) {
    writeFileSync(join(f.root, snapshot.path), Buffer.concat([snapshot.bytes, Buffer.from(' ')]));
    assert.throws(() => captureMeasuredSlopCheckpoint(f.root, scope, f.writer, f.invocation),
      /changed|mismatch|invalid/i);
    assert.deepEqual(readFileSync(pointerPath), pointerA);
    writeFileSync(join(f.root, snapshot.path), snapshot.bytes);
  }
  assert.throws(() => captureMeasuredSlopCheckpoint(f.root, scope, { ...f.writer }, f.invocation),
    /writer|adapter|invocation/i);
  assert.deepEqual(readFileSync(pointerPath), pointerA);
  const widened = await measureProject({ ...f, entry: 'dist/index.html',
    scope: { schema: 'visual-measurement-scope-v1', views: [{
      id: 'extra-desktop', viewport: { width: 1280, height: 900 }, browserZoom: 1,
    }] } });
  assert.throws(() => captureMeasuredSlopCheckpoint(f.root,
    { ...scope, measurements: [widened.packet] }, f.writer, f.invocation), /scope changed/);
  assert.deepEqual(readFileSync(pointerPath), pointerA);

  const b = captureMeasuredSlopCheckpoint(f.root, scope, f.writer, f.invocation);
  const storedB = JSON.parse(readFileSync(join(f.root, b.checkpoint.path), 'utf8'));
  assert.deepEqual(storedB.parent, { checkpoint: a.checkpoint, review: null });
  assert.deepEqual(b.reviewInput.resolved.map(r => r.id), a.findings.map(r => r.id));
  assert.throws(() => checkMeasuredSlopReview(f.root), /has no review/);

  writeFileSync(source, '<h1>Build work that people remember</h1>\n');
  const finalMeasurement = await measureProject({ ...f, entry: 'dist/index.html' });
  const c = captureMeasuredSlopCheckpoint(f.root,
    { ...scope, measurements: [finalMeasurement.packet] }, f.writer, f.invocation);
  const pointerC = readFileSync(pointerPath);
  assert.deepEqual(c.reviewInput.resolved.map(r => r.id), a.findings.map(r => r.id));
  const page = measuredSlopReviewInput(f.root, c.checkpoint.sha256);
  assert.deepEqual(page.reviewInput.resolved, c.reviewInput.resolved);
  const current = loadMeasurement(f.root, finalMeasurement.packet);
  assert.notEqual(current.captures[0]!.capture.sha256, packetA.captures[0]!.capture.sha256);
  const refs = current.measurements.filter(m => m.coverage.status === 'complete'
    && ['line-lengths', 'type-ladder'].includes(m.kind))
    .map(m => ({ packetSha256: finalMeasurement.packet.sha256, measurementId: m.id }));
  const review = {
    ...c.reviewInput, summary: 'The current native views show the repaired complete heading.',
    resolved: c.reviewInput.resolved.map(r => ({
      ...r, reason: 'The source no longer fixes the heading break, and current native views retain the heading.',
      measurementRefs: refs,
    })),
  };
  assert.throws(() => publishMeasuredSlopReview(f.root, { ...review, resolved: [] },
    f.writer, f.invocation), /outstanding/);
  assert.deepEqual(readFileSync(pointerPath), pointerC);
  const oldCitations = {
    ...review, resolved: review.resolved.map(r => ({
      ...r, measurementRefs: refs.map(ref => ({ ...ref, packetSha256: before.packet.sha256 })),
    })),
  };
  assert.throws(() => publishMeasuredSlopReview(f.root, oldCitations,
    f.writer, f.invocation), /unknown native packet/);
  assert.deepEqual(readFileSync(pointerPath), pointerC);
  publishMeasuredSlopReview(f.root, review, f.writer, f.invocation);
  assert.equal(checkMeasuredSlopReview(f.root).rounds, 3);
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, b.checkpoint.path), 'utf8')).parent,
    { checkpoint: a.checkpoint, review: null });
  for (const snapshot of snapshots) {
    assert.deepEqual(readFileSync(join(f.root, snapshot.path)), snapshot.bytes);
  }
  const image = packetA.captures[0]!.capture.path;
  const imageBytes = readFileSync(join(f.root, image));
  writeFileSync(join(f.root, image), Buffer.concat([imageBytes, Buffer.from(' ')]));
  assert.throws(() => checkMeasuredSlopReview(f.root), /capture\/IR changed/);
});
