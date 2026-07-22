import { createHash } from 'node:crypto';
import { fstatSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectRunInvocation } from './invocation.ts';

export const ACTIVATION_CONTEXT_SCHEMA_VERSION = 'activation-context-v2' as const;
const HOST_PROJECT_WRITE_RECEIPT_SCHEMA = 'omd-host-project-write-receipt-v2' as const;

export const HOST_PAYLOAD_AUTHORIZATION_PURPOSES = [
  'current-user-intent-event',
  'current-intent-ledger',
  'evaluator-assessment',
  'evaluator-result',
  'approved-motion-recipe',
  'final-reviewer-lane',
  'static-review-receipt',
  'static-evidence-result',
  'final-evidence-manifest',
] as const;
export type HostPayloadAuthorizationPurpose = (typeof HOST_PAYLOAD_AUTHORIZATION_PURPOSES)[number];

export type HostCapability = { readonly host: 'claude' | 'codex' | 'local' | 'benchmark'; };
export type ActivationContext = {
  readonly schemaVersion: typeof ACTIVATION_CONTEXT_SCHEMA_VERSION;
  readonly buildSha256: string;
  readonly loadedSkillSha256: string;
  readonly briefSha256: string;
  readonly hostCapability: HostCapability;
};
type HostPayloadAuthorization = { readonly purpose: HostPayloadAuthorizationPurpose; readonly payloadSha256: string; };
type HostProjectWriteReceipt = {
  readonly schema: typeof HOST_PROJECT_WRITE_RECEIPT_SCHEMA;
  readonly host: 'claude' | 'codex';
  readonly hostAuthentication: { readonly host: 'claude' | 'codex'; readonly mechanism: 'inherited-ipc'; };
  readonly projectRoot: string;
  readonly argvSha256: string;
  readonly buildSha256: string;
  readonly loadedSkillSha256: string;
  readonly briefSha256: string;
  readonly payloadAuthorizations: readonly HostPayloadAuthorization[];
  readonly expiresAt: number;
  readonly nonce: string;
};

export class ActivationContextValidationError extends Error {
  override readonly name = 'ActivationContextValidationError';
  readonly reason: string;
  constructor(reason: string) { super(`activation context is invalid: ${reason}`); this.reason = reason; }
}

const SHA256 = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{32,}$/;
const FD = /^(?:[3-9]|[1-9][0-9]+)$/;
const localCliInvocations = new WeakSet<object>();
const localCliProjectRoots = new WeakMap<object, string>();
const hostProjectWriteReceipts = new WeakMap<object, HostProjectWriteReceipt>();
const consumedHostReceiptNonces = new Set<string>();
const testPayloadAuthorizations = new WeakMap<object, { readonly projectRoot: string; readonly authorizations: ReadonlySet<string>; }>();
const executedCliPath = process.argv[1] ? realpathSync(resolve(process.argv[1])) : undefined;
const NODE_TEST_MODE = process.execArgv.includes('--test') || process.env.NODE_TEST_CONTEXT !== undefined;
const canonicalCliPath = realpathSync(fileURLToPath(new URL('../../bin/omd.ts', import.meta.url)));

