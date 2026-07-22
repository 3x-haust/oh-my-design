#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, connect, type Server } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import {
  createReviewerEvidenceProxy,
  type ReviewerEvidenceReceipt,
  type ReviewerEvidenceProxy,
} from '../core/runtime/evidence-proxy.ts';

export const REVIEWER_LAUNCH_RECEIPT_SCHEMA_VERSION = 'reviewer-launch-receipt-v1' as const;

export type ReviewerHost = 'claude' | 'codex';

export type ReviewerLaunchRequest = {
  readonly host: ReviewerHost;
  readonly buildSha256: string;
  readonly loadedSkillSha256: string;
  readonly briefSha256: string;
  readonly evidence: unknown;
  readonly alias?: {
    readonly scope: string;
    readonly expiresAt: string;
    readonly byteLimit: number;
  };
  readonly processBinding?: Partial<ReviewerProcessBinding>;
};

export type ReviewerProcessBinding = {
  readonly parentPid: number;
  readonly parentExecutableSha256: string;
  readonly runnerId: string;
  readonly sessionId: string;
  readonly nonce: string;
  readonly expiresAt: string;
};
export type ReviewerLaunchReceipt = {
  readonly schemaVersion: typeof REVIEWER_LAUNCH_RECEIPT_SCHEMA_VERSION;
  readonly host: ReviewerHost;
  readonly buildSha256: string;
  readonly loadedSkillSha256: string;
  readonly briefSha256: string;
  readonly evidence: ReviewerEvidenceReceipt;
  readonly launchId: string;
  readonly configurationSha256: string;
  readonly processBinding: ReviewerProcessBinding;
};
export type ReviewerObservedLoadedSkillReceipt = {
  readonly host: ReviewerHost;
  readonly loadedSkillReceipt: object;
  readonly loadedSkillSha256: string;
};

export type ReviewerLaunchBundle = {
  readonly loadedSkillReceipt: ReviewerObservedLoadedSkillReceipt;
  readonly reviewerLaunchReceipt: ReviewerLaunchReceipt;
  readonly adapter: ReviewerMcpAdapter;
  readonly configuration: ReviewerLaunchConfiguration;
};

