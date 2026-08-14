import { createHash, createPublicKey, verify } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { requestCodexHostAuthority } from '../core/runtime/codex-host-client.ts';
import { validateActivationContext } from '../core/runtime/activation.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { parseRouteRecord, pathsOutsideScope } from '../core/route/adaptive-route-record.ts';
import type { AdaptiveRouteRecord } from '../core/route/adaptive-flow-domain.ts';
import {
  checkAdaptiveWorkflow,
  checkAdaptiveWorkflowProductionReadiness,
  checkAdaptiveWorkflowProductionSlice,
} from '../core/design-development/workflow-persistence.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER_REQUEST_SCHEMA = 'omd-codex-owner-launch-request-v1';
const OWNER_EXEC_REQUEST_SCHEMA = 'omd-codex-owner-exec-request-v1';
const OWNER_EXEC_RESULT_SCHEMA = 'omd-codex-owner-exec-result-v1';
const OWNER_GRANT_SCHEMA = 'omd-codex-owner-launch-grant-v2';
const OWNER_PERSIST_REQUEST_SCHEMA = 'omd-codex-owner-persist-request-v1';
const OWNER_PERSIST_ACK_SCHEMA = 'omd-codex-owner-persist-ack-v1';
const OWNER_RESULT_SCHEMA = 'omd-production-owner-result-v1';
const OWNER_ROLE = 'omd-hand';
const SHA256 = /^[a-f0-9]{64}$/;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;

export type ProductionOwnerAttempt = Readonly<{
  attempt: 1 | 2;
  processPid?: number;
  processStartIdentity?: string;
  delegatedActivationSha256?: string;
  sessionId?: string;
  status: 'completed' | 'timed-out' | 'failed';
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  sourceChanges: readonly string[];
  projectChanges: readonly string[];
  unsafeOutputs: readonly string[];
  eventCount: number;
  finalMessage: string;
}>;

export type ProductionOwnerResult = Readonly<{
  schema: typeof OWNER_RESULT_SCHEMA;
  owner: typeof OWNER_ROLE;
  projectRoot: string;
  taskSha256: string;
  rolePromptSha256: string;
  host: 'codex';
  transport: 'codex-exec-stdio-jsonl';
  modelArgumentOmitted: true;
  attempts: readonly ProductionOwnerAttempt[];
  sourceChanges: readonly string[];
  finalEvidence?: Readonly<{ path: '.omd/final-evidence-v2.json'; sha256: string }>;
  result: 'completed' | 'failed';
  failure?: string;
  resumeCommand?: string;
  receiptPath: string;
}>;

export type ProductionOwnerDependencies = Readonly<{
  codexBin?: string;
  codexHome?: string;
  packageRoot?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  now?: () => number;
}>;

type SnapshotEntry =
  | Readonly<{ kind: 'directory'; mode: number }>
  | Readonly<{ kind: 'file'; mode: number; bytes: Buffer; sha256: string }>
  | Readonly<{ kind: 'symlink'; target: string }>
  | Readonly<{ kind: 'special'; mode: number }>;
type Snapshot = ReadonlyMap<string, SnapshotEntry>;
type OwnerGrant = Readonly<{
  schema: typeof OWNER_GRANT_SCHEMA;
  host: 'codex';
  owner: typeof OWNER_ROLE;
  projectRoot: string;
  requesterPid: number;
  argvSha256: string;
  taskSha256: string;
  buildSha256: string;
  loadedSkillSha256: string;
  briefSha256: string;
  rolePromptSha256: string;
  ownerDirectory: string;
  ownerReceiptPath: string;
  ownerDirectoryDevice: string;
  ownerDirectoryInode: string;
  expiresAt: number;
  nonce: string;
}>;

type RoleProfile = Readonly<{ name: typeof OWNER_ROLE; model_reasoning_effort: string; developer_instructions: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('owner binding must contain only finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) throw new Error('owner binding must be JSON-compatible');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function canonicalProjectRoot(path: string): string {
  const root = realpathSync(resolve(path));
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('OWNER_PROJECT_INVALID: project root must be an existing real directory');
  return root;
}

function exactReadonlyFile(path: string, label: string): string {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error(`${label}: path must be absolute`);
  const inputStat = lstatSync(path);
  if (inputStat.isSymbolicLink()) throw new Error(`${label}: file must be regular, non-symlink, and read-only`);
  const canonical = realpathSync(path);
  const stat = lstatSync(canonical);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o222) !== 0) throw new Error(`${label}: file must be regular, non-symlink, and read-only`);
  return canonical;
}

