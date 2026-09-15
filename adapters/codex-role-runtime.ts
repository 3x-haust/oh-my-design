import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parseRouteRecord } from '../core/route/adaptive-route-record.ts';
import { readCodexAuthorizedRoute } from './codex-authorized-route.ts';
import { requestCodexHostAuthority } from '../core/runtime/codex-host-client.ts';
import { validateActivationContext } from '../core/runtime/activation.ts';
import { fileURLToPath } from 'node:url';
import { RENDERED_REFINEMENT_REVIEWER_TASK } from '../core/runtime/rendered-refinement.ts';
import { CODEX_STUDY_ROLE, isCodexStudyDirectory } from './codex-study-runtime.ts';
import {
  FINAL_RENDER_REVIEWER_TASK,
  FINAL_RENDER_REVIEWER_TRANSPORT_SCHEMA,
} from '../core/runtime/final-render-review.ts';

const NON_PRODUCTION_ROLES = new Set([
  'omd-framer',
  'omd-scout',
  'omd-writer',
  'omd-typesetter',
  'omd-composer',
  'omd-sketch',
  'omd-eye',
  'omd-glance',
  CODEX_STUDY_ROLE,
]);
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

type RoleProfile = Readonly<{
  name: string;
  model_reasoning_effort: string;
  developer_instructions: string;
}>;

export type CodexRoleResult = Readonly<{
  schema: 'omd-codex-role-result-v1';
  agent: string;
  projectRoot: string;
  transport: 'codex-exec-stdio-jsonl';
  modelArgumentOmitted: boolean;
  model?: string;
  modelReasoningEffort: string;
  sessionId?: string;
  eventCount: number;
  finalMessage: string;
  result: 'completed' | 'failed';
  failure?: string;
  /** Host-selected provisional source directory, never a production or quality approval. */
  studyDirectory?: string;
  authority: Readonly<{
    receipt: CodexRoleAuthorityReceipt;
    signature: string;
  }>;
}>;

export type CodexRoleAuthorityReceipt = Readonly<{
  schema: 'omd-codex-role-exec-result-v1';
  role: string;
  projectRoot: string;
  status: 'completed' | 'failed';
  exitCode: number | null;
  signal: string | null;
  eventCount: number;
  finalMessage: string;
  processPid: number;
  roleNonce: string;
  taskSha256?: string;
  studyDirectory?: string;
  reviewerEvidence?: Readonly<{
    schema: 'omd-reviewer-evidence-consumption-v1';
    evidenceSha256: string;
    packetSha256: string;
    taskSha256: string;
    childPid: number;
    sessionId: string;
    nonce: string;
  }>;
  modelArgumentOmitted?: boolean;
  model?: string;
  modelReasoningEffort?: string;
  configurationSha256: string;
  buildSha256: string;
  briefSha256: string;
  sessionId?: string;
  failure?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) throw new Error('role result must be JSON-compatible');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function canonicalProjectRoot(path: string): string {
  const root = realpathSync(resolve(path));
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('ROLE_PROJECT_INVALID: project root must be an existing real directory');
  }
  return root;
}

