import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BrowserRsDownloadError } from '../core/install/browser-rs-download.ts';
import { browserRsTarget, type BrowserRsRelease } from '../core/install/browser-rs.ts';
import { writeBrowserRsReceipt } from '../core/install/browser-rs-receipt.ts';
import { doctor, install, uninstall, type DoctorOptions } from '../core/install/install.ts';
import { browserRsTestDependencies, browserRsTestInstallDependencies, unavailableBrowserRsDownload } from './browser-rs-test-support.ts';

const BYTES = Buffer.from('#!/bin/sh\necho browser-rs\n');
const RELEASE: BrowserRsRelease = {
  platform: 'darwin', arch: 'arm64', asset: 'test-browser-rs',
  url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/test-browser-rs',
  sha256: createHash('sha256').update(BYTES).digest('hex'),
};
const RELEASES: readonly BrowserRsRelease[] = [RELEASE];

function host(root: string): { readonly host: 'claude'; readonly home: string } {
  return { host: 'claude', home: join(root, '.claude') };
}

function doctorOptions(browser: NonNullable<DoctorOptions['browser']>): DoctorOptions {
  return { browser };
}

function providerCheck(result: Awaited<ReturnType<typeof doctor>>): { readonly ok: boolean; readonly name: string } {
  const check = result[0]?.checks.find((item) => item.name.startsWith('browser'));
  if (check === undefined) throw new Error('browser doctor check was not emitted');
  return { ok: check.ok, name: check.name };
}

test('Given provider states When host doctor runs Then supported failures and unsupported fallback have distinct health', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-provider-doctor-'));
  const detected = host(root);
  try {
    const healthy = providerCheck(await doctor([detected], doctorOptions({ browser: {
      ...browserRsTestDependencies({ home: root, platform: 'darwin', arch: 'arm64', releases: RELEASES, env: { PATH: '', OMD_BROWSER_RS_BIN: '/provider' } }),
      run: async () => ({
        code: 0,
        stdout: 'browser-rs — stealth MCP browser (stdio or HTTP)\n--headless\n--user-data-dir <USER_DATA_DIR>\n',
        stderr: '',
      }),
    } })));
    const missingResult = await doctor([detected], doctorOptions({ browser: {
      ...browserRsTestDependencies({ home: root, platform: 'darwin', arch: 'arm64', releases: RELEASES }),
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
    } }));
    const missing = providerCheck(missingResult);
    const bad = providerCheck(await doctor([detected], doctorOptions({ browser: {
      ...browserRsTestDependencies({ home: root, platform: 'darwin', arch: 'arm64', releases: RELEASES, env: { PATH: '', OMD_BROWSER_RS_BIN: '/provider' } }),
      run: async () => ({ code: 9, stdout: '', stderr: 'broken provider' }),
   } })));
    const fallback = providerCheck(await doctor([detected], doctorOptions({
      browser: browserRsTestDependencies({ home: root, platform: 'win32', arch: 'x64', releases: RELEASES }),
      fallback: async () => ({ kind: 'ready', path: '/playwright/chromium' }),
    })));
    const noFallback = providerCheck(await doctor([detected], doctorOptions({
      browser: browserRsTestDependencies({ home: root, platform: 'win32', arch: 'x64', releases: RELEASES }),
      fallback: async () => ({ kind: 'unhealthy', reason: 'chromium-missing' }),
    })));

    assert.deepEqual([healthy, missing, bad, fallback, noFallback], [
      { ok: true, name: 'browser-rs provider' }, { ok: false, name: 'browser-rs provider' },
      { ok: false, name: 'browser-rs provider' }, { ok: true, name: 'browser provider fallback' },
      { ok: false, name: 'browser provider fallback' },
    ]);
    assert.equal(
      missingResult[0]?.checks.find((item) => item.name === 'browser-rs provider')?.detail,
      'browser-rs is not resolved; run: oh-my-design browser install',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given install and uninstall provider outcomes When host changes finish Then failures do not roll back and foreign bytes survive', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-provider-lifecycle-'));
  const detected = host(root);
  const browserHome = join(root, 'browser-home');
  try {
    const failed = await install([detected], { browser: browserRsTestInstallDependencies({
      home: browserHome, platform: 'darwin', arch: 'arm64', releases: RELEASES,
      downloader: async () => { throw new BrowserRsDownloadError('transport', 'offline'); },
    }) });
    assert.ok(failed.includes('browser-rs: failed (transport)'));
    assert.equal(existsSync(join(detected.home, 'settings.json')), true);

    const unsupported = await install([host(join(root, 'unsupported'))], { browser: browserRsTestInstallDependencies({
      home: join(root, 'unsupported-browser'), platform: 'win32', arch: 'x64', releases: RELEASES, downloader: unavailableBrowserRsDownload,
    }) });
    assert.ok(unsupported.includes('browser-rs: unsupported (win32/x64)'));

    const installed = await install([host(join(root, 'installed'))], { browser: browserRsTestInstallDependencies({
      home: join(root, 'installed-browser'), platform: 'darwin', arch: 'arm64', releases: RELEASES,
      downloader: async (request) => { writeFileSync(request.destination, BYTES); return { destinationOwned: true }; },
    }) });
    assert.ok(installed.some((line) => line.startsWith('browser-rs: installed')));

    const target = browserRsTarget(browserHome);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, Buffer.from('foreign browser-rs'));
    const preserved = uninstall([], { browser: browserRsTestDependencies({ home: browserHome, platform: 'darwin', arch: 'arm64', releases: RELEASES }) });
    assert.ok(preserved.some((line) => line.startsWith('browser-rs: preserved (unreceipted')));
    assert.equal(existsSync(target), true);

    writeFileSync(target, BYTES);
    writeBrowserRsReceipt(target, RELEASE);
    const removed = uninstall([], { browser: browserRsTestDependencies({ home: browserHome, platform: 'darwin', arch: 'arm64', releases: RELEASES }) });
    assert.ok(removed.some((line) => line.startsWith('browser-rs: removed')));
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given an owned browser-rs target in the ambient home When host install receives fake dependencies Then it never resolves the ambient home', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-provider-ambient-home-'));
  const ambientHome = join(root, 'ambient-home');
  const fakeHome = join(root, 'fake-home');
  const target = browserRsTarget(ambientHome);
  const originalHome = process.env['HOME'];
  try {
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, BYTES);
    writeBrowserRsReceipt(target, RELEASE);
    process.env['HOME'] = ambientHome;

    const result = await install([host(join(root, 'host'))], { browser: browserRsTestInstallDependencies({
      home: fakeHome,
      platform: 'darwin',
      arch: 'arm64',
      releases: RELEASES,
      downloader: async () => { throw new BrowserRsDownloadError('transport', 'isolated'); },
    }) });

    assert.ok(result.includes('browser-rs: failed (transport)'));
    assert.equal(existsSync(browserRsTarget(fakeHome)), false);
  } finally {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    rmSync(root, { recursive: true, force: true });
  }
});
