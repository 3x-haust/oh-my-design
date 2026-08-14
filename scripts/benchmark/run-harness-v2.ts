import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { chmodSync, closeSync, constants as fsConstants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAliasResolver, createEvaluatorHoldoutMetadata, evaluateHarness, freezeDevelopmentCorpus, projectHoldoutBrief, receiptHash, validateBudget, validateEvaluatorHoldoutMetadata, validateFrozenDevelopmentCorpus, validateProjectedBrief } from '../../core/eval-harness/holdout-projection.ts';
import { validateEvidenceLock } from './validate-evidence-lock.ts';
import { evidenceLockDigest, readEvidenceSnapshotBytes, readEvidenceSnapshotPayload, requireEvidenceLockSnapshot } from './materialize-evidence-lock.ts';
import type { AliasResolver, BrowserRunReceipt, BuildRunReceipt, EvaluatorHoldoutMetadata, FrozenDevelopmentCorpus, HarnessBudget, HoldoutBrief, ProjectedBrief, RaterVote } from '../../core/eval-harness/holdout-projection.ts';
import type { EvidenceLock, EvidenceLockSnapshot } from './materialize-evidence-lock.ts';
import { createReviewerMcpAdapter, type ReviewerHost, type ReviewerLaunchBundle } from '../../adapters/reviewer-mcp.ts';

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hash = /^[a-f0-9]{64}$/;
function subprocessBytes(chunk: string | Uint8Array | null | undefined): Uint8Array { return typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk ? new Uint8Array(chunk) : new Uint8Array(); }
const reviewerProxyTarget = realpathSync(fileURLToPath(new URL('../../adapters/reviewer-mcp.ts', import.meta.url)));
const reviewerEvidenceProxyTarget = realpathSync(fileURLToPath(new URL('../../core/runtime/evidence-proxy.ts', import.meta.url)));
function subprocessText(chunk: string | Uint8Array | null | undefined): string { return new TextDecoder().decode(subprocessBytes(chunk)); }
export interface PreparedHarnessV2 { developmentCorpus: FrozenDevelopmentCorpus; evaluatorHoldouts: EvaluatorHoldoutMetadata; projectedBriefs: readonly ProjectedBrief[]; rawHoldoutEvidence: Readonly<Record<string, readonly string[]>>; rawHoldoutAuthority: Readonly<Record<string, readonly { alias:string; sha256:string; byteLength:number }[]>>; }
export interface UsageTelemetry { tokens: number; usd: number; }
export interface ParentUsageSource { runnerId: string; executionId: string; hostIdentity: string; kind: 'host' | 'browser' | 'reviewer'; laneId: string; sessionId?: string; }
export interface UnsignedUsageComputation { readonly identity: string; observe(source: ParentUsageSource): UsageTelemetry; }
export type UnsignedUsageComputationCallback = (source: ParentUsageSource) => UsageTelemetry;
declare const authoritativeUsageBrand: unique symbol;
export interface E5E13PinnedUsageObserver extends UnsignedUsageComputation { readonly [authoritativeUsageBrand]: true; }
const e5E13PinnedUsageObservers = new WeakSet<E5E13PinnedUsageObserver>();
const liveReviewerExecutions = new Map<string, Readonly<Record<string, unknown>>>();
const completedReviewerProofs = new WeakMap<ReviewerLane, ReviewerCompletedProof>();
function executionId(runnerId: string, projected: ProjectedBrief, kind: ParentUsageSource['kind'], laneId: string, sessionId = ''): string {
  return digest({ runnerId, briefHash: projected.briefHash, kind, laneId, sessionId });
}
/** Public callbacks are deliberately unsigned and cannot create an authoritative report. */
export function createUnsignedUsageComputation(identity: string, callback: UnsignedUsageComputationCallback): UnsignedUsageComputation {
  if (!identity || typeof callback !== 'function') throw new Error('unsigned usage computation requires an identity and callback');
  return Object.freeze({ identity, observe(source: ParentUsageSource): UsageTelemetry { return callback(Object.freeze({ ...source })); } });
}
/** Only this module's E5/E13-pinned CLI path can brand authoritative observation. */
function issueE5E13PinnedUsageObserver(identity: string, callback: UnsignedUsageComputationCallback): E5E13PinnedUsageObserver {
  const observer = Object.freeze({ identity, observe(source: ParentUsageSource): UsageTelemetry { return callback(Object.freeze({ ...source })); } }) as E5E13PinnedUsageObserver;
  e5E13PinnedUsageObservers.add(observer);
  return observer;
}
export interface HostBuildResult { laneId: string; artifactHash: string; artifactBytes: Uint8Array; }
export interface BrowserObservation { observationBytes: Uint8Array; }
export interface ReviewerWorkReceipt { schemaVersion: 'runner-benchmark-reviewer-work-receipt-v1'; vote: RaterVote; briefHash: string; buildReceiptHash: string; artifactHash: string; browserReceiptHash: string; observationHash: string; consumedEvidenceHash: string; evidenceTranscriptHash: string; childPid: number; sessionId: string; configurationSha256: string; rationale: string; }
export interface ReviewerResult { vote: RaterVote; workReceipt?: ReviewerWorkReceipt; }
export interface IsolatedHarnessHost { identity: string; executeBuild(brief: ProjectedBrief, aliases: AliasResolver): HostBuildResult; }
export interface ReviewerSession { sessionId: string; executableSha256: string; processIdentity: string; configIdentity: string; handshake: string; }
interface ReviewerCompletedProof { readonly evidenceSha256: string; readonly childPid: number; readonly sessionId: string; readonly nonce: string; }
export interface ReviewerLane { laneId: string; raterId: string; host?: ReviewerHost; bundle?: ReviewerLaunchBundle; session?: ReviewerSession; review(brief: ProjectedBrief, build: BuildRunReceipt, browser: BrowserRunReceipt): ReviewerResult; }
export type ReviewerLaneSource = readonly ReviewerLane[] | ((brief: ProjectedBrief, build: BuildRunReceipt, browser: BrowserRunReceipt) => readonly ReviewerLane[]);
export interface BrowserObserver { laneId: string; observe(brief: ProjectedBrief, build: BuildRunReceipt): BrowserObservation; }
export interface HarnessV2RunInput extends PreparedHarnessV2 { host: IsolatedHarnessHost; reviewerLanes: ReviewerLaneSource; browser: BrowserObserver; usageObserver: E5E13PinnedUsageObserver; evidenceRoot: string; evidenceLock: EvidenceLock; budget: HarnessBudget; }
export interface HarnessV2RunReport { schemaVersion: 'harness-v2-run-report-v4'; signedE5Digest: string; signedE13Digest: string; postRunAttestationDigest: string; postRunAttestationSignature: string; runnerId: string; hostIdentity: string; observerIdentity: string; observerAuthorityDigest: string; buildReceiptDigest: string; browserReceiptDigest: string; reviewerReceiptDigest: string; executionReceiptDigest: string; reviewerExecutionDigest: string; receiptDigest: string; lockDigest: string; lineageRoot: string; observationEnvelope: string; processSessionIdentity: string; measuredBudget: HarnessBudget; result: ReturnType<typeof evaluateHarness>; }
export interface UnsignedHarnessV2RunInput extends PreparedHarnessV2 {
  host: IsolatedHarnessHost;
  reviewerLanes: readonly ReviewerLane[];
  browser: BrowserObserver;
  usageComputation: UnsignedUsageComputation;
  budget: HarnessBudget;
  runnerId?: string;
  issuedAt?: number;
  expiresAt?: number;
}

function requireExecutionSource(source: ParentUsageSource): void {
  if (!source.runnerId || !hash.test(source.executionId) || !source.hostIdentity || !source.laneId) {
    throw new Error('parent telemetry source requires an exact execution identity');
  }
}

