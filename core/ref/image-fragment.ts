import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageFragmentProvenance, ImageFragmentResolver, ImageFragmentTransfer, ReferenceBoardImageFragmentPiece, ResolvedImageFragmentPiece } from './board-contract.ts';
import { ReferenceBoardResolutionError } from './board-contract.ts';
import { trustedReferenceDirectory, trustedReferenceImage } from './board-security.ts';
import { imageFragmentRecordId, parseImageFragmentInput, parseImageFragmentRecord } from './image-fragment-parser.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { ProjectWriteError, createProjectDirectory, writeImmutableProjectFile } from '../runtime/project-write.ts';

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
const errorCode = (error: unknown, code: string): boolean =>
  (error instanceof Error && 'code' in error && error.code === code)
  || (code === 'EEXIST' && error instanceof ProjectWriteError && error.reason.startsWith('immutable project artifact already exists: '));
const entryExists = (path: string): boolean => {
  try { lstatSync(path); return true; } catch (error) { if (errorCode(error, 'ENOENT')) return false; throw error; }
};

const ensureFragmentDirectory = (root: string, invocation: ProjectRunInvocation): string => {
  createProjectDirectory(root, FRAGMENT_DIRECTORY, invocation);
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

const writeImageIfMissing = (root: string, record: ImageFragmentRecord, bytes: Buffer, invocation: ProjectRunInvocation): boolean => {
  const directory = trustedReferenceDirectory(root, FRAGMENT_DIRECTORY);
  const path = join(directory, `${record.sha256}.png`);
  if (entryExists(path)) { validateExistingImage(root, record, bytes); return false; }
  try {
    writeImmutableProjectFile({ projectRoot: root, relativePath: record.imagePath, content: bytes, invocation });
    return true;
  } catch (error) {
    if (!errorCode(error, 'EEXIST')) throw error;
    validateExistingImage(root, record, bytes);
    return false;
  }
};

export function persistImageFragment(root: string, value: unknown, invocation: ProjectRunInvocation): ImageFragmentRecord {
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
  const directory = ensureFragmentDirectory(root, invocation);
  const target = recordPath(directory, record.id);
  if (entryExists(target)) {
    const existing = readRecord(root, record.id);
    if (!sameRecord(existing, record)) fail(`record ${record.id} already exists with different metadata`);
    return existing;
  }
  writeImageIfMissing(root, record, bytes, invocation);
  try {
    writeImmutableProjectFile({
      projectRoot: root,
      relativePath: `${FRAGMENT_DIRECTORY}/${record.id}.json`,
      content: `${JSON.stringify(record, null, 2)}\n`,
      invocation,
    });
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
