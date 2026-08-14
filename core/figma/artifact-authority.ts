import { randomUUID } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { requireProjectWriteAdapter } from '../runtime/project-write.ts';
import { figmaArtifactMatchesReceipt } from './artifact-lifecycle.ts';
import {
  canonicalFigmaProjectRoot, readFigmaAuthorityFiles, removeFigmaAuthorityFile, sameFigmaFile,
  stableFigmaFile, writeFigmaAuthorityFile, type AuthorityFile, type FileIdentity, type StableFile,
} from './artifact-authority-store.ts';

const SCHEMA = 'omd-figma-artifact-authority-v1';
type ArtifactKind = 'export' | 'render';
type JsonObject = Record<string, unknown>;
type ProjectIdentity = Readonly<{ path: string; device: number; inode: number; birthtimeMs: number }>;
type AuthorityRecord = Readonly<{
  schema: typeof SCHEMA; id: string; sessionId: string; phase: 'active' | 'deleting';
  project: ProjectIdentity; kind: ArtifactKind; frameId: string; safeId: string;
  snapshotSha256: string; png: FileIdentity; receipt: FileIdentity; createdAt: number;
}>;
type Session = Readonly<{ readonly id: string }>;
type SessionState = Readonly<{ root: string; adapter: ProjectWriteAdapter }>;
type Inspection = Readonly<{
  authority: AuthorityFile; record: AuthorityRecord; png: StableFile; receipt: StableFile;
  cited: boolean; stale: boolean; validPair: boolean;
}>;
export type FigmaAuthorityCleanupEntry = Readonly<{ path: string; bytes: number }>;

