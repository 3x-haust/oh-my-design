import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { extractMeasurementInPage } from '../core/measure/dom.ts';
import { measurementFixture } from './helpers/visual-measurement.ts';

const nativeControls = '<input aria-label="검색" placeholder="글 검색"><select aria-label="정렬"><option>최신순</option></select><textarea aria-label="메모">원래 메모</textarea>';

test('native form pixels are scoped limitations while unsupported paint and selected text stay refused', async t => {
  for (const kind of ['ordinary', 'chevron', 'transformed', 'selected-text', 'selected-type', 'selected-target'] as const) {
    await t.test(kind, async t => {
      const fixture = measurementFixture('clean');
      t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
      const controls = kind === 'transformed'
        ? nativeControls.replace('<input ', '<input style="transform:rotate(1deg)" ')
        : kind === 'chevron' ? nativeControls.replace('<select ', '<select style="appearance:none;padding-right:32px;background:#fff url(&quot;data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27%3E%3Cpath d=%27M1 1l5 5 5-5%27 stroke=%27%23555%27 fill=%27none%27/%3E%3C/svg%3E&quot;) no-repeat right 12px center" ')
        : kind === 'selected-target' ? nativeControls.replace('<input ', '<input style="width:12px;height:12px;padding:0" ') : nativeControls;
      const html = fixture.html.toString().replace('<h1>', `${controls}<h1>`);
      for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
      if (kind === 'selected-text') {
        const path = join(fixture.root, '.omd/composition.md'), text = readFileSync(path, 'utf8');
        const match = /```json\n([\s\S]*?)\n```/.exec(text);
        assert.ok(match);
        const contract = JSON.parse(match[1]!);
        contract.colors.push({ role: 'input-text', selector: 'input', property: 'text', value: '#17211E', token: null });
        writeFileSync(path, text.replace(match[1]!, JSON.stringify(contract)));
      }
      if (kind === 'selected-type' || kind === 'selected-target') {
        const path = join(fixture.root, `.omd/${kind === 'selected-type' ? 'type-proof' : 'composition'}.md`);
        const text = readFileSync(path, 'utf8'), match = /```json\n([\s\S]*?)\n```/.exec(text);
        assert.ok(match);
        const contract = JSON.parse(match[1]!);
        if (kind === 'selected-type') contract.assignments.push({ selector: 'input', role: contract.defaultTextRole });
        else contract.regions.push({ selector: 'input', role: 'utility', minimumVisible: 1, minimumTargetPx: 44 });
        writeFileSync(path, text.replace(match[1]!, JSON.stringify(contract)));
      }
      const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
      const packet = loadMeasurement(fixture.root, result.packet);
      assert.equal(readFileSync(join(fixture.root, 'dist/index.html'), 'utf8'), html);
      if (kind !== 'ordinary' && kind !== 'chevron') {
        assert.equal(packet.summary.deterministicVerdict, 'RED');
        const code = kind === 'selected-text' || kind === 'selected-type' ? 'CONTRACT_UNMEASURABLE'
          : kind === 'selected-target' ? 'REQUIRED_TARGET_TOO_SMALL' : 'MEASUREMENT_INCOMPLETE';
        assert.ok(packet.findings.some(f => f.severity === 'blocking' && f.code === code), JSON.stringify(packet.findings));
        return;
      }
      assert.equal(packet.summary.deterministicVerdict, 'PASS', JSON.stringify(packet.findings));
      const controlIds = new Set(packet.subjects.filter(s => s.role === 'control').map(s => s.id));
      const limitations = packet.findings.filter(f => f.code === 'MEASUREMENT_INCOMPLETE');
      assert.ok(limitations.some(f => f.subjectIds.some(id => controlIds.has(id))));
      assert.ok(limitations.every(f => f.severity === 'advisory' && f.subjectIds.length > 0));
      assert.ok(packet.measurements.every(m => m.coverage.status === 'complete'));
    });
  }
});

