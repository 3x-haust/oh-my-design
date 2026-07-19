import { createHash, randomUUID } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageFragmentProvenance, ImageFragmentResolver, ImageFragmentTransfer, ReferenceBoardImageFragmentPiece, ResolvedImageFragmentPiece } from './board-contract.ts';
import { ReferenceBoardResolutionError } from './board-contract.ts';
import { trustedReferenceDirectory, trustedReferenceImage } from './board-security.ts';
import { imageFragmentRecordId, parseImageFragmentInput, parseImageFragmentRecord } from './image-fragment-parser.ts';

export const IMAGE_FRAGMENT_SCHEMA_VERSION = 'image-fragment-v1' as const;
const FRAGMENT_DIRECTORY = '.omd/refs/fragments';

export type ImageFragmentInput = {
  readonly inputPath: string;
  readonly provenance: ImageFragmentProvenance;
  readonly transfer: ImageFragmentTransfer;
};

export type ImageFragmentRecord = {
  readonly schemaVersion: typeof IMAGE_FRAGMENT_SCHEMA_VERSION;
  readonly id: string;
  readonly sha256: string;
  readonly imagePath: string;
  readonly provenance: ImageFragmentProvenance;
  readonly transfer: ImageFragmentTransfer;
};

const fail = (reason: string): never => { throw new ReferenceBoardResolutionError(`image fragment ${reason}`); };
const digest = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const fragmentId = (sha256: string, provenance: ImageFragmentProvenance): string => `fragment-${digest(`${sha256}\0${JSON.stringify(provenance)}`).slice(0, 16)}`;
const imagePath = (sha256: string): string => `${FRAGMENT_DIRECTORY}/${sha256}.png`;
const recordPath = (directory: string, id: string): string => join(directory, `${id}.json`);
const sameRecord = (left: ImageFragmentRecord, right: ImageFragmentRecord): boolean => JSON.stringify(left) === JSON.stringify(right);
const errorCode = (error: unknown, code: string): boolean => error instanceof Error && 'code' in error && error.code === code;
const entryExists = (path: string): boolean => {
  try { lstatSync(path); return true; } catch (error) { if (errorCode(error, 'ENOENT')) return false; throw error; }
};

const writeExclusively = (path: string, content: Buffer | string): void => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: 'wx' });
    linkSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
};

const ensureFragmentDirectory = (root: string): string => {
  const refs = trustedReferenceDirectory(root, '.omd/refs');
  const directory = join(refs, 'fragments');
  mkdirSync(directory, { recursive: true });
  return trustedReferenceDirectory(root, FRAGMENT_DIRECTORY);
};

const readRecord = (root: string, id: string): ImageFragmentRecord => {
  const path = recordPath(trustedReferenceDirectory(root, FRAGMENT_DIRECTORY), id);
  try {
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) fail(`record ${id} is not a regular file`);
    const record = parseImageFragmentRecord(JSON.parse(readFileSync(path, 'utf8')));
    if (record.id !== id) fail(`record ${id} has a mismatched identity`);
    const trustedPath = trustedReferenceImage(root, record.imagePath);
    if (digest(readFileSync(trustedPath)) !== record.sha256) fail(`record ${id} has a PNG digest mismatch`);
    return record;
  } catch (error) {
    if (error instanceof ReferenceBoardResolutionError) throw error;
    return fail(`record ${id} is missing or invalid`);
  }
};

const validateExistingImage = (root: string, record: ImageFragmentRecord, bytes: Buffer): void => {
  const path = trustedReferenceImage(root, record.imagePath);
  const existing = readFileSync(path);
  if (digest(existing) !== record.sha256 || !existing.equals(bytes)) fail(`image ${record.sha256} already exists with different bytes`);
};

const writeImageIfMissing = (root: string, record: ImageFragmentRecord, bytes: Buffer): boolean => {
  const directory = trustedReferenceDirectory(root, FRAGMENT_DIRECTORY);
  const path = join(directory, `${record.sha256}.png`);
  if (entryExists(path)) { validateExistingImage(root, record, bytes); return false; }
  try {
    writeExclusively(path, bytes);
    return true;
  } catch (error) {
    if (!errorCode(error, 'EEXIST')) throw error;
    validateExistingImage(root, record, bytes);
    return false;
  }
};

export function persistImageFragment(root: string, value: unknown): ImageFragmentRecord {
  const input = parseImageFragmentInput(value);
  const sourcePath = trustedReferenceImage(root, input.inputPath);
  const bytes = readFileSync(sourcePath);
  const sha256 = digest(bytes);
  const record: ImageFragmentRecord = {
    schemaVersion: IMAGE_FRAGMENT_SCHEMA_VERSION,
    id: fragmentId(sha256, input.provenance),
    sha256,
    imagePath: imagePath(sha256),
    provenance: input.provenance,
    transfer: input.transfer,
  };
  const directory = ensureFragmentDirectory(root);
  const target = recordPath(directory, record.id);
  if (entryExists(target)) {
    const existing = readRecord(root, record.id);
    if (!sameRecord(existing, record)) fail(`record ${record.id} already exists with different metadata`);
    return existing;
  }
  writeImageIfMissing(root, record, bytes);
  try {
    writeExclusively(target, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  } catch (error) {
    if (errorCode(error, 'EEXIST')) {
      const existing = readRecord(root, record.id);
      if (sameRecord(existing, record)) return existing;
      fail(`record ${record.id} already exists with different metadata`);
    }
    throw error;
  }
}

export function readImageFragment(root: string, id: string): ImageFragmentRecord {
  return readRecord(root, imageFragmentRecordId(id));
}

export const persistedImageFragmentResolver: ImageFragmentResolver = {
  resolve(root: string, piece: ReferenceBoardImageFragmentPiece): ResolvedImageFragmentPiece {
    const record = readImageFragment(root, piece.referenceId);
    return { ...piece, imagePath: record.imagePath, provenance: record.provenance, transfer: record.transfer };
  },
};
