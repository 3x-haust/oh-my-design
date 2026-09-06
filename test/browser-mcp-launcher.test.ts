import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { execFileSync, spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { BROWSER_RS_RELEASES } from '../core/install/browser-rs.ts';
import { browserRsMcpConfig, type BrowserRsMcpServer } from '../adapters/browser-mcp.ts';

type Fixture = {
  readonly root: string;
  readonly rootDevice: number;
  readonly rootInode: number;
  readonly home: string;
  readonly profileRoot: string;
  readonly log: string;
  readonly pathBin: string;
};

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-mcp-'));
  const rootStats = lstatSync(root);
  const profileRoot = join(root, 'profiles');
  mkdirSync(profileRoot);
  return {
    root,
    rootDevice: rootStats.dev,
    rootInode: rootStats.ino,
    home: join(root, 'home with spaces'),
    profileRoot,
    log: join(root, 'launch.log'),
    pathBin: join(root, 'path bin'),
  };
}

function removeFixture(fixture: Fixture): void {
  if (!existsSync(fixture.root)) return;
  const stats = lstatSync(fixture.root);
  assert.equal(stats.isDirectory() && !stats.isSymbolicLink(), true);
  assert.equal(stats.dev, fixture.rootDevice);
  assert.equal(stats.ino, fixture.rootInode);
  rmSync(fixture.root, { recursive: true, force: true });
}

function browserServer(): BrowserRsMcpServer {
  return browserRsMcpConfig().mcpServers['browser-rs'];
}

function ownedPath(fixture: Fixture): string {
  return join(fixture.home, '.local', 'share', 'oh-my-design', 'browser-rs', 'v0.1.10', 'browser-rs');
}

function writeFakeBinary(path: string, exitCode: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' "$0" "$@" >> "$OMD_TEST_LOG"\nexit ${exitCode}\n`);
  chmodSync(path, 0o755);
}

function launch(fixture: Fixture, env: NodeJS.ProcessEnv) {
  const server = browserServer();
  const path = [dirname(process.execPath), env.PATH ?? process.env.PATH ?? ''].join(delimiter);
  return spawnSync(server.command, server.args, {
    encoding: 'utf8',
    env: { ...process.env, HOME: fixture.home, OMD_TEST_LOG: fixture.log, TMPDIR: fixture.profileRoot, ...env, PATH: path },
  });
}

test('launcher discovers a mise-installed Node with a minimal MCP PATH', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const nodeDirectory = join(
    fixture.home,
    '.local',
    'share',
    'mise',
    'installs',
    'node',
    'current',
    'bin',
  );
  mkdirSync(nodeDirectory, { recursive: true });
  symlinkSync(process.execPath, join(nodeDirectory, 'node'));
  const override = join(fixture.root, 'override');
  writeFakeBinary(override, 0);
  const server = browserServer();
  const result = spawnSync(server.command, server.args, {
    encoding: 'utf8',
    env: {
      HOME: fixture.home,
      TMPDIR: fixture.profileRoot,
      OMD_BROWSER_RS_BIN: override,
      OMD_TEST_LOG: fixture.log,
      PATH: '/usr/bin:/bin',
    },
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
});

function supportedRelease(): (typeof BROWSER_RS_RELEASES)[number] | undefined {
  return BROWSER_RS_RELEASES.find((release) => release.platform === process.platform && release.arch === process.arch);
}

function writeExactReceipt(target: string): void {
  const release = supportedRelease();
  if (release === undefined) throw new Error('test platform has no browser-rs release');
  writeFileSync(join(dirname(target), 'receipt.json'), `${JSON.stringify({
    schemaVersion: 'browser-rs-receipt-v1',
    version: 'v0.1.10',
    asset: release.asset,
    sha256: release.sha256,
  })}\n`);
}

function assertNotLaunched(fixture: Fixture, result: ReturnType<typeof launch>): void {
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(fixture.log), false);
}

