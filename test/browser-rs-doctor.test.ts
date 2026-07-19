import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  BROWSER_RS_VERSION,
  browserRsTarget,
  doctorBrowserRs,
  type BrowserRsDependencies,
  type BrowserRsHealth,
  type BrowserRsRelease,
} from '../core/install/browser-rs.ts';
import { writeBrowserRsReceipt } from '../core/install/browser-rs-receipt.ts';
import { browserRsTestDependencies } from './browser-rs-test-support.ts';

const TEST_BYTES = Buffer.from('#!/bin/sh\necho browser-rs\n');
const TEST_RELEASE: BrowserRsRelease = {
  platform: 'darwin',
  arch: 'arm64',
  asset: 'browser-rs-test',
  url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-test',
  sha256: createHash('sha256').update(TEST_BYTES).digest('hex'),
};
const TEST_RELEASES: readonly BrowserRsRelease[] = [TEST_RELEASE];
const OFFICIAL_BROWSER_RS_HELP = [
  'browser-rs — stealth MCP browser (stdio or HTTP)',
  '',
  'Usage: browser-rs [OPTIONS]',
  '',
  'Options:',
  '      --headless',
  '      --user-data-dir <USER_DATA_DIR>',
].join('\n');

function fixture(): { readonly root: string; readonly home: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-doctor-'));
  return { root, home: join(root, 'home') };
}

function dependencies(home: string, env: BrowserRsDependencies['env'] = { PATH: '' }): BrowserRsDependencies {
  return browserRsTestDependencies({ home, platform: 'darwin', arch: 'arm64', releases: TEST_RELEASES, env });
}

function compatible(result: BrowserRsHealth): Extract<BrowserRsHealth, { readonly kind: 'healthy' }> {
  if (result.kind !== 'healthy') throw new Error(`expected healthy browser-rs provider, received ${result.kind}`);
  return result;
}

function unhealthy(result: BrowserRsHealth): Extract<BrowserRsHealth, { readonly kind: 'unhealthy' }> {
  if (result.kind !== 'unhealthy') throw new Error(`expected unhealthy browser-rs provider, received ${result.kind}`);
  return result;
}

