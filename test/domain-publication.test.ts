import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { publishDomainBrief } from '../core/domain/publication.ts';
import { contractSha256, deliveryReceipt, serializeDeliveryLog, DELIVERY_LOG } from '../core/stage/contract.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { marketDomainBrief } from './helpers/market-reference.ts';

const packs = fileURLToPath(new URL('../core', import.meta.url));
const request = '\n# Complete request\n' + 'A required route and its recovery behavior.\n'.repeat(600) + '\n';

function setup(t: { after(action: () => void): void }, delivered = true) {
  const root = mkdtempSync(join(tmpdir(), 'omd-domain-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const raw: unknown = JSON.parse(readFileSync(new URL('./fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  assert.ok(typeof raw === 'object' && raw !== null);
  const invocation = publishTestAdaptiveRoute(root, { ...raw, request });
  const writer = createTestProjectWriteAdapter(root, invocation);
  if (delivered) {
    const contract = 'protocol/domain-analysis.md';
    writer.write(DELIVERY_LOG, serializeDeliveryLog([
      deliveryReceipt('domain', contract, contractSha256(packs, contract), new Date().toISOString()),
    ]));
  }
  return { root, invocation, writer };
}

test('domain publication binds the complete routed request without retyping it', t => {
  const { root, invocation, writer } = setup(t);
  const { request: _omitted, ...authored } = marketDomainBrief;
  const result = publishDomainBrief(root, authored, packs, writer, invocation);
  assert.equal(result.request, request);
  assert.deepEqual(result.surfaces, authored.surfaces);
  assert.equal(JSON.parse(readFileSync(join(root, '.omd/domain-brief.json'), 'utf8')).request, request);
});

test('domain publication replaces only a summarized request and preserves authored planning', t => {
  const { root, invocation, writer } = setup(t);
  const result = publishDomainBrief(root, { ...marketDomainBrief, request: 'Short summary' }, packs, writer, invocation);
  assert.equal(result.request, request);
  assert.deepEqual(result.planning, marketDomainBrief.planning);
});

test('domain publication refuses undelivered entry without writing an artifact', t => {
  const { root, invocation, writer } = setup(t, false);
  assert.throws(() => publishDomainBrief(root, marketDomainBrief, packs, writer, invocation));
  assert.equal(existsSync(join(root, '.omd/domain-brief.json')), false);
});

test('invalid domain publication preserves the previous artifact byte-for-byte', t => {
  const { root, invocation, writer } = setup(t);
  const target = join(root, '.omd/domain-brief.json');
  const original = JSON.stringify({ ...marketDomainBrief, request });
  writeFileSync(target, original);
  assert.throws(() => publishDomainBrief(root, { ...marketDomainBrief, surfaces: [] }, packs, writer, invocation));
  assert.equal(readFileSync(target, 'utf8'), original);
});

test('the native domain set command binds the routed request after delivered entry', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-domain-command-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  const raw: unknown = JSON.parse(readFileSync(new URL('./fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  assert.ok(typeof raw === 'object' && raw !== null);
  writeFileSync(join(root, '.omd/.cache/route.json'), JSON.stringify({ ...raw, request }));
  const { request: _omitted, ...authored } = marketDomainBrief;
  writeFileSync(join(root, '.omd/.cache/domain.json'), JSON.stringify(authored));
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const run = (args: readonly string[]) => spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 1_000_000,
  });
  const classified = run(['route', 'classify', '--input', '.omd/.cache/route.json', '--json']);
  assert.equal(classified.status, 0, classified.stderr);
  const beforeEntry = run(['domain', 'set', '--input', '.omd/.cache/domain.json', '--json']);
  assert.notEqual(beforeEntry.status, 0);
  assert.equal(existsSync(join(root, '.omd/domain-brief.json')), false);
  const delivered = run(['stage', 'deliver', '--stage', 'domain', '--contract', 'protocol/domain-analysis.md']);
  assert.equal(delivered.status, 0, delivered.stderr);
  const published = run(['domain', 'set', '--input', '.omd/.cache/domain.json', '--json']);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(JSON.parse(readFileSync(join(root, '.omd/domain-brief.json'), 'utf8')).request, request);
  const checked = run(['domain', 'check', '--json']);
  assert.equal(checked.status, 0, checked.stderr);
});
