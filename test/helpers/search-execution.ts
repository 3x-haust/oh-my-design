// Synthetic evidence only for validator fixtures. Browser execution is tested separately.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

export function testPng(width = 1280, height = 900): Buffer {
  const chunk = (type: string, bytes: Buffer) => {
    const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
    const body = Buffer.concat([Buffer.from(type), bytes]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}
export function testSearchReceipt(root: string, lane: 'domain' | 'design', query: string, links: string[], failed = false) {
  const save = (bytes: Buffer, extension: string) => {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const path = `.omd/refs/${lane}/search-${sha256}.${extension}`;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
    return { path, sha256 };
  };
  const url = new URL('https://www.google.com/search'); url.searchParams.set('q', query);
  const record = { schema: 'reference-search-execution-v1', lane, query, queryParam: 'q', requestedUrl: url.href, finalUrl: url.href,
    provider: url.hostname, observedAt: '2026-09-20T00:00:00.000Z', status: failed ? 'http-error' : 'page-observed', httpStatus: failed ? 403 : 200,
    links, capture: save(testPng(), 'png'), error: failed ? 'HTTP 403' : null,
    limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested' };
  return save(Buffer.from(`${JSON.stringify(record, null, 2)}\n`), 'json');
}
