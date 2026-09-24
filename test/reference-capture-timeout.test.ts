import assert from 'node:assert/strict';
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
