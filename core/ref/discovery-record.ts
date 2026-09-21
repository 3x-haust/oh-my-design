import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { decodePng } from '../motion/energy.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { designDiscoveryDirectoryProvider, designDiscoveryProvider, referenceServiceHost } from './design-discovery-sources.ts';
import { forbiddenPublicHostname } from './public-network.ts';

export type DiscoveryLane = 'domain' | 'design';
export type DirectDiscoveryEntry = 'public-directory' | 'free-gallery';
export type DiscoveryEvidence = Readonly<{ path: string; sha256: string }>;
export type DiscoveryNavigationReceipt = Readonly<{ url: string; evidence: DiscoveryEvidence; capture: DiscoveryEvidence }>;
export type DirectDiscoveryReceipt = DiscoveryNavigationReceipt & Readonly<{ method: 'direct-public'; entry: DirectDiscoveryEntry }>;
export type DiscoveryObservation = Readonly<{ url: string; finalUrl: string; links: readonly string[] }>;
export const DISCOVERY_LIMITATIONS = 'native-public-get; stable-rendered-viewport-links; no-authentication; no-interaction-probes; not-provider-attested' as const;
type DiscoveryCaptureFields = Readonly<{
  source: string; researchLane: DiscoveryLane; kind: 'page'; capturedAt: string; imagePath: string;
  acquisition: Readonly<{ requestedUrl: string; finalUrl: string; httpStatus: number; links: readonly string[]; imageSha256: string }>;
  limitations: typeof DISCOVERY_LIMITATIONS;
}>;
export type DiscoveryCaptureRecord = DiscoveryCaptureFields & (
  Readonly<{ schema: 'reference-navigation-capture-v2' }>
  | Readonly<{ schema: 'reference-discovery-entry-v1'; method: 'direct-public'; entry: DirectDiscoveryEntry }>
);

