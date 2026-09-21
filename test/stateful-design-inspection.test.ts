import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { captureSlopCheckpoint, publishSlopReview, checkSlopReview } from '../core/slop/review.ts';
import { initializeRuntimeInventory, runtimeInventoryStatus, RUNTIME_INVENTORY_PATH } from '../core/tokens/runtime-inventory.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { buildBrief } from '../core/brief/index.ts';
import { withBrowser } from '../core/render/index.ts';
import { withLocalView, type ViewState } from '../core/render/stateful.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';

const html = `<!doctype html><html><head><title>Local workbench</title><style>:root{--accent:#2255cc}body{font-family:Arial;padding:24px}.px-4{padding:16px}.action{background:var(--accent);color:white;border-radius:8px}#modal{padding:24px;background:#eee}</style></head><body><h1>Review the current project</h1><p>${'Local inspection fixture with a primary work object and clear progress. '.repeat(5)}</p><button id="detail" type="button" class="action px-4">Open details</button><section id="panel" hidden><h2>Project details</h2><button id="open" type="button">Open modal</button></section><dialog id="modal"><h2>Confirm local choice</h2><button id="confirm" type="button">Confirm choice</button></dialog><script>document.querySelector('#detail').onclick=()=>{document.querySelector('#panel').hidden=false;history.pushState({},'', '/details');};document.querySelector('#open').onclick=()=>{document.querySelector('#modal').showModal();document.querySelector('#confirm').style.color='rgb(128, 0, 128)';document.documentElement.style.setProperty('--accent','#006633');};</script></body></html>`;
const viewport = { width: 1280, height: 900 };
const detail = { id: 'details', page: 'dist/index.html', viewport, state: { name: 'details-open', startRoute: '/', route: '/details', actions: [{ kind: 'click', selector: '#detail' }], assertions: [{ selector: '#panel', state: 'visible' }] } };
const modal = { ...detail, id: 'modal-mobile', viewport: { width: 390, height: 844 }, state: { ...detail.state, name: 'modal-open', actions: [...detail.state.actions, { kind: 'click', selector: '#open' }], assertions: [{ selector: '#modal', state: 'visible' }] } };
function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-stateful-design-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'dist')); writeFileSync(join(root, 'dist/index.html'), html);
  writeFileSync(join(root, 'source.css'), ':root{--accent:#2255cc}');
  return { root, writer: createTestProjectWriteAdapter(root) };
}

test('slop captures SPA navigation and modal states; entry-only evidence cannot cover them', async t => {
  const { root, writer } = fixture(t);
  const result = await captureSlopCheckpoint(root, { schema: 'slop-scope-v1', views: [detail, modal] }, writer);
  const review = { ...result.reviewInput, summary: 'Review actual detail and modal renders', decisions: result.reviewInput.decisions.map(d => ({ ...d, status: 'dismissed', reason: 'Fixture deliberately uses these styles; inspect the two captured states.', viewIds: ['details', 'modal-mobile'] })) };
  publishSlopReview(root, review, writer);
  const expected = await withBrowser(async browser => {
    const views = [];
    for (const view of [detail, modal]) {
      const png = await withLocalView(browser, root, { ...view, state: view.state as ViewState }, page => page.screenshot());
      const capture = { path: `.omd/final-${view.id}.png`, sha256: createHash('sha256').update(png).digest('hex') };
      writer.write(capture.path, png);
      views.push({ page: view.page, ...view.viewport, route: view.state.route, state: view.state.name, capture });
    }
    return views;
  });
  assert.equal(checkSlopReview(root, expected).status, 'reviewed');
  assert.throws(() => checkSlopReview(root, [{ page: 'dist/index.html', ...viewport, route: '/home', state: 'details-open' }]), /route\/state/);
  assert.throws(() => checkSlopReview(root, [{ page: 'dist/index.html', ...viewport, route: '/details', state: 'error' }]), /route\/state/);
  const checkpoint = JSON.parse(readFileSync(join(root, result.checkpoint.path), 'utf8'));
  const modalIr = JSON.parse(readFileSync(join(root, checkpoint.views[1].ir.path), 'utf8'));
  assert.match(JSON.stringify(modalIr), /Confirm local choice/);
  const mislabeled = await captureSlopCheckpoint(root, { schema: 'slop-scope-v1', views: [{ ...modal, state: { ...modal.state, actions: [], startRoute: '/details', assertions: [{ selector: 'h1', state: 'visible' }] } }] }, writer);
  publishSlopReview(root, { ...mislabeled.reviewInput, summary: 'Inspect mislabeled home fixture', decisions: mislabeled.reviewInput.decisions.map(d => ({ ...d, status: 'dismissed', reason: 'Fixture candidate intentionally retained.', viewIds: [modal.id] })) }, writer);
  assert.throws(() => checkSlopReview(root, [expected[1]!]), /state pixels differ/, 'a closed modal cannot be relabeled as the actual final open-modal state');
  await assert.rejects(() => captureSlopCheckpoint(root, { schema: 'slop-scope-v1', views: [{ ...detail, state: { ...detail.state, assertions: [{ selector: '#does-not-exist', state: 'hidden' }] } }] }, writer));
});

