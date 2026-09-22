import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { designDiscoveryIdentity, designDiscoveryItemIdentity, designDiscoveryProvider } from '../core/ref/design-discovery-sources.ts';
import { executeReferenceSearch, parseSearchInput, readSearchExecution, validateSearchCoverage } from '../core/ref/search-execution.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { buildReferenceDiscoveryPlan } from '../core/ref/discovery-plan.ts';
import { routeAdaptiveFlow } from '../core/route/index.ts';

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));

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
  assert.equal(native.length, 2);
  for (const input of native) {
    const parsed = parseSearchInput(input);
    assert.equal(parsed.lane, 'design');
    assert.equal(parsed.query, 'app interface');
  }
});

test('installed CLI flushes the complete discovery plan for automation consumers', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-gallery-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'));
  copyFileSync(fileURLToPath(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url)), join(root, 'route-input.json'));
  const run = (args: readonly string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  const classified = run(['route', 'classify', '--input', 'route-input.json', '--json']);
  assert.equal(classified.status, 0, classified.stderr);
  const discovered = run(['ref', 'discover-plan', '--json']);
  assert.equal(discovered.status, 0, discovered.stderr);
  const plan = JSON.parse(discovered.stdout);
  assert.deepEqual(plan.galleryDirectories, ['Mobbin', 'Page Flows', 'Pinterest', 'Dribbble', 'Behance', 'UI Bowl']);
});

test('product-screen providers accept concrete screens but reject their directory pages', () => {
  assert.equal(designDiscoveryProvider('https://mobbin.com/explore/screens/7b35b6c7-f954-4dcb-b320-3ad873339477'), 'Mobbin');
  assert.equal(designDiscoveryProvider('https://pageflows.com/screens/6753bc45-9853-4b61-a78e-c95827d347e5/'), 'Page Flows');
  for (const url of ['https://mobbin.com/explore/screens', 'https://pageflows.com/screens/']) {
    assert.equal(designDiscoveryProvider(url), null);
  }
});

test('selected discovery offers explicit direct public entry inputs while skipped discovery offers none', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-direct-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const makePlan = (fixture: string) => buildReferenceDiscoveryPlan(root,
    routeAdaptiveFlow(JSON.parse(readFileSync(new URL(`fixtures/adaptive-flow/${fixture}.json`, import.meta.url), 'utf8'))));
  const plan = makePlan('medical-new-product');
  const entries: unknown = Reflect.get(plan.designSourcePolicy, 'nativeEntryInputs');
  assert.ok(Array.isArray(entries) && entries.length > 0);
  for (const entry of entries) {
    assert.equal(entry.lane, 'design');
    assert.equal(entry.entry, 'free-gallery');
    assert.ok(plan.designSourcePolicy.candidates.some(candidate => candidate.url === entry.url));
    assert.equal(designDiscoveryProvider(entry.url), null, 'a directory lead is not an already selected gallery item');
  }
  assert.equal(plan.sourcePolicy, 'current-search-or-direct-public-then-live-inspection');
  assert.deepEqual(Reflect.get(makePlan('copy-only').designSourcePolicy, 'nativeEntryInputs'), []);
  assert.equal(Reflect.get(makePlan('copy-only').designSourcePolicy, 'domainEntryCommand'), null);
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

test('gallery item identity ignores tracking and mutable display aliases', () => {
  assert.equal(
    designDiscoveryItemIdentity('https://www.pinterest.com/pin/123456789/?utm_source=one'),
    designDiscoveryItemIdentity('https://www.pinterest.co.kr/pin/%31%32%33%34%35%36%37%38%39/?utm_source=two#detail'),
  );
  assert.equal(
    designDiscoveryItemIdentity('https://dribbble.com/shots/12345678-Old-title'),
    designDiscoveryItemIdentity('https://dribbble.com/shots/12345678-New-title?utm_campaign=x'),
  );
  assert.equal(
    designDiscoveryItemIdentity('https://dribbble.com/shots/0012345678-Old-title'),
    designDiscoveryItemIdentity('https://dribbble.com/shots/12345678-New-title'),
  );
  assert.notEqual(
    designDiscoveryItemIdentity('https://dribbble.com/shots/12345678-Task-workspace'),
    designDiscoveryItemIdentity('https://dribbble.com/shots/87654321-Task-workspace'),
  );
  assert.equal(
    designDiscoveryItemIdentity('https://land-book.com/websites/finance-dashboard'),
    designDiscoveryItemIdentity('https://land-book.com/websites/%66inance-dashboard?utm_source=alias'),
  );
  assert.equal(designDiscoveryProvider('https://www.pinterest.com/pin/%2531%2532%2533/'), null);
  assert.equal(designDiscoveryProvider('https://land-book.com/websites/%2566inance-dashboard'), null);
  assert.equal(
    designDiscoveryItemIdentity('https://uibowl.io/screen/task/detail'),
    designDiscoveryItemIdentity('https://uibowl.io/screens/task/detail'),
  );
  assert.equal(
    designDiscoveryIdentity('https://gallery.example/item/?utm_source=one#detail'),
    designDiscoveryIdentity('https://gallery.example/item'),
  );
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
