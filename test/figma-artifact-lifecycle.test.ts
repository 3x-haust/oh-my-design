import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  authorizeFigmaArtifact,
  createFigmaArtifactAuthoritySession,
} from '../core/figma/artifact-authority.ts';
import { figmaArtifactReceipt } from '../core/figma/artifact-lifecycle.ts';
import { scanProject, type ProjectScan } from '../core/layout/scan.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

type FigmaLifecycleFixture = {
  readonly root: string;
  readonly figmaDir: string;
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
  return { root, figmaDir, exportsDir, rendersDir, snapshotBytes };
}

function seedOwnedFrameOutputs(fixture: FigmaLifecycleFixture, frameId: string): readonly string[] {
  const safeId = frameId.replaceAll(/[:/]/g, '_');
  const paths = [join(fixture.exportsDir, `${safeId}.png`), join(fixture.rendersDir, `${safeId}.png`)];
  for (const [index, path] of paths.entries()) {
    const bytes = Buffer.from(`png:${safeId}:${index}`);
    writeFileSync(path, bytes);
    writeFileSync(`${path}.omd.json`, figmaArtifactReceipt({
      kind: index === 0 ? 'export' : 'render', frameId, snapshotBytes: fixture.snapshotBytes, pngBytes: bytes,
    }));
  }
  return paths;
}

function lifecycleCandidates(scan: ProjectScan): ReadonlySet<string> {
  return new Set([...scan.cleanable, ...scan.retired].map((entry) => entry.path));
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('production cleanup removes only a genuinely authorized stale Figma artifact and reclaims its authority', (context) => {
  const fixture = makeFixture();
  const state = mkdtempSync(join(tmpdir(), 'omd-figma-authority-state-'));
  const previousState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = state;
  context.after(() => {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousState;
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  });
  const adapter = createTestProjectWriteAdapter(fixture.root);
  const stalePath = join(fixture.exportsDir, '9_9.png');
  const staleBytes = Buffer.from('genuine stale product bytes');
  const creationSnapshot = Buffer.from(fixture.snapshotBytes.toString('utf8').replace(
    '"frames": [',
    '"frames": [' + ['7:7', '9:9', '13:13', '14:14'].map((id) => `{"id":"${id}","name":"Created frame ${id}","nodes":[]}`).join(',') + ',',
  ));
  adapter.write('.omd/figma/snapshot.json', creationSnapshot);
  const session = createFigmaArtifactAuthoritySession(fixture.root, adapter);
  const createAuthorized = (frameId: string, bytes: Buffer, snapshotBytes: Uint8Array = creationSnapshot): string => {
    const id = frameId.replaceAll(':', '_');
    const path = join(fixture.exportsDir, `${id}.png`);
    adapter.write(`.omd/figma/exports/${id}.png`, bytes);
    adapter.write(`.omd/figma/exports/${id}.png.omd.json`, figmaArtifactReceipt({
      kind: 'export', frameId, snapshotBytes, pngBytes: bytes,
    }));
    return authorizeFigmaArtifact(session, { kind: 'export', frameId, pngPath: path, snapshotBytes });
  };
  const authority = createAuthorized('9:9', staleBytes);
  const citedAuthority = createAuthorized('7:7', Buffer.from('cited authorized bytes'));
  const truncatedAuthority = createAuthorized('13:13', Buffer.from('truncated-receipt artifact'));
  const swappedAuthority = createAuthorized('14:14', Buffer.from('original authorized bytes'));
  adapter.write('.omd/figma/snapshot.json', fixture.snapshotBytes);
  const currentAuthority = createAuthorized('1:2', Buffer.from('current authorized bytes'), fixture.snapshotBytes);
  writeFileSync(join(fixture.root, '.omd', 'decisions.md'), 'retain figma/exports/7_7.png as cited evidence\n');
  writeFileSync(join(fixture.exportsDir, '13_13.png.omd.json'), '{');
  rmSync(join(fixture.exportsDir, '14_14.png'));
  writeFileSync(join(fixture.exportsDir, '14_14.png'), 'path-swapped user bytes');

  const protectedPaths = [
    join(fixture.exportsDir, '1_2.png'),
    join(fixture.exportsDir, '1_2.png.omd.json'),
    join(fixture.exportsDir, '7_7.png'),
    join(fixture.exportsDir, '7_7.png.omd.json'),
    join(fixture.exportsDir, '13_13.png'),
    join(fixture.exportsDir, '13_13.png.omd.json'),
    join(fixture.exportsDir, '14_14.png'),
    join(fixture.exportsDir, '14_14.png.omd.json'),
    join(fixture.exportsDir, 'user-export.png'),
    join(fixture.rendersDir, 'user-render.png'),
    join(fixture.exportsDir, '8_8.png'),
    join(fixture.exportsDir, '8_8.png.omd.json'),
    join(fixture.exportsDir, '12_12.png'),
    join(fixture.exportsDir, '12_12.png.omd.json'),
    join(fixture.rendersDir, '11_11.png'),
    join(fixture.rendersDir, '11_11.png.omd.json'),
  ];
  writeFileSync(protectedPaths[8] ?? '', 'user export bytes');
  writeFileSync(protectedPaths[9] ?? '', 'user render bytes');
  const forgedBytes = Buffer.from('self-consistent forged bytes');
  writeFileSync(protectedPaths[10] ?? '', forgedBytes);
  writeFileSync(protectedPaths[11] ?? '', figmaArtifactReceipt({ kind: 'export', frameId: '8:8', snapshotBytes: creationSnapshot, pngBytes: forgedBytes }));
  writeFileSync(protectedPaths[12] ?? '', 'copied-receipt bytes');
  writeFileSync(protectedPaths[13] ?? '', readFileSync(join(fixture.exportsDir, '9_9.png.omd.json')));
  const futureBytes = Buffer.from('future-receipt bytes');
  const futureSnapshot = Buffer.from(creationSnapshot.toString('utf8').replace('2026-08-11T00:00:00.000Z', '2999-01-01T00:00:00.000Z'));
  writeFileSync(protectedPaths[14] ?? '', futureBytes);
  writeFileSync(protectedPaths[15] ?? '', figmaArtifactReceipt({ kind: 'render', frameId: '11:11', snapshotBytes: futureSnapshot, pngBytes: futureBytes }));
  const symlinkTarget = join(fixture.root, 'user-deliverable.png');
  const symlinkPath = join(fixture.exportsDir, '6_6.png');
  writeFileSync(symlinkTarget, 'symlink target user bytes');
  symlinkSync(symlinkTarget, symlinkPath);
  protectedPaths.push(symlinkTarget, symlinkPath);
  const protectedHashes = new Map(protectedPaths.map((path) => [path, hash(path)]));

  const result = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'bin', 'omd.mjs'), 'clean', '--cache', '--apply', '--json'], {
    cwd: fixture.root,
    env: { ...process.env, XDG_STATE_HOME: state },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    applied: true,
    removed: ['figma/exports/9_9.png', 'figma/exports/9_9.png.omd.json'],
  });
  assert.equal(existsSync(stalePath), false);
  assert.equal(existsSync(`${stalePath}.omd.json`), false);
  assert.equal(existsSync(authority), false);
  assert.equal(existsSync(currentAuthority), true);
  assert.equal(existsSync(citedAuthority), true);
  assert.equal(existsSync(truncatedAuthority), false);
  assert.equal(existsSync(swappedAuthority), false);
  for (const [path, before] of protectedHashes) {
    assert.equal(existsSync(path), true, `${path} must survive`);
    assert.equal(hash(path), before, `${path} bytes must remain identical`);
  }
});

