import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { executeReferenceSearch, observedSearchTargets, parseSearchInput, readSearchExecution, searchChallengeReason, validateSearchCoverage } from '../core/ref/search-execution.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';

const input = { lane: 'design', query: 'task panels', url: 'https://www.google.com/search?q=task+panels', queryParam: 'q' };
function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-search-execution-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test('a query plan is not evidence; exact query URL binding rejects ambiguous, credentialed and non-HTTPS input', () => {
  assert.equal(parseSearchInput(input).query, input.query);
  for (const url of ['https://www.google.com/search?q=wrong', `${input.url}&q=task+panels`, 'http://www.google.com/search?q=task+panels', 'https://user:pass@www.google.com/search?q=task+panels', `${input.url}#fragment`, 'https://domain.example/service?q=task+panels']) {
    assert.throws(() => parseSearchInput({ ...input, url }));
  }
  assert.throws(() => parseSearchInput({ ...input, visited: true }));
});
test('Korean public Daum search is accepted only with its exact web-search query', () => {
  const daum = { lane: 'domain', query: '한국 복지 서비스',
    url: 'https://search.daum.net/search?w=tot&q=%ED%95%9C%EA%B5%AD+%EB%B3%B5%EC%A7%80+%EC%84%9C%EB%B9%84%EC%8A%A4', queryParam: 'q' };
  assert.equal(parseSearchInput(daum).query, daum.query);
  assert.throws(() => parseSearchInput({ ...daum, url: daum.url.replace('w=tot', 'w=img') }));
  assert.throws(() => parseSearchInput({ ...daum, url: `${daum.url}&q=extra` }));
});
test('real isolated browser execution records actual DOM links and pixels, and preserves an HTTP failure', async t => {
  const root = fixture(t); const writer = createTestProjectWriteAdapter(root);
  const contextOptions: unknown[] = [];
  await withBrowser(async browser => {
    // Real Chromium page with test-owned responses, not internet search quality or provider availability.
    let status = 200;
    let body = `<html><body><h1>Search test fixture</h1><a href="https://www.pinterest.com/pin/123/"><script>document.write(
      [typeof RTCPeerConnection, typeof globalThis.webkitRTCPeerConnection, typeof WebTransport].every(value => value === 'undefined')
        ? 'Proxy-only design entry' : 'Unsafe realtime transport')</script></a></body></html>`;
    const observed: string[] = [];
    const proxy = new Proxy(browser, { get(target, prop) {
      if (prop !== 'newContext') return Reflect.get(target, prop, target);
      return async (...args: Parameters<typeof browser.newContext>) => {
        contextOptions.push(args[0]);
        const context = await browser.newContext(...args);
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          await page.route('https://www.google.com/**', async route => {
            observed.push(route.request().url());
            await route.fulfill({ status, contentType: 'text/html', body });
          });
          return page;
        };
        return context;
      };
    } });
    const receipt = await executeReferenceSearch(proxy, input, writer);
    const execution = readSearchExecution(root, receipt, 'design');
    assert.equal(existsSync(join(root, '.omd/refs')), false, 'search execution must not create retained reference files');
    assert.match(receipt.path, /^\.omd\/discovery\/design\/search-[a-f0-9]{64}\.json$/);
    assert.match(execution.capture?.path ?? '', /^\.omd\/discovery\/design\/search-[a-f0-9]{64}\.png$/);
    assert.equal(execution.status, 'page-observed');
    assert.deepEqual(execution.links, ['https://www.pinterest.com/pin/123/']);
    assert.deepEqual(execution.results, [{ url: 'https://www.pinterest.com/pin/123/', text: 'Proxy-only design entry' }]);
    assert.deepEqual(observed, [input.url]);
    assert.equal(validateSearchCoverage(root, 'design', [input.query], [receipt], execution.links).executed, 1);
    status = 403;
    const failed = await executeReferenceSearch(proxy, input, writer);
    assert.equal(readSearchExecution(root, failed, 'design').status, 'http-error');
    assert.throws(() => validateSearchCoverage(root, 'design', [input.query], [failed], execution.links), /not an observed search link/);
    assert.equal(validateSearchCoverage(root, 'design', [input.query], [failed, receipt], execution.links).failed, 1);
    status = 202;
    const pending = await executeReferenceSearch(proxy, input, writer);
    assert.equal(readSearchExecution(root, pending, 'design').status, 'http-error');
    status = 200; body = '<h1>Unfortunately, bots use DuckDuckGo too.</h1><p>Complete the following challenge to confirm this search was made by a human.</p>';
    const blocked = await executeReferenceSearch(proxy, input, writer);
    assert.equal(readSearchExecution(root, blocked, 'design').status, 'blocked');
    assert.equal(existsSync(join(root, '.omd/refs')), false, 'failed search evidence also stays outside retained references');
  });
  assert.equal(contextOptions.length, 4);
  for (const options of contextOptions as { proxy?: { server?: string } }[]) {
    assert.match(options.proxy?.server ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
  }
});

