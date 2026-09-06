import { spawn, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { appendFileSync, chmodSync, closeSync, existsSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, watch, writeFileSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Writable } from 'node:stream';
import { parse as parseToml } from 'smol-toml';
import { codexCliContext } from './codex-cli-context.ts';
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
import {
  CODEX_BROWSER_ROLES,
  isBrokeredBrowserCliOperation,
  type CodexBrowserRole,
} from '../core/runtime/codex-browser-operation.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUTHORITY_REQUEST_SCHEMA = 'omd-codex-authority-request-v1';
const OWNER_REQUEST_SCHEMA = 'omd-codex-owner-launch-request-v1';
const OWNER_GRANT_SCHEMA = 'omd-codex-owner-launch-grant-v2';
const OWNER_EXEC_REQUEST_SCHEMA = 'omd-codex-owner-exec-request-v1';
const OWNER_EXEC_RESULT_SCHEMA = 'omd-codex-owner-exec-result-v1';
const OWNER_PERSIST_REQUEST_SCHEMA = 'omd-codex-owner-persist-request-v1';
const OWNER_PERSIST_ACK_SCHEMA = 'omd-codex-owner-persist-ack-v1';
const OWNER_RESULT_SCHEMA = 'omd-production-owner-result-v1';
const ROLE_EXEC_REQUEST_SCHEMA = 'omd-codex-role-exec-request-v1';
const ROLE_EXEC_RESULT_SCHEMA = 'omd-codex-role-exec-result-v1';
const BROWSER_EXEC_REQUEST_SCHEMA = 'omd-codex-browser-exec-request-v1';
const BROWSER_EXEC_RESULT_SCHEMA = 'omd-codex-browser-exec-result-v1';
const DELEGATED_ACTIVATION_SCHEMA = 'omd-codex-delegated-owner-activation-v1';
const HOST_RECEIPT_SCHEMA = 'omd-host-project-write-receipt-v3';
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_OWNER_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_BROWSER_OUTPUT_BYTES = 768 * 1024;
const MAX_OWNER_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const DEFAULT_RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_TTL_MS = 60_000;
const OWNER_GRANT_TTL_MS = (2 * MAX_OWNER_TIMEOUT_MS) + RECEIPT_TTL_MS;

function splitShellLine(line: string): readonly string[] {
  const segments: string[] = [];
  let current = '';
  let quote: "'" | '"' | undefined;
  let escaped = false;
  const flush = (): void => {
    const value = current.trim();
    if (value !== '') segments.push(value);
    current = '';
  };
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? '';
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    const pair = line.slice(index, index + 2);
    if (char === ';' || char === '|' || pair === '&&' || pair === '||') {
      flush();
      if (pair === '&&' || pair === '||') index += 1;
      continue;
    }
    current += char;
  }
  flush();
  return segments;
}

function executableProductionSegments(command: string): readonly string[] {
  const segments: string[] = [];
  let heredocDelimiter: string | undefined;
  for (const line of command.split('\n')) {
    if (heredocDelimiter !== undefined) {
      if (line.trim() === heredocDelimiter) heredocDelimiter = undefined;
      continue;
    }
    const heredoc = /<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(line);
    const commandLine = heredoc === null ? line : line.slice(0, heredoc.index);
    segments.push(...splitShellLine(commandLine));
    heredocDelimiter = heredoc?.[1] ?? heredoc?.[2] ?? heredoc?.[3];
  }
  return segments;
}

function isReadOnlyNameAudit(segment: string): boolean {
  const words = segment.trim().split(/\s+/);
  let index = 0;
  if (words[index] === 'command') index += 1;
  if (words[index] === 'env') {
    index += 1;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? '')) index += 1;
  }
  const executable = basename(words[index] ?? '');
  return executable === 'rg' || executable === 'grep' || executable === 'egrep' || executable === 'fgrep';
}

function prohibitedProductionTool(command: string): string | undefined {
  for (const segment of executableProductionSegments(command)) {
    if (isReadOnlyNameAudit(segment)) continue;
    if (/\bomd(?:\.mjs)?\s+render\b/.test(segment)) return 'omd-render';
    if (/\bomd(?:\.mjs)?\s+(?:ir|probe|lifecycle)\b/.test(segment)) return 'omd-browser-evidence';
    if (/\bplaywright\b/.test(segment)) return 'playwright';
    if (/\bbrowser-rs\b/.test(segment)) return 'browser-rs';
    if (/\b(?:chromium|google-chrome|chrome)\b[^\n]*(?:--headless|--screenshot)/.test(segment)) return 'direct-chromium';
  }
  return undefined;
}

const DELEGATED_OPERATIONS = ['project-write'] as const;
const DELEGATED_PAYLOAD_PURPOSES = [
  'adaptive-route-authority',
  'workflow-production-slice',
] as const satisfies readonly HostPayloadAuthorizationPurpose[];
const NON_PRODUCTION_ROLES = [
  'omd-framer', 'omd-scout', 'omd-writer', 'omd-typesetter',
  'omd-composer', 'omd-sketch', 'omd-eye', 'omd-glance',
] as const;
type NonProductionRole = (typeof NON_PRODUCTION_ROLES)[number];
const OFFICIAL_ROLES = ['omd-hand', ...NON_PRODUCTION_ROLES] as const;
type OfficialRole = (typeof OFFICIAL_ROLES)[number];
type RoleReasoningEffort = 'low' | 'medium' | 'high';
type HostRoleOverride = Readonly<{ model?: string; reasoningEffort?: RoleReasoningEffort }>;
type HostRoleOverrides = Readonly<Partial<Record<OfficialRole, HostRoleOverride>>>;
type RoleExecutionConfiguration = Readonly<{
  modelArgumentOmitted: boolean;
  model?: string;
  modelReasoningEffort: string;
  configurationSha256: string;
}>;

