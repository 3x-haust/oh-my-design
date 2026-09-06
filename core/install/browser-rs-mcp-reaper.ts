export const BROWSER_RS_MCP_REAPER = String.raw`
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { connect } = require('node:net');
const { lstat, mkdtemp, realpath, rename, rm, writeFile } = require('node:fs/promises');
const { basename, join } = require('node:path');
const SHUTDOWN_TIMEOUT_MS = 3000;
let initialized = false;
let activeLease;

const same = (stats, lease) => stats.isDirectory() && !stats.isSymbolicLink()
  && stats.dev === lease.dev && stats.ino === lease.ino && stats.birthtimeMs === lease.birthtimeMs;

async function owned(path, lease) {
  try { return same(await lstat(path), lease); } catch { return false; }
}

async function cleanup(lease, expectedKind) {
  if (lease.kind !== expectedKind || !await owned(lease.path, lease)) return false;
  const claim = join(lease.parent, '.omd-browser-rs-lease-claim-' + randomUUID());
  try { await rename(lease.path, claim); } catch { return false; }
  if (!await owned(claim, lease)) return false;
  await rm(claim, { recursive: true, force: true });
  return true;
}

function signalGroup(pid, signal) {
  try { process.kill(-pid, signal); return true; }
  catch (error) {
    if (error?.code === 'ESRCH' || error?.code === 'EPERM') return false;
    throw error;
  }
}

async function initialize(message) {
  if (initialized || message === null || typeof message !== 'object'
    || typeof message.token !== 'string' || message.token.length < 32 || message.kind !== 'profile'
    || typeof message.parent !== 'string' || typeof message.binary !== 'string') {
    throw new Error('invalid browser-rs lease initialization');
  }
  initialized = true;
  const parent = await realpath(message.parent);
  const parentStats = await lstat(parent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) throw new Error('browser-rs temporary parent must be a real directory');
  const path = await mkdtemp(join(parent, 'omd-browser-rs.'));
  const stats = await lstat(path);
  const lease = { token: message.token, kind: message.kind, parent, path, dev: stats.dev, ino: stats.ino, birthtimeMs: stats.birthtimeMs };
  activeLease = lease;
  if (message.environment?.OMD_TEST_REAPER_INIT_CRASH === '1') throw new Error('browser-rs test reaper init crash');
  if (!Number.isSafeInteger(message.sentinelPort) || message.sentinelPort <= 0) throw new Error('invalid browser-rs sentinel port');
  const sentinel = connect({ host: '127.0.0.1', port: message.sentinelPort });
  await new Promise((resolve, reject) => { sentinel.once('connect', resolve); sentinel.once('error', reject); });
  await new Promise((resolve, reject) => sentinel.write(message.token + '\n', (error) => error ? reject(error) : resolve()));
  const child = spawn(message.binary, ['--headless', '--user-data-dir=' + path], {
    env: message.environment, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe', sentinel],
  });
  sentinel.unref();
  const childExit = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const marker = {
    schema: 'omd-browser-profile-v2', kind: lease.kind, name: basename(path), reaperPid: process.pid,
    device: stats.dev, inode: stats.ino, createdAt: stats.birthtimeMs, childPid: child.pid,
  };
  await writeFile(join(path, '.omd-owner.json'), JSON.stringify(marker) + '\n', { flag: 'wx', mode: 0o600 });
  let shutdown;
  const terminate = (signal) => {
    if (shutdown !== undefined) return shutdown;
    shutdown = (async () => {
      if (child.pid !== undefined && signal !== undefined) signalGroup(child.pid, signal);
      let timeout;
      const deadline = new Promise((resolve) => {
        timeout = setTimeout(() => {
          if (child.pid !== undefined) signalGroup(child.pid, 'SIGKILL');
          resolve(undefined);
        }, SHUTDOWN_TIMEOUT_MS);
      });
      await Promise.race([childExit, deadline]);
      clearTimeout(timeout);
      return childExit;
    })();
    return shutdown;
  };
  let acknowledgeLease;
  const leaseHeld = new Promise((resolve) => { acknowledgeLease = resolve; });
  process.on('message', (control) => {
    if (control?.token !== lease.token) return;
    if (control.type === 'lease-held') acknowledgeLease(true);
    else if (control.type === 'signal' && ['SIGHUP', 'SIGINT', 'SIGTERM'].includes(control.signal)) void terminate(control.signal);
  });
  process.once('disconnect', () => {
    acknowledgeLease(false);
    if (child.pid !== undefined) signalGroup(child.pid, 'SIGTERM');
    void terminate('SIGTERM');
  });
  process.send?.({
    type: 'ready', token: message.token, kind: lease.kind, parent: lease.parent, path, childPid: child.pid,
    device: lease.dev, inode: lease.ino, createdAt: lease.birthtimeMs,
  });
  const heldByMain = await leaseHeld;
  if (heldByMain) {
    process.stdin.pipe(child.stdin);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    process.stdin.once('end', () => { void terminate(undefined); });
  } else {
    await terminate('SIGTERM');
  }

  const result = await childExit;
  if (child.pid !== undefined) signalGroup(child.pid, 'SIGKILL');
  const removed = await cleanup(lease, 'profile');
  activeLease = undefined;
  process.send?.({ type: 'complete', token: lease.token, kind: lease.kind, removed, code: result.code, signal: result.signal });
  return result;
}

process.once('message', (message) => {
  if (message?.type !== 'init') return;
  initialize(message).then((result) => {
    process.exitCode = typeof result.code === 'number' ? result.code : 1;
    process.disconnect();
  }).catch(async (error) => {
    if (activeLease !== undefined) {
      await cleanup(activeLease, 'profile');
      activeLease = undefined;
    }
    process.send?.({
      type: 'error', token: message.token,
      error: error instanceof Error ? error.message : String(error),
      code: error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'UNKNOWN',
    });
    process.exitCode = 1;
    process.disconnect();
  });
});
`;
