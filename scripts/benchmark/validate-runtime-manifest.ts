import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, repoPath, sha256, validateRepoPath, type JsonValue } from './contracts.ts';

type RecordValue = Record<string, unknown>;
export interface RuntimeManifestPaths {
  membership?: string;
  runtime: string;
  binding?: string;
  lock?: string;
  sourceFinalization?: string;
}

const digest = /^[0-9a-f]{64}$/;
const absolute = /^\/[^\0]+$/;
const ambientHomePath = /^\/(?:Users|home)\/[^/]+(?:\/(?:\.(?:codex|claude|config|cache)|Library(?:\/(?:Caches|Application Support|Keychains|Preferences))?)(?:\/|$)|\/?$)/;
const environmentName = /^[A-Z][A-Z0-9_]*$/;
const forbiddenText = /(?:placeholder|todo|tbd|example|null|unknown|synthetic)/i;
const forbiddenRuntimeKeys = /(?:^after|receipt|review|approve|bundleLock|manifest(?:Sha256|Hash)|condition|synthetic|capability|bytes)/i;

function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as RecordValue;
}
function exactKeys(value: RecordValue, required: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unknown or missing fields`);
}
function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || forbiddenText.test(value)) throw new Error(`${label} must be concrete`);
}
function hash(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !digest.test(value) || /^0+$/.test(value)) throw new Error(`${label} must be a concrete sha256`);
}
function path(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${label} must be a repository path`);
  try { validateRepoPath(value); } catch { throw new Error(`${label} must be a repository path`); }
}
function absolutePath(value: unknown, label: string): void {
  if (typeof value !== 'string' || !absolute.test(value) || ambientHomePath.test(value)) throw new Error(`${label} must be an absolute non-shared-home path`);
}
function noForbidden(value: unknown, label: string): void {
  if (typeof value === 'string') { if (forbiddenText.test(value)) throw new Error(`${label} contains a placeholder`); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => noForbidden(item, `${label}[${index}]`)); return; }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenRuntimeKeys.test(key)) throw new Error(`${label} contains forbidden identity field: ${key}`);
      noForbidden(child, `${label}.${key}`);
    }
  }
}
function binary(value: unknown, label: string): void {
  const item = object(value, label); exactKeys(item, ['path', 'sha256'], label);
  absolutePath(item.path, `${label}.path`); hash(item.sha256, `${label}.sha256`);
}
function readJson(root: string, declared: string): { value: unknown; raw: Buffer } {
  const file = repoPath(root, declared);
  const raw = readFileSync(file);
  return { value: JSON.parse(raw.toString('utf8')), raw };
}

export function validateMembership(value: unknown): void {
  const membership = object(value, 'membership');
  exactKeys(membership, ['schemaVersion', 'externalFiles', 'roots', 'exclusions', 'lockOutputPath', 'requiredPaths', 'artifacts'], 'membership');
  if (membership.schemaVersion !== 'bundle-membership-v1') throw new Error('invalid membership schema version');
  for (const field of ['externalFiles', 'roots', 'requiredPaths', 'artifacts', 'exclusions'] as const) if (!Array.isArray(membership[field])) throw new Error(`membership.${field} must be an array`);
  for (const item of [...membership.externalFiles as unknown[], ...membership.roots as unknown[], ...membership.requiredPaths as unknown[]]) path(item, 'membership path');
  path(membership.lockOutputPath, 'membership.lockOutputPath');
  for (const item of membership.exclusions as unknown[]) { const entry = object(item, 'membership exclusion'); exactKeys(entry, ['path', 'kind'], 'membership exclusion'); path(entry.path, 'membership exclusion path'); if (entry.kind !== 'file' && entry.kind !== 'directory') throw new Error('membership exclusion kind'); }
  for (const item of membership.artifacts as unknown[]) { const entry = object(item, 'membership artifact'); exactKeys(entry, ['path', 'class'], 'membership artifact'); path(entry.path, 'membership artifact path'); if (!['static-instance', 'schema', 'vector', 'docs', 'source', 'raw-evidence'].includes(entry.class as string)) throw new Error('membership artifact class'); }
}

