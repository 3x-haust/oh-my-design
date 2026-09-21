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

test('a rendered Bing redirect remains an observed destination with its actual pixels', async t => {
  const h = await observe(t, { html: `${navbar}<main><a href="${redirect}">Benefits</a></main>` });
  assert.equal(h.execution.status, 'page-observed');
  assert.ok(h.execution.links.includes(redirect));
  assert.ok(h.execution.results?.some(result => result.url === redirect && result.text === 'Benefits'));
  assert.equal(validateSearchCoverage(h.root, 'domain', [input.query], [h.receipt], [target]).executed, 1);
  assert.ok(h.execution.capture);
  assert.deepEqual(readFileSync(join(h.root, h.execution.capture.path)), h.captures[0]);
});

test('a visible result cannot inherit market scope from a hidden descendant', async t => {
  const h = await observe(t, { html: `${navbar}<main><a href="${redirect}">Visible item <span style="opacity:0">South Korea residents service</span><span style="clip-path:inset(100%)">South Korea product gallery</span><span style="color:transparent">South Korea service market</span></a></main>` });
  assert.equal(h.execution.status, 'page-observed');
  assert.deepEqual(h.execution.results?.find(result => result.url === redirect),
    { url: redirect, text: 'Visible item' });
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
