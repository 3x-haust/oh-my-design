import { spawn, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { appendFileSync, chmodSync, closeSync, existsSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, watch, writeFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Writable } from 'node:stream';
import { parse as parseToml } from 'smol-toml';
import { canonicalSkillSourceBytes, createBuildIdentityFromSource, type BuildIdentity } from './build.ts';
import {
  CODEX_HOST_LOADED_SKILL_RECEIPT_SCHEMA_VERSION,
  createCodexHostInvocation,
  observeCodexLoadedSkill,
  type CodexHostLoadedSkillReceipt,
} from './codex.ts';
import { HOST_PAYLOAD_AUTHORIZATION_PURPOSES, type HostPayloadAuthorizationPurpose } from '../core/runtime/activation.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { adaptiveRouteAuthorityBytes, adaptiveRouteAuthorityPath } from '../core/route/adaptive-route-authority.ts';
import { parseRouteRecord } from '../core/route/adaptive-route-record.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUTHORITY_REQUEST_SCHEMA = 'omd-codex-authority-request-v1';
const OWNER_REQUEST_SCHEMA = 'omd-codex-owner-launch-request-v1';
const OWNER_GRANT_SCHEMA = 'omd-codex-owner-launch-grant-v2';
const OWNER_EXEC_REQUEST_SCHEMA = 'omd-codex-owner-exec-request-v1';
const OWNER_EXEC_RESULT_SCHEMA = 'omd-codex-owner-exec-result-v1';
const OWNER_PERSIST_REQUEST_SCHEMA = 'omd-codex-owner-persist-request-v1';
const OWNER_PERSIST_ACK_SCHEMA = 'omd-codex-owner-persist-ack-v1';
const OWNER_RESULT_SCHEMA = 'omd-production-owner-result-v1';
const DELEGATED_ACTIVATION_SCHEMA = 'omd-codex-delegated-owner-activation-v1';
const HOST_RECEIPT_SCHEMA = 'omd-host-project-write-receipt-v3';
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_OWNER_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_OWNER_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_TTL_MS = 60_000;
const OWNER_GRANT_TTL_MS = (2 * MAX_OWNER_TIMEOUT_MS) + RECEIPT_TTL_MS;
const DELEGATED_OPERATIONS = ['project-write'] as const;
const DELEGATED_PAYLOAD_PURPOSES = [
  'adaptive-route-authority',
  'workflow-production-slice',
] as const satisfies readonly HostPayloadAuthorizationPurpose[];

type PayloadAuthorization = Readonly<{ purpose: HostPayloadAuthorizationPurpose; payloadSha256: string }>;
type RequestedPayloadAuthorization = PayloadAuthorization & Readonly<{ payloadBase64: string; payload: Buffer }>;
type RequestIdentity = Readonly<{
  requestId: string;
  clientPid: number;
  requesterPid: number;
  cliPath: string;
  activationPath: string;
  projectRoot: string;
  argv: readonly string[];
  activation: ProjectRunInvocation['activation'];
}>;
type AuthorityRequest = RequestIdentity & Readonly<{
  schema: typeof AUTHORITY_REQUEST_SCHEMA;
  requestedAuthorization?: RequestedPayloadAuthorization;
}>;
type OwnerLaunchRequest = RequestIdentity & Readonly<{
  schema: typeof OWNER_REQUEST_SCHEMA;
  owner: 'omd-hand';
  taskSha256: string;
}>;
type OwnerExecRequest = RequestIdentity & Readonly<{
  schema: typeof OWNER_EXEC_REQUEST_SCHEMA;
  owner: 'omd-hand';
  taskSha256: string;
  grantNonce: string;
  attempt: 1 | 2;
  timeoutMs: number;
  task: string;
}>;
type OwnerPersistRequest = RequestIdentity & Readonly<{
  schema: typeof OWNER_PERSIST_REQUEST_SCHEMA;
  owner: 'omd-hand';
  taskSha256: string;
  grantNonce: string;
  resultSha256: string;
  result: Record<string, unknown>;
}>;
type OwnerStorage = Readonly<{
  directory: string;
  receiptPath: string;
  device: string;
  inode: string;
}>;
type RouteBinding = Readonly<{
  routeSha256: string;
  sourceSha256: string;
  authoritySha256: string;
  allowedPaths: readonly string[];
}>;
type OwnerChildBinding = Readonly<{
  pid: number;
  processStartIdentity: string;
  activationPath: string;
  activationDevice: string;
  activationInode: string;
  argvSha256: string;
  sessionNonce: string;
  taskSha256: string;
  route: RouteBinding;
  expiresAt: number;
}>;
type OwnerBrokerState = {
  grant?: Readonly<{
    requesterPid: number;
    argvSha256: string;
    taskSha256: string;
    nonce: string;
    expiresAt: number;
    route: RouteBinding;
  }>;
  children: Map<number, OwnerChildBinding>;
  nextAttempt: 1 | 2 | 3;
  sessionIds: Set<string>;
  completed: boolean;
  trustedBrowserResults: Set<string>;
};
type OwnerRoleProfile = Readonly<{ name: 'omd-hand'; model_reasoning_effort: string; developer_instructions: string }>;

export type CodexHostLaunchResult = Readonly<{
  status: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  runDirectory: string;
  activationPath: string;
  activationEvidencePath: string;
  loadedSkillReceiptPath: string;
  authoritySocketPath: string;
  ownerDirectory: string;
  ownerReceiptPath: string;
}>;

export type CodexHostLaunchDependencies = Readonly<{
  codexBin?: string;
  packageRoot?: string;
  codexHome?: string;
  installedSkillRoot?: string;
  env?: NodeJS.ProcessEnv;
  receiptRetentionMs?: number;
  captureOutput?: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Codex launch binding contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) throw new Error('Codex launch binding must be JSON-compatible');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

export type ResolvedCodexHostExecutable = Readonly<{
  path: string;
  sha256: string;
  device: string;
  inode: string;
}>;

function pathWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function resolveCodexHostExecutable(input: string, env: NodeJS.ProcessEnv, projectRoot: string): ResolvedCodexHostExecutable {
  if (typeof input !== 'string' || input === '' || input.includes('\0')) throw new Error('Codex host launch requires a trusted Codex executable');
  const root = realpathSync(projectRoot);
  let selected: string | undefined;
  if (isAbsolute(input) || input.includes('/') || input.includes('\\')) selected = resolve(input);
  else {
    for (const entry of (env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
      const directory = resolve(entry === '' ? process.cwd() : entry);
      let canonicalDirectory: string;
      try { canonicalDirectory = realpathSync(directory); } catch { continue; }
      if (pathWithin(root, canonicalDirectory)) continue;
      const candidate = join(canonicalDirectory, input);
      try {
        const stat = lstatSync(candidate);
        if ((stat.isFile() || stat.isSymbolicLink()) && (stat.mode & 0o111) !== 0) { selected = candidate; break; }
      } catch { /* PATH entry does not provide Codex */ }
    }
  }
  if (selected === undefined) throw new Error('Codex host launch requires a trusted Codex executable outside the project PATH');
  const path = realpathSync(selected);
  const stat = lstatSync(path);
  if (!isAbsolute(path) || !stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o111) === 0 || pathWithin(root, path)) {
    throw new Error('Codex host launch requires a canonical absolute regular non-symlink executable outside the project');
  }
  return Object.freeze({ path, sha256: sha256(readFileSync(path)), device: String(stat.dev), inode: String(stat.ino) });
}

function requireUnchangedCodexExecutable(executable: ResolvedCodexHostExecutable): void {
  const stat = lstatSync(executable.path);
  if (!stat.isFile() || stat.isSymbolicLink() || String(stat.dev) !== executable.device
    || String(stat.ino) !== executable.inode || sha256(readFileSync(executable.path)) !== executable.sha256) {
    throw new Error('Codex executable identity changed before launch');
  }
}

export function parseCodexHostPayloadAuthorization(value: unknown): RequestedPayloadAuthorization | undefined {
  if (!isRecord(value) || !exactKeys(value, ['purpose', 'payloadSha256', 'payloadBase64'])
    || typeof value.purpose !== 'string' || !HOST_PAYLOAD_AUTHORIZATION_PURPOSES.includes(value.purpose as HostPayloadAuthorizationPurpose)
    || typeof value.payloadSha256 !== 'string' || !SHA256.test(value.payloadSha256)
    || typeof value.payloadBase64 !== 'string' || value.payloadBase64.length > Math.ceil(MAX_REQUEST_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.payloadBase64)) return undefined;
  const payload = Buffer.from(value.payloadBase64, 'base64');
  if (payload.byteLength === 0 || payload.byteLength > MAX_REQUEST_BYTES
    || payload.toString('base64') !== value.payloadBase64 || sha256(payload) !== value.payloadSha256) return undefined;
  return Object.freeze({ purpose: value.purpose as HostPayloadAuthorizationPurpose, payloadSha256: value.payloadSha256, payloadBase64: value.payloadBase64, payload });
}

function canonicalProjectRoot(path: string): string {
  const root = realpathSync(resolve(path));
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Codex project root must be an existing real directory');
  return root;
}

function projectRootFromArgs(args: readonly string[], cwd: string): string {
  if (args[0] !== 'exec') throw new Error('usage: omd-codex exec [codex exec options] [prompt]');
  let selected = cwd;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '-C' || arg === '--cd') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) throw new Error(`${arg} requires a project directory`);
      selected = value;
      index += 1;
    } else if (arg.startsWith('--cd=')) selected = arg.slice('--cd='.length);
  }
  return canonicalProjectRoot(selected);
}