test('late search inspection failure preserves a trailing newline in its signed diagnostic', async t => {
  const root = fixture(t);
  const writer = createTestProjectWriteAdapter(root);
  let screenshotObserved = false;
  await withBrowser(async browser => {
    const proxy = new Proxy(browser, { get(target, prop) {
      if (prop !== 'newContext') return Reflect.get(target, prop, target);
      return async (...args: Parameters<typeof browser.newContext>) => {
        const context = await browser.newContext(...args);
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          await page.route('https://www.google.com/**', route => route.fulfill({
            status: 200, contentType: 'text/html', body: '<h1>Search fixture before inspection fails</h1>',
          }));
          const screenshot = page.screenshot.bind(page);
          page.screenshot = async options => { const bytes = await screenshot(options); screenshotObserved = true; return bytes; };
          const locate = page.locator.bind(page);
          page.locator = (...locatorArgs: Parameters<typeof page.locator>) => {
            if (locatorArgs[0] === 'body' && screenshotObserved) throw new Error('test-owned link inspection failure\n');
            return locate(...locatorArgs);
          };
          return page;
        };
        return context;
      };
    } });
    const receipt = await executeReferenceSearch(proxy, input, writer);
    const execution = readSearchExecution(root, receipt, 'design');
    assert.equal(screenshotObserved, true);
    assert.equal(execution.status, 'navigation-error');
    assert.equal(execution.error, 'test-owned link inspection failure\n');
    assert.equal(execution.capture, null);
    assert.deepEqual(readdirSync(join(root, '.omd/discovery/design')), [receipt.path.split('/').at(-1)]);
    assert.equal(existsSync(join(root, '.omd/refs')), false);
  });
});

test('historical and current exact receipt identities read the same unmodified execution', t => {
  const root = fixture(t);
  const historical = testSearchReceipt(root, 'design', input.query, []);
  const bytes = readFileSync(join(root, historical.path));
  const current = { ...historical, path: historical.path.replace('.omd/refs/', '.omd/discovery/') };
  mkdirSync(join(root, '.omd/discovery/design'), { recursive: true });
  writeFileSync(join(root, current.path), bytes);
  assert.deepEqual(readSearchExecution(root, current, 'design'), readSearchExecution(root, historical, 'design'));
  assert.deepEqual(readFileSync(join(root, historical.path)), bytes);
  for (const path of [current.path.replace('/design/', '/domain/'), current.path.replace('/design/', '/design/../design/'), current.path.replace('/design/', '/design/nested/')]) {
    assert.throws(() => readSearchExecution(root, { ...current, path }, 'design'), /lane path/);
  }
  assert.throws(() => readSearchExecution(root, { ...current, sha256: '0'.repeat(64) }, 'design'), /lane path/);
  writeFileSync(join(root, current.path), Buffer.concat([bytes, Buffer.from(' ')]));
  assert.throws(() => readSearchExecution(root, current, 'design'), /changed/);
});

