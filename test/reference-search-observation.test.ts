import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Page } from 'playwright';
import { withBrowser } from '../core/render/index.ts';
import { executeReferenceSearch, readSearchExecution, searchObserved, validateSearchCoverage } from '../core/ref/search-execution.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';

const target = 'https://www.gov.uk/browse/benefits';
const redirect = `https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString('base64url')}`;
const input = { lane: 'domain', query: 'gov.uk benefits', url: 'https://www.bing.com/search?q=gov.uk+benefits', queryParam: 'q' };
const navbar = '<nav><a href="https://www.bing.com/images">Images</a></nav>';
type Scenario = Readonly<{
  html: string;
  input?: typeof input;
  afterCapture?: (page: Page, count: number) => Promise<void>;
  afterNavigation?: (page: Page) => Promise<void>;
}>;

function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-search-observation-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

async function observe(t: { after(fn: () => void): void }, scenario: Scenario) {
  const root = fixture(t);
  const request = scenario.input ?? input;
  const captures: Buffer[] = [];
  const abortedMethods: string[] = [];
  return withBrowser(async browser => {
    const proxy = new Proxy(browser, { get(browser, property) {
      if (property !== 'newContext') return Reflect.get(browser, property, browser);
      return async (...args: Parameters<typeof browser.newContext>) => {
        const context = await browser.newContext(...args);
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          await page.route(request.url, route => route.fulfill({ status: 200, contentType: 'text/html', body: scenario.html }));
          page.on('requestfailed', request => { abortedMethods.push(request.method()); });
          const screenshot = page.screenshot.bind(page);
          page.screenshot = async options => {
            const bytes = await screenshot(options); captures.push(bytes);
            await scenario.afterCapture?.(page, captures.length);
            return bytes;
          };
          const goto = page.goto.bind(page);
          page.goto = async (...args: Parameters<typeof page.goto>) => {
            const response = await goto(...args); await scenario.afterNavigation?.(page); return response;
          };
          return page;
        };
        return context;
      };
    } });
    const receipt = await executeReferenceSearch(proxy, request, createTestProjectWriteAdapter(root));
    return { root, receipt, captures, abortedMethods, execution: readSearchExecution(root, receipt, request.lane === 'domain' ? 'domain' : 'design') };
  });
}

test('hidden result anchors cannot turn a navbar-only capture into observed discovery', async t => {
  const h = await observe(t, { html: `${navbar}
    <section style="opacity:0"><a href="${redirect}">Transparent result</a></section>
    <section style="display:none"><a href="https://hidden.example/">Removed result</a></section>
    <a style="visibility:hidden" href="https://invisible.example/">Invisible result</a>` });
  assert.deepEqual(h.execution.links, ['https://www.bing.com/images']);
  assert.deepEqual(h.execution.results, [{ url: 'https://www.bing.com/images', text: 'Images' }]);
  assert.equal(h.execution.status, 'empty-observation');
  assert.equal(searchObserved(h.execution), false);
  assert.ok(h.execution.capture);
  assert.throws(() => validateSearchCoverage(h.root, 'domain', [input.query], [h.receipt], [target]), /not an observed/);
});

test('only canonical visible HTTPS links are retained', async t => {
  const valid = 'https://valid.example/service';
  const h = await observe(t, { html: `${navbar}<main>
    <a href="${valid}">Visible service</a>
    <a href="http://insecure.example/service">Insecure</a>
    <a href="https://user:secret@credentialed.example/service">Credentialed</a>
    <a href="https://fragment.example/service#details">Fragment</a>
    <a href="javascript:void(0)">Script</a>
    <a href="about:blank">Blank</a>
    <a href="https://scaled.example/service" style="transform:scale(.001)">Scaled away</a>
    <a href="https://clipped.example/service" style="clip-path:circle(0)">Clipped away</a>
    <a href="https://contrast.example/service" style="color:white;background:white">No contrast</a>
  </main>` });
  assert.deepEqual(h.execution.links, ['https://www.bing.com/images', valid]);
  assert.deepEqual(h.execution.results?.find(result => result.url === valid),
    { url: valid, text: 'Visible service' });
});