test('browser-rs doctor uses supported help when the official version invocation enters stdio and fails', async () => {
  const item = fixture();
  const probes: string[][] = [];
  try {
    // Given: browser-rs's observed CLI behavior: --version fails after an MCP initialize request, while --help is stable.
    const run = async (_path: string, args: readonly string[]) => {
      probes.push([...args]);
      return args[0] === '--version'
        ? { code: 1, stdout: '', stderr: 'Error: connection closed: initialize request' }
        : { code: 0, stdout: OFFICIAL_BROWSER_RS_HELP, stderr: '' };
    };

    // When: the doctor checks a caller-selected foreign provider.
    const result = await doctorBrowserRs({
      ...dependencies(item.home, { PATH: '', OMD_BROWSER_RS_BIN: '/foreign/browser-rs' }),
      run,
    });

    // Then: compatibility is established through the supported help contract without inventing a foreign version.
    assert.deepEqual(compatible(result), {
      kind: 'healthy',
      source: 'env',
      path: '/foreign/browser-rs',
      version: 'compatible (version unknown)',
    });
    assert.deepEqual(probes, [['--help']]);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs doctor rejects exit-zero help without its exact compatibility signature', async () => {
  const item = fixture();
  try {
    // Given: a foreign command that exits successfully but does not identify browser-rs's stdio MCP CLI.
    const run = async (_path: string, args: readonly string[]) => {
      assert.deepEqual(args, ['--help']);
      return { code: 0, stdout: 'browser-rs imitation\n--headless\n--user-data-dir', stderr: '' };
    };

    // When: the doctor probes it through the caller-selected environment override.
    const result = await doctorBrowserRs({
      ...dependencies(item.home, { PATH: '', OMD_BROWSER_RS_BIN: '/foreign/browser-rs' }),
      run,
    });

    // Then: an arbitrary success response is not accepted as a compatible provider.
    assert.equal(unhealthy(result).reason, 'process');
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs doctor preserves a nonzero help probe as a process failure', async () => {
  const item = fixture();
  try {
    // Given: a resolved provider whose help command exits unsuccessfully.
    const run = async (_path: string, args: readonly string[]) => {
      assert.deepEqual(args, ['--help']);
      return { code: 1, stdout: '', stderr: 'connection closed' };
    };

    // When: the doctor runs its bounded compatibility probe.
    const result = await doctorBrowserRs({
      ...dependencies(item.home, { PATH: '', OMD_BROWSER_RS_BIN: '/foreign/browser-rs' }),
      run,
    });

    // Then: the upstream process detail remains visible to the caller.
    assert.deepEqual(unhealthy(result), { kind: 'unhealthy', reason: 'process', detail: 'connection closed' });
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs doctor preserves a runner timeout as a process failure', async () => {
  const item = fixture();
  try {
    // Given: an injected runner that reports its bounded probe timeout.
    const run = async (_path: string, args: readonly string[]) => {
      assert.deepEqual(args, ['--help']);
      throw new Error('probe timed out');
    };

    // When: the doctor calls the runner supplied by its caller.
    const result = await doctorBrowserRs({
      ...dependencies(item.home, { PATH: '', OMD_BROWSER_RS_BIN: '/foreign/browser-rs' }),
      run,
    });

    // Then: it classifies the timeout without starting a browser or taking a fallback path.
    assert.deepEqual(unhealthy(result), { kind: 'unhealthy', reason: 'process', detail: 'probe timed out' });
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs doctor leaves an unreceipted target unhealthy without running it', async () => {
  const item = fixture();
  let calls = 0;
  try {
    // Given: foreign bytes at OMD's target without a matching ownership receipt.
    const target = browserRsTarget(item.home);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, TEST_BYTES);

    // When: the doctor resolves the supported platform without an override or PATH entry.
    const result = await doctorBrowserRs({
      ...dependencies(item.home),
      run: async () => {
        calls += 1;
        return { code: 0, stdout: OFFICIAL_BROWSER_RS_HELP, stderr: '' };
      },
    });

    // Then: it distinguishes unowned installation state before invoking any executable.
    assert.deepEqual(result, { kind: 'unhealthy', reason: 'unowned-target' });
    assert.equal(calls, 0);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs doctor keeps unsupported platforms distinct without invoking a provider', async () => {
  const item = fixture();
  let calls = 0;
  try {
    // Given: a platform for which no pinned browser-rs release exists.

    // When: its doctor runs with an injected process runner.
    const result = await doctorBrowserRs({
      ...dependencies(item.home),
      platform: 'win32',
      arch: 'x64',
      run: async () => {
        calls += 1;
        return { code: 0, stdout: OFFICIAL_BROWSER_RS_HELP, stderr: '' };
      },
    });

    // Then: platform support is reported before any executable is selected or started.
    assert.deepEqual(result, { kind: 'unsupported', platform: 'win32', arch: 'x64' });
    assert.equal(calls, 0);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs doctor reports the pinned version only for a receipt-verified owned target', async () => {
  const item = fixture();
  try {
    // Given: bytes and receipt that prove OMD owns the pinned browser-rs target.
    const target = browserRsTarget(item.home);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, TEST_BYTES);
    writeBrowserRsReceipt(target, TEST_RELEASE);

    // When: the doctor validates the supported help contract.
    const result = await doctorBrowserRs({
      ...dependencies(item.home),
      run: async (_path: string, args: readonly string[]) => {
        assert.deepEqual(args, ['--help']);
        return { code: 0, stdout: OFFICIAL_BROWSER_RS_HELP, stderr: '' };
      },
    });

    // Then: the displayed version comes from the ownership proof rather than untrusted CLI output.
    assert.deepEqual(compatible(result), {
      kind: 'healthy',
      source: 'owned',
      path: target,
      version: BROWSER_RS_VERSION,
    });
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