const CODEX_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export type ParsedCodexHostRoleOptions = Readonly<{
  coordinatorArgs: readonly string[];
  roleOverrides: HostRoleOverrides;
}>;

export function parseCodexHostRoleOptions(args: readonly string[]): ParsedCodexHostRoleOptions {
  const coordinatorArgs: string[] = [];
  const mutable = new Map<OfficialRole, { model?: string; reasoningEffort?: RoleReasoningEffort }>();
  let optionParsing = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--') {
      optionParsing = false;
      coordinatorArgs.push(arg);
      continue;
    }
    const kind = !optionParsing ? undefined
      : arg === '--omd-role-model' || arg.startsWith('--omd-role-model=') ? 'model'
        : arg === '--omd-role-effort' || arg.startsWith('--omd-role-effort=') ? 'effort'
          : undefined;
    if (kind === undefined) {
      coordinatorArgs.push(arg);
      continue;
    }
    const inlinePrefix = `--omd-role-${kind}=`;
    const value = arg.startsWith(inlinePrefix) ? arg.slice(inlinePrefix.length) : args[index + 1];
    if (value === undefined) throw new Error(`--omd-role-${kind} requires <role>=<value>`);
    if (!arg.startsWith(inlinePrefix)) index += 1;
    const separator = value.indexOf('=');
    const role = value.slice(0, separator) as OfficialRole;
    const selected = separator < 1 ? '' : value.slice(separator + 1);
    if (!OFFICIAL_ROLES.includes(role)) throw new Error(`--omd-role-${kind} names an unknown official OMD role`);
    if (selected === '') throw new Error(`--omd-role-${kind} requires <role>=<value>`);
    const current = mutable.get(role) ?? {};
    if (kind === 'model') {
      if (current.model !== undefined) throw new Error(`duplicate --omd-role-model for ${role}`);
      if (!CODEX_MODEL_ID.test(selected)) throw new Error(`--omd-role-model has an invalid model for ${role}`);
      mutable.set(role, { ...current, model: selected });
    } else {
      if (current.reasoningEffort !== undefined) throw new Error(`duplicate --omd-role-effort for ${role}`);
      if (selected !== 'low' && selected !== 'medium' && selected !== 'high') {
        throw new Error(`--omd-role-effort must be low, medium, or high for ${role}`);
      }
      mutable.set(role, { ...current, reasoningEffort: selected });
    }
  }
  const roleOverrides = Object.fromEntries(
    [...mutable.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([role, override]) => [role, Object.freeze({ ...override })]),
  ) as Partial<Record<OfficialRole, HostRoleOverride>>;
  return Object.freeze({
    coordinatorArgs: Object.freeze(coordinatorArgs),
    roleOverrides: Object.freeze(roleOverrides),
  });
}

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
type RoleExecRequest = RequestIdentity & Readonly<{
  schema: typeof ROLE_EXEC_REQUEST_SCHEMA;
  role: NonProductionRole;
  timeoutMs: number;
  task: string;
}>;
type BrowserExecRequest = RequestIdentity & Readonly<{
  schema: typeof BROWSER_EXEC_REQUEST_SCHEMA;
  role: CodexBrowserRole;
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
  roles: readonly string[];
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
  role?: CodexBrowserRole | NonProductionRole;
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
  roleChildren: Map<string, OwnerChildBinding>;
  nextAttempt: 1 | 2 | 3;
  sessionIds: Set<string>;
  completed: boolean;
  trustedBrowserResults: Set<string>;
  trustedFinalReviewerResults: Set<string>;
};
type OwnerRoleProfile = Readonly<{ name: 'omd-hand'; model_reasoning_effort: string; developer_instructions: string }>;
type NonProductionRoleProfile = Readonly<{ name: NonProductionRole; model_reasoning_effort: string; developer_instructions: string }>;

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

