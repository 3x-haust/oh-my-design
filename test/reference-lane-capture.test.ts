import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { capturePageForRef, withBrowser, galleryLoginOccludes } from '../core/render/index.ts';
import { loadRefs, refImagePath, researchLane, saveRef, addPrinciples } from '../core/ref/store.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { addRefsBatch } from '../core/ref/batch.ts';

test('final URL refusal leaves the reference output tree unchanged', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-lane-refusal-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  const source = fileURLToPath(new URL('fixtures/considered.html', import.meta.url));
  const shotOut = join(root, '.omd/refs/design/rejected.png');
  await assert.rejects(withBrowser(browser => capturePageForRef(browser, source, { width: 640, height: 480 }, {
    shotOut, adapter: writer, validateFinalUrl: () => { throw new Error('final URL rejected'); },
  })));
  assert.equal(existsSync(join(root, '.omd/refs')), false);
});

test('batch capture failure does not pre-create the reference output tree', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-lane-batch-refusal-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'missing.html');
  const result = await addRefsBatch(root, [{ source, as: 'rejected', lane: 'design', fromUser: true, shot: true, energy: false }], {
    rulesRoot: fileURLToPath(new URL('../core/rules/builtin', import.meta.url)), concurrency: 1,
  }, createTestProjectWriteAdapter(root));
  assert.equal(result.outcomes[0]?.ok, false);
  assert.equal(existsSync(join(root, '.omd/refs')), false);
});

test('actual full-page captures retain HTTP/link provenance and stay in separate lane directories', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-lane-browser-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><head><title>Research fixture</title></head><body><h1>Application workspace</h1><p>${'A person can review the current application and continue preparing documents. '.repeat(8)}</p><a href="https://original.example/screen">Original product screen</a></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const port = (server.address() as { port: number }).port;
  await withBrowser(async browser => {
    for (const lane of ['domain', 'design'] as const) {
      const source = `http://127.0.0.1:${port}/${lane}`;
      const identity = { source, component: `${lane}-entry`, researchLane: lane };
      const imagePath = refImagePath(root, identity);
      writer.mkdir(`.omd/refs/${lane}`);
      const capture = await capturePageForRef(browser, source, { width: 640, height: 480 }, { shotOut: imagePath, adapter: writer });
      assert.equal(capture.shotSaved, true, 'no selector still saves a whole-page image');
      assert.equal(capture.acquisition.httpStatus, 200);
      assert.equal(capture.acquisition.finalUrl, source);
      assert.deepEqual(capture.acquisition.links, ['https://original.example/screen']);
      assert.equal(readFileSync(imagePath).subarray(1, 4).toString(), 'PNG');
      assert.equal(capture.acquisition.imageSha256, createHash('sha256').update(readFileSync(imagePath)).digest('hex'));
      saveRef(root, { ...identity, kind: 'page', capturedAt: new Date().toISOString(), imagePath: relative(root, imagePath), acquisition: capture.acquisition, invariants: null, principles: [] }, writer);
    }
  });
  assert.deepEqual(readdirSync(join(root, '.omd/refs')).sort(), ['design', 'domain']);
  assert.equal(loadRefs(root).length, 1, 'domain research never silently enters the design board');
  assert.equal(loadRefs(root, { includeDomain: true }).length, 2);
  const design = loadRefs(root)[0]!;
  addPrinciples(root, design.source, design.component, ['Keep the primary action near its work object.'], writer);
  assert.equal(loadRefs(root)[0]!.principles.length, 1);
  assert.throws(() => researchLane('../escape'), /LANE_REQUIRED/);
});

test('same-page domain recapture is rejected before a new design image path is issued', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-lane-overlap-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  const domain = { source: 'https://www.gov.uk/check-benefits', component: 'flow', researchLane: 'domain' as const,
    kind: 'page' as const, capturedAt: new Date().toISOString(), invariants: null, principles: [] };
  saveRef(root, domain, writer);
  const relabelled = { ...domain, source: 'https://gov.uk/check-benefits/?crop=calm#top', component: 'calm-layout', researchLane: 'design' as const };
  assert.throws(() => refImagePath(root, relabelled), /LANE_SOURCE_OVERLAP/);
  assert.throws(() => saveRef(root, relabelled, writer), /LANE_SOURCE_OVERLAP/);
  assert.doesNotThrow(() => refImagePath(root, { ...relabelled, source: 'https://dribbble.com/shots/123-app' }));
  assert.equal(loadRefs(root).length, 0);
});

test('gallery login overlay is blocked, but a login link, sidebar or product login is not', async () => {
  await withBrowser(async browser => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pin = 'https://www.pinterest.com/pin/123456789/';
    try {
      await page.setContent('<main>Public app image</main><form style="position:fixed;inset:10%;background:white"><input type="password"></form>');
      assert.equal(await galleryLoginOccludes(page, pin), true);
      assert.equal(await galleryLoginOccludes(page, 'https://product.example/login'), false);
      await page.setContent('<main>Public app image</main><a href="/login">Log in</a>');
      assert.equal(await galleryLoginOccludes(page, pin), false);
      await page.setContent('<main>Public app image</main><form style="position:fixed;left:1000px;top:0;width:200px"><input type="password"></form>');
      assert.equal(await galleryLoginOccludes(page, pin), false);
    } finally { await page.close(); }
  });
});
