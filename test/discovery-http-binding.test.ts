import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { Browser, BrowserContext, Locator, Page } from 'playwright';
import { captureReferenceNavigation, readReferenceDiscoveryAttempt } from '../core/ref/navigation-capture.ts';
import { executeReferenceSearch, readSearchExecution } from '../core/ref/search-execution.ts';
import { withBrowser } from '../core/render/index.ts';
import { observeDocumentResponses } from '../core/ref/document-observation.ts';
import { captureDiscoveryObservation } from '../core/ref/reference-capture-observation.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, discoveryFixture, directoryHtml } from './helpers/discovery-capture.ts';

const searchUrl = 'https://www.google.com/search?q=task';
const directoryUrl = 'https://directory.example/tasks';
const destination = 'https://final-item.example/';
const unreachable = (value: never): never => assert.fail(`Unexpected scenario: ${String(value)}`);

function browserWithInterruptedInspection(browser: Browser, source: string, finalUrl: string, finalHtml: string) {
  let interruptions = 0;
  const preparePage = async (page: Page): Promise<Page> => {
    await page.route(source, route => route.fulfill({ status: 200, contentType: 'text/html',
      body: '<main><h1>Redirect wrapper</h1><p>This document must not be retained.</p></main>' }));
    let releaseFinal!: () => void;
    let finalRequested!: () => void;
    const release = new Promise<void>(resolve => { releaseFinal = resolve; });
    const requested = new Promise<void>(resolve => { finalRequested = resolve; });
    await page.route(finalUrl, async route => {
      finalRequested();
      await release;
      await route.fulfill({ status: 201, contentType: 'text/html', body: finalHtml });
    });
    const locator = page.locator.bind(page);
    page.locator = ((selector: string, ...args: Parameters<Page['locator']> extends [string, ...infer Rest] ? Rest : never) => {
      const found = locator(selector, ...args);
      if (selector !== 'body') return found;
      return new Proxy(found, { get(target, property, receiver) {
        if (property !== 'evaluate') return Reflect.get(target, property, receiver);
        return async (...evaluateArgs: Parameters<Locator['evaluate']>) => {
          if (interruptions > 0) return target.evaluate(...evaluateArgs);
          interruptions++;
          const body = await target.elementHandle();
          assert.ok(body);
          const loaded = page.waitForURL(finalUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
          const request = page.waitForRequest(finalUrl, { timeout: 5000 });
          await page.evaluate(href => { location.replace(href); }, finalUrl);
          await Promise.all([request, requested]);
          releaseFinal();
          await loaded;
          return body.evaluate(...evaluateArgs);
        };
      } });
    }) as Page['locator'];
    return page;
  };
  const prepareContext = (context: BrowserContext): BrowserContext => {
    const newPage = context.newPage.bind(context);
    context.newPage = async () => preparePage(await newPage());
    return context;
  };
  return {
    browser: new Proxy(browser, { get(target, property, receiver) {
      if (property === 'newContext') return async (...args: Parameters<Browser['newContext']>) =>
        prepareContext(await target.newContext(...args));
      return Reflect.get(target, property, receiver);
    } }),
    interruptions: () => interruptions,
  };
}

function assertOnlyFailedDirectAttempt(root: string): void {
  const directory = join(root, '.omd/discovery/domain');
  assert.deepEqual(readdirSync(directory), ['attempts'], 'failed navigation must retain no image, entry, or visit');
  const names = readdirSync(join(directory, 'attempts'));
  assert.equal(names.length, 1);
  const name = names[0]; assert.ok(name);
  assert.match(name, /^[a-f0-9]{64}\.json$/);
  const attempt = readReferenceDiscoveryAttempt(root, {
    path: `.omd/discovery/domain/attempts/${name}`, sha256: name.slice(0, -5),
  });
  assert.equal(attempt.outcome, 'unavailable');
  assert.equal(attempt.researchLane, 'domain');
}

for (const route of ['direct', 'search'] as const) for (const sameUrl of [false, true]) for (const finalStatus of [200, 403]) {
  test(`${route === 'direct' ? 'text-only domain observation does not invoke screenshot-triggered replacement' : route + ' binds final HTTP ' + finalStatus} (${sameUrl ? 'same' : 'different'} URL)`, async t => {
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
          const receipt = await capture;
          const native = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
          assert.equal(native.acquisition.httpStatus, 200);
          assert.equal(native.acquisition.finalUrl, initialUrl);
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
      assert.equal(actualStatus, route === 'direct' ? undefined : finalStatus);
      assert.equal(scenario.captures.length, route === 'direct' ? 0 : 2);
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
          assertOnlyFailedDirectAttempt(root);
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
        assert.equal(observedNoiseStatus, route === 'direct' ? undefined : 403);
        assert.equal(scenario.captures.length, route === 'direct' ? 0 : 1);
        assert.equal(scenario.detached(), 1);
      });
    });
  }

  test(`${route === 'direct' ? 'domain records text without screenshot-triggered reloads' : 'search stops after two changing document captures'}`, async t => {
    const root = discoveryFixture(t);
    await withBrowser(async browser => {
      const url = route === 'search' ? searchUrl : directoryUrl;
      const scenario = discoveryBrowser(browser, { url, html: directoryHtml(destination), afterCapture: async page => { await page.reload({ waitUntil: 'domcontentloaded' }); } });
      const writer = createTestProjectWriteAdapter(root);
      switch (route) {
        case 'direct': {
          const receipt = await captureReferenceNavigation(scenario.browser, url, 'domain', writer, 'public-directory');
          assert.equal(JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8')).acquisition.httpStatus, 200);
          break;
        }
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
      assert.equal(scenario.captures.length, route === 'direct' ? 0 : 2);
      assert.equal(scenario.detached(), 1);
      assert.equal(scenario.closed(), 1);
    });
  });
}

test('navigation capture retries an interrupted inspection against the bound final document', async t => {
  const root = discoveryFixture(t);
  const source = 'https://redirect-wrapper.example/start';
  const finalUrl = 'https://final-reference.example/workspace';
  const finalLink = 'https://final-reference.example/task/42';
  const finalHtml = directoryHtml(finalLink).replace('Public directory', 'Final application workspace');
  await withBrowser(async browser => {
    const scenario = browserWithInterruptedInspection(browser, source, finalUrl, finalHtml);
    const receipt = await captureReferenceNavigation(scenario.browser, source, 'design', createTestProjectWriteAdapter(root));
    const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
    assert.equal(scenario.interruptions(), 1);
    assert.equal(record.acquisition.finalUrl, finalUrl);
    assert.equal(record.acquisition.httpStatus, 201);
    assert.deepEqual(record.acquisition.links, [finalLink]);
    assert.match(record.observedText, /Final application workspace/);
    assert.doesNotMatch(record.observedText, /Redirect wrapper/);
    assert.equal(readFileSync(join(root, receipt.evidence.path)).subarray(1, 4).toString(), 'PNG');
  });
});

test('stable-document inspection errors are not retried as navigation', async () => {
  await withBrowser(async browser => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const url = 'https://stable-error.example/';
      await page.route(url, route => route.fulfill({ status: 200, contentType: 'text/html', body: directoryHtml(destination) }));
      const documents = await observeDocumentResponses(page);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const failure = new Error('unrelated inspection failure');
        let evaluations = 0;
        const locator = page.locator.bind(page);
        page.locator = ((selector: string, ...args: Parameters<Page['locator']> extends [string, ...infer Rest] ? Rest : never) => {
          const found = locator(selector, ...args);
          if (selector !== 'body') return found;
          return new Proxy(found, { get(target, property, receiver) {
            if (property !== 'evaluate') return Reflect.get(target, property, receiver);
            return async () => { evaluations++; throw failure; };
          } });
        }) as Page['locator'];
        await assert.rejects(captureDiscoveryObservation(page, documents), error => error === failure);
        assert.equal(evaluations, 1);
      } finally { await documents.close(); }
    } finally { await context.close(); }
  });
});

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

test('Given a closed reference page When its document observer is disposed Then CDP cleanup does not fail', async () => {
  await withBrowser(async browser => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const documents = await observeDocumentResponses(page);
      await page.close();
      await documents.close();
    } finally { await context.close(); }
  });
});

test('domain observation does not trigger a screenshot-only history change', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const scenario = discoveryBrowser(browser, { url: directoryUrl, html: directoryHtml(destination), afterCapture: async (page, count) => {
      if (count === 1) await page.evaluate(() => history.pushState(null, '', '/history'));
    } });
    const receipt = await captureReferenceNavigation(scenario.browser, directoryUrl, 'domain', createTestProjectWriteAdapter(root), 'public-directory');
    const native = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
    assert.equal(native.acquisition.httpStatus, 200);
    assert.equal(native.acquisition.finalUrl, directoryUrl);
    assert.equal(scenario.captures.length, 0);
    assert.equal(scenario.detached(), 1);
  });
});
