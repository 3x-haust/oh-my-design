import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { MeasurementIndex, AXIS_METRICS } from '../core/measure/citations.ts';
import { assertMeasuredDesignQualityGreen, MEASURED_DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-measured-quality.ts';
import { measurementFixture } from './helpers/visual-measurement.ts';

const icon = '<svg width="48" height="48" viewBox="0 0 48 48" role="button" tabindex="0" aria-label="시간"><circle cx="24" cy="24" r="18" fill="none" stroke="#17211e" stroke-width="2"/></svg>';

test('SVG pixel limitations reach integrated review without claiming selected paint or target proof', async t => {
  for (const kind of ['ordinary', 'contrast', 'target', 'canvas', 'transformed'] as const) {
    await t.test(kind, async t => {
      const fixture = measurementFixture('clean');
      t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
      const media = kind === 'canvas' ? '<canvas width="48" height="48"></canvas>'
        : kind === 'transformed' ? icon.replace('<svg ', '<svg style="transform:translateX(1px)" ') : icon;
      const html = fixture.html.toString().replace('<h1>', `${media}<h1>`);
      writeFileSync(join(fixture.root, 'src/index.html'), html);
      writeFileSync(join(fixture.root, 'dist/index.html'), html);
      if (kind === 'contrast' || kind === 'target') {
        const path = join(fixture.root, '.omd/composition.md');
        const text = readFileSync(path, 'utf8');
        const match = /```json\n([\s\S]*?)\n```/.exec(text);
        assert.ok(match);
        const contract = JSON.parse(match[1]!);
        if (kind === 'contrast') contract.colors.push({
          role: 'icon', selector: 'svg', property: 'background',
          value: '#FFFFFF', token: null, contrastKind: 'non-text',
        });
        else contract.regions.push({
          selector: 'svg', role: 'utility', minimumVisible: 1, minimumTargetPx: 24,
        });
        writeFileSync(path, text.replace(match[1]!, JSON.stringify(contract)));
      }
      const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
      const packet = loadMeasurement(fixture.root, result.packet);
      assert.equal(readFileSync(join(fixture.root, 'dist/index.html'), 'utf8'), html);
      assert.ok(!packet.findings.some(f => f.expected?.field === 'contracts'), JSON.stringify(packet.findings));
      if (kind !== 'ordinary') {
        assert.equal(packet.summary.deterministicVerdict, 'RED');
        const code = kind === 'target' ? 'CONTRACT_UNMEASURABLE' : 'MEASUREMENT_INCOMPLETE';
        assert.ok(packet.findings.some(f => f.code === code && f.severity === 'blocking'), JSON.stringify(packet.findings));
        return;
      }
      assert.equal(packet.summary.deterministicVerdict, 'PASS', JSON.stringify(packet.findings));
      const limitations = packet.findings.filter(f => f.code === 'MEASUREMENT_INCOMPLETE');
      assert.ok(limitations.length > 0);
      assert.ok(limitations.every(f => f.severity === 'advisory' && f.subjectIds.length > 0));
      assert.ok(packet.measurements.every(m => m.coverage.status === 'complete'));
      const quality = {
        schema: 'design-quality-contract-v2',
        axes: MEASURED_DESIGN_QUALITY_AXES.map(axis => ({
          axis, verdict: 'GREEN', score: 4, crossViewport: 'preserved', criticalFailure: null,
          evidence: packet.scope.map(view => ({
            observationSha256: 'a'.repeat(64),
            captureSha256: packet.captures.find(c => c.viewId === view.id)!.capture.sha256,
            viewId: view.id, state: view.state, regionSubjectIds: [], packetSha256: result.packet.sha256,
            measurementIds: packet.measurements.filter(m => m.viewIds.includes(view.id)
              && (AXIS_METRICS[axis] as readonly string[]).includes(m.kind)).map(m => m.id),
            visibleCondition: 'The authenticated whole capture includes the SVG icon.',
            userConsequence: 'Independent review must judge its unmeasured internal paint.',
          })),
        })),
      };
      const context = {
        index: new MeasurementIndex(fixture.root, [result.packet]),
        requiredViewIds: packet.scope.map(v => v.id), policySha256: 'b'.repeat(64),
        advisoryDispositionIds: [], advisoryDispositionPolicy: 'integrated-final-review' as const,
        bindings: packet.scope.map(v => ({
          observationSha256: 'a'.repeat(64),
          captureSha256: packet.captures.find(c => c.viewId === v.id)!.capture.sha256,
          packetSha256: result.packet.sha256, viewId: v.id, state: v.state, browserZoom: v.browserZoom,
        })),
      };
      assert.equal(assertMeasuredDesignQualityGreen(quality, context).axes.length, 11);
      const low = structuredClone(quality);
      low.axes.find(a => a.axis === 'beautyDesirability')!.score = 2;
      assert.throws(() => assertMeasuredDesignQualityGreen(low, context), /DESIGN_QUALITY_AXIS_RED/);
      assert.throws(() => assertMeasuredDesignQualityGreen(quality, {
        ...context, advisoryDispositionPolicy: 'separate-slop-review',
      }), /validated scoped disposition/);
    });
  }
});