function roleProfile(codexHome: string, agent: string): RoleProfile {
  const inputPath = join(codexHome, 'agents', `${agent}.toml`);
  const inputStat = lstatSync(inputPath);
  if (inputStat.isSymbolicLink()) throw new Error('ROLE_PROFILE_UNAVAILABLE: installed role profile is ambiguous');
  const path = realpathSync(inputPath);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('ROLE_PROFILE_UNAVAILABLE: installed role profile is missing');
  const parsed = parseToml(readFileSync(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || parsed.name !== agent
    || typeof parsed.model_reasoning_effort !== 'string'
    || !/^(?:low|medium|high|xhigh)$/.test(parsed.model_reasoning_effort)
    || typeof parsed.developer_instructions !== 'string'
    || parsed.developer_instructions.trim() === '') {
    throw new Error('ROLE_PROFILE_INVALID: installed role profile is malformed');
  }
  return parsed as unknown as RoleProfile;
}

function selectedRoles(projectRoot: string, env: NodeJS.ProcessEnv): readonly string[] {
  const pointer = JSON.parse(readFileSync(join(projectRoot, '.omd', 'route.json'), 'utf8')) as unknown;
  if (!isRecord(pointer) || pointer.schema !== 'adaptive-route-pointer-v1'
    || typeof pointer.record !== 'string'
    || !/^route-records\/sha256-[a-f0-9]{64}\.json$/.test(pointer.record)) {
    throw new Error('ROLE_ROUTE_INVALID: a current adaptive route is required');
  }
  const value = JSON.parse(readFileSync(join(projectRoot, '.omd', pointer.record), 'utf8')) as unknown;
  if (env.OMD_CODEX_AUTHORITY_SOCKET !== undefined && isRecord(value) && isRecord(value.strategy)
    && Array.isArray(value.strategy.aiAssets) && value.strategy.aiAssets.length > 0) {
    return readCodexAuthorizedRoute(projectRoot, env).strategy.roles;
  }
  return parseRouteRecord(value).strategy.roles;
}

function parseEvents(stdout: string): Pick<CodexRoleResult, 'sessionId' | 'eventCount' | 'finalMessage'> & { completed: boolean; failed: boolean } {
  let sessionId: string | undefined;
  let eventCount = 0;
  let finalMessage = '';
  let completed = false;
  let failed = false;
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    eventCount += 1;
    let event: unknown;
    try { event = JSON.parse(line) as unknown; } catch { failed = true; continue; }
    if (!isRecord(event) || typeof event.type !== 'string') { failed = true; continue; }
    if (event.type === 'thread.started' && typeof event.thread_id === 'string') sessionId = event.thread_id;
    if (event.type === 'turn.completed') completed = true;
    if (event.type === 'turn.failed' || event.type === 'error') failed = true;
    if (event.type === 'item.completed' && isRecord(event.item)
      && event.item.type === 'agent_message' && typeof event.item.text === 'string') {
      finalMessage = event.item.text;
    }
  }
  return { ...(sessionId === undefined ? {} : { sessionId }), eventCount, finalMessage, completed, failed };
}

