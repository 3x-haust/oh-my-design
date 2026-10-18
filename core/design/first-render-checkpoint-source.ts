import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { pathsOutsideScope, type AdaptiveRouteRecord } from '../route/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { FirstRenderCaptureBinding } from './first-render-review-contract.ts';
import {
  checkpointDigest,
  checkpointRecord,
  checkpointText,
  exactCheckpointFields,
  failCheckpoint,
  parseCheckpointCaptures,
} from './first-render-checkpoint-common.ts';

export const FIRST_RENDER_CHECKPOINT_SCHEMA = 'first-render-source-checkpoint-v1' as const;
export const MAX_FIRST_RENDER_CHECKPOINT_BYTES = 16 * 1024 * 1024;

const EXCLUDED_SEGMENTS = new Set(['.git', '.omd', 'build', 'dist', 'node_modules']);

export type FirstRenderCheckpointFile = Readonly<{
  path: string;
  sha256: string;
  byteLength: number;
}>;

export type FirstRenderSourceCheckpoint = Readonly<{
  schema: typeof FIRST_RENDER_CHECKPOINT_SCHEMA;
  sourceContractSha256: string;
  routeSha256: string;
  reportSha256: string;
  captures: readonly FirstRenderCaptureBinding[];
  totalBytes: number;
  files: readonly FirstRenderCheckpointFile[];
}>;

export type FirstRenderSnapshotSource = Readonly<{
  totalBytes: number;
  files: readonly Readonly<FirstRenderCheckpointFile & { bytes: Buffer }>[];
}>;

const excludedPath = (path: string): boolean =>
  path.split('/').some(segment => EXCLUDED_SEGMENTS.has(segment));

function normalizeProjectPath(root: string, absolute: string): string {
  const path = relative(root, absolute).split(sep).join('/');
  if (!path || path.startsWith('../') || path.includes('\0') || path.includes('\\')
    || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    return failCheckpoint('source path escaped the project');
  }
  return path;
}

export function firstRenderSourcePathAllowed(route: AdaptiveRouteRecord, path: string): boolean {
  return !excludedPath(path) && pathsOutsideScope(route, [path]).length === 0;
}

function symlinkMayIntersectAllowedPaths(route: AdaptiveRouteRecord, path: string): boolean {
  return route.allowedPaths.some(pattern => {
    const wildcard = pattern.search(/[*?]/);
    const staticPrefix = (wildcard < 0 ? pattern : pattern.slice(0, wildcard)).replace(/\/+$/, '');
    if (!staticPrefix) return true;
    return path === staticPrefix || path.startsWith(`${staticPrefix}/`)
      || staticPrefix.startsWith(`${path}/`);
  });
}

export function firstRenderAllowedSourceFiles(root: string, route: AdaptiveRouteRecord): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const path = normalizeProjectPath(root, absolute);
      if (excludedPath(path)) continue;
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) {
        if (firstRenderSourcePathAllowed(route, path) || symlinkMayIntersectAllowedPaths(route, path)) {
          failCheckpoint(`allowed source path is a symbolic link: ${path}`);
        }
        continue;
      }
      if (metadata.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!metadata.isFile()) {
        if (firstRenderSourcePathAllowed(route, path)) {
          failCheckpoint(`allowed source path is not a regular file: ${path}`);
        }
        continue;
      }
      if (firstRenderSourcePathAllowed(route, path)) files.push(path);
    }
  };
  visit(root);
  return files;
}

export function collectFirstRenderSourceSnapshot(
  root: string,
  route: AdaptiveRouteRecord,
): FirstRenderSnapshotSource {
  let totalBytes = 0;
  const files = firstRenderAllowedSourceFiles(root, route).map(path => {
    const bytes = readFileSync(resolve(root, path));
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_FIRST_RENDER_CHECKPOINT_BYTES) {
      return failCheckpoint(`allowed source snapshot exceeds ${MAX_FIRST_RENDER_CHECKPOINT_BYTES} bytes`);
    }
    return { path, sha256: sha256(bytes), byteLength: bytes.byteLength, bytes };
  });
  return Object.freeze({ totalBytes, files: Object.freeze(files) });
}

export function assertFirstRenderSourceSnapshotCurrent(
  root: string,
  route: AdaptiveRouteRecord,
  expected: FirstRenderSnapshotSource,
): void {
  const current = collectFirstRenderSourceSnapshot(root, route);
  const projection = (snapshot: FirstRenderSnapshotSource) => ({
    totalBytes: snapshot.totalBytes,
    files: snapshot.files.map(({ bytes: _bytes, ...file }) => file),
  });
  if (canonicalJson(projection(current)) !== canonicalJson(projection(expected))) {
    failCheckpoint('allowed source changed during capture');
  }
}

export const firstRenderCheckpointPath = (checkpointSha256: string): string =>
  `.omd/first-render/checkpoints/${checkpointSha256}.json`;

