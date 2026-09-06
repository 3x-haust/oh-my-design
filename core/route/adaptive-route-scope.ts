import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readlinkSync, readdirSync, realpathSync, type Stats } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { AdaptiveRouteRecord } from './adaptive-flow-domain.ts';
import { canonicalRouteJson } from './adaptive-source-contract.ts';

export const ADAPTIVE_ROUTE_SCOPE_EVIDENCE_SCHEMA = 'adaptive-route-scope-evidence-v1' as const;
export const ADAPTIVE_ROUTE_SCOPE_POINTER_SCHEMA = 'adaptive-route-scope-pointer-v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const MISSING_SHA256 = '0'.repeat(64);
const RECORD = /^route-scope-records\/sha256-([a-f0-9]{64})\.json$/;
const fs = nodeStableProjectFileSystem();

type ScopeEntry = Readonly<{ path: string; sha256: string; mode: number }>;
type ScopeEvidence = Readonly<{
  schema: typeof ADAPTIVE_ROUTE_SCOPE_EVIDENCE_SCHEMA;
  verification: 'git' | 'filesystem';
  projectRoot: string;
  invocation: Readonly<{ buildSha256: string; loadedSkillSha256: string; briefSha256: string }>;
  routeSha256: string;
  baseline: readonly ScopeEntry[];
}>;
type ScopePointer = Readonly<{ schema: typeof ADAPTIVE_ROUTE_SCOPE_POINTER_SCHEMA; record: string; sha256: string }>;

export class AdaptiveRouteScopeError extends Error {
  override readonly name = 'AdaptiveRouteScopeError';
}

function fail(message: string): never { throw new AdaptiveRouteScopeError(message); }
function hash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Reflect.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every((key) => typeof key === 'string' && keys.includes(key));
}
function canonicalRoot(input: string): string {
  try {
    const requested = resolve(input);
    const stat = lstatSync(requested);
    const canonical = realpathSync(requested);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail('project root is not a canonical real directory');
    return canonical;
  } catch (error) {
    if (error instanceof AdaptiveRouteScopeError) throw error;
    return fail('project root is not a canonical real directory');
  }
}
function safeRelativePath(value: unknown): string {
  if (typeof value !== 'string' || value === '' || value.includes('\0') || value.includes('\\') || isAbsolute(value)) return fail('scope evidence contains an unsafe path');
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..') || resolve('/', value) !== `/${value}`) return fail('scope evidence contains an unsafe path');
  return value;
}
function sameDirectory(left: Stats, right: Stats): boolean {
  return left.isDirectory() && right.isDirectory() && !left.isSymbolicLink() && !right.isSymbolicLink()
    && left.dev === right.dev && left.ino === right.ino && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}
function projectPath(root: string, path: string): string {
  const absolute = resolve(root, ...path.split('/'));
  const outside = relative(root, absolute);
  if (outside === '' || outside === '..' || outside.startsWith(`..${sep}`) || isAbsolute(outside)) return fail('scope scan escaped the project root');
  return absolute;
}

/** Captures regular project files without following links; OMD's own audit tree is scope-exempt. */
function filesystemSnapshot(rootInput: string): readonly ScopeEntry[] {
  const root = canonicalRoot(rootInput);
  const entries: ScopeEntry[] = [];
  const walk = (directory: string, relativeDirectory: string): void => {
    const before = lstatSync(directory);
    if (!before.isDirectory() || before.isSymbolicLink()) return fail('scope scan encountered a symlink or non-directory ancestor');
    const names = readdirSync(directory).sort((left, right) => left.localeCompare(right, 'en'));
    for (const name of names) {
      if (relativeDirectory === ''
        && name === '.omd') continue;
      if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) return fail('scope scan encountered an unsafe directory entry');
      const path = relativeDirectory === '' ? name : `${relativeDirectory}/${name}`;
      const absolute = projectPath(root, path);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) return fail(`scope scan cannot verify symlink path: ${path}`);
      if (stat.isDirectory()) walk(absolute, path);
      else if (stat.isFile()) {
        const bytes = readStableProjectFile({ root, path: absolute, label: `route scope file ${path}`, fs });
        entries.push(Object.freeze({ path, sha256: hash(bytes), mode: stat.mode & 0o7777 }));
      } else return fail(`scope scan cannot verify special path: ${path}`);
    }
    const afterNames = readdirSync(directory).sort((left, right) => left.localeCompare(right, 'en'));
    const after = lstatSync(directory);
    if (names.length !== afterNames.length || names.some((name, index) => name !== afterNames[index]) || !sameDirectory(before, after)) {
      return fail('project changed while route scope evidence was captured');
    }
  };
  walk(root, '');
  return Object.freeze(entries.sort((left, right) => left.path.localeCompare(right.path, 'en')));
}

