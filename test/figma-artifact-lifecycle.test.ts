import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { figmaArtifactReceipt } from '../core/figma/artifact-lifecycle.ts';
import { scanProject, type ProjectScan } from '../core/layout/scan.ts';

type FigmaLifecycleFixture = {
  readonly root: string;
  readonly exportsDir: string;
  readonly rendersDir: string;
  readonly snapshotBytes: Buffer;
};

function makeFixture(): FigmaLifecycleFixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-figma-lifecycle-'));
  const figmaDir = join(root, '.omd', 'figma');
  const exportsDir = join(figmaDir, 'exports');
  const rendersDir = join(figmaDir, 'renders');
  mkdirSync(exportsDir, { recursive: true });
  mkdirSync(rendersDir, { recursive: true });
  const snapshotBytes = Buffer.from(`${JSON.stringify({
    fileKey: 'test-file',
    fileName: 'Lifecycle fixture',
    capturedAt: '2026-08-11T00:00:00.000Z',
    pages: [{ id: 'page:1', name: 'Page 1', frames: [{ id: '1:2', name: 'Current frame', nodes: [] }] }],
    componentSets: {},
  }, null, 2)}\n`);
  writeFileSync(join(figmaDir, 'snapshot.json'), snapshotBytes);
  return { root, exportsDir, rendersDir, snapshotBytes };
}

function seedOwnedFrameOutputs(fixture: FigmaLifecycleFixture, frameId: string): readonly string[] {
  const safeId = frameId.replaceAll(/[:/]/g, '_');
  const paths = [join(fixture.exportsDir, `${safeId}.png`), join(fixture.rendersDir, `${safeId}.png`)];
  for (const [index, path] of paths.entries()) {
    const bytes = Buffer.from(`png:${safeId}:${index}`);
    writeFileSync(path, bytes);
    writeFileSync(`${path}.omd.json`, figmaArtifactReceipt({
      kind: index === 0 ? 'export' : 'render',
      frameId,
      snapshotBytes: fixture.snapshotBytes,
      pngBytes: bytes,
    }));
  }
  return paths;
}

function lifecycleCandidates(scan: ProjectScan): ReadonlySet<string> {
  return new Set([...scan.cleanable, ...scan.retired].map((entry) => entry.path));
}

test('the Figma lifecycle retains owned outputs for frames in the current snapshot', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  seedOwnedFrameOutputs(fixture, '1:2');

  const candidates = lifecycleCandidates(scanProject(fixture.root));

  assert.equal(candidates.has('figma/snapshot.json'), false);
  assert.equal(candidates.has('figma/exports/1_2.png'), false);
  assert.equal(candidates.has('figma/renders/1_2.png'), false);
});

test('Figma cleanup preserves absent-frame PNGs because disk receipts are not deletion authority', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  seedOwnedFrameOutputs(fixture, '1:2');
  seedOwnedFrameOutputs(fixture, '9:9');
  const unowned = join(fixture.exportsDir, '8_8.png');
  writeFileSync(unowned, Buffer.from('user-owned export'));

  const candidates = lifecycleCandidates(scanProject(fixture.root));
  const figmaCandidates = [...candidates].filter((path) => path.startsWith('figma/')).sort();

  assert.equal(candidates.has('figma/exports/1_2.png'), false);
  assert.equal(candidates.has('figma/renders/1_2.png'), false);
  assert.equal(candidates.has('figma/exports/8_8.png'), false);
  assert.deepEqual(figmaCandidates, []);
  assert.equal(readFileSync(join(fixture.exportsDir, '9_9.png'), 'utf8'), 'png:9_9:0');
  assert.equal(readFileSync(join(fixture.rendersDir, '9_9.png'), 'utf8'), 'png:9_9:1');
});

test('Figma cleanup classification preserves cited, tampered, malformed, and symlinked outputs', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const [cited] = seedOwnedFrameOutputs(fixture, '7:7');
  const [tampered] = seedOwnedFrameOutputs(fixture, '8:8');
  const [malformed] = seedOwnedFrameOutputs(fixture, '9:9');
  if (cited === undefined || tampered === undefined || malformed === undefined) throw new Error('fixture outputs missing');
  writeFileSync(join(fixture.root, '.omd', 'decisions.md'), 'Retain cited proof: figma/exports/7_7.png\n');
  writeFileSync(tampered, Buffer.from('changed user bytes'));
  writeFileSync(`${malformed}.omd.json`, '{');
  const target = join(fixture.root, 'user-deliverable.png');
  const linked = join(fixture.exportsDir, '6_6.png');
  writeFileSync(target, Buffer.from('user deliverable'));
  symlinkSync(target, linked);
  writeFileSync(`${linked}.omd.json`, readFileSync(`${cited}.omd.json`));

  const candidates = lifecycleCandidates(scanProject(fixture.root));

  for (const path of ['figma/exports/7_7.png', 'figma/exports/8_8.png', 'figma/exports/9_9.png', 'figma/exports/6_6.png']) {
    assert.equal(candidates.has(path), false, `${path} must be preserved`);
  }
  assert.equal(readFileSync(target, 'utf8'), 'user deliverable');
});
