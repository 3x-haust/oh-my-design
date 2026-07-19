import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { installBrowserRs, browserRsTarget, type BrowserRsRelease } from '../core/install/browser-rs.ts';
import { BrowserRsDownloadError, downloadBrowserRsRelease, type BrowserRsHttpTransport } from '../core/install/browser-rs-download.ts';

const OWNED_BYTES = Buffer.from('#!/bin/sh\necho browser-rs\n');
const FOREIGN_BYTES = Buffer.from('foreign download temporary bytes');
const RELEASE: BrowserRsRelease = {
  platform: 'darwin',
  arch: 'arm64',
  asset: 'browser-rs-download-boundary',
  url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-download-boundary',
  sha256: createHash('sha256').update(OWNED_BYTES).digest('hex'),
};

async function* body(): AsyncGenerator<Uint8Array> {
  yield OWNED_BYTES;
}

test('browser-rs installer preserves a foreign temporary file after downloader exclusive-create failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-install-download-'));
  const home = join(root, 'home');
  let destination = '';
  const transport: BrowserRsHttpTransport = {
    get: async () => ({ statusCode: 200, headers: {}, body: body(), discard: () => undefined }),
  };
  try {
    const result = await installBrowserRs({
      home,
      platform: 'darwin',
      arch: 'arm64',
      releases: [RELEASE],
      env: { PATH: '' },
      which: () => undefined,
      downloader: async (request) => {
        destination = request.destination;
        writeFileSync(destination, FOREIGN_BYTES);
        return downloadBrowserRsRelease(request, transport);
      },
    });
    assert.deepEqual(result, { kind: 'failed', reason: 'transport' });
    assert.equal(readFileSync(destination).equals(FOREIGN_BYTES), true);
    assert.equal(existsSync(browserRsTarget(home)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