function exactGitRoot(root: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return false;
  try { return canonicalRoot(result.stdout.trim()) === root; } catch { return false; }
}
function gitDirtyPaths(root: string): readonly string[] {
  if (!exactGitRoot(root)) return fail('the route was published for Git verification, but the canonical project Git root is unavailable');
  const status = spawnSync('git', ['status', '--porcelain=1', '-z', '-uall'], { cwd: root, encoding: 'utf8' });
  if (status.status !== 0) return fail('git status failed, so changed paths cannot be read');
  const fields = status.stdout.split('\0');
  const paths = new Set<string>();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    if (field === '') continue;
    if (field.length < 4 || field[2] !== ' ') return fail('git status returned a malformed path record');
    const code = field.slice(0, 2);
    paths.add(safeRelativePath(field.slice(3)));
    if (code.includes('R') || code.includes('C')) {
      const source = fields[index + 1];
      if (source === undefined || source === '') return fail('git status returned a malformed rename record');
      paths.add(safeRelativePath(source));
      index += 1;
    }
  }
  return Object.freeze([...paths].sort((left, right) => left.localeCompare(right, 'en')));
}
function gitScopeEntry(root: string, path: string): ScopeEntry {
  const absolute = projectPath(root, path);
  let stat: Stats;
  try { stat = lstatSync(absolute); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return Object.freeze({ path, sha256: MISSING_SHA256, mode: 0 });
    }
    return fail(`route scope file ${path} is unreadable`);
  }
  if (stat.isSymbolicLink()) {
    return Object.freeze({
      path,
      sha256: hash(Buffer.from(`symlink\0${readlinkSync(absolute)}`)),
      mode: stat.mode & 0o7777,
    });
  }
  if (!stat.isFile()) return fail(`scope scan cannot verify special Git path: ${path}`);
  const bytes = readStableProjectFile({ root, path: absolute, label: `route scope file ${path}`, fs });
  return Object.freeze({ path, sha256: hash(bytes), mode: stat.mode & 0o7777 });
}
function gitScopeSnapshot(root: string): readonly ScopeEntry[] {
  return Object.freeze(gitDirtyPaths(root).map((path) => gitScopeEntry(root, path)));
}
function identity(invocation: ProjectRunInvocation): ScopeEvidence['invocation'] {
  return Object.freeze({
    buildSha256: invocation.current.buildSha256,
    loadedSkillSha256: invocation.current.loadedSkillSha256,
    briefSha256: invocation.current.briefSha256,
  });
}
function evidenceBytes(evidence: ScopeEvidence): Buffer { return Buffer.from(`${canonicalRouteJson(evidence)}\n`); }

export function publishAdaptiveRouteScopeEvidence(
  rootInput: string,
  routeSha256: string,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
): void {
  const root = canonicalRoot(rootInput);
  const git = exactGitRoot(root);
  const evidence: ScopeEvidence = Object.freeze({
    schema: ADAPTIVE_ROUTE_SCOPE_EVIDENCE_SCHEMA,
    verification: git ? 'git' : 'filesystem',
    projectRoot: root,
    invocation: identity(invocation),
    routeSha256,
    baseline: git ? gitScopeSnapshot(root) : filesystemSnapshot(root),
  });
  const bytes = evidenceBytes(evidence);
  const sha256 = hash(bytes);
  const record = `route-scope-records/sha256-${sha256}.json`;
  writer.writeContentAddressed(`.omd/${record}`, bytes);
  writer.write('.omd/route-scope.json', `${canonicalRouteJson({
    schema: ADAPTIVE_ROUTE_SCOPE_POINTER_SCHEMA, record, sha256,
  })}\n`);
}