export function runCodexRole(
  projectPath: string,
  agent: string,
  task: string,
  options: Readonly<{
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    codexHome?: string;
    reviewerPacket?: Readonly<{ path: string; sha256: string; evidenceSha256: string; task: string }>;
  }> = {},
): CodexRoleResult {
  if (!NON_PRODUCTION_ROLES.has(agent)) {
    throw new Error(`ROLE_MISMATCH: ${agent} is not a non-production OMD role`);
  }
  if (task.trim() === '') throw new Error('ROLE_TASK_EMPTY');
  const projectRoot = canonicalProjectRoot(projectPath);
  const env = options.env ?? process.env;
  if (!selectedRoles(projectRoot, env).includes(agent)) {
    throw new Error(`ROLE_ROUTE_MISMATCH: the current route did not select ${agent}`);
  }
  for (const name of [
    'OMD_ACTIVATION_PATH',
    'OMD_CODEX_AUTHORITY_SOCKET',
    'OMD_CODEX_AUTHORITY_RESPONSE_DIR',
    'OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH',
  ]) {
    if (env[name] === undefined) throw new Error('ROLE_CODEX_HOST_REQUIRED: start the coordinator with `omd-codex exec`');
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error('ROLE_TIMEOUT_INVALID: timeout must be between 25ms and 60 minutes');
  }
  const activationPath = realpathSync(env.OMD_ACTIVATION_PATH!);
  const parsed = JSON.parse(readFileSync(activationPath, 'utf8')) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.current)) throw new Error('ROLE_ACTIVATION_INVALID');
  const activation = validateActivationContext(parsed.activation);
  const response = requestCodexHostAuthority(env.OMD_CODEX_AUTHORITY_SOCKET!, {
    schema: 'omd-codex-role-exec-request-v1',
    requesterPid: process.pid,
    cliPath: realpathSync(fileURLToPath(new URL('../bin/omd-codex.ts', import.meta.url))),
    activationPath,
    projectRoot,
    argv: process.argv,
    activation,
    role: agent,
    timeoutMs,
    task,
    ...(options.reviewerPacket === undefined ? {} : {
      reviewerPacket: { path: options.reviewerPacket.path, sha256: options.reviewerPacket.sha256 },
    }),
  });
  if (!isRecord(response) || !isRecord(response.receipt) || typeof response.signature !== 'string') {
    const reason = isRecord(response) && typeof response.error === 'string' ? `:${response.error}` : '';
    throw new Error(`ROLE_AUTHORITY_REJECTED${reason}`);
  }
  const receipt = response.receipt;
  const publicKey = createPublicKey(readFileSync(realpathSync(env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH!)));
  const expectedTaskSha256 = createHash('sha256').update(
    options.reviewerPacket === undefined ? task : options.reviewerPacket.task,
  ).digest('hex');
  const reviewerEvidence = isRecord(receipt.reviewerEvidence) ? receipt.reviewerEvidence : undefined;
  if (!verify(null, Buffer.from(canonicalJson(receipt)), publicKey, Buffer.from(response.signature, 'base64'))
    || receipt.schema !== 'omd-codex-role-exec-result-v1' || receipt.role !== agent
    || receipt.projectRoot !== projectRoot || (receipt.status !== 'completed' && receipt.status !== 'failed')
    || (receipt.exitCode !== null && !Number.isSafeInteger(receipt.exitCode))
    || (receipt.signal !== null && typeof receipt.signal !== 'string')
    || !Number.isSafeInteger(receipt.eventCount) || typeof receipt.finalMessage !== 'string'
    || !Number.isSafeInteger(receipt.processPid) || Number(receipt.processPid) <= 0
    || typeof receipt.roleNonce !== 'string' || receipt.roleNonce.trim() === ''
    || typeof receipt.modelArgumentOmitted !== 'boolean'
    || (receipt.modelArgumentOmitted ? receipt.model !== undefined : typeof receipt.model !== 'string' || receipt.model.trim() === '')
    || typeof receipt.modelReasoningEffort !== 'string' || !/^(?:low|medium|high|xhigh)$/.test(receipt.modelReasoningEffort)
    || typeof receipt.configurationSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.configurationSha256)
    || typeof receipt.buildSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.buildSha256)
    || typeof receipt.briefSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.briefSha256)
    || receipt.taskSha256 !== expectedTaskSha256
    || (agent === CODEX_STUDY_ROLE
      ? !isCodexStudyDirectory(projectRoot, receipt.studyDirectory)
      : receipt.studyDirectory !== undefined)
    || (options.reviewerPacket === undefined
      ? receipt.reviewerEvidence !== undefined
      : reviewerEvidence === undefined
        || reviewerEvidence.schema !== 'omd-reviewer-evidence-consumption-v1'
        || reviewerEvidence.packetSha256 !== options.reviewerPacket.sha256
        || reviewerEvidence.evidenceSha256 !== options.reviewerPacket.evidenceSha256
        || reviewerEvidence.taskSha256 !== expectedTaskSha256
        || !Number.isSafeInteger(reviewerEvidence.childPid) || Number(reviewerEvidence.childPid) <= 0
        || typeof reviewerEvidence.sessionId !== 'string' || reviewerEvidence.sessionId === ''
        || typeof reviewerEvidence.nonce !== 'string' || reviewerEvidence.nonce === '')
    || (receipt.sessionId !== undefined && typeof receipt.sessionId !== 'string')
    || (receipt.failure !== undefined && typeof receipt.failure !== 'string')) {
    throw new Error('ROLE_AUTHORITY_REJECTED: result is forged, stale, or mismatched');
  }
  const receiptModel = typeof receipt.model === 'string' ? receipt.model : undefined;
  const authorityReceipt: CodexRoleAuthorityReceipt = {
    schema: 'omd-codex-role-exec-result-v1',
    role: receipt.role,
    projectRoot: receipt.projectRoot,
    status: receipt.status,
    exitCode: receipt.exitCode === null ? null : Number(receipt.exitCode),
    signal: receipt.signal,
    eventCount: Number(receipt.eventCount),
    finalMessage: receipt.finalMessage,
    processPid: Number(receipt.processPid),
    roleNonce: receipt.roleNonce,
    taskSha256: receipt.taskSha256 as string,
    ...(agent === CODEX_STUDY_ROLE ? { studyDirectory: receipt.studyDirectory as string } : {}),
    ...(reviewerEvidence === undefined ? {} : {
      reviewerEvidence: {
        schema: 'omd-reviewer-evidence-consumption-v1',
        evidenceSha256: reviewerEvidence.evidenceSha256 as string,
        packetSha256: reviewerEvidence.packetSha256 as string,
        taskSha256: reviewerEvidence.taskSha256 as string,
        childPid: Number(reviewerEvidence.childPid),
        sessionId: reviewerEvidence.sessionId as string,
        nonce: reviewerEvidence.nonce as string,
      },
    }),
    modelArgumentOmitted: receipt.modelArgumentOmitted,
    ...(receiptModel === undefined ? {} : { model: receiptModel }),
    modelReasoningEffort: receipt.modelReasoningEffort,
    configurationSha256: receipt.configurationSha256,
    buildSha256: receipt.buildSha256,
    briefSha256: receipt.briefSha256,
    ...(receipt.sessionId === undefined ? {} : { sessionId: receipt.sessionId }),
    ...(receipt.failure === undefined ? {} : { failure: receipt.failure }),
  };
  return {
    schema: 'omd-codex-role-result-v1',
    agent,
    projectRoot,
    transport: 'codex-exec-stdio-jsonl',
    modelArgumentOmitted: receipt.modelArgumentOmitted,
    ...(receiptModel === undefined ? {} : { model: receiptModel }),
    modelReasoningEffort: receipt.modelReasoningEffort,
    ...(receipt.sessionId === undefined ? {} : { sessionId: receipt.sessionId }),
    eventCount: Number(receipt.eventCount),
    finalMessage: receipt.finalMessage,
    result: receipt.status,
    ...(agent === CODEX_STUDY_ROLE ? { studyDirectory: receipt.studyDirectory as string } : {}),
    ...(receipt.failure === undefined ? {} : { failure: receipt.failure }),
    authority: {
      receipt: authorityReceipt,
      signature: response.signature,
    },
  };
}