function exactOwnerDirectory(path: string, hostRunDirectory: string): Readonly<{ path: string; device: string; inode: string }> {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('OWNER_DIRECTORY_INVALID: host owner directory path must be absolute');
  let inputStat;
  try { inputStat = lstatSync(path); } catch { throw new Error('OWNER_DIRECTORY_INVALID: host owner directory is absent or stale'); }
  if (!inputStat.isDirectory() || inputStat.isSymbolicLink() || (inputStat.mode & 0o777) !== 0o700) {
    throw new Error('OWNER_DIRECTORY_INVALID: host owner directory must be a private real directory');
  }
  const canonical = realpathSync(path);
  if (canonical !== path || dirname(canonical) !== hostRunDirectory) {
    throw new Error('OWNER_DIRECTORY_INVALID: host owner directory is copied, cross-run, or caller-selected');
  }
  return { path: canonical, device: String(inputStat.dev), inode: String(inputStat.ino) };
}

function invocationFromHost(env: NodeJS.ProcessEnv, projectRoot: string): ProjectRunInvocation {
  const activationInput = env.OMD_ACTIVATION_PATH;
  const loadedInput = env.OMD_CODEX_LOADED_SKILL_RECEIPT_PATH;
  const publicKeyInput = env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH;
  const authorityDirectory = env.OMD_CODEX_AUTHORITY_SOCKET;
  const responseDirectory = env.OMD_CODEX_AUTHORITY_RESPONSE_DIR;
  const ownerDirectory = env.OMD_CODEX_OWNER_DIRECTORY;
  if (activationInput === undefined || loadedInput === undefined || publicKeyInput === undefined
    || authorityDirectory === undefined || responseDirectory === undefined || ownerDirectory === undefined) {
    throw new Error('OWNER_CODEX_HOST_REQUIRED: start the coordinator with `omd-codex exec`');
  }
  const activationPath = exactReadonlyFile(activationInput, 'OWNER_ACTIVATION_INVALID');
  const loadedPath = exactReadonlyFile(loadedInput, 'OWNER_LOADED_SKILL_INVALID');
  const publicKeyPath = exactReadonlyFile(publicKeyInput, 'OWNER_PUBLIC_KEY_INVALID');
  if (dirname(activationPath) !== dirname(loadedPath) || dirname(activationPath) !== dirname(publicKeyPath)) {
    throw new Error('OWNER_HOST_BINDING_INVALID: activation, loaded skill, and authority key must come from one host run');
  }
  exactOwnerDirectory(ownerDirectory, dirname(activationPath));
  if (!isAbsolute(authorityDirectory) || !isAbsolute(responseDirectory)
    || realpathSync(authorityDirectory) !== realpathSync(responseDirectory)) {
    throw new Error('OWNER_HOST_BINDING_INVALID: authority channel must be one private same-host directory');
  }
  const channel = lstatSync(realpathSync(authorityDirectory));
  if (!channel.isDirectory() || channel.isSymbolicLink() || (channel.mode & 0o077) !== 0) {
    throw new Error('OWNER_HOST_BINDING_INVALID: authority channel is not private');
  }

  const parsed = JSON.parse(readFileSync(activationPath, 'utf8')) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.current)) throw new Error('OWNER_ACTIVATION_INVALID: current invocation identity is missing');
  const activation = validateActivationContext(parsed.activation);
  const current = parsed.current;
  if (activation.hostCapability.host !== 'codex'
    || current.buildSha256 !== activation.buildSha256
    || current.loadedSkillSha256 !== activation.loadedSkillSha256
    || current.briefSha256 !== activation.briefSha256) {
    throw new Error('OWNER_ACTIVATION_INVALID: invocation is stale or not Codex-host-issued');
  }

  const loaded = JSON.parse(readFileSync(loadedPath, 'utf8')) as unknown;
  if (!isRecord(loaded) || loaded.schemaVersion !== 'codex-host-loaded-skill-receipt-v1'
    || loaded.projectRoot !== projectRoot || loaded.activationSha256 !== sha256(`${canonicalJson(activation)}\n`)
    || !isRecord(loaded.loadedSkillReceipt)
    || loaded.loadedSkillReceipt.loadedSkillSha256 !== activation.loadedSkillSha256) {
    throw new Error('OWNER_HOST_BINDING_INVALID: loaded skill receipt is forged, stale, or belongs to another project');
  }
  return { activation, current: {
    buildSha256: String(current.buildSha256),
    loadedSkillSha256: String(current.loadedSkillSha256),
    briefSha256: String(current.briefSha256),
  } };
}