const sessions = new WeakMap<Session, SessionState>();
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function isObject(value: unknown): value is JsonObject { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const object = (value: unknown): JsonObject | undefined => isObject(value) ? value : undefined;
const exact = (value: JsonObject, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const safeId = (frameId: string): string => frameId.replaceAll(/[:/]/g, '_');

function identity(value: unknown): FileIdentity | undefined {
  const item = object(value);
  if (item === undefined || !exact(item, ['path', 'device', 'inode', 'birthtimeMs', 'size', 'sha256'])
    || typeof item.path !== 'string' || !isFiniteNumber(item.device) || !isFiniteNumber(item.inode)
    || !isFiniteNumber(item.birthtimeMs) || !isFiniteNumber(item.size)
    || typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)) return undefined;
  return { path: item.path, device: item.device, inode: item.inode, birthtimeMs: item.birthtimeMs, size: item.size, sha256: item.sha256 };
}
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isSafeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }
function parseAuthority(file: AuthorityFile): AuthorityRecord | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(file.bytes.toString('utf8')); } catch { return undefined; }
  const value = object(parsed); const project = value === undefined ? undefined : object(value.project);
  const png = value === undefined ? undefined : identity(value.png); const receipt = value === undefined ? undefined : identity(value.receipt);
  if (value === undefined || project === undefined || png === undefined || receipt === undefined
    || !exact(value, ['schema', 'id', 'sessionId', 'phase', 'project', 'kind', 'frameId', 'safeId', 'snapshotSha256', 'png', 'receipt', 'createdAt'])
    || !exact(project, ['path', 'device', 'inode', 'birthtimeMs']) || value.schema !== SCHEMA
    || typeof value.id !== 'string' || !UUID.test(value.id) || file.name !== `${value.id}.json`
    || typeof value.sessionId !== 'string' || !UUID.test(value.sessionId)
    || (value.phase !== 'active' && value.phase !== 'deleting')
    || (value.kind !== 'export' && value.kind !== 'render') || typeof value.frameId !== 'string'
    || value.safeId !== safeId(value.frameId) || typeof value.snapshotSha256 !== 'string' || !SHA256.test(value.snapshotSha256)
    || !isSafeInteger(value.createdAt) || typeof project.path !== 'string'
    || !isFiniteNumber(project.device) || !isFiniteNumber(project.inode) || !isFiniteNumber(project.birthtimeMs)
    || !file.bytes.equals(Buffer.from(`${JSON.stringify(parsed)}\n`, 'utf8'))) return undefined;
  return {
    schema: SCHEMA, id: value.id, sessionId: value.sessionId, phase: value.phase,
    project: { path: project.path, device: project.device, inode: project.inode, birthtimeMs: project.birthtimeMs },
    kind: value.kind, frameId: value.frameId, safeId: value.safeId,
    snapshotSha256: value.snapshotSha256, png, receipt, createdAt: value.createdAt,
  };
}
function projectIdentity(root: string): ProjectIdentity {
  const path = canonicalFigmaProjectRoot(root); const stats = lstatSync(path);
  return { path, device: stats.dev, inode: stats.ino, birthtimeMs: stats.birthtimeMs };
}
function sameProject(left: ProjectIdentity, right: ProjectIdentity): boolean {
  return left.path === right.path && left.device === right.device && left.inode === right.inode && left.birthtimeMs === right.birthtimeMs;
}
function exactArtifactPath(root: string, kind: ArtifactKind, frameId: string, pngPath: string): string {
  const project = canonicalFigmaProjectRoot(root);
  const expected = join(project, '.omd', 'figma', kind === 'export' ? 'exports' : 'renders', `${safeId(frameId)}.png`);
  const candidate = join(realpathSync(dirname(resolve(pngPath))), basename(pngPath));
  if (candidate !== expected) throw new Error('Figma artifact path does not match its kind and frame ID');
  for (const path of [join(project, '.omd'), join(project, '.omd', 'figma'), join(project, '.omd', 'figma', kind === 'export' ? 'exports' : 'renders')]) {
    const stats = lstatSync(path); if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Figma artifact ancestors must be real directories');
  }
  return expected;
}
function snapshotFrames(bytes: Uint8Array): ReadonlySet<string> | undefined {
  let parsed: unknown; try { parsed = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return undefined; }
  const snapshot = object(parsed); if (snapshot === undefined || !Array.isArray(snapshot.pages)) return undefined;
  const ids = new Set<string>(); const safeIds = new Set<string>();
  for (const pageValue of snapshot.pages) {
    const page = object(pageValue); if (page === undefined || !Array.isArray(page.frames)) return undefined;
    for (const frameValue of page.frames) {
      const frame = object(frameValue); if (frame === undefined || typeof frame.id !== 'string') return undefined;
      const normalized = safeId(frame.id); if (safeIds.has(normalized)) return undefined;
      ids.add(frame.id); safeIds.add(normalized);
    }
  }
  return ids;
}
function authorityBytes(record: AuthorityRecord): Buffer { return Buffer.from(`${JSON.stringify(record)}\n`, 'utf8'); }