function installedSkillBytes(packageRoot: string, installedSkillRoot: string): string {
  const shippedRoot = join(packageRoot, 'dist', 'codex', 'skills');
  const names = readdirSync(shippedRoot).filter((name) => existsSync(join(shippedRoot, name, 'SKILL.md'))).sort();
  if (names.length === 0) throw new Error('Codex host launch requires a built OMD skill payload');
  const skills = names.map((name) => {
    const path = join(installedSkillRoot, name, 'SKILL.md');
    if (!existsSync(path)) throw new Error(`Codex host launch requires the installed ${name} skill; run oh-my-design install --host=codex`);
    return { name, source: readFileSync(path, 'utf8') };
  });
  return canonicalSkillSourceBytes(skills);
}

function sameActivation(left: ProjectRunInvocation['activation'], right: ProjectRunInvocation['activation']): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function validRequestIdentity(value: Record<string, unknown>): boolean {
  return typeof value.requestId === 'string' && /^[A-Za-z0-9_-]{24}$/.test(value.requestId)
    && Number.isSafeInteger(value.clientPid) && Number(value.clientPid) > 0
    && Number.isSafeInteger(value.requesterPid) && Number(value.requesterPid) > 0
    && typeof value.cliPath === 'string' && typeof value.activationPath === 'string'
    && typeof value.projectRoot === 'string' && Array.isArray(value.argv)
    && value.argv.every((arg) => typeof arg === 'string') && isRecord(value.activation);
}

function parseRequest(value: unknown): AuthorityRequest | undefined {
  if (!isRecord(value) || !exactKeys(value, ['schema', 'requestId', 'clientPid', 'requesterPid', 'cliPath', 'activationPath', 'projectRoot', 'argv', 'activation', ...(Object.hasOwn(value, 'requestedAuthorization') ? ['requestedAuthorization'] : [])])) return undefined;
  if (value.schema !== AUTHORITY_REQUEST_SCHEMA || !validRequestIdentity(value)) return undefined;
  if (value.requestedAuthorization !== undefined) {
    const authorization = parseCodexHostPayloadAuthorization(value.requestedAuthorization);
    if (authorization === undefined) return undefined;
    return { ...value, requestedAuthorization: authorization } as AuthorityRequest;
  }
  return value as AuthorityRequest;
}

function parseOwnerRequest(value: unknown): OwnerLaunchRequest | undefined {
  if (!isRecord(value) || !exactKeys(value, ['schema', 'requestId', 'clientPid', 'requesterPid', 'cliPath', 'activationPath', 'projectRoot', 'argv', 'activation', 'owner', 'taskSha256'])) return undefined;
  if (value.schema !== OWNER_REQUEST_SCHEMA || !validRequestIdentity(value) || value.owner !== 'omd-hand'
    || typeof value.taskSha256 !== 'string' || !SHA256.test(value.taskSha256)) return undefined;
  return value as OwnerLaunchRequest;
}

function parseOwnerExecRequest(value: unknown): OwnerExecRequest | undefined {
  if (!isRecord(value) || !exactKeys(value, ['schema', 'requestId', 'clientPid', 'requesterPid', 'cliPath', 'activationPath', 'projectRoot', 'argv', 'activation', 'owner', 'taskSha256', 'grantNonce', 'attempt', 'timeoutMs', 'task'])) return undefined;
  if (value.schema !== OWNER_EXEC_REQUEST_SCHEMA || !validRequestIdentity(value) || value.owner !== 'omd-hand'
    || typeof value.taskSha256 !== 'string' || !SHA256.test(value.taskSha256)
    || typeof value.grantNonce !== 'string' || !/^[A-Za-z0-9_-]{32,}$/.test(value.grantNonce)
    || (value.attempt !== 1 && value.attempt !== 2) || !Number.isSafeInteger(value.timeoutMs)
    || Number(value.timeoutMs) < 25 || Number(value.timeoutMs) > MAX_OWNER_TIMEOUT_MS
    || typeof value.task !== 'string' || value.task.trim() === '' || sha256(value.task) !== value.taskSha256) return undefined;
  return value as OwnerExecRequest;
}

function parseOwnerPersistRequest(value: unknown): OwnerPersistRequest | undefined {
  if (!isRecord(value) || !exactKeys(value, ['schema', 'requestId', 'clientPid', 'requesterPid', 'cliPath', 'activationPath', 'projectRoot', 'argv', 'activation', 'owner', 'taskSha256', 'grantNonce', 'resultSha256', 'result'])) return undefined;
  if (value.schema !== OWNER_PERSIST_REQUEST_SCHEMA || !validRequestIdentity(value) || value.owner !== 'omd-hand'
    || typeof value.taskSha256 !== 'string' || !SHA256.test(value.taskSha256)
    || typeof value.grantNonce !== 'string' || !/^[A-Za-z0-9_-]{32,}$/.test(value.grantNonce)
    || typeof value.resultSha256 !== 'string' || !SHA256.test(value.resultSha256) || !isRecord(value.result)
    || sha256(`${canonicalJson(value.result)}\n`) !== value.resultSha256) return undefined;
  return value as OwnerPersistRequest;
}