export const firstRenderBlobPath = (blobSha256: string): string =>
  `.omd/first-render/source-blobs/${blobSha256}.bin`;

function parseCheckpoint(value: unknown): FirstRenderSourceCheckpoint {
  const row = checkpointRecord(value, 'source checkpoint');
  exactCheckpointFields(row,
    ['schema', 'sourceContractSha256', 'routeSha256', 'reportSha256', 'captures', 'totalBytes', 'files'],
    'source checkpoint');
  if (row.schema !== FIRST_RENDER_CHECKPOINT_SCHEMA) return failCheckpoint('source checkpoint schema is invalid');
  if (!Number.isSafeInteger(row.totalBytes) || (row.totalBytes as number) < 0
    || (row.totalBytes as number) > MAX_FIRST_RENDER_CHECKPOINT_BYTES) {
    return failCheckpoint('source checkpoint size is invalid');
  }
  if (!Array.isArray(row.files)) return failCheckpoint('source checkpoint files are invalid');
  const files = row.files.map((item): FirstRenderCheckpointFile => {
    const file = checkpointRecord(item, 'source checkpoint file');
    exactCheckpointFields(file, ['path', 'sha256', 'byteLength'], 'source checkpoint file');
    const path = checkpointText(file.path, 'source checkpoint path');
    if (!Number.isSafeInteger(file.byteLength) || (file.byteLength as number) < 0) {
      return failCheckpoint('source checkpoint file size is invalid');
    }
    return {
      path,
      sha256: checkpointDigest(file.sha256, 'source checkpoint file'),
      byteLength: file.byteLength as number,
    };
  });
  if (new Set(files.map(file => file.path)).size !== files.length
    || [...files].sort((left, right) => left.path.localeCompare(right.path))
      .some((file, index) => file.path !== files[index]?.path)
    || files.reduce((sum, file) => sum + file.byteLength, 0) !== row.totalBytes) {
    return failCheckpoint('source checkpoint file inventory is invalid');
  }
  return Object.freeze({
    schema: FIRST_RENDER_CHECKPOINT_SCHEMA,
    sourceContractSha256: checkpointDigest(row.sourceContractSha256, 'source checkpoint contract'),
    routeSha256: checkpointDigest(row.routeSha256, 'source checkpoint route'),
    reportSha256: checkpointDigest(row.reportSha256, 'source checkpoint report'),
    captures: parseCheckpointCaptures(row.captures),
    totalBytes: row.totalBytes as number,
    files: Object.freeze(files),
  });
}

export function readFirstRenderSourceCheckpoint(
  root: string,
  checkpointSha256: string,
): FirstRenderSourceCheckpoint {
  const bytes = readContainedRegularFile(root, firstRenderCheckpointPath(checkpointSha256),
    'first-render source checkpoint');
  if (sha256(bytes) !== checkpointSha256) return failCheckpoint('source checkpoint digest changed');
  return parseCheckpoint(JSON.parse(bytes.toString('utf8')));
}

export function writeFirstRenderSourceCheckpoint(input: Readonly<{
  sourceContractSha256: string;
  routeSha256: string;
  reportSha256: string;
  captures: readonly FirstRenderCaptureBinding[];
  source: FirstRenderSnapshotSource;
  writer: ProjectWriteAdapter;
}>): Readonly<{ checkpoint: FirstRenderSourceCheckpoint; checkpointSha256: string }> {
  const checkpoint: FirstRenderSourceCheckpoint = Object.freeze({
    schema: FIRST_RENDER_CHECKPOINT_SCHEMA,
    sourceContractSha256: checkpointDigest(input.sourceContractSha256, 'checkpoint contract'),
    routeSha256: checkpointDigest(input.routeSha256, 'checkpoint route'),
    reportSha256: checkpointDigest(input.reportSha256, 'checkpoint report'),
    captures: parseCheckpointCaptures(input.captures),
    totalBytes: input.source.totalBytes,
    files: Object.freeze(input.source.files.map(({ bytes: _bytes, ...file }) => file)),
  });
  const checkpointBytes = Buffer.from(canonicalJson(checkpoint));
  const checkpointSha256 = sha256(checkpointBytes);
  for (const file of input.source.files) {
    input.writer.writeContentAddressed(firstRenderBlobPath(file.sha256), file.bytes);
  }
  input.writer.writeContentAddressed(firstRenderCheckpointPath(checkpointSha256), checkpointBytes);
  return Object.freeze({ checkpoint, checkpointSha256 });
}

export function sourceCheckpointMatchesCurrent(
  root: string,
  route: AdaptiveRouteRecord,
  checkpoint: FirstRenderSourceCheckpoint,
): boolean {
  try {
    const current = collectFirstRenderSourceSnapshot(root, route);
    return canonicalJson(current.files.map(({ bytes: _bytes, ...file }) => file))
      === canonicalJson(checkpoint.files);
  } catch {
    return false;
  }
}

export function firstRenderSourceFileExists(root: string, path: string): boolean {
  return existsSync(resolve(root, path));
}