test('cleanup resumes an interrupted authority transaction across concurrent sessions and is repeatable', (context) => {
  const fixture = makeFixture();
  const state = mkdtempSync(join(tmpdir(), 'omd-figma-authority-interruption-'));
  const previousState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = state;
  context.after(() => {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousState;
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  });
  const adapter = createTestProjectWriteAdapter(fixture.root);
  const create = (kind: 'export' | 'render'): string => {
    const directory = kind === 'export' ? fixture.exportsDir : fixture.rendersDir;
    const path = join(directory, '1_2.png');
    const bytes = Buffer.from(`${kind} concurrent bytes`);
    adapter.write(`.omd/figma/${kind === 'export' ? 'exports' : 'renders'}/1_2.png`, bytes);
    adapter.write(`.omd/figma/${kind === 'export' ? 'exports' : 'renders'}/1_2.png.omd.json`, figmaArtifactReceipt({
      kind, frameId: '1:2', snapshotBytes: fixture.snapshotBytes, pngBytes: bytes,
    }));
    return authorizeFigmaArtifact(createFigmaArtifactAuthoritySession(fixture.root, adapter), {
      kind, frameId: '1:2', pngPath: path, snapshotBytes: fixture.snapshotBytes,
    });
  };
  const exportAuthority = create('export');
  const renderAuthority = create('render');
  const interrupted = readFileSync(exportAuthority, 'utf8').replace('"phase":"active"', '"phase":"deleting"');
  writeFileSync(exportAuthority, interrupted);
  adapter.write('.omd/figma/snapshot.json', `${JSON.stringify({
    fileKey: 'test-file', fileName: 'After interruption', capturedAt: '2026-08-12T00:00:00.000Z',
    pages: [{ id: 'page:1', name: 'Page 1', frames: [] }], componentSets: {},
  }, null, 2)}\n`);
  const run = (): { readonly status: number | null; readonly stdout: string; readonly stderr: string } => {
    const result = spawnSync(
      process.execPath,
      [join(import.meta.dirname, '..', 'bin', 'omd.mjs'), 'clean', '--cache', '--apply', '--json'],
      { cwd: fixture.root, env: { ...process.env, XDG_STATE_HOME: state }, encoding: 'utf8' },
    );
    if (typeof result.stdout !== 'string' || typeof result.stderr !== 'string') throw new Error('cleanup output encoding is invalid');
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const firstResult: unknown = JSON.parse(first.stdout);
  if (firstResult === null || typeof firstResult !== 'object' || Array.isArray(firstResult)) throw new Error('cleanup result is invalid');
  const firstRemoved = Reflect.get(firstResult, 'removed');
  if (!Array.isArray(firstRemoved)) throw new Error('cleanup removed paths are invalid');
  assert.deepEqual([...firstRemoved].sort(), [
    'figma/exports/1_2.png', 'figma/exports/1_2.png.omd.json',
    'figma/renders/1_2.png', 'figma/renders/1_2.png.omd.json',
  ]);
  assert.equal(existsSync(exportAuthority), false);
  assert.equal(existsSync(renderAuthority), false);

  const repeated = run();
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual(JSON.parse(repeated.stdout), { applied: true, removed: [] });
});

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