export function isCodexOwnerAuthorityRequest(
  value: unknown,
  canonicalOwnerCliPath: string,
): boolean {
  return isRecord(value)
    && value.schema === AUTHORITY_REQUEST_SCHEMA
    && value.cliPath === canonicalOwnerCliPath
    && Array.isArray(value.argv)
    && value.argv[2] === 'owner'
    && (value.argv[3] === 'run' || value.argv[3] === 'repair');
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

function parseRoleExecRequest(value: unknown): RoleExecRequest | undefined {
  if (!isRecord(value) || !exactKeys(value, [
    'schema', 'requestId', 'clientPid', 'requesterPid', 'cliPath', 'activationPath',
    'projectRoot', 'argv', 'activation', 'role', 'timeoutMs', 'task',
  ])) return undefined;
  if (value.schema !== ROLE_EXEC_REQUEST_SCHEMA || !validRequestIdentity(value)
    || !NON_PRODUCTION_ROLES.includes(value.role as NonProductionRole)
    || !Number.isSafeInteger(value.timeoutMs) || Number(value.timeoutMs) < 25
    || Number(value.timeoutMs) > MAX_OWNER_TIMEOUT_MS
    || typeof value.task !== 'string' || value.task.trim() === '') return undefined;
  return value as RoleExecRequest;
}

function parseBrowserExecRequest(value: unknown): BrowserExecRequest | undefined {
  if (!isRecord(value) || !exactKeys(value, [
    'schema', 'requestId', 'clientPid', 'requesterPid', 'cliPath', 'activationPath',
    'projectRoot', 'argv', 'activation', 'role',
  ])) return undefined;
  if (value.schema !== BROWSER_EXEC_REQUEST_SCHEMA || !validRequestIdentity(value)
    || !CODEX_BROWSER_ROLES.includes(value.role as CodexBrowserRole)) return undefined;
  return value as BrowserExecRequest;
}

export { isBrokeredBrowserCliOperation };

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
  const observedTail = command.slice(
    scriptStart + canonicalCliPath.length,
  ).trim();
  const expectedTail = argv.slice(2).join(' ');
  if (observedTail === expectedTail) return true;
  const visibleOperation = argv.slice(2, 4).join(' ');
  if (
    visibleOperation === ''
    || (
      observedTail !== visibleOperation
      && !observedTail.startsWith(`${visibleOperation} `)
    )
  ) {
    return false;
  }
  return true;
}

const PAYLOAD_OPERATION_PHASES: Readonly<Partial<Record<HostPayloadAuthorizationPurpose, readonly (readonly string[])[]>>> = Object.freeze({
  // These are the only dynamic broker phases whose bytes are consumed and fully validated by the
  // named canonical CLI operation. Reviewer, browser, and final-result purposes still require a
  // separate host-observed producer and are deliberately not signing-oracle fallbacks.
  'adaptive-route-authority': Object.freeze([
    Object.freeze(['route', 'classify']),
    Object.freeze(['route', 'show']),
    Object.freeze(['route', 'check']),
    Object.freeze(['stage', 'status']),
    Object.freeze(['stage', 'resume']),
    Object.freeze(['stage', 'require']),
    Object.freeze(['brief']),
    Object.freeze(['composition']),
    Object.freeze(['deliberate', 'check']),
    Object.freeze(['complete']),
    Object.freeze(['completion']),
    Object.freeze(['workflow']),
    Object.freeze(['evidence', 'v2']),
    Object.freeze(['repair']),
    Object.freeze(['source']),
    Object.freeze(['lifecycle']),
    Object.freeze(['owner']),
    Object.freeze(['locale', 'profile', '--publish']),
    Object.freeze(['locale', 'profile-check']),
    Object.freeze(['locale', 'source-capture']),
    Object.freeze(['locale', 'source-stability']),
  ]),
  'workflow-production-slice': Object.freeze([
    Object.freeze(['workflow', 'slice']),
    Object.freeze(['owner', 'run']),
    Object.freeze(['owner', 'mirror']),
  ]),
  'current-intent-ledger': Object.freeze([
    Object.freeze(['intent', 'append']),
    Object.freeze(['art-direction', 'check']),
    Object.freeze(['evidence', 'v2', 'finalize']),
    Object.freeze(['evidence', 'v2', 'check']),
    Object.freeze(['completion', 'preflight']),
    Object.freeze(['lifecycle', 'finalize']),
  ]),
  'evaluator-assessment': Object.freeze([
    Object.freeze(['art-direction', 'check']),
  ]),
  'evaluator-result': Object.freeze([
    Object.freeze(['art-direction', 'check']),
  ]),
  'approved-motion-recipe': Object.freeze([
    Object.freeze(['art-direction', 'check']),
  ]),
  'final-reviewer-lane': Object.freeze([
    Object.freeze(['review', 'publish']),
    Object.freeze(['review', 'repair-publish']),
    Object.freeze(['evidence', 'v2', 'finalize']),
    Object.freeze(['evidence', 'v2', 'check']),
    Object.freeze(['completion', 'preflight']),
  ]),
  'final-evidence-manifest': Object.freeze([
    Object.freeze(['evidence', 'v2', 'finalize']),
    Object.freeze(['lifecycle', 'finalize']),
    Object.freeze(['evidence', 'v2', 'check']),
    Object.freeze(['completion', 'preflight']),
  ]),
});

export function codexPayloadAuthorizationPhaseError(argv: readonly string[], purpose: HostPayloadAuthorizationPurpose): string | undefined {
  const operation = argv.slice(2);
  const phases = PAYLOAD_OPERATION_PHASES[purpose];
  return phases?.some((phase) => phase.every((part, index) => operation[index] === part)) === true
    ? undefined
    : `the ${purpose} payload requires an exact trusted host-observed CLI phase (received: ${operation.join(' ')})`;
}

export function workflowProductionSliceAuthorityError(
  delegatedOwnerActive: boolean,
  completedOwnerPersisted: boolean,
  operation: readonly string[],
): string | undefined {
  if (delegatedOwnerActive) return undefined;
  if (completedOwnerPersisted && operation[0] === 'workflow' && operation[1] === 'slice') return undefined;
  return 'workflow production slice authority requires the active delegated owner or its persisted completed result';
}

