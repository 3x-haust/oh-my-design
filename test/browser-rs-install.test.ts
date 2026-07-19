import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  BROWSER_RS_RELEASES,
  BROWSER_RS_VERSION,
  browserRsTarget,
  doctorBrowserRs,
  installBrowserRs,
  resolveBrowserRs,
  uninstallBrowserRs,
  type BrowserRsDownloader,
  type BrowserRsInstallDependencies,
  type BrowserRsRelease,
} from '../core/install/browser-rs.ts';
import { BrowserRsDownloadError } from '../core/install/browser-rs-download.ts';
import { nodeBrowserRsFileSystem, type BrowserRsFileSystem } from '../core/install/browser-rs-filesystem.ts';
import { browserRsReceiptBytes, receiptPathFor, writeBrowserRsReceipt } from '../core/install/browser-rs-receipt.ts';

const TEST_BYTES = Buffer.from('#!/bin/sh\necho browser-rs\n');
const TEST_SHA256 = createHash('sha256').update(TEST_BYTES).digest('hex');
const TEST_RELEASE: BrowserRsRelease = {
  platform: 'darwin',
  arch: 'arm64',
  asset: 'browser-rs-test',
  url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-test',
  sha256: TEST_SHA256,
};
const TEST_RELEASES: readonly BrowserRsRelease[] = [TEST_RELEASE];

type Fixture = {
  readonly root: string;
  readonly home: string;
  readonly target: string;
};

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  return { root, home, target: browserRsTarget(home) };
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function installDependencies(
  item: Fixture,
  downloader: BrowserRsDownloader,
  extras: Partial<BrowserRsInstallDependencies> = {},
): BrowserRsInstallDependencies {
  return {
    home: item.home,
    platform: 'darwin',
    arch: 'arm64',
    downloader,
    releases: TEST_RELEASES,
    env: { PATH: '' },
    which: () => undefined,
    ...extras,
  };
}

function writes(bytes: Buffer): BrowserRsDownloader {
  return async (request) => {
    writeFileSync(request.destination, bytes);
    return { destinationOwned: true };
  };
}

function temporaryFiles(item: Fixture): readonly string[] {
  const dir = dirname(item.target);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.includes('.tmp-')) : [];
}

test('browser-rs pins only the approved v0.1.10 platform assets', () => {
  // Given: the production platform table.
  const darwin = BROWSER_RS_RELEASES.find((release) => release.platform === 'darwin');
  const linux = BROWSER_RS_RELEASES.find((release) => release.platform === 'linux');

  // When: its records are inspected.

  // Then: the exact upstream assets and digests are the only supported entries.
  assert.equal(BROWSER_RS_VERSION, 'v0.1.10');
  assert.deepEqual(darwin, {
    platform: 'darwin',
    arch: 'arm64',
    asset: 'browser-rs-macos-arm64',
    url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-macos-arm64',
    sha256: '9a5895fc2f07b1010226d30f081d678fa2edcc15dd6f24cdf10074cfe1573749',
  });
  assert.deepEqual(linux, {
    platform: 'linux',
    arch: 'x64',
    asset: 'browser-rs-linux-x64',
    url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-linux-x64',
    sha256: '792ca76e5ce0423968763556e110900a3aa65737fc6227724914aa137e972589',
  });
  assert.equal(BROWSER_RS_RELEASES.length, 2);
});