type ProcessRecord = Readonly<{ ppid: number; command: string; started: string }>;

function escapedRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function isExactCanonicalCliInvocation(command: string, argv: readonly string[], canonicalCliPath: string): boolean {
  if (argv.length < 3 || argv[0] !== process.execPath || argv[1] !== canonicalCliPath) return false;
  const marker = new RegExp(`(?:^|\\s)${escapedRegExp(canonicalCliPath)}(?=\\s|$)`, 'g');
  const matches = [...command.matchAll(marker)];
  if (matches.length !== 1) return false;
  const scriptStart = matches[0]!.index! + (matches[0]![0].startsWith(' ') ? 1 : 0);
  const prefix = command.slice(0, scriptStart).trimEnd();
  if (prefix !== process.execPath) {
    const loader = resolve(dirname(dirname(canonicalCliPath)), 'node_modules', 'tsx', 'dist', 'loader.mjs');
    try {
      const loaderStat = lstatSync(loader);
      if (!loaderStat.isFile() || loaderStat.isSymbolicLink()
        || prefix !== `${process.execPath} --import ${realpathSync(loader)}`) return false;
    } catch {
      return false;
    }
  }
  return command.slice(scriptStart + canonicalCliPath.length).trim() === argv.slice(2).join(' ');
}

const PAYLOAD_OPERATION_PHASES: Readonly<Partial<Record<HostPayloadAuthorizationPurpose, readonly (readonly string[])[]>>> = Object.freeze({
  // These are the only dynamic broker phases whose bytes are deterministically produced by the
  // named canonical CLI operation. Reviewer, evaluator, browser, and final-result purposes require
  // a separate host-observed producer and are deliberately not signing-oracle fallbacks.
  'adaptive-route-authority': Object.freeze([
    Object.freeze(['route', 'classify']),
    Object.freeze(['route', 'show']),
    Object.freeze(['route', 'check']),
  ]),
  'workflow-production-slice': Object.freeze([
    Object.freeze(['workflow', 'slice']),
    Object.freeze(['owner', 'run']),
  ]),
});

export function codexPayloadAuthorizationPhaseError(argv: readonly string[], purpose: HostPayloadAuthorizationPurpose): string | undefined {
  const operation = argv.slice(2);
  const phases = PAYLOAD_OPERATION_PHASES[purpose];
  return phases?.some((phase) => phase.every((part, index) => operation[index] === part)) === true
    ? undefined
    : `the ${purpose} payload requires an exact trusted host-observed CLI phase (received: ${operation.join(' ')})`;
}

function brokerPayloadAuthorizationError(
  request: AuthorityRequest,
  state: OwnerBrokerState,
): string | undefined {
  const authorization = request.requestedAuthorization;
  if (authorization === undefined) return undefined;
  if (authorization.purpose !== 'product-probe-result') {
    return codexPayloadAuthorizationPhaseError(request.argv, authorization.purpose);
  }
  let schema: unknown;
  let value: unknown;
  try {
    value = JSON.parse(authorization.payload.toString('utf8'));
    schema = isRecord(value) ? value.schema : undefined;
  } catch {
    return 'product probe authority requires canonical JSON bytes from a trusted producer';
  }
  const operation = request.argv.slice(2);
  const lifecycleRun = operation[0] === 'lifecycle'
    && (operation[1] === 'run' || operation[1] === 'evaluate');
  if (schema === 'trusted-lifecycle-manifest-v1' && lifecycleRun) return undefined;
  if (schema === 'trusted-browser-receipt-v1' && lifecycleRun) {
    state.trustedBrowserResults.add(authorization.payloadSha256);
    return undefined;
  }
  const finalization = (operation[0] === 'lifecycle' && operation[1] === 'finalize')
    || (operation[0] === 'evidence' && operation[1] === 'v2' && operation[2] === 'finalize');
  if (schema === 'trusted-browser-receipt-v1' && finalization
    && state.trustedBrowserResults.has(authorization.payloadSha256)) return undefined;
  if (operation[0] === 'completion' && operation[1] === 'typography'
    && operation[2] === 'applicability' && isRecord(value)
    && isRecord(value.meta) && value.meta.source === 'dom') return undefined;
  return 'product probe payload was not observed from its exact trusted CLI producer phase';
}
function processRecord(pid: number): ProcessRecord | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'ppid=', '-o', 'lstart=', '-o', 'command='], { encoding: 'utf8', env: { PATH: '' } });
  if (result.status !== 0) return undefined;
  const match = /^\s*(\d+)\s+(.{24})\s+(.+)$/.exec(result.stdout.trim());
  if (match === null) return undefined;
  const ppid = Number(match[1]);
  return Number.isSafeInteger(ppid) && ppid > 0 ? { ppid, started: match[2]!, command: match[3]! } : undefined;
}
function processStartIdentity(pid: number, record: ProcessRecord): string {
  return sha256(canonicalJson({ pid, ppid: record.ppid, started: record.started }));
}
function isDescendant(pid: number, ancestorPid: number): boolean {
  let cursor = pid;
  for (let depth = 0; depth < 32 && cursor > 1; depth += 1) {
    if (cursor === ancestorPid) return true;
    const record = processRecord(cursor);
    if (record === undefined || record.ppid === cursor) return false;
    cursor = record.ppid;
  }
  return false;
}
function processBindingError(request: RequestIdentity, canonicalCliPath: string, canonicalCliSha256: string, ancestorPid: number | undefined, ancestorLabel: string): string | undefined {
  const client = processRecord(request.clientPid);
  if (client === undefined || client.ppid !== request.requesterPid) return 'authority client is not a direct child of the requester';
  const requester = processRecord(request.requesterPid);
  if (requester === undefined || !isExactCanonicalCliInvocation(requester.command, request.argv, canonicalCliPath)) {
    return `requester is not the exact canonical OMD CLI invocation${requester === undefined ? '' : `: ${requester.command}`}`;
  }
  try {
    if (sha256(readFileSync(canonicalCliPath)) !== canonicalCliSha256) return 'canonical OMD CLI identity changed after host launch';
  } catch { return 'canonical OMD CLI identity is unavailable'; }
  if (ancestorPid === undefined || !isDescendant(request.requesterPid, ancestorPid)) return `requester is not a descendant of the ${ancestorLabel}`;
  return undefined;
}

