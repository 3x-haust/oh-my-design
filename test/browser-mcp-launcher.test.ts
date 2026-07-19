import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BROWSER_RS_RELEASES } from '../core/install/browser-rs.ts';
import { browserRsMcpConfig, type BrowserRsMcpServer } from '../adapters/browser-mcp.ts';

type Fixture = {
  readonly root: string;
  readonly home: string;
  readonly profileRoot: string;
  readonly log: string;
  readonly pathBin: string;
};

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-mcp-'));
  const profileRoot = join(root, 'profiles');
  mkdirSync(profileRoot);
  return {
    root,
    home: join(root, 'home with spaces'),
    profileRoot,
    log: join(root, 'launch.log'),
    pathBin: join(root, 'path bin'),
  };
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
  return spawnSync('/bin/sh', browserServer().args, {
    encoding: 'utf8',
    env: { ...process.env, HOME: fixture.home, OMD_TEST_LOG: fixture.log, TMPDIR: fixture.profileRoot, ...env },
  });
}

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
