import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { withBrowser } from '../core/render/index.ts';
import { recordLiveReferenceFlow, readLiveReferenceFlow } from '../core/ref/live-flow.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { signedBrowserJudgment } from './helpers/reference-judgment.ts';

for (const mode of ['before-action', 'after-action', 'navigation'] as const) {
  const afterAction = mode === 'after-action';
  test(`blocked POST ${mode} preserves the read-only flow boundary`, async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-flow-network-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const writer = createTestProjectWriteAdapter(root);
    await withBrowser(async browser => {
      let interceptedPosts = 0;
      let abortedPosts = 0;
      const proxy = new Proxy(browser, { get(target, property) {
        if (property !== 'newContext') return Reflect.get(target, property, target);
        return async (...args: Parameters<typeof browser.newContext>) => {
          const context = await target.newContext(...args);
          const newPage = context.newPage.bind(context);
          context.newPage = async () => {
            const page = await newPage();
            page.on('requestfailed', request => {
              if (request.method() === 'POST' && request.failure()?.errorText === 'net::ERR_FAILED') abortedPosts++;
            });
            await page.route('https://reference.example/**', async route => {
              if (route.request().method() === 'POST') {
                interceptedPosts++;
                return route.fallback();
              }
              const post = !afterAction || route.request().url().endsWith('/next');
              await route.fulfill({ contentType: 'text/html; charset=utf-8',
                body: `<html><head><title>Public service</title></head><body><main>
                  <h1>Service</h1><p>${'Public eligibility and preparation information. '.repeat(8)}</p>
                  <a id="next" href="/next">Details</a><p id="status">Ready</p>
                  ${post ? mode === 'navigation'
                    ? '<form id="send" method="post" action="/monitoring"></form><script>document.querySelector("#send").submit()</script>'
                    : `<script>fetch('/monitoring?ignored=value',{method:'POST'}).catch(()=>document.querySelector('#status').textContent='Blocked')</script>` : ''}
                </main></body></html>` });
            });
            return page;
          };
          return context;
        };
      } });
      const steps = [
        { screenId: 'entry', state: 'public-information', clicks: [],
          assertions: [{ selector: afterAction ? 'h1' : '#status', state: 'visible', text: afterAction ? 'Service' : 'Blocked' }] },
        ...(afterAction ? [{ screenId: 'next', state: 'details', clicks: ['#next'],
          assertions: [{ selector: '#status', state: 'visible', text: 'Blocked' }] }] : []),
      ];
      const result = await recordLiveReferenceFlow(proxy, root, {
        schema: 'reference-flow-input-v1', sourceId: 'service', flowId: 'inspect',
        url: 'https://reference.example/', viewport: { width: 1280, height: 900 }, steps,
      }, writer, (page, selector, documentUrl) =>
        signedBrowserJudgment(page, selector, documentUrl, 'reference-action', 'read-only-navigation'));
      assert.equal(interceptedPosts, 1);
      assert.equal(abortedPosts, 1);
      assert.equal(result.status, mode === 'before-action' ? 'completed' : 'blocked', result.limitation ?? '');
      if (mode === 'before-action') {
        const saved = readLiveReferenceFlow(root, result.execution);
        assert.equal(saved.steps.length, 1);
        const restrictions = Reflect.get(saved, 'networkRestrictions');
        assert.ok(Array.isArray(restrictions));
        assert.deepEqual(restrictions.map(item => [item.method, item.phase, item.path]),
          [['POST', 'before-action', '/monitoring']]);
      }
    });
  });
}