function currentRouteBinding(projectRoot: string, invocation: ProjectRunInvocation): RouteBinding {
  const routePointer = JSON.parse(readFileSync(join(projectRoot, '.omd', 'route.json'), 'utf8')) as unknown;
  const sourcePointer = JSON.parse(readFileSync(join(projectRoot, '.omd', 'route-source.json'), 'utf8')) as unknown;
  if (!isRecord(routePointer) || !exactKeys(routePointer, ['schema', 'record', 'sha256'])
    || routePointer.schema !== 'adaptive-route-pointer-v1' || typeof routePointer.record !== 'string'
    || typeof routePointer.sha256 !== 'string' || !SHA256.test(routePointer.sha256)
    || routePointer.record !== `route-records/sha256-${routePointer.sha256}.json`
    || !isRecord(sourcePointer) || !exactKeys(sourcePointer, ['schema', 'record', 'sha256'])
    || sourcePointer.schema !== 'adaptive-route-source-pointer-v1' || typeof sourcePointer.record !== 'string'
    || typeof sourcePointer.sha256 !== 'string' || !SHA256.test(sourcePointer.sha256)
    || sourcePointer.record !== `route-sources/sha256-${sourcePointer.sha256}.json`) {
    throw new Error('production-owner route binding is malformed');
  }
  const routeBytes = readFileSync(join(projectRoot, '.omd', routePointer.record));
  const sourceBytes = readFileSync(join(projectRoot, '.omd', sourcePointer.record));
  if (sha256(routeBytes) !== routePointer.sha256 || sha256(sourceBytes) !== sourcePointer.sha256) {
    throw new Error('production-owner route binding is stale');
  }
  const route = parseRouteRecord(JSON.parse(routeBytes.toString('utf8')), { root: projectRoot, invocation });
  if (route.sourceContractSha256 !== sourcePointer.sha256) throw new Error('production-owner route source binding is stale');
  const authorityBytes = adaptiveRouteAuthorityBytes(route, routePointer.sha256, invocation);
  const persistedAuthority = readFileSync(join(projectRoot, '.omd', adaptiveRouteAuthorityPath(authorityBytes)));
  if (!persistedAuthority.equals(authorityBytes)) throw new Error('production-owner route authority is absent or stale');
  return Object.freeze({
    routeSha256: routePointer.sha256,
    sourceSha256: sourcePointer.sha256,
    authoritySha256: sha256(authorityBytes),
    allowedPaths: Object.freeze([...route.allowedPaths]),
  });
}
function sameRouteBinding(left: RouteBinding, right: RouteBinding): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

type HostBinding = Readonly<{
  projectRoot: string;
  invocation: ProjectRunInvocation;
  invocationPath: string;
  invocationSha256: string;
  canonicalCliPath: string;
  canonicalCliSha256: string;
  launcherExecutableSha256: string;
  authorityDirectoryDevice: string;
  authorityDirectoryInode: string;
  launchedCodexPid: number | undefined;
}>;
function commonRequestError(request: RequestIdentity, binding: HostBinding): string | undefined {
  const requestRoot = (() => { try { return canonicalProjectRoot(request.projectRoot); } catch { return undefined; } })();
  if (request.cliPath !== binding.canonicalCliPath) return 'request names a foreign OMD CLI path';
  if (request.activationPath !== binding.invocationPath) return 'request activation path is copied, cross-run, or delegated to another process';
  const processError = processBindingError(request, binding.canonicalCliPath, binding.canonicalCliSha256, binding.launchedCodexPid, 'launched Codex host process');
  if (processError !== undefined) return processError;
  if (requestRoot !== binding.projectRoot) return 'request project does not match the launched project';
  if (!sameActivation(request.activation, binding.invocation.activation)) return 'request activation is forged, copied, or stale';
  return undefined;
}

function delegatedRequestError(request: AuthorityRequest, binding: HostBinding, child: OwnerChildBinding): string | undefined {
  const childRecord = processRecord(child.pid);
  if (childRecord === undefined || processStartIdentity(child.pid, childRecord) !== child.processStartIdentity) return 'delegated owner activation names a dead or replaced child PID';
  const activationStat = lstatSync(child.activationPath);
  if (!activationStat.isFile() || activationStat.isSymbolicLink() || (activationStat.mode & 0o222) !== 0
    || String(activationStat.dev) !== child.activationDevice || String(activationStat.ino) !== child.activationInode) {
    return 'delegated owner activation was copied, replaced, or made writable';
  }
  const processError = processBindingError(request, binding.canonicalCliPath, binding.canonicalCliSha256, child.pid, 'delegated production-owner child process');
  if (processError !== undefined) return processError;
  const requestRoot = (() => { try { return canonicalProjectRoot(request.projectRoot); } catch { return undefined; } })();
  if (requestRoot !== binding.projectRoot || !sameActivation(request.activation, binding.invocation.activation)) return 'delegated owner activation is cross-project, forged, or stale';
  if (child.expiresAt <= Date.now()) return 'delegated owner activation is stale';
  let route: RouteBinding;
  try { route = currentRouteBinding(binding.projectRoot, binding.invocation); } catch { return 'delegated owner route/source/authority binding is stale'; }
  if (!sameRouteBinding(route, child.route)) return 'delegated owner route/source/authority binding changed';
  if (request.requestedAuthorization !== undefined && !DELEGATED_PAYLOAD_PURPOSES.includes(request.requestedAuthorization.purpose as (typeof DELEGATED_PAYLOAD_PURPOSES)[number])) {
    return 'delegated owner activation does not authorize this operation';
  }
  return undefined;
}

function authorityReceipt(requestValue: unknown, binding: HostBinding, state: OwnerBrokerState): unknown {
  const request = parseRequest(requestValue);
  if (request === undefined) return { error: 'malformed authority request' };
  const child = [...state.children.values()].find((candidate) => candidate.activationPath === request.activationPath);
  const ownerOnly = request.requestedAuthorization?.purpose === 'workflow-production-slice' && child === undefined
    ? 'workflow production slice authority belongs only to the delegated omd-hand owner'
    : undefined;
  const identityError = child === undefined ? commonRequestError(request, binding) : delegatedRequestError(request, binding, child);
  const phaseError = identityError === undefined ? brokerPayloadAuthorizationError(request, state) : undefined;
  const rejected = ownerOnly ?? identityError ?? phaseError;
  if (rejected !== undefined) return { error: rejected };
  return {
    schema: HOST_RECEIPT_SCHEMA,
    host: 'codex',
    hostAuthentication: {
      host: 'codex', mechanism: 'brokered-ipc', parentPid: process.pid,
      parentExecutableSha256: binding.launcherExecutableSha256,
    },
    projectRoot: binding.projectRoot,
    argvSha256: sha256(canonicalJson(request.argv)),
    buildSha256: binding.invocation.activation.buildSha256,
    loadedSkillSha256: binding.invocation.activation.loadedSkillSha256,
    briefSha256: binding.invocation.activation.briefSha256,
    payloadAuthorizations: request.requestedAuthorization === undefined ? [] : [{
      purpose: request.requestedAuthorization.purpose,
      payloadSha256: request.requestedAuthorization.payloadSha256,
    }],
    expiresAt: Math.min(Date.now() + RECEIPT_TTL_MS, child?.expiresAt ?? Number.MAX_SAFE_INTEGER),
    nonce: randomBytes(24).toString('base64url'),
  };
}

