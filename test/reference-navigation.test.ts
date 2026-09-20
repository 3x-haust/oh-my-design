import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { loadRefs } from '../core/ref/store.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { parseSearchInput } from '../core/ref/search-execution.ts';

test('search input skeleton gives the coordinator a valid exact-query transport', () => {
  const skeleton = inputSkeleton('reference-search');
  assert.doesNotThrow(() => parseSearchInput(skeleton.skeleton));
});

test('navigation-only capture preserves observed gallery hops without entering the reference board inventory', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-navigation-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<main><h1>Dashboard directory</h1><p>${'Browse publicly visible entries and inspect their original sources. '.repeat(12)}</p><a href="https://dribbble.com/shots/123-dashboard">Open gallery item</a></main>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/tags/dashboard`;
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  const { stdout } = await promisify(execFile)(process.execPath, [cli, 'ref', 'navigate', url, '--lane', 'design', '--json'], { cwd, env, timeout: 30000 });
  const result = JSON.parse(stdout);
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
  assert.equal(record.researchLane, 'design');
  assert.equal(record.acquisition.httpStatus, 200);
  assert.ok(record.acquisition.links.includes('https://dribbble.com/shots/123-dashboard'));
  assert.equal(record.acquisition.imageSha256, result.evidence.sha256);
  assert.equal(loadRefs(cwd, { includeDomain: true }).length, 0);
  assert.equal(existsSync(join(cwd, '.omd/reference-board.json')), false);
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'ref', 'navigate', url, '--lane', 'other'], { cwd, env }));
});
