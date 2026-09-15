#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer, connect, type Server } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import {
  createReviewerEvidenceProxy,
  type ReviewerEvidenceReceipt,
  type ReviewerEvidenceProxy,
} from '../core/runtime/evidence-proxy.ts';

export const REVIEWER_LAUNCH_RECEIPT_SCHEMA_VERSION = 'reviewer-launch-receipt-v1' as const;

export type ReviewerHost = 'claude' | 'codex' | 'benchmark';
export type ProductionReviewerHost = Exclude<ReviewerHost, 'benchmark'>;

export type ReviewerLaunchRequest = {
  readonly host: ReviewerHost;
  readonly buildSha256: string;
  readonly loadedSkillSha256: string;
  readonly briefSha256: string;
  readonly browserSha256: string;
  readonly evidence: unknown;
  readonly alias?: {
    readonly scope: string;
    readonly expiresAt: string;
    readonly byteLimit: number;
  };
  readonly processBinding?: ReviewerProcessBinding;
  readonly proxyBinding?: ReviewerProxyBinding;
};

export type ReviewerProcessBinding = {
  readonly parentPid: number;
  readonly parentExecutableSha256: string;
  readonly reviewerPid: number;
  readonly reviewerExecutableSha256: string;
  readonly laneId: string;
  readonly runnerId: string;
  readonly sessionId: string;
  readonly nonce: string;
  readonly expiresAt: string;
};
export type ReviewerProxyBinding = {
  readonly stagedPath: string;
  readonly stagedSha256: string;
  readonly targetPath: string;
  readonly targetSha256: string;
};
export type ReviewerLaunchReceipt = {
  readonly schemaVersion: typeof REVIEWER_LAUNCH_RECEIPT_SCHEMA_VERSION;
  readonly host: ReviewerHost;
  readonly buildSha256: string;
  readonly loadedSkillSha256: string;
  readonly briefSha256: string;
  readonly browserSha256: string;
  readonly evidence: ReviewerEvidenceReceipt;
  readonly launchId: string;
  readonly configurationSha256: string;
  readonly processBinding: ReviewerProcessBinding;
  readonly proxyBinding: ReviewerProxyBinding;
};
export type ReviewerObservedLoadedSkillReceipt = {
  readonly host: ReviewerHost;
  readonly authority: 'production-host-loaded-skill' | 'production-host-delegated-reviewer' | 'runner-benchmark';
  readonly loadedSkillReceipt: object;
  readonly hostPid: number;
  readonly hostExecutableSha256: string;
  readonly reviewerExecutableSha256: string;
  readonly loadedSkillSha256: string;
};

export type ReviewerLaunchBundle = {
  readonly loadedSkillReceipt: ReviewerObservedLoadedSkillReceipt;
  readonly reviewerLaunchReceipt: ReviewerLaunchReceipt;
  readonly adapter: ReviewerMcpAdapter;
  readonly configuration: ReviewerLaunchConfiguration;
};
export type ReviewerLaunchSpec = {
  readonly host: ReviewerHost;
  readonly command: string;
  readonly args: readonly string[];
  readonly laneId: string;
  readonly raterId: string;
};

const receipts = new WeakSet<ReviewerLaunchReceipt>();
const receiptLaunchers = new WeakMap<ReviewerLaunchReceipt, ReviewerMcpAdapter>();
const observedLoadedSkillReceipts = new WeakSet<ReviewerObservedLoadedSkillReceipt>();
const observedSkillLaunchers = new WeakMap<ReviewerObservedLoadedSkillReceipt, ReviewerMcpAdapter>();
const launchBundles = new WeakSet<ReviewerLaunchBundle>();
const bundleLaunchers = new WeakMap<ReviewerLaunchBundle, ReviewerMcpAdapter>();
const verifiedEvidenceProofs = new WeakMap<ReviewerLaunchReceipt, Readonly<{ sha256: string; launchId: string; configurationSha256: string; childPid: number; verifiedAt: number }>>();
const completedReviewerLaunches = new WeakSet<ReviewerLaunchReceipt>();
const completedReviewerLaunchIds = new Set<string>();
const bundledReviewerLaunches = new WeakSet<ReviewerLaunchReceipt>();
const consumedReviewerLaunches = new WeakSet<ReviewerLaunchReceipt>();
type ProductionParentAuthority = Readonly<{
  readonly kind: 'production-host';
  readonly hostPid: number;
  readonly hostExecutableSha256: string;
}>;
type DelegatedProductionParentAuthority = Readonly<{
  readonly kind: 'delegated-production-host';
  readonly hostPid: number;
  readonly hostExecutableSha256: string;
  readonly reviewerPid: number;
  readonly reviewerExecutableSha256: string;
}>;
type BenchmarkParentAuthority = Readonly<{
  readonly kind: 'benchmark-reviewer';
  readonly interpreterSha256: string;
  readonly targetSha256: string;
}>;
type ParentAuthority = ProductionParentAuthority | DelegatedProductionParentAuthority | BenchmarkParentAuthority;
const observedParentAuthorities = new WeakMap<ReviewerObservedLoadedSkillReceipt, ParentAuthority>();
const reviewerProxyTarget = resolve(fileURLToPath(import.meta.url));
const reviewerProxyInterpreter = realpathSync(process.execPath);
const SHA256 = /^[a-f0-9]{64}$/;
const temporaryRoot = realpathSync(tmpdir());
const socketPath = (launchId: string): string => join(temporaryRoot, `o-${createHash('sha256').update(launchId).digest('hex').slice(0, 16)}`);
const executableSha256 = (path: string): string => {
  const resolved = isAbsolute(path) ? path : path === basename(process.execPath) ? process.execPath : '';
  if (!resolved) throw new ReviewerLaunchError('reviewer process executable path is not absolute');
  return createHash('sha256').update(readFileSync(resolved)).digest('hex');
};
type ProcessInfo = Readonly<{ pid: number; parentPid: number; executableSha256: string; command: readonly string[] }>;

