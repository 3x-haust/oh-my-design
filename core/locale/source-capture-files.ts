import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { writeContentAddressedProjectFile } from '../runtime/project-write.ts';
import { canonicalLocaleDesignJson, parseLocaleDesignRoute, type LocaleDesignRoute } from './design-context.ts';
import { validateCulturalDesignProfile, type CulturalDesignSource } from './cultural-profile.ts';

export const CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA = 'cultural-design-source-receipt-v1' as const;
export const CULTURAL_DESIGN_SOURCE_RECEIPT_DIRECTORY = '.omd/locale-source-receipts' as const;
export const CULTURAL_DESIGN_SOURCE_BYTES_DIRECTORY = '.omd/locale-source-bytes' as const;
export const UNSTABLE_CONTENT_REASON_PREFIX = 'UNSTABLE_CONTENT:' as const;

export type CulturalDesignSourceReceipt = Readonly<{
  schema: typeof CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA;
  contextSha256: string;
  status: 'captured' | 'unavailable';
  url: string | null;
  attemptedUrl: string;
  capturedAt: string;
  contentType: string | null;
  contentSha256: string | null;
  contentRecord: string | null;
  reason: string | null;
}>;

export type CulturalDesignSourceCaptureResult = Readonly<{
  receipt: CulturalDesignSourceReceipt;
  receiptSha256: string;
  receiptPath: string;
  contentPath: string | null;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const RECEIPT_RECORD = /^locale-source-receipts\/sha256-([a-f0-9]{64})\.json$/;
const CONTENT_RECORD = /^locale-source-bytes\/sha256-([a-f0-9]{64})\.bin$/;
const PROFILE_RECORD = /^locale-profiles\/sha256-([a-f0-9]{64})\.json$/;
const PROFILE_POINTER_PATH = '.omd/cultural-design-profile.json';
const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;

function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalBytes(value: unknown): string { return `${canonicalLocaleDesignJson(value)}\n`; }

async function boundedResponseBytes(response: Response): Promise<Uint8Array> {
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_CAPTURE_BYTES) {
      throw new Error(`declared capture size is outside 1..${MAX_CAPTURE_BYTES} bytes`);
    }
  }
  if (response.body === null) throw new Error('source response has no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > MAX_CAPTURE_BYTES) {
        await reader.cancel('locale source exceeds the capture byte limit');
        throw new Error(`capture size exceeds ${MAX_CAPTURE_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error('source response is empty');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function read(root: string, path: string, label: string): Buffer {
  try { return readContainedRegularFile(root, path, label); }
  catch (error) {
    throw new Error(`LOCALE_DESIGN_SOURCE_STALE: ${label} is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function currentLocaleRoute(root: string, invocation: ProjectRunInvocation): LocaleDesignRoute {
  const route = readPersistedRoute(root, invocation).sourceContract.localeDesign;
  if (route === undefined || route.decision !== 'research') {
    throw new Error('LOCALE_DESIGN_RESEARCH_REQUIRED: source capture needs a current locale research route');
  }
  return parseLocaleDesignRoute(route);
}

function currentContextSha256(root: string, invocation: ProjectRunInvocation): string {
  return currentLocaleRoute(root, invocation).contextSha256;
}

function httpsUrl(value: string, label: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`LOCALE_DESIGN_SOURCE_INVALID: ${label} must be an HTTPS URL`); }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
    throw new Error(`LOCALE_DESIGN_SOURCE_INVALID: ${label} must be an HTTPS URL without credentials`);
  }
  return parsed.toString();
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: source receipt timestamp is invalid');
  }
  return value;
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: source receipt must be a plain object');
  }
  const record = value as Record<string, unknown>;
  const expected = [
    'schema', 'contextSha256', 'status', 'url', 'attemptedUrl', 'capturedAt', 'contentType',
    'contentSha256', 'contentRecord', 'reason',
  ].sort();
  const keys = Object.keys(record).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: source receipt fields are invalid');
  }
  return record;
}

