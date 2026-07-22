import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createAliasResolver, createEvaluatorHoldoutMetadata, evaluateHarness, freezeDevelopmentCorpus, projectHoldoutBrief, receiptHash, validateBudget, validateEvaluatorHoldoutMetadata, validateFrozenDevelopmentCorpus, validateProjectedBrief } from '../../core/eval-harness/holdout-projection.ts';
import { validateEvidenceLock } from './validate-evidence-lock.ts';
import { readEvidenceSnapshotPayload } from './materialize-evidence-lock.ts';
import type { AliasResolver, BrowserRunReceipt, BuildRunReceipt, EvaluatorHoldoutMetadata, FrozenDevelopmentCorpus, HarnessBudget, HoldoutBrief, ProjectedBrief, RaterVote } from '../../core/eval-harness/holdout-projection.ts';
import type { EvidenceLock, EvidenceLockSnapshot } from './materialize-evidence-lock.ts';

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hash = /^[a-f0-9]{64}$/;
function subprocessBytes(chunk: string | Uint8Array | null | undefined): Uint8Array { return typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk ? new Uint8Array(chunk) : new Uint8Array(); }
function subprocessText(chunk: string | Uint8Array | null | undefined): string { return new TextDecoder().decode(subprocessBytes(chunk)); }
export interface PreparedHarnessV2 { developmentCorpus: FrozenDevelopmentCorpus; evaluatorHoldouts: EvaluatorHoldoutMetadata; projectedBriefs: readonly ProjectedBrief[]; rawHoldoutEvidence: Readonly<Record<string, readonly string[]>>; rawHoldoutAuthority: Readonly<Record<string, readonly { alias:string; sha256:string; byteLength:number }[]>>; }
export interface UsageTelemetry { tokens: number; usd: number; }
export interface ParentUsageSource { runnerId: string; hostIdentity: string; kind: 'host' | 'browser' | 'reviewer'; laneId: string; sessionId?: string; }
export interface UnsignedUsageComputation { readonly identity: string; observe(source: ParentUsageSource): UsageTelemetry; }
export type UnsignedUsageComputationCallback = (source: ParentUsageSource) => UsageTelemetry;
declare const authoritativeUsageBrand: unique symbol;
export interface E5E13PinnedUsageObserver extends UnsignedUsageComputation { readonly [authoritativeUsageBrand]: true; }
const e5E13PinnedUsageObservers = new WeakSet<E5E13PinnedUsageObserver>();
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
export interface ReviewerResult { vote: RaterVote; }
export interface IsolatedHarnessHost { identity: string; executeBuild(brief: ProjectedBrief, aliases: AliasResolver): HostBuildResult; }
export interface ReviewerSession { sessionId: string; executableSha256: string; processIdentity: string; configIdentity: string; handshake: string; }
export interface ReviewerLane { laneId: string; raterId: string; session?: ReviewerSession; review(brief: ProjectedBrief, build: BuildRunReceipt, browser: BrowserRunReceipt): ReviewerResult; }
export interface BrowserObserver { laneId: string; observe(brief: ProjectedBrief, build: BuildRunReceipt): BrowserObservation; }
export interface HarnessV2RunInput extends PreparedHarnessV2 { host: IsolatedHarnessHost; reviewerLanes: readonly ReviewerLane[]; browser: BrowserObserver; usageObserver: E5E13PinnedUsageObserver; evidenceRoot: string; evidenceLock: EvidenceLock; evidenceSnapshot?: EvidenceLockSnapshot; budget: HarnessBudget; }
export interface HarnessV2RunReport { schemaVersion: 'harness-v2-run-report-v4'; signedE5Digest: string; signedE13Digest: string; runnerId: string; hostIdentity: string; observerIdentity: string; observerAuthorityDigest: string; buildReceiptDigest: string; browserReceiptDigest: string; reviewerReceiptDigest: string; executionReceiptDigest: string; receiptDigest: string; lockDigest: string; lineageRoot: string; observationEnvelope: string; processSessionIdentity: string; measuredBudget: HarnessBudget; result: ReturnType<typeof evaluateHarness>; }
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

