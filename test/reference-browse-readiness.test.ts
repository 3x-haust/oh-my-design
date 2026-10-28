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
    assert.equal(captures, 3);
    // A design reference only needs one frame: the same ever-changing page is kept as its last frame, labelled so.
    const frame = await captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: false, readySelector: 'main', timeout: 5000, oneFrame: true,
    });
    assert.equal(frame.observation.retainable, true);
    assert.match(frame.observation.limitation ?? '', /kept changing/);
  } finally { await browser.close(); }
});

test('a long entry animation is frozen where it stands rather than blocking the capture', { timeout: 30000 }, async () => {
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Work</title><main><h1>Work list</h1><p id="record">Selected record</p></main>' });
  } });
  try {
    await browser.page.goto('https://readiness.fixture.test/work', { waitUntil: 'domcontentloaded' });
    await browser.page.evaluate(() => {
      document.getElementById('record')?.animate([{ transform: 'translateY(40px)' }, { transform: 'none' }], { duration: 60000, fill: 'forwards' });
    });
    const result = await captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: false, readySelector: 'main', timeout: 800,
    });
    assert.match(result.observation.text, /Selected record/);
    assert.equal(await browser.page.evaluate(() => document.getAnimations()[0]?.playState), 'running', 'released after capture');
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

test('a gallery that fills its results by script is observed after they arrive', { timeout: 30000 }, async () => {
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Search</title><main id="results"></main>
      <script>setTimeout(() => { document.getElementById('results').innerHTML = Array.from({ length: 6 },
        (_, i) => '<article><h2>Result ' + i + '</h2><p>Feature card illustration</p></article>').join(''); }, 1500);</script>` });
  } });
  try {
    await browser.page.goto('https://readiness.fixture.test/search', { waitUntil: 'domcontentloaded' });
    const result = await captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: true, timeout: 8000,
    });
    assert.match(result.observation.text, /Result 5/);
  } finally { await browser.close(); }
});

test('the headless reference browser presents its ordinary Chrome name', { timeout: 30000 }, async () => {
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Agent</title><main>agent</main>' });
  } });
  try {
    await browser.page.goto('https://readiness.fixture.test/agent', { waitUntil: 'domcontentloaded' });
    const agent = await browser.page.evaluate(() => navigator.userAgent);
    assert.doesNotMatch(agent, /HeadlessChrome/);
    assert.match(agent, /Chrome\/\d+/);
  } finally { await browser.close(); }
});

test('a looping hero is captured on the frame on screen and keeps running afterwards', { timeout: 30000 }, async () => {
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Loop</title><style>
      .spin{width:80px;height:80px;background:#2f4bff;animation:spin 1.5s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    </style><main><h1>Looping hero</h1><div class="spin"></div><canvas id="c" width="160" height="80"></canvas></main>
    <script>window.frames=0;const x=document.getElementById('c').getContext('2d');
    (function loop(t){window.frames++;x.fillStyle='hsl('+(t/4%360)+' 80% 50%)';x.fillRect(0,0,160,80);requestAnimationFrame(loop)})(0);</script>` });
  } });
  try {
    await browser.page.goto('https://readiness.fixture.test/loop', { waitUntil: 'domcontentloaded' });
    const result = await captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: false, readySelector: 'main', timeout: 5000,
    });
    assert.match(result.observation.text, /Looping hero/);
    const before = Number(await browser.page.evaluate('window.frames'));
    await browser.page.waitForTimeout(200);
    assert.ok(Number(await browser.page.evaluate('window.frames')) > before, 'the loop resumes after capture');
    assert.equal(await browser.page.evaluate("document.getAnimations()[0].playState"), 'running');
  } finally { await browser.close(); }
});

test('Korean domain research can search Naver by name', async () => {
  const { searchUrl } = await import('../core/ref/browse/safety.ts');
  assert.equal(searchUrl('naver', '디자인 하네스', 'q'), 'https://search.naver.com/search.naver?query=%EB%94%94%EC%9E%90%EC%9D%B8%20%ED%95%98%EB%84%A4%EC%8A%A4');
  // Login-free galleries: Pinterest pins through public image search, curated graphics by category, UI motion by pattern.
  assert.equal(searchUrl('pinterest', '3d icon', 'q'), 'https://search.naver.com/search.naver?where=image&query=pinterest%203d%20icon');
  assert.equal(searchUrl('inspora', '3D', 'q'), 'https://www.inspora.design/?category=3D');
  assert.equal(searchUrl('60fps', 'bottom-sheet', 'q'), 'https://60fps.design/shots/filter/bottom-sheet');
});

test('a whole-image selector that matches several images says how many and how to pick one', { timeout: 30000 }, async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    if (route.request().url().endsWith('.png')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png, 'base64') });
    await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Gallery</title><main><h1>Results</h1>${[1, 2, 3].map(n => `<img alt="" width="120" height="90" src="/shot-${n}.png">`).join('')}</main>` });
  } });
  try {
    await browser.page.goto('https://readiness.fixture.test/gallery', { waitUntil: 'domcontentloaded' });
    await assert.rejects(captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: false, readySelector: 'main', timeout: 5000, wholeImageSelector: 'main img',
    }), /matched 3 images; add >> nth=<index>/);
  } finally { await browser.close(); }
});

test('a whole-image selector that misses lists the visible images to pick and flags one a card link covers', { timeout: 30000 }, async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const browser = await openBrowseBrowser(binding(), { transport: async route => {
    if (route.request().url().endsWith('.png')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png, 'base64') });
    // As on many galleries, the card link is a layer beside the image rather than around it.
    await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>Gallery</title><main><h1>Results</h1>
      <figure style="position:relative;width:200px;height:150px;margin:0"><img alt="Tool landing" width="200" height="150" src="/shot-1.png">
        <a href="/shots/1" style="position:absolute;inset:0" aria-label="open"></a></figure>
      <img alt="Plain shot" width="200" height="150" src="/shot-2.png"><img alt="avatar" width="24" height="24" src="/a.png"></main>` });
  } });
  try {
    await browser.page.goto('https://readiness.fixture.test/gallery', { waitUntil: 'domcontentloaded' });
    const shot = (selector: string) => captureBrowseObservation(browser.page, browser.document, 'readiness-fixture', {
      media: browser.media, search: false, readySelector: 'main', timeout: 5000, wholeImageSelector: selector });
    await assert.rejects(shot('a[href="/shots/1"] img'), error => {
      assert.match(String(error), /matched no image/);
      assert.match(String(error), /img >> nth=0 \("Tool landing"\) \[covered: open its page\]/);
      assert.match(String(error), /img >> nth=1 \("Plain shot"\)(?! \[covered)/);
      assert.doesNotMatch(String(error), /avatar/, 'small images are not works');
      return true;
    });
    await assert.rejects(shot('img >> nth=0'), /covered by an overlay.*open the work's own page/);
  } finally { await browser.close(); }
});