function writeLifecycleBinary(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `#!${process.execPath}
import { appendFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
appendFileSync(process.env.OMD_TEST_LOG, process.argv.slice(1).join('\\n') + '\\n');
const mode = process.env.OMD_LIFECYCLE_MODE;
if (mode === 'failure') process.exit(23);
if (mode === 'complete') process.exit(0);
if (mode === 'crash') {
  const descendant = spawn(process.execPath, ['-e', "require('node:net').createServer().listen(0, '127.0.0.1')"], { stdio: 'ignore' });
  writeFileSync(process.env.OMD_DESCENDANT_LOG, String(descendant.pid));
  process.exit(19);
}
process.stdin.resume();
if (mode === 'ignore-eof') createServer().listen({ host: '127.0.0.1', port: 0 });
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => {
  writeFileSync(process.env.OMD_SIGNAL_LOG, signal);
  process.exit(0);
});
process.stdout.write('READY\\n');
`);
  chmodSync(path, 0o755);
}

function asyncLaunch(fixture: Fixture, binary: string, extra: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
  const server = browserServer();
  const path = [dirname(process.execPath), extra.PATH ?? '/usr/bin:/bin'].join(delimiter);
  return spawn(server.command, server.args, {
    env: { ...process.env, HOME: fixture.home, TMPDIR: fixture.profileRoot, OMD_BROWSER_RS_BIN: binary, OMD_TEST_LOG: fixture.log, ...extra, PATH: path },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function exitEvent(child: ChildProcessWithoutNullStreams, timeoutMs = 5_000): Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('launcher exit timed out')), timeoutMs);
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
}

async function teardownLifecycleFixture(fixture: Fixture, child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = exitEvent(child);
    child.kill('SIGTERM');
    await exited;
  }
  removeFixture(fixture);
}

function readyEvent(child: ChildProcessWithoutNullStreams, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('launcher readiness timed out')), timeoutMs);
    child.stdout.once('data', (bytes: Buffer) => {
      clearTimeout(timer);
      if (!bytes.toString('utf8').includes('READY')) reject(new Error('unexpected launcher output'));
      else resolve();
    });
  });
}

function writtenFile(path: string, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const watcher = watch(dirname(path));
    const timer = setTimeout(() => { watcher.close(); reject(new Error(`file write timed out: ${basename(path)}`)); }, timeoutMs);
    watcher.on('change', (_event, changed) => {
      if (changed?.toString() !== basename(path) || !existsSync(path)) return;
      clearTimeout(timer);
      watcher.close();
      resolve();
    });
    watcher.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function assertProcessGone(pid: number): void {
  assert.throws(() => process.kill(pid, 0), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ESRCH');
}

function removalEvent(parent: string, name: string, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const watcher = watch(parent);
    const timer = setTimeout(() => { watcher.close(); reject(new Error('profile removal timed out')); }, timeoutMs);
    watcher.on('change', (_event, changed) => {
      if (changed?.toString() !== name || existsSync(join(parent, name))) return;
      clearTimeout(timer);
      watcher.close();
      resolve();
    });
    watcher.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

for (const receipt of [
  { name: 'missing receipt', content: undefined },
  { name: 'malformed receipt', content: '{' },
  { name: 'version-mismatched receipt', content: '{"schemaVersion":"browser-rs-receipt-v1","version":"v0.1.9","asset":"x","sha256":"x"}\n' },
  { name: 'receipt at a different path', content: undefined },
]) {
  test(`launcher rejects an owned binary with ${receipt.name}`, (context) => {
    const fixture = makeFixture();
    context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
    const target = ownedPath(fixture);
    writeFakeBinary(target, 0);
    if (receipt.content !== undefined) writeFileSync(join(dirname(target), 'receipt.json'), receipt.content);
    if (receipt.name === 'receipt at a different path') writeFileSync(join(dirname(dirname(target)), 'receipt.json'), '{}');
    assertNotLaunched(fixture, launch(fixture, { PATH: ['/usr/bin', '/bin'].join(delimiter) }));
  });
}

test('launcher rejects an owned binary when its receipt bytes are not canonical', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const target = ownedPath(fixture);
  writeFakeBinary(target, 0);
  writeExactReceipt(target);
  writeFileSync(join(dirname(target), 'receipt.json'), `${readFileSync(join(dirname(target), 'receipt.json'), 'utf8')}\n`);
  assertNotLaunched(fixture, launch(fixture, { PATH: ['/usr/bin', '/bin'].join(delimiter) }));
});

test('launcher rejects an owned binary when its bytes do not match the receipt digest', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const target = ownedPath(fixture);
  writeFakeBinary(target, 0);
  writeExactReceipt(target);
  assertNotLaunched(fixture, launch(fixture, { PATH: ['/usr/bin', '/bin'].join(delimiter) }));
});

test('launcher fails closed when mktemp cannot create the profile', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const override = join(fixture.root, 'override');
  writeFakeBinary(override, 0);
  assertNotLaunched(fixture, launch(fixture, { OMD_BROWSER_RS_BIN: override, TMPDIR: join(fixture.root, 'missing profile root') }));
});