function roleProfile(codexHome: string): RoleProfile {
  const inputPath = join(codexHome, 'agents', `${OWNER_ROLE}.toml`);
  const inputStat = lstatSync(inputPath);
  if (inputStat.isSymbolicLink()) throw new Error('OWNER_ROLE_UNAVAILABLE: installed omd-hand profile is missing or ambiguous');
  const path = realpathSync(inputPath);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('OWNER_ROLE_UNAVAILABLE: installed omd-hand profile is missing or ambiguous');
  const parsed = parseToml(readFileSync(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || parsed.name !== OWNER_ROLE
    || typeof parsed.model_reasoning_effort !== 'string' || !/^(?:low|medium|high|xhigh)$/.test(parsed.model_reasoning_effort)
    || typeof parsed.developer_instructions !== 'string' || parsed.developer_instructions.trim() === '') {
    throw new Error('OWNER_ROLE_INVALID: installed omd-hand profile is malformed');
  }
  return parsed as unknown as RoleProfile;
}

function verifyOwnerGrant(
  response: unknown,
  publicKeyPath: string,
  expected: Readonly<{ projectRoot: string; taskSha256: string; invocation: ProjectRunInvocation; rolePromptSha256: string; ownerDirectory: string; ownerDirectoryDevice: string; ownerDirectoryInode: string }>,
  now: number,
): OwnerGrant {
  if (!isRecord(response) || !isRecord(response.receipt) || typeof response.signature !== 'string') {
    const reason = isRecord(response) && typeof response.error === 'string' ? `: ${response.error}` : '';
    throw new Error(`OWNER_AUTHORITY_REJECTED${reason}`);
  }
  const grant = response.receipt;
  const signature = Buffer.from(response.signature, 'base64');
  if (!verify(null, Buffer.from(canonicalJson(grant)), createPublicKey(readFileSync(publicKeyPath)), signature)) {
    throw new Error('OWNER_AUTHORITY_REJECTED: signature is invalid');
  }
  const activation = expected.invocation.activation;
  if (grant.schema !== OWNER_GRANT_SCHEMA || grant.host !== 'codex' || grant.owner !== OWNER_ROLE
    || grant.projectRoot !== expected.projectRoot || grant.requesterPid !== process.pid
    || grant.argvSha256 !== sha256(canonicalJson(process.argv)) || grant.taskSha256 !== expected.taskSha256
    || grant.buildSha256 !== activation.buildSha256 || grant.loadedSkillSha256 !== activation.loadedSkillSha256
    || grant.briefSha256 !== activation.briefSha256 || grant.rolePromptSha256 !== expected.rolePromptSha256
    || grant.ownerDirectory !== expected.ownerDirectory
    || grant.ownerReceiptPath !== join(expected.ownerDirectory, 'result.json')
    || grant.ownerDirectoryDevice !== expected.ownerDirectoryDevice || grant.ownerDirectoryInode !== expected.ownerDirectoryInode
    || !Number.isSafeInteger(grant.expiresAt)
    || Number(grant.expiresAt) <= now || typeof grant.nonce !== 'string' || grant.nonce.length < 32) {
    throw new Error('OWNER_AUTHORITY_REJECTED: grant binding is forged, stale, or mismatched');
  }
  return grant as OwnerGrant;
}

function hostOwnerGrant(
  env: NodeJS.ProcessEnv,
  projectRoot: string,
  taskSha256: string,
  invocation: ProjectRunInvocation,
  now: number,
): OwnerGrant {
  const socketPath = env.OMD_CODEX_AUTHORITY_SOCKET!;
  const publicKeyPath = exactReadonlyFile(env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH!, 'OWNER_PUBLIC_KEY_INVALID');
  const hostRunDirectory = dirname(realpathSync(env.OMD_ACTIVATION_PATH!));
  const ownerDirectory = exactOwnerDirectory(env.OMD_CODEX_OWNER_DIRECTORY!, hostRunDirectory);
  const response = requestCodexHostAuthority(socketPath, {
    schema: OWNER_REQUEST_SCHEMA,
    requesterPid: process.pid,
    cliPath: realpathSync(fileURLToPath(new URL('../bin/omd-codex.ts', import.meta.url))),
    activationPath: realpathSync(env.OMD_ACTIVATION_PATH!),
    projectRoot,
    argv: process.argv,
    activation: invocation.activation,
    owner: OWNER_ROLE,
    taskSha256,
  });
  const role = roleProfile(realpathSync(resolve(env.CODEX_HOME ?? join(homedir(), '.codex'))));
  return verifyOwnerGrant(response, publicKeyPath, {
    projectRoot, taskSha256, invocation, rolePromptSha256: sha256(role.developer_instructions),
    ownerDirectory: ownerDirectory.path,
    ownerDirectoryDevice: ownerDirectory.device,
    ownerDirectoryInode: ownerDirectory.inode,
  }, now);
}

function snapshotEntry(path: string): SnapshotEntry {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return Object.freeze({ kind: 'symlink', target: readlinkSync(path) });
  const mode = stat.mode & 0o7777;
  if (stat.isDirectory()) return Object.freeze({ kind: 'directory', mode });
  if (stat.isFile()) {
    const bytes = readFileSync(path);
    return Object.freeze({ kind: 'file', mode, bytes, sha256: sha256(bytes) });
  }
  return Object.freeze({ kind: 'special', mode });
}

function projectSnapshot(root: string, includeOmd: boolean): Snapshot {
  const values = new Map<string, SnapshotEntry>();
  values.set('.', snapshotEntry(root));
  const walk = (directory: string): void => {
    const directoryStat = lstatSync(directory);
    const originalMode = directoryStat.mode & 0o7777;
    let modeAdjusted = false;
    let names: string[];
    try {
      try { names = readdirSync(directory).sort(); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EACCES') throw error;
        chmodSync(directory, originalMode | 0o700);
        modeAdjusted = true;
        names = readdirSync(directory).sort();
      }
      for (const name of names) {
        if (directory === root && !includeOmd && name === '.omd') continue;
        const absolute = join(directory, name);
        const path = relative(root, absolute).split(sep).join('/');
        const entry = snapshotEntry(absolute);
        values.set(path, entry);
        if (entry.kind === 'directory') walk(absolute);
      }
    } finally {
      if (modeAdjusted) chmodSync(directory, originalMode);
    }
  };
  walk(root);
  return values;
}

function hasHistoricalObservation(projectRoot: string): boolean {
  const directory = join(projectRoot, '.omd', 'observation-v2');
  if (!existsSync(directory)) return existsSync(join(projectRoot, '.omd', 'observation-v2-repair-predecessor.json'));
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('OWNER_OBSERVATION_HISTORY_INVALID');
  }
  return readdirSync(directory).length > 0
    || existsSync(join(projectRoot, '.omd', 'observation-v2-repair-predecessor.json'));
}

