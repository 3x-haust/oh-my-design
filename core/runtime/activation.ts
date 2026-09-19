import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, fstatSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimNonce, mintSelfSignedReceipt, verifySelfSignedReceipt, type SelfSignedReceipt } from './self-signed-activation.ts';
import type { ProjectRunInvocation } from './invocation.ts';
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
  'production-owner-repair',
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
const localCliReceipts = new WeakMap<object, SelfSignedReceipt>();
const localCliSignatures = new WeakMap<object, Buffer>();
const hostProjectWriteReceipts = new WeakMap<object, HostProjectWriteReceipt>();
// Diagnostics are not authority and never participate in receipt validation or issuance.
const hostProjectWriteFailures = new WeakMap<object, string>();
const consumedHostReceiptNonces = new Set<string>();
const testPayloadAuthorizations = new WeakMap<object, { readonly projectRoot: string; readonly authorizations: ReadonlySet<string>; }>();
/** Payloads this process derived and authorized itself, keyed by purpose and exact digest. */
const derivedPayloadAuthorizations = new WeakMap<object, { readonly projectRoot: string; readonly authorizations: ReadonlySet<string>; }>();
const observedCodexAiDecisions = new WeakMap<object, { readonly projectRoot: string; readonly digests: Set<string> }>();
const invocationIdentities = new WeakMap<object, Readonly<{
  host: HostCapability['host'];
  buildSha256: string;
  loadedSkillSha256: string;
  briefSha256: string;
}>>();
const executedCliPath = process.argv[1] ? realpathSync(resolve(process.argv[1])) : undefined;
const canonicalCliPath = realpathSync(fileURLToPath(new URL('../../bin/omd.ts', import.meta.url)));
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
): string | undefined {
  return executedPath === cliPath ? cliPath : undefined;
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
  localCliInvocations.add(invocation); localCliProjectRoots.set(invocation, projectRoot);
  // The write gate asks for a receipt bound to this exact command and build, so the process that
  // issues the invocation also mints it. Minting here rather than at each write means one receipt
  // covers one command, and a receipt captured from another run cannot authorize this one.
  try {
    const minted = mintSelfSignedReceipt({
      projectRoot,
      argv: process.argv,
      buildSha256,
      loadedSkillSha256,
      briefSha256,
      payloadAuthorizations: [],
    });
    localCliReceipts.set(invocation, minted.receipt);
    localCliSignatures.set(invocation, minted.signature);
  } catch {
    // A project whose activation key cannot be created simply mints no receipt; the write gate
    // then refuses, which is the correct outcome rather than a silent bypass.
  }
  return invocation;
}
export type CodexBrokeredBrowserResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
}>;