test('zero painted clip is not visible text but ordinary occlusion remains blocking', async t => {
  for (const kind of ['zero-clip', 'occluded'] as const) {
    await t.test(kind, async t => {
      const fixture = measurementFixture('clean');
      t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
      const hidden = kind === 'zero-clip'
        ? '<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">보조 접근성 레이블</span>'
        : '<div style="position:relative"><span>가려진 본문</span><div style="position:absolute;inset:0;background:white"></div></div>';
      const html = fixture.html.toString().replace('<h1>', `${hidden}<h1>`);
      for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
      const result = await measureProject({ ...fixture, entry: 'dist/index.html' });
      const packet = loadMeasurement(fixture.root, result.packet);
      if (kind === 'zero-clip') {
        assert.equal(packet.summary.deterministicVerdict, 'PASS', JSON.stringify(packet.findings));
        assert.ok(!packet.subjects.some(s => s.textExcerpt === '보조 접근성 레이블'));
      } else {
        assert.equal(packet.summary.deterministicVerdict, 'RED');
        assert.ok(packet.findings.some(f => f.severity === 'blocking' && f.code === 'MEASUREMENT_INCOMPLETE'));
      }
    });
  }
});

test('native fallback text does not consume painted glyph budget or change the live value', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const value = '기본 텍스트'.repeat(30);
  await page.setContent(`<textarea aria-label="메모">${value}</textarea>`);
  const dom = await page.evaluate(extractMeasurementInPage, { selectors: [], tokens: [], maxNodes: 100, maxGraphemes: 10 });
  assert.deepEqual(dom.excluded, []);
  assert.equal(await page.locator('textarea').inputValue(), value);
  assert.ok(dom.nodes.find(n => n.tag === 'textarea')?.unsupported.includes('native-control-text'));
});

test('text under a menu opened in an interaction state is a limitation; the same cover at rest still blocks', async t => {
  for (const kind of ['opened', 'at-rest'] as const) {
    await t.test(kind, async t => {
      const fixture = measurementFixture('clean');
      t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
      const menu = '<div style="position:relative"><button id="menu-toggle" aria-expanded="false" onclick="document.getElementById(\'menu\').hidden=false;this.setAttribute(\'aria-expanded\',\'true\')">메뉴</button>'
        + `<div id="menu" ${kind === 'opened' ? 'hidden ' : ''}style="position:absolute;top:24px;left:0;width:320px;height:120px;background:white;z-index:5">메뉴 항목</div>`
        + '<p>메뉴 아래 본문</p><p>두 번째 줄</p><p>세 번째 줄</p></div>';
      const html = fixture.html.toString().replace('<h1>', `${menu}<h1>`);
      for (const path of ['src/index.html', 'dist/index.html']) writeFileSync(join(fixture.root, path), html);
      const state = { name: 'menu-open', route: '/index.html', startRoute: '/index.html', actions: [{ kind: 'click', selector: '#menu-toggle' }], assertions: [{ selector: '#menu', state: 'visible' }] };
      const scope = kind === 'opened'
        ? { schema: 'visual-measurement-scope-v1', views: [{ id: 'desktop-1280x900@1:outcome-0123456789abcdef', viewport: { width: 1280, height: 900 }, browserZoom: 1, state }] }
        : undefined;
      const result = await measureProject({ ...fixture, entry: 'dist/index.html', ...(scope ? { scope } : {}) });
      const packet = loadMeasurement(fixture.root, result.packet);
      const covered = packet.findings.filter(f => f.code === 'MEASUREMENT_INCOMPLETE' && JSON.stringify(f.observed).includes('occluded-text'));
      if (kind === 'opened') {
        assert.equal(packet.summary.deterministicVerdict, 'PASS', JSON.stringify(packet.findings));
        assert.ok(covered.length > 0 && covered.every(f => f.severity === 'advisory' && f.viewIds.every(id => id.includes(':outcome-'))));
      } else {
        assert.equal(packet.summary.deterministicVerdict, 'RED');
        assert.ok(covered.some(f => f.severity === 'blocking'), JSON.stringify(packet.findings));
      }
    });
  }
});
