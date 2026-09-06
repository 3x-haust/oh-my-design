import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCurrentProjectRun, type ProjectRunInvocation } from '../runtime/invocation.ts';

export const AI_ASSET_DECISION_RECORD_SCHEMA = 'omd-ai-asset-decision-record-v1' as const;
export const AI_ASSET_DECISION_REFERENCE_SCHEMA = 'omd-ai-asset-decision-reference-v1' as const;
export const AI_ASSET_DECISION_AUTHORITY_SCHEMA = 'omd-ai-asset-decision-authority-v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const RECORD = /^ai-asset-decisions\/sha256-([a-f0-9]{64})\.json$/;

export type InvocationIdentity = Readonly<{
  buildSha256: string;
  loadedSkillSha256: string;
  briefSha256: string;
}>;
export type AiAssetDecisionInput = Readonly<{
  decisionId: string;
  prompt: string;
  provider: string;
  reason: string;
}>;
export type AiAssetDecisionRecord = Readonly<{
  schema: typeof AI_ASSET_DECISION_RECORD_SCHEMA;
  command: 'omd decision';
  status: 'committed';
  decisionId: string;
  prompt: string;
  provider: string;
  reason: string;
  projectRoot: string;
  invocation: InvocationIdentity;
}>;
export type AiAssetDecisionReference = Readonly<{
  schema: typeof AI_ASSET_DECISION_REFERENCE_SCHEMA;
  decisionId: string;
  record: string;
  decisionSha256: string;
  projectRoot: string;
  invocation: InvocationIdentity;
}>;
export type AiAssetDecisionBinding = Readonly<{
  prompt: string;
  provider: string;
  decision: AiAssetDecisionReference;
  currentDecision: AiAssetDecisionReference;
}>;
export type CommittedAiAssetDecision = AiAssetDecisionBinding & Readonly<{
  decisionRecord: AiAssetDecisionRecord;
  decisionSha256: string;
}>;

export class AiAssetDecisionError extends Error {
  override readonly name = 'AiAssetDecisionError';
}
export const failAiAssetDecision = (reason: string): never => { throw new AiAssetDecisionError(reason); };
export const hashAiAssetDecision = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