export function isCodexFinalEvidenceContinuationPayload(
  argv: readonly string[],
  purpose: HostPayloadAuthorizationPurpose,
  payload: unknown,
): boolean {
  const operation = argv.slice(2);
  const finalization = (operation[0] === 'lifecycle' && operation[1] === 'finalize')
    || (operation[0] === 'evidence' && operation[1] === 'v2' && operation[2] === 'finalize');
  const verification = (operation[0] === 'evidence' && operation[1] === 'v2' && operation[2] === 'check')
    || (operation[0] === 'completion' && operation[1] === 'preflight');
  return (finalization || verification) && purpose === 'product-probe-result'
    && isRecord(payload) && payload.schema === 'trusted-browser-receipt-v1';
}

function brokerPayloadAuthorizationError(
  request: AuthorityRequest,
  state: OwnerBrokerState,
): string | undefined {
  const authorization = request.requestedAuthorization;
  if (authorization === undefined) return undefined;
  if (authorization.purpose === 'final-reviewer-lane') {
    const operation = request.argv.slice(2);
    if (operation[0] === 'review'
      && (operation[1] === 'publish' || operation[1] === 'repair-publish')) {
      state.trustedFinalReviewerResults.add(authorization.payloadSha256);
      return undefined;
    }
    const finalization = (operation[0] === 'lifecycle' && operation[1] === 'finalize')
      || (operation[0] === 'evidence' && operation[1] === 'v2' && operation[2] === 'finalize');
    if (finalization && state.trustedFinalReviewerResults.has(authorization.payloadSha256)) return undefined;
    if (operation[0] === 'lifecycle' && operation[1] === 'repair'
      && state.trustedFinalReviewerResults.has(authorization.payloadSha256)) return undefined;
    return codexPayloadAuthorizationPhaseError(request.argv, authorization.purpose);
  }
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
  if (isCodexFinalEvidenceContinuationPayload(request.argv, authorization.purpose, value)) {
    return undefined;
  }
  if (schema === 'trusted-browser-receipt-v1' && finalization
    && state.trustedBrowserResults.has(authorization.payloadSha256)) return undefined;
  if (operation[0] === 'completion' && operation[1] === 'typography-applicability'
    && isRecord(value)
    && isRecord(value.meta) && value.meta.source === 'dom') return undefined;
  return 'product probe payload was not observed from its exact trusted CLI producer phase';
}
function processRecord(pid: number): ProcessRecord | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  const result = spawnSync('/bin/ps', ['-ww', '-p', String(pid), '-o', 'ppid=', '-o', 'lstart=', '-o', 'command='], {
    encoding: 'utf8',
    env: { PATH: '', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
  });
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
    roles: Object.freeze([...route.strategy.roles]),
  });
}
function sameRouteBinding(left: RouteBinding, right: RouteBinding): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

