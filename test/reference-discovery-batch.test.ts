import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseDiscoveryBatchInput, runDiscoveryBatch } from '../core/ref/discovery-batch.ts';
import { readDirectDiscoveryEntry } from '../core/ref/discovery-record.ts';
import { readSearchExecution } from '../core/ref/search-execution.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { directoryHtml, GALLERY_DIRECTORY, GALLERY_ITEM } from './helpers/discovery-capture.ts';

const search = { kind: 'search', input: { lane: 'design', query: 'task panels',
  url: 'https://www.google.com/search?q=task+panels', queryParam: 'q' } } as const;
const navigate = { kind: 'navigate', source: GALLERY_DIRECTORY, lane: 'design', entry: 'free-gallery' } as const;

test('discovery batch rejects invalid items before starting a browser', () => {
  assert.throws(() => parseDiscoveryBatchInput([search, { ...navigate, source: 'http://127.0.0.1/' }]));
  assert.throws(() => parseDiscoveryBatchInput([{ ...navigate, extra: true }]));
  assert.throws(() => parseDiscoveryBatchInput([]));
});

test('the public CLI dispatches discover-batch and validates its whole manifest before capture', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-discovery-batch-cli-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifest = join(root, 'batch.json');
  writeFileSync(manifest, JSON.stringify([search, { ...navigate, source: 'http://127.0.0.1/' }]));
  const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'ref', 'discover-batch', '--input', manifest, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /canonical public HTTPS URLs/);
});

test('independent search and gallery entry run concurrently in one browser with signed per-item evidence', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-discovery-batch-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const items = parseDiscoveryBatchInput([search, navigate]);
  await withBrowser(async browser => {
    let active = 0;
    let maxActive = 0;
    let searchStatus = 200;
    const shared = new Proxy(browser, { get(target, property) {
      if (property !== 'newContext') return Reflect.get(target, property, target);
      return async (...args: Parameters<typeof browser.newContext>) => {
        const context = await target.newContext(...args);
        active++;
        maxActive = Math.max(maxActive, active);
        context.on('close', () => { active--; });
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          await page.route(search.input.url, route => route.fulfill({ status: searchStatus, contentType: 'text/html',
            body: `<main><h1>Search fixture</h1><a href="${GALLERY_DIRECTORY}">Design gallery</a></main>` }));
          await page.route(GALLERY_DIRECTORY, route => route.fulfill({ status: 200, contentType: 'text/html',
            body: directoryHtml(GALLERY_ITEM) }));
          return page;
        };
        return context;
      };
    } });
    const result = await runDiscoveryBatch(shared, root, items, createTestProjectWriteAdapter(root));
    assert.equal(result.concurrency, 2);
    assert.equal(maxActive, 2);
    assert.deepEqual(result.outcomes.map(outcome => outcome.ok), [true, true]);
    const first = result.outcomes[0];
    const second = result.outcomes[1];
    assert.ok(first?.kind === 'search' && first.receipt);
    assert.ok(second?.kind === 'navigate' && second.receipt);
    assert.equal(readSearchExecution(root, first.receipt, 'design').status, 'page-observed');
    assert.ok(readDirectDiscoveryEntry(root, second.receipt).links.includes(GALLERY_ITEM));
    searchStatus = 403;
    const partial = await runDiscoveryBatch(shared, root, items, createTestProjectWriteAdapter(root));
    assert.deepEqual(partial.outcomes.map(outcome => outcome.ok), [false, true]);
    const failedSearch = partial.outcomes[0];
    const survivingVisit = partial.outcomes[1];
    assert.ok(failedSearch?.kind === 'search' && failedSearch.receipt);
    assert.ok(survivingVisit?.kind === 'navigate' && survivingVisit.receipt);
    assert.equal(readSearchExecution(root, failedSearch.receipt, 'design').status, 'http-error');
    assert.ok(readDirectDiscoveryEntry(root, survivingVisit.receipt).links.includes(GALLERY_ITEM));
  });
});