test('repeated invalid temp-root init returns typed ENOENT after each driver and reaper exit', { timeout: 10_000 }, async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const override = join(fixture.root, 'override');
  writeFakeBinary(override, 0);
  for (let index = 0; index < 6; index += 1) {
    const child = asyncLaunch(fixture, override, { TMPDIR: join(fixture.root, `missing-${index}`) });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    const result = await exitEvent(child);
    assert.equal(result.code, 1);
    assert.match(stderr, /ENOENT/);
  }
  assert.equal(existsSync(fixture.log), false);
});

test('launcher fails closed when Node cannot validate the owned path', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  writeFakeBinary(ownedPath(fixture), 0);
  assertNotLaunched(fixture, launch(fixture, { PATH: fixture.pathBin }));
});

test('launcher preserves an explicit override containing spaces and removes its profile', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const override = join(fixture.root, 'override with spaces', 'browser-rs');
  writeFakeBinary(override, 0);
  const result = launch(fixture, { OMD_BROWSER_RS_BIN: override, PATH: ['/usr/bin', '/bin'].join(delimiter) });
  assert.equal(result.status, 0);
  const lines = readFileSync(fixture.log, 'utf8').split('\n');
  assert.equal(lines[0], override);
  const profile = lines.find((line) => line.startsWith('--user-data-dir='));
  assert.notEqual(profile, undefined);
  assert.equal(existsSync(profile?.slice('--user-data-dir='.length) ?? ''), false);
});

function processStart(pid: number): string {
  return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).replaceAll(/[^A-Za-z0-9]/g, '');
}

function profileReceipt(path: string, ownerPid: number, ownerStart: string, inode = lstatSync(path).ino): void {
  const nonce = basename(path).replace(/^omd-browser-rs\./, '');
  writeFileSync(join(path, '.omd-owner'), [
    'schema=omd-browser-profile-v1',
    `nonce=${nonce}`,
    `host=${hostname()}`,
    'created_at=1',
    `owner_pid=${ownerPid}`,
    `owner_start=${ownerStart}`,
    `profile_inode=${inode}`,
    'child_pid=0',
    'child_start=none',
    '',
  ].join('\n'));
}

