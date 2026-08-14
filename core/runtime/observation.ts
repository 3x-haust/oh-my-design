import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { BROWSER_OBSERVATION_SCHEMA, BROWSER_OBSERVATION_SET_SCHEMA, validateBrowserObservationArtifacts, validateBrowserObservationDecisionLinks } from './browser-observation.ts';
import {
  acquireProjectMutationLock,
  replaceProjectFileAtomically,
  requireProjectWriteAdapter,
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from './project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile, StableProjectFileReadError } from './stable-project-file.ts';

export const OBSERVATION_V2_SCHEMA = 'observation-v2' as const;
export const OBSERVATION_V2_POINTER_SCHEMA = 'observation-v2-pointer' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const REPAIR_PREDECESSOR_SCHEMA = 'observation-v2-repair-predecessor-v1';
const TRUSTED_REFERENCE = /^(?:claim:[a-f0-9]{64}:[a-z0-9][a-z0-9:-]*:[a-f0-9]{64}|decision:[a-f0-9]{64}:\d+|outcome:[a-f0-9]{64}:mustHave:\d+:[a-f0-9]{64})$/;
const SENSITIVE_KEY = /(?:authorization|cookie|email|password|secret|session|token)/i;
const SENSITIVE_TEXT = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:bearer\s+)?[a-z0-9_=-]{24,}\b)/gi;
const OBSERVATION_STABLE_FILE_SYSTEM = nodeStableProjectFileSystem();

type CurrentArtifact = Readonly<{ path: string; sha256: string }>;
export type ObservationV2 = Readonly<{
  schema: typeof OBSERVATION_V2_SCHEMA;
  observedAt: string;
  buildSha256: string;
  currentArtifact: CurrentArtifact;
  predecessorSha256: string | null;
  evidence: unknown;
}>;
export type ObservationV2Pointer = Readonly<{ schema: typeof OBSERVATION_V2_POINTER_SCHEMA; record: string; sha256: string }>;
export type WriteObservationV2Input = Readonly<{ currentArtifact: CurrentArtifact; buildSha256: string; evidence: unknown; observedAt?: string }>;

export class ObservationV2ValidationError extends Error {
  override readonly name = 'ObservationV2ValidationError';
}
function fail(reason: string): never { throw new ObservationV2ValidationError(reason); }
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const recordPath = (sha256: string): string => `.omd/observation-v2/sha256-${sha256}.json`;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function exactOwnFields(value: unknown, keys: readonly string[], label: string): ReadonlyMap<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(`${label} must not inherit input properties`);
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key))) fail(`${label} has unknown or missing keys`);
    const result = new Map<string, unknown>();
    for (const key of own) {
      if (typeof key !== 'string') fail(`${label} must not contain Symbol keys`);
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) fail(`${label} must contain enumerable own data properties only`);
      result.set(key, descriptor.value);
    }
    return result;
  } catch (error) {
    if (error instanceof ObservationV2ValidationError) throw error;
    return fail(`${label} could not be inspected safely`);
  }
}

export function validateObservationCurrentArtifact(root: string, value: unknown): CurrentArtifact {
  const item = exactOwnFields(value, ['path', 'sha256'], 'currentArtifact');
  const path = item.get('path'); const sha256 = item.get('sha256');
  if (typeof path !== 'string' || typeof sha256 !== 'string' || !SHA256.test(sha256)) fail('currentArtifact must contain a project-relative path and SHA-256');
  if (path === '' || path.includes('\\') || path.split('/').includes('..')) fail('currentArtifact.path must stay inside the project root');
  const target = resolve(root, path);
  if (relative(resolve(root), target).startsWith('..')) fail('currentArtifact.path must stay inside the project root');
  try {
    if (hash(observationProjectFile(root, path, 'currentArtifact')) !== sha256) fail('currentArtifact bytes are stale');
  } catch (error) {
    if (error instanceof ObservationV2ValidationError) throw error;
    fail('currentArtifact must exist as a regular project file');
  }
  return { path, sha256 };
}

