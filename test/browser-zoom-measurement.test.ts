import assert from 'node:assert/strict';
import test from 'node:test';
import { rmSync } from 'node:fs';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { measurementFixture } from './helpers/visual-measurement.ts';
test('claimed 200% uses real layout zoom or an explicit blocking ZOOM_UNSUPPORTED packet', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const result = await measureProject({ ...fixture, entry: 'dist/index.html', scope: { schema: 'visual-measurement-scope-v1', views: [{ id: 'desktop-1280x900@2', viewport: { width: 1280, height: 900 }, browserZoom: 2 }] } });
  const packet = loadMeasurement(fixture.root, result.packet), zoom = packet.captures.find(c => c.viewId === 'desktop-1280x900@2');
  if (zoom) {
    assert.ok(Math.abs(zoom.observedViewport.innerWidth - 640) <= 1);
    assert.equal(zoom.observedViewport.visualViewportScale, 1); assert.equal(zoom.observedViewport.devicePixelRatio, 2);
    assert.equal(packet.summary.deterministicVerdict, 'PASS', JSON.stringify(packet.findings));
    t.diagnostic('Chromium automatic per-tab 200% layout zoom verified');
  } else {
    assert.equal(packet.summary.deterministicVerdict, 'RED'); assert.equal(result.completionEligible, false);
    assert.ok(packet.findings.some(f => f.code === 'ZOOM_UNSUPPORTED'));
    assert.ok(result.coverage.unsupported.length > 0);
    t.diagnostic(result.coverage.unsupported.join('; '));
  }
});