const receipts = new WeakSet<ReviewerLaunchReceipt>();
const receiptLaunchers = new WeakMap<ReviewerLaunchReceipt, ReviewerMcpAdapter>();
const observedLoadedSkillReceipts = new WeakSet<ReviewerObservedLoadedSkillReceipt>();
const observedSkillLaunchers = new WeakMap<ReviewerObservedLoadedSkillReceipt, ReviewerMcpAdapter>();
const launchBundles = new WeakSet<ReviewerLaunchBundle>();
const bundleLaunchers = new WeakMap<ReviewerLaunchBundle, ReviewerMcpAdapter>();
const launchEnvironments = new WeakMap<ReviewerLaunchReceipt, Readonly<Record<string, string>>>();
/** Kept out of receipts/configuration/arguments; only the pinned host launcher may read it. */
const launchCapabilities = new WeakMap<ReviewerLaunchReceipt, string>();
const SHA256 = /^[a-f0-9]{64}$/;
const temporaryRoot = realpathSync(tmpdir());
const socketPath = (launchId: string): string => join(temporaryRoot, `o-${createHash('sha256').update(launchId).digest('hex').slice(0, 16)}`);
const executableSha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
function parentExecutableSha256(parentPid: number): string {
  const result = spawnSync('ps', ['-p', String(parentPid), '-o', 'comm='], { encoding: 'utf8' });
  const path = result.status === 0 ? result.stdout.trim() : '';
  if (!path) throw new ReviewerLaunchError('reviewer parent executable cannot be observed');
  return executableSha256(path);
}
function defaultProcessBinding(): ReviewerProcessBinding {
  return Object.freeze({
    parentPid: process.pid,
    parentExecutableSha256: executableSha256(process.execPath),
    runnerId: `reviewer-runner-${process.pid}`,
    sessionId: randomUUID(),
    nonce: randomUUID(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
}
function reviewerConfigurationSha256(launchId: string, binding: ReviewerProcessBinding): string {
  return createHash('sha256').update(JSON.stringify({
    processBinding: {
      parentPid: binding.parentPid,
      parentExecutableSha256: binding.parentExecutableSha256,
      runnerId: binding.runnerId,
      sessionId: binding.sessionId,
      nonce: binding.nonce,
      expiresAt: binding.expiresAt,
    },
    mcpServers: {
      'omd-reviewer-evidence': {
        command: REVIEWER_EVIDENCE_PROXY_COMMAND,
        args: ['--launch-id', launchId, '--configuration-sha256', '<bound>', '--socket', socketPath(launchId), '--runner-id', binding.runnerId, '--session-id', binding.sessionId, '--nonce', binding.nonce],
      },
    },
  })).digest('hex');
}
function opaquePayload(value: unknown): Uint8Array {
  if (typeof value === 'string') return new Uint8Array(Buffer.from(value));
  if (value instanceof Uint8Array) return value.slice();
  throw new ReviewerLaunchError('reviewer evidence must be opaque bytes or text');
}
type BrokerLaunch = {
  readonly receipt: ReviewerLaunchReceipt;
  evidence: Uint8Array;
  capability: string;
  server?: Server;
  expiryTimer?: NodeJS.Timeout;
};
const localLaunches = new Map<string, BrokerLaunch>();

function removeSocket(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function closeBroker(launchId: string): void {
  const launch = localLaunches.get(launchId);
  if (!launch) return;
  localLaunches.delete(launchId);
  launchCapabilities.delete(launch.receipt);
  launchEnvironments.delete(launch.receipt);
  launch.evidence.fill(0);
  launch.capability = '';
  if (launch.expiryTimer !== undefined) clearTimeout(launch.expiryTimer);
  const path = socketPath(launchId);
  if (launch.server === undefined || !launch.server.listening) {
    removeSocket(path);
    return;
  }
  launch.server.close(() => removeSocket(path));
}

function startBroker(launch: BrokerLaunch): void {
  const path = socketPath(launch.receipt.launchId);
  removeSocket(path);
  const server = createServer(socket => {
    let input = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => { input += chunk; });
    socket.on('end', () => {
      try {
        const claim = JSON.parse(input) as Partial<ReviewerProcessBinding> & { configurationSha256?: string; parentExecutableSha256?: string; launchCapability?: string };
        const binding = launch.receipt.processBinding;
        if (
          claim.parentPid !== binding.parentPid
          || claim.parentExecutableSha256 !== binding.parentExecutableSha256
          || claim.configurationSha256 !== launch.receipt.configurationSha256
          || claim.runnerId !== binding.runnerId
          || claim.sessionId !== binding.sessionId
          || claim.nonce !== binding.nonce
          || claim.launchCapability !== launch.capability
          || Date.now() >= Date.parse(binding.expiresAt)
        ) throw new ReviewerLaunchError('reviewer proxy process, executable, configuration, session, nonce, or expiry binding failed');
        if (!localLaunches.has(launch.receipt.launchId)) throw new ReviewerLaunchError('unknown, reused, or unreadable reviewer proxy launch');
        if (createHash('sha256').update(launch.evidence).digest('hex') !== launch.receipt.evidence.sha256) throw new ReviewerLaunchError('reviewer proxy evidence drifted');
        const base64 = Buffer.from(launch.evidence).toString('base64');
        closeBroker(launch.receipt.launchId);
        socket.end(JSON.stringify({ base64 }));
      } catch (error) {
        socket.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Evidence unavailable' }));
      }
    });
  });
  launch.server = server;
  server.once('error', () => closeBroker(launch.receipt.launchId));
  server.listen(path);
  if (!server.listening) {
    closeBroker(launch.receipt.launchId);
    throw new ReviewerLaunchError('reviewer evidence broker failed to listen');
  }
  const remaining = Date.parse(launch.receipt.processBinding.expiresAt) - Date.now();
  launch.expiryTimer = setTimeout(() => closeBroker(launch.receipt.launchId), Math.max(0, remaining));
  launch.expiryTimer.unref();
}

async function consumeBrokerEvidence(launchId: string, brokerSocket: string, configurationSha256: string, runnerId: string, sessionId: string, nonce: string): Promise<Uint8Array> {
  const parentPid = process.ppid;
  const launchCapability = process.env.OMD_REVIEWER_EVIDENCE_LAUNCH_CAPABILITY;
  delete process.env.OMD_REVIEWER_EVIDENCE_LAUNCH_CAPABILITY;
  if (!launchCapability) throw new ReviewerLaunchError('reviewer proxy lacks the private host launch capability');
  const claim = JSON.stringify({ parentPid, parentExecutableSha256: parentExecutableSha256(parentPid), configurationSha256, runnerId, sessionId, nonce, launchCapability });
  return await new Promise<Uint8Array>((resolvePromise, reject) => {
    const socket = connect(brokerSocket);
    let response = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.end(claim));
    socket.on('data', chunk => { response += chunk; });
    socket.on('error', () => reject(new ReviewerLaunchError('unknown, reused, or unreadable reviewer proxy launch')));
    socket.on('end', () => {
      try {
        const parsed = JSON.parse(response) as { base64?: string; error?: string };
        if (parsed.error || typeof parsed.base64 !== 'string') throw new ReviewerLaunchError(parsed.error ?? 'Evidence unavailable');
        resolvePromise(new Uint8Array(Buffer.from(parsed.base64, 'base64')));
      } catch (error) { reject(error); }
    });
  });
}
export const REVIEWER_EVIDENCE_PROXY_COMMAND = 'omd-reviewer-evidence-proxy' as const;

export type ReviewerEvidenceMcpServer = {
  readonly command: typeof REVIEWER_EVIDENCE_PROXY_COMMAND;
  readonly args: readonly string[];
};

export type ReviewerLaunchConfiguration = {
  readonly mcpServers: {
    readonly 'omd-reviewer-evidence': ReviewerEvidenceMcpServer;
  };
};

export class ReviewerLaunchError extends Error {
  override readonly name = 'ReviewerLaunchError';
  readonly reason: string;

  constructor(reason: string) {
    super(`reviewer launch rejected: ${reason}`);
    this.reason = reason;
  }
}

function requireHash(value: string, field: string): void {
  if (!SHA256.test(value)) throw new ReviewerLaunchError(`${field} must be a lowercase SHA-256 hash`);
}

/**
 * The only launcher for v2 reviewers. It deliberately emits a fixed MCP tool allowlist
 * and no working-directory or filesystem capability. The opaque evidence capability is
 * bound to the launched host and exact run identities.
 */
export class ReviewerMcpAdapter {
  readonly #evidence: ReviewerEvidenceProxy;
  readonly #configurations = new WeakSet<ReviewerLaunchConfiguration>();
  readonly #launchIds = new Set<string>();

  constructor(now?: () => number) {
    this.#evidence = createReviewerEvidenceProxy(now);
  }

  launch(request: ReviewerLaunchRequest): ReviewerLaunchReceipt {
    requireHash(request.buildSha256, 'buildSha256');
    requireHash(request.loadedSkillSha256, 'loadedSkillSha256');
    requireHash(request.briefSha256, 'briefSha256');
    const payload = opaquePayload(request.evidence);
    if (payload.byteLength === 0) throw new ReviewerLaunchError('reviewer launch requires a non-empty evidence bundle');
    const evidence = Object.freeze(this.#evidence.create(request.evidence, request.alias));
    const launchId = randomUUID();
    const processBinding = Object.freeze({ ...defaultProcessBinding(), ...request.processBinding }) as ReviewerProcessBinding;
    requireHash(processBinding.parentExecutableSha256, 'parentExecutableSha256');
    if (!Number.isSafeInteger(processBinding.parentPid) || processBinding.parentPid <= 0 || !processBinding.runnerId || !processBinding.sessionId || !processBinding.nonce || !Number.isFinite(Date.parse(processBinding.expiresAt))) {
      throw new ReviewerLaunchError('reviewer launch requires an exact parent process, runner, session, nonce, and expiry binding');
    }
    const receipt: ReviewerLaunchReceipt = Object.freeze({
      schemaVersion: REVIEWER_LAUNCH_RECEIPT_SCHEMA_VERSION,
      host: request.host,
      buildSha256: request.buildSha256,
      loadedSkillSha256: request.loadedSkillSha256,
      briefSha256: request.briefSha256,
      evidence,
      launchId,
      processBinding,
      configurationSha256: reviewerConfigurationSha256(launchId, processBinding),
    });
    receipts.add(receipt);
    receiptLaunchers.set(receipt, this);
    const launch = { receipt, evidence: payload, capability: randomBytes(32).toString('base64url') };
    launchCapabilities.set(receipt, launch.capability);
    launchEnvironments.set(receipt, Object.freeze({ OMD_REVIEWER_EVIDENCE_LAUNCH_CAPABILITY: launch.capability }));
    localLaunches.set(launchId, launch);
    this.#launchIds.add(launchId);
    try {
      startBroker(launch);
    } catch (error) {
      closeBroker(launchId);
      throw error;
    }
    return receipt;
  }
  observeLoadedSkill(
    host: ReviewerHost,
    loadedSkillReceipt: object,
    loadedSkillSha256: string,
  ): ReviewerObservedLoadedSkillReceipt {
    requireHash(loadedSkillSha256, 'loadedSkillSha256');
    const receipt: ReviewerObservedLoadedSkillReceipt = Object.freeze({
      host,
      loadedSkillReceipt,
      loadedSkillSha256,
    });
    observedLoadedSkillReceipts.add(receipt);
    observedSkillLaunchers.set(receipt, this);
    return receipt;
  }

  launchBundle(input: {
    readonly loadedSkillReceipt: ReviewerObservedLoadedSkillReceipt;
    readonly reviewerLaunchReceipt: ReviewerLaunchReceipt;
  }): ReviewerLaunchBundle {
    const { loadedSkillReceipt, reviewerLaunchReceipt } = input;
    if (
      observedSkillLaunchers.get(loadedSkillReceipt) !== this
      || !observedLoadedSkillReceipts.has(loadedSkillReceipt)
    ) {
      throw new ReviewerLaunchError('loaded-skill receipt was not observed by this host reviewer launcher');
    }
    if (receiptLaunchers.get(reviewerLaunchReceipt) !== this) {
      throw new ReviewerLaunchError('reviewer receipt is not bound to this host evidence proxy');
    }
    requireReviewerLaunchReceipt(reviewerLaunchReceipt, {
      host: loadedSkillReceipt.host,
      buildSha256: reviewerLaunchReceipt.buildSha256,
      loadedSkillSha256: loadedSkillReceipt.loadedSkillSha256,
      briefSha256: reviewerLaunchReceipt.briefSha256,
    });
    const bundle: ReviewerLaunchBundle = Object.freeze({
      loadedSkillReceipt,
      reviewerLaunchReceipt,
      adapter: this,
      configuration: this.#configuration(reviewerLaunchReceipt, loadedSkillReceipt.host),
    });
    launchBundles.add(bundle);
    bundleLaunchers.set(bundle, this);
    hostPreflightEnvironment(reviewerLaunchReceipt);
    return bundle;
  }

  requireLaunchBundle(bundle: ReviewerLaunchBundle, host: ReviewerHost): ReviewerLaunchBundle {
    if (bundleLaunchers.get(bundle) !== this || !launchBundles.has(bundle) || bundle.adapter !== this) {
      throw new ReviewerLaunchError('reviewer launch bundle was not issued by this host reviewer launcher');
    }
    const { loadedSkillReceipt, reviewerLaunchReceipt, configuration } = bundle;
    if (
      observedSkillLaunchers.get(loadedSkillReceipt) !== this
      || !observedLoadedSkillReceipts.has(loadedSkillReceipt)
      || loadedSkillReceipt.host !== host
      || receiptLaunchers.get(reviewerLaunchReceipt) !== this
    ) {
      throw new ReviewerLaunchError('reviewer launch bundle is not bound to this host evidence proxy');
    }
    requireReviewerLaunchReceipt(reviewerLaunchReceipt, {
      host,
      buildSha256: reviewerLaunchReceipt.buildSha256,
      loadedSkillSha256: loadedSkillReceipt.loadedSkillSha256,
      briefSha256: reviewerLaunchReceipt.briefSha256,
    });
    this.requireConfiguration(configuration, reviewerLaunchReceipt, host);
    return bundle;
  }
  /**
   * The pinned host invokes the real MCP proxy without exposing its private launch
   * capability to callers, receipts, or emitted configuration.
   */
  async invokeEvidenceProxy(bundle: ReviewerLaunchBundle, requests: readonly object[]): Promise<readonly Record<string, unknown>[]> {
    const bound = this.requireLaunchBundle(bundle, bundle.loadedSkillReceipt.host);
    const receipt = bound.reviewerLaunchReceipt;
    const server = this.requireConfiguration(bound.configuration, receipt, bound.loadedSkillReceipt.host)
      .mcpServers['omd-reviewer-evidence'];
    const environment = hostPreflightEnvironment(receipt);
    const executable = fileURLToPath(import.meta.url);
    const child = spawn(process.execPath, [executable, ...server.args], {
      env: { PATH: process.env.PATH ?? '', ...environment },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.end(`${requests.map(request => JSON.stringify(request)).join('\n')}\n`);
    const status = await new Promise<number | null>((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('exit', resolvePromise);
    });
    if (status !== 0) throw new ReviewerLaunchError(`reviewer evidence proxy failed: ${stderr}`);
    try {
      return Object.freeze(stdout.trim().split('\n').filter(Boolean).map(line => Object.freeze(JSON.parse(line) as Record<string, unknown>)));
    } catch {
      throw new ReviewerLaunchError('reviewer evidence proxy emitted invalid JSON-RPC');
    }
  }

  /**
   * The sole MCP configuration the host may attach to a reviewer lane. The proxy
   * resolves the opaque launch identity locally; evidence bytes, filesystem paths,
   * shell commands, and alternate tools never enter this configuration.
   */
  #configuration(receipt: ReviewerLaunchReceipt, host: ReviewerHost = receipt.host): ReviewerLaunchConfiguration {
    if (receiptLaunchers.get(receipt) !== this) {
      throw new ReviewerLaunchError('reviewer receipt is not bound to this host evidence proxy');
    }
    requireReviewerLaunchReceipt(receipt, {
      host,
      buildSha256: receipt.buildSha256,
      loadedSkillSha256: receipt.loadedSkillSha256,
      briefSha256: receipt.briefSha256,
    });
    const configuration: ReviewerLaunchConfiguration = Object.freeze({
      mcpServers: Object.freeze({
        'omd-reviewer-evidence': Object.freeze({
          command: REVIEWER_EVIDENCE_PROXY_COMMAND,
          args: Object.freeze([
            '--launch-id', receipt.launchId,
            '--configuration-sha256', receipt.configurationSha256,
            '--socket', socketPath(receipt.launchId),
            '--runner-id', receipt.processBinding.runnerId,
            '--session-id', receipt.processBinding.sessionId,
            '--nonce', receipt.processBinding.nonce,
          ]),
        }),
      }),
    });
    this.#configurations.add(configuration);
    return configuration;
  }

  requireConfiguration(
    configuration: ReviewerLaunchConfiguration,
    receipt: ReviewerLaunchReceipt,
    host: ReviewerHost,
  ): ReviewerLaunchConfiguration {
    if (receiptLaunchers.get(receipt) !== this) {
      throw new ReviewerLaunchError('reviewer receipt is not bound to this host evidence proxy');
    }
    requireReviewerLaunchReceipt(receipt, {
      host,
      buildSha256: receipt.buildSha256,
      loadedSkillSha256: receipt.loadedSkillSha256,
      briefSha256: receipt.briefSha256,
    });
    if (!this.#configurations.has(configuration)) {
      throw new ReviewerLaunchError('reviewer configuration was not issued by the host reviewer launcher');
    }
    const server = configuration.mcpServers['omd-reviewer-evidence'];
    if (
      Object.keys(configuration.mcpServers).length !== 1
      || server.command !== REVIEWER_EVIDENCE_PROXY_COMMAND
      || server.args.length !== 12
      || server.args[0] !== '--launch-id'
      || server.args[1] !== receipt.launchId
      || server.args[2] !== '--configuration-sha256'
      || server.args[3] !== receipt.configurationSha256
      || server.args[4] !== '--socket'
      || server.args[5] !== socketPath(receipt.launchId)
      || server.args[6] !== '--runner-id'
      || server.args[7] !== receipt.processBinding.runnerId
      || server.args[8] !== '--session-id'
      || server.args[9] !== receipt.processBinding.sessionId
      || server.args[10] !== '--nonce'
      || server.args[11] !== receipt.processBinding.nonce
      || reviewerConfigurationSha256(receipt.launchId, receipt.processBinding) !== receipt.configurationSha256
    ) {
      throw new ReviewerLaunchError('reviewer configuration exposes an unapproved tool or launch identity');
    }
    return configuration;
  }

  dispose(): void {
    for (const launchId of this.#launchIds) closeBroker(launchId);
    this.#launchIds.clear();
  }
}

/** E5/E13-pinned host launcher only. Never export this capability into reviewer configuration. */
function hostPreflightEnvironment(receipt: ReviewerLaunchReceipt): Readonly<Record<string, string>> {
  const environment = launchEnvironments.get(receipt);
  if (!environment || !launchCapabilities.get(receipt) || !receipts.has(receipt)) throw new ReviewerLaunchError('reviewer launch capability is unavailable');
  return environment;
}

export function createReviewerMcpAdapter(now?: () => number): ReviewerMcpAdapter {
  return new ReviewerMcpAdapter(now);
}

export function requireReviewerLaunchReceipt(
  receipt: ReviewerLaunchReceipt,
  expected?: Pick<ReviewerLaunchReceipt, 'host' | 'buildSha256' | 'loadedSkillSha256' | 'briefSha256'>,
): ReviewerLaunchReceipt {
  if (!receipts.has(receipt) || receipt.schemaVersion !== REVIEWER_LAUNCH_RECEIPT_SCHEMA_VERSION) {
    throw new ReviewerLaunchError('receipt was not issued by the host reviewer launcher');
  }
  if (expected !== undefined && (
    receipt.host !== expected.host
    || receipt.buildSha256 !== expected.buildSha256
    || receipt.loadedSkillSha256 !== expected.loadedSkillSha256
    || receipt.briefSha256 !== expected.briefSha256
  )) {
    throw new ReviewerLaunchError('receipt is not bound to this host, build, loaded skill, and brief');
  }
  return receipt;
}

export function reviewerEvidenceSha256(receipt: ReviewerLaunchReceipt): string {
  return requireReviewerLaunchReceipt(receipt).evidence.sha256;
}
export const REVIEWER_EVIDENCE_MCP_TOOL = 'read_reviewer_evidence' as const;

type JsonRpcRequest = {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
};

function jsonRpcResult(id: unknown, result: object): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(id: unknown, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

/** Runs the one-tool reviewer evidence MCP server over newline-delimited JSON-RPC stdio; preflight-bound process, configuration, runner, session, and nonce identities are required to read evidence. */
export async function runReviewerEvidenceProxyStdio(argv: readonly string[]): Promise<void> {
  const valid = argv.length === 12
    && argv[0] === '--launch-id' && /^[0-9a-f-]{36}$/i.test(argv[1]!)
    && argv[2] === '--configuration-sha256' && SHA256.test(argv[3]!)
    && argv[4] === '--socket' && typeof argv[5] === 'string' && argv[5].length > 0
    && argv[6] === '--runner-id' && argv[7]!
    && argv[8] === '--session-id' && argv[9]!
    && argv[10] === '--nonce' && argv[11]!;
  if (!valid) throw new ReviewerLaunchError('usage: omd-reviewer-evidence-proxy requires the emitted process-bound reviewer configuration');
  const [,, , configurationSha256,, brokerSocket, , runnerId,, sessionId,, nonce] = argv;
  const launchId = argv[1]!;
  let initialized = false;
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    let request: JsonRpcRequest;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      request = parsed as JsonRpcRequest;
    } catch {
      process.stdout.write(`${jsonRpcError(null, -32700, 'Parse error')}\n`);
      continue;
    }
    const hasId = Object.hasOwn(request, 'id');
    const id = request.id;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      if (hasId) process.stdout.write(`${jsonRpcError(id, -32600, 'Invalid Request')}\n`);
      continue;
    }
    if (request.method === 'notifications/initialized') continue;
    if (request.method === 'initialize') {
      if (initialized) {
        if (hasId) process.stdout.write(`${jsonRpcError(id, -32600, 'Already initialized')}\n`);
        continue;
      }
      initialized = true;
      if (hasId) {
        process.stdout.write(`${jsonRpcResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: REVIEWER_EVIDENCE_PROXY_COMMAND, version: '1' },
        })}\n`);
      }
      continue;
    }
    if (!initialized) {
      if (hasId) process.stdout.write(`${jsonRpcError(id, -32002, 'Server not initialized')}\n`);
      continue;
    }
    if (request.method === 'tools/list') {
      if (hasId) {
        process.stdout.write(`${jsonRpcResult(id, {
          tools: [{
            name: REVIEWER_EVIDENCE_MCP_TOOL,
            description: 'Read the opaque evidence bound to this reviewer launch exactly once.',
            inputSchema: { type: 'object', additionalProperties: false },
          }],
        })}\n`);
      }
      continue;
    }
    if (request.method === 'tools/call') {
      const params = request.params;
      if (
        typeof params !== 'object' || params === null || Array.isArray(params)
        || (params as Record<string, unknown>).name !== REVIEWER_EVIDENCE_MCP_TOOL
        || !Object.hasOwn(params, 'arguments')
        || typeof (params as Record<string, unknown>).arguments !== 'object'
        || (params as Record<string, unknown>).arguments === null
        || Array.isArray((params as Record<string, unknown>).arguments)
        || Object.keys((params as Record<string, unknown>).arguments as object).length !== 0
      ) {
        if (hasId) process.stdout.write(`${jsonRpcError(id, -32602, 'Invalid evidence tool arguments')}\n`);
        continue;
      }
      try {
        const bytes = await consumeBrokerEvidence(launchId, brokerSocket!, configurationSha256!, runnerId!, sessionId!, nonce!);
        const base64 = Buffer.from(bytes).toString('base64');
        if (hasId) {
          process.stdout.write(`${jsonRpcResult(id, {
            content: [{ type: 'text', text: base64 }],
            structuredContent: {
              base64,
              byteLength: bytes.byteLength,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            },
          })}\n`);
        }
      } catch (error) {
        if (hasId) process.stdout.write(`${jsonRpcError(id, -32000, error instanceof Error ? error.message : 'Evidence unavailable')}\n`);
      }
      continue;
    }
    if (hasId) process.stdout.write(`${jsonRpcError(id, -32601, 'Method not found')}\n`);
  }
}

if (process.argv[1] !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  runReviewerEvidenceProxyStdio(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
