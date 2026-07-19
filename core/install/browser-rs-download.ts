import { closeSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:https';
import type { IncomingMessage } from 'node:http';

export const BROWSER_RS_DOWNLOAD_TIMEOUT_MS = 15_000;
export const BROWSER_RS_MAX_DOWNLOAD_BYTES = 16 * 1024 * 1024;
export const BROWSER_RS_MAX_REDIRECTS = 3;

export type BrowserRsDownloadFailure = 'host' | 'redirect' | 'size' | 'timeout' | 'http' | 'transport' | 'checksum';

export class BrowserRsDownloadError extends Error {
  override readonly name = 'BrowserRsDownloadError';
  readonly reason: BrowserRsDownloadFailure;
  readonly destinationOwned: boolean;

  constructor(reason: BrowserRsDownloadFailure, message: string, destinationOwned = false) {
    super(message);
    this.reason = reason;
    this.destinationOwned = destinationOwned;
  }
}

export type BrowserRsDownloadRequest = {
  readonly url: string;
  readonly destination: string;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
};

export type BrowserRsDownloadResult = { readonly destinationOwned: true };

export type BrowserRsHttpResponse = {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly body: AsyncIterable<Uint8Array>;
  readonly discard: () => void;
};

export type BrowserRsHttpTransport = {
  readonly get: (url: URL, timeoutMs: number) => Promise<BrowserRsHttpResponse>;
};

type BoundedRequest = {
  readonly url: string;
  readonly destination: string;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly maxRedirects: number;
};

const RELEASE_PATH = '/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/';
const REDIRECT_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

async function* bodyBytes(response: IncomingMessage, finish: () => void): AsyncGenerator<Uint8Array> {
  try {
    for await (const chunk of response) {
      if (!(chunk instanceof Uint8Array)) throw new BrowserRsDownloadError('transport', 'response was not bytes');
      yield chunk;
    }
  } finally {
    finish();
  }
}

function nodeGet(url: URL, timeoutMs: number): Promise<BrowserRsHttpResponse> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const finish = (): void => {
      if (timer !== undefined) clearTimeout(timer);
    };
    const request = get(url, (response) => resolve({
      statusCode: response.statusCode ?? 0,
      headers: response.headers,
      body: bodyBytes(response, finish),
      discard: () => { finish(); response.resume(); },
    }));
    timer = setTimeout(() => request.destroy(new BrowserRsDownloadError('timeout', 'download timed out')), timeoutMs);
    request.once('error', (error) => { finish(); reject(error); });
  });
}

const nodeTransport: BrowserRsHttpTransport = { get: nodeGet };

function bounded(request: BrowserRsDownloadRequest): BoundedRequest {
  return {
    url: request.url,
    destination: request.destination,
    timeoutMs: request.timeoutMs ?? BROWSER_RS_DOWNLOAD_TIMEOUT_MS,
    maxBytes: request.maxBytes ?? BROWSER_RS_MAX_DOWNLOAD_BYTES,
    maxRedirects: request.maxRedirects ?? BROWSER_RS_MAX_REDIRECTS,
  };
}

function header(response: BrowserRsHttpResponse, name: string): string | undefined {
  const value = response.headers[name];
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value[0] : undefined;
}

function approvedUrl(url: URL, initial: boolean): void {
  if (url.protocol !== 'https:') throw new BrowserRsDownloadError('host', 'browser-rs requires HTTPS');
  if (initial && (url.hostname !== 'github.com' || !url.pathname.startsWith(RELEASE_PATH))) {
    throw new BrowserRsDownloadError('host', 'browser-rs must start at the pinned GitHub release');
  }
  if (!initial && !REDIRECT_HOSTS.has(url.hostname)) {
    throw new BrowserRsDownloadError('host', 'browser-rs redirect left GitHub release hosts');
  }
  if (!initial && url.hostname === 'github.com' && !url.pathname.startsWith(RELEASE_PATH)) {
    throw new BrowserRsDownloadError('host', 'browser-rs redirect changed GitHub release path');
  }
}

function urlFor(raw: string): URL {
  try {
    return new URL(raw);
  } catch (error) {
    if (error instanceof TypeError) throw new BrowserRsDownloadError('host', 'browser-rs release URL is invalid');
    throw error;
  }
}

async function visit(
  request: BoundedRequest,
  transport: BrowserRsHttpTransport,
  url: URL,
  redirects: number,
  initial: boolean,
): Promise<Buffer> {
  approvedUrl(url, initial);
  const response = await transport.get(url, request.timeoutMs);
  if (response.statusCode >= 300 && response.statusCode < 400) {
    response.discard();
    const location = header(response, 'location');
    if (location === undefined) throw new BrowserRsDownloadError('redirect', 'browser-rs redirect had no location');
    if (redirects >= request.maxRedirects) throw new BrowserRsDownloadError('redirect', 'browser-rs exceeded redirect limit');
    return visit(request, transport, urlFor(new URL(location, url).toString()), redirects + 1, false);
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    response.discard();
    throw new BrowserRsDownloadError('http', `browser-rs download returned HTTP ${response.statusCode}`);
  }
  const declared = header(response, 'content-length');
  if (declared !== undefined && Number(declared) > request.maxBytes) {
    response.discard();
    throw new BrowserRsDownloadError('size', 'browser-rs download exceeded size limit');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    if (chunk.byteLength > request.maxBytes - total) {
      throw new BrowserRsDownloadError('size', 'browser-rs download exceeded size limit');
    }
    total += chunk.byteLength;
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function downloadBrowserRsRelease(
  request: BrowserRsDownloadRequest,
  transport: BrowserRsHttpTransport = nodeTransport,
): Promise<BrowserRsDownloadResult> {
  const value = bounded(request);
  let created = false;
  try {
    const bytes = await visit(value, transport, urlFor(value.url), 0, true);
    const descriptor = openSync(value.destination, 'wx', 0o600);
    created = true;
    try {
      writeFileSync(descriptor, bytes);
    } finally {
      closeSync(descriptor);
    }
    return { destinationOwned: true };
  } catch (error) {
    if (created) rmSync(value.destination, { force: true });
    if (error instanceof BrowserRsDownloadError) throw new BrowserRsDownloadError(error.reason, error.message, created);
    if (error instanceof Error) throw new BrowserRsDownloadError('transport', error.message, created);
    throw error;
  }
}