test('a signed v2 search stays readable but cannot establish current result provenance', t => {
  const root = fixture(t);
  const source = 'https://service.example/task';
  const latest = testSearchReceipt(root, 'domain', 'service task', [source]);
  const current = JSON.parse(readFileSync(join(root, latest.path), 'utf8')) as Record<string, unknown>;
  const { signature: _signature, ...fields } = current;
  const unsigned = { ...fields, schema: 'reference-search-execution-v2' };
  const legacy = { ...unsigned, signature: signNativeObservation(root, unsigned.schema,
    createHash('sha256').update(canonicalJson(unsigned)).digest('hex')) };
  const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const receipt = { path: `.omd/discovery/domain/search-${sha256}.json`, sha256 };
  mkdirSync(join(root, '.omd/discovery/domain'), { recursive: true });
  writeFileSync(join(root, receipt.path), bytes);
  assert.equal(readSearchExecution(root, receipt, 'domain').schema, 'reference-search-execution-v2');
  assert.throws(() => validateSearchCoverage(root, 'domain', ['service task'], [receipt], [source]), /current signed search execution/);
});

test('a self-hashed search receipt without the native execution signature is refused', t => {
  const root = fixture(t);
  const receipt = testSearchReceipt(root, 'design', input.query, ['https://www.pinterest.com/pin/123/']);
  const record = JSON.parse(readFileSync(join(root, receipt.path), 'utf8'));
  record.signature = Buffer.alloc(64).toString('base64');
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const path = `.omd/discovery/design/search-${sha256}.json`;
  mkdirSync(join(root, '.omd/discovery/design'), { recursive: true });
  writeFileSync(join(root, path), bytes);
  assert.throws(() => readSearchExecution(root, { path, sha256 }, 'design'), /signature invalid/);
});

test('a changed signed failure reason is refused even with a new receipt hash, and invalid reasons stay invalid', t => {
  const root = fixture(t);
  const receipt = testSearchReceipt(root, 'design', input.query, [], true);
  const record = JSON.parse(readFileSync(join(root, receipt.path), 'utf8'));
  assert.equal(readSearchExecution(root, receipt, 'design').error, 'HTTP 403');
  for (const [error, expected] of [
    ['HTTP 404\n', /signature invalid/],
    [' \n ', /missing\/oversized text/],
    ['x'.repeat(4097), /missing\/oversized text/],
  ] as const) {
    record.error = error;
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const path = `.omd/discovery/design/search-${sha256}.json`;
    mkdirSync(join(root, '.omd/discovery/design'), { recursive: true });
    writeFileSync(join(root, path), bytes);
    assert.throws(() => readSearchExecution(root, { path, sha256 }, 'design'), expected);
  }
});

test('challenge detection rejects strong challenge text without treating ordinary bot-related search content as blocked', () => {
  assert.ok(searchChallengeReason('Unfortunately, bots use DuckDuckGo too.'));
  assert.equal(searchChallengeReason('Search results: bot dashboard design and human-readable traffic charts.'), null);
});

