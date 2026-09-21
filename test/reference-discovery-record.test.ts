import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { discoveryDigest, readDirectDiscoveryEntry, readStrictDiscoveryNavigation, type DirectDiscoveryReceipt } from '../core/ref/discovery-record.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, discoveryFixture, directoryHtml, GALLERY_DIRECTORY, GALLERY_ITEM } from './helpers/discovery-capture.ts';

async function fixture(t: { after(fn: () => void): void }) {
  const root = discoveryFixture(t);
  return withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY, html: directoryHtml(GALLERY_ITEM) });
    const receipt = await captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design', createTestProjectWriteAdapter(root), 'free-gallery');
    return { root, receipt };
  });
}

function rewrite(root: string, receipt: DirectDiscoveryReceipt, change: (record: Record<string, unknown>) => void): DirectDiscoveryReceipt {
  const record: Record<string, unknown> = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
  change(record);
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const sha256 = discoveryDigest(bytes);
  const path = `.omd/discovery/design/entries/${sha256}.json`;
  writeFileSync(join(root, path), bytes);
  return { ...receipt, capture: { path, sha256 } };
}

test('strict readers reject stale bytes, wrong-lane paths and source substitutions', async t => {
  const { root, receipt } = await fixture(t);
  assert.throws(() => readDirectDiscoveryEntry(root, { ...receipt, url: 'https://www.siteinspire.com/websites' }), /binding differs/);
  assert.throws(() => readDirectDiscoveryEntry(root, { ...receipt, evidence: { ...receipt.evidence, path: receipt.evidence.path.replace('/design/', '/domain/') } }), /lane\/purpose path/);
  assert.throws(() => readDirectDiscoveryEntry(root, { ...receipt, method: 'search' }), /direct method/);
  assert.throws(() => readDirectDiscoveryEntry(root, { ...receipt, reason: 'Research-only author judgment' }), /expected exactly/);
  const path = join(root, receipt.evidence.path);
  writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from('changed')]));
  assert.throws(() => readDirectDiscoveryEntry(root, receipt), /evidence changed/);
});

test('rehashing legacy navigation metadata cannot promote it to a direct entry', async t => {
  const { root, receipt } = await fixture(t);
  const legacy = rewrite(root, receipt, record => { record.schema = 'reference-navigation-capture-v1'; });
  assert.throws(() => readDirectDiscoveryEntry(root, legacy), /binding differs/);
  const wrongLane = rewrite(root, receipt, record => { record.researchLane = 'domain'; });
  assert.throws(() => readDirectDiscoveryEntry(root, wrongLane), /binding differs/);
  const fabricated = rewrite(root, receipt, record => { delete record.method; delete record.entry; });
  assert.throws(() => readDirectDiscoveryEntry(root, fabricated), /expected exactly/);
});

test('native acquisition validation binds requested URL, successful status and actual gallery destination', async t => {
  const { root, receipt } = await fixture(t);
  for (const change of [
    { requestedUrl: 'https://other.example/' }, { finalUrl: 'https://www.siteinspire.com/login' },
    { httpStatus: 403 }, { imageSha256: '0'.repeat(64) }, { links: [GALLERY_DIRECTORY] },
    { links: ['https://unrelated.example/'] }, { links: [GALLERY_ITEM, GALLERY_ITEM] },
  ]) {
    const altered = rewrite(root, receipt, record => {
      assert.ok(record.acquisition && typeof record.acquisition === 'object');
      Object.assign(record.acquisition, change);
    });
    assert.throws(() => readDirectDiscoveryEntry(root, altered), /REFERENCE_DISCOVERY/);
  }
});

test('exact receipts cannot escape through symlinks, parent paths or reused retained namespaces', async t => {
  const { root, receipt } = await fixture(t);
  assert.throws(() => readDirectDiscoveryEntry(root, { ...receipt, capture: { ...receipt.capture, path: `../${receipt.capture.path}` } }), /lane\/purpose path/);
  assert.throws(() => readDirectDiscoveryEntry(root, { ...receipt, capture: { ...receipt.capture, path: receipt.capture.path.replace('.omd/discovery/', '.omd/refs/') } }), /lane\/purpose path/);
  const path = join(root, receipt.capture.path);
  const copy = join(root, 'saved-native-record.json');
  writeFileSync(copy, readFileSync(path)); rmSync(path); symlinkSync(copy, path);
  assert.throws(() => readDirectDiscoveryEntry(root, receipt), /symlink|regular|stably/);
});

test('rehashing a different-sized PNG does not establish a native discovery viewport', async t => {
  const { root, receipt } = await fixture(t);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
  const sha256 = discoveryDigest(png);
  const path = `.omd/discovery/design/entries/${sha256}.png`;
  writeFileSync(join(root, path), png);
  const rewritten = rewrite(root, receipt, record => {
    record.imagePath = path;
    assert.ok(record.acquisition && typeof record.acquisition === 'object');
    Object.assign(record.acquisition, { imageSha256: sha256 });
  });
  assert.throws(() => readDirectDiscoveryEntry(root, { ...rewritten, evidence: { path, sha256 } }), /signature invalid|viewport differs/);
});

test('ordinary strict navigation rejects legacy schema even when its hash and purpose path match', async t => {
  const { root, receipt } = await fixture(t);
  const native: Record<string, unknown> = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
  delete native.method; delete native.entry; native.schema = 'reference-navigation-capture-v1';
  const imageBytes = readFileSync(join(root, receipt.evidence.path));
  const imagePath = `.omd/discovery/design/navigation/${receipt.evidence.sha256}.png`;
  native.imagePath = imagePath;
  const bytes = `${JSON.stringify(native, null, 2)}\n`; const sha256 = discoveryDigest(bytes);
  const path = `.omd/discovery/design/navigation/${sha256}.json`;
  mkdirSync(join(root, '.omd/discovery/design/navigation'));
  writeFileSync(join(root, imagePath), imageBytes); writeFileSync(join(root, path), bytes);
  assert.throws(() => readStrictDiscoveryNavigation(root, { url: receipt.url, evidence: { path: imagePath, sha256: receipt.evidence.sha256 }, capture: { path, sha256 } }), /binding differs/);
});