/** Computes telemetry only; it cannot validate signed evidence or return a report. */
export function computeUnsignedUsage(computation: UnsignedUsageComputation, sources: readonly ParentUsageSource[]): UsageTelemetry {
  if (!computation.identity) throw new Error('unsigned usage computation requires an identity');
  return Object.freeze(sources.reduce((total, source) => {
    requireExecutionSource(source);
    const next = usage(computation.observe(Object.freeze({ ...source })), 'unsigned usage computation');
    return { tokens: total.tokens + next.tokens, usd: total.usd + next.usd };
  }, { tokens: 0, usd: 0 }));
}
function usage(value: unknown, source: string): UsageTelemetry { const telemetry=value as UsageTelemetry; if (!telemetry || !Number.isFinite(telemetry.tokens) || !Number.isFinite(telemetry.usd) || telemetry.tokens < 0 || telemetry.usd < 0) throw new Error(`${source} did not report finite non-negative parent-observed telemetry`); return Object.freeze({tokens:telemetry.tokens,usd:telemetry.usd}); }
function addUsage(total: UsageTelemetry, next: UsageTelemetry): UsageTelemetry { return {tokens:total.tokens+next.tokens,usd:total.usd+next.usd}; }
function canonical(value: unknown): string { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; const record=value as Record<string, unknown>; return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`; }
function observeUnsignedUsage(computation: UnsignedUsageComputation, source: ParentUsageSource): UsageTelemetry {
  if (!computation.identity) throw new Error('an unsigned usage computation identity is required');
  requireExecutionSource(source);
  return usage(computation.observe(Object.freeze({ ...source })), `${source.kind} unsigned computation`);
}
export function prepareHarnessV2(developmentCorpus: readonly HoldoutBrief[], developmentRouteMap: Readonly<Record<string, HoldoutBrief['surface']>>, holdouts: readonly HoldoutBrief[], projectionSalt: string): PreparedHarnessV2 { const projectedBriefs = Object.freeze(holdouts.map(brief => projectHoldoutBrief(brief, projectionSalt))); const evaluatorHoldouts = createEvaluatorHoldoutMetadata(holdouts.map((brief, index) => ({ ...brief, id: projectedBriefs[index]!.id }))); const rawHoldoutEvidence = Object.freeze(Object.fromEntries(holdouts.map((brief, index) => [projectedBriefs[index]!.id, Object.freeze([...brief.evidence])]))) as Readonly<Record<string, readonly string[]>>; const rawHoldoutAuthority=Object.freeze(Object.fromEntries(projectedBriefs.map(projected=>[projected.id,Object.freeze(projected.evidenceAliases.map((alias,index)=>{const bytes=new TextEncoder().encode(rawHoldoutEvidence[projected.id]![index]!);return Object.freeze({alias,sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.byteLength});}))]))) as PreparedHarnessV2['rawHoldoutAuthority']; return Object.freeze({ developmentCorpus: freezeDevelopmentCorpus(developmentCorpus, developmentRouteMap), evaluatorHoldouts, projectedBriefs, rawHoldoutEvidence, rawHoldoutAuthority }); }
function runnerBuildReceipt(runnerId: string, projected: ProjectedBrief, resolver: AliasResolver, result: HostBuildResult): BuildRunReceipt { const actualReceipts = resolver.consumedReceipts(); if (!result.laneId || !hash.test(result.artifactHash) || !(result.artifactBytes instanceof Uint8Array) || result.artifactBytes.byteLength === 0 || createHash('sha256').update(result.artifactBytes).digest('hex') !== result.artifactHash || actualReceipts.length !== projected.evidenceAliases.length) throw new Error('host build result lacks complete immutable artifact and observed evidence consumption'); const seen = new Set<string>(); for (const receipt of actualReceipts) { if (!projected.evidenceAliases.includes(receipt.alias) || seen.has(receipt.alias) || !Number.isSafeInteger(receipt.bytes) || receipt.bytes <= 0 || !hash.test(receipt.sha256) || receipt.expiresAt !== resolver.expiresAt || receipt.receiptHash !== receiptHash({ scope: resolver.scope, alias: receipt.alias, bytes: receipt.bytes, sha256: receipt.sha256, expiresAt: receipt.expiresAt })) throw new Error('host supplied invalid evidence consumption'); seen.add(receipt.alias); } const consumptionReceiptHashes = Object.freeze(actualReceipts.map(receipt => receipt.receiptHash)); return Object.freeze({ laneId: `${runnerId}:build:${result.laneId}`, briefHash: projected.briefHash, artifactHash: result.artifactHash, artifactBytes: result.artifactBytes.slice(), consumptionReceiptHashes, receiptHash: receiptHash({ lane:'build',runnerId,laneId:result.laneId,briefHash:projected.briefHash,artifactHash:result.artifactHash,consumptionReceiptHashes }) }); }
function runnerBrowserReceipt(runnerId: string, projected: ProjectedBrief, build: BuildRunReceipt, browser: BrowserObserver): BrowserRunReceipt { const observation=browser.observe(projected, build); const observationBytes=observation?.observationBytes; const observationHash = observationBytes instanceof Uint8Array ? createHash('sha256').update(observationBytes).digest('hex') : ''; if (!browser.laneId || !observationBytes?.byteLength || !hash.test(observationHash)) throw new Error('runner browser observer did not provide immutable observed evidence bytes'); return Object.freeze({ laneId:`${runnerId}:browser:${browser.laneId}`,briefHash:projected.briefHash,buildReceiptHash:build.receiptHash,observationHash,observationBytes:observationBytes.slice(),receiptHash:receiptHash({lane:'browser',runnerId,laneId:browser.laneId,briefHash:projected.briefHash,buildReceiptHash:build.receiptHash,observationHash}) }); }
function execute(projected: ProjectedBrief, rawEvidence: readonly string[], authority: readonly {alias:string;sha256:string;byteLength:number}[], host: IsolatedHarnessHost, browser: BrowserObserver, reviewerLanes: ReviewerLaneSource, usageComputation: UnsignedUsageComputation, runnerId: string, issuedAt: number, expiresAt: number, requireCompletedBundles = false) {
  validateProjectedBrief(projected);
  if (!host.identity || (!Array.isArray(reviewerLanes) && typeof reviewerLanes !== 'function') || (Array.isArray(reviewerLanes) && reviewerLanes.length < 3) || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) throw new Error('host identity, signed clock, and three runner-owned reviewer lanes are required');
  const aliases = createAliasResolver(projected, rawEvidence, authority, issuedAt, expiresAt - issuedAt, 8 * 1024 * 1024, { now: issuedAt, scope: `alias:${runnerId}:${projected.id}` });
  const hostResult=host.executeBuild(projected,aliases); const build = runnerBuildReceipt(runnerId,projected,aliases,hostResult); const observedBrowser = runnerBrowserReceipt(runnerId,projected,build,browser);
  const activeReviewerLanes = typeof reviewerLanes === 'function' ? reviewerLanes(projected, build, observedBrowser) : reviewerLanes;
  if (activeReviewerLanes.length < 3 || (requireCompletedBundles && typeof reviewerLanes !== 'function')) throw new Error('authoritative reviewers require fresh completed host-observed ReviewerLaunchBundles per brief');
  const lanes = new Set<string>(), raters = new Set<string>(), sessions = new Set<string>(), configs = new Set<string>(), processes = new Set<string>();
  let telemetry=addUsage(observeUnsignedUsage(usageComputation,{runnerId,executionId:executionId(runnerId,projected,'host',build.laneId),hostIdentity:host.identity,kind:'host',laneId:build.laneId}),observeUnsignedUsage(usageComputation,{runnerId,executionId:executionId(runnerId,projected,'browser',observedBrowser.laneId),hostIdentity:host.identity,kind:'browser',laneId:observedBrowser.laneId}));
  try {
    const reviews = activeReviewerLanes.map(lane => {
    let completedProof: ReviewerCompletedProof | undefined;
    const session=lane.session;
    if (requireCompletedBundles) {
      if (!lane.bundle || !lane.host) throw new Error('authoritative reviewer lanes require a completed host-observed ReviewerLaunchBundle');
      const proof = completedProof = completedReviewerProofs.get(lane);
      completedReviewerProofs.delete(lane);
      if (!proof) throw new Error('authoritative reviewer lane lacks an internally-issued one-use completed proof');
      const actualProcessIdentity = digest({ childPid: proof.childPid, evidenceSha256: proof.evidenceSha256, sessionId: proof.sessionId, nonce: proof.nonce });
      liveReviewerExecutions.set(`${runnerId}:${projected.id}:${lane.laneId}`, Object.freeze({ runnerId, briefHash: projected.briefHash, buildReceiptHash: build.receiptHash, browserReceiptHash: observedBrowser.receiptHash, laneId: lane.laneId, raterId: lane.raterId, childPid: proof.childPid, sessionId: proof.sessionId, nonce: proof.nonce, evidenceSha256: proof.evidenceSha256 }));
      if (!session || session.sessionId !== proof.sessionId || session.processIdentity !== actualProcessIdentity || session.handshake !== digest({ runnerId, briefHash: projected.briefHash, buildReceiptHash: build.receiptHash, browserReceiptHash: observedBrowser.receiptHash, sessionId: proof.sessionId, nonce: proof.nonce })) throw new Error('reviewer session is not bound to its completed child, brief, build, browser, and live one-use challenge');
    }
    if (!lane.laneId || !lane.raterId || !session || !hash.test(session.executableSha256) || !hash.test(session.processIdentity) || !hash.test(session.configIdentity) || !hash.test(session.handshake) || lanes.has(lane.laneId) || raters.has(lane.raterId) || sessions.has(session.sessionId) || configs.has(session.configIdentity) || processes.has(session.processIdentity)) throw new Error(`reviewer session is reused, unobserved, or non-independent: ${projected.id}`);
    const response=lane.review(projected,build,observedBrowser); const vote=response?.vote;
    if(vote!=='one'&&vote!=='none'&&vote!=='abstain') throw new Error('reviewer vote is invalid');
    if (requireCompletedBundles) {
      const receipt=response?.workReceipt;
      const proof=completedProof;
      if (!proof || !receipt || receipt.schemaVersion!=='runner-benchmark-reviewer-work-receipt-v1' || receipt.vote!==vote || receipt.briefHash!==projected.briefHash || receipt.buildReceiptHash!==build.receiptHash || receipt.artifactHash!==build.artifactHash || receipt.browserReceiptHash!==observedBrowser.receiptHash || receipt.observationHash!==observedBrowser.observationHash || receipt.consumedEvidenceHash!==proof.evidenceSha256 || !hash.test(receipt.evidenceTranscriptHash) || receipt.childPid!==proof.childPid || receipt.sessionId!==proof.sessionId || receipt.configurationSha256!==lane.bundle!.reviewerLaunchReceipt.configurationSha256 || typeof receipt.rationale!=='string' || !receipt.rationale.trim()) throw new Error('reviewer work receipt is not bound to the exact brief, build artifact, browser observation, MCP evidence, and live session');
    }
    telemetry=addUsage(telemetry,observeUnsignedUsage(usageComputation,{runnerId,executionId:executionId(runnerId,projected,'reviewer',lane.laneId,session.sessionId),hostIdentity:host.identity,kind:'reviewer',laneId:lane.laneId,sessionId:session.sessionId}));
    lanes.add(lane.laneId);raters.add(lane.raterId);sessions.add(session.sessionId);configs.add(session.configIdentity);processes.add(session.processIdentity);
    return Object.freeze({laneId:`${runnerId}:reviewer:${lane.laneId}`,raterId:lane.raterId,briefHash:projected.briefHash,buildReceiptHash:build.receiptHash,browserReceiptHash:observedBrowser.receiptHash,vote,workReceipt:response.workReceipt,receiptHash:receiptHash({lane:'reviewer',runnerId,laneId:lane.laneId,raterId:lane.raterId,session,briefHash:projected.briefHash,buildReceiptHash:build.receiptHash,browserReceiptHash:observedBrowser.receiptHash,vote,workReceipt:response.workReceipt})});
    });
    return Object.freeze({build,browser:observedBrowser,reviews:Object.freeze(reviews),telemetry});
  } finally {
    if (requireCompletedBundles) for (const lane of activeReviewerLanes) completedReviewerProofs.delete(lane);
  }
}
function signedFieldMismatches(
  id: string,
  signed: Record<string, unknown>,
  live: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  return fields.flatMap((field) => canonical(signed[field]) === canonical(live[field])
    ? []
    : [`${id}.${field}: expected ${canonical(signed[field])}, received ${canonical(live[field])}`]);
}
/** Runs the harness mechanics with public telemetry and deliberately returns no signed report. */
export function computeUnsignedHarnessRun(input: UnsignedHarnessV2RunInput) {
  validateFrozenDevelopmentCorpus(input.developmentCorpus);
  validateEvaluatorHoldoutMetadata(input.evaluatorHoldouts);
  validateBudget(input.budget);
  const issuedAt = input.issuedAt ?? Date.now();
  const expiresAt = input.expiresAt ?? issuedAt + 60_000;
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) throw new Error('unsigned computation requires a valid clock window');
  const runnerId = input.runnerId ?? `unsigned-${input.usageComputation.identity}`;
  const projectedById = new Map(input.projectedBriefs.map(projected => [projected.id, projected]));
  const decisions: Record<string, readonly { raterId: string; vote: RaterVote }[]> = {};
  const receipts: Record<string, ReturnType<typeof execute>> = {};
  let observedUsage: UsageTelemetry = { tokens: 0, usd: 0 };
  for (const holdout of input.evaluatorHoldouts.holdouts) {
    const projected = projectedById.get(holdout.id);
    const rawEvidence = input.rawHoldoutEvidence[holdout.id];
    const authority = input.rawHoldoutAuthority[holdout.id];
    if (!projected || !rawEvidence || !authority) throw new Error(`missing unsigned projected brief: ${holdout.id}`);
    const run = execute(projected, rawEvidence, authority, input.host, input.browser, input.reviewerLanes, input.usageComputation, runnerId, issuedAt, expiresAt);
    observedUsage = addUsage(observedUsage, run.telemetry);
    if (observedUsage.tokens > input.budget.tokens || observedUsage.usd > input.budget.usd) throw new Error('unsigned parent-observed usage exceeds input cap');
    validateBudget({ rounds: 1, browserLaunches: 0, elapsedMinutes: 0, ...observedUsage });
    receipts[holdout.id] = run;
    decisions[holdout.id] = run.reviews.map(review => ({ raterId: review.raterId, vote: review.vote }));
  }
  const measuredBudget: HarnessBudget = { rounds: 1, browserLaunches: input.evaluatorHoldouts.holdouts.length, elapsedMinutes: 0, ...observedUsage };
  validateBudget(measuredBudget);
  return Object.freeze({
    result: evaluateHarness(input.evaluatorHoldouts.holdouts, decisions, measuredBudget),
    projectedBriefs: input.projectedBriefs,
    receipts: Object.freeze(receipts),
    measuredBudget: Object.freeze(measuredBudget),
  });
}
type PrecomputedHarnessRuns = Readonly<{
  receipts: Readonly<Record<string, ReturnType<typeof execute>>>;
  observedUsage: UsageTelemetry;
}>;
function computeHarnessRun(input: HarnessV2RunInput, snapshot: EvidenceLockSnapshot, precomputed?: PrecomputedHarnessRuns) {
  if (precomputed === undefined) liveReviewerExecutions.clear();
  const usageObserver=input.usageObserver;
  if (!e5E13PinnedUsageObservers.has(usageObserver)) throw new Error('an E5/E13-pinned usage observer is required');
  validateFrozenDevelopmentCorpus(input.developmentCorpus); validateEvaluatorHoldoutMetadata(input.evaluatorHoldouts); validateBudget(input.budget); requireEvidenceLockSnapshot(snapshot, input.evidenceLock);
  const evidence = (id: string) => readEvidenceSnapshotPayload(snapshot, id as `E${number}`);
  const e1=evidence('E1'),e2=evidence('E2'),e3=evidence('E3'),e4=evidence('E4'),e5=evidence('E5'),e13=evidence('E13');
  const signedDigests=e13.runInputDigests as Record<string, unknown>, signedAuthority=e4.aliasAuthority, signedAuthorityDigest=e13.aliasAuthorityDigest;
  const signedObserver=e5.observer as {identity?:unknown;executableSha256?:unknown;configIdentity?:unknown}, observerAuthorityDigest=signedObserver && typeof signedObserver.identity==='string' && hash.test(signedObserver.executableSha256 as string) && hash.test(signedObserver.configIdentity as string) ? digest(signedObserver) : '';
  const clock=e5.clock as { issuedAt?:unknown; expiresAt?:unknown; elapsedMinutes?:unknown };
  if (e1.digest !== input.developmentCorpus.digest || JSON.stringify(e2.routeMap) !== JSON.stringify(input.developmentCorpus.routeMap) || e3.digest !== input.evaluatorHoldouts.digest || e4.digest !== digest(input.projectedBriefs) || digest(signedAuthority)!==digest(input.rawHoldoutAuthority) || signedAuthorityDigest!==digest(signedAuthority) || signedDigests.developmentCorpus !== input.developmentCorpus.digest || signedDigests.legalSurfaceMatrix !== digest(input.developmentCorpus.routeMap) || signedDigests.evaluatorHoldouts !== input.evaluatorHoldouts.digest || signedDigests.projectedBriefs !== digest(input.projectedBriefs) || signedDigests.observerAuthority !== observerAuthorityDigest || e13.observerAuthorityDigest !== observerAuthorityDigest || !observerAuthorityDigest || e5.hostIdentity !== input.host.identity || e5.observerIdentity !== usageObserver.identity || signedObserver.identity !== usageObserver.identity || typeof e5.runnerId !== 'string' || !Number.isSafeInteger(clock?.issuedAt) || !Number.isSafeInteger(clock?.expiresAt) || clock.expiresAt! <= clock.issuedAt! || typeof clock.elapsedMinutes !== 'number' || !Number.isFinite(clock.elapsedMinutes) || clock.elapsedMinutes < 0) throw new Error('run inputs do not match signed E1-E5 authority');
  if(input.projectedBriefs.length!==128 || input.evaluatorHoldouts.holdouts.length!==128 || input.projectedBriefs.length!==input.evaluatorHoldouts.holdouts.length) throw new Error('harness requires exactly the canonical 128 holdouts');
  const projectedById=new Map<string,ProjectedBrief>(); for(const projected of input.projectedBriefs){validateProjectedBrief(projected);if(projectedById.has(projected.id)) throw new Error(`duplicate projected brief: ${projected.id}`);projectedById.set(projected.id,projected);}
  const runnerId=e5.runnerId, decisions:Record<string,readonly {raterId:string;vote:RaterVote}[]>={}, receipts:Record<string,ReturnType<typeof execute>>={}; let observedUsage:UsageTelemetry=precomputed?.observedUsage ?? {tokens:0,usd:0};
  for(const holdout of input.evaluatorHoldouts.holdouts){
    const projected=projectedById.get(holdout.id),rawEvidence=input.rawHoldoutEvidence[holdout.id],authority=input.rawHoldoutAuthority[holdout.id];
    if(!projected||!rawEvidence||!authority||projected.kind!==holdout.kind||projected.surface!==holdout.surface||canonical(projected.routes)!==canonical(holdout.routes)||projected.domain!==holdout.domain||projected.language!==holdout.language)throw new Error(`missing or relabeled projected brief: ${holdout.id}`);
    const run=precomputed?.receipts[holdout.id] ?? execute(projected,rawEvidence,authority,input.host,input.browser,input.reviewerLanes,usageObserver,runnerId,clock.issuedAt as number,clock.expiresAt as number,true);
    if (precomputed !== undefined && precomputed.receipts[holdout.id] === undefined) throw new Error(`missing precomputed authoritative run: ${holdout.id}`);
    if (precomputed === undefined) observedUsage=addUsage(observedUsage,run.telemetry);
    if(observedUsage.tokens>input.budget.tokens||observedUsage.usd>input.budget.usd) throw new Error('parent-observed usage exceeds input cap');
    validateBudget({rounds:1,browserLaunches:0,elapsedMinutes:0,...observedUsage}); receipts[holdout.id]=run; decisions[holdout.id]=run.reviews.map(review=>({raterId:review.raterId,vote:review.vote}));
  }
  const measuredBudget:HarnessBudget={rounds:1,browserLaunches:input.evaluatorHoldouts.holdouts.length,elapsedMinutes:clock.elapsedMinutes as number,...observedUsage}; validateBudget(measuredBudget);
  const result=evaluateHarness(input.evaluatorHoldouts.holdouts,decisions,measuredBudget);
  const buildReceiptDigest=digest(Object.fromEntries(Object.entries(receipts).map(([id,run])=>[id,run.build])));
  const browserReceiptDigest=digest(Object.fromEntries(Object.entries(receipts).map(([id,run])=>[id,run.browser])));
  const rawReviewerReceiptDigest=digest(Object.fromEntries(Object.entries(receipts).map(([id,run])=>[id,run.reviews])));
  const orderedExecutionReceipts=Object.freeze([...executionReceipts.entries()].sort(([left],[right])=>left.localeCompare(right)).map(([,receipt])=>receipt));
  if (processUsageSource && orderedExecutionReceipts.length !== input.evaluatorHoldouts.holdouts.length * 5) throw new Error('every spawned child requires an observer-signed execution receipt');
  const normalizedExecutionReceipts = orderedExecutionReceipts.map((entry) => {
    const receipt = entry as {
      identity?: unknown;
      source?: unknown;
      child?: Record<string, unknown>;
      networkDenial?: Record<string, unknown>;
      accounting?: Record<string, unknown>;
    };
    return {
      identity: receipt.identity,
      source: receipt.source,
      child: {
        executableSha256: receipt.child?.executableSha256,
        interpreterSha256: receipt.child?.interpreterSha256,
        targetSha256: receipt.child?.targetSha256,
        baseArgs: receipt.child?.baseArgs,
        configIdentity: receipt.child?.configIdentity,
        status: receipt.child?.status,
        signal: receipt.child?.signal,
        processIdentity: receipt.child?.processIdentity,
      },
      networkDenial: { denied: receipt.networkDenial?.denied },
      accounting: { tokens: receipt.accounting?.tokens, usd: receipt.accounting?.usd },
    };
  });
  const reviewerExecutionDigest=digest(Object.freeze([...liveReviewerExecutions.entries()].sort(([left],[right])=>left.localeCompare(right)).map(([,entry])=>entry)));
  const executionReceiptDigest=digest({ parentExecutionReceipts: normalizedExecutionReceipts, reviewerExecutionDigest });
  const reviewerReceiptDigest=digest({rawReviewerReceiptDigest,executionReceiptDigest});
  const receiptDigest=digest({buildReceiptDigest,browserReceiptDigest,reviewerReceiptDigest,executionReceiptDigest});
  const processSessionIdentity=digest({observerAuthorityDigest,browserLane:input.browser.laneId,executionReceiptDigest,reviewerExecutionDigest,reviewers:'per-brief-host-observed-bundles'});
  const lockDigest=evidenceLockDigest(snapshot.lock.entries);
  const lineageRoot=digest({lockDigest,developmentCorpus:input.developmentCorpus.digest,evaluatorHoldouts:input.evaluatorHoldouts.digest,buildReceiptDigest,browserReceiptDigest,reviewerReceiptDigest,executionReceiptDigest,receiptDigest,result,measuredBudget,processSessionIdentity});
  const observationEnvelope=digest({runnerId,hostIdentity:input.host.identity,observerIdentity:usageObserver.identity,observerAuthorityDigest,buildReceiptDigest,browserReceiptDigest,reviewerReceiptDigest,executionReceiptDigest,receiptDigest,lineageRoot,measuredBudget,result,processSessionIdentity});
  const live={runnerId,hostIdentity:input.host.identity,observerIdentity:usageObserver.identity,observerAuthorityDigest,buildReceiptDigest,browserReceiptDigest,reviewerReceiptDigest,executionReceiptDigest,reviewerExecutionDigest,receiptDigest,lockDigest,lineageRoot,observationEnvelope,processSessionIdentity,measuredBudget,result};
  return {result,projectedBriefs:input.projectedBriefs,receipts,live:Object.freeze(live),snapshot};
}
function runHarnessV2WithSnapshot(input: HarnessV2RunInput, snapshot: EvidenceLockSnapshot, precomputed?: PrecomputedHarnessRuns) {
  const computed=computeHarnessRun(input, snapshot, precomputed);
  const evidence = (id: string) => readEvidenceSnapshotPayload(computed.snapshot, id as `E${number}`);
  const live=computed.live as unknown as Record<string, unknown>;
  const mismatches = (['E6','E7','E8','E9','E10','E11'] as const).flatMap((id) => {
    const signed = evidence(id) as Record<string, unknown>;
    return signedFieldMismatches(id, signed, live, Object.keys(signed).filter((field) => field !== 'lineage' && !['reviewerReceiptDigest', 'executionReceiptDigest', 'receiptDigest', 'lineageRoot', 'observationEnvelope', 'processSessionIdentity'].includes(field)));
  });
  if (mismatches.length > 0) throw new Error(`live signed benchmark projection diverges:\n${mismatches.join('\n')}`);
  const report: HarnessV2RunReport=Object.freeze({
    schemaVersion:'harness-v2-run-report-v4',
    signedE5Digest:createHash('sha256').update(readEvidenceSnapshotBytes(snapshot,'E5')).digest('hex'),
    signedE13Digest:createHash('sha256').update(readEvidenceSnapshotBytes(snapshot,'E13')).digest('hex'),
    postRunAttestationDigest:'',
    postRunAttestationSignature:'',
    ...computed.live,
  });
  return {result:computed.result,projectedBriefs:computed.projectedBriefs,receipts:computed.receipts,report};
}
export function runHarnessV2(input: HarnessV2RunInput) {
  return runHarnessV2WithSnapshot(input, validateEvidenceLock(input.evidenceRoot, input.evidenceLock));
}
interface CliInput { developmentCorpus: readonly HoldoutBrief[]; developmentRouteMap: Record<string, HoldoutBrief['surface']>; holdouts: readonly HoldoutBrief[]; projectionSalt: string; evidenceRoot: string; evidenceLock: EvidenceLock; budget: HarnessBudget; hostCommand: string; hostArgs?: readonly string[]; browserCommand: string; browserArgs?: readonly string[]; reviewerCommands: readonly { command:string; args?:readonly string[]; laneId:string; raterId:string }[]; usageSidecarCommand: string; usageSidecarArgs?: readonly string[]; }
interface SignedProcess { executableSha256: string; interpreterSha256: string; targetSha256: string; configIdentity: string; telemetry: UsageTelemetry; }
interface SignedObserverProcess extends SignedProcess { identity: string; publicKey: string; }
interface ProcessExecution { pid: number; executableSha256: string; interpreterSha256: string; targetSha256: string; baseArgs: readonly string[]; configIdentity: string; status: number | null; signal: string | null; processIdentity: string; }
type PinnedSpawn = {
  readonly pid?: number;
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string | Uint8Array | null;
  readonly stderr: string | Uint8Array | null;
  readonly error?: Error;
  readonly interpreterSha256: string;
  readonly targetSha256: string;
  readonly baseArgs: readonly string[];
};
function openVerifiedExecutable(command: string): { readonly fd: number; readonly sha256: string; readonly bytes: Buffer } {
  if(!isAbsolute(command)||resolve(command)!==command) throw new Error('subprocess command must be an absolute path');
  const fd = openSync(command, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd); const path = lstatSync(command);
    if (!before.isFile() || path.isSymbolicLink() || !path.isFile()
      || before.dev !== path.dev || before.ino !== path.ino || before.size !== path.size
      || realpathSync(command)!==command) throw new Error('subprocess executable must be a stable resolved file');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count <= 0) throw new Error('subprocess executable ended during verification');
      offset += count;
    }
    const after = fstatSync(fd); const finalPath = lstatSync(command);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
      || finalPath.dev !== before.dev || finalPath.ino !== before.ino || finalPath.size !== before.size) {
      throw new Error('subprocess executable changed during verification');
    }
    return { fd, sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}
function executableIdentity(command:string):string {
  const opened = openVerifiedExecutable(command);
  try { return opened.sha256; } finally { closeSync(opened.fd); }
}
const pinnedInterpreter = realpathSync(process.execPath);
const pinnedInterpreterStat = lstatSync(pinnedInterpreter);
function interpreterIdentity(): string {
  const current = lstatSync(pinnedInterpreter);
  if (!current.isFile() || current.isSymbolicLink()
    || current.dev !== pinnedInterpreterStat.dev
    || current.ino !== pinnedInterpreterStat.ino
    || current.size !== pinnedInterpreterStat.size
    || current.mtimeMs !== pinnedInterpreterStat.mtimeMs
    || current.ctimeMs !== pinnedInterpreterStat.ctimeMs
    || realpathSync(pinnedInterpreter) !== pinnedInterpreter) {
    throw new Error('pinned subprocess interpreter identity changed');
  }
  return executableIdentity(pinnedInterpreter);
}
const fixedSubprocessEnvironment = Object.freeze({ PATH: '' });
const fixedSubprocessCwd = realpathSync(tmpdir());
type SubprocessEnvironment = Readonly<Record<string, string>>;
function observerSubprocessEnvironment(): SubprocessEnvironment {
  const privateKey = process.env.OMD_OBSERVER_PRIVATE_KEY;
  if (!privateKey) throw new Error('OMD_OBSERVER_PRIVATE_KEY is required for observer attestations');
  return Object.freeze({ ...fixedSubprocessEnvironment, OMD_OBSERVER_PRIVATE_KEY: privateKey });
}
type PinnedStage = Readonly<{ directory: string; interpreter: string; target: string }>;

function stagePinnedExecutables(interpreter: Buffer, target: Buffer): PinnedStage {
  const directory = mkdtempSync(join(tmpdir(), 'omd-harness-stage-'));
  try {
    const interpreterPath = join(directory, 'interpreter');
    const targetPath = join(directory, 'target.mjs');
    writeFileSync(interpreterPath, interpreter, { mode: 0o700, flag: 'wx' });
    writeFileSync(targetPath, target, { mode: 0o700, flag: 'wx' });
    chmodSync(interpreterPath, 0o700);
    chmodSync(targetPath, 0o700);
    return Object.freeze({ directory, interpreter: realpathSync(interpreterPath), target: realpathSync(targetPath) });
  } catch (error) {
    rmSync(directory, { force: true, recursive: true });
    throw error;
  }
}
type StagedReviewerProxy = Readonly<{ directory: string; launcher: string; target: string }>;

function stageReviewerProxy(): StagedReviewerProxy {
  const directory = mkdtempSync(join(tmpdir(), 'omd-harness-stage-'));
  try {
    const target = openVerifiedExecutable(reviewerProxyTarget);
    const dependency = openVerifiedExecutable(reviewerEvidenceProxyTarget);
    try {
      const adaptersDirectory = join(directory, 'adapters');
      const runtimeDirectory = join(directory, 'core', 'runtime');
      mkdirSync(adaptersDirectory, { recursive: true, mode: 0o700 });
      mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
      const stagedTarget = join(adaptersDirectory, 'reviewer-mcp.ts');
      const stagedDependency = join(runtimeDirectory, 'evidence-proxy.ts');
      const targetSource = target.bytes.toString('utf8').replace(/^#![^\n]*\n/, `#!${process.execPath}\n`);
      writeFileSync(stagedTarget, targetSource, { mode: 0o700, flag: 'wx' });
      writeFileSync(stagedDependency, dependency.bytes, { mode: 0o600, flag: 'wx' });
      chmodSync(stagedTarget, 0o700);
      const executable = realpathSync(stagedTarget);
      return Object.freeze({ directory, launcher: realpathSync(process.execPath), target: executable });
    } finally {
      closeSync(dependency.fd);
      closeSync(target.fd);
    }
  } catch (error) {
    rmSync(directory, { force: true, recursive: true });
    throw error;
  }
}
function cleanupStagedReviewerProxy(stage: StagedReviewerProxy): void {
  rmSync(stage.directory, { force: true, recursive: true });
}