function evidenceData(value: object, key: string | symbol): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) fail('observation evidence must contain enumerable own data properties only');
  return descriptor.value;
}
function redactEvidence(value: unknown): unknown {
  if (typeof value === 'string') return SHA256.test(value) || TRUSTED_REFERENCE.test(value)
    || value === 'reference-production-observation-v1'
    || value === 'trusted-outcome-observation-v1' || value === BROWSER_OBSERVATION_SCHEMA
    || value === BROWSER_OBSERVATION_SET_SCHEMA ? value : value.replace(SENSITIVE_TEXT, '[REDACTED]');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) {
    if (Reflect.getPrototypeOf(value) !== Array.prototype) fail('observation evidence arrays must not inherit input properties');
    const keys = Reflect.ownKeys(value); const expected = Array.from({ length: value.length }, (_, index) => String(index));
    if (keys.length !== expected.length + 1 || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) fail('observation evidence arrays must be dense and undecorated');
    return expected.map((key) => redactEvidence(evidenceData(value, key)));
  }
  if (!isRecord(value)) fail('observation evidence contains an unsupported value');
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail('observation evidence must not inherit input properties');
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) fail('observation evidence must not contain Symbol keys');
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== 'string') fail('observation evidence must not contain Symbol keys');
    result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactEvidence(evidenceData(value, key));
  }
  return result;
}
/** Removes sensitive values and snapshots own data before bytes cross the durable observation boundary. */
export function redactObservationEvidence(value: unknown): unknown {
  try { return redactEvidence(value); } catch (error) { if (error instanceof ObservationV2ValidationError) throw error; return fail('observation evidence could not be inspected safely'); }
}
function observationProjectFile(root: string, path: string, label: string): Buffer {
  try { return readStableProjectFile({ root, path: resolve(root, path), label, fs: OBSERVATION_STABLE_FILE_SYSTEM }); } catch (error) {
    if (error instanceof StableProjectFileReadError) fail(error.message);
    throw error;
  }
}
function optionalObservationProjectFile(root: string, path: string, label: string): Buffer | undefined {
  try { return observationProjectFile(root, path, label); } catch (error) {
    try { lstatSync(resolve(root, path)); } catch (missing) {
      if ((missing as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    }
    throw error;
  }
}

export function observationV2Sha256(value: ObservationV2): string { return hash(`${canonicalJson(value)}\n`); }

export function validateObservationV2(value: unknown): ObservationV2 {
  const item = exactOwnFields(value, ['schema', 'buildSha256', 'currentArtifact', 'predecessorSha256', 'observedAt', 'evidence'], 'observation');
  const observedAt = item.get('observedAt'); const buildSha256 = item.get('buildSha256'); const predecessorSha256 = item.get('predecessorSha256');
  if (item.get('schema') !== OBSERVATION_V2_SCHEMA || typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) fail('observation has an invalid shape');
  if (typeof buildSha256 !== 'string' || !SHA256.test(buildSha256)) fail('observation buildSha256 is invalid');
  if (predecessorSha256 !== null && (typeof predecessorSha256 !== 'string' || !SHA256.test(predecessorSha256))) fail('observation predecessorSha256 is invalid');
  const artifact = exactOwnFields(item.get('currentArtifact'), ['path', 'sha256'], 'observation.currentArtifact');
  const artifactPath = artifact.get('path'); const artifactSha256 = artifact.get('sha256');
  if (typeof artifactPath !== 'string' || typeof artifactSha256 !== 'string' || !SHA256.test(artifactSha256)) fail('observation currentArtifact is invalid');
  return { schema: OBSERVATION_V2_SCHEMA, observedAt, buildSha256, currentArtifact: { path: artifactPath, sha256: artifactSha256 }, predecessorSha256, evidence: item.get('evidence') };
}

function readObservationRecord(root: string, pointer: ObservationV2Pointer): ObservationV2 {
  const bytes = observationProjectFile(root, pointer.record, 'observation immutable record');
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { return fail('observation pointer is stale'); }
  const observation = validateObservationV2(parsed);
  if (hash(bytes) !== pointer.sha256 || observationV2Sha256(observation) !== pointer.sha256) fail('observation pointer is stale');
  return observation;
}

function readPointer(root: string): ObservationV2Pointer | undefined {
  const bytes = optionalObservationProjectFile(root, '.omd/observation-v2.json', 'observation pointer');
  if (bytes === undefined) return undefined;
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return fail('observation pointer is invalid'); }
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'record,schema,sha256' || value.schema !== OBSERVATION_V2_POINTER_SCHEMA || typeof value.record !== 'string' || !/^\.omd\/observation-v2\/sha256-[a-f0-9]{64}\.json$/.test(value.record) || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)) fail('observation pointer is invalid');
  const pointer = { schema: OBSERVATION_V2_POINTER_SCHEMA, record: value.record, sha256: value.sha256 };
  readObservationRecord(root, pointer);
  return pointer;
}