test('startup preserves forged dead profile receipts with user bytes', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const override = join(fixture.root, 'override');
  const staleProfile = join(fixture.profileRoot, 'omd-browser-rs.STALE1');
  const unreceiptedProfile = join(fixture.profileRoot, 'omd-browser-rs.FOREIGN1');
  const futureProfile = join(fixture.profileRoot, 'omd-browser-rs.FUTURE1');
  const unrelatedProfile = join(fixture.profileRoot, 'unrelated-browser-profile');
  writeFakeBinary(override, 0);
  for (const path of [staleProfile, unreceiptedProfile, futureProfile, unrelatedProfile]) mkdirSync(path);
  profileReceipt(staleProfile, 2_147_483_647, 'dead');
  const futureStats = lstatSync(futureProfile);
  writeFileSync(join(futureProfile, '.omd-owner.json'), `${JSON.stringify({
    schema: 'omd-browser-profile-v999', kind: 'profile', name: basename(futureProfile),
    device: futureStats.dev, inode: futureStats.ino, createdAt: futureStats.birthtimeMs,
    capability: 'copied-self-consistent-forgery',
  })}\n`);
  writeFileSync(join(staleProfile, 'crash-residue'), 'forged receipt must not authorize these user bytes');
  writeFileSync(join(unreceiptedProfile, 'keep'), 'prefix alone does not establish ownership');
  writeFileSync(join(futureProfile, 'keep'), 'future forged receipt user bytes');
  writeFileSync(join(unrelatedProfile, 'keep'), 'not owned by OMD');

  const first = launch(fixture, { OMD_BROWSER_RS_BIN: override, PATH: ['/usr/bin', '/bin'].join(delimiter) });
  const second = launch(fixture, { OMD_BROWSER_RS_BIN: override, PATH: ['/usr/bin', '/bin'].join(delimiter) });

  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  assert.equal(readFileSync(join(staleProfile, 'crash-residue'), 'utf8'), 'forged receipt must not authorize these user bytes');
  assert.equal(existsSync(join(unreceiptedProfile, 'keep')), true);
  assert.equal(readFileSync(join(futureProfile, 'keep'), 'utf8'), 'future forged receipt user bytes');
  assert.equal(existsSync(join(unrelatedProfile, 'keep')), true);
});

test('launcher preserves active, unknown-identity, inode-swapped, and symlinked profile candidates', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const override = join(fixture.root, 'override');
  const active = join(fixture.profileRoot, 'omd-browser-rs.ACTIVE1');
  const unknown = join(fixture.profileRoot, 'omd-browser-rs.UNKNOWN1');
  const swapped = join(fixture.profileRoot, 'omd-browser-rs.SWAPPED1');
  const symlink = join(fixture.profileRoot, 'omd-browser-rs.LINKED1');
  const symlinkTarget = join(fixture.root, 'user-profile');
  writeFakeBinary(override, 0);
  mkdirSync(active);
  profileReceipt(active, process.pid, processStart(process.pid));
  mkdirSync(unknown);
  profileReceipt(unknown, process.pid, 'unknown');
  writeFileSync(join(unknown, 'keep'), 'unknown identity is active or ambiguous');
  mkdirSync(swapped);
  profileReceipt(swapped, 2_147_483_647, 'dead', lstatSync(swapped).ino + 1);
  mkdirSync(symlinkTarget);
  writeFileSync(join(symlinkTarget, 'keep'), 'user profile bytes');
  symlinkSync(symlinkTarget, symlink);
  const fakeBin = join(fixture.root, 'fake-bin');
  mkdirSync(fakeBin);
  writeFileSync(join(fakeBin, 'ps'), '#!/bin/sh\nexit 1\n');
  chmodSync(join(fakeBin, 'ps'), 0o755);

  const result = launch(fixture, { OMD_BROWSER_RS_BIN: override, PATH: [fakeBin, '/usr/bin', '/bin'].join(delimiter) });

  assert.equal(result.status, 0);
  assert.equal(existsSync(join(active, '.omd-owner')), true);
  assert.equal(readFileSync(join(unknown, 'keep'), 'utf8'), 'unknown identity is active or ambiguous');
  assert.equal(existsSync(join(swapped, '.omd-owner')), true);
  assert.equal(existsSync(join(symlinkTarget, 'keep')), true);
  assert.equal(lstatSync(symlink).isSymbolicLink(), true);
});