export function validateRuntimeEnvironment(value: unknown): void {
  const runtime = object(value, 'runtime');
  exactKeys(runtime, ['schemaVersion', 'provider', 'model', 'reasoning', 'config', 'node', 'codex', 'packageManager', 'browser', 'controller', 'omdPathShim', 'locale', 'timezone', 'environmentAllowlist', 'secretEnvironment', 'roots'], 'runtime');
  if (runtime.schemaVersion !== 'runtime-environment-v1') throw new Error('invalid runtime schema version');
  noForbidden(runtime, 'runtime');
  for (const field of ['provider', 'model', 'reasoning', 'locale', 'timezone'] as const) text(runtime[field], `runtime.${field}`);
  const config = object(runtime.config, 'runtime.config'); if (!Object.keys(config).length || Object.values(config).some(item => !['string', 'number', 'boolean'].includes(typeof item) || item === null)) throw new Error('runtime.config must be concrete scalar values');
  for (const field of ['node', 'codex', 'packageManager', 'browser'] as const) binary(runtime[field], `runtime.${field}`);
  const controller = object(runtime.controller, 'runtime.controller'); exactKeys(controller, ['contentTreeSha256', 'excludedManifestPaths'], 'runtime.controller'); hash(controller.contentTreeSha256, 'runtime.controller.contentTreeSha256'); if (!Array.isArray(controller.excludedManifestPaths) || !controller.excludedManifestPaths.length) throw new Error('runtime.controller.excludedManifestPaths'); for (const item of controller.excludedManifestPaths) path(item, 'runtime controller exclusion');
  const shim = object(runtime.omdPathShim, 'runtime.omdPathShim'); exactKeys(shim, ['path', 'targetPath', 'commitSha256', 'worktreeSha256', 'packSha256'], 'runtime.omdPathShim'); absolutePath(shim.path, 'runtime.omdPathShim.path'); absolutePath(shim.targetPath, 'runtime.omdPathShim.targetPath'); if (!(shim.targetPath as string).endsWith('/bin/omd.ts')) throw new Error('runtime.omdPathShim target is not commit-local omd'); for (const field of ['commitSha256', 'worktreeSha256', 'packSha256'] as const) hash(shim[field], `runtime.omdPathShim.${field}`);
  if (!Array.isArray(runtime.environmentAllowlist) || !runtime.environmentAllowlist.length || runtime.environmentAllowlist.some(item => typeof item !== 'string' || !environmentName.test(item))) throw new Error('runtime environment allowlist');
  if (!Array.isArray(runtime.secretEnvironment)) throw new Error('runtime secret environment');
  for (const item of runtime.secretEnvironment) { const secret = object(item, 'runtime secret environment'); exactKeys(secret, ['name', 'fingerprintSha256'], 'runtime secret environment'); if (typeof secret.name !== 'string' || !environmentName.test(secret.name)) throw new Error('runtime secret name'); hash(secret.fingerprintSha256, 'runtime secret fingerprint'); }
  const roots = object(runtime.roots, 'runtime.roots'); exactKeys(roots, ['evaluatorRootSha256', 'scoringRootSha256', 'toolRootSha256', 'browserRootSha256', 'snapshotRootSha256', 'denySetRootSha256'], 'runtime.roots'); for (const [key, value] of Object.entries(roots)) hash(value, `runtime.roots.${key}`);
}

export function validateConditionBinding(value: unknown): void {
  const binding = object(value, 'binding');
  exactKeys(binding, ['schemaVersion', 'conditionSha256', 'conditionTreeSha256', 'bundleLockPath', 'bundleLockSha256', 'runtimeEnvironmentPath', 'runtimeEnvironmentSha256', 'sourceFinalizationPath', 'sourceFinalizationSha256'], 'binding');
  if (binding.schemaVersion !== 'condition-binding-v1') throw new Error('invalid binding schema version');
  for (const field of ['conditionSha256', 'conditionTreeSha256', 'bundleLockSha256', 'runtimeEnvironmentSha256', 'sourceFinalizationSha256'] as const) hash(binding[field], `binding.${field}`);
  for (const field of ['bundleLockPath', 'runtimeEnvironmentPath', 'sourceFinalizationPath'] as const) path(binding[field], `binding.${field}`);
}

/** Validates immutable runtime identity before binding, then verifies a later one-way binding. */
export function validateRuntimeManifest(root: string, paths: RuntimeManifestPaths): void {
  const runtime = readJson(root, paths.runtime); validateRuntimeEnvironment(runtime.value);
  if (paths.membership) validateMembership(readJson(root, paths.membership).value);
  if (!paths.binding) return;
  if (!paths.lock || !paths.sourceFinalization) throw new Error('binding requires lock and source finalization paths');
  const binding = readJson(root, paths.binding); validateConditionBinding(binding.value);
  const record = binding.value as RecordValue;
  if (record.runtimeEnvironmentPath !== paths.runtime || record.bundleLockPath !== paths.lock || record.sourceFinalizationPath !== paths.sourceFinalization) throw new Error('binding paths do not match supplied identities');
  if (record.runtimeEnvironmentSha256 !== sha256(runtime.raw) || record.bundleLockSha256 !== sha256(readJson(root, paths.lock).raw) || record.sourceFinalizationSha256 !== sha256(readJson(root, paths.sourceFinalization).raw)) throw new Error('binding contains stale identity hash');
  if (canonicalJson(binding.value as JsonValue) !== binding.raw.toString('utf8')) throw new Error('binding is not JCS canonical JSON');
}

function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
function main(): void {
  const runtime = argument('--runtime');
  if (!runtime) throw new Error('--runtime is required');
  const membership = argument('--membership');
  const binding = argument('--binding');
  const lock = argument('--lock');
  const sourceFinalization = argument('--source-finalization');
  if (binding && (!lock || !sourceFinalization)) throw new Error('--binding requires --lock and --source-finalization');
  if (!binding && (lock || sourceFinalization)) throw new Error('--lock and --source-finalization require --binding');
  const paths: RuntimeManifestPaths = { runtime };
  if (membership) paths.membership = membership;
  if (binding) paths.binding = binding;
  if (lock) paths.lock = lock;
  if (sourceFinalization) paths.sourceFinalization = sourceFinalization;
  validateRuntimeManifest(process.cwd(), paths);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) { try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; } }