function readRepairPredecessor(root: string): string | undefined {
  const bytes = optionalObservationProjectFile(root, '.omd/observation-v2-repair-predecessor.json', 'repair observation predecessor');
  if (bytes === undefined) return undefined;
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return fail('repair observation predecessor is invalid'); }
  if (!isRecord(value)
    || Object.keys(value).sort().join(',') !== 'predecessorSha256,schema'
    || value.schema !== REPAIR_PREDECESSOR_SCHEMA
    || typeof value.predecessorSha256 !== 'string'
    || !SHA256.test(value.predecessorSha256)) {
    fail('repair observation predecessor is invalid');
  }
  return value.predecessorSha256;
}

/** Writes a sanitized, content-addressed observation only after loading the named current artifact. */
export function writeObservationV2(
  root: string,
  input: WriteObservationV2Input,
  writer: ProjectWriteAdapter,
  invocation?: ProjectRunInvocation,
): ObservationV2 {
  requireProjectWriteAdapter(root, writer);
  const publish = (): ObservationV2 => {
  let hasObservedAt: boolean;
  try { hasObservedAt = Reflect.ownKeys(input).includes('observedAt'); } catch { return fail('observation input could not be inspected safely'); }
  const keys = hasObservedAt ? ['currentArtifact', 'buildSha256', 'evidence', 'observedAt'] : ['currentArtifact', 'buildSha256', 'evidence'];
  const item = exactOwnFields(input, keys, 'observation input');
  const currentArtifact = validateObservationCurrentArtifact(root, item.get('currentArtifact'));
  const buildSha256 = item.get('buildSha256');
  if (typeof buildSha256 !== 'string' || !SHA256.test(buildSha256)) fail('observation buildSha256 is invalid');
  let artifactBuildSha256: unknown;
  try { const parsed: unknown = JSON.parse(observationProjectFile(root, currentArtifact.path, 'currentArtifact').toString('utf8')); artifactBuildSha256 = isRecord(parsed) ? parsed.buildSha256 : undefined; } catch { fail('currentArtifact must be a build identity receipt'); }
  if (artifactBuildSha256 !== buildSha256) fail('observation build does not match the current artifact');
  const observedAtInput = item.get('observedAt');
  const observedAt = hasObservedAt ? observedAtInput : new Date().toISOString();
  if (typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) fail('observedAt must be an ISO date');
  const rawEvidence = item.get('evidence');
  const browserLinks = isRecord(rawEvidence) && Object.hasOwn(rawEvidence, 'browserObservations')
    ? validateBrowserObservationDecisionLinks(rawEvidence, observationProjectFile(root, '.omd/decision-graph.json', 'browser observation decision graph'), true)
    : undefined;
  if (browserLinks !== undefined) {
    validateBrowserObservationArtifacts(browserLinks, (path) => observationProjectFile(root, path, 'browser observation capture'), true);
  }
  const redactedEvidence = redactObservationEvidence(rawEvidence);
  const evidence = browserLinks === undefined || !isRecord(redactedEvidence)
    ? redactedEvidence
    : Object.freeze({ ...redactedEvidence, browserObservations: browserLinks });
  const previous = readPointer(root);
  const repairPredecessor = readRepairPredecessor(root);
  if (previous !== undefined && repairPredecessor !== undefined
    && readObservationRecord(root, previous).predecessorSha256 !== repairPredecessor) {
    fail('repair observation predecessor was not consumed by the immediate successor');
  }
  const observation: ObservationV2 = {
    schema: OBSERVATION_V2_SCHEMA,
    observedAt,
    buildSha256,
    currentArtifact,
    predecessorSha256: previous?.sha256 ?? repairPredecessor ?? null,
    evidence,
  };
  const sha256 = observationV2Sha256(observation);
  const bytes = `${canonicalJson(observation)}\n`;
  writer.writeContentAddressed(recordPath(sha256), bytes);
  const pointerBytes = `${canonicalJson({ schema: OBSERVATION_V2_POINTER_SCHEMA, record: recordPath(sha256), sha256 })}\n`;
  if (invocation === undefined) writer.write('.omd/observation-v2.json', pointerBytes);
  else replaceProjectFileAtomically({ projectRoot: root, invocation, relativePath: '.omd/observation-v2.json', content: pointerBytes });
  if (repairPredecessor !== undefined) writer.remove('.omd/observation-v2-repair-predecessor.json');
  return observation;
  };
  if (invocation === undefined) return publish();
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const release = acquireProjectMutationLock(root, invocation);
  try { return publish(); } finally { release(); }
}

export function readCurrentObservationV2(root: string): ObservationV2 | undefined {
  const pointer = readPointer(root);
  if (!pointer) return undefined;
  return readObservationRecord(root, pointer);
}
