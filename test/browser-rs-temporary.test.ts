import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createBrowserRsTemporaryResource } from '../core/install/browser-rs-temporary.ts';

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'omd-browser-rs-owned-temp-'));
}

function childMessage(child: ChildProcess, timeoutMs = 5_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('temporary owner child message timed out')), timeoutMs);
    child.once('message', (value: unknown) => {
      clearTimeout(timer);
      if (typeof value === 'string') resolve(value);
      else reject(new Error('temporary owner child returned an invalid path'));
    });
  });
}

function removedPath(path: string, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const parent = join(path, '..');
    const name = basename(path);
    const watcher = watch(parent);
    const timer = setTimeout(() => { watcher.close(); reject(new Error('temporary reaper cleanup timed out')); }, timeoutMs);
    watcher.on('change', (_event, changed) => {
      if ((changed !== null && changed.toString() !== name && existsSync(path)) || existsSync(path)) return;
      clearTimeout(timer);
      watcher.close();
      resolve();
    });
  });
}

test('repeated invalid temporary roots reject with typed ENOENT after each reaper exits', { timeout: 10_000 }, async () => {
  const missing = join(tmpdir(), `omd-browser-rs-missing-${process.pid}`);
  for (let index = 0; index < 8; index += 1) {
    await assert.rejects(
      createBrowserRsTemporaryResource(missing, 'profile'),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT',
    );
  }
  assert.equal(existsSync(missing), false);
});

test('browser-rs temporary resources have explicit ownership and idempotent cleanup', async (context) => {
  const root = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const profile = await createBrowserRsTemporaryResource(root, 'profile');
  const screenshot = await createBrowserRsTemporaryResource(root, 'screenshot');

  assert.match(readFileSync(join(profile.path, '.omd-owner.json'), 'utf8'), /"schema":"omd-browser-rs-temporary-v2"/);
  assert.equal(await screenshot.cleanup(), true);
  assert.equal(await screenshot.cleanup(), true);
  assert.equal(await profile.cleanup(), true);
  assert.equal(await profile.cleanup(), true);
  assert.equal(existsSync(profile.path), false);
  assert.equal(existsSync(screenshot.path), false);
});

test('concurrent creation preserves active resources and a forged dead-owner receipt', async (context) => {
  const root = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const active = await createBrowserRsTemporaryResource(root, 'profile');
  const forged = join(root, 'omd-browser-rs-screenshot-forged');
  mkdirSync(forged);
  writeFileSync(join(forged, '.omd-owner.json'), `${JSON.stringify({
    schema: 'omd-browser-rs-temporary-v2', kind: 'screenshot', name: basename(forged),
    device: 1, inode: 1, createdAt: 9_999_999_999_999,
  })}\n`);
  writeFileSync(join(forged, 'user-bytes'), 'forged receipt cannot grant cleanup authority');
  const next = await createBrowserRsTemporaryResource(root, 'screenshot');

  assert.equal(existsSync(active.path), true);
  assert.equal(existsSync(forged), true);
  assert.equal(readFileSync(join(forged, 'user-bytes'), 'utf8'), 'forged receipt cannot grant cleanup authority');
  assert.equal(await next.cleanup(), true);
  assert.equal(await active.cleanup(), true);
});

test('future self-consistent receipts and unavailable process identity never authorize startup deletion', async (context) => {
  const root = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const forged = join(root, 'omd-browser-rs-profile-forged');
  mkdirSync(forged);
  writeFileSync(join(forged, 'user-bytes'), 'future forged user bytes');
  const forgedStats = lstatSync(forged);
  writeFileSync(join(forged, '.omd-owner.json'), `${JSON.stringify({
    schema: 'omd-browser-rs-temporary-v999', kind: 'profile', name: basename(forged),
    inode: forgedStats.ino, device: forgedStats.dev, createdAt: forgedStats.birthtimeMs,
    capability: 'self-consistent-forgery',
  })}\n`);
  const priorPath = process.env.PATH;
  process.env.PATH = '';
  try {
    const first = await createBrowserRsTemporaryResource(root, 'profile');
    const concurrent = await createBrowserRsTemporaryResource(root, 'profile');
    assert.equal(existsSync(first.path), true);
    assert.equal(readFileSync(join(forged, 'user-bytes'), 'utf8'), 'future forged user bytes');
    assert.equal(await concurrent.cleanup(), true);
    assert.equal(await first.cleanup(), true);
  } finally {
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
  }
});

test('capability reaper cleans a task-owned root when its owner is killed', async (context) => {
  const root = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const moduleUrl = new URL('../core/install/browser-rs-temporary.ts', import.meta.url).href;
  const source = `import { createBrowserRsTemporaryResource } from ${JSON.stringify(moduleUrl)};\nconst resource = await createBrowserRsTemporaryResource(${JSON.stringify(root)}, 'profile');\nprocess.send?.(resource.path);`;
  const owner = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const path = await childMessage(owner);
  const removed = removedPath(path);
  const exited = new Promise<void>((resolve) => owner.once('exit', () => resolve()));

  owner.kill('SIGKILL');
  await exited;
  await removed;

  assert.equal(existsSync(path), false);
});

test('temporary cleanup is no-follow and preserves unreceipted, symlinked, and inode-swapped paths', async (context) => {
  const root = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const unreceipted = join(root, 'omd-browser-rs-profile-user');
  const target = join(root, 'user-profile');
  const linked = join(root, 'omd-browser-rs-profile-linked');
  mkdirSync(unreceipted);
  mkdirSync(target);
  writeFileSync(join(unreceipted, 'keep'), 'unreceipted user bytes');
  writeFileSync(join(target, 'keep'), 'symlink target bytes');
  symlinkSync(target, linked);
  const created = await createBrowserRsTemporaryResource(root, 'profile');
  const original = join(root, `${basename(created.path)}-original`);
  renameSync(created.path, original);
  mkdirSync(created.path);
  writeFileSync(join(created.path, '.omd-owner.json'), readFileSync(join(original, '.omd-owner.json')));
  writeFileSync(join(created.path, 'keep'), 'replacement bytes');

  assert.equal(await created.cleanup(), false);
  assert.equal(readFileSync(join(created.path, 'keep'), 'utf8'), 'replacement bytes');
  assert.equal(readFileSync(join(unreceipted, 'keep'), 'utf8'), 'unreceipted user bytes');
  assert.equal(readFileSync(join(target, 'keep'), 'utf8'), 'symlink target bytes');
});
