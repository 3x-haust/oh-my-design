import { createHash } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';

export class ReferenceTidyError extends Error {
  override readonly name = 'ReferenceTidyError';
  constructor(message: string) { super(`REFERENCE_TIDY: ${message}`); }
}
export type TidyFile = Readonly<{ path: string; sha256: string; bytes: Buffer }>;
export type TidyCandidate = TidyFile & Readonly<{ reason: string }>;
export const tidyHash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const tidyObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function readTidyFile(root: string, path: string): TidyFile {
  const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, path), label: path, fs: nodeStableProjectFileSystem() });
  return { path, bytes, sha256: tidyHash(bytes) };
}

/** Only known reference directories are inspected; unknown descendants remain untouched. */
export function tidyDirectory(root: string, directory: string): readonly string[] {
  const path = resolve(root, directory);
  let before;
  try { before = lstatSync(path); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  if (!before.isDirectory() || before.isSymbolicLink()) throw new ReferenceTidyError(`${directory} must be a regular directory without symlinks`);
  const files = readdirSync(path).sort();
  const after = lstatSync(path);
  if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
    throw new ReferenceTidyError(`${directory} changed during inspection`);
  }
  return files.map(name => `${directory}/${name}`);
}

export function tidyJson(file: TidyFile): unknown {
  try { return JSON.parse(file.bytes.toString('utf8')); }
  catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function requireTidyDigest(file: TidyFile, expected: string): void {
  if (file.sha256 !== expected) throw new ReferenceTidyError(`${file.path} digest changed`);
}