function cleanupPinnedStage(stage: PinnedStage): void {
  rmSync(stage.directory, { force: true, recursive: true });
}

function spawnPinned(command:string,args:readonly string[],options:{input?:string;encoding:'utf8';timeout:number;maxBuffer:number},signed:SignedProcess, environment: SubprocessEnvironment = fixedSubprocessEnvironment):PinnedSpawn {
  const interpreter=openVerifiedExecutable(pinnedInterpreter), target=openVerifiedExecutable(command), baseArgs=Object.freeze([command,...args]);
  let stage: PinnedStage | undefined;
  try {
    if (interpreter.sha256 !== signed.interpreterSha256 || target.sha256 !== signed.targetSha256) throw new Error('subprocess interpreter or target changed before execution');
    stage = stagePinnedExecutables(interpreter.bytes, target.bytes);
    if (executableIdentity(stage.interpreter) !== interpreter.sha256 || executableIdentity(stage.target) !== target.sha256) throw new Error('immutable subprocess staging changed before execution');
    return Object.assign(spawnSync(stage.interpreter,[stage.target,...args],{...options,cwd:fixedSubprocessCwd,env:environment}),{interpreterSha256:interpreter.sha256,targetSha256:target.sha256,baseArgs}) as PinnedSpawn;
  } finally {
    if (stage !== undefined) cleanupPinnedStage(stage);
    closeSync(interpreter.fd);
    closeSync(target.fd);
  }
}

