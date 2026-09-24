import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { addRefsBatch } from '../core/ref/batch.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { loadRefs } from '../core/ref/store.ts';

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
const run = (cwd: string, args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 30000 });
function project(t: { after(fn: () => void): void }, route = true) {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-ref-intake-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.omd/.cache'), { recursive: true });
  if (route) {
    const path = join(cwd, '.omd/.cache/route.json');
    writeFileSync(path, JSON.stringify(inputSkeleton('product-route-input').skeleton));
    const result = run(cwd, ['route', 'classify', '--input', path, '--json']);
    assert.equal(result.status, 0, result.stderr);
  }
  return cwd;
}

test('selected discovery refuses omitted lane before service captures can silently enter design', t => {
  const cwd = project(t);
  const result = run(cwd, ['ref', 'add', 'https://www.benefits.gov/', '--as', 'domain-flow', '--image']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /REFERENCE_LANE_REQUIRED/);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
  const valid = run(cwd, ['ref', 'add', 'https://www.benefits.gov/', '--as', 'domain-flow', '--image', '--lane', 'domain']);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(loadRefs(cwd).length, 0);
  assert.equal(loadRefs(cwd, { includeDomain: true })[0]?.researchLane, 'domain');
});

test('selected discovery rejects a domain service explicitly relabelled design without gallery provenance', t => {
  const cwd = project(t);
  const result = run(cwd, ['ref', 'add', 'https://www.benefits.gov/', '--as', 'beautiful-flow', '--image', '--lane', 'design']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /DESIGN_DISCOVERY_REQUIRED/);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
  const gallery = run(cwd, ['ref', 'add', 'https://dribbble.com/shots/123-screen', '--as', 'visual-study', '--image', '--lane', 'design']);
  assert.equal(gallery.status, 1, gallery.stderr);
  assert.match(gallery.stderr, /DESIGN_GALLERY_DISCOVERY_ONLY/);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
});

test('batch preflight rejects an incomplete lane manifest atomically before browser launch', t => {
  const cwd = project(t);
  const path = join(cwd, '.omd/.cache/batch.json');
  writeFileSync(path, JSON.stringify([{ source: 'https://example.com/', as: 'task', lane: 'domain' }, { source: 'https://example.org/', as: 'visual' }]));
  const result = run(cwd, ['ref', 'add-batch', path, '--json']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFERENCE_LANE_REQUIRED/);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
  assert.equal(JSON.parse(readFileSync(path, 'utf8'))[1].lane, undefined);
});

test('standalone capture keeps its established default without imposing discovery work', t => {
  const cwd = project(t, false);
  const result = run(cwd, ['ref', 'add', 'https://example.com/', '--as', 'study', '--image']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(loadRefs(cwd)[0]?.researchLane, 'design');
});

test('direct batch API cannot bypass selected-route intake by omitting every lane', async t => {
  const cwd = project(t);
  await assert.rejects(addRefsBatch(cwd, [{ source: 'http://127.0.0.1:1/', as: 'task', energy: false }],
    { rulesRoot: fileURLToPath(new URL('../core/rules/builtin', import.meta.url)) }, createTestProjectWriteAdapter(cwd)), /REFERENCE_INTAKE_AUTHORITY_REQUIRED|REFERENCE_LANE_REQUIRED/);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
});

test('same-manifest service overlap is refused before any batch acquisition', t => {
  const cwd = project(t);
  const path = join(cwd, '.omd/.cache/batch.json');
  writeFileSync(path, JSON.stringify([
    { source: 'http://127.0.0.1:1/domain', as: 'task', lane: 'domain', energy: false, shot: true },
    { source: 'http://127.0.0.1:1/design', as: 'visual', lane: 'design', fromUser: true, energy: false, shot: true },
  ]));
  const result = run(cwd, ['ref', 'add-batch', path, '--json']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFERENCE_LANE_SERVICE_OVERLAP/);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
});

test('independent local user-reference batch still captures into both selected lanes', t => {
  const cwd = project(t);
  const path = join(cwd, '.omd/.cache/batch.json');
  writeFileSync(path, JSON.stringify([
    { source: fileURLToPath(new URL('fixtures/slop.html', import.meta.url)), as: 'task', lane: 'domain', energy: false, shot: true },
    { source: fileURLToPath(new URL('fixtures/considered.html', import.meta.url)), as: 'visual', lane: 'design', fromUser: true, energy: false, shot: true },
  ]));
  const result = run(cwd, ['ref', 'add-batch', path, '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(loadRefs(cwd, { includeDomain: true }).length, 2);
  assert.equal(loadRefs(cwd).length, 1);
});
