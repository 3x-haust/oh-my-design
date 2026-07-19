import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BROWSER_RS_MAX_DOWNLOAD_BYTES,
  BrowserRsDownloadError,
  downloadBrowserRsRelease,
  type BrowserRsHttpResponse,
  type BrowserRsHttpTransport,
} from '../core/install/browser-rs-download.ts';

const RELEASE_URL = 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-test';

async function* bytes(value: Buffer): AsyncGenerator<Uint8Array> {
  yield value;
}

function response(statusCode: number, payload = Buffer.alloc(0), location?: string): BrowserRsHttpResponse {
  const headers = location === undefined ? {} : { location };
  return { statusCode, headers, body: bytes(payload), discard: () => undefined };
}

function root(): string {
  return mkdtempSync(join(tmpdir(), 'omd-browser-rs-download-'));
}

test('browser-rs downloader rejects hostile hosts, redirects, size, and timeout with distinct reasons', async () => {
  const item = root();
  try {
    const hostileRedirect: BrowserRsHttpTransport = { get: async () => response(302, Buffer.alloc(0), 'https://example.test/binary') };
    const oversized: BrowserRsHttpTransport = { get: async () => response(200, Buffer.alloc(BROWSER_RS_MAX_DOWNLOAD_BYTES + 1)) };
    const timeout: BrowserRsHttpTransport = { get: async () => { throw new BrowserRsDownloadError('timeout', 'timed out'); } };
    const redirectLoop: BrowserRsHttpTransport = { get: async () => response(302, Buffer.alloc(0), RELEASE_URL) };
    const redirect = downloadBrowserRsRelease({ url: RELEASE_URL, destination: join(item, 'redirect.tmp') }, hostileRedirect);
    const size = downloadBrowserRsRelease({ url: RELEASE_URL, destination: join(item, 'size.tmp') }, oversized);
    const timedOut = downloadBrowserRsRelease({ url: RELEASE_URL, destination: join(item, 'timeout.tmp') }, timeout);
    const wrongHost = downloadBrowserRsRelease({ url: 'https://example.test/not-a-release', destination: join(item, 'host.tmp') }, hostileRedirect);
    const tooManyRedirects = downloadBrowserRsRelease({ url: RELEASE_URL, destination: join(item, 'redirect-limit.tmp'), maxRedirects: 0 }, redirectLoop);
    await assert.rejects(redirect, (error: unknown) => error instanceof BrowserRsDownloadError && error.reason === 'host');
    await assert.rejects(size, (error: unknown) => error instanceof BrowserRsDownloadError && error.reason === 'size');
    await assert.rejects(timedOut, (error: unknown) => error instanceof BrowserRsDownloadError && error.reason === 'timeout');
    await assert.rejects(wrongHost, (error: unknown) => error instanceof BrowserRsDownloadError && error.reason === 'host');
    await assert.rejects(tooManyRedirects, (error: unknown) => error instanceof BrowserRsDownloadError && error.reason === 'redirect');
    for (const name of ['redirect.tmp', 'size.tmp', 'timeout.tmp', 'host.tmp', 'redirect-limit.tmp']) assert.equal(existsSync(join(item, name)), false);
  } finally {
    rmSync(item, { recursive: true, force: true });
  }
});

test('browser-rs downloader preserves a pre-existing destination after exclusive-create failure', async () => {
  const item = root();
  const destination = join(item, 'foreign.tmp');
  const foreign = Buffer.from('foreign temporary bytes');
  try {
    writeFileSync(destination, foreign);
    const transport: BrowserRsHttpTransport = { get: async () => response(200, Buffer.from('downloaded bytes')) };
    await assert.rejects(
      downloadBrowserRsRelease({ url: RELEASE_URL, destination }, transport),
      (error: unknown) => error instanceof BrowserRsDownloadError && error.reason === 'transport' && error.destinationOwned === false,
    );
    assert.equal(readFileSync(destination).equals(foreign), true);
  } finally {
    rmSync(item, { recursive: true, force: true });
  }
});
