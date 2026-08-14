import { BROWSER_RS_MCP_REAPER } from './browser-rs-mcp-reaper.ts';

export type BrowserRsLauncherRelease = {
  readonly platform: string;
  readonly arch: string;
  readonly asset: string;
  readonly sha256: string;
};

export function browserRsMcpLauncher(
  releases: readonly BrowserRsLauncherRelease[],
  version: string,
  receiptSchema: string,
): string {
  return String.raw`
const { randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { accessSync, constants, readFileSync } = require('node:fs');
const { lstat, rename, rm } = require('node:fs/promises');
const { createServer } = require('node:net');
const { delimiter, dirname, join } = require('node:path');
const reaperScript = ${JSON.stringify(BROWSER_RS_MCP_REAPER)};
const releases = ${JSON.stringify(releases)};
const version = ${JSON.stringify(version)};
const receiptSchema = ${JSON.stringify(receiptSchema)};
const token = randomUUID();
const EXIT_TIMEOUT_MS = 3000;

function executable(path) {
  try { accessSync(path, constants.X_OK); return true; } catch { return false; }
}
function onPath(name, environment) {
  for (const directory of (environment.PATH ?? '').split(delimiter)) {
    if (directory !== '' && executable(join(directory, name))) return join(directory, name);
  }
  return undefined;
}
function ownedBinary(path) {
  const release = releases.find((candidate) => candidate.platform === process.platform && candidate.arch === process.arch);
  if (release === undefined) return false;
  try {
    const receiptBytes = readFileSync(join(dirname(path), 'receipt.json'));
    const receipt = JSON.parse(receiptBytes.toString('utf8'));
    const expected = Buffer.from(JSON.stringify({ schemaVersion: receiptSchema, version, asset: release.asset, sha256: release.sha256 }) + '\n');
    const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
    return receipt !== null && typeof receipt === 'object' && !Array.isArray(receipt)
      && Object.keys(receipt).sort().join(',') === 'asset,schemaVersion,sha256,version'
      && receipt.schemaVersion === receiptSchema && receipt.version === version
      && receipt.asset === release.asset && receipt.sha256 === release.sha256
      && digest(receiptBytes) === digest(expected) && digest(readFileSync(path)) === release.sha256;
  } catch { return false; }
}
function signalGroup(pid, signal) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  try { process.kill(-pid, signal); }
  catch (error) { if (error?.code !== 'ESRCH' && error?.code !== 'EPERM') throw error; }
}
async function sameLease(path, lease, expectedKind) {
  if (lease.kind !== expectedKind) return false;
  try {
    const stats = await lstat(path);
    return stats.isDirectory() && !stats.isSymbolicLink()
      && stats.dev === lease.device && stats.ino === lease.inode && stats.birthtimeMs === lease.createdAt;
  } catch { return false; }
}
async function cleanupLease(lease, expectedKind) {
  if (!await sameLease(lease.path, lease, expectedKind)) return false;
  const claim = join(lease.parent, '.omd-browser-rs-main-claim-' + randomUUID());
  try { await rename(lease.path, claim); } catch { return false; }
  if (!await sameLease(claim, lease, expectedKind)) return false;
  await rm(claim, { recursive: true, force: true });
  return true;
}
function bounded(event, onTimeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { onTimeout(); reject(new Error('browser-rs exact exit event timed out')); }, EXIT_TIMEOUT_MS);
    event.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function main() {
  const environment = { ...process.env };
  environment.PATH = join(environment.HOME ?? '', '.local', 'bin') + delimiter + (environment.PATH ?? '');
  let binary = environment.OMD_BROWSER_RS_BIN;
  if (binary === undefined || binary === '') binary = onPath('browser-rs', environment);
  if (binary === undefined) {
    if (environment.HOME === undefined || environment.HOME === '') throw new Error('HOME must be set');
    const candidate = join(environment.HOME, '.local', 'share', 'oh-my-design', 'browser-rs', version, 'browser-rs');
    if (!ownedBinary(candidate)) throw new Error('OMD-owned binary is missing or unverified');
    binary = candidate;
  }
  const temporary = environment.TMPDIR ?? '/tmp';
  let sentinelSocket;
  let closeSentinel;
  const sentinelClosed = new Promise((resolve) => { closeSentinel = resolve; });
  const server = createServer((socket) => {
    let input = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      input += chunk;
      const newline = input.indexOf('\n');
      if (newline < 0) return;
      if (input.slice(0, newline) !== token || sentinelSocket !== undefined) return socket.destroy();
      sentinelSocket = socket;
      socket.removeAllListeners('data');
      socket.once('end', () => closeSentinel());
      socket.once('close', () => closeSentinel());
      socket.resume();
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port: 0 }, resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('browser-rs sentinel did not bind');
  const reaper = spawn(process.execPath, ['-e', reaperScript], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
  process.stdin.pipe(reaper.stdin);
  reaper.stdout.pipe(process.stdout);
  reaper.stderr.pipe(process.stderr);
  reaper.send({ type: 'init', token, kind: 'profile', parent: temporary, binary, environment, sentinelPort: address.port });
  let lease;
  let released = false;
  let requestedExit;
  let initError;
  const handlers = [['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]].map(([signal, code]) => {
    const handler = () => { requestedExit = code; if (reaper.connected) reaper.send({ type: 'signal', token, signal }); };
    process.once(signal, handler);
    return { signal, handler };
  });
  reaper.on('message', (message) => {
    if (message?.token !== token) return;
    if (message.type === 'ready' && message.kind === 'profile'
      && typeof message.parent === 'string' && typeof message.path === 'string' && Number.isSafeInteger(message.childPid)
      && Number.isSafeInteger(message.device) && Number.isSafeInteger(message.inode)
      && typeof message.createdAt === 'number') {
      lease = {
        kind: message.kind, parent: message.parent, path: message.path, childPid: message.childPid,
        device: message.device, inode: message.inode, createdAt: message.createdAt,
      };
      if (reaper.connected) reaper.send({ type: 'lease-held', token });
    } else if (message.type === 'complete' && message.kind === 'profile' && message.removed === true) released = true;
    else if (message.type === 'error') initError = message;
  });
  const result = await new Promise((resolve) => reaper.once('exit', (code, signal) => resolve({ code, signal })));
  for (const item of handlers) process.off(item.signal, item.handler);
  if (!released && lease !== undefined) {
    signalGroup(lease.childPid, 'SIGTERM');
    try { await bounded(sentinelClosed, () => signalGroup(lease.childPid, 'SIGKILL')); }
    catch { await bounded(sentinelClosed, () => signalGroup(lease.childPid, 'SIGKILL')); }
    await cleanupLease(lease, 'profile');
  }
  sentinelSocket?.destroy();
  await new Promise((resolve) => server.close(() => resolve()));
  if (initError !== undefined) console.error('browser-rs: ' + (initError.code ?? 'UNKNOWN') + ': ' + initError.error);
  if (requestedExit !== undefined) process.exitCode = requestedExit;
  else process.exitCode = result.signal === null ? (result.code ?? 1) : 1;
}
main().catch((error) => { console.error('browser-rs: ' + (error instanceof Error ? error.message : String(error))); process.exitCode = 1; });
`;
}