test('only observed known-provider redirect links can discover a destination', () => {
  const target = 'https://www.pinterest.com/pin/123/';
  assert.ok(observedSearchTargets({ links: [`https://duckduckgo.com/l/?uddg=${encodeURIComponent(target)}`] }).includes(target));
  assert.ok(observedSearchTargets({ links: [`https://www.google.com/url?q=${encodeURIComponent(target)}`] }).includes(target));
  assert.ok(observedSearchTargets({ links: [`https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString('base64url')}`] }).includes(target));
  assert.ok(!observedSearchTargets({ links: [`https://unrelated.example/l/?uddg=${encodeURIComponent(target)}`] }).includes(target));
});
test('similarity navigation remains rooted in a successful search, never an unrooted cycle', t => {
  const root = fixture(t);
  const a = 'https://www.pinterest.com/pin/123/';
  const b = 'https://www.pinterest.com/pin/456/';
  const c = 'https://www.pinterest.com/pin/789/';
  const receipt = testSearchReceipt(root, 'design', input.query, [a]);
  const hops = [{ url: b, finalUrl: b, links: [c] }, { url: a, finalUrl: a, links: [b] }];
  assert.equal(validateSearchCoverage(root, 'design', [input.query], [receipt], [c], hops).executed, 1);
  assert.throws(() => validateSearchCoverage(root, 'design', [input.query], [receipt], [c], hops.slice(0, 1)), /not an observed/);
  assert.throws(() => validateSearchCoverage(root, 'design', [input.query], [receipt], [c], [{ url: b, finalUrl: b, links: [c] }, { url: c, finalUrl: c, links: [b] }]), /not an observed/);
  const failed = testSearchReceipt(root, 'design', input.query, [a], true);
  assert.throws(() => validateSearchCoverage(root, 'design', [input.query], [failed], [c], hops), /not an observed/);
});

test('a visible but unrelated search header link cannot establish research reachability', t => {
  const root = fixture(t);
  const target = 'https://support.microsoft.com/topic/accessibility-in-bing';
  const receipt = testSearchReceipt(root, 'domain', 'medication order', [target], false,
    new Date().toISOString(), 'Accessibility help');
  assert.throws(() => validateSearchCoverage(root, 'domain', ['medication order'], [receipt], [target]), /not an observed search link/);
});

test('short Korean service names and task synonyms remain valid search results', t => {
  const root = fixture(t);
  for (const row of [
    { query: '웰로', url: 'https://www.welfarehello.com/recommend-policy/', label: '웰로 맞춤형 정책 추천' },
    { query: 'medication order', url: 'https://www.walgreens.com/topic/pharmacy/prescription-refills.jsp',
      label: 'Walgreens Prescription Refills' },
  ]) {
    const receipt = testSearchReceipt(root, 'domain', row.query, [row.url], false, new Date().toISOString(), row.label);
    assert.equal(validateSearchCoverage(root, 'domain', [row.query], [receipt], [row.url]).executed, 1);
  }
});

test('a signed search from before route publication cannot satisfy current research', t => {
  const root = fixture(t);
  const source = 'https://service.example/task';
  const receipt = testSearchReceipt(root, 'domain', 'service task', [source]);
  mkdirSync(join(root, '.omd'), { recursive: true });
  const routePath = join(root, '.omd/route.json');
  writeFileSync(routePath, '{}');
  const later = new Date(Date.now() + 1000);
  utimesSync(routePath, later, later);
  assert.throws(() => validateSearchCoverage(root, 'domain', ['service task'], [receipt], [source]), /after the route publication is required/);
});
test('written query lists, wrong-lane receipts, unobserved entries, stale bytes and symlinks fail closed', t => {
  const root = fixture(t);
  const links = ['https://www.pinterest.com/pin/123/'];
  const receipt = testSearchReceipt(root, 'design', input.query, links);
  assert.throws(() => validateSearchCoverage(root, 'design', [input.query], [], links), /queries/);
  assert.throws(() => readSearchExecution(root, receipt, 'domain'), /lane path/);
  assert.throws(() => validateSearchCoverage(root, 'design', [input.query], [receipt], ['https://dribbble.com/shots/999']), /not an observed search link/);
  assert.throws(() => validateSearchCoverage(root, 'design', ['different query'], [receipt], links), /queries/);
  assert.throws(() => validateSearchCoverage(root, 'design', [input.query], [receipt, receipt], links), /duplicate/);
  const path = join(root, receipt.path); const bytes = readFileSync(path);
  writeFileSync(path, `${bytes.toString()} `);
  assert.throws(() => readSearchExecution(root, receipt, 'design'), /changed/);
  writeFileSync(`${path}.backup`, bytes); rmSync(path); symlinkSync(`${path}.backup`, path);
  assert.throws(() => readSearchExecution(root, receipt, 'design'), /stably|symlink|regular/);
});
