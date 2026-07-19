import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  browserRsTarget,
  installBrowserRs,
  resolveBrowserRs,
  uninstallBrowserRs,
  type BrowserRsRelease,
} from '../core/install/browser-rs.ts';
import { receiptPathFor } from '../core/install/browser-rs-receipt.ts';

const OWNED_BYTES = Buffer.from('#!/bin/sh\necho browser-rs\n');
const FOREIGN_BYTES = Buffer.from('foreign browser bytes');
const RELEASE: BrowserRsRelease = {
  platform: 'darwin',
  arch: 'arm64',
  asset: 'browser-rs-test',
  url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-test',
  sha256: createHash('sha256').update(OWNED_BYTES).digest('hex'),
};

function fixture(): { readonly root: string; readonly home: string; readonly target: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-security-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  return { root, home, target: browserRsTarget(home) };
}

function temporaryFiles(target: string): readonly string[] {
  const folder = dirname(target);
  return existsSync(folder) ? readdirSync(folder).filter((name) => name.includes('.tmp-')) : [];
}

test('browser-rs treats an injected empty environment as authoritative for override and PATH', () => {
  const item = fixture();
  const before = process.env['OMD_BROWSER_RS_BIN'];
  const beforePath = process.env['PATH'];
  const ambient = join(item.root, 'ambient-browser-rs');
  const ambientBin = join(item.root, 'ambient-bin');
  try {
    // Given: the ambient environment has an override and executable PATH entry, but the dependency injects an empty map.
    writeFileSync(ambient, FOREIGN_BYTES);
    process.env['OMD_BROWSER_RS_BIN'] = ambient;
    mkdirSync(ambientBin);
    writeFileSync(join(ambientBin, 'browser-rs'), FOREIGN_BYTES);
    chmodSync(join(ambientBin, 'browser-rs'), 0o755);
    process.env['PATH'] = ambientBin;

    // When: resolution is asked to use the injected environment without replacing PATH lookup.
    const result = resolveBrowserRs({ home: item.home, env: {}, releases: [RELEASE] });

    // Then: neither ambient source can leak through the explicit empty seam.
    assert.deepEqual(result, { kind: 'missing' });
  } finally {
    if (before === undefined) delete process.env['OMD_BROWSER_RS_BIN'];
    else process.env['OMD_BROWSER_RS_BIN'] = before;
    if (beforePath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = beforePath;
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs preserves a foreign target that appears at no-replace publication', async () => {
  const item = fixture();
  try {
    // Given: a downloader writes verified bytes, then a foreign process creates the public target before it returns.
    const result = await installBrowserRs({
      home: item.home,
      platform: 'darwin',
      arch: 'arm64',
      releases: [RELEASE],
      env: { PATH: '' },
      which: () => undefined,
      downloader: async (request) => {
        writeFileSync(request.destination, OWNED_BYTES);
        writeFileSync(item.target, FOREIGN_BYTES);
        return { destinationOwned: true };
      },
    });

    // Then: production no-replace publication preserves the newly appeared foreign target and removes only its own temporary file.
    assert.deepEqual(result, { kind: 'present', source: 'target', path: item.target });
    assert.equal(readFileSync(item.target).equals(FOREIGN_BYTES), true);
    assert.equal(existsSync(receiptPathFor(item.target)), false);
    assert.deepEqual(temporaryFiles(item.target), []);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