function processInfo(pid: number): ProcessInfo {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,command='], { encoding: 'utf8', env: { PATH: '' } });
  const match = result.status === 0 ? result.stdout.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/) : undefined;
  if (!match) throw new ReviewerLaunchError('reviewer process cannot be observed');
  const command = Object.freeze(match[3]!.trim().split(/\s+/));
  return Object.freeze({
    pid: Number(match[1]),
    parentPid: Number(match[2]),
    executableSha256: executableSha256(command[0]!),
    command,
  });
}

function processDescendsFrom(child: ProcessInfo, ancestorPid: number): boolean {
  const seen = new Set<number>([child.pid]);
  let parentPid = child.parentPid;
  for (let depth = 0; depth < 8; depth += 1) {
    if (parentPid === ancestorPid) return true;
    if (parentPid <= 1 || seen.has(parentPid)) return false;
    seen.add(parentPid);
    try { parentPid = processInfo(parentPid).parentPid; } catch { return false; }
  }
  return false;
}

function requireProxyChild(pid: number, expectedArgs: readonly string[], receipt: ReviewerLaunchReceipt): ProcessInfo {
  const child = processInfo(pid);
  const proxy = receipt.proxyBinding;
  const expectedCommand = [process.execPath, proxy.targetPath, ...expectedArgs];
  const delegated = receipt.processBinding.parentPid !== receipt.processBinding.reviewerPid;
  const boundToReviewer = delegated
    ? processDescendsFrom(child, receipt.processBinding.reviewerPid)
    : child.parentPid === receipt.processBinding.reviewerPid;
  if (expectedCommand.some((argument) => /\s/.test(argument))) {
    throw new ReviewerLaunchError('reviewer proxy exact argv contains an unsupported whitespace-bearing path or argument');
  }
  if (
    !boundToReviewer
    || child.executableSha256 !== executableSha256(process.execPath)
    || executableSha256(proxy.targetPath) !== proxy.targetSha256
    || executableSha256(proxy.stagedPath) !== proxy.stagedSha256
    || child.command.length !== expectedCommand.length
    || expectedCommand.some((argument, index) => child.command[index] !== argument)
  ) {
    throw new ReviewerLaunchError('reviewer proxy child PID, bounded parent chain, exact argv, target bytes, or configuration does not match');
  }
  return child;
}
function requireParentAuthority(child: ProcessInfo, authority: ParentAuthority, receipt: ReviewerLaunchReceipt): void {
  const reviewer = processInfo(receipt.processBinding.reviewerPid);
  if (
    reviewer.pid !== receipt.processBinding.reviewerPid
    || reviewer.executableSha256 !== receipt.processBinding.reviewerExecutableSha256
  ) {
    throw new ReviewerLaunchError(`designated reviewer process identity changed after proxy-child verification (executable=${reviewer.executableSha256.slice(0, 12)}/${receipt.processBinding.reviewerExecutableSha256.slice(0, 12)})`);
  }
  if (
    authority.kind === 'production-host'
    && reviewer.pid === authority.hostPid
    && reviewer.executableSha256 === authority.hostExecutableSha256
  ) return;
  if (
    authority.kind === 'delegated-production-host'
    && reviewer.pid === authority.reviewerPid
    && reviewer.parentPid === authority.hostPid
    && reviewer.executableSha256 === authority.reviewerExecutableSha256
    && receipt.processBinding.parentPid === authority.hostPid
    && receipt.processBinding.parentExecutableSha256 === authority.hostExecutableSha256
  ) return;
  if (
    authority.kind === 'benchmark-reviewer'
    && reviewer.executableSha256 === authority.interpreterSha256
    && reviewer.command.length > 1
    && executableSha256(reviewer.command[1]!) === authority.targetSha256
  ) return;
  throw new ReviewerLaunchError(
    authority.kind === 'production-host'
      ? 'reviewer proxy designated production reviewer executable does not match'
      : 'reviewer proxy designated benchmark reviewer interpreter or target does not match',
  );
}
function socketPeerPid(socket: import('node:net').Socket): number {
  const descriptor = (socket as unknown as { _handle?: { fd?: unknown } })._handle?.fd;
  if (!Number.isInteger(descriptor) || (descriptor as number) < 0) throw new ReviewerLaunchError('reviewer proxy socket descriptor is unavailable');
  const python = existsSync('/usr/bin/python3') ? '/usr/bin/python3' : existsSync('/usr/local/bin/python3') ? '/usr/local/bin/python3' : '';
  if (!python) throw new ReviewerLaunchError('reviewer proxy peer credential helper is unavailable');
  const script = process.platform === 'darwin'
    ? "import socket,struct; s=socket.socket(fileno=3); print(struct.unpack('i',s.getsockopt(0,2,4))[0])"
    : process.platform === 'linux'
      ? "import socket,struct; s=socket.socket(fileno=3); print(struct.unpack('3i',s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[0])"
      : '';
  if (!script) throw new ReviewerLaunchError('reviewer proxy peer credentials are unsupported on this platform');
  const observed = spawnSync(python, ['-c', script], {
    encoding: 'utf8',
    env: { PATH: '' },
    stdio: ['ignore', 'pipe', 'pipe', descriptor as number],
  });
  const pid = Number(observed.stdout.trim());
  if (observed.status !== 0 || !Number.isSafeInteger(pid) || pid <= 0) throw new ReviewerLaunchError('reviewer proxy peer credentials could not be observed');
  return pid;
}
function defaultProcessBinding(ttlMs = 60_000): ReviewerProcessBinding {
  return Object.freeze({
    parentPid: process.pid,
    parentExecutableSha256: executableSha256(process.execPath),
    reviewerPid: process.pid,
    reviewerExecutableSha256: executableSha256(process.execPath),
    laneId: `reviewer-lane-${process.pid}`,
    runnerId: `reviewer-runner-${process.pid}`,
    sessionId: randomUUID(),
    nonce: randomUUID(),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
}
function reviewerConfigurationSha256(launchId: string, binding: ReviewerProcessBinding, proxy: ReviewerProxyBinding, host: ReviewerHost, buildSha256: string, briefSha256: string, browserSha256: string): string {
  return createHash('sha256').update(JSON.stringify({
    processBinding: binding,
    proxyBinding: proxy,
    authority: { buildSha256, briefSha256, browserSha256 },
    mcpServers: {
      'omd-reviewer-evidence': {
        command: proxy.stagedPath,
        args: ['--launch-id', launchId, '--configuration-sha256', '<bound>', '--socket', socketPath(launchId), '--runner-id', binding.runnerId, '--session-id', binding.sessionId, '--nonce', binding.nonce, '--host', host, '--reviewer-pid', String(binding.reviewerPid), '--proxy-target', proxy.targetPath, '--proxy-sha256', proxy.targetSha256],
      },
    },
  })).digest('hex');
}
function reviewerProxyArgs(receipt: ReviewerLaunchReceipt): readonly string[] {
  return Object.freeze([
    '--launch-id', receipt.launchId,
    '--configuration-sha256', receipt.configurationSha256,
    '--socket', socketPath(receipt.launchId),
    '--runner-id', receipt.processBinding.runnerId,
    '--session-id', receipt.processBinding.sessionId,
    '--nonce', receipt.processBinding.nonce,
    '--host', receipt.host,
    '--reviewer-pid', String(receipt.processBinding.reviewerPid),
    '--proxy-target', receipt.proxyBinding.targetPath,
    '--proxy-sha256', receipt.proxyBinding.targetSha256,
  ]);
}
function opaquePayload(value: unknown): Uint8Array {
  if (typeof value === 'string') return new Uint8Array(Buffer.from(value));
  if (value instanceof Uint8Array) return new Uint8Array(value);
  throw new ReviewerLaunchError('reviewer evidence must be opaque bytes or text');
}
type BrokerLaunch = {
  readonly receipt: ReviewerLaunchReceipt;
  evidence: Uint8Array;
  capability: string;
  authorizedChildPid?: number;
  server?: Server;
  expiryTimer?: NodeJS.Timeout;
  parentAuthority?: ParentAuthority;
};
const localLaunches = new Map<string, BrokerLaunch>();

function removeSocket(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function closeBroker(launchId: string): void {
  const launch = localLaunches.get(launchId);
  if (!launch) return;
  localLaunches.delete(launchId);
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
    socket.on('error', () => undefined);
    socket.on('end', () => {
      try {
        const claim = JSON.parse(input) as Partial<ReviewerProcessBinding> & { childPid?: number; configurationSha256?: string; launchCapability?: string; host?: ReviewerHost };
        const binding = launch.receipt.processBinding;
        const parentAuthority = launch.parentAuthority;
        if (parentAuthority === undefined) throw new ReviewerLaunchError('reviewer proxy has no bundle-bound parent authority');
        if (!Number.isSafeInteger(claim.childPid) || claim.childPid! <= 0) throw new ReviewerLaunchError('reviewer proxy child PID is invalid');
        const peerPid = socketPeerPid(socket);
        if (peerPid !== claim.childPid) throw new ReviewerLaunchError('reviewer proxy socket peer is not the claimed configured child');
        if (claim.configurationSha256 !== launch.receipt.configurationSha256) throw new ReviewerLaunchError('reviewer proxy configuration does not match');
        if (claim.host !== launch.receipt.host) throw new ReviewerLaunchError('reviewer proxy host identity does not match');
        if (claim.runnerId !== binding.runnerId || claim.sessionId !== binding.sessionId || claim.nonce !== binding.nonce) throw new ReviewerLaunchError('reviewer proxy session or nonce does not match');
        if (Date.now() >= Date.parse(binding.expiresAt)) throw new ReviewerLaunchError('reviewer proxy binding expired');
        const child = requireProxyChild(peerPid, reviewerProxyArgs(launch.receipt), launch.receipt);
        requireParentAuthority(child, parentAuthority, launch.receipt);
        if (!localLaunches.has(launch.receipt.launchId)) throw new ReviewerLaunchError('unknown, reused, or unreadable reviewer proxy launch');
        if (claim.launchCapability === undefined) {
          launch.authorizedChildPid = claim.childPid!;
          socket.end(JSON.stringify({ capability: launch.capability }));
          return;
        }
        if (claim.childPid !== launch.authorizedChildPid || claim.launchCapability !== launch.capability) {
          throw new ReviewerLaunchError('reviewer proxy private broker capability is invalid');
        }
        if (createHash('sha256').update(launch.evidence).digest('hex') !== launch.receipt.evidence.sha256) throw new ReviewerLaunchError('reviewer proxy evidence drifted');
        verifiedEvidenceProofs.set(launch.receipt, Object.freeze({
          sha256: launch.receipt.evidence.sha256,
          launchId: launch.receipt.launchId,
          configurationSha256: launch.receipt.configurationSha256,
          childPid: claim.childPid!,
          verifiedAt: Date.now(),
        }));
        completedReviewerLaunches.add(launch.receipt);
        completedReviewerLaunchIds.add(launch.receipt.launchId);
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

async function consumeBrokerEvidence(launchId: string, brokerSocket: string, configurationSha256: string, runnerId: string, sessionId: string, nonce: string, host: ReviewerHost): Promise<Uint8Array> {
  const parentPid = process.ppid;
  const claim = { childPid: process.pid, parentPid, configurationSha256, runnerId, sessionId, nonce, host };
  const exchange = async (request: object): Promise<{ base64?: string; capability?: string; error?: string }> => await new Promise((resolvePromise, reject) => {
    const socket = connect(brokerSocket);
    let response = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.end(JSON.stringify(request)));
    socket.on('data', chunk => { response += chunk; });
    socket.on('error', () => reject(new ReviewerLaunchError('unknown, reused, or unreadable reviewer proxy launch')));
    socket.on('end', () => {
      try { resolvePromise(JSON.parse(response) as { base64?: string; capability?: string; error?: string }); }
      catch { reject(new ReviewerLaunchError('Evidence unavailable')); }
    });
  });
  const challenge = await exchange(claim);
  if (challenge.error || typeof challenge.capability !== 'string') throw new ReviewerLaunchError(challenge.error ?? 'reviewer proxy broker capability was unavailable');
  const evidence = await exchange({ ...claim, launchCapability: challenge.capability });
  if (evidence.error || typeof evidence.base64 !== 'string') throw new ReviewerLaunchError(evidence.error ?? 'Evidence unavailable');
  return new Uint8Array(Buffer.from(evidence.base64, 'base64'));
}
export const REVIEWER_EVIDENCE_PROXY_COMMAND = 'omd-reviewer-evidence-proxy' as const;

export type ReviewerEvidenceMcpServer = {
  readonly command: string;
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

function requireLiveLaunch(receipt: ReviewerLaunchReceipt): void {
  const launch = localLaunches.get(receipt.launchId);
  if (launch?.receipt !== receipt || Date.now() >= Date.parse(receipt.processBinding.expiresAt)) {
    throw new ReviewerLaunchError('reviewer launch has no live host-owned process/configuration handshake');
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
  readonly #bindingTtlMs: number;

  constructor(now?: () => number, bindingTtlMs = 60_000) {
    if (!Number.isSafeInteger(bindingTtlMs) || bindingTtlMs < 1 || bindingTtlMs > 60_000) {
      throw new ReviewerLaunchError('reviewer binding TTL must be between 1 and 60000 milliseconds');
    }
    this.#evidence = createReviewerEvidenceProxy(now);
    this.#bindingTtlMs = bindingTtlMs;
  }

  #launch(request: ReviewerLaunchRequest, delegatedGate = false): ReviewerLaunchReceipt {
    requireHash(request.buildSha256, 'buildSha256');
    requireHash(request.loadedSkillSha256, 'loadedSkillSha256');
    requireHash(request.briefSha256, 'briefSha256');
    requireHash(request.browserSha256, 'browserSha256');
    const payload = opaquePayload(request.evidence);
    if (payload.byteLength === 0) throw new ReviewerLaunchError('reviewer launch requires a non-empty evidence bundle');
    const evidence = Object.freeze(this.#evidence.create(request.evidence, request.alias));
    const launchId = randomUUID();
    const processBinding = request.processBinding ?? defaultProcessBinding(this.#bindingTtlMs);
    requireHash(processBinding.parentExecutableSha256, 'parentExecutableSha256');
    requireHash(processBinding.reviewerExecutableSha256, 'reviewerExecutableSha256');
    if (
      !Number.isSafeInteger(processBinding.parentPid) || processBinding.parentPid <= 0
      || !Number.isSafeInteger(processBinding.reviewerPid) || processBinding.reviewerPid <= 0
      || !processBinding.laneId || !processBinding.runnerId || !processBinding.sessionId || !processBinding.nonce
      || !Number.isFinite(Date.parse(processBinding.expiresAt))
    ) {
      throw new ReviewerLaunchError('reviewer launch requires an exact parent process, designated reviewer, lane, runner, session, nonce, and expiry binding');
    }
    const designatedReviewer = processInfo(processBinding.reviewerPid);
    if ((!delegatedGate && designatedReviewer.executableSha256 !== processBinding.reviewerExecutableSha256)
      || (delegatedGate && (designatedReviewer.parentPid !== process.pid
        || processBinding.parentPid !== process.pid
        || processBinding.parentExecutableSha256 !== executableSha256(process.execPath)))) {
      throw new ReviewerLaunchError('designated reviewer PID does not match its pinned executable bytes');
    }
    const proxyBinding: ReviewerProxyBinding = request.proxyBinding ?? Object.freeze({
      stagedPath: reviewerProxyInterpreter,
      stagedSha256: executableSha256(reviewerProxyInterpreter),
      targetPath: reviewerProxyTarget,
      targetSha256: executableSha256(reviewerProxyTarget),
    });
    requireHash(proxyBinding.stagedSha256, 'proxyBinding.stagedSha256');
    requireHash(proxyBinding.targetSha256, 'proxyBinding.targetSha256');
    if (
      !isAbsolute(proxyBinding.stagedPath) || !isAbsolute(proxyBinding.targetPath)
      || realpathSync(proxyBinding.stagedPath) !== proxyBinding.stagedPath
      || realpathSync(proxyBinding.targetPath) !== proxyBinding.targetPath
      || executableSha256(proxyBinding.stagedPath) !== proxyBinding.stagedSha256
      || executableSha256(proxyBinding.targetPath) !== proxyBinding.targetSha256
    ) throw new ReviewerLaunchError('reviewer proxy staging path or immutable target bytes do not match');
    const receipt: ReviewerLaunchReceipt = Object.freeze({
      schemaVersion: REVIEWER_LAUNCH_RECEIPT_SCHEMA_VERSION,
      host: request.host,
      buildSha256: request.buildSha256,
      loadedSkillSha256: request.loadedSkillSha256,
      briefSha256: request.briefSha256,
      browserSha256: request.browserSha256,
      evidence,
      launchId,
      processBinding,
      proxyBinding,
      configurationSha256: reviewerConfigurationSha256(launchId, processBinding, proxyBinding, request.host, request.buildSha256, request.briefSha256, request.browserSha256),
    });
    receipts.add(receipt);
    receiptLaunchers.set(receipt, this);
    const launch = { receipt, evidence: payload, capability: randomBytes(32).toString('base64url') };
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
  launch(request: ReviewerLaunchRequest): ReviewerLaunchReceipt {
    return this.#launch(request);
  }
  /** Host-only pre-exec binding for a gated child that keeps its PID when it execs the reviewer. */
  launchDelegated(request: ReviewerLaunchRequest): ReviewerLaunchReceipt {
    if (request.processBinding === undefined) {
      throw new ReviewerLaunchError('delegated reviewer launch requires an exact gated child binding');
    }
    return this.#launch(request, true);
  }
  observeLoadedSkill(host: ProductionReviewerHost, observed: object, expectedSha256: string): ReviewerObservedLoadedSkillReceipt {
    requireHash(expectedSha256, 'expectedSha256');
    const proof=observed as { loadedSkillSha256?: unknown };
    if (proof.loadedSkillSha256 !== expectedSha256) throw new ReviewerLaunchError('loaded skill receipt is not the host-observed loaded-skill bytes');
    const hostExecutableSha256=executableSha256(process.execPath);
    const receipt: ReviewerObservedLoadedSkillReceipt = Object.freeze({
      host, authority:'production-host-loaded-skill', loadedSkillReceipt: observed, hostPid: process.pid,
      hostExecutableSha256, reviewerExecutableSha256:hostExecutableSha256, loadedSkillSha256:expectedSha256,
    });
    observedLoadedSkillReceipts.add(receipt);
    observedSkillLaunchers.set(receipt, this);
    observedParentAuthorities.set(receipt, Object.freeze({
      kind: 'production-host',
      hostPid: process.pid,
      hostExecutableSha256,
    }));
    return receipt;
  }
  observeDelegatedReviewer(
    host: ProductionReviewerHost,
    observed: object,
    expectedSha256: string,
    reviewerPid: number,
    reviewerExecutableSha256: string,
  ): ReviewerObservedLoadedSkillReceipt {
    requireHash(expectedSha256, 'expectedSha256');
    requireHash(reviewerExecutableSha256, 'reviewerExecutableSha256');
    const proof = observed as { loadedSkillSha256?: unknown };
    const gated = processInfo(reviewerPid);
    if (proof.loadedSkillSha256 !== expectedSha256 || gated.parentPid !== process.pid) {
      throw new ReviewerLaunchError('delegated reviewer is not the host-gated child with observed loaded-skill bytes');
    }
    const hostExecutableSha256 = executableSha256(process.execPath);
    const receipt: ReviewerObservedLoadedSkillReceipt = Object.freeze({
      host,
      authority: 'production-host-delegated-reviewer',
      loadedSkillReceipt: observed,
      hostPid: process.pid,
      hostExecutableSha256,
      reviewerExecutableSha256,
      loadedSkillSha256: expectedSha256,
    });
    observedLoadedSkillReceipts.add(receipt);
    observedSkillLaunchers.set(receipt, this);
    observedParentAuthorities.set(receipt, Object.freeze({
      kind: 'delegated-production-host',
      hostPid: process.pid,
      hostExecutableSha256,
      reviewerPid,
      reviewerExecutableSha256,
    }));
    return receipt;
  }
  observeBenchmarkReviewer(command: string, expectedTargetSha256: string, expectedInterpreterSha256: string): ReviewerObservedLoadedSkillReceipt {
    requireHash(expectedTargetSha256, 'expectedTargetSha256');
    requireHash(expectedInterpreterSha256, 'expectedInterpreterSha256');
    if (executableSha256(command) !== expectedTargetSha256 || executableSha256(process.execPath) !== expectedInterpreterSha256) {
      throw new ReviewerLaunchError('benchmark reviewer does not match the runner-signed interpreter and target bytes');
    }
    const receipt: ReviewerObservedLoadedSkillReceipt = Object.freeze({
      host:'benchmark', authority:'runner-benchmark', loadedSkillReceipt:Object.freeze({ runnerOwned:true, reviewerExecutableSha256:expectedTargetSha256 }),
      hostPid:process.pid, hostExecutableSha256:expectedInterpreterSha256, reviewerExecutableSha256:expectedTargetSha256, loadedSkillSha256:expectedTargetSha256,
    });
    observedLoadedSkillReceipts.add(receipt);
    observedSkillLaunchers.set(receipt, this);
    observedParentAuthorities.set(receipt, Object.freeze({
      kind: 'benchmark-reviewer',
      interpreterSha256: expectedInterpreterSha256,
      targetSha256: expectedTargetSha256,
    }));
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
    requireLiveLaunch(reviewerLaunchReceipt);
    requireIssuedReviewerLaunchReceipt(reviewerLaunchReceipt, {
      host: loadedSkillReceipt.host,
      buildSha256: reviewerLaunchReceipt.buildSha256,
      loadedSkillSha256: loadedSkillReceipt.loadedSkillSha256,
      briefSha256: reviewerLaunchReceipt.briefSha256,
      browserSha256: reviewerLaunchReceipt.browserSha256,
    });
    const authority = observedParentAuthorities.get(loadedSkillReceipt);
    const launch = localLaunches.get(reviewerLaunchReceipt.launchId);
    if (authority === undefined || launch?.receipt !== reviewerLaunchReceipt) {
      throw new ReviewerLaunchError('reviewer launch has no bundle-bound parent authority');
    }
    if (
      authority.kind === 'production-host'
      && (
        reviewerLaunchReceipt.processBinding.reviewerPid !== authority.hostPid
        || reviewerLaunchReceipt.processBinding.reviewerExecutableSha256 !== authority.hostExecutableSha256
      )
    ) {
      throw new ReviewerLaunchError('production reviewer launch does not match the host-observed designated reviewer authority');
    }
    if (authority.kind === 'delegated-production-host'
      && (reviewerLaunchReceipt.processBinding.reviewerPid !== authority.reviewerPid
        || reviewerLaunchReceipt.processBinding.reviewerExecutableSha256 !== authority.reviewerExecutableSha256)) {
      throw new ReviewerLaunchError('delegated production reviewer launch does not match the host-gated child authority');
    }
    launch.parentAuthority = authority;
    if (bundledReviewerLaunches.has(reviewerLaunchReceipt)) {
      throw new ReviewerLaunchError('reviewer launch receipt already has a one-use bundle');
    }
    const bundle: ReviewerLaunchBundle = Object.freeze({
      loadedSkillReceipt,
      reviewerLaunchReceipt,
      adapter: this,
      configuration: this.#configuration(reviewerLaunchReceipt, loadedSkillReceipt.host),
    });
    launchBundles.add(bundle);
    bundleLaunchers.set(bundle, this);
    bundledReviewerLaunches.add(reviewerLaunchReceipt);
    requireLiveLaunch(reviewerLaunchReceipt);
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
    requireLiveLaunch(reviewerLaunchReceipt);
    requireIssuedReviewerLaunchReceipt(reviewerLaunchReceipt, {
      host,
      buildSha256: reviewerLaunchReceipt.buildSha256,
      loadedSkillSha256: loadedSkillReceipt.loadedSkillSha256,
      briefSha256: reviewerLaunchReceipt.briefSha256,
      browserSha256: reviewerLaunchReceipt.browserSha256,
    });
    this.requireConfiguration(configuration, reviewerLaunchReceipt, host);
    return bundle;
  }
  requireCompletedLaunchBundle(bundle: ReviewerLaunchBundle, host: ReviewerHost): ReviewerLaunchBundle {
    if (bundleLaunchers.get(bundle) !== this || !launchBundles.has(bundle) || bundle.adapter !== this) {
      throw new ReviewerLaunchError('reviewer launch bundle was not issued by this host reviewer launcher');
    }
    const { loadedSkillReceipt, reviewerLaunchReceipt } = bundle;
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
      browserSha256: reviewerLaunchReceipt.browserSha256,
    });
    return bundle;
  }
  consumeCompletedLaunchBundle(bundle: ReviewerLaunchBundle, host: ReviewerHost, expected: Pick<ReviewerLaunchReceipt, 'buildSha256' | 'briefSha256' | 'browserSha256'>): Readonly<{ evidenceSha256: string; childPid: number; sessionId: string; nonce: string }> {
    this.requireCompletedLaunchBundle(bundle, host);
    const receipt = bundle.reviewerLaunchReceipt;
    requireReviewerLaunchReceipt(receipt, {
      host,
      buildSha256: expected.buildSha256,
      loadedSkillSha256: bundle.loadedSkillReceipt.loadedSkillSha256,
      briefSha256: expected.briefSha256,
      browserSha256: expected.browserSha256,
    });
    const proof = verifiedEvidenceProofs.get(receipt);
    if (!proof || consumedReviewerLaunches.has(receipt)
      || proof.verifiedAt >= Date.parse(receipt.processBinding.expiresAt)) {
      throw new ReviewerLaunchError('reviewer launch bundle is reused, expired, or has no live one-use challenge');
    }
    consumedReviewerLaunches.add(receipt);
    completedReviewerLaunchIds.delete(receipt.launchId);
    verifiedEvidenceProofs.delete(receipt);
    return Object.freeze({ evidenceSha256: proof.sha256, childPid: proof.childPid, sessionId: receipt.processBinding.sessionId, nonce: receipt.processBinding.nonce });
  }
  /**
   * The sole MCP configuration the host may attach to a reviewer lane. It carries
   * only the receipt-bound immutable proxy launcher/target identities and opaque
   * launch identity; evidence bytes, shell commands, and alternate tools never enter it.
   */
  #configuration(receipt: ReviewerLaunchReceipt, host: ReviewerHost = receipt.host): ReviewerLaunchConfiguration {
    if (receiptLaunchers.get(receipt) !== this) {
      throw new ReviewerLaunchError('reviewer receipt is not bound to this host evidence proxy');
    }
    requireIssuedReviewerLaunchReceipt(receipt, {
      host,
      buildSha256: receipt.buildSha256,
      loadedSkillSha256: receipt.loadedSkillSha256,
      briefSha256: receipt.briefSha256,
      browserSha256: receipt.browserSha256,
    });
    const configuration: ReviewerLaunchConfiguration = Object.freeze({
      mcpServers: Object.freeze({
        'omd-reviewer-evidence': Object.freeze({
          command: receipt.proxyBinding.stagedPath,
          args: Object.freeze([receipt.proxyBinding.targetPath, ...reviewerProxyArgs(receipt)]),
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
    requireIssuedReviewerLaunchReceipt(receipt, {
      host,
      buildSha256: receipt.buildSha256,
      loadedSkillSha256: receipt.loadedSkillSha256,
      briefSha256: receipt.briefSha256,
      browserSha256: receipt.browserSha256,
    });
    if (!this.#configurations.has(configuration)) {
      throw new ReviewerLaunchError('reviewer configuration was not issued by the host reviewer launcher');
    }
    const server = configuration.mcpServers['omd-reviewer-evidence'];
    const expectedArgs = [receipt.proxyBinding.targetPath, ...reviewerProxyArgs(receipt)];
    if (
      Object.keys(configuration.mcpServers).length !== 1
      || server.command !== receipt.proxyBinding.stagedPath
      || JSON.stringify(server.args) !== JSON.stringify(expectedArgs)
      || reviewerConfigurationSha256(receipt.launchId, receipt.processBinding, receipt.proxyBinding, receipt.host, receipt.buildSha256, receipt.briefSha256, receipt.browserSha256) !== receipt.configurationSha256
    ) {
      throw new ReviewerLaunchError('reviewer configuration exposes an unapproved tool or launch identity');
    }
    return configuration;
  }

  dispose(): void {
    for (const launchId of this.#launchIds) {
      closeBroker(launchId);
      completedReviewerLaunchIds.delete(launchId);
    }
    this.#launchIds.clear();
  }
}


export function createReviewerMcpAdapter(now?: () => number, bindingTtlMs?: number): ReviewerMcpAdapter {
  return new ReviewerMcpAdapter(now, bindingTtlMs);
}

function requireIssuedReviewerLaunchReceipt(
  receipt: ReviewerLaunchReceipt,
  expected?: Pick<ReviewerLaunchReceipt, 'host' | 'buildSha256' | 'loadedSkillSha256' | 'briefSha256'> & Partial<Pick<ReviewerLaunchReceipt, 'browserSha256'>>,
): ReviewerLaunchReceipt {
  if (!receipts.has(receipt) || receipt.schemaVersion !== REVIEWER_LAUNCH_RECEIPT_SCHEMA_VERSION) {
    throw new ReviewerLaunchError('receipt was not issued by the host reviewer launcher');
  }
  if (expected !== undefined && (
    receipt.host !== expected.host
    || receipt.buildSha256 !== expected.buildSha256
    || receipt.loadedSkillSha256 !== expected.loadedSkillSha256
    || receipt.briefSha256 !== expected.briefSha256
    || (expected.browserSha256 !== undefined && receipt.browserSha256 !== expected.browserSha256)
  )) {
    throw new ReviewerLaunchError('receipt is not bound to this host, build, browser, loaded skill, and brief');
  }
  return receipt;
}
export function requireReviewerLaunchReceipt(
  receipt: ReviewerLaunchReceipt,
  expected?: Pick<ReviewerLaunchReceipt, 'host' | 'buildSha256' | 'loadedSkillSha256' | 'briefSha256'> & Partial<Pick<ReviewerLaunchReceipt, 'browserSha256'>>,
): ReviewerLaunchReceipt {
  requireIssuedReviewerLaunchReceipt(receipt, expected);
  if (!completedReviewerLaunches.has(receipt)) {
    if (completedReviewerLaunchIds.has(receipt.launchId)) return receipt;
    throw new ReviewerLaunchError('reviewer launch has no completed process-authenticated evidence handshake');
  }
  return receipt;
}
export function requireProductionReviewerLaunchReceipt(
  receipt: ReviewerLaunchReceipt,
  expected?: Pick<ReviewerLaunchReceipt, 'host' | 'buildSha256' | 'loadedSkillSha256' | 'briefSha256'> & Partial<Pick<ReviewerLaunchReceipt, 'browserSha256'>>,
): ReviewerLaunchReceipt {
  if (receipt.host === 'benchmark') throw new ReviewerLaunchError('runner-owned benchmark reviewers cannot satisfy production final-reviewer authority');
  return requireReviewerLaunchReceipt(receipt, expected);
}

export function reviewerEvidenceSha256(receipt: ReviewerLaunchReceipt): string {
  requireIssuedReviewerLaunchReceipt(receipt);
  const proof = verifiedEvidenceProofs.get(receipt);
  if (!proof
    || proof.launchId !== receipt.launchId
    || proof.configurationSha256 !== receipt.configurationSha256
    || proof.verifiedAt >= Date.parse(receipt.processBinding.expiresAt)) {
    throw new ReviewerLaunchError('reviewer evidence has no verified child/process/configuration/capability handshake');
  }
  verifiedEvidenceProofs.delete(receipt);
  return proof.sha256;
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
  const valid = argv.length === 20
    && argv[0] === '--launch-id' && /^[0-9a-f-]{36}$/i.test(argv[1]!)
    && argv[2] === '--configuration-sha256' && SHA256.test(argv[3]!)
    && argv[4] === '--socket' && typeof argv[5] === 'string' && argv[5].length > 0
    && argv[6] === '--runner-id' && argv[7]!
    && argv[8] === '--session-id' && argv[9]!
    && argv[10] === '--nonce' && argv[11]!
    && argv[12] === '--host' && (argv[13] === 'codex' || argv[13] === 'claude' || argv[13] === 'benchmark')
    && argv[14] === '--reviewer-pid' && /^[1-9]\d*$/.test(argv[15]!)
    && argv[16] === '--proxy-target' && argv[17] === reviewerProxyTarget
    && argv[18] === '--proxy-sha256' && argv[19] === executableSha256(reviewerProxyTarget);
  if (!valid) throw new ReviewerLaunchError('usage: omd-reviewer-evidence-proxy requires the emitted process-bound host-specific reviewer configuration');
  const [,, , configurationSha256,, brokerSocket, , runnerId,, sessionId,, nonce,, host] = argv;
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
        const bytes = await consumeBrokerEvidence(launchId, brokerSocket!, configurationSha256!, runnerId!, sessionId!, nonce!, host as ReviewerHost);
        if (hasId) {
          let visual: Record<string, unknown> | undefined;
          try {
            const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
              && ((parsed as Record<string, unknown>).schema === 'adaptive-rendered-refinement-reviewer-transport-v1'
                || (parsed as Record<string, unknown>).schema === 'adaptive-final-render-reviewer-transport-v1')) {
              visual = parsed as Record<string, unknown>;
            }
          } catch { /* generic evidence remains opaque */ }
          if (visual === undefined) {
            const base64 = Buffer.from(bytes).toString('base64');
            process.stdout.write(`${jsonRpcResult(id, {
              content: [{ type: 'text', text: base64 }],
              structuredContent: {
                base64,
                byteLength: bytes.byteLength,
                sha256: createHash('sha256').update(bytes).digest('hex'),
              },
            })}\n`);
          } else {
            const evidence = visual.evidence;
            if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) {
              throw new ReviewerLaunchError('Visual reviewer evidence is malformed');
            }
            const evidenceRecord = evidence as Record<string, unknown>;
            const content: Array<Record<string, unknown>> = [{
              type: 'text',
              text: JSON.stringify(visual.schema === 'adaptive-final-render-reviewer-transport-v1'
                ? {
                  schema: visual.schema,
                  evidenceSha256: visual.evidenceSha256,
                  candidateAlias: evidenceRecord.candidateAlias,
                  context: evidenceRecord.context,
                  observationProjection: evidenceRecord.observationProjection,
                  outputContract: visual.outputContract,
                }
                : {
                  schema: visual.schema,
                  evidenceSha256: visual.evidenceSha256,
                  outputContract: visual.outputContract,
                }),
            }];
            const metadata: Array<Record<string, unknown>> = [];
            if (visual.schema === 'adaptive-rendered-refinement-reviewer-transport-v1') {
              if (!Array.isArray(evidenceRecord.variants)) throw new ReviewerLaunchError('Rendered refinement evidence is malformed');
              for (const candidate of evidenceRecord.variants) {
                if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
                  throw new ReviewerLaunchError('Rendered refinement variant is malformed');
                }
                const variant = candidate as Record<string, unknown>;
                if (typeof variant.alias !== 'string' || !Array.isArray(variant.renders)) {
                  throw new ReviewerLaunchError('Rendered refinement variant is malformed');
                }
                const renders: Array<Record<string, unknown>> = [];
                for (const candidateRender of variant.renders) {
                  if (typeof candidateRender !== 'object' || candidateRender === null || Array.isArray(candidateRender)) {
                    throw new ReviewerLaunchError('Rendered refinement render is malformed');
                  }
                  const render = candidateRender as Record<string, unknown>;
                  if (typeof render.pngBase64 !== 'string') throw new ReviewerLaunchError('Rendered refinement image is missing');
                  const label = {
                    alias: variant.alias,
                    viewport: render.viewport,
                    width: render.width,
                    height: render.height,
                    outcomeRef: render.outcomeRef,
                    sha256: render.sha256,
                  };
                  renders.push(label);
                  content.push({ type: 'text', text: JSON.stringify(label) });
                  content.push({ type: 'image', data: render.pngBase64, mimeType: 'image/png' });
                }
                metadata.push({ alias: variant.alias, renders });
              }
            } else {
              if (typeof evidenceRecord.candidateAlias !== 'string' || !Array.isArray(evidenceRecord.renders)) {
                throw new ReviewerLaunchError('Final render evidence is malformed');
              }
              for (const candidateRender of evidenceRecord.renders) {
                if (typeof candidateRender !== 'object' || candidateRender === null || Array.isArray(candidateRender)) {
                  throw new ReviewerLaunchError('Final render is malformed');
                }
                const render = candidateRender as Record<string, unknown>;
                if (typeof render.pngBase64 !== 'string') throw new ReviewerLaunchError('Final render image is missing');
                const label = {
                  alias: evidenceRecord.candidateAlias,
                  observationSha256: render.observationSha256,
                  browserObservationSha256: render.browserObservationSha256,
                  viewport: render.viewport,
                  state: render.state,
                  width: render.width,
                  height: render.height,
                  captureSha256: render.captureSha256,
                };
                metadata.push(label);
                content.push({ type: 'text', text: JSON.stringify(label) });
                content.push({ type: 'image', data: render.pngBase64, mimeType: 'image/png' });
              }
            }
            process.stdout.write(`${jsonRpcResult(id, {
              content,
              structuredContent: {
                schema: visual.schema,
                evidenceSha256: visual.evidenceSha256,
                outputContract: visual.outputContract,
                ...(visual.schema === 'adaptive-rendered-refinement-reviewer-transport-v1'
                  ? { variants: metadata }
                  : {
                    candidateAlias: evidenceRecord.candidateAlias,
                    context: evidenceRecord.context,
                    observationProjection: evidenceRecord.observationProjection,
                    renders: metadata,
                  }),
                byteLength: bytes.byteLength,
                sha256: createHash('sha256').update(bytes).digest('hex'),
              },
            })}\n`);
          }
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
