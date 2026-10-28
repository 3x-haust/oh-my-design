import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { measureProject } from '../core/measure/index.ts';
import { serveProjectEntry } from '../core/render/serve.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { parseVisualMeasurement, parseMeasureScope } from '../core/measure/schema.ts';
import { canonicalBytes, digest, sha256 } from '../core/measure/identity.ts';
import { contrastThreshold, contrastRatio, composite } from '../core/measure/color.ts';
import { unionArea } from '../core/measure/geometry.ts';
import { MeasurementIndex, AXIS_METRICS, validateSlopMeasurementDecision } from '../core/measure/citations.ts';
import { assertMeasuredDesignQualityGreen, MEASURED_DESIGN_QUALITY_AXES, type MeasuredQualityContext } from '../core/evidence/final-v2-measured-quality.ts';
import { deriveReviewPolicy, assertReviewQuorum } from '../core/measure/review-policy.ts';
import type { AdaptiveRouteRecord } from '../core/route/adaptive-flow-domain.ts';
import type { Measurement, VisualMeasurement } from '../core/measure/types.ts';
import { measurementFixture } from './helpers/visual-measurement.ts';
const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
function quality(packet: VisualMeasurement, sha: string) {
  return { schema: 'design-quality-contract-v2', axes: MEASURED_DESIGN_QUALITY_AXES.map(axis => ({ axis, verdict: 'GREEN', score: 4, crossViewport: 'preserved', criticalFailure: null,
    evidence: packet.scope.map(view => ({ observationSha256: 'a'.repeat(64), captureSha256: packet.captures.find(c => c.viewId === view.id)!.capture.sha256, viewId: view.id, state: view.state, regionSubjectIds: [], packetSha256: sha, measurementIds: packet.measurements.filter(m => m.viewIds.includes(view.id) && (AXIS_METRICS[axis] as readonly string[]).includes(m.kind)).map(m => m.id), visibleCondition: 'The measured content and controls were inspected.', userConsequence: 'Task context remains available.' })) })) };
}
function context(root: string, packet: VisualMeasurement, receipt: { path: string; sha256: string }): MeasuredQualityContext {
  return { index: new MeasurementIndex(root, [receipt]), requiredViewIds: packet.scope.map(v => v.id), policySha256: 'b'.repeat(64), advisoryDispositionIds: [], advisoryDispositionPolicy: 'separate-slop-review', bindings: packet.scope.map(v => ({ observationSha256: 'a'.repeat(64), captureSha256: packet.captures.find(c => c.viewId === v.id)!.capture.sha256, packetSha256: receipt.sha256, viewId: v.id, state: v.state, browserZoom: v.browserZoom })) };
}
test('test-016 replay is natively RED and all-4 reviews/generic slop dismissals cannot override it', async t => {
  const fixture = measurementFixture('test-016'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' }), packet = loadMeasurement(fixture.root, result.packet);
  assert.equal(result.summary.deterministicVerdict, 'RED');
  for (const code of ['TYPE_ROLE_SIZE_MISMATCH', 'TYPE_ROLE_FAMILY_MISMATCH', 'COLOR_ROLE_MISMATCH', 'TEXT_CONTRAST_FAIL', 'REQUIRED_CONTROL_WORD_SPLIT']) assert.ok(packet.findings.some(f => f.code === code), code);
  assert.ok(packet.measurements.some(m => m.kind === 'type-ladder' && m.value.clusters.some(c => c.minSize === 10)));
  assert.ok(packet.measurements.some(m => m.kind === 'text-minimum' && m.value.small.some(c => c.size === 11)));
  assert.ok(packet.measurements.filter(m => m.kind === 'canvas-color').every(m => !m.value.isTrueWhite));
  assert.ok(packet.scope.some(v => v.viewport.width === 320));
  const before = readFileSync(join(fixture.root, '.omd/visual-measurement.json'));
  assert.throws(() => assertMeasuredDesignQualityGreen(quality(packet, result.packet.sha256), context(fixture.root, packet, result.packet)), /RED/);
  const finding = { id: 'small', viewIds: [packet.scope[0]!.id], subjectIds: [], kinds: ['text-minimum' as const], blocking: false, behavioral: false };
  assert.throws(() => validateSlopMeasurementDecision({ id: 'small', status: 'dismissed', reason: 'Recorded for owner repair', viewIds: finding.viewIds, measurementRefs: [], disposition: 'repair-required', contractEvidenceRefs: [] }, new MeasurementIndex(fixture.root, [result.packet]), finding, { absent: () => false, exceptionApplies: () => false, behavioralOutcomeVerified: false }), /cannot close/);
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/visual-measurement.json')), before);
  assert.deepEqual(readFileSync(join(fixture.root, 'src/index.html')), fixture.html);
  const command = spawnSync(process.execPath, [cli, 'measure', '--entry', 'dist/index.html', '--json'], { cwd: fixture.root, encoding: 'utf8' });
  assert.equal(command.status, 1, command.stderr); assert.equal(JSON.parse(command.stdout).summary.deterministicVerdict, 'RED');
});
test('clean true-white product has complete native metrics, strict citations, replay and CLI success', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' }), packet = loadMeasurement(fixture.root, result.packet);
  assert.equal(result.summary.deterministicVerdict, 'PASS', JSON.stringify(packet.findings)); assert.equal(result.completionEligible, true);
  assert.equal(result.coverage.captured, 3);
  assert.ok(packet.measurements.filter(m => m.kind === 'text-minimum').every(m => m.value.under12 === 0));
  assert.ok(packet.measurements.filter(m => m.kind === 'canvas-color').every(m => m.value.isTrueWhite));
  assert.ok(packet.measurements.filter(m => m.kind === 'control-word-wrap').every(m => m.value.splitCount === 0));
  const ctx = context(fixture.root, packet, result.packet), green = quality(packet, result.packet.sha256);
  assert.equal(assertMeasuredDesignQualityGreen(green, ctx).axes.length, 11);
  const wrap = packet.measurements.find(m => m.kind === 'control-word-wrap')!;
  const finding = { id: 'control-wrap-question', viewIds: wrap.viewIds, subjectIds: [], kinds: ['control-word-wrap' as const], blocking: false, behavioral: false };
  const disposition = { id: finding.id, status: 'dismissed', reason: 'Native control token inventory has no internal splits.', viewIds: wrap.viewIds, measurementRefs: [{ packetSha256: result.packet.sha256, measurementId: wrap.id }], disposition: 'not-present-in-render', contractEvidenceRefs: [] };
  const absence = { absent: (m: Measurement) => m.kind === 'control-word-wrap' && m.value.splitCount === 0, exceptionApplies: () => false, behavioralOutcomeVerified: false };
  assert.equal(validateSlopMeasurementDecision(disposition, ctx.index, finding, absence).status, 'dismissed');
  assert.throws(() => validateSlopMeasurementDecision(disposition, ctx.index, { ...finding, behavioral: true }, absence), /behavioral/);
  const bad = structuredClone(green); bad.axes[0]!.evidence[0]!.measurementIds = [packet.measurements.find(m => m.kind === 'canvas-color')!.id];
  assert.throws(() => assertMeasuredDesignQualityGreen(bad, ctx), /unrelated/);
  // Each view must be cited by some axis; dropping a view from every axis leaves it unseen.
  const lastView = green.axes[0]!.evidence.at(-1)!.viewId;
  const unseen = structuredClone(green); for (const axis of unseen.axes) axis.evidence = axis.evidence.filter(row => row.viewId !== lastView);
  assert.throws(() => assertMeasuredDesignQualityGreen(unseen, ctx), /not cited by any axis/);
  const typography = green.axes.find(a => a.axis === 'typography')!, ladder = packet.measurements.find(m => m.kind === 'type-ladder')!;
  const thin = structuredClone(green); const thinAxis = thin.axes.find(a => a.axis === 'typography')!;
  for (const row of thinAxis.evidence) row.measurementIds = row.measurementIds.filter((id: string) => id !== ladder.id);
  assert.ok(typography.evidence.some(row => row.measurementIds.includes(ladder.id)));
  // The view is the reviewer's judgment; its other complete, passing inventories are taken from the native packet.
  assert.equal(assertMeasuredDesignQualityGreen(thin, ctx).axes.length, 11);
  const lower = structuredClone(green); lower.axes.find(a => a.axis === 'hierarchy')!.score = 3; assert.throws(() => assertMeasuredDesignQualityGreen(lower, ctx), /AXIS_RED/);
  const malformed = structuredClone(packet); Reflect.set(malformed.measurements[0]!.value, 'invented', 4); assert.throws(() => parseVisualMeasurement(malformed), /exact fields/);
  const duplicate = structuredClone(packet); duplicate.measurements.push(duplicate.measurements[0]!); assert.throws(() => parseVisualMeasurement(duplicate), /duplicate/);
  const numeric = structuredClone(packet); numeric.subjects[0]!.box.x = NaN; assert.throws(() => parseVisualMeasurement(numeric), /finite/);
  const raw = JSON.parse(readFileSync(join(fixture.root, packet.captures[0]!.ir.path), 'utf8'));
  assert.equal(raw.meta.frequentAction.status, 'matched'); assert.equal(raw.meta.frequentAction.contract.path, '.omd/composition.md');
  const stdout = execFileSync(process.execPath, [cli, 'measure', '--entry', 'dist/index.html', '--json'], { cwd: fixture.root, encoding: 'utf8' });
  const repeated = JSON.parse(stdout); assert.equal(repeated.summary.deterministicVerdict, 'PASS'); assert.equal(repeated.packet.sha256, result.packet.sha256, 'identical native retained inputs have stable packet ids');
  const pointer = readFileSync(join(fixture.root, '.omd/visual-measurement.json'));
  const forged = structuredClone(packet); forged.subjects[0]!.role = 'invented'; const bytes = canonicalBytes(forged), hash = sha256(bytes), path = `.omd/visual-measurements/sha256-${hash}.json`; writeFileSync(join(fixture.root, path), bytes);
  assert.throws(() => loadMeasurement(fixture.root, { path, sha256: hash }), /payload mismatch/);
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/visual-measurement.json')), pointer);
  writeFileSync(join(fixture.root, 'dist/index.html'), `${fixture.html}\n<!-- changed -->`);
  assert.throws(() => loadMeasurement(fixture.root, result.packet), /build changed/);
});
test('scope and writer boundary refuse replacement/import without changing project evidence', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  await assert.rejects(() => measureProject({ ...fixture, entry: 'dist/index.html', writer: { ...fixture.writer } }), /trusted immutable/);
  await assert.rejects(() => measureProject({ ...fixture, entry: '../outside.html' }), /contained/);
  await assert.rejects(() => measureProject({ ...fixture, entry: 'dist/index.html', scope: { schema: 'visual-measurement-scope-v1', views: [{ id: 'desktop-1280x900@1', viewport: { width: 320, height: 844 }, browserZoom: 1 }] } }), /cannot replace/);
  assert.throws(() => parseMeasureScope({ schema: 'visual-measurement-scope-v1', views: [], values: [] }), /exact fields/);
  assert.equal(existsSync(join(fixture.root, '.omd/visual-measurement.json')), false);
  assert.deepEqual(readFileSync(join(fixture.root, 'src/index.html')), fixture.html);
});
test('control tokens separate block labels but preserve words across inline descendants', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const html = `<!doctype html><html><head><style>
    button { display:block; width:280px; padding:0; border:0; margin:8px; font:16px/24px sans-serif; text-align:left }
    .block > span { display:block }
    .flex { display:flex; flex-direction:column }
    .split { width:16px; white-space:normal; word-break:break-all }
  </style></head><body>
    <button class="block"><span>답장을 보내지 않아요</span><span>윤도현</span></button>
    <button><span style="display:block"><em>답장을 보내지 않아요</em></span><span style="display:block"><em>윤도현</em></span></button>
    <button class="flex"><span>답장을 보내지 않아요</span><span>윤도현</span></button>
    <button class="split"><span>되돌</span><strong>리기</strong></button>
    <button class="split"><span style="display:inline-block">되돌</span><strong style="display:inline-block">리기</strong></button>
    <button class="split">저장하기</button>
    <button>저장<br>하기</button>
  </body></html>`;
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  for (const wrap of packet.measurements.filter(m => m.kind === 'control-word-wrap')) {
    const tokens = wrap.value.controls.flatMap(control => control.tokens);
    assert.equal(tokens.some(token => token.text === '않아요윤도현'), false);
    assert.equal(tokens.filter(token => token.text === '않아요' && !token.split).length, 3);
    assert.equal(tokens.filter(token => token.text === '윤도현' && !token.split).length, 3);
    assert.deepEqual(tokens.filter(token => token.split).map(token => token.text).sort(), ['되돌리기', '되돌리기', '저장하기', '저장하기']);
  }
  assert.ok(packet.findings.some(finding => finding.code === 'REQUIRED_CONTROL_WORD_SPLIT'));
  assert.equal(readFileSync(join(fixture.root, 'src/index.html'), 'utf8'), html);
  assert.equal(readFileSync(join(fixture.root, 'dist/index.html'), 'utf8'), html);
});
test('native clipped-control findings survive canonical IR persistence without laundering their RED verdict', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const html = fixture.html.toString('utf8').replace('</main>',
    '<div style="height:32px;overflow:hidden"><button style="height:64px" type="button">Clipped action</button></div></main>');
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  const clipped = packet.findings.find(finding => finding.code === 'REQUIRED_CONTROL_CLIPPED');
  assert.ok(clipped);
  assert.equal(clipped.severity, 'blocking');
  assert.equal(packet.summary.deterministicVerdict, 'RED');
  assert.equal(result.completionEligible, false);
  assert.ok(clipped.observed);
  assert.ok(JSON.parse(clipped.observed.value).some((value: { clipped: { scrollEscape: boolean }[] }) =>
    value.clipped.some(clip => !clip.scrollEscape)));
  const pointer = readFileSync(join(fixture.root, '.omd/visual-measurement.json'));
  const forged = structuredClone(packet);
  const forgedClipping = forged.findings.find(finding => finding.id === clipped.id);
  assert.ok(forgedClipping);
  assert.ok(forgedClipping.observed);
  forgedClipping.observed.value = '[]';
  const bytes = canonicalBytes(forged), hash = sha256(bytes), path = `.omd/visual-measurements/sha256-${hash}.json`;
  writeFileSync(join(fixture.root, path), bytes);
  assert.throws(() => loadMeasurement(fixture.root, { path, sha256: hash }), /payload mismatch/);
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/visual-measurement.json')), pointer);
  assert.equal(readFileSync(join(fixture.root, 'src/index.html'), 'utf8'), html);
  assert.equal(readFileSync(join(fixture.root, 'dist/index.html'), 'utf8'), html);
});
test('nested keyboard-scroll exposure clears only the false outer clipping verdict', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const buttons = Array.from({ length: 8 }, (_, index) =>
    `<button id="row-${index}" type="button" style="display:block;width:200px;height:44px">Row ${index}</button>`).join('');
  const html = `<!doctype html><html><body style="margin:20px"><div id="outer" style="width:200px;height:120px;overflow:hidden"><div id="inner" style="width:200px;height:120px;overflow:auto">${buttons}</div></div></body></html>`;
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);

  const served = await serveProjectEntry(fixture.root, 'dist/index.html');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(served.url, { waitUntil: 'load' });
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#row-0').evaluate(element => element === document.activeElement), true);
    await page.evaluate(() => {
      const inner = document.querySelector('#inner');
      if (!inner) throw new Error('Missing nested scroll fixture');
      Reflect.set(window, '__measurementScrollSignal', new Promise<number>((resolve, reject) => {
        const controller = new AbortController();
        const deadline = AbortSignal.timeout(3000);
        deadline.addEventListener('abort', () => {
          controller.abort();
          reject(new Error('Keyboard scroll event did not reach the last row'));
        }, { once: true, signal: controller.signal });
        inner.addEventListener('scroll', (event: Event) => {
          const target = event.currentTarget as HTMLElement;
          if (target.scrollTop !== target.scrollHeight - target.clientHeight) return;
          resolve(target.scrollTop);
          controller.abort();
        }, { signal: controller.signal });
      }));
    });
    for (let index = 0; index < 7; index++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Reflect.get(window, '__measurementScrollSignal') as Promise<number>), 232);
    assert.deepEqual(await page.locator('#row-7').evaluate(element => {
      const box = element.getBoundingClientRect();
      const inner = element.parentElement!.getBoundingClientRect();
      const outer = element.parentElement!.parentElement!.getBoundingClientRect();
      const visible = {
        x: Math.max(box.x, inner.x, outer.x),
        y: Math.max(box.y, inner.y, outer.y),
        right: Math.min(box.right, inner.right, outer.right),
        bottom: Math.min(box.bottom, inner.bottom, outer.bottom),
      };
      return {
        focused: element === document.activeElement,
        box: { x: box.x, y: box.y, w: box.width, h: box.height },
        visibleBox: { x: visible.x, y: visible.y, w: visible.right - visible.x, h: visible.bottom - visible.y },
      };
    }), {
      focused: true,
      box: { x: 20, y: 96, w: 200, h: 44 },
      visibleBox: { x: 20, y: 96, w: 200, h: 44 },
    });
  } finally {
    await browser.close();
    await served.close();
  }

  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  const raw = JSON.parse(readFileSync(join(fixture.root, packet.captures[0]!.ir.path), 'utf8'));
  const rowSeven = raw.measurement.nodes.find((node: { text: string }) => node.text === 'Row 7');
  assert.ok(rowSeven);
  assert.equal(rowSeven.visibleBox, null);
  assert.deepEqual(rowSeven.clipped.map((clip: { scrollEscape: boolean }) => clip.scrollEscape), [true, true]);
  assert.equal(packet.findings.some(finding => finding.code === 'REQUIRED_CONTROL_CLIPPED'), false);
  assert.equal(readFileSync(join(fixture.root, 'src/index.html'), 'utf8'), html);
  assert.equal(readFileSync(join(fixture.root, 'dist/index.html'), 'utf8'), html);
});
test('nested scroll recovery stays refused for intrinsic, oversized, transformed, sticky and horizontal clipping', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const rows = (prefix: string) => Array.from({ length: 8 }, (_, index) =>
    `<button type="button" style="display:block;width:200px;height:44px">${prefix} ${index}</button>`).join('');
  const html = `<!doctype html><html><body>
    <div style="width:200px;height:32px;overflow:hidden"><button type="button" style="width:200px;height:64px">Intrinsic hidden label</button></div>
    <div style="width:200px;height:120px;overflow:hidden"><div style="width:200px;height:120px;overflow:auto"><button type="button" style="width:200px;height:176px;padding:0"><span style="display:block;height:44px;line-height:44px">Oversized line 1</span><span style="display:block;height:44px;line-height:44px">Oversized line 2</span><span style="display:block;height:44px;line-height:44px">Oversized line 3</span><span style="display:block;height:44px;line-height:44px">Oversized line 4</span></button></div></div>
    <div style="width:200px;height:120px;overflow:hidden"><div style="width:200px;height:120px;overflow:auto;transform:translateZ(0)">${rows('Transformed row')}</div></div>
    <div style="width:200px;height:120px;overflow:hidden"><div style="width:200px;height:120px;overflow:auto"><div style="position:sticky">${rows('Sticky row')}</div></div></div>
    <div style="width:120px;height:44px;overflow:hidden"><div style="width:120px;height:44px;overflow:auto"><button type="button" style="display:block;width:300px;height:44px;white-space:nowrap">Horizontally clipped control label</button></div></div>
  </body></html>`;
  for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
  const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
  const packet = loadMeasurement(fixture.root, result.packet);
  const clipped = packet.findings.find(finding => finding.code === 'REQUIRED_CONTROL_CLIPPED');
  assert.ok(clipped);
  assert.equal(clipped.severity, 'blocking');
  assert.equal(packet.summary.deterministicVerdict, 'RED');
  const excerpts = clipped.subjectIds.map(subjectId =>
    packet.subjects.find(subject => subject.id === subjectId)?.textExcerpt ?? '');
  for (const expected of ['Intrinsic hidden label', 'Transformed row 7', 'Sticky row 7', 'Horizontally clipped control label']) {
    assert.ok(excerpts.some(excerpt => excerpt.includes(expected)), `${expected}: ${JSON.stringify(excerpts)}`);
  }
  const raw = JSON.parse(readFileSync(join(fixture.root, packet.captures[0]!.ir.path), 'utf8'));
  const oversized = raw.measurement.nodes.find((node: { interactive: boolean; box: { h: number } }) =>
    node.interactive && node.box.h === 176);
  assert.ok(oversized);
  assert.ok(clipped.subjectIds.includes(`${packet.captures[0]!.viewId}:${oversized.id}`));
  const pointer = readFileSync(join(fixture.root, '.omd/visual-measurement.json'));
  assert.doesNotThrow(() => loadMeasurement(fixture.root, result.packet));
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/visual-measurement.json')), pointer);
  assert.equal(readFileSync(join(fixture.root, 'src/index.html'), 'utf8'), html);
  assert.equal(readFileSync(join(fixture.root, 'dist/index.html'), 'utf8'), html);
});
test('existing localhost is diagnostic-only even when its pixels match the project build', async t => {
  const fixture = measurementFixture('clean'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const served = await serveProjectEntry(fixture.root, 'dist/index.html');
  try {
    const result = await measureProject({ ...fixture, entry: served.url });
    assert.equal(result.summary.deterministicVerdict, 'PASS'); assert.equal(result.completionEligible, false);
    const packet = loadMeasurement(fixture.root, result.packet, { native: false });
    assert.equal(packet.binding.authority, 'external-diagnostic'); assert.equal(packet.attestation.signature, null);
    assert.throws(() => loadMeasurement(fixture.root, result.packet), /diagnostic cannot authorize/);
    const raw = JSON.parse(readFileSync(join(fixture.root, packet.captures[0]!.ir.path), 'utf8'));
    assert.equal(raw.meta.externalProvenance.requestedUrl, served.url);
    assert.ok(raw.meta.externalProvenance.resourceUrls.includes(served.url));
  } finally { await served.close(); }
});
test('contrast exact large threshold, alpha compositing and rectangle union do not invent passes', () => {
  assert.equal(contrastThreshold(24, 400), 3); assert.equal(contrastThreshold(18.6666667, 700), 3); assert.equal(contrastThreshold(18.66, 700), 4.5); assert.equal(contrastThreshold(18, 400), 4.5);
  assert.deepEqual(composite([0, 0, 0, 0.5], [255, 255, 255, 1]), [127.5, 127.5, 127.5, 1]);
  assert.ok(contrastRatio([153, 153, 153, 1], [255, 255, 255, 1]) < 3);
  assert.equal(unionArea([{ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 2, w: 3, h: 3 }]), 100);
});
test('route risk derives quorum; un-migrated purpose never silently lowers it', () => {
  const base = { sourceContractSha256: 'b'.repeat(64), sourceContract: { designAxes: { failureRisk: 'low' }, reviewPurpose: 'ordinary' } };
  const policy = deriveReviewPolicy(base as unknown as AdaptiveRouteRecord, 'a'.repeat(64)); assert.deepEqual(policy.lanes, { blind: 1, fidelity: 0, protocol: 0 });
  const execution = { processPid: 1, sessionId: 'one', nonce: 'one', packetSha256: 'c'.repeat(64), reviewPolicySha256: digest(policy) };
  assert.doesNotThrow(() => assertReviewQuorum(policy, [{ lane: 'blind', executions: [execution] }]));
  const high = deriveReviewPolicy({ ...base, sourceContract: { ...base.sourceContract, designAxes: { failureRisk: 'high' } } } as unknown as AdaptiveRouteRecord, 'a'.repeat(64)); assert.deepEqual(high.lanes, { blind: 2, fidelity: 1, protocol: 0 });
  assert.throws(() => assertReviewQuorum(high, [{ lane: 'blind', executions: [execution] }]), /quorum/);
  const legacy = deriveReviewPolicy({ ...base, sourceContract: { designAxes: { failureRisk: 'low' } } } as unknown as AdaptiveRouteRecord, 'a'.repeat(64)); assert.deepEqual(legacy.lanes, { blind: 2, fidelity: 2, protocol: 2 });
});
