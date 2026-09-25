import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { decodePng } from '../core/motion/energy.ts';
import { capturePageForRef, withBrowser } from '../core/render/index.ts';
import { clearReferenceNotices, withReadOnlyNoticeNavigation } from '../core/ref/notice-overlay.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const content = (mode: 'notice' | 'consent' | 'unclosable') => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>복지 서비스</title>
  <style>body{margin:0;background:white;color:black;font:20px sans-serif}main{padding:40px}h1{margin:0}#backdrop{position:fixed;inset:0;background:rgba(0,0,0,.7)}
  [role=dialog]{position:fixed;left:35%;top:20%;width:30%;height:40%;background:white;padding:16px}</style></head><body>
  <main><h1>복지 서비스 탐색</h1><p>${'신청 가능한 서비스를 비교하고 준비 상태를 확인합니다. '.repeat(12)}</p></main>
  <div id="backdrop"></div><div role="dialog" aria-modal="true" aria-label="${mode === 'consent' ? '쿠키 사용 동의' : '서비스 신청 중단 안내'}">
  <h2>${mode === 'consent' ? '쿠키 사용 동의' : '서비스 신청 중단 안내'}</h2>
  ${mode === 'unclosable' ? '<p>닫는 기능이 없습니다.</p>' : '<div id="close" role="button" aria-label="Close" tabindex="0" onclick="document.querySelector(\'[role=dialog]\').remove();document.querySelector(\'#backdrop\').remove()">×</div>'}
  </div></body></html>`;

test('reference capture closes an informational notice before retaining page pixels', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-notice-capture-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const server = createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(content('notice')); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const shotOut = join(root, '.omd/refs/domain/notice.png');
  const writer = createTestProjectWriteAdapter(root);
  writer.mkdir('.omd/refs/domain');
  const result = await withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`, { width: 800, height: 600 },
    { shotOut, adapter: writer }));
  assert.equal(result.acquisition.noticeDismissals?.length, 1);
  const { pixels, width, channels } = decodePng(readFileSync(shotOut));
  const corner = (20 * width + 20) * channels;
  assert.deepEqual([...pixels.slice(corner, corner + 3)], [255, 255, 255], 'backdrop must not darken retained page pixels');
});

test('reference capture refuses an obscuring consent or unclosable modal without writing a screenshot', async t => {
  for (const mode of ['consent', 'unclosable'] as const) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-notice-refusal-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const server = createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(content(mode)); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const shotOut = join(root, `.omd/refs/domain/${mode}.png`);
    const writer = createTestProjectWriteAdapter(root);
    writer.mkdir('.omd/refs/domain');
    await assert.rejects(withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`,
      { width: 800, height: 600 }, { shotOut, adapter: writer })), /REFERENCE_CAPTURE_VISUAL_OBSTRUCTION/);
    assert.equal(existsSync(shotOut), false);
  }
});

test('reference pixels are taken before hover probes reveal a persistent mega-menu', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-probe-capture-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Public service</title><style>body{margin:0;background:white}#menu{display:none;position:fixed;inset:0;background:blue}</style>
      <button id="nav" type="button">Services</button><main><h1>Public services</h1><p>${'Browse the available services and inspect eligibility. '.repeat(12)}</p></main>
      <div id="menu">Mega-menu</div><script>document.querySelector('#nav').addEventListener('mouseenter',()=>document.querySelector('#menu').style.display='block')</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const writer = createTestProjectWriteAdapter(root);
  writer.mkdir('.omd/refs/domain');
  const shotOut = join(root, '.omd/refs/domain/unhovered.png');
  const result = await withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`,
    { width: 800, height: 600 }, { shotOut, adapter: writer }));
  assert.ok(result.raw.meta?.interaction);
  const { pixels, width, channels } = decodePng(readFileSync(shotOut));
  const sample = (500 * width + 700) * channels;
  assert.deepEqual([...pixels.slice(sample, sample + 3)], [255, 255, 255], 'a probe-opened menu must not replace the initial reference state');
});

