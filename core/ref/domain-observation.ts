import { resolve } from 'node:path';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { canonicalJson } from './board-artifacts.ts';
import { classifyKoreanServiceText, type KoreanServiceTextClassification } from './market-reference.ts';
import { currentReferenceEvidenceAfter, directDiscoveryEntry, discoveryDigest, publicDiscoveryUrl,
  type DirectDiscoveryEntry, type DiscoveryEvidence, type DiscoveryObservation } from './discovery-record.ts';
import type { ObservedSearchResult } from './search-result.ts';
import { USER_BROWSER_LIMITATIONS } from './user-browser-provenance.ts';

export const DOMAIN_OBSERVATION_SCHEMA = 'reference-domain-observation-v1' as const;
export const DOMAIN_OBSERVATION_LIMITATIONS = 'native-public-get; stable-rendered-visible-text-and-links; no-pixels; no-authentication; no-interaction-probes; not-provider-attested' as const;
export const DOMAIN_STATIC_FETCH_LIMITATIONS = 'native-public-get; static-html-text-and-links; no-rendered-visibility; no-pixels; no-authentication; no-interaction-probes; not-provider-attested' as const;
export type DomainObservationReceipt = Readonly<{ url: string; capture: DiscoveryEvidence }>;
export type DomainObservationRecord = Readonly<{
  schema: typeof DOMAIN_OBSERVATION_SCHEMA | 'reference-domain-observation-v2';
  source: string;
  researchLane: 'domain';
  method: 'navigation' | 'direct-public';
  entry: 'public-directory' | null;
  capturedAt: string;
  acquisition: Readonly<{ requestedUrl: string; finalUrl: string; httpStatus: number | null; links: readonly string[];
    engine?: 'user-browser'; httpStatusSource?: 'unobserved'; authentication?: 'user-browser-session';
    networkIsolation?: 'initial-url-check-only'; getOnlyEnforced?: false }>;
  observedText: string;
  taskText: string;
  linkLabels: readonly ObservedSearchResult[];
  language: KoreanServiceTextClassification;
  limitations: typeof DOMAIN_OBSERVATION_LIMITATIONS | typeof DOMAIN_STATIC_FETCH_LIMITATIONS | typeof USER_BROWSER_LIMITATIONS;
  signature: string;
}>;

const fail = (message: string): never => { throw new Error(`REFERENCE_DOMAIN_OBSERVATION_REQUIRED: ${message}`); };
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('invalid observation data');
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail('invalid observation fields');
  return value as Record<string, unknown>;
}
function text(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > 16_384 || (!allowEmpty && !value.trim())) return fail('invalid observed text');
  return value;
}
function evidence(value: unknown): DiscoveryEvidence {
  const row = object(value, ['path', 'sha256']);
  if (typeof row.path !== 'string' || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) return fail('invalid observation receipt');
  return { path: row.path, sha256: row.sha256 };
}

export function readDomainObservation(root: string, value: unknown, requireCurrent = true): DiscoveryObservation & Readonly<{
  capture: DiscoveryEvidence; language: KoreanServiceTextClassification; method: 'navigation' | 'direct-public'; entry: 'public-directory' | null;
}> {
  const receipt = object(value, ['url', 'capture']);
  const url = publicDiscoveryUrl(receipt.url);
  const capture = evidence(receipt.capture);
  if (capture.path !== `.omd/discovery/domain/observations/${capture.sha256}.json`) return fail('observation requires its exact content-addressed path');
  const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, capture.path), label: capture.path,
    fs: nodeStableProjectFileSystem() });
  if (discoveryDigest(bytes) !== capture.sha256) return fail('observation bytes changed');
  let decoded: unknown;
  try { decoded = JSON.parse(bytes.toString('utf8')); } catch { return fail('invalid observation JSON'); }
  const row = object(decoded, ['schema', 'source', 'researchLane', 'method', 'entry', 'capturedAt', 'acquisition',
    'observedText', 'taskText', 'linkLabels', 'language', 'limitations', 'signature']);
  const userBrowser = row.schema === 'reference-domain-observation-v2';
  if ((!userBrowser && row.schema !== DOMAIN_OBSERVATION_SCHEMA) || row.source !== url || row.researchLane !== 'domain'
    || (row.method !== 'navigation' && row.method !== 'direct-public')
    || (row.method === 'navigation' ? row.entry !== null : directDiscoveryEntry(row.entry, 'domain') !== row.entry)
    || typeof row.capturedAt !== 'string' || !Number.isFinite(Date.parse(row.capturedAt))
    || (userBrowser ? row.limitations !== USER_BROWSER_LIMITATIONS
      : row.limitations !== DOMAIN_OBSERVATION_LIMITATIONS && row.limitations !== DOMAIN_STATIC_FETCH_LIMITATIONS)
    || typeof row.signature !== 'string') return fail('invalid observation provenance');
  if (requireCurrent && (Date.parse(row.capturedAt) < currentReferenceEvidenceAfter(root)
    || Date.parse(row.capturedAt) > Date.now() + 5 * 60 * 1000)) return fail('observation is stale for the current route');
  const acquisition = object(row.acquisition, ['requestedUrl', 'finalUrl', 'httpStatus', 'links',
    ...(userBrowser ? ['engine', 'httpStatusSource', 'authentication', 'networkIsolation', 'getOnlyEnforced'] : [])]);
  if (acquisition.requestedUrl !== url || !Array.isArray(acquisition.links)
    || (userBrowser ? acquisition.httpStatus !== null || acquisition.engine !== 'user-browser'
      || acquisition.httpStatusSource !== 'unobserved' || acquisition.authentication !== 'user-browser-session'
      || acquisition.networkIsolation !== 'initial-url-check-only' || acquisition.getOnlyEnforced !== false
      : typeof acquisition.httpStatus !== 'number' || !Number.isInteger(acquisition.httpStatus)
        || acquisition.httpStatus < 200 || acquisition.httpStatus >= 300)) return fail('invalid observation acquisition');
  const finalUrl = publicDiscoveryUrl(acquisition.finalUrl);
  const links = acquisition.links.map(publicDiscoveryUrl);
  if (new Set(links).size !== links.length) return fail('duplicate observed links');
  const observedText = text(row.observedText, true);
  const taskText = text(row.taskText, true);
  const language = classifyKoreanServiceText(observedText);
  if (row.language !== language) return fail('language classification changed');
  if (!Array.isArray(row.linkLabels) || Object.keys(row.linkLabels).length !== row.linkLabels.length) return fail('invalid link labels');
  const linkLabels = row.linkLabels.map(value => {
    const label = object(value, ['url', 'text']);
    const labelUrl = publicDiscoveryUrl(label.url);
    if (!links.includes(labelUrl)) return fail('link label does not bind an observed link');
    return { url: labelUrl, text: text(label.text) };
  });
  const { signature, ...unsigned } = row;
  if (!verifyNativeObservation(root, userBrowser ? 'reference-domain-observation-v2' : DOMAIN_OBSERVATION_SCHEMA,
    discoveryDigest(canonicalJson(unsigned)), signature as string)) return fail('native observation signature invalid');
  return { url, finalUrl, links, observedText, taskText, capturedAt: row.capturedAt, linkLabels, capture,
    language, method: row.method as 'navigation' | 'direct-public', entry: row.entry as 'public-directory' | null };
}
