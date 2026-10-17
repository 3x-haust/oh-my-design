import assert from 'node:assert/strict';
import test from 'node:test';
import type { Route } from 'playwright';
import { openBrowseBrowser } from '../core/ref/browse/browser.ts';
import type { Binding } from '../core/ref/browse/contract.ts';
import { captureBrowseObservation } from '../core/ref/browse/observation.ts';

function signal() {
  let resolve: () => void = () => { throw new Error('signal not initialized'); };
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function binding(): Binding {
  const started = new Date();
  return {
    root: process.cwd(), sessionId: 'readiness-fixture',
    sourceContractSha256: 'a'.repeat(64), buildSha256: 'b'.repeat(64), consent: null,
    start: {
      verb: 'start', lane: 'design', mode: 'headless', cdpUrl: null,
      userOptIn: false, headed: false, allowAuthOrigins: [], allowPricing: false,
      budgetActions: 1, budgetMinutes: 2, viewport: { width: 640, height: 800 },
    },
    budget: {
      startedAt: started.toISOString(), deadline: new Date(started.getTime() + 120000).toISOString(),
      maxActions: 1, actions: 0, metadataEvents: 0,
    },
  };
}

test('browse capture settles pending visible images before either snapshot without scrolling', { timeout: 30000 }, async () => {
  const routes = new Map<string, Route>();
  const requested = new Map([['one', signal()], ['two', signal()]]);
  const released = new Set<string>();
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('.svg')) {
      const id = path.slice(1, -4);
      routes.set(id, route);
      requested.get(id)?.resolve();
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><title>Populated work</title><style>body{background:white}img{width:280px;height:150px;display:block}</style><main><h1>Work list</h1><p>Selected record</p><img id="one" src="/one.svg"><img id="two" src="/two.svg"><a href="/detail">Read detail</a></main>',
    });
  } });
  try {
    await browser.page.exposeFunction('fixtureImageListener', async (id: string) => {
      if (released.has(id)) return;
      const route = routes.get(id);
      assert.ok(route);
      released.add(id);
      await route.fulfill({
        status: 200, contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="150"><rect width="280" height="150" fill="#2155cc"/></svg>',
      });
    });
    await browser.page.addInitScript(() => {
      const add = HTMLImageElement.prototype.addEventListener;
      HTMLImageElement.prototype.addEventListener = function (...args: Parameters<typeof add>) {
        add.apply(this, args);
        if (args[0] === 'load') {
          const callback = Reflect.get(window, 'fixtureImageListener');
          void callback(this.id);
        }
      };
    });
    await browser.page.goto('https://readiness.fixture.test/work', { waitUntil: 'domcontentloaded' });
    await Promise.all([...requested.values()].map(item => item.promise));
    const screenshot = browser.page.screenshot.bind(browser.page);
    let captures = 0;
    browser.page.screenshot = async options => {
      const id = captures++ === 0 ? 'one' : 'two';
      await browser.page.evaluate(id => new Promise<void>((resolve, reject) => {
        const image = document.getElementById(id);
        if (!(image instanceof HTMLImageElement)) { reject(new Error('missing fixture image')); return; }
        if (image.complete) { resolve(); return; }
        const deadline = setTimeout(() => reject(new Error('fixture load timed out')), 5000);
        image.addEventListener('load', () => { clearTimeout(deadline); resolve(); }, { once: true });
      }), id);
      return screenshot(options);
    };

    const result = await captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: false, readySelector: 'main', timeout: 5000,
    });
    assert.equal(captures, 1);
    assert.deepEqual(result.observation.scroll, { x: 0, y: 0 });
    assert.deepEqual([...released].sort(), ['one', 'two']);
    assert.equal(await browser.page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth === 280)), true);
  } finally { await browser.close(); }
});

test('browse capture still refuses content changed across every screenshot', { timeout: 30000 }, async () => {
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Work</title><main><h1>Work list</h1><p id="record">Initial record</p><a href="/detail">Read detail</a></main>' });
  } });
  try {
    await browser.page.goto('https://readiness.fixture.test/work', { waitUntil: 'domcontentloaded' });
    const screenshot = browser.page.screenshot.bind(browser.page);
    let captures = 0;
    browser.page.screenshot = async options => {
      await browser.page.evaluate(index => {
        const record = document.getElementById('record');
        if (record) record.textContent = `Changed record ${index}`;
      }, ++captures);
      return screenshot(options);
    };
    await assert.rejects(captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: false, readySelector: 'main', timeout: 5000,
    }), /BROWSE_UNSTABLE_RENDER/);
    assert.equal(captures, 2);
  } finally { await browser.close(); }
});

test('browse capture observes finite transition completion before the first snapshot', { timeout: 30000 }, async () => {
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Work</title><main><h1>Work list</h1><p id="record">Selected record</p></main>' });
  } });
  try {
    await browser.page.goto('https://readiness.fixture.test/work', { waitUntil: 'domcontentloaded' });
    await browser.page.evaluate(() => {
      const add = Animation.prototype.addEventListener;
      Animation.prototype.addEventListener = function (...args: Parameters<typeof add>) {
        add.apply(this, args);
        if (args[0] === 'finish') this.finish();
      };
      const record = document.getElementById('record');
      if (record) record.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 60000, fill: 'forwards' });
    });
    const screenshot = browser.page.screenshot.bind(browser.page);
    let captures = 0;
    browser.page.screenshot = async options => {
      captures++;
      await browser.page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
      return screenshot(options);
    };
    const result = await captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: false, readySelector: 'main', timeout: 5000,
    });
    assert.equal(captures, 1);
    assert.match(result.observation.text, /Selected record/);
  } finally { await browser.close(); }
});
