import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { designDiscoveryProvider } from '../core/ref/design-discovery-sources.ts';
import { executeReferenceSearch, parseSearchInput, readSearchExecution, validateSearchCoverage } from '../core/ref/search-execution.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { buildReferenceDiscoveryPlan } from '../core/ref/discovery-plan.ts';
import { routeAdaptiveFlow } from '../core/route/index.ts';

const inputs = [
  { lane: 'design', query: 'benefits dashboard', url: 'https://dribbble.com/search/benefits-dashboard', queryParam: 'path' },
  { lane: 'design', query: 'dashboard', url: 'https://www.pinterest.com/search/pins/?q=dashboard', queryParam: 'q' },
  { lane: 'design', query: 'dashboard', url: 'https://www.siteinspire.com/search?query=dashboard', queryParam: 'query' },
] as const;

test('discovery plan supplies executable gallery searches without requiring invented item URLs', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-gallery-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const route = routeAdaptiveFlow(JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8')));
  const plan = buildReferenceDiscoveryPlan(root, route);
  const native: unknown = Reflect.get(plan.designSourcePolicy, 'nativeSearchInputs');
  assert.ok(Array.isArray(native));
  assert.equal(native.length, 3);
  for (const input of native) {
    const parsed = parseSearchInput(input);
    assert.equal(parsed.lane, 'design');
    assert.equal(parsed.query, 'app interface');
  }
});

test('native free gallery searches bind exact queries and cannot impersonate domain searches', () => {
  for (const input of inputs) {
    assert.deepEqual(parseSearchInput(input), input);
    assert.throws(() => parseSearchInput({ ...input, query: 'unrelated query' }));
    assert.throws(() => parseSearchInput({ ...input, lane: 'domain' }));
  }
  assert.throws(() => parseSearchInput({ ...inputs[0], url: 'https://example.org/search/benefits-dashboard' }));
  assert.throws(() => parseSearchInput({ ...inputs[1], url: `${inputs[1].url}&q=dashboard` }));
});

test('current Siteinspire item URLs are gallery items but directory aliases are not', () => {
  assert.equal(designDiscoveryProvider('https://www.siteinspire.com/website/13593-yuri-roga'), 'Siteinspire');
  assert.equal(designDiscoveryProvider('https://www.siteinspire.com/websites/10267-linear'), 'Siteinspire');
  for (const path of ['/', '/search?query=dashboard', '/websites/selected', '/websites/category/minimal']) {
    assert.equal(designDiscoveryProvider(`https://www.siteinspire.com${path}`), null);
  }
});

test('gallery search requires observed same-provider items; login walls and unrelated links cannot establish coverage', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-gallery-search-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  await withBrowser(async browser => {
    let status = 200;
    const item = 'https://dribbble.com/shots/19161192-Benefits-Dashboard-UI';
    let body = `<h1>Benefits dashboard</h1><a href="${item}">Benefits Dashboard UI</a>`;
    const proxy = new Proxy(browser, { get(target, prop) {
      if (prop !== 'newContext') return Reflect.get(target, prop, target);
      return async (...args: Parameters<typeof browser.newContext>) => {
        const context = await browser.newContext(...args);
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          await page.route('https://dribbble.com/**', route => route.fulfill({ status, contentType: 'text/html', body }));
          return page;
        };
        return context;
      };
    } });
    const receipt = await executeReferenceSearch(proxy, inputs[0], writer);
    const record = readSearchExecution(root, receipt, 'design');
    assert.equal(record.status, 'gallery-observed');
    assert.equal(record.httpStatus, 200);
    assert.equal(validateSearchCoverage(root, 'design', [inputs[0].query], [receipt], [item]).executed, 1);
    assert.equal(existsSync(join(root, '.omd/refs')), false);
    for (const next of [
      { status: 202, body },
      { status: 200, body: '<h1>Sign in to get the best experience</h1>' },
      { status: 200, body: '<a href="https://www.benefits.gov/">Benefits service</a>' },
      { status: 403, body },
    ]) {
      status = next.status; body = next.body;
      const failed = await executeReferenceSearch(proxy, inputs[0], writer);
      assert.notEqual(readSearchExecution(root, failed, 'design').status, 'gallery-observed');
      assert.throws(() => validateSearchCoverage(root, 'design', [inputs[0].query], [failed], [item]), /not an observed/);
    }
  });
});