test('browser-rs installs verified bytes and resolves env before PATH before owned', async () => {
  const item = fixture();
  try {
    // Given: an isolated owned target and checksum-valid fake release bytes.
    const installed = await installBrowserRs(installDependencies(item, writes(TEST_BYTES)));

    // When: three competing locations are resolved.
    const envPath = join(item.root, 'env-browser-rs');
    const pathPath = join(item.root, 'path-browser-rs');
    writeFileSync(envPath, 'foreign env');
    writeFileSync(pathPath, 'foreign path');
    const env = resolveBrowserRs({ home: item.home, env: { OMD_BROWSER_RS_BIN: envPath }, which: () => pathPath, releases: TEST_RELEASES });
    const path = resolveBrowserRs({ home: item.home, env: {}, which: () => pathPath, releases: TEST_RELEASES });
    const owned = resolveBrowserRs({ home: item.home, env: {}, which: () => undefined, releases: TEST_RELEASES });

    // Then: install writes a receipt and each precedence position wins in turn.
    assert.equal(installed.kind, 'installed');
    assert.equal(readFileSync(item.target).equals(TEST_BYTES), true);
    assert.equal(existsSync(receiptPathFor(item.target)), true);
    assert.deepEqual(env, { kind: 'env', path: envPath });
    assert.deepEqual(path, { kind: 'path', path: pathPath });
    assert.deepEqual(owned, { kind: 'owned', path: item.target });
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs reports present without replacing an owned binary', async () => {
  const item = fixture();
  try {
    // Given: a completed OMD-owned installation.
    await installBrowserRs(installDependencies(item, writes(TEST_BYTES)));
    let downloads = 0;

    // When: installation is requested again.
    const present = await installBrowserRs(installDependencies(item, async () => {
      downloads += 1;
    }));

    // Then: the existing verified target wins and no download occurs.
    assert.deepEqual(present, { kind: 'present', source: 'owned', path: item.target });
    assert.equal(downloads, 0);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs reclaims only an orphaned receipt that proves the selected supported release', async () => {
  const item = fixture();
  try {
    // Given: a target-absent, canonical OMD receipt whose bytes and release binding exactly match the selected release.
    writeBrowserRsReceipt(item.target, TEST_RELEASE);
    let downloads = 0;

    // When: installation resumes after the interrupted state.
    const result = await installBrowserRs(installDependencies(item, async (request) => {
      downloads += 1;
      writeFileSync(request.destination, TEST_BYTES);
      return { destinationOwned: true };
    }));

    // Then: it safely clears the stale receipt, installs the verified bytes, and recreates an owned receipt.
    assert.deepEqual(result, { kind: 'installed', path: item.target, sha256: TEST_SHA256 });
    assert.equal(downloads, 1);
    assert.equal(readFileSync(item.target).equals(TEST_BYTES), true);
    assert.equal(readFileSync(receiptPathFor(item.target)).equals(browserRsReceiptBytes(TEST_RELEASE)), true);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs preserves an orphaned malformed receipt and does not download', async () => {
  const item = fixture();
  const receipt = receiptPathFor(item.target);
  const foreign = Buffer.from('foreign receipt');
  try {
    // Given: an orphaned receipt file whose bytes cannot prove OMD ownership.
    mkdirSync(dirname(receipt), { recursive: true });
    writeFileSync(receipt, foreign);
    let downloads = 0;

    // When: installation encounters the conflicting durable state.
    const result = await installBrowserRs(installDependencies(item, async () => {
      downloads += 1;
      return { destinationOwned: true };
    }));

    // Then: it reports a conflict without deleting or replacing the foreign receipt.
    assert.deepEqual(result, { kind: 'failed', reason: 'receipt-conflict' });
    assert.equal(downloads, 0);
    assert.equal(readFileSync(receipt).equals(foreign), true);
    assert.equal(existsSync(item.target), false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs preserves an orphaned receipt swapped from a different release and does not download', async () => {
  const item = fixture();
  const swapped: BrowserRsRelease = {
    ...TEST_RELEASE,
    asset: 'browser-rs-other',
    sha256: digest(Buffer.from('other browser-rs release')),
  };
  const receipt = receiptPathFor(item.target);
  try {
    // Given: a canonical OMD-format receipt that binds a different release than this platform may install.
    writeBrowserRsReceipt(item.target, swapped);
    const before = readFileSync(receipt);
    let downloads = 0;

    // When: installation sees the swapped receipt with no target beside it.
    const result = await installBrowserRs(installDependencies(item, async () => {
      downloads += 1;
      return { destinationOwned: true };
    }));

    // Then: it treats the receipt as foreign to this selected release and preserves it exactly.
    assert.deepEqual(result, { kind: 'failed', reason: 'receipt-conflict' });
    assert.equal(downloads, 0);
    assert.equal(readFileSync(receipt).equals(before), true);
    assert.equal(existsSync(item.target), false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs preserves an orphaned receipt changed during exact reclaim and does not download', async () => {
  const item = fixture();
  const receipt = receiptPathFor(item.target);
  const foreign = Buffer.from('raced receipt');
  let removals = 0;
  const racingFileSystem: BrowserRsFileSystem = {
    ...nodeBrowserRsFileSystem,
    removeIfDigest: (path, expectedDigest) => {
      removals += 1;
      writeFileSync(path, foreign);
      return nodeBrowserRsFileSystem.removeIfDigest(path, expectedDigest);
    },
  };
  try {
    // Given: an exact OMD receipt that another writer replaces before digest-safe removal.
    writeBrowserRsReceipt(item.target, TEST_RELEASE);
    let downloads = 0;

    // When: installation attempts to reclaim the orphaned receipt.
    const result = await installBrowserRs(installDependencies(item, async () => {
      downloads += 1;
      return { destinationOwned: true };
    }, { fs: racingFileSystem }));

    // Then: the race is a conflict and the replacement receipt remains untouched.
    assert.deepEqual(result, { kind: 'failed', reason: 'receipt-conflict' });
    assert.equal(downloads, 0);
    assert.equal(removals, 1);
    assert.equal(readFileSync(receipt).equals(foreign), true);
    assert.equal(existsSync(item.target), false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs leaves unsupported platforms untouched without downloading', async () => {
  const item = fixture();
  try {
    // Given: an unsupported Windows platform.
    let downloads = 0;

    // When: install is requested.
    const result = await installBrowserRs(installDependencies(item, async () => {
      downloads += 1;
    }, { platform: 'win32', arch: 'x64' }));

    // Then: it explicitly reports unsupported and has no target side effect.
    assert.deepEqual(result, { kind: 'unsupported', platform: 'win32', arch: 'x64' });
    assert.equal(downloads, 0);
    assert.equal(existsSync(item.target), false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs cleans an interrupted fake download and reports the failure', async () => {
  const item = fixture();
  try {
    // Given: a downloader that leaves a partial sibling temporary file before failing.
    const interrupted: BrowserRsDownloader = async (request) => {
      writeFileSync(request.destination, TEST_BYTES);
      throw new BrowserRsDownloadError('timeout', 'download timed out', true);
    };

    // When: install encounters that interruption.
    const result = await installBrowserRs(installDependencies(item, interrupted));

    // Then: no executable, receipt, or temporary artifact remains.
    assert.equal(result.kind, 'failed');
    assert.equal(existsSync(item.target), false);
    assert.equal(existsSync(receiptPathFor(item.target)), false);
    assert.deepEqual(temporaryFiles(item), []);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs rejects a checksum mismatch before publish', async () => {
  const item = fixture();
  try {
    // Given: corrupted bytes from a fake downloader.
    const corrupted = Buffer.from('not the pinned binary');

    // When: install verifies the temporary download.
    const result = await installBrowserRs(installDependencies(item, writes(corrupted)));

    // Then: it reports checksum failure and leaves no owned artifacts.
    assert.deepEqual(result, { kind: 'failed', reason: 'checksum' });
    assert.equal(existsSync(item.target), false);
    assert.equal(existsSync(receiptPathFor(item.target)), false);
    assert.deepEqual(temporaryFiles(item), []);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs preserves an unreceipted target and never calls the downloader', async () => {
  const item = fixture();
  try {
    // Given: a foreign binary at OMD's would-be target with no receipt.
    const foreign = Buffer.from('foreign browser');
    mkdirSync(dirname(item.target), { recursive: true });
    writeFileSync(item.target, foreign);
    let downloads = 0;

    // When: OMD is asked to install browser-rs.
    const result = await installBrowserRs(installDependencies(item, async () => {
      downloads += 1;
    }));

    // Then: the conflict is reported as present and the foreign bytes are byte-identical.
    assert.deepEqual(result, { kind: 'present', source: 'target', path: item.target });
    assert.equal(readFileSync(item.target).equals(foreign), true);
    assert.equal(existsSync(receiptPathFor(item.target)), false);
    assert.equal(downloads, 0);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs uninstalls only matching receipt and digest owned bytes', async () => {
  const item = fixture();
  try {
    // Given: a verified OMD-owned installation.
    await installBrowserRs(installDependencies(item, writes(TEST_BYTES)));

    // When: uninstall checks both receipt and on-disk digest.
    const removed = uninstallBrowserRs({ home: item.home, releases: TEST_RELEASES });

    // Then: it removes only the owned binary and its matching receipt.
    assert.deepEqual(removed, { kind: 'removed', path: item.target });
    assert.equal(existsSync(item.target), false);
    assert.equal(existsSync(receiptPathFor(item.target)), false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs refuses to uninstall tampered bytes even when a receipt exists', () => {
  const item = fixture();
  try {
    // Given: a receipt for TEST_BYTES beside changed target bytes.
    mkdirSync(dirname(item.target), { recursive: true });
    writeFileSync(item.target, Buffer.from('tampered'));
    writeBrowserRsReceipt(item.target, TEST_RELEASE);

    // When: uninstall verifies ownership.
    const result = uninstallBrowserRs({ home: item.home, releases: TEST_RELEASES });

    // Then: both files are preserved because the receipt cannot prove ownership.
    assert.deepEqual(result, { kind: 'preserved', reason: 'digest-mismatch', path: item.target });
    assert.equal(digest(readFileSync(item.target)), digest(Buffer.from('tampered')));
    assert.equal(existsSync(receiptPathFor(item.target)), true);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs doctor marks a supported, unresolved provider unhealthy', async () => {
  const item = fixture();
  try {
    // Given: a supported platform with no override, PATH entry, or owned binary.

    // When: the provider health check runs.
    const result = await doctorBrowserRs({
      home: item.home,
      platform: 'darwin',
      arch: 'arm64',
      env: {},
      which: () => undefined,
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
    });

    // Then: absence is explicitly unhealthy; Todo 6 may apply fallback policy above it.
    assert.deepEqual(result, { kind: 'unhealthy', reason: 'missing' });
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
