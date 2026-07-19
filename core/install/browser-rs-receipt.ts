import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { nodeBrowserRsFileSystem, type BrowserRsFileSystem } from './browser-rs-filesystem.ts';

export const BROWSER_RS_RECEIPT_SCHEMA = 'browser-rs-receipt-v1';

export type BrowserRsRelease = {
  readonly platform: string;
  readonly arch: string;
  readonly asset: string;
  readonly url: string;
  readonly sha256: string;
};

export type BrowserRsReceipt = {
  readonly schemaVersion: typeof BROWSER_RS_RECEIPT_SCHEMA;
  readonly version: string;
  readonly asset: string;
  readonly sha256: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function receipt(value: unknown): BrowserRsReceipt | undefined {
  if (!record(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'asset,schemaVersion,sha256,version') return undefined;
  const { schemaVersion, version, asset, sha256 } = value;
  if (schemaVersion !== BROWSER_RS_RECEIPT_SCHEMA) return undefined;
  if (typeof version !== 'string' || typeof asset !== 'string' || typeof sha256 !== 'string') return undefined;
  return { schemaVersion, version, asset, sha256 };
}

export function receiptPathFor(target: string): string {
  return join(dirname(target), 'receipt.json');
}

export function readBrowserRsReceipt(
  target: string,
  fs: BrowserRsFileSystem = nodeBrowserRsFileSystem,
): BrowserRsReceipt | undefined {
  const path = receiptPathFor(target);
  if (!fs.exists(path)) return undefined;
  try {
    return receipt(JSON.parse(fs.read(path).toString('utf8')));
  } catch (error) {
    if (error instanceof Error) return undefined;
    throw error;
  }
}

export function receiptMatchesRelease(value: BrowserRsReceipt, release: BrowserRsRelease): boolean {
  return value.version === 'v0.1.10' && value.asset === release.asset && value.sha256 === release.sha256;
}

export function browserRsReceiptBytes(release: BrowserRsRelease): Buffer {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: BROWSER_RS_RECEIPT_SCHEMA,
    version: 'v0.1.10',
    asset: release.asset,
    sha256: release.sha256,
  })}\n`);
}

export function browserRsReceiptDigest(release: BrowserRsRelease): string {
  return createHash('sha256').update(browserRsReceiptBytes(release)).digest('hex');
}

export function writeBrowserRsReceipt(
  target: string,
  release: BrowserRsRelease,
  fs: BrowserRsFileSystem = nodeBrowserRsFileSystem,
): boolean {
  const path = receiptPathFor(target);
  const temporary = join(dirname(path), `.receipt.tmp-${randomUUID()}`);
  fs.mkdir(dirname(path));
  try {
    fs.write(temporary, browserRsReceiptBytes(release));
    return fs.publishNoReplace(temporary, path);
  } finally {
    fs.remove(temporary);
  }
}
