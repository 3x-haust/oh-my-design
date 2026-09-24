import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { loadRefs } from '../core/ref/store.ts';
import { captureFinalUrlGuard, captureLane } from '../core/ref/capture-intake.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import type { RawIr } from '../core/types.ts';

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
test('a Korean brief refuses foreign-only domain captures before writing, but accepts Korean-language services regardless of TLD', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-korean-intake-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const input = { ...(inputSkeleton('product-route-input').skeleton as Record<string, unknown>),
    request: '한국어로 복지 혜택을 찾고 신청하는 데스크톱 서비스를 구현해줘.' };
  const invocation = publishTestAdaptiveRoute(cwd, input);
  const english: RawIr = { nodes: [{ id: 'title', name: 'title', type: 'TEXT', path: 'h1', parent: null,
    box: { x: 0, y: 0, w: 400, h: 50 }, children: [], text: 'Find government benefits and financial help' }] };
  const korean: RawIr = { nodes: [{ ...english.nodes[0]!, text: '나에게 맞는 복지 혜택을 찾고 신청 준비를 시작하세요' }] };
  const guard = captureFinalUrlGuard(cwd, [{ source: 'https://www.usa.gov/benefits', lane: 'domain' }], invocation);
  assert.throws(() => guard(0, 'https://www.usa.gov/benefits', english), /REFERENCE_MARKET_LOCAL_FIRST/);
  assert.throws(() => captureLane(cwd, { source: 'https://www.usa.gov/benefits', lane: 'domain', image: true }, invocation),
    /REFERENCE_MARKET_LOCAL_FIRST/);
  assert.equal(captureLane(cwd, { source: 'https://www.usa.gov/benefits', lane: 'domain', image: true,
    fromUser: true }, invocation), 'domain');
  const koreanGuard = captureFinalUrlGuard(cwd, [{ source: 'https://wello.info/benefits', lane: 'domain' }], invocation);
  assert.doesNotThrow(() => koreanGuard(0, 'https://wello.info/benefits', korean));
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
});
test('a gallery capture must remain the exact requested item regardless of user origin', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-gallery-redirect-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const invocation = publishTestAdaptiveRoute(cwd, inputSkeleton('product-route-input').skeleton);
  const source = 'https://dribbble.com/shots/123-ui';
  const guard = captureFinalUrlGuard(cwd, [{ source, lane: 'design' }], invocation);
  assert.doesNotThrow(() => guard(0, source));
  assert.throws(() => guard(0, 'https://domain.example/service'), /DESIGN_DISCOVERY_REDIRECT/);
  assert.throws(() => guard(0, 'https://dribbble.com/shots/456-other-ui'), /DESIGN_DISCOVERY_REDIRECT/);
  assert.throws(() => guard(0, 'https://www.pinterest.com/pin/987654321/'), /DESIGN_DISCOVERY_REDIRECT/);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
  const user = captureFinalUrlGuard(cwd, [{ source, lane: 'design', fromUser: true }], invocation);
  assert.throws(() => user(0, 'https://user-reference.example/view'), /DESIGN_DISCOVERY_REDIRECT/);
  const intoGallery = captureFinalUrlGuard(cwd, [{ source: 'https://user-reference.example/view', lane: 'design', fromUser: true }], invocation);
  assert.throws(() => intoGallery(0, source), /DESIGN_DISCOVERY_REDIRECT/);
});

test('a changed gallery item cannot authorize a later original-source capture', t => {
  const value = designAdmissionFixture(t);
  const invocation = publishTestAdaptiveRoute(value.root, inputSkeleton('product-route-input').skeleton);
  assert.ok(value.gallery.ref.acquisition);
  value.gallery.ref.acquisition.finalUrl = 'https://www.pinterest.com/pin/987654321/';
  writeFileSync(value.gallery.path, JSON.stringify(value.gallery.ref));
  assert.throws(() => captureLane(value.root, { source: value.source.source, lane: 'design' }, invocation), /DESIGN_DISCOVERY_REQUIRED/);
});

test('redirect aliases cannot publish opposite-lane images in concurrent batches or single recapture', async t => {
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/redirect')) {
      res.writeHead(302, { Location: `http://[::1]:${port}/same-service` }); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<main><h1>Service workspace</h1><p>${'Application preparation status and confirmed requirements. '.repeat(15)}</p></main>`);
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const port = address.port;
  const cwd = mkdtempSync(join(tmpdir(), 'omd-redirect-intake-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.omd/.cache'), { recursive: true });
  writeFileSync(join(cwd, '.omd/.cache/route.json'), JSON.stringify(inputSkeleton('product-route-input').skeleton));
  const classified = spawnSync(process.execPath, [cli, 'route', 'classify', '--input', '.omd/.cache/route.json'], { cwd, env, encoding: 'utf8' });
  assert.equal(classified.status, 0, classified.stderr);
  const source = `http://127.0.0.1:${port}/redirect-domain`;
  const visual = `http://localhost:${port}/redirect-design`;
  writeFileSync(join(cwd, '.omd/.cache/batch.json'), JSON.stringify([
    { source, as: 'task', lane: 'domain', energy: false, shot: true },
    { source: visual, as: 'visual', lane: 'design', fromUser: true, energy: false, shot: true },
  ]));
  const command = (...args: string[]) => promisify(execFile)(process.execPath, [cli, ...args], { cwd, env, timeout: 30000 });
  let stdout = '';
  await assert.rejects(command('ref', 'add-batch', '.omd/.cache/batch.json', '--json'), (error: unknown) => {
    assert.ok(error instanceof Error && 'stdout' in error && typeof error.stdout === 'string');
    stdout = error.stdout;
    return true;
  });
  const outcomes = JSON.parse(stdout).outcomes as { ok: boolean; error?: string }[];
  assert.equal(outcomes.filter(item => item.ok).length, 1, stdout);
  assert.match(outcomes.find(item => !item.ok)?.error ?? '', /REFERENCE_LANE_SERVICE_OVERLAP/);
  const refs = loadRefs(cwd, { includeDomain: true });
  assert.equal(refs.length, 1);
  const pngs = ['domain', 'design'].flatMap(lane => {
    const path = join(cwd, '.omd/refs', lane);
    return existsSync(path) ? readdirSync(path).filter(file => file.endsWith('.png')) : [];
  });
  assert.equal(pngs.length, 1, 'the rejected redirect writes no PNG, not merely no JSON');
  const refusedLane = refs[0]!.researchLane === 'domain' ? 'design' : 'domain';
  await assert.rejects(command('ref', 'add', refusedLane === 'design' ? visual : source,
    '--as', 'retry', '--lane', refusedLane, '--from-user', '--no-energy'), /REFERENCE_LANE_SERVICE_OVERLAP/);
  assert.equal(loadRefs(cwd, { includeDomain: true }).length, 1);
});
