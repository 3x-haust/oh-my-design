export const BROWSER_RS_TEMPORARY_REAPER = String.raw`
const { randomUUID } = require('node:crypto');
const { lstat, mkdtemp, realpath, rename, rm, writeFile } = require('node:fs/promises');
const { basename, join } = require('node:path');
let lease;
let cleaning;

const same = (stats, value) => stats.isDirectory() && !stats.isSymbolicLink()
  && stats.dev === value.dev && stats.ino === value.ino
  && stats.birthtimeMs === value.birthtimeMs;

async function owned(value) {
  try { return same(await lstat(value.path), value); } catch { return false; }
}

async function clean() {
  if (cleaning !== undefined) return cleaning;
  cleaning = (async () => {
    const value = lease;
    if (value === undefined || !await owned(value)) return false;
    const claim = join(value.parent, '.omd-browser-rs-lease-claim-' + randomUUID());
    try { await rename(value.path, claim); } catch { return false; }
    const claimed = { ...value, path: claim };
    if (!await owned(claimed)) return false;
    await rm(claim, { recursive: true, force: true });
    return true;
  })();
  return cleaning;
}

async function initialize(message) {
  if (lease !== undefined || message === null || typeof message !== 'object'
    || (message.kind !== 'profile' && message.kind !== 'screenshot')
    || typeof message.parent !== 'string' || typeof message.token !== 'string' || message.token.length < 32) {
    throw new Error('invalid temporary lease initialization');
  }
  const parent = await realpath(message.parent);
  const parentStats = await lstat(parent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) throw new Error('temporary parent must be a real directory');
  const path = await mkdtemp(join(parent, 'omd-browser-rs-' + message.kind + '-'));
  const stats = await lstat(path);
  lease = {
    token: message.token, kind: message.kind, parent, path,
    dev: stats.dev, ino: stats.ino, birthtimeMs: stats.birthtimeMs,
  };
  const marker = {
    schema: 'omd-browser-rs-temporary-v2', kind: message.kind, name: basename(path),
    device: stats.dev, inode: stats.ino, createdAt: stats.birthtimeMs,
  };
  await writeFile(join(path, '.omd-owner.json'), JSON.stringify(marker) + '\n', { flag: 'wx', mode: 0o600 });
  process.send?.({ type: 'ready', token: message.token, path });
}

process.on('message', (message) => {
  if (message?.type === 'init') {
    initialize(message).catch((error) => {
      process.send?.({
        type: 'error', token: message.token,
        error: error instanceof Error ? error.message : String(error),
        code: error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'UNKNOWN',
      });
      process.exitCode = 1;
      process.disconnect();
    });
    return;
  }
  if (message?.type === 'cleanup' && lease !== undefined && message.token === lease.token) {
    clean().then((removed) => {
      process.send?.({ type: 'cleaned', token: message.token, removed });
      process.disconnect();
    }).catch(() => process.exitCode = 1);
  }
});

process.on('disconnect', () => {
  clean().finally(() => process.exit());
});
`;
