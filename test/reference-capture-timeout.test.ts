import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { onPage, withBrowser } from '../core/render/index.ts';

test('a stalled reference page is bounded so another public candidate can be tried', async () => {
  const target = fileURLToPath(new URL('fixtures/considered.html', import.meta.url));
  const started = Date.now();
  await assert.rejects(withBrowser(browser => onPage(browser, target,
    { width: 1280, height: 900 }, async () => new Promise<never>(() => {}), 100)),
  /reference capture timed out after 100ms/);
  assert.ok(Date.now() - started < 15_000);
});

test('reference capture proceeds after DOM readiness when an unrelated asset never loads', async t => {
  const server = createServer((request, response) => {
    if (request.url === '/slow.png') return;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><body><main>Visible service task</main><img src="/slow.png"></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected local test server port');
  const text = await withBrowser(browser => onPage(browser, `http://127.0.0.1:${address.port}`,
    { width: 800, height: 600 }, page => page.locator('main').innerText(), 8_000, true));
  assert.equal(text, 'Visible service task');
});