export function codexRoleUsage(): string {
  return 'usage: omd-codex role run --agent <non-production-role> [--input <task.md> | --reviewer-packet <content-addressed-packet.json>] [--timeout-ms <ms>] [--json]';
}

export function runCodexRoleCli(args: readonly string[]): number {
  if (args[0] !== 'run') throw new Error(codexRoleUsage());
  let agent: string | undefined;
  let input: string | undefined;
  let timeoutMs: number | undefined;
  let reviewerPacketInput: string | undefined;
  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--json') json = true;
    else if (arg === '--agent') agent = args[++index];
    else if (arg === '--input') input = args[++index];
    else if (arg === '--timeout-ms') timeoutMs = Number(args[++index]);
    else if (arg === '--reviewer-packet') reviewerPacketInput = args[++index];
    else throw new Error(codexRoleUsage());
  }
  if (agent === undefined || (input === undefined && reviewerPacketInput === undefined)
    || (input !== undefined && reviewerPacketInput !== undefined)) throw new Error(codexRoleUsage());
  const reviewerPacket = reviewerPacketInput === undefined ? undefined : (() => {
    if (agent !== 'omd-eye') throw new Error('ROLE_REVIEWER_PACKET_FORBIDDEN: only omd-eye may consume reviewer evidence');
    const projectRoot = canonicalProjectRoot(process.cwd());
    const absolute = realpathSync(resolve(reviewerPacketInput));
    const path = relative(projectRoot, absolute).split('\\').join('/');
    const bytes = readFileSync(absolute);
    let value: unknown;
    try { value = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error('ROLE_REVIEWER_PACKET_INVALID'); }
    if (!isRecord(value)) throw new Error('ROLE_REVIEWER_PACKET_INVALID');
    const task = value.schema === 'adaptive-rendered-refinement-reviewer-transport-v1'
      ? RENDERED_REFINEMENT_REVIEWER_TASK
      : value.schema === FINAL_RENDER_REVIEWER_TRANSPORT_SCHEMA
        ? FINAL_RENDER_REVIEWER_TASK : undefined;
    if (task === undefined
      || typeof value.evidenceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.evidenceSha256)
      || !/^\.omd\/(?:refinement|final-review)\/reviewer-packets\/sha256-[a-f0-9]{64}\.json$/.test(path)
      || (value.schema === 'adaptive-rendered-refinement-reviewer-transport-v1') !== path.startsWith('.omd/refinement/')) {
      throw new Error('ROLE_REVIEWER_PACKET_INVALID');
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (!path.endsWith(`sha256-${sha256}.json`)) throw new Error('ROLE_REVIEWER_PACKET_INVALID');
    return { path, sha256, evidenceSha256: value.evidenceSha256, task };
  })();
  const result = runCodexRole(
    process.cwd(),
    agent,
    input === undefined
      ? RENDERED_REFINEMENT_REVIEWER_TASK
      : readFileSync(realpathSync(resolve(input)), 'utf8'),
    {
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(reviewerPacket === undefined ? {} : { reviewerPacket }),
    },
  );
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    console.log(`${result.result}: ${result.agent}`);
    if (result.sessionId !== undefined) console.log(`session: ${result.sessionId}`);
    if (result.failure !== undefined) console.error(result.failure);
  }
  return result.result === 'completed' ? 0 : 1;
}