export function recordCodexHostAiDecision(invocation: ProjectRunInvocation, projectRoot: string, payload: Uint8Array): void {
  if (!NODE_TEST_MODE && executedCliPath !== canonicalCliPath) {
    throw new ActivationContextValidationError('AI decision observation belongs to the issuing CLI process');
  }
  requireImmutableInvocationIdentity(invocation);
  if (invocation.activation.hostCapability.host !== 'codex' || !(payload instanceof Uint8Array)) {    throw new ActivationContextValidationError('AI decision observation requires the Codex invocation and exact bytes');
  }
  const root = canonicalProjectRoot(projectRoot);
  const prior = observedCodexAiDecisions.get(invocation);
  if (prior !== undefined && prior.projectRoot !== root) throw new ActivationContextValidationError('AI decision observation is cross-project');
  const entry = prior ?? { projectRoot: root, digests: new Set<string>() };
  entry.digests.add(payloadSha256(payload));
  observedCodexAiDecisions.set(invocation, entry);
}
export function hasCodexHostAiDecision(invocation: ProjectRunInvocation, projectRoot: string, digest: string): boolean {
  const observed = observedCodexAiDecisions.get(invocation);
  return observed?.projectRoot === canonicalProjectRoot(projectRoot) && observed.digests.has(digest);
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
/**
 * Authorizes a payload this process DERIVED, such as the route authority computed from the very
 * record being published.
 *
 * With the brokered launcher gone, nobody else can bless the CLI's own derivation: the route bytes are
 * computed here, so asking a host to authorize them was circular. This records the derivation against
 * the issuing invocation instead, and the check that matters is unchanged — the authorization names
 * the exact purpose and the exact payload digest, so it cannot widen to any other payload and it
 * cannot outlive the invocation.
 *
 * It is deliberately NOT callable for a payload that arrives from outside this process: a caller's
 * bytes must still travel through a signed receipt, which is what `receiptFromSelfSigned` verifies.
 * A CLI launched with `--activation` is the other case, and there the receipt the spawning process
 * wrote is what authorizes this derivation — see `hasDerivedPayloadAuthorization`.
 */
export function authorizeDerivedPayload(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  purpose: HostPayloadAuthorizationPurpose,
  payload: Uint8Array,
): void {
  requireImmutableInvocationIdentity(invocation);
  if (localCliInvocations.has(invocation)) {
    const canonicalRoot = canonicalProjectRoot(projectRoot);
    if (localCliProjectRoots.get(invocation) !== canonicalRoot) {
      throw new ActivationContextValidationError('derived payload authorization project root does not match the invocation');
    }
    if (!(payload instanceof Uint8Array)) throw new ActivationContextValidationError('authorized payload must be exact bytes');
    const existing = derivedPayloadAuthorizations.get(invocation);
    if (existing !== undefined && existing.projectRoot !== canonicalRoot) {
      throw new ActivationContextValidationError('derived payload authorization project root does not match the invocation');
    }
    const keys = new Set(existing?.authorizations);
    keys.add(payloadAuthorizationKey(purpose, payload));
    derivedPayloadAuthorizations.set(invocation, { projectRoot: canonicalRoot, authorizations: keys });
    return;
  }
  // A child CLI holds an invocation read from `--activation`, not one it issued, so it cannot record
  // a derivation against process state the parent cannot see. Its authorization is the self-signed
  // receipt the parent wrote, which the payload check already verifies.
  const receipt = readSelfSignedReceiptFromEnvironment();
  if (receipt === undefined) {
    throw new ActivationContextValidationError('only the issuing CLI may authorize a payload it derived');
  }
}

/**
 * A self-signed receipt supplied through the environment by the minting command.
 *
 * This is the host-independent authorization path: with no brokered launcher, the CLI mints a
 * receipt with its own project key and the consuming command verifies that exact receipt. The
 * nonce is claimed once, so a receipt captured from a prior run is refused rather than replayed.
 */
/**
 * The receipt a spawning process wrote for this child.
 *
 * Read-only and shape-checked here; the caller still verifies the signature and every binding, so a
 * malformed or hostile file yields no authority rather than an error the caller might swallow.
 */
function readSelfSignedReceiptFromEnvironment(): { receipt: SelfSignedReceipt; signature: Buffer } | undefined {
  try {
    const receiptPath = process.env.OMD_SELF_SIGNED_RECEIPT;
    const signaturePath = process.env.OMD_SELF_SIGNED_SIGNATURE;
    if (receiptPath === undefined || signaturePath === undefined || !isAbsolute(receiptPath) || !isAbsolute(signaturePath)) return undefined;
    const stat = lstatSync(receiptPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    return {
      receipt: JSON.parse(readFileSync(receiptPath, 'utf8')) as SelfSignedReceipt,
      signature: Buffer.from(readFileSync(signaturePath, 'utf8').trim(), 'base64'),
    };
  } catch {
    return undefined;
  }
}

function receiptFromSelfSigned(invocation: ProjectRunInvocation, projectRoot: string, requested: { purpose: string; payloadSha256: string }): SelfSignedReceipt | undefined {
  try {
    const receiptPath = process.env.OMD_SELF_SIGNED_RECEIPT;
    const signaturePath = process.env.OMD_SELF_SIGNED_SIGNATURE;
    if (receiptPath === undefined || signaturePath === undefined || !isAbsolute(receiptPath) || !isAbsolute(signaturePath)) return undefined;
    const receiptStat = lstatSync(receiptPath);
    if (!receiptStat.isFile() || receiptStat.isSymbolicLink()) return undefined;
    requireImmutableInvocationIdentity(invocation);
    const activation = validateActivationContext(invocation.activation);
    const verification = verifySelfSignedReceipt({
      // `projectRoot` arrives canonical, and the receipt is minted from a project root that may be a
      // symlinked path (`/tmp` -> `/private/tmp` on macOS). Compare against the receipt's own root by
      // resolving it rather than requiring the caller to have pre-resolved it.
      projectRoot: realpathSync(resolve(projectRoot)),
      receipt: JSON.parse(readFileSync(receiptPath, 'utf8')),
      signature: Buffer.from(readFileSync(signaturePath, 'utf8').trim(), 'base64'),
      expected: {
        // The receipt binds the command that minted it, so replaying it for another command fails.
        argv: process.argv,
        buildSha256: activation.buildSha256,
        loadedSkillSha256: activation.loadedSkillSha256,
        briefSha256: activation.briefSha256,
      },
    });
    if (!verification.ok) return undefined;
    if (!verification.receipt.payloadAuthorizations.some((authorization) => authorization.purpose === requested.purpose && authorization.payloadSha256 === requested.payloadSha256)) return undefined;
    // The nonce is consumed once per receipt so a captured one cannot be replayed in another run.
    // Within one command the write gate and the payload check both verify the SAME receipt, so the
    // claim is made per (receipt, project) pair rather than on every read: consuming it on the first
    // read would make the second read of a legitimate receipt fail.
    if (!claimedReceiptNonces.has(verification.receipt.nonce)) {
      if (!claimNonce(projectRoot, verification.receipt.nonce)) return undefined;
      claimedReceiptNonces.add(verification.receipt.nonce);
    }
    return verification.receipt;
  } catch {
    return undefined;
  }
}

/** Nonces already claimed by THIS process, so one receipt can be read repeatedly within one command. */
const claimedReceiptNonces = new Set<string>();

export function requireHostPayloadAuthorization(invocation: ProjectRunInvocation, projectRoot: string, purpose: HostPayloadAuthorizationPurpose, payload: Uint8Array): void {
  if (!(payload instanceof Uint8Array)) throw new ActivationContextValidationError('authorized payload must be exact bytes');
  requireImmutableInvocationIdentity(invocation);
  const canonicalRoot = canonicalProjectRoot(projectRoot);
  if (purpose === 'ai-asset-decision' && hasCodexHostAiDecision(invocation, canonicalRoot, payloadSha256(payload))) return;
  const testAuthorization = testPayloadAuthorizations.get(invocation);
  if (testAuthorization?.projectRoot === canonicalRoot && testAuthorization.authorizations.has(payloadAuthorizationKey(purpose, payload))) return;
  const derived = derivedPayloadAuthorizations.get(invocation);
  if (derived?.projectRoot === canonicalRoot && derived.authorizations.has(payloadAuthorizationKey(purpose, payload))) return;
  const requestedAuthorization = {
    purpose,
    payloadSha256: payloadSha256(payload),
    payloadBase64: Buffer.from(payload).toString('base64'),
  };
  const selfSigned = receiptFromSelfSigned(invocation, canonicalRoot, requestedAuthorization);
  if (selfSigned !== undefined) return;
  // With the brokered launcher removed, a self-signed receipt is the only way to authorize an
  // AI-derived payload. There is deliberately no fallback: an unauthorized payload fails here.
  throw new ActivationContextValidationError(`no self-signed receipt authorizes the exact ${purpose} payload`);
}
export function isHostDerivedLocalCliInvocation(invocation: object): boolean { return localCliInvocations.has(invocation); }

/**
 * The write gate.
 *
 * A run may write to a project only when it holds a receipt signed by that project's key and bound
 * to this exact command, build, skill bytes, and brief. Being "a local invocation" is not enough:
 * that would authorize any process that can import this module, which is the hollow gate the
 * launcher's removal would otherwise leave behind.
 */
export function hasHostBoundLocalProjectWriteAuthority(invocation: object, projectRoot: string): boolean {
  try {
    requireImmutableInvocationIdentity(invocation as ProjectRunInvocation);
    const context = validateActivationContext((invocation as ProjectRunInvocation).activation);
    const canonicalRoot = canonicalProjectRoot(projectRoot);
    // Two lawful sources of the same authority, both re-verified below:
    //   - a locally issued invocation, which minted its receipt in this process;
    //   - an invocation read from `--activation`, which carries the receipt the issuing process
    //     wrote for this exact command. This is how a host session hands authority to a child CLI.
    const inProcess = localCliInvocations.has(invocation) && localCliProjectRoots.get(invocation) === canonicalRoot;
    const fromEnvironment = readSelfSignedReceiptFromEnvironment();
    if (!inProcess && fromEnvironment === undefined) return false;
    const candidate = inProcess ? localCliReceipts.get(invocation) : fromEnvironment!.receipt;
    if (candidate === undefined) return false;
    const verification = verifySelfSignedReceipt({
      projectRoot: realpathSync(resolve(projectRoot)),
      receipt: candidate,
      signature: inProcess ? signatureFor(invocation) : fromEnvironment!.signature,
      expected: {
        argv: process.argv,
        buildSha256: context.buildSha256,
        loadedSkillSha256: context.loadedSkillSha256,
        briefSha256: context.briefSha256,
      },
    });
    if (!verification.ok) return false;
    // The nonce is spent here too, not only on the payload path. A receipt replayed for a write-only
    // command would otherwise be accepted every time, which is exactly the hole a one-shot receipt
    // exists to close. Within one command the claim is memoised, so the write gate and the payload
    // check can both read the same legitimate receipt.
    if (!claimedReceiptNonces.has(verification.receipt.nonce)) {
      if (!claimNonce(canonicalRoot, verification.receipt.nonce)) return false;
      claimedReceiptNonces.add(verification.receipt.nonce);
    }
    return true;
  } catch { return false; }
}
export function hostBoundLocalProjectRoot(invocation: object): string | undefined { return localCliProjectRoots.get(invocation); }
const signatureFor = (invocation: object): Buffer => localCliSignatures.get(invocation) ?? Buffer.alloc(0);
export function hostProjectWriteAuthorityFailure(invocation: object): string | undefined {
  return hostProjectWriteFailures.get(invocation);
}