test('runtime init records utility, inherited token and CSS-in-JS values for exact named variants and reuses them in briefs', async t => {
  const { root, writer } = fixture(t);
  writer.write('.omd/tokens.json', '{"userApproved":true}');
  const input = { schema: 'runtime-design-inventory-input-v1', views: [
    { ...detail, selectors: [{ id: 'utility-button', selector: '#detail' }] },
    { ...modal, selectors: [{ id: 'modal-action', selector: '#confirm' }] },
  ] };
  assert.equal((await initializeRuntimeInventory(root, input, writer)).status, 'current');
  const record = JSON.parse(readFileSync(join(root, RUNTIME_INVENTORY_PATH), 'utf8'));
  assert.equal(record.views[0].components[0].styles['padding-top'], '16px');
  assert.equal(record.views[1].components[0].styles.color, 'rgb(128, 0, 128)');
  assert.equal(record.views[1].components[0].variables['--accent'], '#006633');
  assert.equal(readFileSync(join(root, '.omd/tokens.json'), 'utf8'), '{"userApproved":true}');
  const brief = buildBrief(root, 'production');
  assert.equal(brief.runtimeDesignSystem?.status, 'current');
  assert.equal((await initializeRuntimeInventory(root, input, writer)).status, 'current');
  writeFileSync(join(root, 'source.css'), ':root{--accent:#111111}');
  assert.equal(runtimeInventoryStatus(root).status, 'stale');
  assert.ok(buildBrief(root, 'production').blockers.some(b => b.includes('runtime design inventory stale')));
  await assert.rejects(() => initializeRuntimeInventory(root, input, writer), /--refresh/);
  assert.equal((await initializeRuntimeInventory(root, input, writer, true)).status, 'current');
  const updated = JSON.parse(readFileSync(join(root, RUNTIME_INVENTORY_PATH), 'utf8'));
  const forgery = structuredClone(updated);
  forgery.input.views[0].state.route = '/unvisited';
  forgery.input.views[0].selectors[0].selector = '#does-not-exist';
  forgery.builds = [];
  const { digest: _oldDigest, ...forgedRecord } = forgery;
  const digest = createHash('sha256').update(canonicalJson(forgedRecord)).digest('hex');
  const forgedBytes = JSON.stringify({ ...forgedRecord, digest });
  writer.write(`.omd/runtime-design-system/records/${digest}.json`, forgedBytes);
  writer.write(RUNTIME_INVENTORY_PATH, forgedBytes);
  assert.equal(runtimeInventoryStatus(root).status, 'invalid', 'rehashing invented coverage cannot replace native observations');
  writer.write(RUNTIME_INVENTORY_PATH, readFileSync(join(root, `.omd/runtime-design-system/records/${updated.digest}.json`)));
  writeFileSync(join(root, updated.views[0].capture.path), 'changed pixels');
  assert.equal(runtimeInventoryStatus(root).status, 'invalid');
});

test('stateful local inspection blocks API writes and external navigation', async t => {
  const { root, writer } = fixture(t);
  writeFileSync(join(root, 'dist/index.html'), html.replace('document.querySelector(\'#panel\').hidden=false;', "fetch('/submit',{method:'POST'}).catch(()=>{});document.querySelector('#panel').hidden=false;"));
  await assert.rejects(() => captureSlopCheckpoint(root, { schema: 'slop-scope-v1', views: [detail] }, writer), /external networking|non-read-only|blocked network/);
  writeFileSync(join(root, 'dist/index.html'), html.replace('<script>', "<script>fetch('http://127.0.0.1:1/unrelated',{method:'POST',mode:'no-cors'}).catch(()=>{});"));
  const { state: _state, ...plain } = detail;
  await assert.rejects(() => captureSlopCheckpoint(root, { schema: 'slop-scope-v1', views: [plain] }, writer), /external networking|non-read-only|blocked network/, 'default entry views use the same read-only boundary');
});