function sameSnapshotEntry(left: SnapshotEntry | undefined, right: SnapshotEntry | undefined): boolean {
  if (left === undefined || right === undefined || left.kind !== right.kind) return left === right;
  if (left.kind === 'symlink' && right.kind === 'symlink') return left.target === right.target;
  if (left.kind === 'file' && right.kind === 'file') return left.mode === right.mode && left.sha256 === right.sha256;
  if (left.kind === 'directory' && right.kind === 'directory') return left.mode === right.mode;
  return left.kind === 'special' && right.kind === 'special' && left.mode === right.mode;
}

function changedPaths(before: Snapshot, after: Snapshot): string[] {
  const changed = [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => !sameSnapshotEntry(before.get(path), after.get(path)));
  return changed.filter((path) => {
    const left = before.get(path);
    const right = after.get(path);
    if ((left?.kind !== 'directory' && right?.kind !== 'directory')
      || (left !== undefined && right !== undefined)) return true;
    return !changed.some((candidate) => candidate !== path && candidate.startsWith(`${path}/`));
  }).sort();
}

function assertRestorableBaseline(snapshot: Snapshot): void {
  const special = [...snapshot.entries()].find(([, entry]) => entry.kind === 'special');
  if (special !== undefined) throw new Error(`OWNER_BASELINE_UNRESTORABLE_SPECIAL:${special[0]}`);
}