test('a deceptive close control cannot send a request but can retain clean pixels with blocked-request provenance', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-notice-side-effect-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    if (request.url === '/mutate') { requests.push(`${request.method} ${request.url}`); response.end('ok'); return; }
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Public service</title><main><h1>Benefits</h1><p>${'Compare available public service details and eligibility. '.repeat(12)}</p></main>
      <div role="dialog" aria-modal="true" aria-label="Service notice"><button type="button" aria-label="Close"
      onclick="fetch('/mutate',{method:'POST'});this.closest('[role=dialog]').remove()">Close</button></div>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const writer = createTestProjectWriteAdapter(root); writer.mkdir('.omd/refs/domain');
  const shotOut = join(root, '.omd/refs/domain/deceptive.png');
  const result = await withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`,
    { width: 800, height: 600 }, { shotOut, adapter: writer }));
  assert.deepEqual(requests, []);
  assert.equal(existsSync(shotOut), true);
  assert.ok(result.acquisition.noticeDismissals?.[0]?.blockedRequests.includes('POST:fetch'));
});

test('a prepared feature refuses an unrelated consent modal instead of saving obscured pixels', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-prepared-obstruction-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Public benefits</title><h1>Benefits</h1>
      <button id="toggle" type="button" aria-controls="feature" aria-expanded="false" onclick="document.querySelector('#feature').hidden=false;this.setAttribute('aria-expanded','true')">Open</button>
      <section id="feature" hidden>Feature detail</section><div role="dialog" aria-modal="true" aria-label="Cookie consent"><button type="button">Close</button></div>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const writer = createTestProjectWriteAdapter(root); writer.mkdir('.omd/refs/domain');
  const shotOut = join(root, '.omd/refs/domain/prepared.png');
  await assert.rejects(withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`,
    { width: 800, height: 600 }, { shotOut, adapter: writer, selector: '#feature', preparation: {
      schema: 'reference-capture-preparation-v1', actions: [{ kind: 'click', selector: '#toggle' }], assertions: [{ selector: '#feature', state: 'visible' }],
    } })), /REFERENCE_CAPTURE_VISUAL_OBSTRUCTION/);
  assert.equal(existsSync(shotOut), false);
});

test('reference capture refuses a roleless fixed popup and an orphaned dim backdrop', async t => {
  for (const mode of ['custom', 'orphaned-backdrop'] as const) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-visual-overlay-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const popup = mode === 'custom'
      ? '<div id="backdrop"></div><div id="service-popup"><h2>Unknown popup</h2><button type="button">Close</button></div>'
      : '<div id="backdrop"></div><div role="dialog" aria-modal="true" aria-label="Service notice"><button type="button" aria-label="Close" onclick="this.closest(\'[role=dialog]\').remove()">Close</button></div>';
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(`<!doctype html><title>Public benefits</title><style>body{margin:0;background:white}main{padding:40px}
        #backdrop{position:fixed;inset:0;background:rgba(0,0,0,.7)}#service-popup,[role=dialog]{position:fixed;left:35%;top:25%;width:30%;height:40%;background:white}</style>
        <main><h1>Benefits</h1><p>${'Compare current benefits and application requirements. '.repeat(12)}</p></main>${popup}`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const writer = createTestProjectWriteAdapter(root); writer.mkdir('.omd/refs/domain');
    const shotOut = join(root, `.omd/refs/domain/${mode}.png`);
    await assert.rejects(withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`,
      { width: 800, height: 600 }, { shotOut, adapter: writer })), /REFERENCE_CAPTURE_VISUAL_OBSTRUCTION/);
    assert.equal(existsSync(shotOut), false);
  }
});

test('an explicit same-page flow link still navigates after a guarded notice dismissal', async t => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(request.url === '/detail' ? '<h1>Feature detail</h1>' : `<!doctype html><h1>Benefits</h1><a id="detail" href="/detail">Details</a>
      <div role="dialog" aria-modal="true" aria-label="Service notice"><button type="button" aria-label="Close"
      onclick="this.closest('[role=dialog]').remove()">Close</button></div>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  await withBrowser(async browser => {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    try {
      await page.goto(base);
      assert.equal((await clearReferenceNotices(page)).length, 1);
      await withReadOnlyNoticeNavigation(page, `${base}/detail`, () => page.locator('#detail').click());
      assert.equal(await page.locator('h1').textContent(), 'Feature detail');
    } finally { await page.close(); }
  });
});
