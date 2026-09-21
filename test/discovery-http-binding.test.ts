import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { executeReferenceSearch, readSearchExecution } from '../core/ref/search-execution.ts';
import { withBrowser } from '../core/render/index.ts';
import { observeDocumentResponses } from '../core/ref/document-observation.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, discoveryFixture, directoryHtml } from './helpers/discovery-capture.ts';

const searchUrl = 'https://www.google.com/search?q=task';
const directoryUrl = 'https://directory.example/tasks';
const destination = 'https://final-item.example/';
const unreachable = (value: never): never => assert.fail(`Unexpected scenario: ${String(value)}`);

for (const route of ['direct', 'search'] as const) for (const sameUrl of [false, true]) for (const finalStatus of [200, 403]) {
  test(`${route} binds final HTTP ${finalStatus} after ${sameUrl ? 'same' : 'different'}-URL document replacement`, async t => {
    const root = discoveryFixture(t);
    await withBrowser(async browser => {
      const initialUrl = route === 'search' ? searchUrl : directoryUrl;
      const finalUrl = sameUrl ? initialUrl : route === 'search' ? `${initialUrl}&source=public` : 'https://final-directory.example/tasks';
      let actualStatus: number | undefined;
      const scenario = discoveryBrowser(browser, { url: initialUrl, html: directoryHtml(destination),
        afterCapture: async (page, count) => {
          if (count !== 1) return;
          await page.route(finalUrl, request => request.fulfill({ status: finalStatus, contentType: 'text/html', body: directoryHtml(destination) }));
          actualStatus = (await page.goto(finalUrl, { waitUntil: 'domcontentloaded' }))?.status();
        } });
      const writer = createTestProjectWriteAdapter(root);
      switch (route) {
        case 'direct': {
          const capture = captureReferenceNavigation(scenario.browser, initialUrl, 'domain', writer, 'public-directory');
          if (finalStatus === 403) {
            await assert.rejects(capture, /successful native HTTP/);
            assert.equal(existsSync(join(root, '.omd/discovery')), false);
          } else {
            const receipt = await capture;
            const native = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
            assert.equal(native.acquisition.httpStatus, 200);
            assert.equal(native.acquisition.finalUrl, finalUrl);
          }
          break;
        }
        case 'search': {
          const receipt = await executeReferenceSearch(scenario.browser, { lane: 'domain', query: 'task', url: initialUrl, queryParam: 'q' }, writer);
          const record = readSearchExecution(root, receipt, 'domain');
          assert.equal(record.httpStatus, finalStatus);
          assert.equal(record.status, finalStatus === 200 ? 'page-observed' : 'http-error');
          assert.equal(record.finalUrl, finalUrl);
          break;
        }
        default: unreachable(route);
      }
      assert.equal(actualStatus, finalStatus);
      assert.equal(scenario.captures.length, 2);
      assert.equal(scenario.closed(), 1);
      assert.equal(scenario.detached(), 1);
    });
  });
}