function restoreProjectSnapshot(root: string, baseline: Snapshot): void {
  const current = projectSnapshot(root, true);
  const removable = [...current.entries()]
    .filter(([path, entry]) => path !== '.' && (baseline.get(path) === undefined || baseline.get(path)?.kind !== entry.kind))
    .map(([path]) => path)
    .sort((left, right) => right.split('/').length - left.split('/').length || right.localeCompare(left));
  for (const path of removable) rmSync(join(root, path), { recursive: true, force: true });

  const directories = [...baseline.entries()]
    .filter(([, entry]) => entry.kind === 'directory')
    .sort(([left], [right]) => left.split('/').length - right.split('/').length || left.localeCompare(right));
  for (const [path, entry] of directories) {
    if (entry.kind !== 'directory') continue;
    const absolute = path === '.' ? root : join(root, path);
    if (!existsSync(absolute)) mkdirSync(absolute, { mode: entry.mode });
  }

  for (const [path, entry] of baseline) {
    if (path === '.' || entry.kind === 'directory') continue;
    const absolute = join(root, path);
    const observed = (() => { try { return snapshotEntry(absolute); } catch { return undefined; } })();
    if (entry.kind === 'file') {
      if (observed !== undefined && observed.kind !== 'file') rmSync(absolute, { recursive: true, force: true });
      if (observed?.kind !== 'file' || observed.sha256 !== entry.sha256) writeFileSync(absolute, entry.bytes);
      chmodSync(absolute, entry.mode);
    } else if (entry.kind === 'symlink' && (observed?.kind !== 'symlink' || observed.target !== entry.target)) {
      if (observed !== undefined) rmSync(absolute, { recursive: true, force: true });
      symlinkSync(entry.target, absolute);
    }
  }
  for (const [path, entry] of [...directories].reverse()) {
    if (entry.kind !== 'directory') continue;
    chmodSync(path === '.' ? root : join(root, path), entry.mode);
  }
  const restored = projectSnapshot(root, true);
  const drift = changedPaths(baseline, restored);
  if (drift.length > 0) throw new Error(`OWNER_ROLLBACK_INCOMPLETE:${drift.join(',')}`);
}

function unsafeChangedOutputs(snapshot: Snapshot, paths: readonly string[]): string[] {
  return paths.filter((path) => {
    const entry = snapshot.get(path);
    return entry !== undefined && entry.kind !== 'file';
  });
}

function currentRoute(projectRoot: string): AdaptiveRouteRecord {
  try {
    const pointer = JSON.parse(readFileSync(join(projectRoot, '.omd', 'route.json'), 'utf8')) as unknown;
    if (!isRecord(pointer) || pointer.schema !== 'adaptive-route-pointer-v1'
      || typeof pointer.record !== 'string' || !/^route-records\/sha256-[a-f0-9]{64}\.json$/.test(pointer.record)
      || typeof pointer.sha256 !== 'string' || !SHA256.test(pointer.sha256)) throw new Error('invalid pointer');
    const bytes = readFileSync(join(projectRoot, '.omd', pointer.record));
    if (sha256(bytes) !== pointer.sha256) throw new Error('stale record');
    return parseRouteRecord(JSON.parse(bytes.toString('utf8')));
  } catch {
    throw new Error('OWNER_ROUTE_INVALID: production owner requires the current immutable adaptive route');
  }
}