function parsePointer(bytes: Buffer): ScopePointer {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return fail('route scope pointer is malformed'); }
  if (!exact(value, ['schema', 'record', 'sha256']) || value.schema !== ADAPTIVE_ROUTE_SCOPE_POINTER_SCHEMA
    || typeof value.record !== 'string' || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)) return fail('route scope pointer is malformed');
  const match = RECORD.exec(value.record);
  if (match === null || match[1] !== value.sha256) return fail('route scope pointer is malformed');
  return Object.freeze({ schema: ADAPTIVE_ROUTE_SCOPE_POINTER_SCHEMA, record: value.record, sha256: value.sha256 });
}
function parseEvidence(bytes: Buffer): ScopeEvidence {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return fail('route scope evidence is malformed'); }
  if (!exact(value, ['schema', 'verification', 'projectRoot', 'invocation', 'routeSha256', 'baseline'])
    || value.schema !== ADAPTIVE_ROUTE_SCOPE_EVIDENCE_SCHEMA
    || (value.verification !== 'git' && value.verification !== 'filesystem')
    || typeof value.projectRoot !== 'string' || typeof value.routeSha256 !== 'string' || !SHA256.test(value.routeSha256)
    || !exact(value.invocation, ['buildSha256', 'loadedSkillSha256', 'briefSha256'])
    || ![value.invocation.buildSha256, value.invocation.loadedSkillSha256, value.invocation.briefSha256].every((item) => typeof item === 'string' && SHA256.test(item))
    || !Array.isArray(value.baseline)) return fail('route scope evidence is malformed');
  const baseline = value.baseline.map((entry): ScopeEntry => {
    if (!exact(entry, ['path', 'sha256', 'mode']) || typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)
      || !Number.isSafeInteger(entry.mode) || Number(entry.mode) < 0 || Number(entry.mode) > 0o7777) return fail('route scope evidence is malformed');
    return Object.freeze({ path: safeRelativePath(entry.path), sha256: entry.sha256, mode: Number(entry.mode) });
  });
  if (baseline.some((entry, index) => index > 0
    && baseline[index - 1]!.path.localeCompare(entry.path, 'en') >= 0)) return fail('route scope evidence is malformed');
  return Object.freeze({
    schema: ADAPTIVE_ROUTE_SCOPE_EVIDENCE_SCHEMA,
    verification: value.verification,
    projectRoot: value.projectRoot,
    invocation: Object.freeze({
      buildSha256: value.invocation.buildSha256 as string,
      loadedSkillSha256: value.invocation.loadedSkillSha256 as string,
      briefSha256: value.invocation.briefSha256 as string,
    }),
    routeSha256: value.routeSha256,
    baseline: Object.freeze(baseline),
  });
}
function readEvidence(root: string): ScopeEvidence {
  const pointerBytes = readStableProjectFile({ root, path: resolve(root, '.omd', 'route-scope.json'), label: 'adaptive route scope pointer', fs });
  const pointer = parsePointer(pointerBytes);
  const bytes = readStableProjectFile({ root, path: resolve(root, '.omd', pointer.record), label: 'adaptive route scope evidence', fs });
  if (hash(bytes) !== pointer.sha256) return fail('route scope evidence digest does not match its pointer');
  const evidence = parseEvidence(bytes);
  if (!bytes.equals(evidenceBytes(evidence))) return fail('route scope evidence is not canonical');
  return evidence;
}
function sameInvocation(evidence: ScopeEvidence, invocation: ProjectRunInvocation): boolean {
  return evidence.invocation.buildSha256 === invocation.current.buildSha256
    && evidence.invocation.loadedSkillSha256 === invocation.current.loadedSkillSha256
    && evidence.invocation.briefSha256 === invocation.current.briefSha256;
}
function gitChangedPaths(root: string, baselineEntries: readonly ScopeEntry[]): readonly string[] {
  const baseline = new Map(baselineEntries.map((entry) => [entry.path, entry]));
  const currentEntries = gitScopeSnapshot(root);
  const current = new Map(currentEntries.map((entry) => [entry.path, entry]));
  const changed = new Set<string>();
  for (const [path, entry] of current) {
    const previous = baseline.get(path);
    if (previous === undefined || previous.sha256 !== entry.sha256 || previous.mode !== entry.mode) changed.add(path);
  }
  for (const path of baseline.keys()) if (!current.has(path)) changed.add(path);
  return Object.freeze([...changed].sort((left, right) => left.localeCompare(right, 'en')));
}

export function changedPathsForAdaptiveRoute(
  rootInput: string,
  record: AdaptiveRouteRecord,
  routeSha256: string,
  invocation: ProjectRunInvocation,
): readonly string[] {
  const root = canonicalRoot(rootInput);
  if (hash(Buffer.from(`${canonicalRouteJson(record)}\n`)) !== routeSha256) return fail('route scope check received a mismatched route digest');
  const evidence = readEvidence(root);
  if (evidence.projectRoot !== root || evidence.routeSha256 !== routeSha256 || !sameInvocation(evidence, invocation)) {
    return fail('route scope evidence is stale or belongs to another project or invocation');
  }
  if (evidence.verification === 'git') return gitChangedPaths(root, evidence.baseline);
  const baseline = new Map(evidence.baseline.map((entry) => [entry.path, entry]));
  const current = new Map(filesystemSnapshot(root).map((entry) => [entry.path, entry]));
  const changed = new Set<string>();
  for (const [path, entry] of current) {
    const previous = baseline.get(path);
    if (previous === undefined || previous.sha256 !== entry.sha256 || previous.mode !== entry.mode) changed.add(path);
  }
  for (const path of baseline.keys()) if (!current.has(path)) changed.add(path);
  return Object.freeze([...changed].sort((left, right) => left.localeCompare(right, 'en')));
}
