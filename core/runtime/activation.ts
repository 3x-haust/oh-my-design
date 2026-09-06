import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, fstatSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectRunInvocation } from './invocation.ts';
import { requestCodexHostAuthority } from './codex-host-client.ts';
import type { CodexBrowserRole } from './codex-browser-operation.ts';

export const ACTIVATION_CONTEXT_SCHEMA_VERSION = 'activation-context-v2' as const;
const HOST_PROJECT_WRITE_RECEIPT_SCHEMA = 'omd-host-project-write-receipt-v3' as const;

export const HOST_PAYLOAD_AUTHORIZATION_PURPOSES = [
  'adaptive-route-authority',
  'ai-asset-decision',
  'current-user-intent-event',
  'current-intent-ledger',
  'evaluator-assessment',
  'evaluator-result',
  'approved-motion-recipe',
  'final-reviewer-lane',
  'static-review-receipt',
  'static-evidence-result',
  'motion-evidence',
  'motion-result',
  'rendered-beat-result',
  'product-probe-result',
  'product-capture-result',
  'workflow-production-slice',
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
  readonly hostAuthentication: {
    readonly host: 'claude' | 'codex';
    readonly mechanism: 'inherited-ipc' | 'brokered-ipc';
    readonly parentPid: number;
    readonly parentExecutableSha256: string;
  };
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
const HOST_PROJECT_WRITE_DESCRIPTOR = 3;
const localCliInvocations = new WeakSet<object>();
const localCliProjectRoots = new WeakMap<object, string>();
const hostProjectWriteReceipts = new WeakMap<object, HostProjectWriteReceipt>();
const consumedHostReceiptNonces = new Set<string>();
const testPayloadAuthorizations = new WeakMap<object, { readonly projectRoot: string; readonly authorizations: ReadonlySet<string>; }>();
const invocationIdentities = new WeakMap<object, Readonly<{
  host: HostCapability['host'];
  buildSha256: string;
  loadedSkillSha256: string;
  briefSha256: string;
}>>();
const executedCliPath = process.argv[1] ? realpathSync(resolve(process.argv[1])) : undefined;
const canonicalCliPath = realpathSync(fileURLToPath(new URL('../../bin/omd.ts', import.meta.url)));
const canonicalOwnerCliPath = realpathSync(fileURLToPath(new URL('../../bin/omd-codex.ts', import.meta.url)));
const testRoot = fileURLToPath(new URL('../../test', import.meta.url));
const canonicalTestRoot = existsSync(testRoot) ? realpathSync(testRoot) : undefined;
const testEntrypoint = executedCliPath === undefined || canonicalTestRoot === undefined ? undefined : relative(canonicalTestRoot, executedCliPath);
const NODE_TEST_MODE = process.execArgv.some((arg) => arg.startsWith('--test-isolation='))
  && testEntrypoint !== undefined
  && testEntrypoint !== ''
  && testEntrypoint !== '..'
  && !testEntrypoint.startsWith(`..${sep}`)
  && !isAbsolute(testEntrypoint);

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

export function resolveCodexAuthorityCliPath(
  executedPath: string | undefined,
  argv: readonly string[],
  cliPath = canonicalCliPath,
  ownerCliPath = canonicalOwnerCliPath,
): string | undefined {
  if (executedPath === cliPath) return cliPath;
  if (executedPath === ownerCliPath && argv[2] === 'owner' && (argv[3] === 'run' || argv[3] === 'repair')) {
    return ownerCliPath;
  }
  return undefined;
}

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
const inheritedArgvSha256 = textSha256(canonicalJson(process.argv));
function ancestorExecutableSha256(expectedPid: number): string | undefined {
  if (!Number.isSafeInteger(expectedPid) || expectedPid <= 0) return undefined;
  try {
    let cursor = process.ppid;
    for (let depth = 0; depth < 16 && cursor > 1; depth += 1) {
      const commandResult = spawnSync('/bin/ps', ['-p', String(cursor), '-o', 'command='], { encoding: 'utf8', env: { PATH: '' } });
      const parentResult = spawnSync('/bin/ps', ['-p', String(cursor), '-o', 'ppid='], { encoding: 'utf8', env: { PATH: '' } });
      if (commandResult.status !== 0 || parentResult.status !== 0) return undefined;
      if (cursor === expectedPid) {
        const executable = commandResult.stdout.trim().split(/\s+/, 1)[0];
        const path = executable?.startsWith('/') ? executable : executable === basename(process.execPath) ? process.execPath : undefined;
        return path === undefined ? undefined : createHash('sha256').update(readFileSync(realpathSync(path))).digest('hex');
      }
      const parent = Number.parseInt(parentResult.stdout.trim(), 10);
      if (!Number.isSafeInteger(parent) || parent <= 0 || parent === cursor) return undefined;
      cursor = parent;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
export function requireImmutableInvocationIdentity(invocation: ProjectRunInvocation): void {
  const activation = validateActivationContext(invocation.activation);
  const current = invocation.current;
  if (!isRecord(current)) throw new ActivationContextValidationError('current run identity is required');
  requireSha256(current.buildSha256, 'current buildSha256');
  requireSha256(current.loadedSkillSha256, 'current loadedSkillSha256');
  requireSha256(current.briefSha256, 'current briefSha256');
  requireSameBuildActivation(activation, current.buildSha256, current.loadedSkillSha256, current.briefSha256);
  const identity = Object.freeze({
    host: activation.hostCapability.host,
    buildSha256: activation.buildSha256,
    loadedSkillSha256: activation.loadedSkillSha256,
    briefSha256: activation.briefSha256,
  });
  const existing = invocationIdentities.get(invocation);
  if (existing !== undefined && (
    existing.host !== identity.host
    || existing.buildSha256 !== identity.buildSha256
    || existing.loadedSkillSha256 !== identity.loadedSkillSha256
    || existing.briefSha256 !== identity.briefSha256
  )) {
    throw new ActivationContextValidationError('invocation identity changed after it was accepted');
  }
  if (existing === undefined) invocationIdentities.set(invocation, identity);
}

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
function receiptFromCodexBroker(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  requestedAuthorization?: HostPayloadAuthorization & Readonly<{ payloadBase64: string }>,
): HostProjectWriteReceipt | undefined {
  try {
    const socketPath = process.env.OMD_CODEX_AUTHORITY_SOCKET;
    const activationPath = process.env.OMD_ACTIVATION_PATH;
    const responseDirectory = process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR;
    const publicKeyPath = process.env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH;
    if (socketPath === undefined || activationPath === undefined || responseDirectory === undefined || publicKeyPath === undefined
      || !isAbsolute(socketPath) || !isAbsolute(activationPath) || !isAbsolute(responseDirectory) || !isAbsolute(publicKeyPath)
      || socketPath.includes('\0') || activationPath.includes('\0') || responseDirectory.includes('\0') || publicKeyPath.includes('\0')) return undefined;
    const canonicalActivationPath = realpathSync(activationPath);
    const canonicalPublicKeyPath = realpathSync(publicKeyPath);
    const activationStat = lstatSync(canonicalActivationPath);
    const publicKeyStat = lstatSync(canonicalPublicKeyPath);
    if (!activationStat.isFile() || activationStat.isSymbolicLink() || (activationStat.mode & 0o222) !== 0
      || !publicKeyStat.isFile() || publicKeyStat.isSymbolicLink() || (publicKeyStat.mode & 0o222) !== 0
      || dirname(canonicalPublicKeyPath) !== dirname(canonicalActivationPath)) return undefined;
    requireImmutableInvocationIdentity(invocation);
    const activation = validateActivationContext(invocation.activation);
    const brokerCliPath = resolveCodexAuthorityCliPath(executedCliPath, process.argv);
    if (activation.hostCapability.host !== 'codex' || brokerCliPath === undefined) return undefined;
    const root = canonicalProjectRoot(projectRoot);
    const brokerResponse = requestCodexHostAuthority(socketPath, {
      schema: 'omd-codex-authority-request-v1',
      requesterPid: process.pid,
      cliPath: brokerCliPath,
      activationPath: canonicalActivationPath,
      projectRoot: root,
      argv: process.argv,
      activation,
      ...(requestedAuthorization === undefined ? {} : { requestedAuthorization }),
    });
    if (!isRecord(brokerResponse) || !hasExactKeys(brokerResponse, ['receipt', 'signature']) || typeof brokerResponse.signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(brokerResponse.signature) || !isRecord(brokerResponse.receipt)) return undefined;
    const value = brokerResponse.receipt;
    const signature = Buffer.from(brokerResponse.signature, 'base64');
    const publicKey = createPublicKey(readFileSync(canonicalPublicKeyPath));
    if (!verify(null, Buffer.from(canonicalJson(value)), publicKey, signature)) return undefined;
    if (!hasExactKeys(value, ['schema', 'host', 'hostAuthentication', 'projectRoot', 'argvSha256', 'buildSha256', 'loadedSkillSha256', 'briefSha256', 'payloadAuthorizations', 'expiresAt', 'nonce'])) return undefined;
    if (value.schema !== HOST_PROJECT_WRITE_RECEIPT_SCHEMA || value.host !== 'codex' || !isRecord(value.hostAuthentication) || !hasExactKeys(value.hostAuthentication, ['host', 'mechanism', 'parentPid', 'parentExecutableSha256']) || value.hostAuthentication.host !== 'codex' || value.hostAuthentication.mechanism !== 'brokered-ipc' || !Number.isSafeInteger(value.hostAuthentication.parentPid) || Number(value.hostAuthentication.parentPid) <= 0 || typeof value.hostAuthentication.parentExecutableSha256 !== 'string' || !SHA256.test(value.hostAuthentication.parentExecutableSha256) || value.projectRoot !== root || value.argvSha256 !== inheritedArgvSha256 || value.buildSha256 !== activation.buildSha256 || value.loadedSkillSha256 !== activation.loadedSkillSha256 || value.briefSha256 !== activation.briefSha256 || !Array.isArray(value.payloadAuthorizations) || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now() || typeof value.nonce !== 'string' || !NONCE.test(value.nonce) || consumedHostReceiptNonces.has(value.nonce)) return undefined;
    const launcherExecutableSha256 = createHash('sha256').update(readFileSync(process.execPath)).digest('hex');
    if (value.hostAuthentication.parentExecutableSha256 !== launcherExecutableSha256) return undefined;
    if (!value.payloadAuthorizations.every((authorization) => isRecord(authorization) && hasExactKeys(authorization, ['purpose', 'payloadSha256']) && typeof authorization.purpose === 'string' && HOST_PAYLOAD_AUTHORIZATION_PURPOSES.includes(authorization.purpose as HostPayloadAuthorizationPurpose) && typeof authorization.payloadSha256 === 'string' && SHA256.test(authorization.payloadSha256))) return undefined;
    const receipt = value as HostProjectWriteReceipt;
    if (requestedAuthorization !== undefined && !receipt.payloadAuthorizations.some((authorization) => authorization.purpose === requestedAuthorization.purpose && authorization.payloadSha256 === requestedAuthorization.payloadSha256)) return undefined;
    consumedHostReceiptNonces.add(receipt.nonce);
    hostProjectWriteReceipts.set(invocation, receipt);
    return receipt;
  } catch {
    return undefined;
  }
}

export type CodexBrokeredBrowserResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
}>;

export function requestCodexBrokeredBrowserCommand(
  role: CodexBrowserRole,
  projectRoot: string,
): CodexBrokeredBrowserResult | undefined {
  try {
    const socketPath = process.env.OMD_CODEX_AUTHORITY_SOCKET;
    const activationPath = process.env.OMD_ACTIVATION_PATH;
    const publicKeyPath = process.env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH;
    if (socketPath === undefined || activationPath === undefined || publicKeyPath === undefined
      || process.env.OMD_CODEX_BROWSER_BROKER_CHILD === '1'
      || executedCliPath !== canonicalCliPath) return undefined;
    const canonicalActivationPath = realpathSync(activationPath);
    const canonicalPublicKeyPath = realpathSync(publicKeyPath);
    const activationFile = lstatSync(canonicalActivationPath);
    const publicKeyFile = lstatSync(canonicalPublicKeyPath);
    if (!activationFile.isFile() || activationFile.isSymbolicLink() || (activationFile.mode & 0o222) !== 0
      || !publicKeyFile.isFile() || publicKeyFile.isSymbolicLink() || (publicKeyFile.mode & 0o222) !== 0
      || dirname(canonicalPublicKeyPath) !== dirname(canonicalActivationPath)) return undefined;
    const invocation = JSON.parse(readFileSync(canonicalActivationPath, 'utf8')) as unknown;
    if (!isRecord(invocation) || !isRecord(invocation.activation)) return undefined;
    const activation = validateActivationContext(invocation.activation);
    if (activation.hostCapability.host !== 'codex') return undefined;
    const root = canonicalProjectRoot(projectRoot);
    const response = requestCodexHostAuthority(socketPath, {
      schema: 'omd-codex-browser-exec-request-v1',
      requesterPid: process.pid,
      cliPath: canonicalCliPath,
      activationPath: canonicalActivationPath,
      projectRoot: root,
      argv: process.argv,
      activation,
      role,
    });
    if (!isRecord(response) || !hasExactKeys(response, ['receipt', 'signature'])
      || typeof response.signature !== 'string' || !isRecord(response.receipt)) return undefined;
    const receipt = response.receipt;
    if (!verify(
      null,
      Buffer.from(canonicalJson(receipt)),
      createPublicKey(readFileSync(canonicalPublicKeyPath)),
      Buffer.from(response.signature, 'base64'),
    ) || !hasExactKeys(receipt, ['schema', 'role', 'projectRoot', 'status', 'stdout', 'stderr'])
      || receipt.schema !== 'omd-codex-browser-exec-result-v1'
      || receipt.role !== role || receipt.projectRoot !== root
      || !Number.isSafeInteger(receipt.status) || Number(receipt.status) < 0
      || typeof receipt.stdout !== 'string' || typeof receipt.stderr !== 'string') return undefined;
    return {
      status: Number(receipt.status),
      stdout: receipt.stdout,
      stderr: receipt.stderr,
    };
  } catch {
    return undefined;
  }
}

function receiptFromInheritedFd(invocation: ProjectRunInvocation, projectRoot: string): HostProjectWriteReceipt | undefined {
  try {
    requireImmutableInvocationIdentity(invocation);
    const activation = validateActivationContext(invocation.activation);
    const root = canonicalProjectRoot(projectRoot);
    const existing = hostProjectWriteReceipts.get(invocation);
    if (existing !== undefined) {
      const parentExecutable = ancestorExecutableSha256(existing.hostAuthentication.parentPid);
      return existing.expiresAt > Date.now()
        && existing.host === activation.hostCapability.host
        && existing.projectRoot === root
        && existing.argvSha256 === inheritedArgvSha256
        && existing.buildSha256 === activation.buildSha256
        && existing.loadedSkillSha256 === activation.loadedSkillSha256
        && existing.briefSha256 === activation.briefSha256
        && parentExecutable !== undefined
        && existing.hostAuthentication.parentExecutableSha256 === parentExecutable
        ? existing
        : undefined;
    }
    const channel = fstatSync(HOST_PROJECT_WRITE_DESCRIPTOR);
    if (!channel.isFIFO() && !channel.isSocket()) return undefined;
    const value = JSON.parse(readFileSync(HOST_PROJECT_WRITE_DESCRIPTOR, 'utf8')) as unknown;
    if (!isRecord(value) || !hasExactKeys(value, ['schema', 'host', 'hostAuthentication', 'projectRoot', 'argvSha256', 'buildSha256', 'loadedSkillSha256', 'briefSha256', 'payloadAuthorizations', 'expiresAt', 'nonce'])) return undefined;
    if (value.schema !== HOST_PROJECT_WRITE_RECEIPT_SCHEMA || (value.host !== 'claude' && value.host !== 'codex') || !isRecord(value.hostAuthentication) || !hasExactKeys(value.hostAuthentication, ['host', 'mechanism', 'parentPid', 'parentExecutableSha256']) || value.hostAuthentication.host !== value.host || value.hostAuthentication.mechanism !== 'inherited-ipc' || !Number.isSafeInteger(value.hostAuthentication.parentPid) || Number(value.hostAuthentication.parentPid) <= 0 || typeof value.hostAuthentication.parentExecutableSha256 !== 'string' || !SHA256.test(value.hostAuthentication.parentExecutableSha256) || typeof value.projectRoot !== 'string' || typeof value.argvSha256 !== 'string' || !SHA256.test(value.argvSha256) || !Array.isArray(value.payloadAuthorizations) || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || typeof value.nonce !== 'string' || !NONCE.test(value.nonce)) return undefined;
    const parentExecutable = ancestorExecutableSha256(Number(value.hostAuthentication.parentPid));
    if (parentExecutable === undefined || value.hostAuthentication.parentExecutableSha256 !== parentExecutable) return undefined;
    if (!value.payloadAuthorizations.every((authorization) => isRecord(authorization) && hasExactKeys(authorization, ['purpose', 'payloadSha256']) && typeof authorization.purpose === 'string' && HOST_PAYLOAD_AUTHORIZATION_PURPOSES.includes(authorization.purpose as HostPayloadAuthorizationPurpose) && typeof authorization.payloadSha256 === 'string' && SHA256.test(authorization.payloadSha256)) || new Set(value.payloadAuthorizations.map((authorization) => `${authorization.purpose}:${authorization.payloadSha256}`)).size !== value.payloadAuthorizations.length) return undefined;
    const receipt = value as HostProjectWriteReceipt;
    if (executedCliPath !== canonicalCliPath || receipt.host !== activation.hostCapability.host || receipt.projectRoot !== root || receipt.argvSha256 !== inheritedArgvSha256 || receipt.buildSha256 !== activation.buildSha256 || receipt.loadedSkillSha256 !== activation.loadedSkillSha256 || receipt.briefSha256 !== activation.briefSha256 || receipt.expiresAt <= Date.now() || consumedHostReceiptNonces.has(receipt.nonce)) return undefined;
    consumedHostReceiptNonces.add(receipt.nonce);
    hostProjectWriteReceipts.set(invocation, receipt);
    return receipt;
  } catch {
    return undefined;
  }
}
export type TestPayloadAuthorization = Readonly<{ purpose: HostPayloadAuthorizationPurpose; payload: Uint8Array; }>;
export function authorizeTestPayloads(invocation: ProjectRunInvocation, projectRoot: string, authorizations: readonly TestPayloadAuthorization[]): void {
  if (!NODE_TEST_MODE) throw new ActivationContextValidationError('test payload authorization is available only in the Node test runner');
  requireImmutableInvocationIdentity(invocation);
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
  requireImmutableInvocationIdentity(invocation);
  const canonicalRoot = canonicalProjectRoot(projectRoot);
  const testAuthorization = testPayloadAuthorizations.get(invocation);
  if (testAuthorization?.projectRoot === canonicalRoot && testAuthorization.authorizations.has(payloadAuthorizationKey(purpose, payload))) return;
  const requestedAuthorization = {
    purpose,
    payloadSha256: payloadSha256(payload),
    payloadBase64: Buffer.from(payload).toString('base64'),
  };
  const inherited = receiptFromInheritedFd(invocation, canonicalRoot);
  if (inherited !== undefined && inherited.expiresAt > Date.now() && inherited.payloadAuthorizations.some((authorization) => authorization.purpose === purpose && authorization.payloadSha256 === requestedAuthorization.payloadSha256)) return;
  const brokered = receiptFromCodexBroker(invocation, canonicalRoot, requestedAuthorization);
  if (brokered === undefined || !brokered.payloadAuthorizations.some((authorization) => authorization.purpose === purpose && authorization.payloadSha256 === requestedAuthorization.payloadSha256)) throw new ActivationContextValidationError(`host receipt does not authorize the exact ${purpose} payload`);
}
export function isHostDerivedLocalCliInvocation(invocation: object): boolean { return localCliInvocations.has(invocation); }
export function hasHostBoundLocalProjectWriteAuthority(invocation: object, projectRoot: string): boolean {
  try {
    requireImmutableInvocationIdentity(invocation as ProjectRunInvocation);
    const context = validateActivationContext((invocation as ProjectRunInvocation).activation);
    if (NODE_TEST_MODE && localCliInvocations.has(invocation)) return localCliProjectRoots.get(invocation) === canonicalProjectRoot(projectRoot);
    if (context.hostCapability.host === 'local') return localCliProjectRoots.get(invocation) === canonicalProjectRoot(projectRoot);
    return (context.hostCapability.host === 'claude' || context.hostCapability.host === 'codex')
      && (receiptFromInheritedFd(invocation as ProjectRunInvocation, projectRoot)
        ?? receiptFromCodexBroker(invocation as ProjectRunInvocation, projectRoot)) !== undefined;
  } catch { return false; }
}
export function hostBoundLocalProjectRoot(invocation: object): string | undefined { return localCliProjectRoots.get(invocation); }