function spawnPinnedAsync(command: string, args: readonly string[], input: string, signed: SignedProcess, environment: SubprocessEnvironment = fixedSubprocessEnvironment, timeoutMs = 60_000): Promise<PinnedSpawn> {
  const interpreter=openVerifiedExecutable(pinnedInterpreter), target=openVerifiedExecutable(command), baseArgs=Object.freeze([command,...args]);
  let stage: PinnedStage | undefined;
  try {
    if (interpreter.sha256 !== signed.interpreterSha256 || target.sha256 !== signed.targetSha256) throw new Error('subprocess interpreter or target changed before execution');
    stage = stagePinnedExecutables(interpreter.bytes, target.bytes);
    if (executableIdentity(stage.interpreter) !== interpreter.sha256 || executableIdentity(stage.target) !== target.sha256) throw new Error('immutable subprocess staging changed before execution');
    const staged = stage;
    return new Promise<PinnedSpawn>((resolvePromise, reject) => {
      const child = spawn(staged.interpreter, [staged.target, ...args], { cwd: fixedSubprocessCwd, env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
      const stdout: Buffer[] = [], stderr: Buffer[] = [];
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk));
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (status, signal) => { clearTimeout(timer); resolvePromise(Object.assign(child, { status, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), interpreterSha256:interpreter.sha256,targetSha256:target.sha256,baseArgs }) as PinnedSpawn); });
      child.stdin.end(input);
    }).finally(() => cleanupPinnedStage(staged));
  } finally {
    closeSync(interpreter.fd);
    closeSync(target.fd);
  }
}
type PinnedHeldSpawn = Readonly<{ pid: number; send(input: string): Promise<PinnedSpawn>; terminate(): void }>;