type HostBinding = Readonly<{
  projectRoot: string;
  invocation: ProjectRunInvocation;
  roleOverrides: HostRoleOverrides;
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

function delegatedRequestError(
  request: RequestIdentity & Readonly<{ requestedAuthorization?: RequestedPayloadAuthorization }>,
  binding: HostBinding,
  child: OwnerChildBinding,
): string | undefined {
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
  const child = [...state.children.values(), ...state.roleChildren.values()]
    .find((candidate) => candidate.activationPath === request.activationPath);
  const ownerOnly = request.requestedAuthorization?.purpose === 'workflow-production-slice'
    ? workflowProductionSliceAuthorityError(
      child !== undefined && child.role === undefined,
      state.completed,
      request.argv.slice(2),
    )
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

function nonProductionRoleProfile(codexHome: string, role: NonProductionRole): NonProductionRoleProfile {
  const inputPath = join(codexHome, 'agents', `${role}.toml`);
  const inputStat = lstatSync(inputPath);
  if (inputStat.isSymbolicLink()) throw new Error('Codex role profile is symlinked');
  const path = realpathSync(inputPath);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Codex role profile is unavailable');
  const parsed = parseToml(readFileSync(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || parsed.name !== role
    || typeof parsed.model_reasoning_effort !== 'string'
    || !/^(?:low|medium|high|xhigh)$/.test(parsed.model_reasoning_effort)
    || typeof parsed.developer_instructions !== 'string' || parsed.developer_instructions.trim() === '') {
    throw new Error('Codex role profile is malformed');
  }
  return parsed as unknown as NonProductionRoleProfile;
}

function roleExecutionConfiguration(
  role: OfficialRole,
  profile: OwnerRoleProfile | NonProductionRoleProfile,
  roleOverrides: HostRoleOverrides,
  taskSha256: string,
): RoleExecutionConfiguration {
  const override = roleOverrides[role];
  const modelReasoningEffort = override?.reasoningEffort ?? profile.model_reasoning_effort;
  const modelArgumentOmitted = override?.model === undefined;
  const identity = {
    role,
    taskSha256,
    roleProfileSha256: sha256(canonicalJson(profile)),
    modelArgumentOmitted,
    model: override?.model ?? null,
    modelReasoningEffort,
    reasoningEffortSource: override?.reasoningEffort === undefined ? 'role-profile' : 'host-user-override',
  };
  return Object.freeze({
    modelArgumentOmitted,
    ...(override?.model === undefined ? {} : { model: override.model }),
    modelReasoningEffort,
    configurationSha256: sha256(canonicalJson(identity)),
  });
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

function hasExecutionConfiguration(value: Record<string, unknown>, expected: RoleExecutionConfiguration): boolean {
  return value.modelArgumentOmitted === expected.modelArgumentOmitted
    && value.model === expected.model
    && value.modelReasoningEffort === expected.modelReasoningEffort
    && value.configurationSha256 === expected.configurationSha256;
}

function validOwnerResult(
  result: Record<string, unknown>,
  request: OwnerPersistRequest,
  binding: HostBinding,
  storage: OwnerStorage,
  role: OwnerRoleProfile,
): boolean {
  const allowed = ['schema', 'owner', 'projectRoot', 'taskSha256', 'rolePromptSha256', 'host', 'transport', 'modelArgumentOmitted', 'model', 'modelReasoningEffort', 'configurationSha256', 'attempts', 'sourceChanges', 'finalEvidence', 'result', 'failure', 'resumeCommand', 'receiptPath'];
  if (Object.keys(result).some((key) => !allowed.includes(key))) return false;
  const expectedExecution = roleExecutionConfiguration('omd-hand', role, binding.roleOverrides, request.taskSha256);
  return result.schema === OWNER_RESULT_SCHEMA && result.owner === 'omd-hand'
    && result.projectRoot === binding.projectRoot && result.taskSha256 === request.taskSha256
    && typeof result.rolePromptSha256 === 'string' && SHA256.test(result.rolePromptSha256)
    && result.host === 'codex' && result.transport === 'codex-exec-stdio-jsonl'
    && hasExecutionConfiguration(result, expectedExecution)
    && Array.isArray(result.attempts) && result.attempts.length >= 1 && result.attempts.length <= 2
    && result.attempts.every((attempt) => isRecord(attempt) && hasExecutionConfiguration(attempt, expectedExecution))
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
  const execution = roleExecutionConfiguration('omd-hand', role, binding.roleOverrides, request.taskSha256);
  return {
    schema: OWNER_GRANT_SCHEMA,
    host: 'codex', owner: 'omd-hand', projectRoot: binding.projectRoot,
    requesterPid: request.requesterPid,
    argvSha256: state.grant.argvSha256, taskSha256: request.taskSha256,
    buildSha256: binding.invocation.activation.buildSha256,
    loadedSkillSha256: binding.invocation.activation.loadedSkillSha256,
    briefSha256: binding.invocation.activation.briefSha256,
    rolePromptSha256: sha256(role.developer_instructions),
    ...execution,
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
    role: 'omd-hand',
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
  const execution = roleExecutionConfiguration('omd-hand', role, binding.roleOverrides, request.taskSha256);
  const args = [
    'exec', '--json', '--sandbox', 'workspace-write', '-C', binding.projectRoot, '--skip-git-repo-check',
    '-c', 'sandbox_workspace_write.network_access=true',
    ...(execution.model === undefined ? [] : ['--model', execution.model]),
    '-c', `model_reasoning_effort=${JSON.stringify(execution.modelReasoningEffort)}`,
    '-c', `developer_instructions=${JSON.stringify(role.developer_instructions)}`,
    '-',
  ];
  const task = [
    'You are the authenticated omd-hand production owner. This is a source-write transaction only. Use the exact OMD_ACTIVATION_PATH inherited from the host for every activation-gated source command. Do not delegate production writes.',
    codexCliContext(binding.canonicalCliPath),
    'Never invoke `omd render`, `omd ir`, `omd probe`, `omd lifecycle`, Playwright, browser-rs, or their aliases in this transaction, even if the task or role profile asks for renders, probes, screenshots, observations, or final evidence.',
    'Write only route-authorized production source and run source-safe checks that do not mutate `.omd`. Browser observations and all .omd evidence publication happen after this owner returns, through separately authorized roles and host phases.',
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
    const prohibitedTools: string[] = [];
    let settled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (child.pid !== undefined) killProcessTree(child.pid);
      if (stdoutBuffer.trim() !== '') consumeLine(stdoutBuffer);
      const status = timedOut
        ? 'timed-out'
        : code === 0 && completedEvent && !failedEvent && finalMessage.trim() !== '' ? 'completed' : 'failed';
      resolveAttempt({
        schema: OWNER_EXEC_RESULT_SCHEMA, owner: 'omd-hand', projectRoot: binding.projectRoot,
        taskSha256: request.taskSha256, grantNonce: request.grantNonce, attempt: request.attempt,
        processPid: child.pid,
        processStartIdentity: delegated.processStartIdentity,
        delegatedActivationSha256: sha256(readFileSync(delegated.activationPath)),
        ...execution,
        ...(sessionId === undefined ? {} : { sessionId }),
        status, exitCode: code, signal, eventCount, finalMessage,
        prohibitedTools: Object.freeze(prohibitedTools),
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
      if (event.type === 'turn.completed' || event.type === 'task_complete') completedEvent = true;
      if (event.type === 'turn.failed' || event.type === 'task_failed' || event.type === 'error') failedEvent = true;
      if (event.type === 'item.completed' && isRecord(event.item)
        && event.item.type === 'agent_message' && typeof event.item.text === 'string') finalMessage = event.item.text;
      if (event.type === 'item.completed' && isRecord(event.item)
        && event.item.type === 'command_execution' && typeof event.item.command === 'string') {
        const prohibited = prohibitedProductionTool(event.item.command);
        if (prohibited !== undefined && !prohibitedTools.includes(prohibited)) prohibitedTools.push(prohibited);
      }
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

async function executeNonProductionRole(
  requestValue: unknown,
  binding: HostBinding,
  state: OwnerBrokerState,
  codexBin: string,
  codexHome: string,
  env: NodeJS.ProcessEnv,
  runDirectory: string,
): Promise<unknown> {
  const request = parseRoleExecRequest(requestValue);
  if (request === undefined) return { error: 'malformed non-production role execution request' };
  const rejected = commonRequestError(request, binding);
  if (rejected !== undefined) return { error: rejected };
  const route = currentRouteBinding(binding.projectRoot, binding.invocation);
  if (!route.roles.includes(request.role)) return { error: `the current route did not select ${request.role}` };
  const role = nonProductionRoleProfile(codexHome, request.role);
  const execution = roleExecutionConfiguration(request.role, role, binding.roleOverrides, sha256(request.task));
  const roleNonce = randomBytes(18).toString('base64url');
  const workdir = mkdtempSync(join(runDirectory, `role-${request.role}-`));
  const activationPath = join(runDirectory, `role-activation-${roleNonce}.json`);
  writeFileSync(activationPath, `${canonicalJson(binding.invocation)}\n`, { flag: 'wx', mode: 0o400 });
  chmodSync(activationPath, 0o400);
  const args = [
    'exec', '--json', '--sandbox', 'workspace-write',
    '-C', workdir, '--add-dir', join(binding.projectRoot, '.omd'), '--skip-git-repo-check',
    ...(request.role === 'omd-scout' || request.role === 'omd-eye' || request.role === 'omd-glance'
      ? ['-c', 'sandbox_workspace_write.network_access=true']
      : []),
    ...(execution.model === undefined ? [] : ['--model', execution.model]),
    '-c', `model_reasoning_effort=${JSON.stringify(execution.modelReasoningEffort)}`,
    '-c', `developer_instructions=${JSON.stringify(role.developer_instructions)}`,
    '-',
  ];
  const task = [
    `You are the host-delegated ${request.role} role owner for ${binding.projectRoot}.`,
    'OMD_ACTIVATION_PATH already names a JSON activation record consumed by OMD. Never source, execute, copy, or rewrite that file; let the CLI read the inherited environment variable.',
    codexCliContext(binding.canonicalCliPath),
    `Run project commands from ${binding.projectRoot}. Persist only artifacts owned by your role, using the publication method declared in your role instructions.`,
    'Use named OMD CLI commands where your role requires them. Direct file writes are permitted only to paths your role explicitly owns and explicitly allows you to edit; they are not a fallback for a CLI-required record. Do not invent publication commands or write another role\'s artifacts.',
    'Do not write production source and do not delegate your owned work.',
    '',
    request.task,
  ].join('\n');
  const childArgv = [codexBin, ...args];
  return await new Promise<unknown>((resolveRole) => {
    const gate = 'IFS= read -r omd_gate <&3 || exit 125; exec 3<&-; test -n "$omd_gate" || exit 126; unset omd_gate; exec "$@"';
    const child = spawn('/bin/sh', ['-c', gate, 'omd-role-gate', codexBin, ...args], {
      cwd: workdir,
      detached: true,
      env: {
        ...env,
        CODEX_HOME: codexHome,
        OMD_ACTIVATION_PATH: activationPath,
        OMD_NON_PRODUCTION_ROLE: request.role,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    });
    if (child.pid === undefined) {
      rmSync(workdir, { recursive: true, force: true });
      rmSync(activationPath, { force: true });
      resolveRole({ error: 'non-production role child process did not expose a PID' });
      return;
    }
    const record = processRecord(child.pid);
    if (record === undefined || record.ppid !== process.pid) {
      killProcessTree(child.pid);
      resolveRole({ error: 'non-production role child process identity is unavailable' });
      return;
    }
    const activationStat = lstatSync(activationPath);
    const childBinding: OwnerChildBinding = Object.freeze({
      pid: child.pid,
      processStartIdentity: processStartIdentity(child.pid, record),
      activationPath,
      activationDevice: String(activationStat.dev),
      activationInode: String(activationStat.ino),
      argvSha256: sha256(canonicalJson(childArgv)),
      sessionNonce: roleNonce,
      taskSha256: sha256(request.task),
      route,
      expiresAt: Date.now() + request.timeoutMs + RECEIPT_TTL_MS,
      role: request.role,
    });
    state.roleChildren.set(roleNonce, childBinding);
    (child.stdio[3] as Writable).end(`${roleNonce}\n`);
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let outputBytes = 0;
    let sessionId: string | undefined;
    let completed = false;
    let failed = false;
    let finalMessage = '';
    let eventCount = 0;
    let settled = false;
    const consumeLine = (line: string): void => {
      if (line.trim() === '') return;
      eventCount += 1;
      let event: unknown;
      try { event = JSON.parse(line) as unknown; } catch { failed = true; return; }
      if (!isRecord(event) || typeof event.type !== 'string') { failed = true; return; }
      if (event.type === 'thread.started' && typeof event.thread_id === 'string') sessionId = event.thread_id;
      if (event.type === 'turn.completed') completed = true;
      if (event.type === 'turn.failed' || event.type === 'error') failed = true;
      if (event.type === 'item.completed' && isRecord(event.item)
        && event.item.type === 'agent_message' && typeof event.item.text === 'string') finalMessage = event.item.text;
    };
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdoutBuffer.trim() !== '') consumeLine(stdoutBuffer);
      state.roleChildren.delete(roleNonce);
      rmSync(workdir, { recursive: true, force: true });
      rmSync(activationPath, { force: true });
      const status = code === 0 && completed && !failed ? 'completed' : 'failed';
      resolveRole({
        schema: ROLE_EXEC_RESULT_SCHEMA,
        role: request.role,
        projectRoot: binding.projectRoot,
        status,
        exitCode: code,
        signal,
        eventCount,
        finalMessage,
        processPid: child.pid,
        roleNonce,
        ...execution,
        buildSha256: binding.invocation.activation.buildSha256,
        briefSha256: binding.invocation.activation.briefSha256,
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(status === 'completed' ? {} : { failure: stderrBuffer.trim().slice(-4_000) || `ROLE_EXECUTION_FAILED:${code ?? 'unknown'}` }),
      });
    };
    const timer = setTimeout(() => {
      failed = true;
      stderrBuffer = 'ROLE_TIMEOUT';
      killProcessTree(child.pid!);
    }, request.timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OWNER_OUTPUT_BYTES) { failed = true; killProcessTree(child.pid!); return; }
      stdoutBuffer += chunk;
      for (;;) {
        const newline = stdoutBuffer.indexOf('\n');
        if (newline < 0) break;
        consumeLine(stdoutBuffer.slice(0, newline));
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
      }
    });
    child.stderr.on('data', (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk);
      stderrBuffer = `${stderrBuffer}${chunk}`.slice(-4_000);
      if (outputBytes > MAX_OWNER_OUTPUT_BYTES) killProcessTree(child.pid!);
    });
    child.once('error', () => finish(null, null));
    child.once('exit', finish);
    child.stdin.end(task);
  });
}

async function executeBrokeredBrowserCommand(
  requestValue: unknown,
  binding: HostBinding,
  state: OwnerBrokerState,
  env: NodeJS.ProcessEnv,
  runDirectory: string,
): Promise<unknown> {
  const request = parseBrowserExecRequest(requestValue);
  if (request === undefined) return { error: 'malformed browser execution request' };
  const owner = [...state.children.values(), ...state.roleChildren.values()]
    .find((candidate) => candidate.activationPath === request.activationPath);
  if (owner === undefined) return { error: 'browser execution requires a live delegated role owner' };
  const rejected = delegatedRequestError(request, binding, owner);
  if (rejected !== undefined) return { error: rejected };
  if (owner.role !== request.role) return { error: 'browser execution role is copied or mismatched' };
  const operation = request.argv.slice(2);
  if (!isBrokeredBrowserCliOperation(request.role, operation)) {
    return { error: `browser execution operation is not allowed for ${request.role}` };
  }

  const nonce = randomBytes(18).toString('base64url');
  const activationPath = join(runDirectory, `browser-activation-${nonce}.json`);
  writeFileSync(activationPath, `${canonicalJson(binding.invocation)}\n`, { flag: 'wx', mode: 0o400 });
  chmodSync(activationPath, 0o400);
  const childArgv = [process.execPath, binding.canonicalCliPath, ...operation];
  return await new Promise<unknown>((resolveBrowser) => {
    const gate = 'IFS= read -r omd_gate <&3 || exit 125; exec 3<&-; test -n "$omd_gate" || exit 126; unset omd_gate; exec "$@"';
    const child = spawn('/bin/sh', ['-c', gate, 'omd-browser-gate', ...childArgv], {
      cwd: binding.projectRoot,
      detached: true,
      env: {
        ...env,
        OMD_ACTIVATION_PATH: activationPath,
        OMD_CODEX_BROWSER_BROKER_CHILD: '1',
        ...(request.role === 'omd-hand'
          ? { OMD_PRODUCTION_OWNER_ROLE: 'omd-hand', OMD_NON_PRODUCTION_ROLE: undefined }
          : { OMD_NON_PRODUCTION_ROLE: request.role, OMD_PRODUCTION_OWNER_ROLE: undefined }),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    if (child.pid === undefined) {
      rmSync(activationPath, { force: true });
      resolveBrowser({ error: 'browser execution child process did not expose a PID' });
      return;
    }
    const record = processRecord(child.pid);
    if (record === undefined || record.ppid !== process.pid) {
      killProcessTree(child.pid);
      rmSync(activationPath, { force: true });
      resolveBrowser({ error: 'browser execution child process identity is unavailable' });
      return;
    }
    const activationStat = lstatSync(activationPath);
    const bindingKey = `browser-${nonce}`;
    state.roleChildren.set(bindingKey, Object.freeze({
      pid: child.pid,
      processStartIdentity: processStartIdentity(child.pid, record),
      activationPath,
      activationDevice: String(activationStat.dev),
      activationInode: String(activationStat.ino),
      argvSha256: sha256(canonicalJson(childArgv)),
      sessionNonce: nonce,
      taskSha256: sha256(canonicalJson(operation)),
      route: owner.route,
      expiresAt: Math.min(owner.expiresAt, Date.now() + MAX_OWNER_TIMEOUT_MS),
      role: request.role,
    }));
    (child.stdio[3] as Writable).end(`${nonce}\n`);
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    if (childStdout === null || childStderr === null) {
      killProcessTree(child.pid);
      state.roleChildren.delete(bindingKey);
      rmSync(activationPath, { force: true });
      resolveBrowser({ error: 'browser execution output channels are unavailable' });
      return;
    }
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      state.roleChildren.delete(bindingKey);
      rmSync(activationPath, { force: true });
      resolveBrowser({
        schema: BROWSER_EXEC_RESULT_SCHEMA,
        role: request.role,
        projectRoot: binding.projectRoot,
        status: code ?? 1,
        stdout,
        stderr,
      });
    };
    const onOutput = (stream: 'stdout' | 'stderr', chunk: string): void => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_BROWSER_OUTPUT_BYTES) {
        stderr = 'CODEX_BROWSER_OUTPUT_LIMIT';
        killProcessTree(child.pid!);
        return;
      }
      if (stream === 'stdout') stdout += chunk;
      else stderr += chunk;
    };
    const timer = setTimeout(() => {
      stderr = 'CODEX_BROWSER_TIMEOUT';
      killProcessTree(child.pid!);
    }, MAX_OWNER_TIMEOUT_MS);
    childStdout.setEncoding('utf8');
    childStderr.setEncoding('utf8');
    childStdout.on('data', (chunk: string) => onOutput('stdout', chunk));
    childStderr.on('data', (chunk: string) => onOutput('stderr', chunk));
    child.once('error', () => finish(1));
    child.once('exit', (code) => finish(code));
  });
}

function persistOwnerResult(requestValue: unknown, binding: HostBinding, storage: OwnerStorage, state: OwnerBrokerState, role: OwnerRoleProfile): unknown {
  const request = parseOwnerPersistRequest(requestValue);
  if (request === undefined) return { error: 'malformed production-owner persistence request' };
  const rejected = commonRequestError(request, binding) ?? exactOwnerStorage(storage, dirname(storage.directory));
  if (rejected !== undefined) return { error: rejected };
  const grant = state.grant;
  if (grant === undefined || state.completed || grant.requesterPid !== request.requesterPid
    || grant.argvSha256 !== sha256(canonicalJson(request.argv)) || grant.taskSha256 !== request.taskSha256
    || grant.nonce !== request.grantNonce) return { error: 'production-owner persistence grant is absent, copied, stale, or mismatched' };
  if (!validOwnerResult(request.result, request, binding, storage, role)) return { error: 'production-owner result is malformed or mismatched' };
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
  const parsedRoleOptions = parseCodexHostRoleOptions(args);
  const coordinatorArgs = parsedRoleOptions.coordinatorArgs;
  const roleOverrides = parsedRoleOptions.roleOverrides;
  const projectRoot = projectRootFromArgs(coordinatorArgs, process.cwd());
  const codexHomeInput = resolve(dependencies.codexHome ?? env.CODEX_HOME ?? join(homedir(), '.codex'));
  mkdirSync(codexHomeInput, { recursive: true, mode: 0o700 });
  const codexHome = realpathSync(codexHomeInput);
  const installedSkillRoot = resolve(dependencies.installedSkillRoot ?? join(codexHome, 'skills'));
  const buildIdentity: BuildIdentity = createBuildIdentityFromSource(packageRoot);
  const loadedSkillBytes = installedSkillBytes(packageRoot, installedSkillRoot);
  const observed = observeCodexLoadedSkill(buildIdentity, loadedSkillBytes);
  const launchId = randomBytes(24).toString('base64url');
  const briefSha256 = sha256(canonicalJson({
    launchId,
    projectRoot,
    codexArgv: coordinatorArgs,
    ...(Object.keys(roleOverrides).length === 0 ? {} : { roleOverrides }),
  }));
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
    roleChildren: new Map<string, OwnerChildBinding>(),
    nextAttempt: 1,
    sessionIds: new Set<string>(),
    completed: false,
    trustedBrowserResults: new Set<string>(),
    trustedFinalReviewerResults: new Set<string>(),
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
      const ownerRequest = requestSchema === OWNER_REQUEST_SCHEMA || requestSchema === OWNER_EXEC_REQUEST_SCHEMA
        || requestSchema === OWNER_PERSIST_REQUEST_SCHEMA || requestSchema === ROLE_EXEC_REQUEST_SCHEMA;
      const selectedCliPath = ownerRequest || isCodexOwnerAuthorityRequest(value, canonicalOwnerCliPath)
        ? canonicalOwnerCliPath
        : canonicalCliPath;
      const binding: HostBinding = {
        projectRoot,
        invocation,
        roleOverrides,
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
          : requestSchema === ROLE_EXEC_REQUEST_SCHEMA
            ? await executeNonProductionRole(value, binding, ownerBrokerState, ownerCodexBin, codexHome, childEnvironment, files.runDirectory)
          : requestSchema === BROWSER_EXEC_REQUEST_SCHEMA
            ? await executeBrokeredBrowserCommand(value, binding, ownerBrokerState, childEnvironment, files.runDirectory)
          : requestSchema === OWNER_PERSIST_REQUEST_SCHEMA
            ? ownerRole === undefined
              ? { error: 'production-owner persistence has no prior role-bound grant' }
              : persistOwnerResult(value, binding, ownerStorage, ownerBrokerState, ownerRole)
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
    const codexArgs = ['exec', '--add-dir', files.authoritySocketPath, ...coordinatorArgs.slice(1)];
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
    'usage: omd-codex exec [--omd-role-model <role>=<model>] [--omd-role-effort <role>=low|medium|high] [codex exec options] [prompt]',
    '       omd-codex owner run --agent omd-hand --input <task.md> [--timeout-ms <ms>]',
    '       oh-my-design codex exec [codex exec options] [prompt]',
    '',
    'Runs Codex with a host-owned, project- and invocation-bound OMD activation.',
    'Codex exec options are forwarded unchanged. Host-only role options are stripped and applied only by the broker.',
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
