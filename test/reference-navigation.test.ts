import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { loadRefs } from '../core/ref/store.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { parseSearchInput } from '../core/ref/search-execution.ts';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, directoryHtml, GALLERY_DIRECTORY, GALLERY_ITEM } from './helpers/discovery-capture.ts';

test('search input skeleton gives the coordinator a valid exact-query transport', () => {
  const skeleton = inputSkeleton('reference-search');
  assert.doesNotThrow(() => parseSearchInput(skeleton.skeleton));
});

test('navigation-only capture preserves observed gallery hops without entering the reference board inventory', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-navigation-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const url = GALLERY_DIRECTORY;
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  const result = await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url, html: directoryHtml(GALLERY_ITEM) });
    return captureReferenceNavigation(observed.browser, url, 'design', createTestProjectWriteAdapter(cwd));
  });
  assert.equal(result.url, url);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false, 'navigation execution must not create retained reference files');
  for (const receipt of [result.evidence, result.capture]) {
    assert.ok(receipt.path.startsWith('.omd/discovery/design/navigation/'));
    const bytes = readFileSync(join(cwd, receipt.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256);
  }
  const record = JSON.parse(readFileSync(join(cwd, result.capture.path), 'utf8'));
  assert.equal(record.component, undefined);
  assert.equal(record.kind, 'page');
  assert.equal(record.schema, 'reference-navigation-capture-v3');
  assert.equal(record.researchLane, 'design');
  assert.equal(record.acquisition.httpStatus, 200);
  assert.ok(record.acquisition.links.includes(GALLERY_ITEM));
  assert.equal(record.acquisition.imageSha256, result.evidence.sha256);
  assert.equal(loadRefs(cwd, { includeDomain: true }).length, 0);
  assert.equal(existsSync(join(cwd, '.omd/reference-board.json')), false);
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'ref', 'navigate', url, '--lane', 'other'], { cwd, env }));
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'ref', 'navigate', 'http://127.0.0.1:1234/', '--lane', 'domain'], { cwd, env }));
});
