import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { canonicalRouteJson } from './adaptive-source-contract.ts';
import { failAdaptiveRoute } from './adaptive-flow-domain.ts';

export type ReviewPurpose = 'ordinary' | 'benchmark' | 'release';
export type ReviewPurposeAuthorityReceipt = Readonly<{ path: string; sha256: string }>;
export type ReviewPurposeOrigin = Readonly<{
  schema: 'review-purpose-origin-v1';
  projectRoot: string;
  purpose: ReviewPurpose;
  requestSha256: string;
  source: 'host-user-input' | 'pi-interactive' | 'pi-rpc' | 'host-launch';
  observedAt: string;
  signature: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const PURPOSE_PATH = /^\.omd\/review-purpose-authorities\/sha256-([a-f0-9]{64})\.json$/;
const purposes = ['ordinary', 'benchmark', 'release'] as const;
const sources = ['host-user-input', 'pi-interactive', 'pi-rpc', 'host-launch'] as const;

export function parseReviewPurpose(value: unknown): ReviewPurpose {
  return purposes.includes(value as ReviewPurpose)
    ? value as ReviewPurpose
    : failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', 'reviewPurpose must be ordinary, benchmark, or release');
}

export function parseReviewPurposeAuthority(value: unknown): ReviewPurposeAuthorityReceipt | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || value === null
    || Reflect.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== 'path,sha256') {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', 'reviewPurposeAuthority must be a content-addressed receipt or null');
  }
  const path = Reflect.get(value, 'path');
  const sha256 = Reflect.get(value, 'sha256');
  const match = typeof path === 'string' ? PURPOSE_PATH.exec(path) : null;
  if (match === null || typeof sha256 !== 'string' || !SHA256.test(sha256) || match[1] !== sha256) {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'review purpose authority must use its exact content-addressed authority path');
  }
  return Object.freeze({ path, sha256 });
}

function hash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function verifyReviewPurposeAuthority(
  root: string,
  receipt: ReviewPurposeAuthorityReceipt,
  purpose: ReviewPurpose,
  request: string,
): ReviewPurposeOrigin {
  let bytes: Buffer;
  try {
    bytes = readContainedRegularFile(root, receipt.path, 'review purpose origin');
  } catch {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'review purpose origin receipt is missing or unsafe');
  }
  if (hash(bytes) !== receipt.sha256) return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'review purpose origin bytes changed');
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'review purpose origin is not valid JSON'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== 'observedAt,projectRoot,purpose,requestSha256,schema,signature,source') {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'review purpose origin has an invalid exact shape');
  }
  const origin = value as Record<string, unknown>;
  if (origin.schema !== 'review-purpose-origin-v1' || !purposes.includes(origin.purpose as ReviewPurpose)
    || !sources.includes(origin.source as ReviewPurposeOrigin['source'])
    || typeof origin.projectRoot !== 'string' || typeof origin.requestSha256 !== 'string'
    || typeof origin.observedAt !== 'string' || !Number.isFinite(Date.parse(origin.observedAt))
    || typeof origin.signature !== 'string') {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'review purpose origin is not a typed host/user observation');
  }
  const parsed = origin as unknown as ReviewPurposeOrigin;
  const { signature, ...payload } = parsed;
  const canonicalRoot = realpathSync(root);
  const payloadSha256 = hash(canonicalRouteJson(payload));
  if (parsed.projectRoot !== canonicalRoot || parsed.purpose !== purpose
    || parsed.requestSha256 !== hash(request)
    || !verifyNativeObservation(canonicalRoot, parsed.schema, payloadSha256, signature)) {
    return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'review purpose must come from the actual host/user origin, not model-authored route data');
  }
  return Object.freeze(parsed);
}
