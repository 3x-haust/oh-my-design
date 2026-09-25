import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type { Browser } from 'playwright';
import { captureEnergy, withBrowser } from '../core/render/index.ts';

test('energy sampling uses a supplied shared browser and leaves it available for another capture', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><title>Energy test</title><div style="width:120px;height:120px;background:blue"></div>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await withBrowser(async browser => {
      let opened = 0;
      const shared = new Proxy(browser, {
        get(target, property) {
          if (property === 'newPage') return (...args: Parameters<Browser['newPage']>) => {
            opened++;
            return target.newPage(...args);
          };
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const url = `http://127.0.0.1:${address.port}`;
      const first = await captureEnergy(url, { viewport: { width: 390, height: 844 }, browser: shared });
      const second = await captureEnergy(url, { viewport: { width: 390, height: 844 }, browser: shared });
      assert.ok(first);
      assert.ok(second);
      assert.equal(opened, 2);
      assert.equal(browser.isConnected(), true);
    });
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
