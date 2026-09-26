import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MAX_SURFACES } from '../core/domain/domain-brief.ts';
import { captureSlopCheckpoint, checkSlopReview, parseSlopScope, publishSlopReview } from '../core/slop/review.ts';
import { initializeRuntimeInventory, parseRuntimeInventoryInput, RUNTIME_INVENTORY_PATH, runtimeInventoryStatus } from '../core/tokens/runtime-inventory.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

function scopeForSurfaces(count: number) {
  return {
    schema: 'slop-scope-v1',
    views: Array.from({ length: count }, (_, index) => [
      { id: `surface-${index}-desktop`, page: 'dist/index.html', viewport: { width: 1280, height: 900 } },
      { id: `surface-${index}-mobile`, page: 'dist/index.html', viewport: { width: 390, height: 844 } },
    ].map(view => ({
      ...view,
      state: { name: `surface-${index}`, route: `/surface-${index}`, startRoute: `/surface-${index}`,
        actions: [], assertions: [{ selector: 'main', state: 'visible' as const }] },
    }))).flat(),
  };
}

test('slop scope retains all 34 stateful desktop/mobile views of a 17-surface request', () => {
  const scope = scopeForSurfaces(17);
  assert.deepEqual(parseSlopScope(scope), scope.views);
});

test('slop scope admits desktop/mobile pairs up to the shared domain surface capacity', () => {
  const scope = scopeForSurfaces(MAX_SURFACES);
  assert.equal(scope.views.length, MAX_SURFACES * 2);
  assert.deepEqual(parseSlopScope(scope), scope.views);
});

test('additional named states consume the same finite slop scope budget', () => {
  const scope = scopeForSurfaces(MAX_SURFACES);
  const first = scope.views[0]!;
  const additionalState = { ...first, id: 'surface-0-expanded-desktop',
    state: { ...first.state, name: 'expanded', actions: [{ kind: 'click', selector: '#expand' }] } };
  assert.throws(() => parseSlopScope({ ...scope, views: [...scope.views, additionalState] }), /scope needs/);
  assert.throws(() => parseSlopScope({ ...scope, views: [] }), /scope needs/);
});

test('runtime inventory shares the 34-view and maximum-surface scope capacity', () => {
  for (const count of [17, MAX_SURFACES]) {
    const views = scopeForSurfaces(count).views.map(view => ({ ...view, selectors: [{ id: 'main', selector: 'main' }] }));
    const input = { schema: 'runtime-design-inventory-input-v1', views };
    assert.deepEqual(parseRuntimeInventoryInput(input), input);
    if (count === MAX_SURFACES) {
      assert.throws(() => parseRuntimeInventoryInput({ ...input, views: [...views, { ...views[0], id: 'extra-state' }] }), /schema\/views invalid/);
    }
  }
});

test('both inspections reject a duplicated 35th view and runtime selectors remain bounded', () => {
  const scope = scopeForSurfaces(17);
  assert.throws(() => parseSlopScope({ ...scope, views: [...scope.views, scope.views[0]] }), /duplicate view IDs/);
  const views = scope.views.map(view => ({ ...view, selectors: [{ id: 'main', selector: 'main' }] }));
  const input = { schema: 'runtime-design-inventory-input-v1', views };
  assert.throws(() => parseRuntimeInventoryInput({ ...input, views: [...views, views[0]] }), /duplicate view id/);
  const last = views.at(-1)!;
  for (const selectors of [[], Array.from({ length: 33 }, (_, index) => ({ id: `component-${index}`, selector: 'main' }))]) {
    assert.throws(() => parseRuntimeInventoryInput({ ...input, views: [...views.slice(0, -1), { ...last, selectors }] }), /selectors need 1–32/);
  }
  assert.throws(() => parseRuntimeInventoryInput({ ...input, views: [...views.slice(0, -1), { ...last, selectors: [last.selectors[0], last.selectors[0]] }] }), /duplicate component id/);
});

test('expanded scopes still reject duplicate IDs and invalid late page, viewport, and state rows', () => {
  const scope = scopeForSurfaces(17);
  const last = scope.views.at(-1)!;
  const invalidRows = [
    { row: { ...last, id: scope.views[0]!.id }, error: /duplicate view IDs/ },
    { row: { ...last, page: '../outside.html' }, error: /contained local HTML/ },
    { row: { ...last, viewport: { width: 2561, height: 900 } }, error: /invalid viewport/ },
    { row: { ...last, state: { ...last.state, route: 'https://example.org/' } }, error: /destination-relative route/ },
    { row: { ...last, state: { ...last.state, actions: Array.from({ length: 25 }, () => ({ kind: 'click', selector: '#expand' })) } }, error: /actions need 0–24/ },
    { row: { ...last, state: { ...last.state, assertions: [] } }, error: /assertions need 1–24/ },
  ];
  for (const { row, error } of invalidRows) {
    assert.throws(() => parseSlopScope({ ...scope, views: [...scope.views.slice(0, -1), row] }), error);
  }
});

test('native inspection captures and validates all 34 route/viewport views without truncation', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-inspection-capacity-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Surface inspection</title></head><body><main><h1>Surface</h1><p>Check the current route and its viewport evidence.</p></main><script>document.querySelector("h1").textContent=location.pathname</script></body></html>');
  const writer = createTestProjectWriteAdapter(root);
  const scope = scopeForSurfaces(17);
  const captured = await captureSlopCheckpoint(root, scope, writer);
  const checkpoint = JSON.parse(readFileSync(join(root, captured.checkpoint.path), 'utf8')) as {
    views: { id: string; viewportImage: { path: string; sha256: string } }[];
  };
  assert.deepEqual(checkpoint.views.map(view => view.id), scope.views.map(view => view.id));
  publishSlopReview(root, { ...captured.reviewInput, summary: 'Synthetic capacity fixture preserves each route in both viewport captures.',
    decisions: captured.reviewInput.decisions.map(decision => ({ ...decision, status: 'dismissed',
      reason: 'The deliberately plain fixture isolates native capture coverage from design judgment.',
      viewIds: scope.views.map(view => view.id) })) }, writer);
  const expected = scope.views.map((view, index) => ({ page: view.page, ...view.viewport,
    route: view.state.route, state: view.state.name, capture: checkpoint.views[index]!.viewportImage }));
  assert.equal(checkSlopReview(root, expected).status, 'reviewed');
  assert.throws(() => checkSlopReview(root, [...expected.slice(0, -1), { ...expected.at(-1)!, state: 'uncaptured-state' }]), /route\/state/);
  const input = { schema: 'runtime-design-inventory-input-v1',
    views: scope.views.map(view => ({ ...view, selectors: [{ id: 'route-heading', selector: 'h1' }] })) };
  assert.equal((await initializeRuntimeInventory(root, input, writer)).status, 'current');
  const inventory = JSON.parse(readFileSync(join(root, RUNTIME_INVENTORY_PATH), 'utf8')) as {
    views: { id: string; capture: { path: string } }[];
  };
  assert.deepEqual(inventory.views.map(view => view.id), scope.views.map(view => view.id));
  writeFileSync(join(root, inventory.views.at(-1)!.capture.path), 'tampered final view');
  assert.equal(runtimeInventoryStatus(root).status, 'invalid');
});