function parseReceipt(value: unknown, contextSha256: string): CulturalDesignSourceReceipt {
  const record = plainRecord(value);
  if (record.schema !== CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA || record.contextSha256 !== contextSha256
    || (record.status !== 'captured' && record.status !== 'unavailable')) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: source receipt is not bound to the current context');
  }
  const capturedAt = timestamp(record.capturedAt);
  const attemptedUrl = httpsUrl(String(record.attemptedUrl), 'attemptedUrl');
  if (record.status === 'captured') {
    const url = httpsUrl(String(record.url), 'url');
    if (typeof record.contentSha256 !== 'string' || !SHA256.test(record.contentSha256)
      || typeof record.contentRecord !== 'string'
      || CONTENT_RECORD.exec(record.contentRecord)?.[1] !== record.contentSha256
      || typeof record.contentType !== 'string' || record.contentType.trim() === ''
      || record.reason !== null) {
      throw new Error('LOCALE_DESIGN_SOURCE_STALE: captured source receipt is malformed');
    }
    return Object.freeze({
      schema: CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA, contextSha256, status: 'captured', url,
      attemptedUrl, capturedAt, contentType: record.contentType, contentSha256: record.contentSha256,
      contentRecord: record.contentRecord, reason: null,
    });
  }
  if (record.url !== null || record.contentType !== null || record.contentSha256 !== null
    || record.contentRecord !== null || typeof record.reason !== 'string' || record.reason.trim() === '') {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: unavailable source receipt is malformed');
  }
  return Object.freeze({
    schema: CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA, contextSha256, status: 'unavailable', url: null,
    attemptedUrl, capturedAt, contentType: null, contentSha256: null, contentRecord: null,
    reason: record.reason.trim(),
  });
}

function writeReceipt(
  root: string,
  receipt: CulturalDesignSourceReceipt,
  invocation: ProjectRunInvocation,
): CulturalDesignSourceCaptureResult {
  const bytes = canonicalBytes(receipt);
  const receiptSha256 = digest(bytes);
  const receiptPath = `${CULTURAL_DESIGN_SOURCE_RECEIPT_DIRECTORY}/sha256-${receiptSha256}.json`;
  writeContentAddressedProjectFile({ projectRoot: root, relativePath: receiptPath, content: bytes, invocation });
  return Object.freeze({
    receipt, receiptSha256, receiptPath,
    contentPath: receipt.contentRecord === null ? null : `.omd/${receipt.contentRecord}`,
  });
}

export async function captureCulturalDesignSource(
  rootInput: string,
  urlInput: string,
  invocation: ProjectRunInvocation,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<CulturalDesignSourceCaptureResult> {
  const root = resolve(rootInput);
  const attemptedUrl = httpsUrl(urlInput, 'url');
  const contextSha256 = currentContextSha256(root, invocation);
  const capturedAt = new Date().toISOString();
  try {
    const response = await fetcher(attemptedUrl, {
      redirect: 'follow', signal: AbortSignal.timeout(30_000),
      headers: { 'user-agent': 'oh-my-design-locale-evidence/1' },
    });
    if (!response.ok) {
      return writeReceipt(root, Object.freeze({
        schema: CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA, contextSha256, status: 'unavailable',
        url: null, attemptedUrl, capturedAt, contentType: null, contentSha256: null,
        contentRecord: null, reason: `HTTP ${response.status}`,
      }), invocation);
    }
    const bytes = await boundedResponseBytes(response);
    const contentSha256 = digest(bytes);
    const contentRecord = `locale-source-bytes/sha256-${contentSha256}.bin`;
    writeContentAddressedProjectFile({
      projectRoot: root, relativePath: `.omd/${contentRecord}`, content: bytes, invocation,
    });
    const contentType = response.headers.get('content-type')?.trim() || 'application/octet-stream';
    return writeReceipt(root, Object.freeze({
      schema: CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA, contextSha256, status: 'captured',
      url: httpsUrl(response.url || attemptedUrl, 'response URL'), attemptedUrl, capturedAt,
      contentType, contentSha256, contentRecord, reason: null,
    }), invocation);
  } catch (error) {
    const reason = error instanceof Error && error.message.trim() !== '' ? error.message.trim() : 'source fetch failed';
    return writeReceipt(root, Object.freeze({
      schema: CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA, contextSha256, status: 'unavailable',
      url: null, attemptedUrl, capturedAt, contentType: null, contentSha256: null,
      contentRecord: null, reason,
    }), invocation);
  }
}

function activeCapturedReceiptForUrl(
  root: string,
  attemptedUrl: string,
  invocation: ProjectRunInvocation,
): CulturalDesignSourceReceipt | null {
  if (!existsSync(join(root, PROFILE_POINTER_PATH))) return null;
  const context = currentLocaleRoute(root, invocation);
  const pointerBytes = read(root, PROFILE_POINTER_PATH, 'cultural profile pointer');
  let pointer: unknown;
  try { pointer = JSON.parse(pointerBytes.toString('utf8')) as unknown; }
  catch { throw new Error('LOCALE_DESIGN_SOURCE_STALE: cultural profile pointer is not JSON'); }
  if (typeof pointer !== 'object' || pointer === null || Array.isArray(pointer)) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: cultural profile pointer is malformed');
  }
  const record = pointer as Record<string, unknown>;
  const profileRecord = typeof record.record === 'string' ? PROFILE_RECORD.exec(record.record) : null;
  if (Object.keys(record).length !== 4
    || record.schema !== 'cultural-design-profile-pointer-v1'
    || record.contextSha256 !== context.contextSha256
    || typeof record.sha256 !== 'string'
    || !SHA256.test(record.sha256)
    || profileRecord?.[1] !== record.sha256) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: cultural profile pointer is malformed');
  }
  const profileBytes = read(root, `.omd/${record.record as string}`, 'cultural profile record');
  if (digest(profileBytes) !== record.sha256) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: cultural profile bytes changed');
  }
  let value: unknown;
  try { value = JSON.parse(profileBytes.toString('utf8')) as unknown; }
  catch { throw new Error('LOCALE_DESIGN_SOURCE_STALE: cultural profile record is not JSON'); }
  const profile = validateCulturalDesignProfile(value, context);
  for (const source of profile.sources) {
    if (source.status !== 'captured') continue;
    const current = readCurrentCulturalDesignSource(root, source, context.contextSha256);
    if (current.receipt.attemptedUrl === attemptedUrl) return current.receipt;
  }
  return null;
}

