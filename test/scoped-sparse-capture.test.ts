import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { extractIr } from '../core/render/index.ts';

test('HTTP component examples are measurable without admitting hollow or blocked pages', async () => {
  const server = createServer((request, response) => {
    const path = request.url;
    response.statusCode = path === '/forbidden' ? 403 : 200;
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>${path === '/challenge' ? 'Just a moment...' : 'Component example'}</title>
      <style>.feedback{padding:24px;border:4px solid #176f44} .hidden{display:none}</style>
      <main style="opacity:${path === '/transparent-parent' ? 0 : 1}">
      <section class="feedback ${path === '/hidden' ? 'hidden' : ''}" role="status">
      ${path === '/empty' ? '' : '<h2>Saved</h2><p>Your changes are ready.</p>'}</section></main>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const viewport = { width: 1440, height: 900 };
  try {
    const raw = await extractIr(base, { viewport, selector: '.feedback' });
    assert.ok(raw.nodes.length > 0, 'real component geometry must be extracted');
    for (const selector of [null, 'body', 'html', '*', '.missing']) {
      await assert.rejects(() => extractIr(base, { viewport, selector }), /near-empty body/);
    }
    for (const path of ['/empty', '/hidden', '/transparent-parent']) {
      await assert.rejects(() => extractIr(base + path, { viewport, selector: '.feedback' }), /near-empty body/);
    }
    await assert.rejects(() => extractIr(base + '/forbidden', { viewport, selector: '.feedback' }), /HTTP 403/);
    await assert.rejects(() => extractIr(base + '/challenge', { viewport, selector: '.feedback' }), /challenge page/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