/** Computes telemetry only; it cannot validate signed evidence or return a report. */
export function computeUnsignedUsage(computation: UnsignedUsageComputation, sources: readonly ParentUsageSource[]): UsageTelemetry {
  if (!computation.identity) throw new Error('unsigned usage computation requires an identity');
  return Object.freeze(sources.reduce((total, source) => {
    const next = usage(computation.observe(Object.freeze({ ...source })), 'unsigned usage computation');
    return { tokens: total.tokens + next.tokens, usd: total.usd + next.usd };
  }, { tokens: 0, usd: 0 }));
}
function usage(value: unknown, source: string): UsageTelemetry { const telemetry=value as UsageTelemetry; if (!telemetry || !Number.isFinite(telemetry.tokens) || !Number.isFinite(telemetry.usd) || telemetry.tokens < 0 || telemetry.usd < 0) throw new Error(`${source} did not report finite non-negative parent-observed telemetry`); return Object.freeze({tokens:telemetry.tokens,usd:telemetry.usd}); }
function addUsage(total: UsageTelemetry, next: UsageTelemetry): UsageTelemetry { return {tokens:total.tokens+next.tokens,usd:total.usd+next.usd}; }
function canonical(value: unknown): string { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; const record=value as Record<string, unknown>; return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`; }
function verifySignedExpectation(id: string, expected: unknown, observed: unknown): void { if (!expected || typeof expected !== 'object' || Array.isArray(expected) || !observed || typeof observed !== 'object' || Array.isArray(observed) || Object.entries(expected as Record<string, unknown>).some(([key,value]) => canonical(value) !== canonical((observed as Record<string, unknown>)[key]))) throw new Error(`live ${id} outcome diverges from the signed benchmark expectation`); }
function observeUnsignedUsage(computation: UnsignedUsageComputation, source: ParentUsageSource): UsageTelemetry {
  if (!computation.identity) throw new Error('an unsigned usage computation identity is required');
  return usage(computation.observe(Object.freeze({ ...source })), `${source.kind} unsigned computation`);
}
export function prepareHarnessV2(developmentCorpus: readonly HoldoutBrief[], developmentRouteMap: Readonly<Record<string, HoldoutBrief['surface']>>, holdouts: readonly HoldoutBrief[], projectionSalt: string): PreparedHarnessV2 { const projectedBriefs = Object.freeze(holdouts.map(brief => projectHoldoutBrief(brief, projectionSalt))); const evaluatorHoldouts = createEvaluatorHoldoutMetadata(holdouts.map((brief, index) => ({ ...brief, id: projectedBriefs[index]!.id }))); const rawHoldoutEvidence = Object.freeze(Object.fromEntries(holdouts.map((brief, index) => [projectedBriefs[index]!.id, Object.freeze([...brief.evidence])]))) as Readonly<Record<string, readonly string[]>>; const rawHoldoutAuthority=Object.freeze(Object.fromEntries(projectedBriefs.map(projected=>[projected.id,Object.freeze(projected.evidenceAliases.map((alias,index)=>{const bytes=new TextEncoder().encode(rawHoldoutEvidence[projected.id]![index]!);return Object.freeze({alias,sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.byteLength});}))]))) as PreparedHarnessV2['rawHoldoutAuthority']; return Object.freeze({ developmentCorpus: freezeDevelopmentCorpus(developmentCorpus, developmentRouteMap), evaluatorHoldouts, projectedBriefs, rawHoldoutEvidence, rawHoldoutAuthority }); }
function runnerBuildReceipt(runnerId: string, projected: ProjectedBrief, resolver: AliasResolver, result: HostBuildResult): BuildRunReceipt { const actualReceipts = resolver.consumedReceipts(); if (!result.laneId || !hash.test(result.artifactHash) || !(result.artifactBytes instanceof Uint8Array) || result.artifactBytes.byteLength === 0 || createHash('sha256').update(result.artifactBytes).digest('hex') !== result.artifactHash || actualReceipts.length !== projected.evidenceAliases.length) throw new Error('host build result lacks complete immutable artifact and observed evidence consumption'); const seen = new Set<string>(); for (const receipt of actualReceipts) { if (!projected.evidenceAliases.includes(receipt.alias) || seen.has(receipt.alias) || !Number.isSafeInteger(receipt.bytes) || receipt.bytes <= 0 || !hash.test(receipt.sha256) || receipt.expiresAt !== resolver.expiresAt || receipt.receiptHash !== receiptHash({ scope: resolver.scope, alias: receipt.alias, bytes: receipt.bytes, sha256: receipt.sha256, expiresAt: receipt.expiresAt })) throw new Error('host supplied invalid evidence consumption'); seen.add(receipt.alias); } const consumptionReceiptHashes = Object.freeze(actualReceipts.map(receipt => receipt.receiptHash)); return Object.freeze({ laneId: `${runnerId}:build:${result.laneId}`, briefHash: projected.briefHash, artifactHash: result.artifactHash, artifactBytes: result.artifactBytes.slice(), consumptionReceiptHashes, receiptHash: receiptHash({ lane:'build',runnerId,laneId:result.laneId,briefHash:projected.briefHash,artifactHash:result.artifactHash,consumptionReceiptHashes }) }); }
function runnerBrowserReceipt(runnerId: string, projected: ProjectedBrief, build: BuildRunReceipt, browser: BrowserObserver): BrowserRunReceipt { const observation=browser.observe(projected, build); const observationBytes=observation?.observationBytes; const observationHash = observationBytes instanceof Uint8Array ? createHash('sha256').update(observationBytes).digest('hex') : ''; if (!browser.laneId || !observationBytes?.byteLength || !hash.test(observationHash)) throw new Error('runner browser observer did not provide immutable observed evidence bytes'); return Object.freeze({ laneId:`${runnerId}:browser:${browser.laneId}`,briefHash:projected.briefHash,buildReceiptHash:build.receiptHash,observationHash,observationBytes:observationBytes.slice(),receiptHash:receiptHash({lane:'browser',runnerId,laneId:browser.laneId,briefHash:projected.briefHash,buildReceiptHash:build.receiptHash,observationHash}) }); }
function execute(projected: ProjectedBrief, rawEvidence: readonly string[], authority: readonly {alias:string;sha256:string;byteLength:number}[], host: IsolatedHarnessHost, browser: BrowserObserver, reviewerLanes: readonly ReviewerLane[], usageComputation: UnsignedUsageComputation, runnerId: string, issuedAt: number, expiresAt: number) {
  validateProjectedBrief(projected);
  if (!host.identity || reviewerLanes.length < 3 || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) throw new Error('host identity, signed clock, and three runner-owned reviewer lanes are required');
  const aliases = createAliasResolver(projected, rawEvidence, authority, issuedAt, expiresAt - issuedAt, 8 * 1024 * 1024, { now: issuedAt, scope: `alias:${runnerId}:${projected.id}` });
  const hostResult=host.executeBuild(projected,aliases); const build = runnerBuildReceipt(runnerId,projected,aliases,hostResult); const observedBrowser = runnerBrowserReceipt(runnerId,projected,build,browser);
  const lanes = new Set<string>(), raters = new Set<string>(), sessions = new Set<string>(), configs = new Set<string>(), processes = new Set<string>();
  let telemetry=addUsage(observeUnsignedUsage(usageComputation,{runnerId,hostIdentity:host.identity,kind:'host',laneId:build.laneId}),observeUnsignedUsage(usageComputation,{runnerId,hostIdentity:host.identity,kind:'browser',laneId:observedBrowser.laneId}));
  const reviews = reviewerLanes.map(lane => {
    const session=lane.session;
    if (!lane.laneId || !lane.raterId || !session || !hash.test(session.executableSha256) || !hash.test(session.processIdentity) || !hash.test(session.configIdentity) || !hash.test(session.handshake) || lanes.has(lane.laneId) || raters.has(lane.raterId) || sessions.has(session.sessionId) || configs.has(session.configIdentity) || processes.has(session.processIdentity)) throw new Error(`reviewer session is reused, unobserved, or non-independent: ${projected.id}`);
    const response=lane.review(projected,build,observedBrowser); const vote=response?.vote;
    if(vote!=='one'&&vote!=='none'&&vote!=='abstain') throw new Error('reviewer vote is invalid');
    telemetry=addUsage(telemetry,observeUnsignedUsage(usageComputation,{runnerId,hostIdentity:host.identity,kind:'reviewer',laneId:lane.laneId,sessionId:session.sessionId}));
    lanes.add(lane.laneId);raters.add(lane.raterId);sessions.add(session.sessionId);configs.add(session.configIdentity);processes.add(session.processIdentity);
    return Object.freeze({laneId:`${runnerId}:reviewer:${lane.laneId}`,raterId:lane.raterId,briefHash:projected.briefHash,buildReceiptHash:build.receiptHash,browserReceiptHash:observedBrowser.receiptHash,vote,receiptHash:receiptHash({lane:'reviewer',runnerId,laneId:lane.laneId,raterId:lane.raterId,session,briefHash:projected.briefHash,buildReceiptHash:build.receiptHash,browserReceiptHash:observedBrowser.receiptHash,vote})});
  });
  return Object.freeze({build,browser:observedBrowser,reviews:Object.freeze(reviews),telemetry});
}
function signedFields(id: string, signed: Record<string, unknown>, live: Record<string, unknown>, fields: readonly string[]): void {
  for (const field of fields) if (canonical(signed[field]) !== canonical(live[field])) throw new Error(`live ${id} ${field} diverges from the signed benchmark expectation`);
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
export function computeHarnessRun(input: HarnessV2RunInput) {
  const usageObserver=input.usageObserver;
  if (!e5E13PinnedUsageObservers.has(usageObserver)) throw new Error('an E5/E13-pinned usage observer is required');
  validateFrozenDevelopmentCorpus(input.developmentCorpus); validateEvaluatorHoldoutMetadata(input.evaluatorHoldouts); validateBudget(input.budget); const snapshot=input.evidenceSnapshot ?? validateEvidenceLock(input.evidenceRoot,input.evidenceLock);
  const evidence = (id: string) => readEvidenceSnapshotPayload(snapshot, id as `E${number}`);
  const e1=evidence('E1'),e2=evidence('E2'),e3=evidence('E3'),e4=evidence('E4'),e5=evidence('E5'),e6=evidence('E6'),e7=evidence('E7'),e8=evidence('E8'),e9=evidence('E9'),e10=evidence('E10'),e11=evidence('E11'),e13=evidence('E13');
  const signedDigests=e13.runInputDigests as Record<string, unknown>, signedAuthority=e4.aliasAuthority, signedAuthorityDigest=e13.aliasAuthorityDigest;
  const signedObserver=e5.observer as {identity?:unknown;executableSha256?:unknown;configIdentity?:unknown}, observerAuthorityDigest=signedObserver && typeof signedObserver.identity==='string' && hash.test(signedObserver.executableSha256 as string) && hash.test(signedObserver.configIdentity as string) ? digest(signedObserver) : '';
  const clock=e5.clock as { issuedAt?:unknown; expiresAt?:unknown; elapsedMinutes?:unknown };
  if (e1.digest !== input.developmentCorpus.digest || JSON.stringify(e2.routeMap) !== JSON.stringify(input.developmentCorpus.routeMap) || e3.digest !== input.evaluatorHoldouts.digest || e4.digest !== digest(input.projectedBriefs) || digest(signedAuthority)!==digest(input.rawHoldoutAuthority) || signedAuthorityDigest!==digest(signedAuthority) || signedDigests.developmentCorpus !== input.developmentCorpus.digest || signedDigests.legalSurfaceMatrix !== digest(input.developmentCorpus.routeMap) || signedDigests.evaluatorHoldouts !== input.evaluatorHoldouts.digest || signedDigests.projectedBriefs !== digest(input.projectedBriefs) || signedDigests.observerAuthority !== observerAuthorityDigest || e13.observerAuthorityDigest !== observerAuthorityDigest || !observerAuthorityDigest || e5.hostIdentity !== input.host.identity || e5.observerIdentity !== usageObserver.identity || signedObserver.identity !== usageObserver.identity || typeof e5.runnerId !== 'string' || !Number.isSafeInteger(clock?.issuedAt) || !Number.isSafeInteger(clock?.expiresAt) || clock.expiresAt! <= clock.issuedAt! || typeof clock.elapsedMinutes !== 'number' || !Number.isFinite(clock.elapsedMinutes) || clock.elapsedMinutes < 0) throw new Error('run inputs do not match signed E1-E5 authority');
  if(input.projectedBriefs.length!==128 || input.evaluatorHoldouts.holdouts.length!==128 || input.projectedBriefs.length!==input.evaluatorHoldouts.holdouts.length) throw new Error('harness requires exactly the canonical 128 holdouts');
  const projectedById=new Map<string,ProjectedBrief>(); for(const projected of input.projectedBriefs){validateProjectedBrief(projected);if(projectedById.has(projected.id)) throw new Error(`duplicate projected brief: ${projected.id}`);projectedById.set(projected.id,projected);}
  const runnerId=e5.runnerId, decisions:Record<string,readonly {raterId:string;vote:RaterVote}[]>={}, receipts:Record<string,ReturnType<typeof execute>>={}; let observedUsage:UsageTelemetry={tokens:0,usd:0};
  for(const holdout of input.evaluatorHoldouts.holdouts){
    const projected=projectedById.get(holdout.id),rawEvidence=input.rawHoldoutEvidence[holdout.id],authority=input.rawHoldoutAuthority[holdout.id];
    if(!projected||!rawEvidence||!authority||projected.kind!==holdout.kind||projected.surface!==holdout.surface||projected.domain!==holdout.domain||projected.language!==holdout.language)throw new Error(`missing or relabeled projected brief: ${holdout.id}`);
    const run=execute(projected,rawEvidence,authority,input.host,input.browser,input.reviewerLanes,usageObserver,runnerId,clock.issuedAt as number,clock.expiresAt as number); observedUsage=addUsage(observedUsage,run.telemetry);
    if(observedUsage.tokens>input.budget.tokens||observedUsage.usd>input.budget.usd) throw new Error('parent-observed usage exceeds input cap');
    validateBudget({rounds:1,browserLaunches:0,elapsedMinutes:0,...observedUsage}); receipts[holdout.id]=run; decisions[holdout.id]=run.reviews.map(review=>({raterId:review.raterId,vote:review.vote}));
  }
  const measuredBudget:HarnessBudget={rounds:1,browserLaunches:input.evaluatorHoldouts.holdouts.length,elapsedMinutes:clock.elapsedMinutes as number,...observedUsage}; validateBudget(measuredBudget);
  const result=evaluateHarness(input.evaluatorHoldouts.holdouts,decisions,measuredBudget);
  const buildReceiptDigest=digest(Object.fromEntries(Object.entries(receipts).map(([id,run])=>[id,run.build])));
  const browserReceiptDigest=digest(Object.fromEntries(Object.entries(receipts).map(([id,run])=>[id,run.browser])));
  const rawReviewerReceiptDigest=digest(Object.fromEntries(Object.entries(receipts).map(([id,run])=>[id,run.reviews])));
  const orderedExecutionReceipts=Object.freeze([...executionReceipts.entries()].sort(([left],[right])=>left.localeCompare(right)).map(([,receipt])=>receipt));
  if (processUsageSource && orderedExecutionReceipts.length !== input.evaluatorHoldouts.holdouts.length * (2 + input.reviewerLanes.length)) throw new Error('every spawned child requires an observer-signed execution receipt');
  const executionReceiptDigest=digest(orderedExecutionReceipts);
  const reviewerReceiptDigest=digest({rawReviewerReceiptDigest,executionReceiptDigest});
  const receiptDigest=digest({buildReceiptDigest,browserReceiptDigest,reviewerReceiptDigest,executionReceiptDigest});
  const processSessionIdentity=digest({observerAuthorityDigest,browserLane:input.browser.laneId,executionReceiptDigest,reviewers:input.reviewerLanes.map(lane=>({laneId:lane.laneId,raterId:lane.raterId,session:lane.session}))});
  const lockDigest=input.evidenceLock.digest, lineageRoot=digest({lockDigest,developmentCorpus:input.developmentCorpus.digest,evaluatorHoldouts:input.evaluatorHoldouts.digest,buildReceiptDigest,browserReceiptDigest,reviewerReceiptDigest,executionReceiptDigest,receiptDigest,result,measuredBudget,processSessionIdentity});
  const observationEnvelope=digest({runnerId,hostIdentity:input.host.identity,observerIdentity:usageObserver.identity,observerAuthorityDigest,buildReceiptDigest,browserReceiptDigest,reviewerReceiptDigest,executionReceiptDigest,receiptDigest,lineageRoot,measuredBudget,result,processSessionIdentity});
  const live={runnerId,hostIdentity:input.host.identity,observerIdentity:usageObserver.identity,observerAuthorityDigest,buildReceiptDigest,browserReceiptDigest,reviewerReceiptDigest,executionReceiptDigest,receiptDigest,lockDigest,lineageRoot,observationEnvelope,processSessionIdentity,measuredBudget,result};
  const report: HarnessV2RunReport=Object.freeze({schemaVersion:'harness-v2-run-report-v4',signedE5Digest:input.evidenceLock.entries.find(entry=>entry.id==='E5')!.sha256,signedE13Digest:input.evidenceLock.entries.find(entry=>entry.id==='E13')!.sha256,...live});
  return {result,projectedBriefs:input.projectedBriefs,receipts,report,snapshot};
}
export function runHarnessV2(input: HarnessV2RunInput) {
  const computed=computeHarnessRun(input);
  const evidence = (id: string) => readEvidenceSnapshotPayload(computed.snapshot, id as `E${number}`);
  const live=computed.report as unknown as Record<string, unknown>;
  for (const [id, fields] of [['E6',['runnerId','hostIdentity','observerIdentity','observerAuthorityDigest']],['E11',['observerAuthorityDigest']]] as const) signedFields(id,evidence(id),live,fields);
  return computed;
}
interface CliInput { developmentCorpus: readonly HoldoutBrief[]; developmentRouteMap: Record<string, HoldoutBrief['surface']>; holdouts: readonly HoldoutBrief[]; projectionSalt: string; evidenceRoot: string; evidenceLock: EvidenceLock; evidenceSnapshot?: EvidenceLockSnapshot; budget: HarnessBudget; hostCommand: string; hostArgs?: readonly string[]; browserCommand: string; browserArgs?: readonly string[]; reviewerCommands: readonly { command:string; args?:readonly string[]; laneId:string; raterId:string }[]; usageSidecarCommand: string; usageSidecarArgs?: readonly string[]; }
interface SignedProcess { executableSha256: string; configIdentity: string; telemetry: UsageTelemetry; }
interface SignedObserverProcess extends SignedProcess { identity: string; publicKey: string; }
interface ProcessExecution { pid: number; executableSha256: string; configIdentity: string; status: number | null; signal: string | null; processIdentity: string; }
function executableIdentity(command:string):string { const path=realpathSync(command); const stat=lstatSync(path); if(!stat.isFile()||stat.isSymbolicLink()) throw new Error('subprocess executable must be a regular resolved file'); return createHash('sha256').update(readFileSync(path)).digest('hex'); }
const processExecutions = new Map<string, ProcessExecution>();
const executionReceipts = new Map<string, Readonly<Record<string, unknown>>>();
let processUsageSource: ((source: ParentUsageSource) => UsageTelemetry) | undefined;
function processExecutionKey(source: ParentUsageSource): string { return `${source.runnerId}:${source.kind}:${source.laneId}:${source.sessionId??''}`; }
function recordProcessExecution(source: ParentUsageSource, command: string, args: readonly string[], child: ReturnType<typeof spawnSync>): ProcessExecution { if (child.status !== 0 || child.signal || !Number.isSafeInteger(child.pid) || child.pid! <= 0) throw new Error(`${source.kind} subprocess lacks a successful child process identity`); const execution=Object.freeze({pid:child.pid!,executableSha256:executableIdentity(command),configIdentity:digest(args),status:child.status,signal:child.signal,processIdentity:digest({executableSha256:executableIdentity(command),configIdentity:digest(args),pid:child.pid,status:child.status,signal:child.signal})}); processExecutions.set(processExecutionKey(source),execution); return execution; }
function pinProcess(command: string, args: readonly string[], signed: SignedProcess, source: string): void { if (executableIdentity(command) !== signed.executableSha256 || digest(args) !== signed.configIdentity) throw new Error(`${source} executable or config does not match signed E5`); }
function signedObserverAuthority(e5: unknown, e13: unknown): SignedObserverProcess { const signed=(e5 as {observer?:unknown})?.observer as SignedObserverProcess, reconciliation=e13 as {observerAuthorityDigest?:unknown;runInputDigests?:Record<string,unknown>}; if (!signed || typeof signed.identity!=='string' || typeof signed.publicKey!=='string' || !hash.test(signed.executableSha256) || !hash.test(signed.configIdentity)) throw new Error('usage sidecar is not authorized by signed E5 observer authority'); const authorityDigest=digest(signed); if (reconciliation?.observerAuthorityDigest!==authorityDigest || reconciliation?.runInputDigests?.observerAuthority!==authorityDigest) throw new Error('usage sidecar authority does not match signed E13'); return signed; }
function commandHost(command:string,args:readonly string[]=[],signed:SignedProcess,identity:string,runnerId:string):IsolatedHarnessHost { pinProcess(command,args,signed,'host'); return {identity,executeBuild(brief,aliases){const evidence=brief.evidenceAliases.map(alias=>{const resolved=aliases.resolve(alias);return {alias,bytes:Buffer.from(resolved.bytes).toString('base64'),sha256:createHash('sha256').update(resolved.bytes).digest('hex'),receipt:resolved.receipt};});const child=spawnSync(command,args,{cwd:tmpdir(),env:{PATH:process.env.PATH??''},input:JSON.stringify({schemaVersion:'harness-v2-host-ipc-v5',brief,evidence}),encoding:'utf8',timeout:60_000,maxBuffer:1_048_576});const stdout=subprocessText(child.stdout),stderr=subprocessText(child.stderr);if(child.error||child.status!==0)throw new Error(`isolated host failed: ${child.error?.message??stderr}`);const response=JSON.parse(stdout) as {laneId:string;artifactBytes:string};const artifactBytes=Buffer.from(response.artifactBytes,'base64');if(!response.laneId||!response.artifactBytes||!artifactBytes.byteLength||Buffer.from(artifactBytes).toString('base64')!==response.artifactBytes)throw new Error('host did not return immutable artifact bytes');recordProcessExecution({runnerId,hostIdentity:identity,kind:'host',laneId:`${runnerId}:build:${response.laneId}`},command,args,child);return {laneId:response.laneId,artifactHash:createHash('sha256').update(artifactBytes).digest('hex'),artifactBytes};}}; }
function commandBrowser(command:string,args:readonly string[]=[],signed:SignedProcess,runnerId:string,hostIdentity:string):BrowserObserver{pinProcess(command,args,signed,'browser');return{laneId:'command-browser',observe(brief,build){const child=spawnSync(command,args,{cwd:tmpdir(),env:{PATH:process.env.PATH??''},input:JSON.stringify({brief,build:{...build,artifactBytes:Buffer.from(build.artifactBytes).toString('base64')}}),encoding:'utf8',timeout:60_000,maxBuffer:1_048_576});const stdout=subprocessText(child.stdout).trim();if(child.error||child.status!==0||!stdout)throw new Error('browser observer failed');const response=JSON.parse(stdout) as {observationBytes:string};const bytes=Buffer.from(response.observationBytes,'base64');if(!bytes.byteLength||Buffer.from(bytes).toString('base64')!==response.observationBytes)throw new Error('browser observer did not return immutable observation bytes');recordProcessExecution({runnerId,hostIdentity,kind:'browser',laneId:`${runnerId}:browser:command-browser`},command,args,child);return {observationBytes:bytes};}};}
function sidecarUsage(command: string, args: readonly string[], signed: SignedObserverProcess, source: ParentUsageSource): UsageTelemetry { const execution=processExecutions.get(processExecutionKey(source)); if (!execution) throw new Error(`parent usage sidecar lacks ${source.kind} child-process correlation`); const child=spawnSync(command,[...args,JSON.stringify({source,child:execution})],{cwd:tmpdir(),env:{PATH:process.env.PATH??''},encoding:'utf8',timeout:10_000,maxBuffer:65_536}); if(child.error||child.status!==0) throw new Error(`parent usage sidecar failed for ${source.kind}`); let observed: unknown; try { observed=JSON.parse(subprocessText(child.stdout)); } catch { throw new Error(`parent usage sidecar did not provide observable ${source.kind} usage`); } const receipt=observed as {identity?:unknown;source?:unknown;child?:unknown;networkDenial?:{denied?:unknown;receipt?:unknown};accounting?:{tokens?:unknown;usd?:unknown;receipt?:unknown};signature?:unknown}; const publicKey=signed.publicKey; if(typeof publicKey!=='string'||!receipt.signature||!verify(null,Buffer.from(canonical({identity:receipt.identity,source:receipt.source,child:receipt.child,networkDenial:receipt.networkDenial,accounting:receipt.accounting})),createPublicKey(publicKey),Buffer.from(String(receipt.signature),'base64'))) throw new Error(`parent usage sidecar receipt signature is invalid for ${source.kind}`); if (receipt.identity!==signed.identity || canonical(receipt.source)!==canonical(source) || canonical(receipt.child)!==canonical(execution) || receipt.networkDenial?.denied!==true || receipt.networkDenial.receipt!==digest({source,child:execution,denied:true}) || receipt.accounting?.receipt!==digest({source,child:execution,tokens:receipt.accounting?.tokens,usd:receipt.accounting?.usd})) throw new Error(`parent usage sidecar did not provide bound offline network-denial/accounting evidence for ${source.kind}`); executionReceipts.set(`${processExecutionKey(source)}:${execution.pid}`,Object.freeze(receipt as Record<string,unknown>)); const telemetry=usage(receipt.accounting,`parent usage sidecar ${source.kind}`); if (telemetry.tokens!==0 || telemetry.usd!==0) throw new Error(`${source.kind} attempted metered resource usage`); return telemetry; }
if(process.argv[1]?.endsWith('run-harness-v2.ts')){const path=process.argv[2];if(!path)throw new Error('usage: run-harness-v2 <input.json>');const input=JSON.parse(readFileSync(path,'utf8')) as CliInput;if(!input.hostCommand||!input.browserCommand||!input.reviewerCommands?.length||!input.evidenceRoot||!input.usageSidecarCommand)throw new Error('CLI input requires host, browser, reviewers, evidence root, and parent usage sidecar');const evidenceSnapshot=validateEvidenceLock(input.evidenceRoot,input.evidenceLock);processExecutions.clear();executionReceipts.clear();processUsageSource=undefined;const e5Entry=input.evidenceLock.entries.find(entry=>entry.id==='E5'),e13Entry=input.evidenceLock.entries.find(entry=>entry.id==='E13');if(!e5Entry||!e13Entry)throw new Error('missing signed E5/E13');const e5=readEvidenceSnapshotPayload(evidenceSnapshot,'E5') as {runnerId:string;hostIdentity:string;observerIdentity:string;host:SignedProcess;browser:SignedProcess;reviewers:({laneId:string;raterId:string}&SignedProcess)[]};const signedObserver=signedObserverAuthority(e5,readEvidenceSnapshotPayload(evidenceSnapshot,'E13'));if(e5.observerIdentity!==signedObserver.identity)throw new Error('signed E5 observer identity does not match observer executable authority');pinProcess(input.usageSidecarCommand,input.usageSidecarArgs??[],signedObserver,'usage sidecar');processUsageSource=source=>sidecarUsage(input.usageSidecarCommand,input.usageSidecarArgs??[],signedObserver,source);const prepared=prepareHarnessV2(input.developmentCorpus,input.developmentRouteMap,input.holdouts,input.projectionSalt);const reviewerLanes:ReviewerLane[]=input.reviewerCommands.map(reviewer=>{const signed=e5.reviewers.find(candidate=>candidate.laneId===reviewer.laneId&&candidate.raterId===reviewer.raterId);if(!signed)throw new Error('reviewer is not authorized by signed E5');const args=reviewer.args??[];pinProcess(reviewer.command,args,signed,`reviewer ${reviewer.laneId}`);const executableSha256=executableIdentity(reviewer.command),configIdentity=digest(args),sessionId=`${e5.runnerId}:${reviewer.laneId}`;return{laneId:reviewer.laneId,raterId:reviewer.raterId,session:{sessionId,executableSha256,processIdentity:digest({executableSha256,configIdentity,sessionId}),configIdentity,handshake:digest({runnerId:e5.runnerId,executableSha256,configIdentity,sessionId})},review(brief,build,browser){const child=spawnSync(reviewer.command,args,{cwd:tmpdir(),env:{PATH:process.env.PATH??''},input:JSON.stringify({brief,build:{...build,artifactBytes:Buffer.from(build.artifactBytes).toString('base64')},browser:{...browser,observationBytes:Buffer.from(browser.observationBytes).toString('base64')}}),encoding:'utf8',timeout:60_000,maxBuffer:1_048_576});if(child.error||child.status!==0)throw new Error('reviewer lane failed');const output=JSON.parse(subprocessText(child.stdout)) as {vote:unknown};if(output.vote!=='one'&&output.vote!=='none'&&output.vote!=='abstain')throw new Error('reviewer response is invalid');recordProcessExecution({runnerId:e5.runnerId,hostIdentity:e5.hostIdentity,kind:'reviewer',laneId:reviewer.laneId,sessionId},reviewer.command,args,child);return {vote:output.vote};}};});const usageObserver=issueE5E13PinnedUsageObserver(signedObserver.identity, source => { const observed=processUsageSource?.(source); if (!observed) throw new Error('CLI usage observer did not observe a subprocess'); return observed; });process.stdout.write(`${JSON.stringify(runHarnessV2({...prepared,host:commandHost(input.hostCommand,input.hostArgs??[],e5.host,e5.hostIdentity,e5.runnerId),browser:commandBrowser(input.browserCommand,input.browserArgs??[],e5.browser,e5.runnerId,e5.hostIdentity),reviewerLanes,usageObserver,evidenceRoot:input.evidenceRoot,evidenceLock:input.evidenceLock,evidenceSnapshot,budget:input.budget}))}\n`);}
