import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { PNG } from 'pngjs';
import { renderSourceStudyHtml } from '../core/art-direction/source-study-render.ts';

test('self-contained study renders real desktop and mobile pixels', async () => {
  const html = '<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{font:20px sans-serif}</style><h1>독서 기록</h1><button>메모 추가</button></html>';
  const renders = await renderSourceStudyHtml(html, { triggerSelector: null, readySelector: 'button' });
  assert.deepEqual(renders.map(row => row.viewport), [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'mobile', width: 390, height: 844 },
  ]);
  assert.deepEqual(renders.map(row => row.state), ['initial', 'primary-work', 'initial', 'primary-work']);
  for (const render of renders) {
    const image = PNG.sync.read(render.png);
    assert.equal(image.width, render.viewport.width);
    assert.equal(image.height, render.viewport.height);
    assert.ok(image.data.some(value => value !== 255));
  }
});

for (const phase of ['initial', 'primary-work'] as const) {
test(`study rendering refuses ${phase} resource requests without reaching another server`, async t => {
  let requests = 0;
  const server = createServer((_request, response) => { requests += 1; response.end('not allowed'); });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/private`;
  const html = phase === 'initial'
    ? `<!doctype html><h1>Study</h1><script>fetch(${JSON.stringify(url)}).catch(()=>{});</script>`
    : `<!doctype html><button id="open" onclick="this.nextElementSibling.hidden=false;fetch('${url}').catch(()=>{})">Open</button><form id="editor" hidden><input></form>`;
  await assert.rejects(renderSourceStudyHtml(html, phase === 'initial'
    ? { triggerSelector: null, readySelector: 'h1' }
    : { triggerSelector: '#open', readySelector: '#editor' }), /external-resource/);
  assert.equal(requests, 0);
});
}

test('a URL in visible note text is content rather than a network request', async () => {
  const renders = await renderSourceStudyHtml('<!doctype html><h1>메모</h1><p>https://example.com/reading</p>',
    { triggerSelector: null, readySelector: 'p' });
  assert.equal(renders.length, 4);
});

test('the actual revealed work state is captured in both viewports instead of only the initial list', async () => {
  const html = '<!doctype html><button id="open" onclick="document.querySelector(\'#editor\').hidden=false">책 선택</button>'
    + '<form id="editor" hidden><h1>진도와 메모</h1><input aria-label="현재 쪽수" value="86"><textarea aria-label="메모"></textarea></form>';
  const renders = await renderSourceStudyHtml(html, { triggerSelector: '#open', readySelector: '#editor' });
  assert.equal(renders.length, 4);
  assert.notDeepEqual(renders[0]?.png, renders[1]?.png);
  assert.notDeepEqual(renders[2]?.png, renders[3]?.png);
});

test('a document root or missing work region cannot stand in for actual primary work', async () => {
  const html = '<!doctype html><h1>Collection only</h1>';
  await assert.rejects(renderSourceStudyHtml(html, { triggerSelector: null, readySelector: 'body' }), /work/);
  await assert.rejects(renderSourceStudyHtml(html, { triggerSelector: null, readySelector: '#missing' }), /work/);
});

test('primary work outside the viewport is not silently scrolled into a successful capture', async () => {
  const html = '<!doctype html><div style="height:2000px">Collection</div><form id="editor"><input></form>';
  await assert.rejects(renderSourceStudyHtml(html, { triggerSelector: null, readySelector: '#editor' }), /work/);
});

test('a declared reveal cannot claim a work region that was already visible', async () => {
  const html = '<!doctype html><button id="open">Open</button><form id="editor"><input></form>';
  await assert.rejects(renderSourceStudyHtml(html, { triggerSelector: '#open', readySelector: '#editor' }),
    /work-state-already-visible/);
});