for (const route of ['direct', 'search'] as const) {
  test(`${route} preserves initial HTTP failure and detaches its observer`, async t => {
    const root = discoveryFixture(t);
    await withBrowser(async browser => {
      const url = route === 'search' ? searchUrl : directoryUrl;
      const scenario = discoveryBrowser(browser, { url, status: 403, html: directoryHtml(destination) });
      const writer = createTestProjectWriteAdapter(root);
      switch (route) {
        case 'direct':
          await assert.rejects(captureReferenceNavigation(scenario.browser, url, 'domain', writer, 'public-directory'), /successful native HTTP/);
          assert.equal(scenario.captures.length, 0);
          assert.equal(existsSync(join(root, '.omd/discovery')), false);
          break;
        case 'search': {
          const receipt = await executeReferenceSearch(scenario.browser, { lane: 'domain', query: 'task', url, queryParam: 'q' }, writer);
          const record = readSearchExecution(root, receipt, 'domain');
          assert.equal(record.httpStatus, 403);
          assert.equal(record.status, 'http-error');
          break;
        }
        default: unreachable(route);
      }
      assert.equal(scenario.detached(), 1);
      assert.equal(scenario.closed(), 1);
    });
  });

  for (const resource of ['iframe', 'subresource'] as const) {
    test(`${route} ignores a later ${resource} HTTP 403 when binding the main document`, async t => {
      const root = discoveryFixture(t);
      await withBrowser(async browser => {
        const url = route === 'search' ? searchUrl : directoryUrl;
        const noiseUrl = new URL('/http-noise', url).href;
        let observedNoiseStatus: number | undefined;
        const scenario = discoveryBrowser(browser, { url, html: directoryHtml(destination), afterCapture: async (page, count) => {
          if (count !== 1) return;
          await page.route(noiseUrl, request => request.fulfill({ status: 403, contentType: 'text/html', body: 'Resource unavailable' }));
          const response = page.waitForResponse(noiseUrl);
          switch (resource) {
            case 'iframe':
              await page.evaluate(href => new Promise<void>(resolve => {
                const frame = document.createElement('iframe'); frame.hidden = true; frame.onload = () => resolve(); frame.src = href; document.body.append(frame);
              }), noiseUrl);
              break;
            case 'subresource': await page.evaluate(async href => { await fetch(href); }, noiseUrl); break;
            default: unreachable(resource);
          }
          observedNoiseStatus = (await response).status();
        } });
        const writer = createTestProjectWriteAdapter(root);
        switch (route) {
          case 'direct': {
            const receipt = await captureReferenceNavigation(scenario.browser, url, 'domain', writer, 'public-directory');
            const native = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
            assert.equal(native.acquisition.httpStatus, 200);
            break;
          }
          case 'search': {
            const receipt = await executeReferenceSearch(scenario.browser, { lane: 'domain', query: 'task', url, queryParam: 'q' }, writer);
            const record = readSearchExecution(root, receipt, 'domain');
            assert.equal(record.httpStatus, 200);
            assert.equal(record.status, 'page-observed');
            break;
          }
          default: unreachable(route);
        }
        assert.equal(observedNoiseStatus, 403);
        assert.equal(scenario.captures.length, 1);
        assert.equal(scenario.detached(), 1);
      });
    });
  }

  test(`${route} stops after two changing document captures without retaining a mismatched image`, async t => {
    const root = discoveryFixture(t);
    await withBrowser(async browser => {
      const url = route === 'search' ? searchUrl : directoryUrl;
      const scenario = discoveryBrowser(browser, { url, html: directoryHtml(destination), afterCapture: async page => { await page.reload({ waitUntil: 'domcontentloaded' }); } });
      const writer = createTestProjectWriteAdapter(root);
      switch (route) {
        case 'direct':
          await assert.rejects(captureReferenceNavigation(scenario.browser, url, 'domain', writer, 'public-directory'), /both bounded captures/);
          assert.equal(existsSync(join(root, '.omd/discovery')), false);
          break;
        case 'search': {
          const receipt = await executeReferenceSearch(scenario.browser, { lane: 'domain', query: 'task', url, queryParam: 'q' }, writer);
          const record = readSearchExecution(root, receipt, 'domain');
          assert.equal(record.status, 'navigation-error');
          assert.equal(record.httpStatus, null);
          assert.equal(record.capture, null);
          assert.deepEqual(readdirSync(join(root, '.omd/discovery/domain')), [receipt.path.split('/').at(-1)]);
          break;
        }
        default: unreachable(route);
      }
      assert.equal(scenario.captures.length, 2);
      assert.equal(scenario.detached(), 1);
      assert.equal(scenario.closed(), 1);
    });
  });
}

test('about:blank cannot claim a main-document HTTP response', async () => {
  await withBrowser(async browser => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const documents = await observeDocumentResponses(page);
      try { await assert.rejects(documents.current(), /no observed HTTP response binding/); }
      finally { await documents.close(); }
    } finally { await context.close(); }
  });
});

test('history-only URL changes retain their actual main-document HTTP binding', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const scenario = discoveryBrowser(browser, { url: directoryUrl, html: directoryHtml(destination), afterCapture: async (page, count) => {
      if (count === 1) await page.evaluate(() => history.pushState(null, '', '/history'));
    } });
    const receipt = await captureReferenceNavigation(scenario.browser, directoryUrl, 'domain', createTestProjectWriteAdapter(root), 'public-directory');
    const native = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
    assert.equal(native.acquisition.httpStatus, 200);
    assert.equal(native.acquisition.finalUrl, 'https://directory.example/history');
    assert.equal(scenario.captures.length, 2);
    assert.equal(scenario.detached(), 1);
  });
});
