import {
  ReferenceBoardResolutionError,
  type ImageFragmentCropBox,
  type ImageFragmentGeometry,
  type ImageFragmentProvenance,
  type ImageFragmentTransfer,
  type ReferenceBoardImageFragmentPiece,
  type ResolvedImageFragmentPiece,
} from './board-contract.ts';
import { trustedReferenceImage } from './board-security.ts';
import { hasAssemblyPayload } from './board-sanitization.ts';

const fail = (reason: string): never => { throw new ReferenceBoardResolutionError(`image fragment ${reason}`); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const record = (value: unknown, label: string): Record<string, unknown> => isRecord(value) ? value : fail(`${label} must be an object`);
const array = (value: unknown, label: string): readonly unknown[] => Array.isArray(value) ? value : fail(`${label} must be an array`);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail(`${label} has unknown or missing keys`);
};
const text = (value: unknown, label: string): string => typeof value === 'string' && value.trim() !== '' ? value : fail(`${label} must be a non-empty string`);
const sanitizedText = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  if (hasAssemblyPayload(parsed)) fail(`${label} must not include source or pixel payloads`);
  return parsed;
};
const absoluteHttpUrl = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  let url: URL;
  try { url = new URL(parsed); } catch { return fail(`${label} must be an absolute HTTP(S) URL`); }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname === '') fail(`${label} must be an absolute HTTP(S) URL`);
  return parsed;
};
const canonicalTimestamp = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  const date = new Date(parsed);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed) || Number.isNaN(date.getTime()) || date.toISOString() !== parsed) fail(`${label} must be a canonical ISO timestamp`);
  return parsed;
};
const number = (value: unknown, label: string, positive = false): number => typeof value === 'number' && Number.isFinite(value) && (positive ? value > 0 : value >= 0) ? value : fail(`${label} must be ${positive ? 'positive' : 'non-negative'}`);
const licenseStatus = (value: unknown): ImageFragmentProvenance['licenseStatus'] => {
  switch (value) {
    case 'allowed': return value;
    case 'restricted': return value;
    case 'unknown': return value;
    default: return fail('provenance.licenseStatus is invalid');
  }
};
const principles = (value: unknown, label: string): readonly string[] => {
  const entries = array(value, label);
  if (entries.length === 0) fail(`${label} must be a non-empty array`);
  return entries.map((entry, index) => sanitizedText(entry, `${label}[${index}]`));
};
const cropBox = (value: unknown): ImageFragmentCropBox => {
  const parsed = record(value, 'provenance.cropBox');
  exactKeys(parsed, ['x', 'y', 'width', 'height'], 'provenance.cropBox');
  return { x: number(parsed['x'], 'provenance.cropBox.x'), y: number(parsed['y'], 'provenance.cropBox.y'), width: number(parsed['width'], 'provenance.cropBox.width', true), height: number(parsed['height'], 'provenance.cropBox.height', true) };
};
export const parseImageFragmentProvenance = (value: unknown): ImageFragmentProvenance => {
  const parsed = record(value, 'provenance');
  const keys = ['sourcePage', 'captureRegion', 'licenseStatus', 'rightsNotes', 'capturedAt'];
  if ('sourceImage' in parsed) keys.push('sourceImage'); if ('cropBox' in parsed) keys.push('cropBox');
  exactKeys(parsed, keys, 'provenance');
  return {
    sourcePage: absoluteHttpUrl(parsed['sourcePage'], 'provenance.sourcePage'), ...('sourceImage' in parsed ? { sourceImage: absoluteHttpUrl(parsed['sourceImage'], 'provenance.sourceImage') } : {}),
    captureRegion: sanitizedText(parsed['captureRegion'], 'provenance.captureRegion'), ...('cropBox' in parsed ? { cropBox: cropBox(parsed['cropBox']) } : {}),
    licenseStatus: licenseStatus(parsed['licenseStatus']), rightsNotes: sanitizedText(parsed['rightsNotes'], 'provenance.rightsNotes'), capturedAt: canonicalTimestamp(parsed['capturedAt'], 'provenance.capturedAt'),
  };
};
const geometry = (value: unknown): ImageFragmentGeometry => {
  const parsed = record(value, 'transfer.geometry');
  exactKeys(parsed, ['width', 'height', 'aspectRatio'], 'transfer.geometry');
  return { width: number(parsed['width'], 'transfer.geometry.width', true), height: number(parsed['height'], 'transfer.geometry.height', true), aspectRatio: number(parsed['aspectRatio'], 'transfer.geometry.aspectRatio', true) };
};
export const parseImageFragmentTransfer = (value: unknown): ImageFragmentTransfer => {
  const parsed = record(value, 'transfer');
  const keys = ['visualRole', 'principles']; if ('geometry' in parsed) keys.push('geometry');
  exactKeys(parsed, keys, 'transfer');
  return { visualRole: sanitizedText(parsed['visualRole'], 'transfer.visualRole'), principles: principles(parsed['principles'], 'transfer.principles'), ...('geometry' in parsed ? { geometry: geometry(parsed['geometry']) } : {}) };
};

export function validatedImageFragmentPiece(root: string, expected: ReferenceBoardImageFragmentPiece, value: ResolvedImageFragmentPiece): ResolvedImageFragmentPiece {
  if (value.slotId !== expected.slotId || value.referenceId !== expected.referenceId || value.sourceKind !== expected.sourceKind) fail('resolver changed the board piece identity');
  return { ...expected, imagePath: trustedReferenceImage(root, text(value.imagePath, 'imagePath')), provenance: parseImageFragmentProvenance(value.provenance), transfer: parseImageFragmentTransfer(value.transfer) };
}

export function copyImageFragmentTransfer(value: ImageFragmentTransfer): ImageFragmentTransfer {
  return { visualRole: value.visualRole, principles: [...value.principles], ...(value.geometry === undefined ? {} : { geometry: { width: value.geometry.width, height: value.geometry.height, aspectRatio: value.geometry.aspectRatio } }) };
}
