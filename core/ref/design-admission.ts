import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import type { Reference } from '../types.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { designDiscoveryProvider, referenceServiceHost } from './design-discovery-sources.ts';
import { trustedReferenceImage } from './board-security.ts';
import { loadRefs, refRecordPath } from './store.ts';

export type DesignReferenceAdmission = Readonly<{
  eligible: boolean;
  code: 'gallery' | 'observed-original' | 'user-provided' | 'lane' | 'purpose' | 'capture' | 'domain-reuse' | 'discovery';
  reason: string;
  discoverySource?: string;
}>;
type AdmissionOptions = Readonly<{ references?: readonly Reference[] }>;
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const rejected = (code: DesignReferenceAdmission['code'], reason: string): DesignReferenceAdmission => ({ eligible: false, code, reason });
const gallery = (source: string): boolean => {
  try { return designDiscoveryProvider(source) !== null; } catch (error) { if (error instanceof TypeError) return false; throw error; }
};
const host = (source: string): string | null => {
  try { return referenceServiceHost(source) || null; } catch (error) { if (error instanceof TypeError) return null; throw error; }
};

/** Diagnostic history remains readable, but neither its old nor its new namespace is retained evidence. */
export function isRetainedReferencePath(path: string, lane: 'design' | 'domain'): boolean {
  return path.startsWith(`.omd/refs/${lane}/`) && !path.includes('\\') && !path.split('/').includes('..')
    && !path.startsWith(`.omd/refs/${lane}/navigation/`)
    && !/^search-[a-f0-9]{64}\.(?:json|png)$/.test(path.slice(`.omd/refs/${lane}/`.length));
}

/** This reads only route selection to add a restriction. Existing callers still authenticate the route. */
export function requiresDesignReferenceAdmission(root: string): boolean {
  const path = join(root, '.omd/route.json');
  if (!existsSync(path)) return existsSync(join(root, '.omd/reference-research.json'));
  try {
    const pointer: unknown = JSON.parse(readContainedRegularFile(root, path, 'route selection').toString('utf8'));
    if (!object(pointer) || typeof pointer.record !== 'string' || typeof pointer.sha256 !== 'string'
      || !/^route-records\/sha256-[a-f0-9]{64}\.json$/.test(pointer.record)) return true;
    const bytes = readContainedRegularFile(root, join(root, '.omd', pointer.record), 'route selection record');
    if (digest(bytes) !== pointer.sha256) return true;
    const record: unknown = JSON.parse(bytes.toString('utf8'));
    return !object(record) || !object(record.references) || record.references.decision !== 'skip';
  } catch (error) {
    if (error instanceof Error) return true;
    throw error;
  }
}

function nativeCapture(root: string, reference: Reference): DesignReferenceAdmission | null {
  if (reference.researchLane !== 'design') return rejected('lane', 'Retain a separate design-lane capture; archival lane labels do not establish visual provenance.');
  const path = refRecordPath(root, reference);
  if (!isRetainedReferencePath(relative(root, path), 'design') || !reference.imagePath || !isRetainedReferencePath(reference.imagePath, 'design')) {
    return rejected('purpose', 'A retained design capture and its PNG must belong to the design reference namespace.');
  }
  try {
    const raw: unknown = JSON.parse(readContainedRegularFile(root, path, 'retained design capture').toString('utf8'));
    if (!object(raw) || raw.schema === 'reference-navigation-capture-v1' || raw.schema === 'reference-search-execution-v1') return rejected('purpose', 'Navigation and search records are discovery diagnostics.');
    if (raw.source !== reference.source || raw.component !== reference.component || raw.imagePath !== reference.imagePath
      || raw.researchLane !== 'design') return rejected('capture', 'The inspected record does not bind this retained source and image.');
    const acquisition = reference.acquisition;
    const userFile = reference.origin === 'user' && (isAbsolute(reference.source) || reference.source.startsWith('file:'))
      && acquisition?.finalUrl.startsWith('file:') === true && acquisition.httpStatus === null;
    if (!['page', 'component'].includes(reference.kind) || !Number.isFinite(Date.parse(reference.capturedAt))
      || !acquisition || acquisition.requestedUrl !== reference.source || typeof acquisition.finalUrl !== 'string'
      || !Array.isArray(acquisition.links) || acquisition.links.some(link => typeof link !== 'string')
      || (!userFile && (typeof acquisition.httpStatus !== 'number' || acquisition.httpStatus < 200 || acquisition.httpStatus >= 300))) {
      return rejected('capture', 'A successful native capture bound to the actual source and image is required.');
    }
    if (digest(readFileSync(trustedReferenceImage(root, reference.imagePath))) !== acquisition.imageSha256) return rejected('capture', 'The retained image differs from the image bound by its native acquisition.');
  } catch (error) {
    if (error instanceof Error) return rejected('capture', error.message);
    throw error;
  }
  return null;
}

