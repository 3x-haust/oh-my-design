import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { discoveryDigest, readCurrentDirectDiscoveryEntry, readDirectDiscoveryEntry } from '../core/ref/discovery-record.ts';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, discoveryFixture, directoryHtml, DOMAIN_ITEM, PUBLIC_DIRECTORY } from './helpers/discovery-capture.ts';

async function currentCapture(t: { after(fn: () => void): void }) {
  const root = discoveryFixture(t);
  const receipt = await withBrowser(async browser => captureReferenceNavigation(
    discoveryBrowser(browser, { url: PUBLIC_DIRECTORY, html: directoryHtml(DOMAIN_ITEM) }).browser,
    PUBLIC_DIRECTORY, 'domain', createTestProjectWriteAdapter(root), 'public-directory'));
  return { root, receipt };
}

function storeRecord(root: string, receipt: Awaited<ReturnType<typeof currentCapture>>['receipt'], record: object) {
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const sha256 = discoveryDigest(bytes);
  const capture = { path: `.omd/discovery/domain/entries/${sha256}.json`, sha256 };
  writeFileSync(join(root, capture.path), bytes);
  return { ...receipt, capture };
}

test('historical signed direct-entry v2 records remain readable but cannot satisfy current market proof', async t => {
  const { root, receipt } = await currentCapture(t);
  const current = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
  const { observedText, linkLabels, signature: _signature, ...common } = current;
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