test('a rendered Bing redirect remains an observed destination with its actual pixels', async t => {
  const h = await observe(t, { html: `${navbar}<main><a style="filter:drop-shadow(1px 1px black);clip-path:inset(0);mask-image:linear-gradient(black,black)" href="${redirect}">Benefits</a></main>` });
  assert.equal(h.execution.status, 'page-observed');
  assert.ok(h.execution.links.includes(redirect));
  assert.ok(h.execution.results?.some(result => result.url === redirect && result.text === 'Benefits'));
  assert.equal(validateSearchCoverage(h.root, 'domain', [input.query], [h.receipt], [target]).executed, 1);
  assert.ok(h.execution.capture);
  assert.deepEqual(readFileSync(join(h.root, h.execution.capture.path)), h.captures[0]);
});

test('visible stacking, clipping, masks and transparent overlays preserve real labels', async t => {
  const clear = 'https://clear.example/service'; const transparent = 'https://transparent.example/service';
  const h = await observe(t, { html: `${navbar}<style>.clear::after{content:"";position:absolute;inset:0;background:white;opacity:0}</style><main><div style="position:relative"><a href="${redirect}" style="position:relative;z-index:10;clip-path:polygon(0 0,100% 0,100% 100%,0 100%);mask-image:linear-gradient(white,white)">South Korea service for residents</a><span style="position:absolute;inset:0;z-index:1;background:white;pointer-events:none"></span></div><a class="clear" style="position:relative" href="${clear}">Visible supporting copy</a><div style="position:relative;background:rgba(0,0,0,.01)"><a href="${transparent}">Visible through transparent overlay</a><span style="position:absolute;inset:0;background:rgba(255,255,255,.01);pointer-events:none"></span></div></main>` });
  assert.equal(h.execution.results?.find(result => result.url === redirect)?.text,
    'South Korea service for residents');
  assert.equal(h.execution.results?.find(result => result.url === clear)?.text, 'Visible supporting copy');
  assert.equal(h.execution.results?.find(result => result.url === transparent)?.text,
    'Visible through transparent overlay');
});

test('a visible result cannot inherit market scope from a hidden descendant', async t => {
  const h = await observe(t, { html: `${navbar}<main><a href="${redirect}">Visible item <span style="opacity:0">South Korea residents service</span><span style="clip-path:inset(100%)">South Korea product gallery</span><span style="clip-path:circle(0)">South Korea resident product</span><span style="mask-image:linear-gradient(transparent,transparent)">South Korea product interface</span><span style="filter:blur(100px)">South Korea service application</span><span style="color:transparent">South Korea service market</span><span style="color:rgba(0,0,0,.01)">South Korea resident service</span><span style="color:black;-webkit-text-fill-color:white;background:white">South Korea public service</span><span style="color:white;background:white">South Korea benefit service</span><span style="font-size:1px;line-height:1px">South Korea resident platform</span><span style="transform:scale(.05)">South Korea service portal</span><span style="transform:scale(.001)">South Korea support platform</span><span style="transform:scale(.2)"><span style="transform:scale(.2)">South Korea support directory</span></span><span style="filter:opacity(.001)">South Korea product service</span><span style="opacity:.1"><span style="opacity:.1"><span style="opacity:.1">South Korea service for residents</span></span></span></a></main>` });
  assert.equal(h.execution.status, 'page-observed');
  assert.deepEqual(h.execution.results?.find(result => result.url === redirect),
    { url: redirect, text: 'Visible item' });
});

test('an opaque pseudo-element cannot leave covered market text as visible evidence', async t => {
  const sibling = 'https://sibling.example/service';
  const pseudoSibling = 'https://pseudo-sibling.example/service';
  const imageCovered = 'https://image-covered.example/service';
  const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3Crect width="100%25" height="100%25" fill="white"/%3E%3C/svg%3E';
  const ancestor = 'https://ancestor-covered.example/service';
  const h = await observe(t, { html: `${navbar}<style>.covered{position:relative}.covered::after,.sibling-cover::after,.ancestor-cover::after{content:"";position:absolute;inset:0;background-image:linear-gradient(white,white)}</style><main><a href="https://visible.example/service">Visible result</a><a class="covered" href="${redirect}">South Korea service for residents</a><div style="position:relative"><a href="${sibling}">South Korea benefit service</a><span style="position:absolute;inset:0;background:white;pointer-events:none"></span></div><div style="position:relative"><a href="${pseudoSibling}">South Korea resident service</a><span class="sibling-cover" style="position:absolute;inset:0;pointer-events:none;z-index:1"></span></div><section class="ancestor-cover" style="position:relative"><div><a href="${ancestor}">South Korea support service</a></div></section><div style="position:relative"><a href="${imageCovered}">South Korea support platform</a><img src='${image}' style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1"></div></main>` });
  assert.equal(h.execution.status, 'page-observed');
  assert.equal(h.execution.results?.find(result => result.url === redirect), undefined);
  assert.equal(h.execution.results?.find(result => result.url === sibling), undefined);
  assert.equal(h.execution.results?.find(result => result.url === pseudoSibling), undefined);
  assert.equal(h.execution.results?.find(result => result.url === ancestor), undefined);
  assert.equal(h.execution.results?.find(result => result.url === imageCovered), undefined);
});