/**
 * Captures the same source twice and records canonical unavailability when the
 * immediately observed final URL or content bytes are unstable. This is the
 * only caller-independent lane for converting a successful-but-volatile fetch
 * into an unavailable receipt; profile authors cannot self-attest instability.
 */
export async function captureStableCulturalDesignSource(
  rootInput: string,
  urlInput: string,
  invocation: ProjectRunInvocation,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<CulturalDesignSourceCaptureResult> {
  const root = resolve(rootInput);
  const attemptedUrl = httpsUrl(urlInput, 'url');
  const active = activeCapturedReceiptForUrl(root, attemptedUrl, invocation);
  const first = await captureCulturalDesignSource(root, attemptedUrl, invocation, fetcher);
  if (first.receipt.status === 'unavailable') return first;
  const second = await captureCulturalDesignSource(root, attemptedUrl, invocation, fetcher);
  if (second.receipt.status === 'unavailable') return second;
  if (first.receipt.url === second.receipt.url
    && first.receipt.contentSha256 === second.receipt.contentSha256
    && (active === null || (
      active.url === second.receipt.url
      && active.contentSha256 === second.receipt.contentSha256
    ))) return second;
  const contextSha256 = currentContextSha256(root, invocation);
  return writeReceipt(root, Object.freeze({
    schema: CULTURAL_DESIGN_SOURCE_RECEIPT_SCHEMA,
    contextSha256,
    status: 'unavailable',
    url: null,
    attemptedUrl,
    capturedAt: new Date().toISOString(),
    contentType: null,
    contentSha256: null,
    contentRecord: null,
    reason: active === null
      ? `${UNSTABLE_CONTENT_REASON_PREFIX} two immediate captures did not produce identical final URL and content bytes`
      : `${UNSTABLE_CONTENT_REASON_PREFIX} the current profile receipt and two immediate captures did not produce identical final URL and content bytes`,
  }), invocation);
}

export function readCurrentCulturalDesignSource(
  rootInput: string,
  source: CulturalDesignSource,
  contextSha256: string,
): CulturalDesignSourceCaptureResult {
  const root = resolve(rootInput);
  if (source.captureSha256 === null || !SHA256.test(source.captureSha256)) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: profile source has no receipt hash');
  }
  const receiptRecord = `locale-source-receipts/sha256-${source.captureSha256}.json`;
  if (RECEIPT_RECORD.exec(receiptRecord)?.[1] !== source.captureSha256) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: source receipt path is invalid');
  }
  const receiptPath = `.omd/${receiptRecord}`;
  const receiptBytes = read(root, receiptPath, 'locale source receipt');
  if (digest(receiptBytes) !== source.captureSha256) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: source receipt bytes changed');
  }
  let value: unknown;
  try { value = JSON.parse(receiptBytes.toString('utf8')) as unknown; }
  catch { throw new Error('LOCALE_DESIGN_SOURCE_STALE: source receipt is not JSON'); }
  const receipt = parseReceipt(value, contextSha256);
  if (receipt.status !== source.status) throw new Error('LOCALE_DESIGN_SOURCE_STALE: source receipt status changed');
  if (source.status === 'captured') {
    if (source.url !== receipt.url || source.capturedAt !== receipt.capturedAt || receipt.contentRecord === null
      || receipt.contentSha256 === null) {
      throw new Error('LOCALE_DESIGN_SOURCE_STALE: profile source does not match its receipt');
    }
    const contentPath = `.omd/${receipt.contentRecord}`;
    const content = read(root, contentPath, 'locale source bytes');
    if (digest(content) !== receipt.contentSha256) {
      throw new Error('LOCALE_DESIGN_SOURCE_STALE: source content bytes changed');
    }
    return Object.freeze({ receipt, receiptSha256: source.captureSha256, receiptPath, contentPath });
  }
  if (source.url !== null || source.capturedAt !== null || source.observation !== receipt.reason) {
    throw new Error('LOCALE_DESIGN_SOURCE_STALE: unavailability reason does not match its receipt');
  }
  return Object.freeze({ receipt, receiptSha256: source.captureSha256, receiptPath, contentPath: null });
}