function ownerRoleProfile(codexHome: string): OwnerRoleProfile {
  const inputPath = join(codexHome, 'agents', 'omd-hand.toml');
  const inputStat = lstatSync(inputPath);
  if (inputStat.isSymbolicLink()) throw new Error('Codex owner profile is symlinked');
  const path = realpathSync(inputPath);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Codex owner profile is unavailable');
  const parsed = parseToml(readFileSync(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || parsed.name !== 'omd-hand'
    || typeof parsed.model_reasoning_effort !== 'string' || !/^(?:low|medium|high|xhigh)$/.test(parsed.model_reasoning_effort)
    || typeof parsed.developer_instructions !== 'string' || parsed.developer_instructions.trim() === '') {
    throw new Error('Codex owner profile is malformed');
  }
  return parsed as unknown as OwnerRoleProfile;
}

function exactOwnerStorage(storage: OwnerStorage, runDirectory: string): string | undefined {
  try {
    const inputStat = lstatSync(storage.directory);
    if (!inputStat.isDirectory() || inputStat.isSymbolicLink() || (inputStat.mode & 0o777) !== 0o700) return 'production-owner directory is absent, symlinked, or has the wrong mode';
    const canonical = realpathSync(storage.directory);
    if (canonical !== storage.directory || dirname(canonical) !== runDirectory
      || String(inputStat.dev) !== storage.device || String(inputStat.ino) !== storage.inode
      || storage.receiptPath !== join(canonical, 'result.json')) return 'production-owner directory was copied, replaced, or caller-selected';
    return undefined;
  } catch {
    return 'production-owner directory is absent, symlinked, or stale';
  }
}

function validOwnerResult(result: Record<string, unknown>, request: OwnerPersistRequest, binding: HostBinding, storage: OwnerStorage): boolean {
  const allowed = ['schema', 'owner', 'projectRoot', 'taskSha256', 'rolePromptSha256', 'host', 'transport', 'modelArgumentOmitted', 'attempts', 'sourceChanges', 'finalEvidence', 'result', 'failure', 'resumeCommand', 'receiptPath'];
  if (Object.keys(result).some((key) => !allowed.includes(key))) return false;
  return result.schema === OWNER_RESULT_SCHEMA && result.owner === 'omd-hand'
    && result.projectRoot === binding.projectRoot && result.taskSha256 === request.taskSha256
    && typeof result.rolePromptSha256 === 'string' && SHA256.test(result.rolePromptSha256)
    && result.host === 'codex' && result.transport === 'codex-exec-stdio-jsonl'
    && result.modelArgumentOmitted === true && Array.isArray(result.attempts) && result.attempts.length >= 1 && result.attempts.length <= 2
    && Array.isArray(result.sourceChanges) && result.sourceChanges.every((path) => typeof path === 'string')
    && (result.result === 'completed' || result.result === 'failed')
    && (result.failure === undefined || typeof result.failure === 'string')
    && (result.resumeCommand === undefined || typeof result.resumeCommand === 'string')
    && result.receiptPath === storage.receiptPath;
}

function ownerGrant(requestValue: unknown, binding: HostBinding, storage: OwnerStorage, state: OwnerBrokerState, role: OwnerRoleProfile): unknown {
  const request = parseOwnerRequest(requestValue);
  if (request === undefined) return { error: 'malformed production-owner launch request' };
  const rejected = commonRequestError(request, binding) ?? exactOwnerStorage(storage, dirname(storage.directory));
  if (rejected !== undefined) return { error: rejected };
  if (state.completed) return { error: 'OWNER_DUPLICATE_COMPLETION: production-owner already completed for this invocation' };
  if (state.grant !== undefined) return { error: 'OWNER_DUPLICATE_ACTIVE: production-owner is already active for this invocation' };
  let route: RouteBinding;
  try { route = currentRouteBinding(binding.projectRoot, binding.invocation); }
  catch (error) { return { error: error instanceof Error ? error.message : 'production-owner route binding failed' }; }
  const nonce = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + OWNER_GRANT_TTL_MS;
  state.grant = {
    requesterPid: request.requesterPid,
    argvSha256: sha256(canonicalJson(request.argv)),
    taskSha256: request.taskSha256,
    nonce,
    expiresAt,
    route,
  };
  return {
    schema: OWNER_GRANT_SCHEMA,
    host: 'codex', owner: 'omd-hand', projectRoot: binding.projectRoot,
    requesterPid: request.requesterPid,
    argvSha256: state.grant.argvSha256, taskSha256: request.taskSha256,
    buildSha256: binding.invocation.activation.buildSha256,
    loadedSkillSha256: binding.invocation.activation.loadedSkillSha256,
    briefSha256: binding.invocation.activation.briefSha256,
    rolePromptSha256: sha256(role.developer_instructions),
    ownerDirectory: storage.directory, ownerReceiptPath: storage.receiptPath,
    ownerDirectoryDevice: storage.device, ownerDirectoryInode: storage.inode,
    expiresAt,
    nonce,
  };
}

function writeDescriptorFully(descriptor: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (!Number.isSafeInteger(written) || written <= 0) throw new Error('delegated activation write made no progress');
    offset += written;
  }
}

function issueDelegatedOwnerActivation(input: Readonly<{
  descriptor: number;
  path: string;
  stat: ReturnType<typeof fstatSync>;
  childPid: number;
  childArgv: readonly string[];
  request: OwnerExecRequest;
  grant: NonNullable<OwnerBrokerState['grant']>;
  binding: HostBinding;
  state: OwnerBrokerState;
  privateKey: KeyObject;
}>): OwnerChildBinding {
  const record = processRecord(input.childPid);
  if (record === undefined || record.ppid !== process.pid) throw new Error('delegated owner child process identity is unavailable');
  const processIdentity = processStartIdentity(input.childPid, record);
  const nonce = randomBytes(24).toString('base64url');
  const sessionNonce = randomBytes(24).toString('base64url');
  const expiresAt = Math.min(input.grant.expiresAt, Date.now() + input.request.timeoutMs + RECEIPT_TTL_MS);
  const payload = Object.freeze({
    schema: DELEGATED_ACTIVATION_SCHEMA,
    parent: Object.freeze({
      invocationSha256: input.binding.invocationSha256,
      activationSha256: sha256(canonicalJson(input.binding.invocation.activation)),
      routeSha256: input.grant.route.routeSha256,
      sourceSha256: input.grant.route.sourceSha256,
      authoritySha256: input.grant.route.authoritySha256,
      allowedPaths: input.grant.route.allowedPaths,
    }),
    projectRoot: input.binding.projectRoot,
    owner: 'omd-hand',
    taskSha256: input.request.taskSha256,
    ownerInvocationArgvSha256: input.grant.argvSha256,
    childArgvSha256: sha256(canonicalJson(input.childArgv)),
    buildSha256: input.binding.invocation.activation.buildSha256,
    loadedSkillSha256: input.binding.invocation.activation.loadedSkillSha256,
    briefSha256: input.binding.invocation.activation.briefSha256,
    child: Object.freeze({ pid: input.childPid, processStartIdentity: processIdentity, sessionNonce }),
    broker: Object.freeze({
      pid: process.pid,
      executableSha256: input.binding.launcherExecutableSha256,
      authorityDirectoryDevice: input.binding.authorityDirectoryDevice,
      authorityDirectoryInode: input.binding.authorityDirectoryInode,
    }),
    activationFile: Object.freeze({ path: input.path, device: String(input.stat.dev), inode: String(input.stat.ino) }),
    operations: DELEGATED_OPERATIONS,
    payloadAuthorizations: DELEGATED_PAYLOAD_PURPOSES,
    nonce,
    issuedAt: Date.now(),
    expiresAt,
  });
  const delegatedInvocation = {
    activation: input.binding.invocation.activation,
    current: input.binding.invocation.current,
    delegation: {
      payload,
      signature: sign(null, Buffer.from(canonicalJson(payload)), input.privateKey).toString('base64'),
    },
  };
  try {
    writeDescriptorFully(input.descriptor, Buffer.from(`${canonicalJson(delegatedInvocation)}\n`));
    fsyncSync(input.descriptor);
  } finally {
    closeSync(input.descriptor);
  }
  chmodSync(input.path, 0o400);
  const child: OwnerChildBinding = Object.freeze({
    pid: input.childPid,
    processStartIdentity: processIdentity,
    activationPath: input.path,
    activationDevice: String(input.stat.dev),
    activationInode: String(input.stat.ino),
    argvSha256: sha256(canonicalJson(input.childArgv)),
    sessionNonce,
    taskSha256: input.request.taskSha256,
    route: input.grant.route,
    expiresAt,
  });
  input.state.children.set(input.request.attempt, child);
  return child;
}