function imageDigest(root: string, path: string | undefined): string | null {
  if (!path) return null;
  try { return digest(readFileSync(trustedReferenceImage(root, path))); }
  catch (error) { if (error instanceof Error) return null; throw error; }
}
function domainConflict(root: string, reference: Reference, references: readonly Reference[]): boolean {
  const sources = [host(reference.source), host(reference.acquisition?.finalUrl ?? '')].filter(value => value !== null);
  return references.some(other => other.researchLane === 'domain' && (
    other.source === reference.source
    || [host(other.source), host(other.acquisition?.finalUrl ?? '')].some(value => value !== null && sources.includes(value))
    || other.imagePath === reference.imagePath
    || (reference.acquisition?.imageSha256 != null && imageDigest(root, other.imagePath) === reference.acquisition.imageSha256)
  ));
}

/** Inspect without mutating archival records; list/tidy and all retained consumers share this policy. */
export function inspectDesignReferenceAdmission(root: string, reference: Reference, options: AdmissionOptions = {}): DesignReferenceAdmission {
  const invalid = nativeCapture(root, reference);
  if (invalid) return invalid;
  const references = options.references ?? loadRefs(root, { includeDomain: true });
  const acquisition = reference.acquisition;
  if (!acquisition) return rejected('capture', 'Native acquisition is missing.');
  if (domainConflict(root, reference, references)) return rejected('domain-reuse', 'Domain source or image evidence cannot be retained as independent design evidence.');
  // The existing native --from-user contract is preserved; this marker is not independent proof of a conversation.
  if (reference.origin === 'user') return { eligible: true, code: 'user-provided', reason: 'Native capture explicitly recorded as supplied by the user.' };
  if (gallery(reference.source) && gallery(acquisition.finalUrl)) return { eligible: true, code: 'gallery', reason: 'Successful retained native capture of a supported gallery item.', discoverySource: reference.source };
  const entry = references.find(other => other.researchLane === 'design' && gallery(other.source)
    && other.acquisition && gallery(other.acquisition.finalUrl) && other.acquisition.links.includes(reference.source)
    && nativeCapture(root, other) === null && !domainConflict(root, other, references));
  if (entry) return { eligible: true, code: 'observed-original', reason: 'Original source was observed in a retained native gallery item.', discoverySource: entry.source };
  return rejected('discovery', 'Capture a supported gallery item and its observed original link, or retain a reference actually supplied by the user.');
}

export class DesignReferenceAdmissionError extends Error {
  override readonly name = 'DesignReferenceAdmissionError';
  readonly admission: DesignReferenceAdmission;
  constructor(admission: DesignReferenceAdmission) {
    super(`DESIGN_REFERENCE_INELIGIBLE: ${admission.code}: ${admission.reason}`);
    this.admission = admission;
  }
}
export function requireDesignReferenceAdmission(root: string, reference: Reference, options: AdmissionOptions = {}): void {
  const result = inspectDesignReferenceAdmission(root, reference, options);
  if (!result.eligible) throw new DesignReferenceAdmissionError(result);
}