export function canonicalAiAssetDecision(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalAiAssetDecision).join(',')}]`;
  if (typeof value !== 'object' || Reflect.getPrototypeOf(value) !== Object.prototype) {
    return failAiAssetDecision('decision authority is not plain JSON data');
  }
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalAiAssetDecision(item[key])}`).join(',')}}`;
}

export function aiAssetDecisionFields(
  value: unknown,
  expected: readonly string[],
  label: string,
): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) {
    return failAiAssetDecision(`${label} is not strict plain data`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return failAiAssetDecision(`${label} has unknown or missing fields`);
  }
  const result = new Map<string, unknown>();
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAiAssetDecision(`${label}.${key} is not data`);
    }
    result.set(key, descriptor.value);
  }
  return result;
}

export function aiAssetDecisionText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) return failAiAssetDecision(`${label} is missing`);
  return value.trim();
}
function digest(value: unknown, label: string): string {
  const parsed = aiAssetDecisionText(value, label);
  return SHA256.test(parsed) ? parsed : failAiAssetDecision(`${label} is not a SHA-256 digest`);
}
export function trustedAiAssetProjectRoot(root: string): string {
  try {
    const value = realpathSync(resolve(root));
    const stat = lstatSync(value);
    return stat.isDirectory() && !stat.isSymbolicLink()
      ? value
      : failAiAssetDecision('trusted project root is not a real directory');
  } catch (error) {
    if (error instanceof AiAssetDecisionError) throw error;
    return failAiAssetDecision('trusted project root is not a real directory');
  }
}
function invocationIdentity(value: unknown, label: string): InvocationIdentity {
  const item = aiAssetDecisionFields(value, ['buildSha256', 'loadedSkillSha256', 'briefSha256'], label);
  return Object.freeze({
    buildSha256: digest(item.get('buildSha256'), `${label}.buildSha256`),
    loadedSkillSha256: digest(item.get('loadedSkillSha256'), `${label}.loadedSkillSha256`),
    briefSha256: digest(item.get('briefSha256'), `${label}.briefSha256`),
  });
}
export function sameAiAssetDecision(left: unknown, right: unknown): boolean {
  return canonicalAiAssetDecision(left) === canonicalAiAssetDecision(right);
}
function input(value: unknown): AiAssetDecisionInput {
  const item = aiAssetDecisionFields(
    value,
    ['decisionId', 'prompt', 'provider', 'reason'],
    'AI asset decision input',
  );
  const decisionId = aiAssetDecisionText(item.get('decisionId'), 'decisionId');
  if (!ID.test(decisionId)) return failAiAssetDecision('decisionId is invalid');
  return Object.freeze({
    decisionId,
    prompt: aiAssetDecisionText(item.get('prompt'), 'prompt'),
    provider: aiAssetDecisionText(item.get('provider'), 'provider'),
    reason: aiAssetDecisionText(item.get('reason'), 'reason'),
  });
}
export function parseAiAssetDecisionReference(value: unknown, label: string): AiAssetDecisionReference {
  const item = aiAssetDecisionFields(value, [
    'schema', 'decisionId', 'record', 'decisionSha256', 'projectRoot', 'invocation',
  ], label);
  if (item.get('schema') !== AI_ASSET_DECISION_REFERENCE_SCHEMA) {
    return failAiAssetDecision(`${label}.schema is invalid`);
  }
  const decisionId = aiAssetDecisionText(item.get('decisionId'), `${label}.decisionId`);
  const record = aiAssetDecisionText(item.get('record'), `${label}.record`);
  const decisionSha256 = digest(item.get('decisionSha256'), `${label}.decisionSha256`);
  const match = RECORD.exec(record);
  if (!ID.test(decisionId) || match?.[1] !== decisionSha256) {
    return failAiAssetDecision(`${label} is not content-addressed`);
  }
  return Object.freeze({
    schema: AI_ASSET_DECISION_REFERENCE_SCHEMA,
    decisionId,
    record,
    decisionSha256,
    projectRoot: aiAssetDecisionText(item.get('projectRoot'), `${label}.projectRoot`),
    invocation: invocationIdentity(item.get('invocation'), `${label}.invocation`),
  });
}
export function parseAiAssetDecisionRecord(value: unknown): AiAssetDecisionRecord {
  const item = aiAssetDecisionFields(value, [
    'schema', 'command', 'status', 'decisionId', 'prompt', 'provider', 'reason',
    'projectRoot', 'invocation',
  ], 'persisted omd decision record');
  if (item.get('schema') !== AI_ASSET_DECISION_RECORD_SCHEMA
    || item.get('command') !== 'omd decision' || item.get('status') !== 'committed') {
    return failAiAssetDecision('persisted omd decision record is not committed');
  }
  const parsed = input({
    decisionId: item.get('decisionId'),
    prompt: item.get('prompt'),
    provider: item.get('provider'),
    reason: item.get('reason'),
  });
  return Object.freeze({
    schema: AI_ASSET_DECISION_RECORD_SCHEMA,
    command: 'omd decision',
    status: 'committed',
    ...parsed,
    projectRoot: aiAssetDecisionText(item.get('projectRoot'), 'persisted projectRoot'),
    invocation: invocationIdentity(item.get('invocation'), 'persisted invocation'),
  });
}
export function aiAssetDecisionRecordFor(
  root: string,
  value: AiAssetDecisionInput,
  invocation: ProjectRunInvocation,
): AiAssetDecisionRecord {
  const activation = validateCurrentProjectRun(invocation);
  return Object.freeze({
    schema: AI_ASSET_DECISION_RECORD_SCHEMA,
    command: 'omd decision',
    status: 'committed',
    ...input(value),
    projectRoot: trustedAiAssetProjectRoot(root),
    invocation: Object.freeze({
      buildSha256: activation.buildSha256,
      loadedSkillSha256: activation.loadedSkillSha256,
      briefSha256: activation.briefSha256,
    }),
  });
}
export function aiAssetDecisionRecordBytes(record: AiAssetDecisionRecord): Buffer {
  return Buffer.from(`${canonicalAiAssetDecision(record)}\n`);
}
export function aiAssetDecisionReferenceFor(record: AiAssetDecisionRecord): AiAssetDecisionReference {
  const decisionSha256 = hashAiAssetDecision(aiAssetDecisionRecordBytes(record));
  return Object.freeze({
    schema: AI_ASSET_DECISION_REFERENCE_SCHEMA,
    decisionId: record.decisionId,
    record: `ai-asset-decisions/sha256-${decisionSha256}.json`,
    decisionSha256,
    projectRoot: record.projectRoot,
    invocation: record.invocation,
  });
}
export function aiAssetDecisionAuthorityPayload(
  record: AiAssetDecisionRecord,
  decisionSha256: string,
): Buffer {
  return Buffer.from(`${canonicalAiAssetDecision({
    schema: AI_ASSET_DECISION_AUTHORITY_SCHEMA,
    projectRoot: record.projectRoot,
    invocation: record.invocation,
    decisionId: record.decisionId,
    decisionSha256,
    prompt: record.prompt,
    provider: record.provider,
  })}\n`);
}
