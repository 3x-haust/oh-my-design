import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readReferenceBoardArtifacts, sha256 } from './board-artifacts.ts';

export const REFERENCE_SELECTION_SCHEMA_VERSION = 'reference-selection-v1';

export type ReferenceSelection = {
  readonly schemaVersion: typeof REFERENCE_SELECTION_SCHEMA_VERSION;
  readonly boardSha256: string;
  readonly assemblySha256: string;
  readonly candidateId: string;
};

export class ReferenceSelectionValidationError extends Error {
  override readonly name = 'ReferenceSelectionValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`reference selection is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new ReferenceSelectionValidationError(reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const selectionPath = (root: string): string => join(root, '.omd', 'reference-selection.json');
const sha = (value: unknown, label: string): string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : fail(`${label} must be 64 lowercase hexadecimal characters`);

export function parseReferenceSelection(value: unknown): ReferenceSelection {
  if (!isRecord(value)) return fail('record must be an object');
  const keys = Object.keys(value).sort(); const expected = ['assemblySha256', 'boardSha256', 'candidateId', 'schemaVersion'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail('record has unknown or missing keys');
  if (value['schemaVersion'] !== REFERENCE_SELECTION_SCHEMA_VERSION) fail(`schemaVersion must be ${REFERENCE_SELECTION_SCHEMA_VERSION}`);
  const candidateId = value['candidateId'];
  if (typeof candidateId !== 'string' || candidateId.trim() === '') return fail('candidateId must be a non-empty string');
  return { schemaVersion: REFERENCE_SELECTION_SCHEMA_VERSION, boardSha256: sha(value['boardSha256'], 'boardSha256'), assemblySha256: sha(value['assemblySha256'], 'assemblySha256'), candidateId };
}

export function readReferenceSelection(root: string): ReferenceSelection {
  try {
    const parsed: unknown = JSON.parse(readFileSync(selectionPath(root), 'utf8'));
    return parseReferenceSelection(parsed);
  } catch (error) {
    if (error instanceof ReferenceSelectionValidationError) throw error;
    return fail('record is missing or invalid JSON');
  }
}

export function validateReferenceSelection(root: string, manifestPath?: string): ReferenceSelection {
  const selection = readReferenceSelection(root); const artifacts = readReferenceBoardArtifacts(root, manifestPath === undefined ? undefined : resolve(root, manifestPath));
  if (selection.boardSha256 !== sha256(artifacts.boardBytes)) fail('board hash does not match the current validated board');
  if (selection.assemblySha256 !== sha256(artifacts.assemblyBytes)) fail('assembly hash does not match the current sanitized assembly');
  if (!artifacts.assembly.candidates.some((candidate) => candidate.id === selection.candidateId)) fail('candidateId does not exist in the current assembly');
  return selection;
}

const writeAtomically = (path: string, body: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, body, { flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
};

export function selectReferenceCandidate(root: string, candidateId: string): ReferenceSelection {
  const artifacts = readReferenceBoardArtifacts(root);
  if (!artifacts.assembly.candidates.some((candidate) => candidate.id === candidateId)) fail('candidateId does not exist in the current assembly');
  const selection: ReferenceSelection = {
    schemaVersion: REFERENCE_SELECTION_SCHEMA_VERSION,
    boardSha256: sha256(artifacts.boardBytes),
    assemblySha256: sha256(artifacts.assemblyBytes),
    candidateId,
  };
  writeAtomically(selectionPath(root), `${JSON.stringify(selection)}\n`);
  return selection;
}

export const referenceSelectionExists = (root: string): boolean => existsSync(selectionPath(root));
