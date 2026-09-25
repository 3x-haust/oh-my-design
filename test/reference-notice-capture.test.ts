import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { decodePng } from '../core/motion/energy.ts';
import { capturePageForRef, withBrowser } from '../core/render/index.ts';
import { clearReferenceNotices } from '../core/ref/notice-overlay.ts';
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

test('a deceptive close control is not clicked, so it cannot send a request while clean pixels are retained', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-notice-side-effect-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    if (request.url === '/mutate') { requests.push(`${request.method} ${request.url}`); response.end('ok'); return; }
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Public service</title><main><h1>Benefits</h1><p>${'Compare available public service details and eligibility. '.repeat(12)}</p></main>
      <div role="dialog" aria-modal="true" aria-label="Service notice"><button type="button" aria-label="Close"
      onclick="document.cookie='consent=yes';localStorage.setItem('consent','yes');fetch('/mutate',{method:'POST'});this.closest('[role=dialog]').remove()">Close</button></div>`);
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
  assert.equal(result.acquisition.noticeDismissals?.[0]?.method, 'visual-only');
  await withBrowser(async browser => {
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${address.port}`);
      await clearReferenceNotices(page);
      assert.equal(await page.evaluate(() => document.cookie), '');
      assert.equal(await page.evaluate(() => localStorage.getItem('consent')), null);
    } finally { await page.close(); }
  });
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

test('reference capture refuses an unknown roleless popup and clears a notice backdrop', async t => {
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
    if (mode === 'custom') {
      await assert.rejects(withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`,
        { width: 800, height: 600 }, { shotOut, adapter: writer })), /REFERENCE_CAPTURE_VISUAL_OBSTRUCTION/);
      assert.equal(existsSync(shotOut), false);
    } else {
      const result = await withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`,
        { width: 800, height: 600 }, { shotOut, adapter: writer }));
      assert.ok(result.acquisition.noticeDismissals?.[0]?.suppressedBackdrops);
      const { pixels, width, channels } = decodePng(readFileSync(shotOut));
      assert.deepEqual([...pixels.slice((20 * width + 20) * channels, (20 * width + 20) * channels + 3)], [255, 255, 255]);
    }
  }
});

test('a safe feature link still loads its stylesheet after visual-only notice suppression', async t => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    if (request.url === '/detail.css') { response.setHeader('content-type', 'text/css'); response.end('#feature{background:rgb(1, 2, 3)}'); return; }
    response.setHeader('content-type', 'text/html');
    response.end(request.url === '/detail' ? '<link rel="stylesheet" href="/detail.css"><h1 id="feature">Feature detail</h1>' : `<!doctype html><h1>Benefits</h1><a id="detail" href="/detail">Details</a>
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
      await page.locator('#detail').click();
      assert.equal(await page.locator('h1').textContent(), 'Feature detail');
      assert.equal(await page.locator('#feature').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(1, 2, 3)');
      assert.ok(requests.includes('/detail.css'));
    } finally { await page.close(); }
  });
});

test('a consent dialog cannot masquerade as an informational notice through aria-label', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-spoofed-consent-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Public benefits</title><main><h1>Benefits</h1><p>${'Browse public information. '.repeat(12)}</p></main>
      <div role="dialog" aria-modal="true" aria-label="Service notice"><p>Cookie consent is required</p>
      <button type="button" aria-label="Close" onclick="document.cookie='consent=yes';this.closest('[role=dialog]').remove()">Close</button></div>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const writer = createTestProjectWriteAdapter(root); writer.mkdir('.omd/refs/domain');
  const shotOut = join(root, '.omd/refs/domain/spoofed.png');
  await assert.rejects(withBrowser(browser => capturePageForRef(browser, `http://127.0.0.1:${address.port}`,
    { width: 800, height: 600 }, { shotOut, adapter: writer })), /REFERENCE_CAPTURE_VISUAL_OBSTRUCTION/);
  assert.equal(existsSync(shotOut), false);
});
