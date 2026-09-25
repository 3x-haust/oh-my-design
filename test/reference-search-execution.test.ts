import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { executeReferenceSearch, observedSearchTargets, parseSearchInput, readSearchExecution, searchChallengeReason, validateSearchCoverage } from '../core/ref/search-execution.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';

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

test('late search inspection failure records the diagnostic without an orphan screenshot', async t => {
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
            if (locatorArgs[0] === 'body' && screenshotObserved) throw new Error('test-owned link inspection failure');
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
    assert.equal(execution.error, 'test-owned link inspection failure');
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
