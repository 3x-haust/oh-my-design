import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { capturePageForRef, withBrowser } from '../core/render/index.ts';
import { loadRefs, refImagePath, researchLane, saveRef, addPrinciples } from '../core/ref/store.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

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
