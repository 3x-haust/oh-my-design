import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { discoveryDigest, readCurrentDirectDiscoveryEntry, readDirectDiscoveryEntry } from '../core/ref/discovery-record.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { discoveryFixture, DOMAIN_ITEM, PUBLIC_DIRECTORY } from './helpers/discovery-capture.ts';
import { directRootAt } from './helpers/market-reference.ts';

async function currentCapture(t: { after(fn: () => void): void }) {
  const root = discoveryFixture(t);
  const { reason: _reason, ...receipt } = directRootAt(root, 'domain', PUBLIC_DIRECTORY, [DOMAIN_ITEM]);
  return { root, receipt };
}

function storeRecord(root: string, receipt: Awaited<ReturnType<typeof currentCapture>>['receipt'], record: object) {
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const sha256 = discoveryDigest(bytes);
  const capture = { path: `.omd/discovery/domain/entries/${sha256}.json`, sha256 };
  mkdirSync(join(root, '.omd/discovery/domain/entries'), { recursive: true });
  writeFileSync(join(root, capture.path), bytes);
  return { ...receipt, capture };
}

test('historical signed direct-entry v2 records remain readable but cannot satisfy current market proof', async t => {
  const { root, receipt } = await currentCapture(t);
  const current = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
  const { observedText, taskText: _taskText, linkLabels, signature: _signature, ...common } = current;
  for (const unsigned of [
    { ...common, schema: 'reference-discovery-entry-v2' },
    { ...common, schema: 'reference-discovery-entry-v2', observedText },
    { ...common, schema: 'reference-discovery-entry-v2', observedText, linkLabels },
  ]) {
    const legacy = { ...unsigned, signature: signNativeObservation(root, unsigned.schema,
      discoveryDigest(canonicalJson(unsigned))) };
    const legacyReceipt = storeRecord(root, receipt, legacy);
    assert.deepEqual(readDirectDiscoveryEntry(root, legacyReceipt), {
      url: PUBLIC_DIRECTORY, finalUrl: PUBLIC_DIRECTORY, links: [DOMAIN_ITEM],
    });
    assert.throws(() => readCurrentDirectDiscoveryEntry(root, legacyReceipt), /current direct discovery signature required/);
  }
});

test('current direct-entry link labels are covered by the native signature', async t => {
  const { root, receipt } = await currentCapture(t);
  const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
  record.linkLabels[0].text = 'South Korea forged service label';
  const tampered = storeRecord(root, receipt, record);
  assert.throws(() => readCurrentDirectDiscoveryEntry(root, tampered), /native direct discovery signature invalid/);
});

test('current direct-entry task text is covered by the native signature', async t => {
  const { root, receipt } = await currentCapture(t);
  const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
  record.taskText = 'Forged welfare benefits service';
  const tampered = storeRecord(root, receipt, record);
  assert.throws(() => readCurrentDirectDiscoveryEntry(root, tampered), /native direct discovery signature invalid/);
});

test('a previously signed v3 entry is archival until recaptured with content-only links', async t => {
  const { root, receipt } = await currentCapture(t);
  const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8')) as Record<string, unknown>;
  const { signature: _signature, taskText: _taskText, ...fields } = record;
  const unsigned = { ...fields, schema: 'reference-discovery-entry-v3' };
  const legacy = { ...unsigned, signature: signNativeObservation(root, unsigned.schema,
    discoveryDigest(canonicalJson(unsigned))) };
  const oldReceipt = storeRecord(root, receipt, legacy);
  assert.equal(readDirectDiscoveryEntry(root, oldReceipt).url, PUBLIC_DIRECTORY);
  assert.throws(() => readCurrentDirectDiscoveryEntry(root, oldReceipt), /current direct discovery signature required/);
});

test('a signed direct entry older than route publication cannot authorize current research', async t => {
  const { root, receipt } = await currentCapture(t);
  const routePath = join(root, '.omd/route.json');
  writeFileSync(routePath, '{}');
  const later = new Date(Date.now() + 1000);
  utimesSync(routePath, later, later);
  assert.deepEqual(readDirectDiscoveryEntry(root, receipt), {
    url: PUBLIC_DIRECTORY, finalUrl: PUBLIC_DIRECTORY, links: [DOMAIN_ITEM],
  });
  assert.throws(() => readCurrentDirectDiscoveryEntry(root, receipt), /stale for the current route/);
});
