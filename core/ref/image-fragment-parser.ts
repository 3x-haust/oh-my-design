import { ReferenceBoardResolutionError } from './board-contract.ts';
import { parseImageFragmentProvenance, parseImageFragmentTransfer } from './board-fragment.ts';
import { IMAGE_FRAGMENT_SCHEMA_VERSION, type ImageFragmentInput, type ImageFragmentRecord } from './image-fragment.ts';

const fail = (reason: string): never => { throw new ReferenceBoardResolutionError(`image fragment ${reason}`); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const record = (value: unknown, label: string): Record<string, unknown> => isRecord(value) ? value : fail(`${label} must be an object`);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail(`${label} has unknown or missing keys`);
};
const localInputPath = (value: unknown): string => {
  if (typeof value !== 'string') return fail('inputPath must be a local PNG path');
  if (value.trim() === '') return fail('inputPath must be a local PNG path');
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return fail('inputPath must be a local PNG path');
  return value;
};
export const imageFragmentRecordId = (value: unknown): string => typeof value === 'string' && /^fragment-[0-9a-f]{16}$/.test(value) ? value : fail('id must be a stable fragment identity');
const sha256 = (value: unknown): string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : fail('sha256 must be 64 lowercase hexadecimal characters');
const imagePath = (value: unknown, sha: string): string => {
  const expected = `.omd/refs/fragments/${sha}.png`;
  if (value !== expected) fail('imagePath must use the content-derived fragment PNG path');
  return expected;
};

export function parseImageFragmentInput(value: unknown): ImageFragmentInput {
  const parsed = record(value, 'input');
  exactKeys(parsed, ['inputPath', 'provenance', 'transfer'], 'input');
  return {
    inputPath: localInputPath(parsed['inputPath']),
    provenance: parseImageFragmentProvenance(parsed['provenance']),
    transfer: parseImageFragmentTransfer(parsed['transfer']),
  };
}

export function parseImageFragmentRecord(value: unknown): ImageFragmentRecord {
  const parsed = record(value, 'record');
  exactKeys(parsed, ['schemaVersion', 'id', 'sha256', 'imagePath', 'provenance', 'transfer'], 'record');
  if (parsed['schemaVersion'] !== IMAGE_FRAGMENT_SCHEMA_VERSION) fail(`schemaVersion must be ${IMAGE_FRAGMENT_SCHEMA_VERSION}`);
  const sha = sha256(parsed['sha256']);
  return {
    schemaVersion: IMAGE_FRAGMENT_SCHEMA_VERSION,
    id: imageFragmentRecordId(parsed['id']),
    sha256: sha,
    imagePath: imagePath(parsed['imagePath'], sha),
    provenance: parseImageFragmentProvenance(parsed['provenance']),
    transfer: parseImageFragmentTransfer(parsed['transfer']),
  };
}