export async function verifyRemoteCulturalDesignSources(
  root: string,
  sources: readonly CulturalDesignSource[],
  contextSha256: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<Readonly<{ checkedAt: string; sourceCount: number }>> {
  for (const source of sources) {
    const current = readCurrentCulturalDesignSource(root, source, contextSha256);
    const receipt = current.receipt;
    let response: Response;
    try {
      response = await fetcher(receipt.attemptedUrl, {
        redirect: 'follow', signal: AbortSignal.timeout(30_000),
        headers: { 'user-agent': 'oh-my-design-locale-evidence/1' },
      });
    } catch (error) {
      if (receipt.status === 'unavailable') continue;
      throw new Error(`LOCALE_DESIGN_SOURCE_REMOTE_STALE: ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (receipt.status === 'unavailable') {
      if (response.ok && receipt.reason?.startsWith(UNSTABLE_CONTENT_REASON_PREFIX)) {
        try {
          const firstUrl = httpsUrl(response.url || receipt.attemptedUrl, 'response URL');
          const firstBytes = await boundedResponseBytes(response);
          const second = await fetcher(receipt.attemptedUrl, {
            redirect: 'follow', signal: AbortSignal.timeout(30_000),
            headers: { 'user-agent': 'oh-my-design-locale-evidence/1' },
          });
          if (!second.ok) continue;
          const secondUrl = httpsUrl(second.url || receipt.attemptedUrl, 'response URL');
          const secondBytes = await boundedResponseBytes(second);
          if (firstUrl !== secondUrl || digest(firstBytes) !== digest(secondBytes)) continue;
        } catch {
          continue;
        }
        throw new Error(`LOCALE_DESIGN_SOURCE_REMOTE_STALE: ${source.id}: previously unstable source is now stable`);
      }
      if (response.ok) throw new Error(`LOCALE_DESIGN_SOURCE_REMOTE_STALE: ${source.id}: previously unavailable source is now available`);
      continue;
    }
    try {
      if (!response.ok) throw new Error(`captured source now returns HTTP ${response.status}`);
      const finalUrl = httpsUrl(response.url || receipt.attemptedUrl, 'response URL');
      if (finalUrl !== receipt.url) throw new Error('captured source final URL changed');
      const bytes = await boundedResponseBytes(response);
      if (digest(bytes) !== receipt.contentSha256) throw new Error('captured source bytes changed');
    } catch (error) {
      throw new Error(`LOCALE_DESIGN_SOURCE_REMOTE_STALE: ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return Object.freeze({ checkedAt: new Date().toISOString(), sourceCount: sources.length });
}