function shellQuote(value: string): string { return `'${value.replace(/'/g, `'"'"'`)}'`; }
function resumeCommand(projectRoot: string, sessionId: string): string {
  return `cd ${shellQuote(projectRoot)} && codex exec resume ${shellQuote(sessionId)}`;
}

function runAttempt(input: Readonly<{
  attempt: 1 | 2;
  projectRoot: string;
  task: string;
  env: NodeJS.ProcessEnv;
  invocation: ProjectRunInvocation;
  grant: OwnerGrant;
  timeoutMs: number;
  beforeSource: Snapshot;
  beforeProject: Snapshot;
}>): ProductionOwnerAttempt {
  const response = requestCodexHostAuthority(input.env.OMD_CODEX_AUTHORITY_SOCKET!, {
    schema: OWNER_EXEC_REQUEST_SCHEMA,
    requesterPid: process.pid,
    cliPath: realpathSync(fileURLToPath(new URL('../bin/omd-codex.ts', import.meta.url))),
    activationPath: realpathSync(input.env.OMD_ACTIVATION_PATH!),
    projectRoot: input.projectRoot,
    argv: process.argv,
    activation: input.invocation.activation,
    owner: OWNER_ROLE,
    taskSha256: input.grant.taskSha256,
    grantNonce: input.grant.nonce,
    attempt: input.attempt,
    timeoutMs: input.timeoutMs,
    task: input.task,
  });
  if (!isRecord(response) || !isRecord(response.receipt) || typeof response.signature !== 'string') {
    const reason = isRecord(response) && typeof response.error === 'string' ? `: ${response.error}` : '';
    throw new Error(`OWNER_EXECUTION_REJECTED${reason}`);
  }
  const value = response.receipt;
  const publicKeyPath = exactReadonlyFile(input.env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH!, 'OWNER_PUBLIC_KEY_INVALID');
  if (!verify(null, Buffer.from(canonicalJson(value)), createPublicKey(readFileSync(publicKeyPath)), Buffer.from(response.signature, 'base64'))
    || value.schema !== OWNER_EXEC_RESULT_SCHEMA || value.owner !== OWNER_ROLE || value.projectRoot !== input.projectRoot
    || value.taskSha256 !== input.grant.taskSha256 || value.grantNonce !== input.grant.nonce || value.attempt !== input.attempt
    || (value.status !== 'completed' && value.status !== 'timed-out' && value.status !== 'failed')
    || (value.exitCode !== null && !Number.isSafeInteger(value.exitCode))
    || (value.signal !== null && typeof value.signal !== 'string')
    || !Number.isSafeInteger(value.eventCount) || Number(value.eventCount) < 0 || typeof value.finalMessage !== 'string'
    || (value.processPid !== undefined && (!Number.isSafeInteger(value.processPid) || Number(value.processPid) <= 0))
    || (value.processStartIdentity !== undefined && (typeof value.processStartIdentity !== 'string' || !SHA256.test(value.processStartIdentity)))
    || (value.delegatedActivationSha256 !== undefined && (typeof value.delegatedActivationSha256 !== 'string' || !SHA256.test(value.delegatedActivationSha256)))
    || (value.sessionId !== undefined && typeof value.sessionId !== 'string')) {
    throw new Error('OWNER_EXECUTION_REJECTED: result is forged, stale, or mismatched');
  }
  const afterSource = projectSnapshot(input.projectRoot, false);
  const afterProject = projectSnapshot(input.projectRoot, true);
  const sourceChanges = changedPaths(input.beforeSource, afterSource);
  const projectChanges = changedPaths(input.beforeProject, afterProject);
  return {
    attempt: input.attempt,
    ...(value.processPid === undefined ? {} : { processPid: Number(value.processPid) }),
    ...(value.processStartIdentity === undefined ? {} : { processStartIdentity: value.processStartIdentity }),
    ...(value.delegatedActivationSha256 === undefined ? {} : { delegatedActivationSha256: value.delegatedActivationSha256 }),
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
    status: value.status,
    exitCode: value.exitCode as number | null,
    signal: value.signal as NodeJS.Signals | null,
    sourceChanges,
    projectChanges,
    unsafeOutputs: unsafeChangedOutputs(afterProject, projectChanges),
    eventCount: Number(value.eventCount),
    finalMessage: value.finalMessage,
  };
}

function persistResult(
  env: NodeJS.ProcessEnv,
  invocation: ProjectRunInvocation,
  grant: OwnerGrant,
  result: Omit<ProductionOwnerResult, 'receiptPath'>,
): ProductionOwnerResult {
  const hostRunDirectory = dirname(realpathSync(env.OMD_ACTIVATION_PATH!));
  const ownerDirectory = exactOwnerDirectory(env.OMD_CODEX_OWNER_DIRECTORY!, hostRunDirectory);
  if (ownerDirectory.path !== grant.ownerDirectory || ownerDirectory.device !== grant.ownerDirectoryDevice
    || ownerDirectory.inode !== grant.ownerDirectoryInode || grant.ownerReceiptPath !== join(ownerDirectory.path, 'result.json')) {
    throw new Error('OWNER_DIRECTORY_INVALID: owner storage changed after the host grant');
  }
  const complete = Object.freeze({ ...result, receiptPath: grant.ownerReceiptPath });
  const resultRecord = { ...complete } as Record<string, unknown>;
  const resultSha256 = sha256(`${canonicalJson(resultRecord)}\n`);
  const response = requestCodexHostAuthority(env.OMD_CODEX_AUTHORITY_SOCKET!, {
    schema: OWNER_PERSIST_REQUEST_SCHEMA,
    requesterPid: process.pid,
    cliPath: realpathSync(fileURLToPath(new URL('../bin/omd-codex.ts', import.meta.url))),
    activationPath: realpathSync(env.OMD_ACTIVATION_PATH!),
    projectRoot: grant.projectRoot,
    argv: process.argv,
    activation: invocation.activation,
    owner: OWNER_ROLE,
    taskSha256: grant.taskSha256,
    grantNonce: grant.nonce,
    resultSha256,
    result: resultRecord,
  });
  if (!isRecord(response) || !isRecord(response.receipt) || typeof response.signature !== 'string') {
    const reason = isRecord(response) && typeof response.error === 'string' ? `: ${response.error}` : '';
    throw new Error(`OWNER_PERSISTENCE_REJECTED${reason}`);
  }
  const ack = response.receipt;
  const publicKeyPath = exactReadonlyFile(env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH!, 'OWNER_PUBLIC_KEY_INVALID');
  if (!verify(null, Buffer.from(canonicalJson(ack)), createPublicKey(readFileSync(publicKeyPath)), Buffer.from(response.signature, 'base64'))
    || ack.schema !== OWNER_PERSIST_ACK_SCHEMA || ack.host !== 'codex' || ack.owner !== OWNER_ROLE
    || ack.projectRoot !== grant.projectRoot || ack.taskSha256 !== grant.taskSha256
    || ack.grantNonce !== grant.nonce || ack.resultSha256 !== resultSha256 || ack.receiptPath !== grant.ownerReceiptPath) {
    throw new Error('OWNER_PERSISTENCE_REJECTED: acknowledgment is forged, stale, or mismatched');
  }
  const receiptStat = lstatSync(grant.ownerReceiptPath);
  if (!receiptStat.isFile() || receiptStat.isSymbolicLink() || (receiptStat.mode & 0o777) !== 0o400
    || sha256(readFileSync(grant.ownerReceiptPath)) !== resultSha256) {
    throw new Error('OWNER_PERSISTENCE_REJECTED: persisted receipt bytes are absent or ambiguous');
  }
  return complete;
}

export async function runProductionOwner(
  projectPath: string,
  agent: string,
  task: string,
  dependencies: ProductionOwnerDependencies = {},
): Promise<ProductionOwnerResult> {
  if (agent !== OWNER_ROLE) throw new Error(`OWNER_MISMATCH: production source belongs to ${OWNER_ROLE}, not ${agent}`);
  if (task.trim() === '') throw new Error('OWNER_TASK_EMPTY');
  const projectRoot = canonicalProjectRoot(projectPath);
  if (existsSync(join(projectRoot, '.omd', 'observation-v2.json'))
    || existsSync(join(projectRoot, '.omd', 'observation-v2-retention.json'))
    || existsSync(join(projectRoot, '.omd', '.production-repair.journal'))
    || hasHistoricalObservation(projectRoot)) {
    throw new Error(
      'OWNER_REPAIR_BYPASS: observed production may change only through the staged repair transaction',
    );
  }
  const env = dependencies.env ?? process.env;
  const invocation = invocationFromHost(env, projectRoot);
  const codexHome = realpathSync(resolve(dependencies.codexHome ?? env.CODEX_HOME ?? join(homedir(), '.codex')));
  const role = roleProfile(codexHome);
  const route = currentRoute(projectRoot);
  if (!route.strategy.roles.includes(OWNER_ROLE) || !route.strategy.stages.includes('production')) {
    throw new Error('OWNER_ROUTE_MISMATCH: the current route did not select omd-hand production');
  }
  let productionSliceMode = false;
  if (existsSync(join(projectRoot, '.omd', 'workflow-plan.json'))) {
    try { checkAdaptiveWorkflow(projectRoot, invocation); }
    catch {
      checkAdaptiveWorkflowProductionReadiness(projectRoot, invocation);
      productionSliceMode = true;
    }
  }
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > MAX_TIMEOUT_MS) throw new Error('OWNER_TIMEOUT_INVALID: timeout must be between 25ms and 60 minutes');
  const taskSha256 = sha256(task);
  const grant = hostOwnerGrant(env, projectRoot, taskSha256, invocation, (dependencies.now ?? Date.now)());

  const baselineSource = projectSnapshot(projectRoot, false);
  const baselineProject = projectSnapshot(projectRoot, true);
  assertRestorableBaseline(baselineProject);
  const attempts: ProductionOwnerAttempt[] = [];
  for (const attemptNumber of [1, 2] as const) {
      const attempt = runAttempt({
        attempt: attemptNumber,
        projectRoot,
        task,
        env,
        invocation,
        grant,
        timeoutMs,
        beforeSource: baselineSource,
        beforeProject: baselineProject,
      });
      attempts.push(attempt);
      if (attemptNumber === 2 && attempt.sessionId !== undefined && attempt.sessionId === attempts[0]?.sessionId) {
        throw new Error('OWNER_RETRY_SESSION_REUSED');
      }
      const failAndRollback = (failure: string): ProductionOwnerResult => {
        restoreProjectSnapshot(projectRoot, baselineProject);
        return persistResult(env, invocation, grant, {
          schema: OWNER_RESULT_SCHEMA, owner: OWNER_ROLE, projectRoot, taskSha256,
          rolePromptSha256: sha256(role.developer_instructions), host: 'codex',
          transport: 'codex-exec-stdio-jsonl', modelArgumentOmitted: true,
          attempts, sourceChanges: attempt.sourceChanges, result: 'failed', failure,
          ...(attempt.sessionId === undefined ? {} : { resumeCommand: resumeCommand(projectRoot, attempt.sessionId) }),
        });
      };
      if (attempt.status === 'completed') {
        const nonSourceChanges = attempt.projectChanges.filter(
          (path) => !attempt.sourceChanges.includes(path),
        );
        if (nonSourceChanges.length > 0) {
          return failAndRollback(`OWNER_NON_SOURCE_MUTATION:${nonSourceChanges.join(',')}`);
        }
        if (attempt.unsafeOutputs.length > 0) {
          return failAndRollback(`OWNER_UNSAFE_OUTPUT:${attempt.unsafeOutputs.join(',')}`);
        }
        if (attempt.sourceChanges.length === 0) {
          return failAndRollback('OWNER_COMPLETED_WITHOUT_PRODUCTION_WRITE');
        }
        const outsideScope = pathsOutsideScope(route, attempt.sourceChanges);
        if (outsideScope.length > 0) {
          return failAndRollback(`OWNER_ROUTE_SCOPE_EXCEEDED:${outsideScope.join(',')}`);
        }
        if (productionSliceMode) {
          let sliced: ReturnType<typeof checkAdaptiveWorkflowProductionSlice>;
          try { sliced = checkAdaptiveWorkflowProductionSlice(projectRoot, invocation); }
          catch (error) {
            return failAndRollback(`OWNER_PRODUCTION_SLICE_REQUIRED:${error instanceof Error ? error.message : String(error)}`);
          }
          const expected = sliced.productionSlice!.slices.flatMap((entry) => [entry.component.source.path, entry.representativeContext.source.path]).sort();
          if (canonicalJson(expected) !== canonicalJson([...attempt.sourceChanges].sort())) {
            return failAndRollback('OWNER_PRODUCTION_SLICE_SCOPE_EXCEEDED');
          }
        }
        return persistResult(env, invocation, grant, {
          schema: OWNER_RESULT_SCHEMA, owner: OWNER_ROLE, projectRoot, taskSha256,
          rolePromptSha256: sha256(role.developer_instructions), host: 'codex', transport: 'codex-exec-stdio-jsonl',
          modelArgumentOmitted: true, attempts, sourceChanges: attempt.sourceChanges,
          result: 'completed',
          ...(attempt.sessionId === undefined ? {} : { resumeCommand: resumeCommand(projectRoot, attempt.sessionId) }),
        });
      }
      if (attempt.projectChanges.length > 0) {
        return failAndRollback('OWNER_RETRY_UNSAFE_PROJECT_MUTATION');
      }
      if (attemptNumber === 2) break;
    }
    const sessions = attempts.flatMap((attempt) => attempt.sessionId === undefined ? [] : [attempt.sessionId]);
    if (new Set(sessions).size !== sessions.length) throw new Error('OWNER_RETRY_SESSION_REUSED');
    const last = attempts.at(-1);
  return persistResult(env, invocation, grant, {
    schema: OWNER_RESULT_SCHEMA, owner: OWNER_ROLE, projectRoot, taskSha256,
    rolePromptSha256: sha256(role.developer_instructions), host: 'codex', transport: 'codex-exec-stdio-jsonl',
    modelArgumentOmitted: true, attempts, sourceChanges: [], result: 'failed', failure: 'OWNER_ATTEMPTS_EXHAUSTED',
    ...(last?.sessionId === undefined ? {} : { resumeCommand: resumeCommand(projectRoot, last.sessionId) }),
  });
}