export class ReferenceDiscoveryError extends Error {
  override readonly name: string = 'ReferenceDiscoveryError';
  constructor(message: string) { super(`REFERENCE_DISCOVERY: ${message}`); }
}
const fail = (message: string): never => { throw new ReferenceDiscoveryError(message); };
export const discoveryDigest = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('expected plain data');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !fields[key]?.enumerable || !('value' in fields[key]))) return fail(`expected exactly ${keys.join(', ')}`);
  return Object.fromEntries(keys.map(key => [key, Reflect.get(value, key)]));
}
function text(value: unknown): string {
  return typeof value === 'string' && value.length <= 4096 && value.trim() === value && value.length > 0 ? value : fail('missing or invalid text');
}
function digest(value: unknown): string { const parsed = text(value); return /^[a-f0-9]{64}$/.test(parsed) ? parsed : fail('invalid digest'); }
export function publicDiscoveryUrl(value: unknown): string {
  const parsed = text(value);
  let url: URL;
  try { url = new URL(parsed); } catch { return fail('invalid public URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href !== parsed
    || !url.hostname.includes('.') || forbiddenPublicHostname(url.hostname)) return fail('use canonical public HTTPS URLs without credentials, fragments, or private-network hosts');
  return parsed;
}
export function discoveryLane(value: unknown): DiscoveryLane {
  return value === 'domain' || value === 'design' ? value : fail('lane must be domain or design');
}
export function directDiscoveryEntry(value: unknown, lane: DiscoveryLane): DirectDiscoveryEntry {
  if (value === 'public-directory' && lane === 'domain') return value;
  if (value === 'free-gallery' && lane === 'design') return value;
  return fail('entry must be public-directory for domain or free-gallery for design');
}
export function validateDirectDiscoveryLinks(entry: DirectDiscoveryEntry, observation: DiscoveryObservation): void {
  if (!observation.links.some(link => link !== observation.url && link !== observation.finalUrl)) return fail('direct entry needs a visible followable destination link');
  switch (entry) {
    case 'public-directory': return;
    case 'free-gallery': {
      const provider = designDiscoveryDirectoryProvider(observation.url);
      if (!provider || designDiscoveryDirectoryProvider(observation.finalUrl) !== provider
        || referenceServiceHost(observation.url) !== referenceServiceHost(observation.finalUrl)) return fail('free-gallery entry requires a supported public list at requested and final URLs');
      if (!observation.links.some(link => designDiscoveryProvider(link) === provider
        && referenceServiceHost(link) === referenceServiceHost(observation.finalUrl))) return fail('free-gallery entry needs visible same-provider gallery-item links');
      return;
    }
    default: return assertNever(entry);
  }
}
function assertNever(value: never): never { return fail(`unknown entry: ${String(value)}`); }
function evidence(value: unknown): DiscoveryEvidence {
  const row = object(value, ['path', 'sha256']);
  return { path: text(row.path), sha256: digest(row.sha256) };
}
function read(root: string, receipt: DiscoveryEvidence): Buffer {
  const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, receipt.path), label: receipt.path, fs: nodeStableProjectFileSystem() });
  if (discoveryDigest(bytes) !== receipt.sha256) return fail('discovery evidence changed');
  return bytes;
}
function readDiscovery(root: string, value: unknown, direct: boolean): DiscoveryObservation {
  const receipt = object(value, direct ? ['method', 'entry', 'url', 'evidence', 'capture'] : ['url', 'evidence', 'capture']);
  const url = publicDiscoveryUrl(receipt.url);
  const image = evidence(receipt.evidence); const capture = evidence(receipt.capture);
  const match = /^\.omd\/discovery\/(domain|design)\/(entries|navigation)\/([a-f0-9]{64})\.json$/.exec(capture.path);
  if (!match || match[2] !== (direct ? 'entries' : 'navigation') || match[3] !== capture.sha256) return fail('capture requires its exact content-addressed lane/purpose path');
  const lane = discoveryLane(match[1]);
  const directory = `.omd/discovery/${lane}/${direct ? 'entries' : 'navigation'}`;
  if (image.path !== `${directory}/${image.sha256}.png`) return fail('image requires its exact content-addressed lane/purpose path');
  const entry = direct ? directDiscoveryEntry(receipt.entry, lane) : undefined;
  if (direct && receipt.method !== 'direct-public') return fail('direct method is required');
  const keys = ['schema', 'source', 'researchLane', 'kind', 'capturedAt', 'imagePath', 'acquisition', 'limitations'];
  const row = object(JSON.parse(read(root, capture).toString('utf8')), direct ? [...keys, 'method', 'entry'] : keys);
  if (row.schema !== (direct ? 'reference-discovery-entry-v1' : 'reference-navigation-capture-v2')
    || row.source !== url || row.researchLane !== lane || row.kind !== 'page' || row.imagePath !== image.path
    || row.limitations !== DISCOVERY_LIMITATIONS || !Number.isFinite(Date.parse(text(row.capturedAt)))
    || (direct && (row.method !== 'direct-public' || row.entry !== entry))) return fail('native capture purpose/source/lane binding differs');
  const acquisition = object(row.acquisition, ['requestedUrl', 'finalUrl', 'httpStatus', 'links', 'imageSha256']);
  if (acquisition.requestedUrl !== url || acquisition.imageSha256 !== image.sha256
    || typeof acquisition.httpStatus !== 'number' || !Number.isInteger(acquisition.httpStatus)
    || acquisition.httpStatus < 200 || acquisition.httpStatus >= 300) return fail('successful native URL/image acquisition is required');
  if (!Array.isArray(acquisition.links) || acquisition.links.length > 2000
    || Object.keys(acquisition.links).length !== acquisition.links.length) return fail('invalid observed links');
  const links = acquisition.links.map(publicDiscoveryUrl);
  if (new Set(links).size !== links.length) return fail('duplicate observed links');
  const observation = { url, finalUrl: publicDiscoveryUrl(acquisition.finalUrl), links };
  if (entry !== undefined) validateDirectDiscoveryLinks(entry, observation);
  const png = decodePng(read(root, image));
  if (png.width !== 1280 || png.height !== 900) return fail('discovery capture viewport differs');
  return observation;
}
export function readDirectDiscoveryEntry(root: string, receipt: unknown): DiscoveryObservation {
  return readDiscovery(root, receipt, true);
}
export function readStrictDiscoveryNavigation(root: string, receipt: unknown): DiscoveryObservation {
  return readDiscovery(root, receipt, false);
}
