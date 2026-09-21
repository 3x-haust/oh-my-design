import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLiveFlowInput } from '../core/ref/live-flow.ts';
import { parseRuntimeInventoryInput } from '../core/tokens/runtime-inventory.ts';
import { parseSlopScope } from '../core/slop/review.ts';
import { browserDeadline, inspectionDeadline } from '../core/render/stateful.ts';
import { withBrowser } from '../core/render/index.ts';

const view = { id: 'entry', page: 'dist/index.html', viewport: { width: 240, height: 2560 } };
const step = { screenId: 'entry', state: 'entry', clicks: [], assertions: [{ selector: 'h1', state: 'visible' }] };
const flow = { schema: 'reference-flow-input-v1', sourceId: 'service', flowId: 'inspect', url: 'https://example.com/', viewport: view.viewport, steps: [step] };
const slop = { schema: 'slop-scope-v1', views: [view] };
const runtime = { schema: 'runtime-design-inventory-input-v1', views: [{ ...view, selectors: [{ id: 'heading', selector: 'h1' }] }] };

test('new inspection schemas reject empty, wrong-type and oversized inputs and accept exact boundaries', () => {
  for (const parse of [parseLiveFlowInput, parseSlopScope, parseRuntimeInventoryInput]) for (const input of [null, [], {}, '', 42]) assert.throws(() => parse(input));
  for (const width of [239, 2561, 240.5, '240', null]) {
    assert.throws(() => parseLiveFlowInput({ ...flow, viewport: { ...view.viewport, width } }));
    assert.throws(() => parseSlopScope({ ...slop, views: [{ ...view, viewport: { ...view.viewport, width } }] }));
    assert.throws(() => parseRuntimeInventoryInput({ ...runtime, views: [{ ...runtime.views[0], viewport: { ...view.viewport, width } }] }));
  }
  for (const size of [0, 25]) {
    assert.throws(() => parseLiveFlowInput({ ...flow, steps: Array.from({ length: size }, (_, i) => ({ ...step, screenId: `s${i}` })) }));
    assert.throws(() => parseSlopScope({ ...slop, views: Array.from({ length: size }, (_, i) => ({ ...view, id: `v${i}` })) }));
    assert.throws(() => parseRuntimeInventoryInput({ ...runtime, views: Array.from({ length: size }, (_, i) => ({ ...runtime.views[0], id: `v${i}` })) }));
  }
  assert.equal(parseLiveFlowInput({ ...flow, steps: Array.from({ length: 24 }, (_, i) => ({ ...step, screenId: `s${i}`, clicks: Array(8).fill('summary') })) }).steps.length, 24);
  assert.equal(parseSlopScope({ ...slop, views: Array.from({ length: 24 }, (_, i) => ({ ...view, id: `v${i}` })) }).length, 24);
  assert.equal(parseRuntimeInventoryInput({ ...runtime, views: Array.from({ length: 24 }, (_, i) => ({ ...runtime.views[0], id: `v${i}`, selectors: Array.from({ length: 32 }, (_, n) => ({ id: `c${n}`, selector: 'h1' })) })) }).views.length, 24);
  for (const clicks of ['h1', [null], Array(9).fill('summary')]) assert.throws(() => parseLiveFlowInput({ ...flow, steps: [{ ...step, clicks }] }));
  for (const selectors of [[], 'h1', [null], Array(33).fill({ id: 'a', selector: 'h1' }), [{ id: 'a', selector: 'h1' }, { id: 'a', selector: 'h2' }]]) assert.throws(() => parseRuntimeInventoryInput({ ...runtime, views: [{ ...runtime.views[0], selectors }] }));
  for (const state of [{}, { name: 'open', route: '/', startRoute: '/', actions: Array(25).fill({ kind: 'click', selector: 'h1' }), assertions: step.assertions }, { name: 'open', route: '/', startRoute: '/', actions: [{ kind: 'press', selector: 'body', value: 'Meta+Q' }], assertions: step.assertions }]) assert.throws(() => parseSlopScope({ ...slop, views: [{ ...view, state }] }));
  assert.throws(() => parseLiveFlowInput({ ...flow, steps: [step, step] }));
  assert.throws(() => parseSlopScope({ ...slop, views: [view, view] }));
});

test('overall browser deadline closes real stalled navigation and font waits', async () => {
  await withBrowser(async browser => {
    for (const mode of ['navigation', 'font'] as const) {
      const context = await browser.newContext(), page = await context.newPage();
      let closed = false;
      context.on('close', () => { closed = true; });
      await context.route('https://stall.example/**', route => {
        if (mode === 'font' && route.request().url().endsWith('/')) return route.fulfill({ contentType: 'text/html', body: '<style>@font-face{font-family:Stall;src:url(/font.woff2)}body{font-family:Stall}</style><h1>Waiting</h1>' });
        // Intentionally never resolve the controlled response.
      });
      const start = Date.now();
      await assert.rejects(() => browserDeadline(context, async () => {
        await page.goto('https://stall.example/', { waitUntil: 'domcontentloaded', timeout: 0 });
        await page.evaluate(() => document.fonts.ready);
      }, 300), /BROWSER_DEADLINE/);
      await context.close();
      assert.equal(closed, true);
      assert.ok(Date.now() - start < 5000);
    }
  });
});

test('absolute deadline bounds stalled acquisition and teardown; late resources close exactly once', async () => {
  let finishSetup!: (resource: { close(): Promise<void> }) => void;
  let used = false, closed = 0;
  const start = Date.now();
  await assert.rejects(() => inspectionDeadline(async own => {
    await own(new Promise<{ close(): Promise<void> }>(resolve => { finishSetup = resolve; }));
    used = true;
  }, 40), /BROWSER_DEADLINE/);
  assert.ok(Date.now() - start < 3000);
  finishSetup({ close: async () => { closed++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(used, false);
  assert.equal(closed, 1);
  let closeAttempts = 0;
  const teardownStart = Date.now();
  await assert.rejects(() => inspectionDeadline(async own => {
    await own(Promise.resolve({ close: () => { closeAttempts++; return new Promise<void>(() => {}); } }));
    return 'cannot publish success before cleanup';
  }, 40), /BROWSER_DEADLINE/);
  assert.equal(closeAttempts, 1);
  assert.ok(Date.now() - teardownStart < 4000);
  await assert.rejects(() => inspectionDeadline(async own => {
    await own(Promise.resolve({ close: async () => { throw new Error('cleanup failed'); } }));
  }, 1000), /cleanup failed/);
});