function killProcessTree(pid: number): void {
  try { process.kill(-pid, 'SIGTERM'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      try { process.kill(pid, 'SIGTERM'); } catch { /* process already exited */ }
    }
  }
}

async function executeOwnerAttempt(
  requestValue: unknown,
  binding: HostBinding,
  state: OwnerBrokerState,
  role: OwnerRoleProfile,
  codexBin: string,
  codexHome: string,
  env: NodeJS.ProcessEnv,
  runDirectory: string,
  privateKey: KeyObject,
): Promise<unknown> {
  const request = parseOwnerExecRequest(requestValue);
  if (request === undefined) return { error: 'malformed production-owner execution request' };
  const rejected = commonRequestError(request, binding);
  if (rejected !== undefined) return { error: rejected };
  const grant = state.grant;
  if (grant === undefined || state.completed || grant.requesterPid !== request.requesterPid
    || grant.argvSha256 !== sha256(canonicalJson(request.argv)) || grant.taskSha256 !== request.taskSha256
    || grant.nonce !== request.grantNonce || grant.expiresAt <= Date.now() || request.attempt !== state.nextAttempt) {
    return { error: 'production-owner execution grant is absent, copied, stale, retried, or mismatched' };
  }
  state.nextAttempt = request.attempt === 1 ? 2 : 3;
  const args = [
    'exec', '--json', '--sandbox', 'workspace-write', '-C', binding.projectRoot, '--skip-git-repo-check',
    '-c', `model_reasoning_effort=${JSON.stringify(role.model_reasoning_effort)}`,
    '-c', `developer_instructions=${JSON.stringify(role.developer_instructions)}`,
    '-',
  ];
  const task = [
    'You are the authenticated omd-hand production owner. Use the exact OMD_ACTIVATION_PATH inherited from the host for every activation-gated command. Do not delegate production writes.',
    '',
    request.task,
  ].join('\n');
  const delegatedActivationPath = join(runDirectory, `production-owner-activation-${request.attempt}.json`);
  const activationDescriptor = openSync(delegatedActivationPath, 'r+');
  const activationStat = fstatSync(activationDescriptor);
  if (!activationStat.isFile() || activationStat.isSymbolicLink() || (activationStat.mode & 0o777) !== 0o600) {
    closeSync(activationDescriptor);
    throw new Error('delegated activation placeholder was replaced or changed');
  }
  ftruncateSync(activationDescriptor, 0);
  const childArgv = [codexBin, ...args];
  return await new Promise<unknown>((resolveAttempt) => {
    const gate = 'IFS= read -r omd_gate <&3 || exit 125; exec 3<&-; test -n "$omd_gate" || exit 126; unset omd_gate; exec "$@"';
    const child = spawn('/bin/sh', ['-c', gate, 'omd-owner-gate', codexBin, ...args], {
      cwd: binding.projectRoot,
      detached: true,
      env: {
        ...env,
        CODEX_HOME: codexHome,
        OMD_ACTIVATION_PATH: delegatedActivationPath,
        OMD_PRODUCTION_OWNER_ROLE: 'omd-hand',
        OMD_PRODUCTION_OWNER_ATTEMPT: String(request.attempt),
      },
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    });
    if (child.pid === undefined) {
      closeSync(activationDescriptor);
      rmSync(delegatedActivationPath, { force: true });
      resolveAttempt({ error: 'production-owner child process did not expose a PID' });
      return;
    }
    let delegated: OwnerChildBinding;
    try {
      delegated = issueDelegatedOwnerActivation({
        descriptor: activationDescriptor,
        path: delegatedActivationPath,
        stat: activationStat,
        childPid: child.pid,
        childArgv,
        request,
        grant,
        binding,
        state,
        privateKey,
      });
      (child.stdio[3] as Writable).end(`${delegated.sessionNonce}\n`);
    } catch (error) {
      try { closeSync(activationDescriptor); } catch { /* delegated issuer may already have closed it */ }
      killProcessTree(child.pid);
      resolveAttempt({ error: `production-owner delegated activation failed: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    let stdoutBuffer = '';
    let outputBytes = 0;
    let sessionId: string | undefined;
    let completedEvent = false;
    let failedEvent = false;
    let finalMessage = '';
    let eventCount = 0;
    let settled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (stdoutBuffer.trim() !== '') consumeLine(stdoutBuffer);
      const status = timedOut ? 'timed-out' : code === 0 && completedEvent && !failedEvent ? 'completed' : 'failed';
      resolveAttempt({
        schema: OWNER_EXEC_RESULT_SCHEMA, owner: 'omd-hand', projectRoot: binding.projectRoot,
        taskSha256: request.taskSha256, grantNonce: request.grantNonce, attempt: request.attempt,
        processPid: child.pid,
        processStartIdentity: delegated.processStartIdentity,
        delegatedActivationSha256: sha256(readFileSync(delegated.activationPath)),
        ...(sessionId === undefined ? {} : { sessionId }),
        status, exitCode: code, signal, eventCount, finalMessage,
      });
    };
    const consumeLine = (line: string): void => {
      const trimmed = line.trim();
      if (trimmed === '') return;
      eventCount += 1;
      let event: unknown;
      try { event = JSON.parse(trimmed) as unknown; } catch { failedEvent = true; return; }
      if (!isRecord(event) || typeof event.type !== 'string') { failedEvent = true; return; }
      if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
        if (state.sessionIds.has(event.thread_id)) failedEvent = true;
        else { sessionId = event.thread_id; state.sessionIds.add(event.thread_id); }
      }
      if (event.type === 'turn.completed') completedEvent = true;
      if (event.type === 'turn.failed' || event.type === 'error') failedEvent = true;
      if (event.type === 'item.completed' && isRecord(event.item)
        && event.item.type === 'agent_message' && typeof event.item.text === 'string') finalMessage = event.item.text;
    };
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid === undefined) { finish(null, 'SIGTERM'); return; }
      killProcessTree(child.pid);
      killTimer = setTimeout(() => {
        try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* process group already exited */ }
      }, 2_000);
    }, request.timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OWNER_OUTPUT_BYTES) { failedEvent = true; if (child.pid !== undefined) killProcessTree(child.pid); return; }
      stdoutBuffer += chunk;
      for (;;) {
        const newline = stdoutBuffer.indexOf('\n');
        if (newline < 0) break;
        const line = stdoutBuffer.slice(0, newline);
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        consumeLine(line);
      }
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OWNER_OUTPUT_BYTES && child.pid !== undefined) killProcessTree(child.pid);
    });
    child.once('error', () => finish(null, null));
    child.once('exit', finish);
    child.stdin.end(task);
  });
}

function persistOwnerResult(requestValue: unknown, binding: HostBinding, storage: OwnerStorage, state: OwnerBrokerState): unknown {
  const request = parseOwnerPersistRequest(requestValue);
  if (request === undefined) return { error: 'malformed production-owner persistence request' };
  const rejected = commonRequestError(request, binding) ?? exactOwnerStorage(storage, dirname(storage.directory));
  if (rejected !== undefined) return { error: rejected };
  const grant = state.grant;
  if (grant === undefined || state.completed || grant.requesterPid !== request.requesterPid
    || grant.argvSha256 !== sha256(canonicalJson(request.argv)) || grant.taskSha256 !== request.taskSha256
    || grant.nonce !== request.grantNonce) return { error: 'production-owner persistence grant is absent, copied, stale, or mismatched' };
  if (!validOwnerResult(request.result, request, binding, storage)) return { error: 'production-owner result is malformed or mismatched' };
  try {
    writeFileSync(storage.receiptPath, `${canonicalJson(request.result)}\n`, { flag: 'wx', mode: 0o400 });
    chmodSync(storage.receiptPath, 0o400);
  } catch (error) {
    return { error: `production-owner receipt persistence failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  state.completed = true;
  return {
    schema: OWNER_PERSIST_ACK_SCHEMA,
    host: 'codex', owner: 'omd-hand', projectRoot: binding.projectRoot,
    taskSha256: request.taskSha256, grantNonce: request.grantNonce,
    resultSha256: request.resultSha256, receiptPath: storage.receiptPath,
  };
}

function pruneReceipts(root: string, retentionMs: number): void {
  if (!existsSync(root)) return;
  const cutoff = Date.now() - retentionMs;
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    try {
      const stat = lstatSync(path);
      if (stat.isDirectory() && !stat.isSymbolicLink() && stat.mtimeMs < cutoff && !existsSync(join(path, 'authority.sock'))) {
        rmSync(path, { recursive: true, force: true });
      }
    } catch { /* another launcher may be cleaning the same expired run */ }
  }
}

function createRunFiles(
  codexHome: string,
  projectRoot: string,
  invocation: ProjectRunInvocation,
  loadedSkillReceipt: CodexHostLoadedSkillReceipt,
): Readonly<{ runDirectory: string; activationPath: string; activationEvidencePath: string; loadedSkillReceiptPath: string; authoritySocketPath: string; ownerDirectory: string; ownerReceiptPath: string }> {
  const runs = join(codexHome, 'omd-host-runs');
  mkdirSync(runs, { recursive: true, mode: 0o700 });
  chmodSync(runs, 0o700);
  const runDirectory = mkdtempSync(join(runs, 'run-'));
  chmodSync(runDirectory, 0o700);
  const activationPath = join(runDirectory, 'invocation.json');
  const activationEvidencePath = join(runDirectory, 'activation-context.json');
  const loadedSkillReceiptPath = join(runDirectory, 'loaded-skill-receipt.json');
  const authoritySocketPath = mkdtempSync(join(tmpdir(), 'omd-cx-'));
  chmodSync(authoritySocketPath, 0o700);
  const ownerDirectory = join(runDirectory, 'production-owner');
  mkdirSync(ownerDirectory, { mode: 0o700 });
  chmodSync(ownerDirectory, 0o700);
  const ownerReceiptPath = join(ownerDirectory, 'result.json');
  for (const attempt of [1, 2]) {
    const delegatedPath = join(runDirectory, `production-owner-activation-${attempt}.json`);
    writeFileSync(delegatedPath, '', { flag: 'wx', mode: 0o600 });
  }
  writeFileSync(activationPath, `${JSON.stringify(invocation)}\n`, { mode: 0o400 });
  writeFileSync(activationEvidencePath, `${JSON.stringify(invocation.activation)}\n`, { mode: 0o400 });
  writeFileSync(loadedSkillReceiptPath, `${JSON.stringify(loadedSkillReceipt)}\n`, { mode: 0o400 });
  chmodSync(activationPath, 0o400); chmodSync(activationEvidencePath, 0o400); chmodSync(loadedSkillReceiptPath, 0o400);
  return { runDirectory, activationPath, activationEvidencePath, loadedSkillReceiptPath, authoritySocketPath, ownerDirectory, ownerReceiptPath };
}

export async function runCodexHostExec(
  args: readonly string[],
  dependencies: CodexHostLaunchDependencies = {},
): Promise<CodexHostLaunchResult> {
  const packageRoot = realpathSync(dependencies.packageRoot ?? PACKAGE_ROOT);
  const env = dependencies.env ?? process.env;
  const projectRoot = projectRootFromArgs(args, process.cwd());
  const codexHomeInput = resolve(dependencies.codexHome ?? env.CODEX_HOME ?? join(homedir(), '.codex'));
  mkdirSync(codexHomeInput, { recursive: true, mode: 0o700 });
  const codexHome = realpathSync(codexHomeInput);
  const installedSkillRoot = resolve(dependencies.installedSkillRoot ?? join(codexHome, 'skills'));
  const buildIdentity: BuildIdentity = createBuildIdentityFromSource(packageRoot);
  const loadedSkillBytes = installedSkillBytes(packageRoot, installedSkillRoot);
  const observed = observeCodexLoadedSkill(buildIdentity, loadedSkillBytes);
  const launchId = randomBytes(24).toString('base64url');
  const briefSha256 = sha256(canonicalJson({ launchId, projectRoot, codexArgv: args }));
  const invocation = createCodexHostInvocation(buildIdentity, observed, { launchId, projectRoot, briefSha256 });
  const activationSha256 = sha256(`${canonicalJson(invocation.activation)}\n`);
  const loadedSkillReceipt: CodexHostLoadedSkillReceipt = Object.freeze({
    schemaVersion: CODEX_HOST_LOADED_SKILL_RECEIPT_SCHEMA_VERSION,
    launchId, projectRoot, issuedAt: new Date().toISOString(), activationSha256, loadedSkillReceipt: observed,
  });
  const retention = dependencies.receiptRetentionMs ?? DEFAULT_RECEIPT_RETENTION_MS;
  pruneReceipts(join(codexHome, 'omd-host-runs'), retention);
  const files = createRunFiles(codexHome, projectRoot, invocation, loadedSkillReceipt);
  const ownerStat = lstatSync(files.ownerDirectory);
  const ownerStorage: OwnerStorage = Object.freeze({
    directory: realpathSync(files.ownerDirectory),
    receiptPath: files.ownerReceiptPath,
    device: String(ownerStat.dev),
    inode: String(ownerStat.ino),
  });
  const ownerBrokerState: OwnerBrokerState = {
    children: new Map<number, OwnerChildBinding>(),
    nextAttempt: 1,
    sessionIds: new Set<string>(),
    completed: false,
    trustedBrowserResults: new Set<string>(),
  };
  let ownerRole: OwnerRoleProfile | undefined;
  const ownerCodexBin = resolveCodexHostExecutable(
    env.OMD_OWNER_CODEX_BIN ?? dependencies.codexBin ?? env.OMD_CODEX_BIN ?? 'codex',
    env,
    projectRoot,
  ).path;
  const canonicalCliPath = realpathSync(join(packageRoot, 'bin', 'omd.ts'));
  const canonicalOwnerCliPath = realpathSync(join(packageRoot, 'bin', 'omd-codex.ts'));
  const launcherExecutableSha256 = sha256(readFileSync(process.execPath));
  let launchedCodexPid: number | undefined;
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const authorityPublicKeyPath = join(files.runDirectory, 'authority-public-key.pem');
  writeFileSync(authorityPublicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o400 });
  chmodSync(authorityPublicKeyPath, 0o400);
  const responseDirectory = files.authoritySocketPath;
  const authorityDirectoryStat = lstatSync(responseDirectory);
  const invocationPath = realpathSync(files.activationPath);
  const invocationSha256 = sha256(readFileSync(invocationPath));
  const handled = new Set<string>();
  const authorityObserver = watch(files.authoritySocketPath, (event, filename) => {
    if (filename === null) return;
    const match = /^request-([A-Za-z0-9_-]{24})\.json$/.exec(filename);
    if (match === null || handled.has(filename)) return;
    const requestPath = join(files.authoritySocketPath, filename);
    let body: string;
    try {
      body = readFileSync(requestPath, 'utf8');
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new Error('authority request is too large');
    } catch { return; }
    handled.add(filename);
    try { unlinkSync(requestPath); } catch { /* the bytes were already captured */ }
    void (async () => {
      let value: unknown;
      try { value = JSON.parse(body) as unknown; } catch { value = undefined; }
      const requestSchema = isRecord(value) ? value.schema : undefined;
      const ownerRequest = requestSchema === OWNER_REQUEST_SCHEMA || requestSchema === OWNER_EXEC_REQUEST_SCHEMA || requestSchema === OWNER_PERSIST_REQUEST_SCHEMA;
      const selectedCliPath = ownerRequest ? canonicalOwnerCliPath : canonicalCliPath;
      const binding: HostBinding = {
        projectRoot,
        invocation,
        invocationPath,
        invocationSha256,
        canonicalCliPath: selectedCliPath,
        canonicalCliSha256: sha256(readFileSync(selectedCliPath)),
        launcherExecutableSha256,
        authorityDirectoryDevice: String(authorityDirectoryStat.dev),
        authorityDirectoryInode: String(authorityDirectoryStat.ino),
        launchedCodexPid,
      };
      if (requestSchema === OWNER_REQUEST_SCHEMA && ownerRole === undefined) ownerRole = ownerRoleProfile(codexHome);
      const authority = requestSchema === OWNER_REQUEST_SCHEMA
        ? ownerRole === undefined
          ? { error: 'production-owner role is unavailable' }
          : ownerGrant(value, binding, ownerStorage, ownerBrokerState, ownerRole)
        : requestSchema === OWNER_EXEC_REQUEST_SCHEMA
          ? ownerRole === undefined
            ? { error: 'production-owner execution has no prior role-bound grant' }
            : await executeOwnerAttempt(value, binding, ownerBrokerState, ownerRole, ownerCodexBin, codexHome, childEnvironment, files.runDirectory, privateKey)
          : requestSchema === OWNER_PERSIST_REQUEST_SCHEMA
            ? persistOwnerResult(value, binding, ownerStorage, ownerBrokerState)
            : authorityReceipt(value, binding, ownerBrokerState);
      const rejected = isRecord(authority) && typeof authority.error === 'string' ? authority.error : undefined;
      const response = rejected === undefined
        ? { receipt: authority, signature: sign(null, Buffer.from(canonicalJson(authority)), privateKey).toString('base64') }
        : authority;
      appendFileSync(join(files.runDirectory, 'authority-audit.jsonl'), `${JSON.stringify({
        schema: 'omd-codex-authority-audit-v1', at: new Date().toISOString(), accepted: rejected === undefined,
        ...(rejected === undefined ? {} : { reason: rejected }),
      })}\n`, { mode: 0o600 });
      const responsePath = join(responseDirectory, `response-${match[1]}`);
      try {
        const responseStat = lstatSync(responsePath);
        if (!responseStat.isFIFO() || responseStat.isSymbolicLink()) throw new Error('authority response channel is not a FIFO');
        writeFileSync(responsePath, JSON.stringify(response));
        unlinkSync(responsePath);
      } catch (error) {
        appendFileSync(join(files.runDirectory, 'authority-audit.jsonl'), `${JSON.stringify({
          schema: 'omd-codex-authority-delivery-v1', at: new Date().toISOString(), delivered: false,
          reason: error instanceof Error ? error.message : String(error),
        })}\n`, { mode: 0o600 });
      }
    })();
  });

  const childEnvironment: NodeJS.ProcessEnv = {
    ...env,
    NODE_OPTIONS: undefined,
    CODEX_HOME: codexHome,
    OMD_ACTIVATION_PATH: files.activationPath,
    OMD_ACTIVATION_EVIDENCE_PATH: files.activationEvidencePath,
    OMD_CODEX_LOADED_SKILL_RECEIPT_PATH: files.loadedSkillReceiptPath,
    OMD_CODEX_AUTHORITY_SOCKET: files.authoritySocketPath,
    OMD_CODEX_AUTHORITY_RESPONSE_DIR: responseDirectory,
    OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH: authorityPublicKeyPath,
    OMD_CODEX_OWNER_DIRECTORY: files.ownerDirectory,
  };
  const codexExecutable = resolveCodexHostExecutable(
    dependencies.codexBin ?? env.OMD_CODEX_BIN ?? 'codex',
    env,
    projectRoot,
  );
  const codexBin = codexExecutable.path;
  let stdout = '';
  let stderr = '';
  let status = 1;
  let signal: NodeJS.Signals | null = null;
  try {
    requireUnchangedCodexExecutable(codexExecutable);
    const codexArgs = ['exec', '--add-dir', files.authoritySocketPath, ...args.slice(1)];
    const child = spawn(codexBin, codexArgs, {
      cwd: projectRoot,
      env: childEnvironment,
      stdio: dependencies.captureOutput === true ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    });
    if (child.pid === undefined) throw new Error('Codex host process did not expose a PID');
    launchedCodexPid = child.pid;
    if (dependencies.captureOutput === true) {
      child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    }
    const exit = await new Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('exit', (code, childSignal) => resolvePromise({ code, signal: childSignal }));
    });
    status = exit.code ?? (exit.signal === null ? 1 : 128);
    signal = exit.signal;
  } finally {
    authorityObserver.close();
    rmSync(files.authoritySocketPath, { recursive: true, force: true });
    const resultPath = join(files.runDirectory, 'launch-result.json');
    writeFileSync(resultPath, `${JSON.stringify({ schema: 'omd-codex-launch-result-v1', status, signal, completedAt: new Date().toISOString() })}\n`, { mode: 0o400 });
    chmodSync(resultPath, 0o400);
  }
  return { status, signal, stdout, stderr, ...files };
}

export function codexHostUsage(): string {
  return [
    'usage: omd-codex exec [codex exec options] [prompt]',
    '       omd-codex owner run --agent omd-hand --input <task.md> [--timeout-ms <ms>]',
    '       oh-my-design codex exec [codex exec options] [prompt]',
    '',
    'Runs Codex with a host-owned, project- and invocation-bound OMD activation.',
    'All Codex exec options are forwarded unchanged; OMD never selects a model.',
  ].join('\n');
}

export async function runCodexHostCli(args: readonly string[]): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(codexHostUsage());
    return 0;
  }
  const result = await runCodexHostExec(args);
  return result.status;
}