function spawnPinnedHeld(command: string, args: readonly string[], signed: SignedProcess, timeoutMs = 60_000): PinnedHeldSpawn {
  const interpreter = openVerifiedExecutable(pinnedInterpreter), target = openVerifiedExecutable(command), baseArgs = Object.freeze([command, ...args]);
  let stage: PinnedStage | undefined;
  try {
    if (interpreter.sha256 !== signed.interpreterSha256 || target.sha256 !== signed.targetSha256) throw new Error('subprocess interpreter or target changed before execution');
    stage = stagePinnedExecutables(interpreter.bytes, target.bytes);
    if (executableIdentity(stage.interpreter) !== interpreter.sha256 || executableIdentity(stage.target) !== target.sha256) throw new Error('immutable subprocess staging changed before execution');
    const staged = stage;
    const child = spawn(staged.interpreter, [staged.target, ...args], { cwd: fixedSubprocessCwd, env: fixedSubprocessEnvironment, stdio: ['pipe', 'pipe', 'pipe'] });
    const pid = child.pid;
    if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) throw new Error('designated reviewer did not start');
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    const completion = new Promise<PinnedSpawn>((resolvePromise, reject) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk));
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (status, signal) => { clearTimeout(timer); resolvePromise(Object.assign(child, { status, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), interpreterSha256: interpreter.sha256, targetSha256: target.sha256, baseArgs }) as PinnedSpawn); });
    }).finally(() => cleanupPinnedStage(staged));
    let sent = false;
    return Object.freeze({
      pid,
      send(input: string): Promise<PinnedSpawn> {
        if (sent) throw new Error('designated reviewer received more than one receipt-issued configuration handoff');
        sent = true;
        child.stdin.end(input);
        return completion;
      },
      terminate(): void {
        void completion.catch(() => undefined);
        child.kill('SIGKILL');
      },
    });
  } catch (error) {
    if (stage !== undefined) cleanupPinnedStage(stage);
    throw error;
  } finally {
    closeSync(interpreter.fd);
    closeSync(target.fd);
  }
}
const processExecutions = new Map<string, ProcessExecution>();
const executionReceipts = new Map<string, Readonly<Record<string, unknown>>>();
let processUsageSource: ((source: ParentUsageSource) => UsageTelemetry) | undefined;
function processExecutionKey(source: ParentUsageSource): string { return source.executionId; }
function recordProcessExecution(source: ParentUsageSource, signed: SignedProcess, child: PinnedSpawn): ProcessExecution { if (child.status !== 0 || child.signal || !Number.isSafeInteger(child.pid) || child.pid! <= 0 || child.interpreterSha256 !== signed.interpreterSha256 || child.targetSha256 !== signed.targetSha256 || signed.executableSha256 !== signed.targetSha256 || child.baseArgs[0] === undefined) throw new Error(`${source.kind} subprocess lacks a successful exact interpreter/target/status binding`); const execution=Object.freeze({pid:child.pid!,executableSha256:signed.executableSha256,interpreterSha256:child.interpreterSha256,targetSha256:child.targetSha256,baseArgs:child.baseArgs,configIdentity:signed.configIdentity,status:child.status,signal:child.signal,processIdentity:digest({interpreterSha256:child.interpreterSha256,targetSha256:child.targetSha256,baseArgs:child.baseArgs,executableSha256:signed.executableSha256,configIdentity:signed.configIdentity,status:child.status,signal:child.signal})}); processExecutions.set(processExecutionKey(source),execution); return execution; }
function pinProcess(command: string, args: readonly string[], signed: SignedProcess, source: string): void { if (interpreterIdentity() !== signed.interpreterSha256 || executableIdentity(command) !== signed.targetSha256 || signed.executableSha256 !== signed.targetSha256 || digest(args) !== signed.configIdentity) throw new Error(`${source} interpreter, target, or config does not match signed E5`); }
function signedObserverAuthority(e5: unknown, e13: unknown): SignedObserverProcess { const signed=(e5 as {observer?:unknown})?.observer as SignedObserverProcess, reconciliation=e13 as {observerAuthorityDigest?:unknown;runInputDigests?:Record<string,unknown>}; if (!signed || typeof signed.identity!=='string' || typeof signed.publicKey!=='string' || !hash.test(signed.executableSha256) || !hash.test(signed.interpreterSha256) || !hash.test(signed.targetSha256) || !hash.test(signed.configIdentity)) throw new Error('usage sidecar is not authorized by signed E5 observer authority'); const authorityDigest=digest(signed); if (reconciliation?.observerAuthorityDigest!==authorityDigest || reconciliation?.runInputDigests?.observerAuthority!==authorityDigest) throw new Error('usage sidecar authority does not match signed E13'); return signed; }
async function commandHostAsync(command:string,args:readonly string[],signed:SignedProcess,identity:string,runnerId:string,brief:ProjectedBrief,aliases:AliasResolver):Promise<HostBuildResult> {
  const evidence=brief.evidenceAliases.map(alias=>{const resolved=aliases.resolve(alias);return {alias,bytes:Buffer.from(resolved.bytes).toString('base64'),sha256:createHash('sha256').update(resolved.bytes).digest('hex'),receipt:resolved.receipt};});
  const child=await spawnPinnedAsync(command,args,JSON.stringify({schemaVersion:'harness-v2-host-ipc-v5',brief,evidence}),signed);
  const stdout=subprocessText(child.stdout),stderr=subprocessText(child.stderr);
  if(child.error||child.status!==0)throw new Error(`isolated host failed: ${child.error?.message??stderr}`);
  const response=JSON.parse(stdout) as {laneId:string;artifactBytes:string};
  const artifactBytes=Buffer.from(response.artifactBytes,'base64');
  if(!response.laneId||!response.artifactBytes||!artifactBytes.byteLength||Buffer.from(artifactBytes).toString('base64')!==response.artifactBytes)throw new Error('host did not return immutable artifact bytes');
  recordProcessExecution({runnerId,executionId:executionId(runnerId,brief,'host',`${runnerId}:build:${response.laneId}`),hostIdentity:identity,kind:'host',laneId:`${runnerId}:build:${response.laneId}`},signed,child);
  return {laneId:response.laneId,artifactHash:createHash('sha256').update(artifactBytes).digest('hex'),artifactBytes};
}
async function commandBrowserAsync(command:string,args:readonly string[],signed:SignedProcess,runnerId:string,hostIdentity:string,brief:ProjectedBrief,build:BuildRunReceipt):Promise<BrowserObservation> {
  const child=await spawnPinnedAsync(command,args,JSON.stringify({brief,build:{...build,artifactBytes:Buffer.from(build.artifactBytes).toString('base64')} }),signed);
  const stdout=subprocessText(child.stdout).trim();
  if(child.error||child.status!==0||!stdout)throw new Error('browser observer failed');
  const response=JSON.parse(stdout) as {observationBytes:string};
  const bytes=Buffer.from(response.observationBytes,'base64');
  if(!bytes.byteLength||Buffer.from(bytes).toString('base64')!==response.observationBytes)throw new Error('browser observer did not return immutable observation bytes');
  recordProcessExecution({runnerId,executionId:executionId(runnerId,brief,'browser',`${runnerId}:browser:command-browser`),hostIdentity,kind:'browser',laneId:`${runnerId}:browser:command-browser`},signed,child);
  return {observationBytes:bytes};
}
function sidecarUsage(command: string, args: readonly string[], signed: SignedObserverProcess, source: ParentUsageSource): UsageTelemetry { const execution=processExecutions.get(processExecutionKey(source)); if (!execution) throw new Error(`parent usage sidecar lacks ${source.kind} child-process correlation`); const child=spawnPinned(command, [...args,JSON.stringify({source,child:execution})], {encoding:'utf8',timeout:10_000,maxBuffer:65_536}, signed, observerSubprocessEnvironment()); if(child.error||child.status!==0) throw new Error(`parent usage sidecar failed for ${source.kind}`); let observed: unknown; try { observed=JSON.parse(subprocessText(child.stdout)); } catch { throw new Error(`parent usage sidecar did not provide observable ${source.kind} usage`); } const receipt=observed as {identity?:unknown;source?:unknown;child?:unknown;networkDenial?:{denied?:unknown;receipt?:unknown};accounting?:{tokens?:unknown;usd?:unknown;receipt?:unknown};signature?:unknown}; const publicKey=signed.publicKey; if(typeof publicKey!=='string'||!receipt.signature||!verify(null,Buffer.from(canonical({identity:receipt.identity,source:receipt.source,child:receipt.child,networkDenial:receipt.networkDenial,accounting:receipt.accounting})),createPublicKey(publicKey),Buffer.from(String(receipt.signature),'base64'))) throw new Error(`parent usage sidecar receipt signature is invalid for ${source.kind}`); if (receipt.identity!==signed.identity || canonical(receipt.source)!==canonical(source) || canonical(receipt.child)!==canonical(execution) || receipt.networkDenial?.denied!==true || receipt.networkDenial.receipt!==digest({source,child:execution,denied:true}) || receipt.accounting?.receipt!==digest({source,child:execution,tokens:receipt.accounting?.tokens,usd:receipt.accounting?.usd})) throw new Error(`parent usage sidecar did not provide bound offline network-denial/accounting evidence for ${source.kind}`); executionReceipts.set(`${processExecutionKey(source)}:${execution.pid}`,Object.freeze(receipt as Record<string,unknown>)); const telemetry=usage(receipt.accounting,`parent usage sidecar ${source.kind}`); if (telemetry.tokens!==0 || telemetry.usd!==0) throw new Error(`${source.kind} attempted metered resource usage`); return telemetry; }
function attestPostRun(command: string, args: readonly string[], signed: SignedObserverProcess, report: HarnessV2RunReport): HarnessV2RunReport {
  const fields = Object.freeze({ schemaVersion:'harness-v2-live-observer-attestation-v1', runnerId:report.runnerId, hostIdentity:report.hostIdentity, observerIdentity:report.observerIdentity, observerAuthorityDigest:report.observerAuthorityDigest, signedE5Digest:report.signedE5Digest, signedE13Digest:report.signedE13Digest, buildReceiptDigest:report.buildReceiptDigest, browserReceiptDigest:report.browserReceiptDigest, reviewerReceiptDigest:report.reviewerReceiptDigest, executionReceiptDigest:report.executionReceiptDigest, reviewerExecutionDigest:report.reviewerExecutionDigest, receiptDigest:report.receiptDigest, lockDigest:report.lockDigest, lineageRoot:report.lineageRoot, observationEnvelope:report.observationEnvelope, processSessionIdentity:report.processSessionIdentity, measuredBudget:report.measuredBudget, result:report.result });
  const child = spawnPinned(command, [...args, 'post-attest', JSON.stringify(fields)], { encoding:'utf8', timeout:10_000, maxBuffer:65_536 }, signed, observerSubprocessEnvironment());
  if (child.error || child.status !== 0) throw new Error('post-run observer attestation failed');
  let receipt: { fields?: unknown; signature?: unknown };
  try { receipt = JSON.parse(subprocessText(child.stdout)); } catch { throw new Error('post-run observer attestation was not JSON'); }
  if (canonical(receipt.fields) !== canonical(fields) || typeof receipt.signature !== 'string' || !verify(null, Buffer.from(canonical(fields)), createPublicKey(signed.publicKey), Buffer.from(receipt.signature, 'base64'))) throw new Error('post-run observer attestation is not bound to E13-authorized live fields');
  return Object.freeze({ ...report, postRunAttestationDigest:digest({fields,signature:receipt.signature}), postRunAttestationSignature:receipt.signature });
}
async function runCanonicalCli(input: CliInput): Promise<ReturnType<typeof runHarnessV2>> {
  if (!input.hostCommand || !input.browserCommand || !input.usageSidecarCommand || !Array.isArray(input.reviewerCommands) || input.reviewerCommands.length !== 3) {
    throw new Error('CLI input requires host, browser, reviewers, evidence root, and parent usage sidecar');
  }
  const snapshot = validateEvidenceLock(input.evidenceRoot, input.evidenceLock);
  const e5 = readEvidenceSnapshotPayload(snapshot, 'E5') as Record<string, unknown>;
  const e13 = readEvidenceSnapshotPayload(snapshot, 'E13') as Record<string, unknown>;
  const signedHost = e5.host as SignedProcess;
  const signedBrowser = e5.browser as SignedProcess;
  const signedReviewers = e5.reviewers as (SignedProcess & { laneId: string; raterId: string })[];
  const signedObserver = signedObserverAuthority(e5, e13);
  if (!Array.isArray(signedReviewers) || signedReviewers.length !== 3) throw new Error('signed E5 requires exactly three reviewer authorities');
  const reviewerSpecs = input.reviewerCommands.map((spec) => {
    const signed = signedReviewers.find((authority) => authority.laneId === spec.laneId && authority.raterId === spec.raterId);
    if (!signed) throw new Error(`reviewer is not authorized by signed E5: ${spec.laneId}`);
    const args = spec.args ?? [];
    pinProcess(spec.command, args, signed, `reviewer ${spec.laneId}`);
    return { ...spec, args, signed, loadedSkillSha256: signed.targetSha256 };
  });
  pinProcess(input.hostCommand, input.hostArgs ?? [], signedHost, 'host');
  pinProcess(input.browserCommand, input.browserArgs ?? [], signedBrowser, 'browser');
  pinProcess(input.usageSidecarCommand, input.usageSidecarArgs ?? [], signedObserver, 'usage sidecar');
  const prepared = prepareHarnessV2(input.developmentCorpus, input.developmentRouteMap, input.holdouts, input.projectionSalt);
  const runnerId = e5.runnerId as string;
  const adapter = createReviewerMcpAdapter();
  processExecutions.clear();
  executionReceipts.clear();
  processUsageSource = (source) => sidecarUsage(input.usageSidecarCommand, input.usageSidecarArgs ?? [], signedObserver, source);
  try {
    const clock = e5.clock as { issuedAt: number; expiresAt: number };
    const usageObserver = issueE5E13PinnedUsageObserver(signedObserver.identity, processUsageSource);
    const precomputedReceipts: Record<string, ReturnType<typeof execute>> = {};
    let observedUsage: UsageTelemetry = { tokens: 0, usd: 0 };
    liveReviewerExecutions.clear();
    const runProjected = async (projected: ProjectedBrief): Promise<ReturnType<typeof execute>> => {
      const aliases = createAliasResolver(projected, prepared.rawHoldoutEvidence[projected.id]!, prepared.rawHoldoutAuthority[projected.id]!, clock.issuedAt, clock.expiresAt - clock.issuedAt, 8 * 1024 * 1024, { now: clock.issuedAt, scope: `alias:${runnerId}:${projected.id}` });
      const buildResult = await commandHostAsync(input.hostCommand, input.hostArgs ?? [], signedHost, e5.hostIdentity as string, runnerId, projected, aliases);
      const build = runnerBuildReceipt(runnerId, projected, aliases, buildResult);
      const browserResult = await commandBrowserAsync(input.browserCommand, input.browserArgs ?? [], signedBrowser, runnerId, e5.hostIdentity as string, projected, build);
      const browser = runnerBrowserReceipt(runnerId, projected, build, { laneId: 'command-browser', observe: () => browserResult });
      const lanes = await Promise.all(reviewerSpecs.map(async (spec) => {
        const host: ReviewerHost = 'benchmark';
        const reviewer = spawnPinnedHeld(spec.command, spec.args, spec.signed);
        let proxyStage: StagedReviewerProxy | undefined;
        try {
          proxyStage = stageReviewerProxy();
          const processBinding = Object.freeze({
            parentPid: process.pid,
            parentExecutableSha256: interpreterIdentity(),
            reviewerPid: reviewer.pid,
            reviewerExecutableSha256: spec.signed.interpreterSha256,
            laneId: spec.laneId,
            runnerId,
            sessionId: randomUUID(),
            nonce: randomUUID(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
          const proxyBinding = Object.freeze({
            stagedPath: proxyStage!.launcher,
            stagedSha256: executableIdentity(proxyStage!.launcher),
            targetPath: proxyStage!.target,
            targetSha256: executableIdentity(proxyStage!.target),
          });
          const evidencePayload=Object.freeze({schemaVersion:'runner-benchmark-reviewer-evidence-v1',brief:projected,build:{...build,artifactBytes:Buffer.from(build.artifactBytes).toString('base64')},browser:{...browser,observationBytes:Buffer.from(browser.observationBytes).toString('base64')}});
          const receipt = adapter.launch({ host, buildSha256: build.receiptHash, loadedSkillSha256: spec.loadedSkillSha256, briefSha256: projected.briefHash, browserSha256: browser.receiptHash, evidence: JSON.stringify(evidencePayload), processBinding, proxyBinding });
          const bundle = adapter.launchBundle({ loadedSkillReceipt: adapter.observeBenchmarkReviewer(spec.command, spec.signed.targetSha256, spec.signed.interpreterSha256), reviewerLaunchReceipt: receipt });
          const child = await reviewer.send(JSON.stringify({ brief: projected, build: { ...build, artifactBytes: Buffer.from(build.artifactBytes).toString('base64') }, browser: { ...browser, observationBytes:Buffer.from(browser.observationBytes).toString('base64') }, reviewerEvidenceConfiguration: bundle.configuration }));
          const stdout = subprocessText(child.stdout).trim();
          if (child.status !== 0 || !stdout) throw new Error(`reviewer ${spec.laneId} failed: ${subprocessText(child.stderr)}`);
          const response = JSON.parse(stdout) as ReviewerResult;
          const evidenceChildPid = response.workReceipt?.childPid;
          if (response.vote !== 'one' && response.vote !== 'none' && response.vote !== 'abstain' || typeof evidenceChildPid !== 'number' || !Number.isSafeInteger(evidenceChildPid) || evidenceChildPid <= 0) throw new Error(`reviewer ${spec.laneId} did not return a typed evidence-bound work receipt`);
          const completedProof = adapter.consumeCompletedLaunchBundle(bundle, host, {
            briefSha256: projected.briefHash,
            buildSha256: build.receiptHash,
            browserSha256: browser.receiptHash,
          });
          if (completedProof.childPid !== evidenceChildPid) throw new Error(`reviewer ${spec.laneId} completed proof does not identify its evidence proxy child`);
          recordProcessExecution({ runnerId, executionId: executionId(runnerId,projected,'reviewer',spec.laneId,receipt.processBinding.sessionId), hostIdentity: e5.hostIdentity as string, kind: 'reviewer', laneId: spec.laneId, sessionId: receipt.processBinding.sessionId }, spec.signed, child);
          const lane: ReviewerLane = { laneId: spec.laneId, raterId: spec.raterId, host, bundle, session: { sessionId: receipt.processBinding.sessionId, executableSha256: spec.signed.interpreterSha256, processIdentity: digest({ childPid: completedProof.childPid, evidenceSha256: completedProof.evidenceSha256, sessionId: completedProof.sessionId, nonce: completedProof.nonce }), configIdentity: receipt.configurationSha256, handshake: digest({ runnerId, briefHash: projected.briefHash, buildReceiptHash: build.receiptHash, browserReceiptHash: browser.receiptHash, sessionId: completedProof.sessionId, nonce: completedProof.nonce }) }, review: () => response };
          completedReviewerProofs.set(lane, completedProof);
          return lane;
        } catch (error) {
          reviewer.terminate();
          throw error;
        } finally {
          if (proxyStage !== undefined) cleanupStagedReviewerProxy(proxyStage);
        }
      }));
      const cachedHost: IsolatedHarnessHost = {
        identity: e5.hostIdentity as string,
        executeBuild(current, currentAliases) {
          if (current.id !== projected.id) throw new Error('cached host result crossed projected briefs');
          for (const alias of current.evidenceAliases) currentAliases.resolve(alias);
          return buildResult;
        },
      };
      const cachedBrowser: BrowserObserver = {
        laneId: 'command-browser',
        observe(current) {
          if (current.id !== projected.id) throw new Error('cached browser result crossed projected briefs');
          return browserResult;
        },
      };
      const run = execute(
        projected,
        prepared.rawHoldoutEvidence[projected.id]!,
        prepared.rawHoldoutAuthority[projected.id]!,
        cachedHost,
        cachedBrowser,
        () => lanes,
        usageObserver,
        runnerId,
        clock.issuedAt,
        clock.expiresAt,
        true,
      );
      return run;
    };
    const orderedRuns: Array<ReturnType<typeof execute> | undefined> = new Array(prepared.projectedBriefs.length);
    let nextProjected = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = nextProjected++;
        if (index >= prepared.projectedBriefs.length) return;
        orderedRuns[index] = await runProjected(prepared.projectedBriefs[index]!);
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, prepared.projectedBriefs.length) }, worker));
    for (let index = 0; index < prepared.projectedBriefs.length; index += 1) {
      const run = orderedRuns[index];
      if (run === undefined) throw new Error(`canonical worker omitted projected brief ${prepared.projectedBriefs[index]!.id}`);
      precomputedReceipts[prepared.projectedBriefs[index]!.id] = run;
      observedUsage = addUsage(observedUsage, run.telemetry);
    }
    const harnessInput: HarnessV2RunInput = {
      ...prepared,
      host: { identity: e5.hostIdentity as string, executeBuild() { throw new Error('precomputed canonical host must not rerun'); } },
      browser: { laneId: 'command-browser', observe() { throw new Error('precomputed canonical browser must not rerun'); } },
      reviewerLanes: () => { throw new Error('precomputed canonical reviewers must not rerun'); },
      usageObserver,
      evidenceRoot: input.evidenceRoot,
      evidenceLock: input.evidenceLock,
      budget: input.budget,
    };
    const outcome = runHarnessV2WithSnapshot(harnessInput, snapshot, {
      receipts: Object.freeze(precomputedReceipts),
      observedUsage,
    });
    return Object.freeze({ ...outcome, report:attestPostRun(input.usageSidecarCommand, input.usageSidecarArgs ?? [], signedObserver, outcome.report) });
  } finally {
    processUsageSource = undefined;
    adapter.dispose();
  }
}
if (process.argv[1]?.endsWith('run-harness-v2.ts')) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('usage: run-harness-v2 <input.json>');
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as CliInput;
  runCanonicalCli(input).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