test('launcher removes its profile after a typed child failure and kills crash descendants', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const binary = join(fixture.root, 'lifecycle-browser.mjs');
  const descendantLog = join(fixture.root, 'descendant.pid');
  writeLifecycleBinary(binary);

  const failure = launch(fixture, { OMD_BROWSER_RS_BIN: binary, OMD_LIFECYCLE_MODE: 'failure', PATH: ['/usr/bin', '/bin'].join(delimiter) });
  assert.equal(failure.status, 23);
  const failedProfile = readFileSync(fixture.log, 'utf8').split('\n').find((line) => line.startsWith('--user-data-dir='));
  assert.equal(existsSync(failedProfile?.slice('--user-data-dir='.length) ?? ''), false);

  const crashed = asyncLaunch(fixture, binary, { OMD_LIFECYCLE_MODE: 'crash', OMD_DESCENDANT_LOG: descendantLog });
  const crashedExit = exitEvent(crashed);
  const result = await crashedExit;
  assert.equal(result.code, 19);
  const descendantPid = Number(readFileSync(descendantLog, 'utf8'));
  assertProcessGone(descendantPid);
  const profiles = readFileSync(fixture.log, 'utf8').split('\n').filter((line) => line.startsWith('--user-data-dir='));
  for (const profile of profiles) assert.equal(existsSync(profile.slice('--user-data-dir='.length)), false);
});

test('launcher awaits termination and cancellation signals and removes each owned process group and profile', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const binary = join(fixture.root, 'lifecycle-browser.mjs');
  writeLifecycleBinary(binary);
  for (const item of [{ signal: 'SIGTERM', code: 143 }, { signal: 'SIGINT', code: 130 }] as const) {
    const signalLog = join(fixture.root, `${item.signal}.log`);
    const child = asyncLaunch(fixture, binary, { OMD_LIFECYCLE_MODE: 'wait', OMD_SIGNAL_LOG: signalLog });
    await readyEvent(child);
    const profile = readFileSync(fixture.log, 'utf8').split('\n').filter((line) => line.startsWith('--user-data-dir=')).at(-1);
    const exit = exitEvent(child);

    child.kill(item.signal);
    const result = await exit;

    assert.equal(result.code, item.code);
    assert.equal(existsSync(signalLog), true);
    assert.equal(readFileSync(signalLog, 'utf8'), item.signal);
    assert.equal(existsSync(profile?.slice('--user-data-dir='.length) ?? ''), false);
  }
});

test('launcher fallback lease cleans an EOF-ignoring browser when the reaper is killed', async () => {
  const fixture = makeFixture();
  const binary = join(fixture.root, 'lifecycle-browser.mjs');
  const signalLog = join(fixture.root, 'signal.log');
  writeLifecycleBinary(binary);
  const launcher = asyncLaunch(fixture, binary, { OMD_LIFECYCLE_MODE: 'ignore-eof', OMD_SIGNAL_LOG: signalLog });
  try {
    await readyEvent(launcher);
    const profileArgument = readFileSync(fixture.log, 'utf8').split('\n').find((line) => line.startsWith('--user-data-dir='));
    if (profileArgument === undefined) throw new Error('launcher did not record its profile');
    const profilePath = profileArgument.slice('--user-data-dir='.length);
    const marker = readFileSync(join(profilePath, '.omd-owner.json'), 'utf8');
    const browserPid = Number(/"childPid":(\d+)/.exec(marker)?.[1]);
    const reaperPid = Number(/"reaperPid":(\d+)/.exec(marker)?.[1]);
    const exited = exitEvent(launcher);
    const removed = removalEvent(fixture.profileRoot, basename(profilePath));

    process.kill(reaperPid, 'SIGKILL');
    const result = await exited;
    assert.equal(result.code, 1);
    assert.equal(existsSync(profilePath), false);
    assertProcessGone(browserPid);
    await removed;
  } finally {
    await teardownLifecycleFixture(fixture, launcher);
  }
});

test('normal reaper release exits cleanly without fallback double-kill', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const binary = join(fixture.root, 'lifecycle-browser.mjs');
  const signalLog = join(fixture.root, 'normal-signal.log');
  writeLifecycleBinary(binary);

  const result = launch(fixture, { OMD_BROWSER_RS_BIN: binary, OMD_LIFECYCLE_MODE: 'complete', OMD_SIGNAL_LOG: signalLog });

  assert.equal(result.status, 0);
  assert.equal(existsSync(signalLog), false);
  const profile = readFileSync(fixture.log, 'utf8').split('\n').find((line) => line.startsWith('--user-data-dir='));
  assert.equal(existsSync(profile?.slice('--user-data-dir='.length) ?? ''), false);
});

