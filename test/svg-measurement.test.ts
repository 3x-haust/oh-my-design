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

test('a rotated decorative piece with no text is an advisory exclusion, not a blocking one', async t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const mark = '<span aria-hidden="true"><i style="display:inline-block;width:18px;height:22px;background:#2f4bff;transform:rotate(-12deg)"></i></span>';
  const html = fixture.html.toString().replace('<h1>', `${mark}<h1>`);
  writeFileSync(join(fixture.root, 'src/index.html'), html);
  writeFileSync(join(fixture.root, 'dist/index.html'), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  const incomplete = packet.findings.filter(f => f.code === 'MEASUREMENT_INCOMPLETE');
  assert.ok(incomplete.some(f => f.severity === 'advisory' && (f.observed?.value ?? '').includes('transformed-geometry')), JSON.stringify(incomplete));
  assert.ok(!incomplete.some(f => f.severity === 'blocking' && (f.observed?.value ?? '').includes('transformed-geometry')), JSON.stringify(incomplete));
});

test('text over a gradient is measured from rendered pixels: readable passes, washed-out fails', async t => {
  for (const [kind, style] of [
    ['readable', 'background:linear-gradient(135deg,#0b1a5c,#2f4bff);color:#ffffff'],
    ['washed', 'background:linear-gradient(135deg,#ffffff,#e9edff);color:#b9c1e6'],
  ] as const) {
    await t.test(kind, async t => {
      const fixture = measurementFixture('clean');
      t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
      const band = `<section style="${style};padding:40px"><p style="font-size:18px;margin:0">그라디언트 위의 본문 문장입니다</p></section>`;
      const html = fixture.html.toString().replace('<h1>', `${band}<h1>`);
      writeFileSync(join(fixture.root, 'src/index.html'), html);
      writeFileSync(join(fixture.root, 'dist/index.html'), html);
      const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
      const packet = loadMeasurement(fixture.root, result.packet);
      const blockingBackdrop = packet.findings.some(f => f.code === 'MEASUREMENT_INCOMPLETE' && f.severity === 'blocking'
        && (f.observed?.value ?? '').includes('"reason":"complex-backdrop"'));
      assert.equal(blockingBackdrop, false, JSON.stringify(packet.findings));
      const contrastFail = packet.findings.some(f => f.code === 'TEXT_CONTRAST_FAIL');
      assert.equal(contrastFail, kind === 'washed', JSON.stringify(packet.findings.map(f => f.code)));
    });
  }
});

test('a painted image that lets clicks through is still sampled for salience', async t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  // A 1x1 blue PNG scaled up: large, painted, and marked pointer-events:none like decorative art.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const html = fixture.html.toString().replace('<h1>', `<img class="art" alt="" src="${png}" style="display:block;width:320px;height:240px;pointer-events:none"><h1>`);
  writeFileSync(join(fixture.root, 'src/index.html'), html);
  writeFileSync(join(fixture.root, 'dist/index.html'), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  const unsampled = packet.findings.filter(f => (f.observed?.value ?? '').includes('media-salience-unsampled'));
  assert.deepEqual(unsampled.map(f => f.observed?.value), []);
});

test('text under the focused element is not unmeasured, text under an accidental overlay still is', async t => {
  for (const kind of ['focused-skip-link', 'stray-overlay'] as const) {
    await t.test(kind, async t => {
      const fixture = measurementFixture('clean');
      t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
      const cover = 'position:fixed;left:0;top:0;width:100%;height:100%;background:#fff;color:#111;font-size:18px;z-index:9';
      const layer = kind === 'focused-skip-link'
        ? `<a class="skip" href="#main" style="${cover}">본문으로 건너뛰기</a><script>document.querySelector('.skip').focus()</script>`
        : `<div style="${cover}">겹친 상자</div>`;
      const html = fixture.html.toString().replace('<h1>', `${layer}<h1>`);
      writeFileSync(join(fixture.root, 'src/index.html'), html);
      writeFileSync(join(fixture.root, 'dist/index.html'), html);
      const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
      const packet = loadMeasurement(fixture.root, result.packet);
      const occluded = packet.findings.some(f => f.code === 'MEASUREMENT_INCOMPLETE' && f.severity === 'blocking'
        && (f.observed?.value ?? '').includes('occluded-text'));
      assert.equal(occluded, kind === 'stray-overlay', JSON.stringify(packet.findings.map(f => [f.code, f.severity, f.observed?.value?.slice(0, 80)])));
    });
  }
});