export function createFigmaArtifactAuthoritySession(root: string, adapter: ProjectWriteAdapter): Session {
  const canonical = canonicalFigmaProjectRoot(root); requireProjectWriteAdapter(canonical, adapter);
  const session = Object.freeze({ id: randomUUID() }); sessions.set(session, { root: canonical, adapter }); return session;
}
export function authorizeFigmaArtifact(
  session: Session,
  input: Readonly<{ kind: ArtifactKind; frameId: string; pngPath: string; snapshotBytes: Uint8Array }>,
): string {
  const state = sessions.get(session); if (state === undefined) throw new Error('trusted Figma artifact authority session is required');
  requireProjectWriteAdapter(state.root, state.adapter);
  const pngPath = exactArtifactPath(state.root, input.kind, input.frameId, input.pngPath);
  const frames = snapshotFrames(input.snapshotBytes); if (frames === undefined || !frames.has(input.frameId)) throw new Error('Figma artifact must bind an unambiguous current snapshot frame');
  const png = stableFigmaFile(pngPath); const receipt = stableFigmaFile(`${pngPath}.omd.json`);
  if (png.state !== 'file' || receipt.state !== 'file'
    || !figmaArtifactMatchesReceipt(pngPath, input.kind, input.snapshotBytes)) throw new Error('Figma artifact and receipt must be stable current product outputs');
  const project = projectIdentity(state.root); const id = randomUUID();
  const record: AuthorityRecord = {
    schema: SCHEMA, id, sessionId: session.id, phase: 'active', project,
    kind: input.kind, frameId: input.frameId, safeId: safeId(input.frameId),
    snapshotSha256: pngReceiptSnapshot(receipt.bytes), png: png.identity, receipt: receipt.identity, createdAt: Date.now(),
  };
  return writeFigmaAuthorityFile(state.root, id, authorityBytes(record));
}
function pngReceiptSnapshot(bytes: Buffer): string {
  let parsed: unknown; try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Figma artifact receipt is malformed'); }
  const value = object(parsed); const snapshot = value?.snapshotSha256;
  if (typeof snapshot !== 'string' || !SHA256.test(snapshot)) throw new Error('Figma artifact receipt snapshot digest is invalid');
  return snapshot;
}
function inspect(root: string, citedPaths: ReadonlySet<string>): readonly Inspection[] {
  const project = projectIdentity(root); const snapshot = stableFigmaFile(join(project.path, '.omd', 'figma', 'snapshot.json'));
  const frames = snapshot.state === 'file' ? snapshotFrames(snapshot.bytes) : undefined;
  return readFigmaAuthorityFiles(root).flatMap((authority): readonly Inspection[] => {
    const record = parseAuthority(authority); if (record === undefined || !sameProject(record.project, project)) return [];
    const png = stableFigmaFile(record.png.path); const receipt = stableFigmaFile(record.receipt.path);
    const path = relative(join(project.path, '.omd'), record.png.path).split('\\').join('/');
    const validPair = sameFigmaFile(png, record.png) && sameFigmaFile(receipt, record.receipt);
    const cited = citedPaths.has(path) || citedPaths.has(`${path}.omd.json`);
    const stale = frames !== undefined && snapshot.state === 'file'
      && (snapshot.identity.sha256 !== record.snapshotSha256 || !frames.has(record.frameId));
    return [{ authority, record, png, receipt, cited, stale, validPair }];
  });
}
export function authorizedFigmaCleanupEntries(root: string, citedPaths: ReadonlySet<string>): readonly FigmaAuthorityCleanupEntry[] {
  return inspect(root, citedPaths).flatMap((item): readonly FigmaAuthorityCleanupEntry[] => {
    if (item.cited) return [];
    if (item.record.phase === 'active' && (!item.stale || !item.validPair)) return [];
    return [
      ...(sameFigmaFile(item.png, item.record.png) ? [{ path: relative(join(item.record.project.path, '.omd'), item.record.png.path).split('\\').join('/'), bytes: item.record.png.size }] : []),
      ...(sameFigmaFile(item.receipt, item.record.receipt) ? [{ path: relative(join(item.record.project.path, '.omd'), item.record.receipt.path).split('\\').join('/'), bytes: item.record.receipt.size }] : []),
    ];
  });
}
export function applyAuthorizedFigmaCleanup(root: string, adapter: ProjectWriteAdapter, citedPaths: ReadonlySet<string>): readonly string[] {
  const canonical = canonicalFigmaProjectRoot(root); requireProjectWriteAdapter(canonical, adapter); const removed: string[] = [];
  for (const item of inspect(canonical, citedPaths)) {
    if (item.cited) continue;
    if (item.record.phase === 'active' && !item.validPair) { removeFigmaAuthorityFile(canonical, item.authority.path); continue; }
    if (item.record.phase === 'active' && !item.stale) continue;
    const deleting: AuthorityRecord = item.record.phase === 'deleting' ? item.record : { ...item.record, phase: 'deleting' };
    if (item.record.phase === 'active') writeFigmaAuthorityFile(canonical, deleting.id, authorityBytes(deleting));
    for (const identity of [deleting.png, deleting.receipt]) {
      if (!sameFigmaFile(stableFigmaFile(identity.path), identity)) continue;
      const path = relative(join(canonical, '.omd'), identity.path).split('\\').join('/'); adapter.remove(join('.omd', path)); removed.push(path);
    }
    removeFigmaAuthorityFile(canonical, item.authority.path);
  }
  return removed;
}