export function productionOwnerUsage(): string {
  return 'usage: omd-codex owner run --agent omd-hand --input <task.md> [--timeout-ms <ms>] [--json]';
}

export async function runProductionOwnerCli(args: readonly string[]): Promise<number> {
  if (args[0] !== 'run') throw new Error(productionOwnerUsage());
  let agent: string | undefined;
  let input: string | undefined;
  let timeoutMs: number | undefined;
  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--json') json = true;
    else if (arg === '--agent') agent = args[++index];
    else if (arg === '--input') input = args[++index];
    else if (arg === '--timeout-ms') timeoutMs = Number(args[++index]);
    else throw new Error(productionOwnerUsage());
  }
  if (agent === undefined || input === undefined) throw new Error(productionOwnerUsage());
  const taskPath = realpathSync(resolve(input));
  const result = await runProductionOwner(process.cwd(), agent, readFileSync(taskPath, 'utf8'), timeoutMs === undefined ? {} : { timeoutMs });
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    console.log(`${result.result}: ${result.owner} (${result.attempts.length} attempt${result.attempts.length === 1 ? '' : 's'})`);
    console.log(`evidence: ${result.receiptPath}`);
    if (result.resumeCommand !== undefined) console.log(`resume: ${result.resumeCommand}`);
    if (result.failure !== undefined) console.error(result.failure);
  }
  return result.result === 'completed' ? 0 : 1;
}