test('reaper init crash cleans its lease and the driver awaits exact failure exit', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const binary = join(fixture.root, 'lifecycle-browser.mjs');
  writeLifecycleBinary(binary);
  const child = asyncLaunch(fixture, binary, { OMD_TEST_REAPER_INIT_CRASH: '1' });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });

  const result = await exitEvent(child);

  assert.equal(result.code, 1);
  assert.match(stderr, /reaper init crash/);
  assert.equal(existsSync(fixture.log), false);
  assert.deepEqual(readdirSync(fixture.profileRoot), []);
});

test('signal and reaper-disconnect race still releases one browser group and lease', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const binary = join(fixture.root, 'lifecycle-browser.mjs');
  const signalLog = join(fixture.root, 'race-signal.log');
  writeLifecycleBinary(binary);
  const launcher = asyncLaunch(fixture, binary, { OMD_LIFECYCLE_MODE: 'ignore-eof', OMD_SIGNAL_LOG: signalLog });
  await readyEvent(launcher);
  const profileArgument = readFileSync(fixture.log, 'utf8').split('\n').find((line) => line.startsWith('--user-data-dir='));
  if (profileArgument === undefined) throw new Error('launcher did not record its profile');
  const profilePath = profileArgument.slice('--user-data-dir='.length);
  const marker = readFileSync(join(profilePath, '.omd-owner.json'), 'utf8');
  const browserPid = Number(/"childPid":(\d+)/.exec(marker)?.[1]);
  const reaperPid = Number(/"reaperPid":(\d+)/.exec(marker)?.[1]);
  const exited = exitEvent(launcher);
  const removed = removalEvent(fixture.profileRoot, basename(profilePath));

  launcher.kill('SIGTERM');
  process.kill(reaperPid, 'SIGKILL');
  await exited;
  await removed;

  assert.equal(existsSync(profilePath), false);
  assertProcessGone(browserPid);
});

test('capability reaper cleans profile and process group after an untrappable launcher exit', async (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const binary = join(fixture.root, 'lifecycle-browser.mjs');
  const signalLog = join(fixture.root, 'signal.log');
  writeLifecycleBinary(binary);
  const abandoned = asyncLaunch(fixture, binary, { OMD_LIFECYCLE_MODE: 'wait', OMD_SIGNAL_LOG: signalLog });
  await readyEvent(abandoned);
  const abandonedProfile = readFileSync(fixture.log, 'utf8').split('\n').find((line) => line.startsWith('--user-data-dir='));
  if (abandonedProfile === undefined) throw new Error('launcher did not record its profile');
  const marker = readFileSync(join(abandonedProfile.slice('--user-data-dir='.length), '.omd-owner.json'), 'utf8');
  const browserPid = Number(/"childPid":(\d+)/.exec(marker)?.[1]);
  const profilePath = abandonedProfile.slice('--user-data-dir='.length);
  const parentExit = exitEvent(abandoned);
  const removed = removalEvent(fixture.profileRoot, basename(profilePath));

  abandoned.kill('SIGKILL');
  await parentExit;
  await removed;

  assert.equal(existsSync(profilePath), false);
  assertProcessGone(browserPid);
});

test('launcher preserves PATH precedence when the owned path is unreceipted', (context) => {
  const fixture = makeFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const target = ownedPath(fixture);
  const onPath = join(fixture.pathBin, 'browser-rs');
  writeFakeBinary(target, 0);
  writeFakeBinary(onPath, 0);
  const result = launch(fixture, { PATH: [fixture.pathBin, '/usr/bin', '/bin'].join(delimiter) });
  assert.equal(result.status, 0);
  assert.equal(readFileSync(fixture.log, 'utf8').split('\n')[0], onPath);
});
