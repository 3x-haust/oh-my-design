import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from './project-write.ts';

export const OBSERVATION_V2_SCHEMA = 'observation-v2' as const;
export const OBSERVATION_V2_POINTER_SCHEMA = 'observation-v2-pointer' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const SENSITIVE_KEY = /(?:authorization|cookie|email|password|secret|session|token)/i;
const SENSITIVE_TEXT = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:bearer\s+)?[a-z0-9_=-]{24,}\b)/gi;

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

export function validateObservationCurrentArtifact(root: string, value: unknown): CurrentArtifact {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'path,sha256' || typeof value.path !== 'string' || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)) fail('currentArtifact must contain a project-relative path and SHA-256');
  if (value.path === '' || value.path.includes('\\') || value.path.split('/').includes('..')) fail('currentArtifact.path must stay inside the project root');
  const target = resolve(root, value.path);
  if (relative(resolve(root), target).startsWith('..')) fail('currentArtifact.path must stay inside the project root');
  try {
    const metadata = lstatSync(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail('currentArtifact must be a regular project file');
    if (hash(readFileSync(target)) !== value.sha256) fail('currentArtifact bytes are stale');
  } catch (error) {
    if (error instanceof ObservationV2ValidationError) throw error;
    fail('currentArtifact must exist as a regular project file');
  }
  return { path: value.path, sha256: value.sha256 };
}

/** Removes sensitive values before bytes cross the durable observation boundary. */
export function redactObservationEvidence(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SENSITIVE_TEXT, '[REDACTED]');
  if (Array.isArray(value)) return value.map(redactObservationEvidence);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactObservationEvidence(child)]));
}

export function observationV2Sha256(value: ObservationV2): string { return hash(`${canonicalJson(value)}\n`); }

export function validateObservationV2(value: unknown): ObservationV2 {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'buildSha256,currentArtifact,evidence,observedAt,predecessorSha256,schema' || value.schema !== OBSERVATION_V2_SCHEMA || typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt))) fail('observation has an invalid shape');
  if (typeof value.buildSha256 !== 'string' || !SHA256.test(value.buildSha256)) fail('observation buildSha256 is invalid');
  if (value.predecessorSha256 !== null && (typeof value.predecessorSha256 !== 'string' || !SHA256.test(value.predecessorSha256))) fail('observation predecessorSha256 is invalid');
  if (!isRecord(value.currentArtifact) || typeof value.currentArtifact.path !== 'string' || typeof value.currentArtifact.sha256 !== 'string' || !SHA256.test(value.currentArtifact.sha256)) fail('observation currentArtifact is invalid');
  return { schema: OBSERVATION_V2_SCHEMA, observedAt: value.observedAt, buildSha256: value.buildSha256, currentArtifact: { path: value.currentArtifact.path, sha256: value.currentArtifact.sha256 }, predecessorSha256: value.predecessorSha256, evidence: value.evidence };
}

function readPointer(root: string): ObservationV2Pointer | undefined {
  const path = resolve(root, '.omd/observation-v2.json');
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'record,schema,sha256' || value.schema !== OBSERVATION_V2_POINTER_SCHEMA || typeof value.record !== 'string' || !/^\.omd\/observation-v2\/sha256-[a-f0-9]{64}\.json$/.test(value.record) || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)) fail('observation pointer is invalid');
    const bytes = readFileSync(resolve(root, value.record));
    if (hash(bytes) !== value.sha256 || observationV2Sha256(validateObservationV2(JSON.parse(bytes.toString('utf8')))) !== value.sha256) fail('observation pointer is stale');
    return { schema: OBSERVATION_V2_POINTER_SCHEMA, record: value.record, sha256: value.sha256 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Writes a sanitized, content-addressed observation only after loading the named current artifact. */
export function writeObservationV2(root: string, input: WriteObservationV2Input, writer: ProjectWriteAdapter): ObservationV2 {
  requireProjectWriteAdapter(root, writer);
  if (!isRecord(input) || !['buildSha256,currentArtifact,evidence', 'buildSha256,currentArtifact,evidence,observedAt'].includes(Object.keys(input).sort().join(','))) fail('observation input has unexpected authority fields');
  const currentArtifact = validateObservationCurrentArtifact(root, input.currentArtifact);
  if (!SHA256.test(input.buildSha256)) fail('observation buildSha256 is invalid');
  let artifactBuildSha256: unknown;
  try { artifactBuildSha256 = (JSON.parse(readFileSync(resolve(root, currentArtifact.path), 'utf8')) as Record<string, unknown>).buildSha256; } catch { fail('currentArtifact must be a build identity receipt'); }
  if (artifactBuildSha256 !== input.buildSha256) fail('observation build does not match the current artifact');
  const observedAt = input.observedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) fail('observedAt must be an ISO date');
  const previous = readPointer(root);
  const observation: ObservationV2 = { schema: OBSERVATION_V2_SCHEMA, observedAt, buildSha256: input.buildSha256, currentArtifact, predecessorSha256: previous?.sha256 ?? null, evidence: redactObservationEvidence(input.evidence) };
  const sha256 = observationV2Sha256(observation);
  const bytes = `${canonicalJson(observation)}\n`;
  writer.write(recordPath(sha256), bytes);
  writer.write('.omd/observation-v2.json', `${canonicalJson({ schema: OBSERVATION_V2_POINTER_SCHEMA, record: recordPath(sha256), sha256 })}\n`);
  return observation;
}

export function readCurrentObservationV2(root: string): ObservationV2 | undefined {
  const pointer = readPointer(root);
  if (!pointer) return undefined;
  return validateObservationV2(JSON.parse(readFileSync(resolve(root, pointer.record), 'utf8')) as unknown);
}
