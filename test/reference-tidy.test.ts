import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { testPng, testSearchReceipt } from './helpers/search-execution.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { saveRef } from '../core/ref/store.ts';

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const run = (cwd: string, ...args: string[]) => promisify(execFile)(process.execPath, [cli, 'ref', 'tidy', ...args, '--json'], { cwd, env, timeout: 20000 });
function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-tidy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const receipt = testSearchReceipt(root, 'design', 'task dashboard', ['https://dribbble.com/shots/123-dashboard']);
  return { root, receipt };
}

test('ref tidy previews old search clutter without mutation, then archives exact bytes outside refs', async t => {
  const { root, receipt } = fixture(t);
  const before = new Map(readdirSync(join(root, '.omd/refs/design')).map(name => {
    const path = `.omd/refs/design/${name}`;
    return [path, readFileSync(join(root, path))] as const;
  }));
  const preview = JSON.parse((await run(root)).stdout);
  assert.equal(preview.applied, false);
  assert.equal(preview.files.length, 2);
  assert.equal(existsSync(join(root, '.omd/archive/references')), false);
  assert.deepEqual(readFileSync(join(root, receipt.path)), before.get(receipt.path));
  const result = JSON.parse((await run(root, '--apply')).stdout);
  assert.equal(result.applied, true);
  assert.equal(result.files.length, 2);
  for (const entry of result.files) {
    assert.ok(entry.archivePath.startsWith('.omd/archive/references/'));
    const bytes = readFileSync(join(root, entry.archivePath));
    assert.equal(hash(bytes), entry.sha256);
    assert.deepEqual(bytes, before.get(entry.path));
    assert.equal(existsSync(join(root, entry.path)), false);
  }
  assert.equal(JSON.parse((await run(root, '--apply')).stdout).files.length, 0);
});

test('ref tidy refuses tampered and symlinked legacy evidence without removing anything', async t => {
  const { root, receipt } = fixture(t);
  const path = join(root, receipt.path);
  const original = readFileSync(path);
  writeFileSync(path, `${original.toString()} `);
  await assert.rejects(run(root, '--apply'), /changed|digest|hash/i);
  assert.equal(existsSync(join(root, '.omd/archive/references')), false);
  assert.equal(existsSync(path), true);
  writeFileSync(`${path}.backup`, original); rmSync(path); symlinkSync(`${path}.backup`, path);
  await assert.rejects(run(root, '--apply'), /symlink|regular|stably/i);
  assert.equal(existsSync(`${path}.backup`), true);
  assert.equal(existsSync(join(root, '.omd/archive/references')), false);
});

test('ref tidy archives unqualified design and legacy records while preserving qualified and domain evidence', async t => {
  const value = designAdmissionFixture(t);
  const invalid = value.capture('https://ordinary.example/service', 'unqualified', 'design', 5);
  const legacy = { ...value.domain.ref, component: 'legacy-domain', imagePath: value.domain.evidence.path };
  delete legacy.researchLane; delete legacy.acquisition;
  const legacyPath = saveRef(value.root, legacy, value.writer);
  const unknown = join(value.root, '.omd/refs/design/unknown.json');
  writeFileSync(unknown, '{"notes":"keep unknown data"}');
  const preserved = [value.source.path, value.gallery.path, value.domain.path, value.boardPath, unknown,
    ...[value.source, value.gallery, value.domain].map(item => join(value.root, item.evidence.path))];
  const original = preserved.map(path => [path, readFileSync(path)] as const);
  const result = JSON.parse((await run(value.root, '--apply')).stdout);
  const selected = new Set(result.files.map((entry: { path: string }) => entry.path));
  assert.ok(selected.has(invalid.capture.path));
  assert.ok(selected.has(invalid.evidence.path));
  assert.ok(selected.has(legacyPath.slice(value.root.length + 1)));
  for (const [path, bytes] of original) assert.deepEqual(readFileSync(path), bytes);
  assert.equal(result.revalidationRequired, true);
  const manifest = JSON.parse(readFileSync(join(value.root, result.manifestPath), 'utf8'));
  assert.deepEqual(manifest.files, result.files);
});

test('ref tidy archives legacy navigation records without treating them as retained references', async t => {
  const value = designAdmissionFixture(t);
  const selected: string[] = [];
  for (const lane of ['design', 'domain']) {
    const directory = `.omd/refs/${lane}/navigation`;
    const imagePath = `${directory}/capture.png`;
    const image = readFileSync(join(value.root, value.source.evidence.path));
    mkdirSync(join(value.root, directory), { recursive: true });
    writeFileSync(join(value.root, imagePath), image);
    const bytes = Buffer.from(JSON.stringify({ schema: 'reference-navigation-capture-v1', researchLane: lane,
      source: value.source.source, kind: 'page', capturedAt: '2026-09-21T00:00:00.000Z', imagePath,
      acquisition: { ...value.source.ref.acquisition, imageSha256: hash(image) } }));
    const recordPath = `${directory}/${hash(bytes)}.json`;
    writeFileSync(join(value.root, recordPath), bytes);
    selected.push(recordPath, imagePath);
  }
  const result = JSON.parse((await run(value.root, '--apply')).stdout);
  for (const path of selected) assert.ok(result.files.some((entry: { path: string }) => entry.path === path));
  assert.equal(existsSync(value.domain.path), true);
});

test('ref tidy refuses a corrupt existing archive before removing original evidence', async t => {
  const { root, receipt } = fixture(t);
  const preview = JSON.parse((await run(root)).stdout);
  const entry = preview.files[0]; assert.ok(entry);
  const archive = join(root, entry.archivePath);
  mkdirSync(dirname(archive), { recursive: true });
  writeFileSync(archive, 'corrupt archive');
  await assert.rejects(run(root, '--apply'), /archive|different bytes|digest/i);
  assert.equal(existsSync(join(root, receipt.path)), true);
});

test('ref tidy archives exact orphan search PNG bytes after an interrupted legacy search', async t => {
  const { root, receipt } = fixture(t);
  rmSync(join(root, receipt.path));
  const bytes = testPng();
  const path = `.omd/refs/design/search-${hash(bytes)}.png`;
  const result = JSON.parse((await run(root, '--apply')).stdout);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, path);
  assert.deepEqual(readFileSync(join(root, result.files[0].archivePath)), bytes);
  assert.equal(existsSync(join(root, path)), false);
});

test('ref tidy refuses a tampered orphan search PNG before archiving other valid candidates', async t => {
  const { root, receipt } = fixture(t);
  const path = `.omd/refs/design/search-${'a'.repeat(64)}.png`;
  writeFileSync(join(root, path), testPng());
  await assert.rejects(run(root, '--apply'), /digest|changed|hash/i);
  assert.equal(existsSync(join(root, path)), true);
  assert.equal(existsSync(join(root, receipt.path)), true);
  assert.equal(existsSync(join(root, '.omd/archive/references')), false);
});