test('render observation does not mutate pointer-event styles', async t => {
  const h = await observe(t, { html: `${navbar}<main><a href="${redirect}">Visible service</a><span id="overlay" style="pointer-events:none;position:absolute"></span></main>`,
    afterNavigation: async page => page.evaluate(() => {
      const overlay = document.querySelector('#overlay');
      if (!overlay) throw new Error('missing overlay');
      new MutationObserver(() => { document.body.dataset.observedMutation = 'yes'; })
        .observe(overlay, { attributes: true, attributeFilter: ['style'] });
    }),
    afterCapture: async page => assert.equal(await page.locator('body').getAttribute('data-observed-mutation'), null),
  });
  assert.equal(h.execution.results?.find(result => result.url === redirect)?.text, 'Visible service');
});

test('hydration after a screenshot requires a coherent recapture before retaining links', async t => {
  const h = await observe(t, { html: navbar, afterCapture: async (page, count) => {
    if (count === 1) await page.evaluate(href => {
      const anchor = document.createElement('a'); anchor.href = href; anchor.textContent = 'Benefits result'; document.body.append(anchor);
    }, redirect);
  } });
  assert.equal(h.captures.length, 2);
  assert.equal(h.execution.status, 'page-observed');
  assert.ok(h.execution.capture);
  assert.notDeepEqual(h.captures[0], h.captures[1]);
  assert.deepEqual(readFileSync(join(h.root, h.execution.capture.path)), h.captures[1]);
  assert.ok(h.execution.links.includes(redirect));
});

test('continued snapshot changes exhaust two captures without publishing mismatched evidence', async t => {
  const h = await observe(t, { html: `<a href="${redirect}">Initial result</a>`, afterCapture: async (page, count) => {
    await page.evaluate(count => { const anchor = document.querySelector('a'); if (anchor) anchor.href = `https://changed.example/${count}`; }, count);
  } });
  assert.equal(h.captures.length, 2);
  assert.equal(searchObserved(h.execution), false);
  assert.equal(h.execution.capture, null);
  assert.deepEqual(h.execution.links, []);
  assert.deepEqual(readdirSync(join(h.root, '.omd/discovery/domain')), [h.receipt.path.split('/').at(-1)]);
});

test('below-fold results are offscreen evidence until rendered inside the captured viewport', async t => {
  const html = `${navbar}<main style="margin-top:1200px"><a id="result" href="${redirect}">Below-fold benefits</a></main>`;
  const offscreen = await observe(t, { html });
  assert.equal(offscreen.execution.status, 'empty-observation');
  assert.equal(offscreen.execution.links.includes(redirect), false);
  const visible = await observe(t, { html, afterNavigation: page => page.locator('#result').scrollIntoViewIfNeeded() });
  assert.equal(visible.execution.status, 'page-observed');
  assert.ok(visible.execution.links.includes(redirect));
});

test('empty gallery observations are neutral rather than fabricated challenge reports', async t => {
  const h = await observe(t, { html: '<h1>No matching items</h1>', input: {
    lane: 'design', query: 'benefits', url: 'https://www.pinterest.com/search/pins/?q=benefits', queryParam: 'q',
  } });
  assert.equal(h.execution.status, 'empty-observation');
  assert.ok(h.execution.capture);
  assert.equal(searchObserved(h.execution), false);
});

test('search observation still aborts POST requests without visiting another endpoint', async t => {
  const h = await observe(t, { html: `${navbar}<script>fetch('/test-submit', {method:'POST'}).catch(() => {});</script>` });
  assert.deepEqual(h.abortedMethods, ['POST']);
  assert.equal(h.execution.status, 'empty-observation');
});

test('historical page observations remain readable without retroactive visible-result claims', t => {
  const root = fixture(t);
  const receipt = testSearchReceipt(root, 'domain', input.query, []);
  const execution = readSearchExecution(root, receipt, 'domain');
  assert.equal(execution.status, 'page-observed');
  assert.deepEqual(execution.links, []);
});