test('SVG pixel limitations reach integrated review without claiming selected paint or target proof', async t => {
  for (const kind of ['ordinary', 'contrast', 'target', 'canvas', 'transformed'] as const) {
    await t.test(kind, async t => {
      const fixture = measurementFixture('clean');
      t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
      const media = kind === 'canvas' ? '<canvas width="48" height="48"></canvas>'
        : kind === 'transformed' ? icon.replace('<svg ', '<svg style="transform:rotate(1deg)" ') : icon;
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

test('an image cut by the viewport edge to a sliver is noted, not left blocking as unmeasured', async t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  // A footer logo whose top 3px peek above the fold, as in a real first capture.
  const html = fixture.html.toString().replace('<h1>', `<img class="logo" alt="" src="${png}" style="position:absolute;left:60px;top:calc(100vh - 3px);width:32px;height:32px"><h1>`);
  writeFileSync(join(fixture.root, 'src/index.html'), html);
  writeFileSync(join(fixture.root, 'dist/index.html'), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  const blocking = packet.findings.filter(f => f.severity === 'blocking' && (f.observed?.value ?? '').includes('media-salience-unsampled'));
  assert.deepEqual(blocking, []);
  assert.ok(packet.measurements.every(m => !m.coverage.excluded.some(e => e.reason === 'media-salience-unsampled')));
});

test('an arrow icon inside a link on a textured page is an SVG note, while text on that texture is still measured', async t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  // A grain or gradient on the page sits behind everything; an icon has no text to read against it.
  const arrow = '<a href="#start" style="color:#17211e">시작하기 <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h12M10 4l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></a>';
  const html = fixture.html.toString().replace('<h1>', `<div style="background-image:linear-gradient(#f5f3ed,#efece4)">${arrow}</div><h1>`);
  writeFileSync(join(fixture.root, 'src/index.html'), html);
  writeFileSync(join(fixture.root, 'dist/index.html'), html);
  const packet = loadMeasurement(fixture.root, (await measureProject({ ...fixture, entry: 'dist/index.html' })).packet);
  const incomplete = packet.findings.filter(f => f.code === 'MEASUREMENT_INCOMPLETE');
  assert.ok(!incomplete.some(f => f.severity === 'blocking' && (f.observed?.value ?? '').includes('opaque-content')), JSON.stringify(incomplete));
  assert.ok(incomplete.some(f => f.severity === 'advisory' && /SVG internal paint/.test(String(f.observed?.value ?? ''))), JSON.stringify(incomplete));
});

test('a logo fully covered by a skip link shown on focus is noted as covered, not left blocking as unmeasured', async t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  // The skip link a keyboard user sees first sits over the header logo in that state.
  const html = fixture.html.toString().replace('<h1>', `<img alt="" src="${png}" style="position:absolute;left:40px;top:20px;width:38px;height:38px">`
    + '<a href="#main" style="position:absolute;left:16px;top:12px;width:160px;height:52px;background:#111;color:#fff;z-index:5">본문으로 건너뛰기</a><h1>');
  writeFileSync(join(fixture.root, 'src/index.html'), html);
  writeFileSync(join(fixture.root, 'dist/index.html'), html);
  const packet = loadMeasurement(fixture.root, (await measureProject({ ...fixture, entry: 'dist/index.html' })).packet);
  assert.ok(packet.measurements.every(m => !m.coverage.excluded.some(e => e.reason === 'media-salience-unsampled')), 'a covered image is not a coverage gap');
  assert.ok(packet.findings.some(f => f.severity === 'advisory' && /fully covered by another drawn element/.test(f.basis + String(f.observed?.value ?? ''))),
    JSON.stringify(packet.findings.filter(f => f.code === 'MEASUREMENT_INCOMPLETE').map(f => [f.severity, String(f.observed?.value ?? '').slice(0, 80)])));
});

test('a logo image in a header with a blurred translucent ground is sampled against its rendered surroundings', async t => {
  const fixture = measurementFixture('clean');
  t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const header = `<header style="background:rgba(245,243,237,.9);backdrop-filter:blur(12px);padding:12px"><img alt="Oh My Design" src="${png}" style="width:36px;height:36px;display:block"></header>`;
  const html = fixture.html.toString().replace('<h1>', `${header}<h1>`);
  writeFileSync(join(fixture.root, 'src/index.html'), html);
  writeFileSync(join(fixture.root, 'dist/index.html'), html);
  const packet = loadMeasurement(fixture.root, (await measureProject({ ...fixture, entry: 'dist/index.html' })).packet);
  assert.ok(packet.measurements.every(m => !m.coverage.excluded.some(e => e.reason === 'media-salience-unsampled')),
    JSON.stringify(packet.measurements.flatMap(m => m.coverage.excluded).filter(e => e.reason.includes('media'))));
});