function canonicalProjectRoot(projectRoot: string): string {
  if (typeof projectRoot !== 'string' || !projectRoot || projectRoot.includes('\0')) throw new ActivationContextValidationError('project root must be a non-empty safe path');
  try {
    const root = realpathSync(resolve(projectRoot)); const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ActivationContextValidationError('project root must be an existing real directory');
    return root;
  } catch (error) { if (error instanceof ActivationContextValidationError) throw error; throw new ActivationContextValidationError('project root must be an existing real directory'); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
function requireSha256(value: unknown, field: string): asserts value is string { if (typeof value !== 'string' || !SHA256.test(value)) throw new ActivationContextValidationError(`${field} must be a lowercase SHA-256 hash`); }
function payloadSha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function payloadAuthorizationKey(purpose: HostPayloadAuthorizationPurpose, payload: Uint8Array): string { return `${purpose}:${payloadSha256(payload)}`; }

export function validateActivationContext(value: unknown): ActivationContext {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'buildSha256', 'loadedSkillSha256', 'briefSha256', 'hostCapability'])) throw new ActivationContextValidationError('context must contain exactly schemaVersion, buildSha256, loadedSkillSha256, briefSha256, and hostCapability');
  if (value.schemaVersion !== ACTIVATION_CONTEXT_SCHEMA_VERSION) throw new ActivationContextValidationError(`schemaVersion must be ${ACTIVATION_CONTEXT_SCHEMA_VERSION}`);
  requireSha256(value.buildSha256, 'buildSha256'); requireSha256(value.loadedSkillSha256, 'loadedSkillSha256'); requireSha256(value.briefSha256, 'briefSha256');
  if (!isRecord(value.hostCapability) || !hasExactKeys(value.hostCapability, ['host']) || !['claude', 'codex', 'local', 'benchmark'].includes(String(value.hostCapability.host))) throw new ActivationContextValidationError('hostCapability has invalid shape or values');
  return value as ActivationContext;
}
export function requireSameBuildActivation(context: ActivationContext, buildSha256: string, loadedSkillSha256: string, briefSha256: string): void { validateActivationContext(context); if (context.buildSha256 !== buildSha256 || context.loadedSkillSha256 !== loadedSkillSha256 || context.briefSha256 !== briefSha256) throw new ActivationContextValidationError('activation receipt does not match the current build, loaded skill, and brief'); }
function canonicalJson(value: unknown): string { if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value); if (typeof value === 'number') { if (!Number.isFinite(value)) throw new ActivationContextValidationError('local CLI brief must contain only finite numbers'); return JSON.stringify(value); } if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; if (!isRecord(value)) throw new ActivationContextValidationError('local CLI brief must be JSON-compatible'); return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`; }
function sha256(...parts: readonly Uint8Array[]): string { const hash = createHash('sha256'); for (const part of parts) { hash.update(String(part.byteLength)); hash.update(':'); hash.update(part); } return hash.digest('hex'); }
function textSha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export type LocalCliInvocationInput = { readonly cliPath: string; readonly argv: readonly string[]; readonly brief?: unknown; readonly projectRoot?: string; };
export function createLocalCliInvocation(input: LocalCliInvocationInput): ProjectRunInvocation {
  if (!Array.isArray(input.argv) || !input.argv.every((arg) => typeof arg === 'string') || typeof input.cliPath !== 'string') throw new ActivationContextValidationError('local CLI input is invalid');
  const cliPath = realpathSync(resolve(input.cliPath)); const isTestInvocation = NODE_TEST_MODE && input.projectRoot !== undefined && cliPath === canonicalCliPath;
  if (!isTestInvocation && (!executedCliPath || cliPath !== executedCliPath)) throw new ActivationContextValidationError('local project-write authority may only be created by the current CLI entrypoint');
  const projectRoot = input.projectRoot ?? process.cwd(); if (typeof projectRoot !== 'string' || !projectRoot) throw new ActivationContextValidationError('test project-write authority requires a project root');
  return issueLocalProjectWriteInvocation(canonicalProjectRoot(projectRoot), readFileSync(cliPath), { argv: input.argv, brief: input.brief ?? null }, isTestInvocation);
}
function issueLocalProjectWriteInvocation(projectRoot: string, loadedSkillBytes: Uint8Array, brief: unknown, testInvocation = false): ProjectRunInvocation {
  const buildSha256 = sha256(readFileSync(process.execPath), loadedSkillBytes); const loadedSkillSha256 = createHash('sha256').update(loadedSkillBytes).digest('hex'); const briefSha256 = textSha256(canonicalJson(brief));
  const invocation: ProjectRunInvocation = Object.freeze({ activation: Object.freeze({ schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION, buildSha256, loadedSkillSha256, briefSha256, hostCapability: Object.freeze({ host: testInvocation ? 'claude' : 'local' }) }), current: Object.freeze({ buildSha256, loadedSkillSha256, briefSha256 }) });
  localCliInvocations.add(invocation); localCliProjectRoots.set(invocation, projectRoot); return invocation;
}
function receiptFromInheritedFd(invocation: ProjectRunInvocation, projectRoot: string): HostProjectWriteReceipt | undefined {
  const existing = hostProjectWriteReceipts.get(invocation); if (existing) return existing.expiresAt > Date.now() ? existing : undefined;
  const fdValue = process.env.OMD_HOST_PROJECT_WRITE_FD;
  if (!fdValue || !FD.test(fdValue)) return undefined;
  let value: unknown;
  try {
    const descriptor = Number(fdValue); const channel = fstatSync(descriptor);
    if (!channel.isFIFO() && !channel.isSocket()) return undefined;
    value = JSON.parse(readFileSync(descriptor, 'utf8')) as unknown;
  } catch { return undefined; }
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'host', 'hostAuthentication', 'projectRoot', 'argvSha256', 'buildSha256', 'loadedSkillSha256', 'briefSha256', 'payloadAuthorizations', 'expiresAt', 'nonce'])) return undefined;
  if (value.schema !== HOST_PROJECT_WRITE_RECEIPT_SCHEMA || (value.host !== 'claude' && value.host !== 'codex') || !isRecord(value.hostAuthentication) || !hasExactKeys(value.hostAuthentication, ['host', 'mechanism']) || value.hostAuthentication.host !== value.host || value.hostAuthentication.mechanism !== 'inherited-ipc' || typeof value.projectRoot !== 'string' || typeof value.argvSha256 !== 'string' || !SHA256.test(value.argvSha256) || !Array.isArray(value.payloadAuthorizations) || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || typeof value.nonce !== 'string' || !NONCE.test(value.nonce)) return undefined;
  if (!value.payloadAuthorizations.every((authorization) => isRecord(authorization) && hasExactKeys(authorization, ['purpose', 'payloadSha256']) && typeof authorization.purpose === 'string' && HOST_PAYLOAD_AUTHORIZATION_PURPOSES.includes(authorization.purpose as HostPayloadAuthorizationPurpose) && typeof authorization.payloadSha256 === 'string' && SHA256.test(authorization.payloadSha256)) || new Set(value.payloadAuthorizations.map((authorization) => `${authorization.purpose}:${authorization.payloadSha256}`)).size !== value.payloadAuthorizations.length) return undefined;
  try {
    const receipt = value as HostProjectWriteReceipt; const activation = validateActivationContext(invocation.activation);
    if (executedCliPath !== canonicalCliPath || receipt.host !== activation.hostCapability.host || receipt.projectRoot !== canonicalProjectRoot(projectRoot) || receipt.argvSha256 !== textSha256(canonicalJson(process.argv)) || receipt.buildSha256 !== activation.buildSha256 || receipt.loadedSkillSha256 !== activation.loadedSkillSha256 || receipt.briefSha256 !== activation.briefSha256 || receipt.expiresAt <= Date.now() || consumedHostReceiptNonces.has(receipt.nonce)) return undefined;
    consumedHostReceiptNonces.add(receipt.nonce); hostProjectWriteReceipts.set(invocation, receipt); return receipt;
  } catch { return undefined; }
}
export type TestPayloadAuthorization = Readonly<{ purpose: HostPayloadAuthorizationPurpose; payload: Uint8Array; }>;
export function authorizeTestPayloads(invocation: ProjectRunInvocation, projectRoot: string, authorizations: readonly TestPayloadAuthorization[]): void {
  if (!NODE_TEST_MODE) throw new ActivationContextValidationError('test payload authorization is available only in the Node test runner');
  if (!localCliInvocations.has(invocation)) throw new ActivationContextValidationError('test payload authorization requires a local test invocation');
  const canonicalRoot = canonicalProjectRoot(projectRoot);
  if (localCliProjectRoots.get(invocation) !== canonicalRoot) throw new ActivationContextValidationError('test payload authorization project root does not match the invocation');
  if (!Array.isArray(authorizations) || !authorizations.every((authorization) => authorization !== null
    && typeof authorization === 'object'
    && HOST_PAYLOAD_AUTHORIZATION_PURPOSES.includes(authorization.purpose)
    && authorization.payload instanceof Uint8Array)) {
    throw new ActivationContextValidationError('test payload authorizations must contain exact authorized bytes');
  }
  const existing = testPayloadAuthorizations.get(invocation);
  if (existing !== undefined && existing.projectRoot !== canonicalRoot) throw new ActivationContextValidationError('test payload authorization project root does not match the invocation');
  const keys = new Set(existing?.authorizations);
  for (const authorization of authorizations) keys.add(payloadAuthorizationKey(authorization.purpose, authorization.payload));
  testPayloadAuthorizations.set(invocation, { projectRoot: canonicalRoot, authorizations: keys });
}
export function requireHostPayloadAuthorization(invocation: ProjectRunInvocation, projectRoot: string, purpose: HostPayloadAuthorizationPurpose, payload: Uint8Array): void {
  if (!(payload instanceof Uint8Array)) throw new ActivationContextValidationError('authorized payload must be exact bytes');
  const canonicalRoot = canonicalProjectRoot(projectRoot);
  const testAuthorization = testPayloadAuthorizations.get(invocation);
  if (testAuthorization?.projectRoot === canonicalRoot && testAuthorization.authorizations.has(payloadAuthorizationKey(purpose, payload))) return;
  const receipt = receiptFromInheritedFd(invocation, canonicalRoot);
  if (receipt === undefined || receipt.expiresAt <= Date.now() || !receipt.payloadAuthorizations.some((authorization) => authorization.purpose === purpose && authorization.payloadSha256 === payloadSha256(payload))) throw new ActivationContextValidationError(`host receipt does not authorize the exact ${purpose} payload`);
}
export function isHostDerivedLocalCliInvocation(invocation: object): boolean { return localCliInvocations.has(invocation); }
export function hasHostBoundLocalProjectWriteAuthority(invocation: object, projectRoot: string): boolean {
  try {
    const context = validateActivationContext((invocation as ProjectRunInvocation).activation); const current = (invocation as ProjectRunInvocation).current;
    if (!current || context.buildSha256 !== current.buildSha256 || context.loadedSkillSha256 !== current.loadedSkillSha256 || context.briefSha256 !== current.briefSha256) return false;
    if (NODE_TEST_MODE && localCliInvocations.has(invocation)) return localCliProjectRoots.get(invocation) === canonicalProjectRoot(projectRoot);
    if (context.hostCapability.host === 'local') return localCliProjectRoots.get(invocation) === canonicalProjectRoot(projectRoot);
    return (context.hostCapability.host === 'claude' || context.hostCapability.host === 'codex') && receiptFromInheritedFd(invocation as ProjectRunInvocation, projectRoot) !== undefined;
  } catch { return false; }
}
export function hostBoundLocalProjectRoot(invocation: object): string | undefined { return localCliProjectRoots.get(invocation); }
