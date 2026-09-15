import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import {
  validateBrowserObservationArtifacts,
  validateBrowserObservationDecisionLinks,
  type BrowserObservationSet,
} from './browser-observation.ts';
import {
  requireFinalReviewerLaneAuthorization,
  type ProjectRunInvocation,
} from './invocation.ts';
import { observationV2Sha256, validateObservationV2, type ObservationV2 } from './observation.ts';
import {
  productionRepairReviewBytes,
  validateCommittedProductionRepairScope,
} from './production-repair.ts';
import {
  acquireProjectMutationLock,
  replaceProjectFileAtomically,
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from './project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import {
  parseTrustedBrowserReceipt,
  trustedBrowserReceiptSha256,
  type TrustedBrowserReceipt,
} from './trusted-browser-receipt.ts';

const SHA256 = /^[a-f0-9]{64}$/;
const OBSERVATION_POINTER_PATH = '.omd/observation-v2.json';
const CHECKPOINT_POINTER_PATH = '.omd/refinement-checkpoint.json';
const DESKTOP = Object.freeze({ width: 1280, height: 900, viewport: 'desktop' as const });
const MOBILE = Object.freeze({ width: 390, height: 844, viewport: 'mobile' as const });
const fs = nodeStableProjectFileSystem();

export type RenderedRefinementErrorCode =
  | 'REFINEMENT_OBSERVATIONS_REQUIRED'
  | 'REFINEMENT_OBSERVATION_STALE'
  | 'REFINEMENT_TRUSTED_RECEIPT_STALE'
  | 'REFINEMENT_CAPTURE_STALE'
  | 'REFINEMENT_VIEWPORTS_INCOMPLETE'
  | 'REFINEMENT_REQUIRED_GATE_RED'
  | 'REFINEMENT_ROUTE_STALE'
  | 'REFINEMENT_REPAIR_REQUIRED'
  | 'REFINEMENT_REVIEW_INVALID'
  | 'REFINEMENT_REVIEW_STALE'
  | 'REFINEMENT_PAIR_ALREADY_DECIDED'
  | 'REFINEMENT_CHECKPOINT_STALE';

export class RenderedRefinementError extends Error {
  readonly code: RenderedRefinementErrorCode;

  constructor(code: RenderedRefinementErrorCode) {
    super(code);
    this.name = 'RenderedRefinementError';
    this.code = code;
  }
}

export type RenderedRefinementCapture = Readonly<{
  viewport: 'desktop' | 'mobile';
  width: number;
  height: number;
  path: string;
  sha256: string;
  outcomeRef: string;
}>;

/** Host-owned neutral task used for every anonymous refinement Eye. */
export const RENDERED_REFINEMENT_REVIEWER_TASK = [
  'Compare the two anonymous rendered variants using only the supplied evidence.',
  'Judge hierarchy, legibility, spatial rhythm, task clarity, and visible finish across every supplied viewport and outcome.',
  'Do not infer chronology or implementation details. Return exactly the embedded output contract.',
].join(' ');

export type RenderedRefinementEvidence = Readonly<{
  schema: 'adaptive-rendered-refinement-evidence-v1';
  routeSha256: string;
  buildSha256: string;
  productionPath: string;
  productionRepairOutcomeSha256: string;
  before: Readonly<{
    observationSha256: string;
    productionRevisionSha256: string;
    captures: readonly RenderedRefinementCapture[];
    observedGates: Readonly<{ task: 'pass' | 'fail'; accessibility: 'pass' | 'fail'; safety: 'pass' | 'fail' }>;
  }>;
  after: Readonly<{
    observationSha256: string;
    productionRevisionSha256: string;
    captures: readonly RenderedRefinementCapture[];
    observedGates: Readonly<{ task: 'pass'; accessibility: 'pass'; safety: 'pass' }>;
  }>;
  requiredGates: Readonly<{
    task: 'pass';
    accessibility: 'pass';
    safety: 'pass';
  }>;
  evidenceSha256: string;
}>;

export type RenderedRefinementStatus = 'improve' | 'regress' | 'reframe' | 'plateau' | 'preserved';
export type RenderedRefinementWinner = 'after' | 'before' | 'tie' | 'disagreement';
export type RenderedRefinementCheckpoint = Readonly<{
  schema: 'adaptive-rendered-refinement-checkpoint-v1';
  status: RenderedRefinementStatus;
  comparison: RenderedRefinementWinner;
  action: 'continue' | 'complete' | 'rollback' | 'stop';
  countsRound: true;
  beforeObservationSha256: string;
  afterObservationSha256: string;
  evidenceSha256: string;
  reviewSha256: string;
  productionRepairOutcomeSha256: string;
  target: string | null;
  remainingCriteria: readonly string[];
  previousCheckpointSha256: string | null;
}>;

type ObservationRecord = Readonly<{
  sha256: string;
  observation: ObservationV2;
  receipt: TrustedBrowserReceipt;
  browser: BrowserObservationSet;
  captures: readonly RenderedRefinementCapture[];
}>;

type RefinementReview = Readonly<{
  schema: 'adaptive-refinement-review-v1';
  winnerAlias: string | 'tie' | 'disagreement';
  evidenceSha256: string;
  transportSha256: string;
  routeSha256: string;
  buildSha256: string;
  briefSha256: string;
  remainingCriteria: readonly string[];
  votes: readonly Readonly<{
    reviewerId: string;
    winnerAlias: string | 'tie';
    remainingCriteria: readonly string[];
    findings: readonly string[];
  }>[];
  quorum: Readonly<{ required: 2; passed: 2 }>;
  provenance: Readonly<{ reviewerIds: readonly string[]; reviewerSessionSha256: string }>;
  executionReceipts: readonly Readonly<{ path: string; sha256: string }>[];
}>;

type PreviousCheckpoint = Readonly<{ sha256: string; value: RenderedRefinementCheckpoint }>;

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const checkpointPath = (sha256: string): string => `.omd/refinement/checkpoints/sha256-${sha256}.json`;
const variantAlias = (observationSha256: string): string => `variant-${hash(`rendered-refinement\0${observationSha256}`).slice(0, 16)}`;

function fail(code: RenderedRefinementErrorCode): never {
  throw new RenderedRefinementError(code);
}

function exact(value: unknown, keys: readonly string[], code: RenderedRefinementErrorCode): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
  const item = value as Record<string, unknown>;
  const own = Reflect.ownKeys(item);
  if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key))) fail(code);
  return item;
}

function digest(value: unknown, code: RenderedRefinementErrorCode): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function safePath(value: unknown, code: RenderedRefinementErrorCode): string {
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\')
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(code);
  return value;
}

function stableRead(
  root: string,
  path: string,
  label: string,
  code: RenderedRefinementErrorCode = 'REFINEMENT_OBSERVATION_STALE',
): Buffer {
  try {
    const target = resolve(root, path);
    const rel = relative(realpathSync(root), target);
    if (rel === '' || rel.startsWith('..') || rel.includes('\\')) fail(code);
    return readStableProjectFile({ root, path: target, label, fs });
  } catch (error) {
    if (error instanceof RenderedRefinementError) throw error;
    return fail(code);
  }
}

function json(bytes: Buffer, code: RenderedRefinementErrorCode): unknown {
  try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { return fail(code); }
}

function observationAt(root: string, sha256: string): Readonly<{ sha256: string; observation: ObservationV2 }> {
  const path = `.omd/observation-v2/sha256-${sha256}.json`;
  const bytes = stableRead(root, path, 'rendered refinement observation');
  let observation: ObservationV2;
  try { observation = validateObservationV2(json(bytes, 'REFINEMENT_OBSERVATION_STALE')); }
  catch { return fail('REFINEMENT_OBSERVATION_STALE'); }
  if (hash(bytes) !== sha256 || observationV2Sha256(observation) !== sha256
    || !bytes.equals(Buffer.from(`${canonicalJson(observation)}\n`))) fail('REFINEMENT_OBSERVATION_STALE');
  return Object.freeze({ sha256, observation });
}

function currentObservationPair(root: string): readonly [
  Readonly<{ sha256: string; observation: ObservationV2 }>,
  Readonly<{ sha256: string; observation: ObservationV2 }>,
] {
  let pointerBytes: Buffer;
  try { pointerBytes = stableRead(root, OBSERVATION_POINTER_PATH, 'rendered refinement observation pointer'); }
  catch { return fail('REFINEMENT_OBSERVATIONS_REQUIRED'); }
  const pointer = exact(json(pointerBytes, 'REFINEMENT_OBSERVATION_STALE'), ['schema', 'record', 'sha256'], 'REFINEMENT_OBSERVATION_STALE');
  const afterSha256 = digest(pointer.sha256, 'REFINEMENT_OBSERVATION_STALE');
  if (pointer.schema !== 'observation-v2-pointer'
    || pointer.record !== `.omd/observation-v2/sha256-${afterSha256}.json`) fail('REFINEMENT_OBSERVATION_STALE');
  const after = observationAt(root, afterSha256);
  const beforeSha256 = after.observation.predecessorSha256;
  if (beforeSha256 === null) fail('REFINEMENT_OBSERVATIONS_REQUIRED');
  const before = observationAt(root, beforeSha256);
  return Object.freeze([before, after]);
}

function evidenceRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('REFINEMENT_TRUSTED_RECEIPT_STALE');
  }
  return value as Record<string, unknown>;
}

function requiredViewport(width: number, height: number): 'desktop' | 'mobile' | undefined {
  if (width === DESKTOP.width && height === DESKTOP.height) return DESKTOP.viewport;
  if (width === MOBILE.width && height === MOBILE.height) return MOBILE.viewport;
  return undefined;
}

function trustedObservation(
  root: string,
  value: Readonly<{ sha256: string; observation: ObservationV2 }>,
  currentDecisionGraphBytes: Buffer,
  routeSha256: string,
  sourceContractSha256: string,
  buildSha256: string,
  requirePassingGates: boolean,
  requireCurrentDecisionGraph: boolean,
): ObservationRecord {
  const evidence = evidenceRecord(value.observation.evidence);
  const trusted = evidenceRecord(evidence.trustedOutcome);
  const receiptSha256 = digest(trusted.receiptSha256, 'REFINEMENT_TRUSTED_RECEIPT_STALE');
  const receiptPath = `.omd/trusted-browser-receipt-sha256-${receiptSha256}.json`;
  const receiptBytes = stableRead(root, receiptPath, 'rendered refinement trusted browser receipt');
  let receipt: TrustedBrowserReceipt;
  try { receipt = parseTrustedBrowserReceipt(json(receiptBytes, 'REFINEMENT_TRUSTED_RECEIPT_STALE')); }
  catch { return fail('REFINEMENT_TRUSTED_RECEIPT_STALE'); }
  const decisionGraphBytes = requireCurrentDecisionGraph
    ? currentDecisionGraphBytes
    : stableRead(
      root,
      `.omd/decision-graphs/sha256-${receipt.decisionGraphSha256}.json`,
      'rendered refinement historical decision graph',
      'REFINEMENT_TRUSTED_RECEIPT_STALE',
    );
  if (trustedBrowserReceiptSha256(receipt) !== receiptSha256
    || !receiptBytes.equals(Buffer.from(`${canonicalJson(receipt)}\n`))
    || trusted.schema !== 'trusted-outcome-observation-v1'
    || value.observation.buildSha256 !== buildSha256
    || receipt.activationBuildSha256 !== buildSha256
    || trusted.activationBuildSha256 !== receipt.activationBuildSha256
    || receipt.routeSha256 !== routeSha256
    || receipt.routeSha256 !== trusted.routeSha256
    || receipt.sourceContractSha256 !== sourceContractSha256
    || trusted.sourceContractSha256 !== receipt.sourceContractSha256
    || receipt.productionRevisionSha256 !== trusted.productionRevisionSha256
    || receipt.decisionGraphSha256 !== hash(decisionGraphBytes)
    || !Array.isArray(trusted.outcomeResults)
    || canonicalJson((trusted.outcomeResults as readonly Record<string, unknown>[]).map(({ outcomeRef, status }) => ({ outcomeRef, status })))
      !== canonicalJson(receipt.outcomeResults.map(({ outcomeRef, status }) => ({ outcomeRef, status })))
    || canonicalJson(trusted.confirmedClaimRefs) !== canonicalJson(receipt.confirmedClaimRefs)
    || canonicalJson(trusted.decisionRefs) !== canonicalJson(receipt.decisionRefs)
    || canonicalJson(trusted.hardFloors) !== canonicalJson(receipt.hardFloors)
    || canonicalJson(trusted.captureSha256s) !== canonicalJson(receipt.captures.map(({ sha256 }) => sha256))
    || trusted.transcriptSha256 !== hash(Buffer.from(canonicalJson(receipt.transcript)))
    || canonicalJson(trusted.entrySurface) !== canonicalJson(receipt.entrySurface)) {
    fail('REFINEMENT_TRUSTED_RECEIPT_STALE');
  }
  if (requirePassingGates && (receipt.outcomeResults.some((outcome) => outcome.status !== 'pass')
    || receipt.hardFloors.behavior !== 'pass'
    || receipt.hardFloors.access !== 'pass'
    || receipt.hardFloors.safety !== 'pass'
    || receipt.entrySurface?.status === 'fail')) fail('REFINEMENT_REQUIRED_GATE_RED');
  let browser: BrowserObservationSet;
  try {
    browser = validateBrowserObservationDecisionLinks(evidence, decisionGraphBytes, true)!;
    validateBrowserObservationArtifacts(browser, (path) => stableRead(root, path, 'rendered refinement capture'), true);
  } catch { return fail('REFINEMENT_CAPTURE_STALE'); }
  const byPath = new Map(browser.observations.map((observation) => [
    observation.observableResult.capture.path,
    observation,
  ]));
  const captures = receipt.captures.map((capture) => {
    const observation = byPath.get(capture.path);
    const viewport = requiredViewport(capture.width, capture.height);
    if (observation === undefined || viewport === undefined || capture.outcomeRef === undefined
      || !capture.path.endsWith(`sha256-${capture.sha256}.png`)
      || observation.observableResult.capture.sha256 !== capture.sha256
      || observation.viewport.width !== capture.width || observation.viewport.height !== capture.height) {
      return fail('REFINEMENT_CAPTURE_STALE');
    }
    return Object.freeze({
      viewport,
      width: capture.width,
      height: capture.height,
      path: capture.path,
      sha256: capture.sha256,
      outcomeRef: capture.outcomeRef,
    });
  }).sort((left, right) => left.outcomeRef.localeCompare(right.outcomeRef)
    || left.viewport.localeCompare(right.viewport) || left.sha256.localeCompare(right.sha256));
  if (captures.length !== browser.observations.length
    || receipt.outcomeResults.some(({ outcomeRef }) => {
      const viewports = new Set(captures
        .filter((capture) => capture.outcomeRef === outcomeRef)
        .map(({ viewport }) => viewport));
      return viewports.size !== 2 || !viewports.has('desktop') || !viewports.has('mobile');
    })
    || captures.some(({ outcomeRef }) => !receipt.outcomeResults.some((outcome) => outcome.outcomeRef === outcomeRef))) {
    fail('REFINEMENT_VIEWPORTS_INCOMPLETE');
  }
  return Object.freeze({ ...value, receipt, browser, captures: Object.freeze(captures) });
}

function repairOutcome(
  root: string,
  invocation: ProjectRunInvocation,
  beforeSha256: string,
  routeSha256: string,
): Readonly<{ sha256: string; value: Record<string, unknown> }> {
  const directory = resolve(root, '.omd/production-repairs');
  if (!existsSync(directory)) fail('REFINEMENT_REPAIR_REQUIRED');
  const metadata = lstatSync(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('REFINEMENT_REPAIR_REQUIRED');
  const matches: Array<Readonly<{ sha256: string; value: Record<string, unknown> }>> = [];
  for (const name of readdirSync(directory).sort()) {
    const match = /^sha256-([a-f0-9]{64})\.json$/.exec(name);
    if (match === null) continue;
    const bytes = stableRead(root, `.omd/production-repairs/${name}`, 'rendered refinement repair outcome', 'REFINEMENT_REPAIR_REQUIRED');
    if (hash(bytes) !== match[1]) fail('REFINEMENT_REPAIR_REQUIRED');
    const item = exact(json(bytes, 'REFINEMENT_REPAIR_REQUIRED'), [
      'schema', 'outcome', 'path', 'beforeTreeSha256', 'afterTreeSha256', 'routeSha256',
      'sliceSha256', 'reviewSha256', 'predecessorSha256', 'mode',
    ], 'REFINEMENT_REPAIR_REQUIRED');
    if (item.schema !== 'omd-production-repair-outcome-v3' || item.outcome !== 'committed') fail('REFINEMENT_REPAIR_REQUIRED');
    if (item.predecessorSha256 !== beforeSha256 || item.routeSha256 !== routeSha256) continue;
    const path = safePath(item.path, 'REFINEMENT_REPAIR_REQUIRED');
    if (!Number.isInteger(item.mode) || (item.mode as number) < 0 || (item.mode as number) > 0o777) {
      fail('REFINEMENT_REPAIR_REQUIRED');
    }
    const beforeTreeSha256 = digest(item.beforeTreeSha256, 'REFINEMENT_REPAIR_REQUIRED');
    const afterTreeSha256 = digest(item.afterTreeSha256, 'REFINEMENT_REPAIR_REQUIRED');
    const sliceSha256 = digest(item.sliceSha256, 'REFINEMENT_REPAIR_REQUIRED');
    try {
      validateCommittedProductionRepairScope({
        root, invocation, routeSha256, sliceSha256, path, beforeTreeSha256,
      });
    } catch { continue; }
    if (hash(stableRead(root, `.omd/production-repair-blobs/sha256-${beforeTreeSha256}.bin`, 'rendered refinement before blob', 'REFINEMENT_REPAIR_REQUIRED')) !== beforeTreeSha256
      || hash(stableRead(root, `.omd/production-repair-blobs/sha256-${afterTreeSha256}.bin`, 'rendered refinement after blob', 'REFINEMENT_REPAIR_REQUIRED')) !== afterTreeSha256) continue;
    if (hash(stableRead(root, path, 'rendered refinement repaired source', 'REFINEMENT_REPAIR_REQUIRED')) !== afterTreeSha256) continue;
    const reviewSha256 = digest(item.reviewSha256, 'REFINEMENT_REPAIR_REQUIRED');
    const reviewBytes = stableRead(root, `.omd/final-review/repairs/sha256-${reviewSha256}.json`, 'rendered refinement repair review', 'REFINEMENT_REPAIR_REQUIRED');
    if (hash(reviewBytes) !== reviewSha256) fail('REFINEMENT_REPAIR_REQUIRED');
    let review: Record<string, unknown>;
    try {
      review = exact(json(reviewBytes, 'REFINEMENT_REPAIR_REQUIRED'), [
        'schema', 'observationPointerSha256', 'retentionPointerSha256', 'beforeSha256',
        'afterSha256', 'suggestedPaths', 'findingIds',
      ], 'REFINEMENT_REPAIR_REQUIRED');
      if (!reviewBytes.equals(productionRepairReviewBytes(review))) fail('REFINEMENT_REPAIR_REQUIRED');
    } catch { return fail('REFINEMENT_REPAIR_REQUIRED'); }
    const predecessorPointer = Buffer.from(`${canonicalJson({
      schema: 'observation-v2-pointer',
      record: `.omd/observation-v2/sha256-${beforeSha256}.json`,
      sha256: beforeSha256,
    })}\n`);
    if (review.beforeSha256 !== beforeTreeSha256 || review.afterSha256 !== afterTreeSha256
      || review.observationPointerSha256 !== hash(predecessorPointer)
      || !Array.isArray(review.suggestedPaths) || !review.suggestedPaths.includes(path)) continue;
    requireFinalReviewerLaneAuthorization(invocation, root, reviewBytes);
    matches.push(Object.freeze({ sha256: match[1]!, value: item }));
  }
  if (matches.length !== 1) fail('REFINEMENT_REPAIR_REQUIRED');
  return matches[0]!;
}

/**
 * Resolves one immediate before/after production-repair pair from trusted browser observations.
 * Every returned capture has been re-read, hash checked, decoded, and matched to a canonical
 * desktop/mobile viewport. Required task, accessibility, safety, and entry gates are conjunctive.
 */
function resolveRenderedRefinementEvidence(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
}>): Readonly<{ evidence: RenderedRefinementEvidence; reviewerPacket: Buffer }> {
  const root = realpathSync(input.root);
  const route = readPersistedRoute(root, input.invocation);
  const routeSha256 = adaptiveRouteRecordSha256(route);
  const decisionGraphBytes = stableRead(root, '.omd/decision-graph.json', 'rendered refinement decision graph');
  const [beforeValue, afterValue] = currentObservationPair(root);
  const before = trustedObservation(
    root, beforeValue, decisionGraphBytes, routeSha256, route.sourceContractSha256,
    input.invocation.current.buildSha256, false,
    false,
  );
  const after = trustedObservation(
    root, afterValue, decisionGraphBytes, routeSha256, route.sourceContractSha256,
    input.invocation.current.buildSha256, true,
    true,
  );
  if (canonicalJson(before.receipt.outcomeResults.map(({ outcomeRef }) => outcomeRef).sort())
    !== canonicalJson(after.receipt.outcomeResults.map(({ outcomeRef }) => outcomeRef).sort())) {
    fail('REFINEMENT_ROUTE_STALE');
  }
  if (before.receipt.productionPath !== after.receipt.productionPath) fail('REFINEMENT_ROUTE_STALE');
  if (servedProjectTreeSha256(root, after.receipt.productionPath) !== after.receipt.productionRevisionSha256) {
    fail('REFINEMENT_OBSERVATION_STALE');
  }
  const repair = repairOutcome(root, input.invocation, before.sha256, routeSha256);
  const core = {
    schema: 'adaptive-rendered-refinement-evidence-v1' as const,
    routeSha256,
    buildSha256: input.invocation.current.buildSha256,
    productionPath: after.receipt.productionPath,
    productionRepairOutcomeSha256: repair.sha256,
    before: Object.freeze({
      observationSha256: before.sha256,
      productionRevisionSha256: before.receipt.productionRevisionSha256,
      captures: before.captures,
      observedGates: Object.freeze({
        task: before.receipt.outcomeResults.every((outcome) => outcome.status === 'pass')
          && before.receipt.hardFloors.behavior === 'pass'
          && before.receipt.entrySurface?.status !== 'fail' ? 'pass' as const : 'fail' as const,
        accessibility: before.receipt.hardFloors.access,
        safety: before.receipt.hardFloors.safety,
      }),
    }),
    after: Object.freeze({
      observationSha256: after.sha256,
      productionRevisionSha256: after.receipt.productionRevisionSha256,
      captures: after.captures,
      observedGates: Object.freeze({ task: 'pass' as const, accessibility: 'pass' as const, safety: 'pass' as const }),
    }),
    requiredGates: Object.freeze({ task: 'pass' as const, accessibility: 'pass' as const, safety: 'pass' as const }),
  };
  const reviewerEvidence = {
    schema: 'adaptive-rendered-refinement-reviewer-packet-v1',
    routeSha256: core.routeSha256,
    buildSha256: core.buildSha256,
    variants: [core.before, core.after].map((variant) => ({
      alias: variantAlias(variant.observationSha256),
      renders: variant.captures.map((capture) => ({
          viewport: capture.viewport,
          width: capture.width,
          height: capture.height,
          outcomeRef: capture.outcomeRef,
          sha256: capture.sha256,
          pngBase64: stableRead(root, capture.path, 'rendered refinement reviewer packet capture').toString('base64'),
        })),
    })).sort((left, right) => left.alias.localeCompare(right.alias)),
  };
  const evidenceSha256 = hash(Buffer.from(canonicalJson(reviewerEvidence)));
  const reviewerPacket = Buffer.from(`${canonicalJson({
    schema: 'adaptive-rendered-refinement-reviewer-transport-v1',
    evidenceSha256,
    evidence: reviewerEvidence,
    outputContract: {
      schema: 'adaptive-refinement-reviewer-handback-v1',
      allowedWinnerAliases: [
        variantAlias(core.before.observationSha256),
        variantAlias(core.after.observationSha256),
        'tie',
      ].sort(),
      fixedBindings: {
        evidenceSha256,
        routeSha256: core.routeSha256,
        buildSha256: core.buildSha256,
        briefSha256: input.invocation.current.briefSha256,
      },
      reviewerFields: ['winnerAlias', 'remainingCriteria', 'findings'],
    },
  })}\n`);
  const evidence = Object.freeze({ ...core, evidenceSha256 });
  return Object.freeze({ evidence, reviewerPacket });
}

export function inspectRenderedRefinementEvidence(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
}>): RenderedRefinementEvidence {
  return resolveRenderedRefinementEvidence(input).evidence;
}

/** Opaque, source-free packet for the existing one-use isolated reviewer evidence transport. */
export function renderedRefinementReviewerPacket(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
}>): Buffer {
  return resolveRenderedRefinementEvidence(input).reviewerPacket;
}

export function publishRenderedRefinementReviewerPacket(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  writer: ProjectWriteAdapter;
}>): Readonly<{ path: string; sha256: string; evidenceSha256: string }> {
  const root = realpathSync(input.root);
  requireProjectWriteAdapterForInvocation(root, input.writer, input.invocation);
  const release = acquireProjectMutationLock(root, input.invocation);
  try {
    const resolved = resolveRenderedRefinementEvidence({ root, invocation: input.invocation });
    const sha256 = hash(resolved.reviewerPacket);
    const path = `.omd/refinement/reviewer-packets/sha256-${sha256}.json`;
    input.writer.writeContentAddressed(path, resolved.reviewerPacket);
    return Object.freeze({ path, sha256, evidenceSha256: resolved.evidence.evidenceSha256 });
  } finally {
    release();
  }
}

function strings(value: unknown, allowEmpty: boolean, code: RenderedRefinementErrorCode): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.some((item) => typeof item !== 'string' || item.trim() === '' || item.length > 4096)
    || new Set(value).size !== value.length) fail(code);
  return Object.freeze([...value]) as readonly string[];
}

function refinementReview(root: string, pathValue: string): Readonly<{ sha256: string; bytes: Buffer; value: RefinementReview }> {
  const path = safePath(pathValue, 'REFINEMENT_REVIEW_INVALID');
  const match = /^\.omd\/final-review\/refinements\/sha256-([a-f0-9]{64})\.json$/.exec(path);
  if (match === null) fail('REFINEMENT_REVIEW_INVALID');
  const bytes = stableRead(root, path, 'rendered refinement quorum review', 'REFINEMENT_REVIEW_INVALID');
  const sha256 = match[1]!;
  if (hash(bytes) !== sha256) fail('REFINEMENT_REVIEW_INVALID');
  const item = exact(json(bytes, 'REFINEMENT_REVIEW_INVALID'), [
    'schema', 'winnerAlias', 'evidenceSha256', 'transportSha256',
    'routeSha256', 'buildSha256', 'briefSha256', 'remainingCriteria', 'votes', 'quorum',
    'provenance', 'executionReceipts',
  ], 'REFINEMENT_REVIEW_INVALID');
  if (item.schema !== 'adaptive-refinement-review-v1'
    || (item.winnerAlias !== 'tie' && item.winnerAlias !== 'disagreement'
      && (typeof item.winnerAlias !== 'string' || !/^variant-[a-f0-9]{16}$/.test(item.winnerAlias)))) fail('REFINEMENT_REVIEW_INVALID');
  const quorum = exact(item.quorum, ['required', 'passed'], 'REFINEMENT_REVIEW_INVALID');
  if (quorum.required !== 2 || quorum.passed !== 2) fail('REFINEMENT_REVIEW_INVALID');
  const provenance = exact(item.provenance, ['reviewerIds', 'reviewerSessionSha256'], 'REFINEMENT_REVIEW_INVALID');
  const reviewerIds = strings(provenance.reviewerIds, false, 'REFINEMENT_REVIEW_INVALID');
  if (reviewerIds.length !== 2) fail('REFINEMENT_REVIEW_INVALID');
  const votes = Array.isArray(item.votes) ? item.votes.map((value) => {
    const vote = exact(value, ['reviewerId', 'winnerAlias', 'remainingCriteria', 'findings'], 'REFINEMENT_REVIEW_INVALID');
    if (typeof vote.reviewerId !== 'string' || !reviewerIds.includes(vote.reviewerId)
      || (vote.winnerAlias !== 'tie'
        && (typeof vote.winnerAlias !== 'string' || !/^variant-[a-f0-9]{16}$/.test(vote.winnerAlias)))) fail('REFINEMENT_REVIEW_INVALID');
    return Object.freeze({
      reviewerId: vote.reviewerId,
      winnerAlias: vote.winnerAlias as string | 'tie',
      remainingCriteria: strings(vote.remainingCriteria, true, 'REFINEMENT_REVIEW_INVALID'),
      findings: strings(vote.findings, true, 'REFINEMENT_REVIEW_INVALID'),
    });
  }) : fail('REFINEMENT_REVIEW_INVALID');
  if (votes.length !== 2 || new Set(votes.map((vote) => vote.reviewerId)).size !== 2
    || votes.some((vote) => !reviewerIds.includes(vote.reviewerId))) fail('REFINEMENT_REVIEW_INVALID');
  const aggregateWinner = votes[0]!.winnerAlias === votes[1]!.winnerAlias ? votes[0]!.winnerAlias : 'disagreement';
  const aggregateCriteria = [...new Set(votes.flatMap((vote) => vote.remainingCriteria))];
  if (item.winnerAlias !== aggregateWinner
    || canonicalJson(item.remainingCriteria) !== canonicalJson(aggregateCriteria)) fail('REFINEMENT_REVIEW_INVALID');
  const receipts = Array.isArray(item.executionReceipts) ? item.executionReceipts.map((value) => {
    const receipt = exact(value, ['path', 'sha256'], 'REFINEMENT_REVIEW_INVALID');
    return Object.freeze({
      path: safePath(receipt.path, 'REFINEMENT_REVIEW_INVALID'),
      sha256: digest(receipt.sha256, 'REFINEMENT_REVIEW_INVALID'),
    });
  }) : fail('REFINEMENT_REVIEW_INVALID');
  if (receipts.length !== 2) fail('REFINEMENT_REVIEW_INVALID');
  for (const receipt of receipts) {
    if (!receipt.path.startsWith('.omd/final-review/refinement-executions/sha256-')
      || hash(stableRead(root, receipt.path, 'rendered refinement reviewer execution', 'REFINEMENT_REVIEW_INVALID')) !== receipt.sha256
      || !receipt.path.endsWith(`sha256-${receipt.sha256}.json`)) fail('REFINEMENT_REVIEW_INVALID');
  }
  const value: RefinementReview = Object.freeze({
    schema: 'adaptive-refinement-review-v1',
    winnerAlias: item.winnerAlias as RefinementReview['winnerAlias'],
    evidenceSha256: digest(item.evidenceSha256, 'REFINEMENT_REVIEW_INVALID'),
    transportSha256: digest(item.transportSha256, 'REFINEMENT_REVIEW_INVALID'),
    routeSha256: digest(item.routeSha256, 'REFINEMENT_REVIEW_INVALID'),
    buildSha256: digest(item.buildSha256, 'REFINEMENT_REVIEW_INVALID'),
    briefSha256: digest(item.briefSha256, 'REFINEMENT_REVIEW_INVALID'),
    remainingCriteria: strings(item.remainingCriteria, true, 'REFINEMENT_REVIEW_INVALID'),
    votes: Object.freeze(votes),
    quorum: Object.freeze({ required: 2, passed: 2 }),
    provenance: Object.freeze({ reviewerIds, reviewerSessionSha256: digest(provenance.reviewerSessionSha256, 'REFINEMENT_REVIEW_INVALID') }),
    executionReceipts: Object.freeze(receipts),
  });
  return Object.freeze({ sha256, bytes, value });
}

function parseCheckpoint(value: unknown): RenderedRefinementCheckpoint {
  const item = exact(value, [
    'schema', 'status', 'action', 'countsRound', 'beforeObservationSha256', 'afterObservationSha256',
    'comparison', 'evidenceSha256', 'reviewSha256', 'productionRepairOutcomeSha256', 'target', 'remainingCriteria',
    'previousCheckpointSha256',
  ], 'REFINEMENT_CHECKPOINT_STALE');
  if (item.schema !== 'adaptive-rendered-refinement-checkpoint-v1'
    || !['improve', 'regress', 'reframe', 'plateau', 'preserved'].includes(String(item.status))
    || !['after', 'before', 'tie', 'disagreement'].includes(String(item.comparison))
    || !['continue', 'complete', 'rollback', 'stop'].includes(String(item.action))
    || item.countsRound !== true
    || (item.target !== null && (typeof item.target !== 'string' || item.target.trim() === ''))
    || (item.previousCheckpointSha256 !== null && (typeof item.previousCheckpointSha256 !== 'string' || !SHA256.test(item.previousCheckpointSha256)))) {
    fail('REFINEMENT_CHECKPOINT_STALE');
  }
  return Object.freeze({
    schema: 'adaptive-rendered-refinement-checkpoint-v1',
    status: item.status as RenderedRefinementStatus,
    comparison: item.comparison as RenderedRefinementWinner,
    action: item.action as RenderedRefinementCheckpoint['action'],
    countsRound: true,
    beforeObservationSha256: digest(item.beforeObservationSha256, 'REFINEMENT_CHECKPOINT_STALE'),
    afterObservationSha256: digest(item.afterObservationSha256, 'REFINEMENT_CHECKPOINT_STALE'),
    evidenceSha256: digest(item.evidenceSha256, 'REFINEMENT_CHECKPOINT_STALE'),
    reviewSha256: digest(item.reviewSha256, 'REFINEMENT_CHECKPOINT_STALE'),
    productionRepairOutcomeSha256: digest(item.productionRepairOutcomeSha256, 'REFINEMENT_CHECKPOINT_STALE'),
    target: item.target as string | null,
    remainingCriteria: strings(item.remainingCriteria, true, 'REFINEMENT_CHECKPOINT_STALE'),
    previousCheckpointSha256: item.previousCheckpointSha256 as string | null,
  });
}

function checkpointAt(root: string, sha256: string, seen = new Set<string>()): PreviousCheckpoint {
  if (seen.has(sha256)) fail('REFINEMENT_CHECKPOINT_STALE');
  seen.add(sha256);
  const record = stableRead(root, checkpointPath(sha256), 'rendered refinement checkpoint', 'REFINEMENT_CHECKPOINT_STALE');
  const value = parseCheckpoint(json(record, 'REFINEMENT_CHECKPOINT_STALE'));
  if (hash(record) !== sha256 || !record.equals(Buffer.from(`${canonicalJson(value)}\n`))) fail('REFINEMENT_CHECKPOINT_STALE');
  if (value.previousCheckpointSha256 !== null) {
    const prior = checkpointAt(root, value.previousCheckpointSha256, seen);
    const accepted = prior.value.action === 'rollback'
      ? prior.value.beforeObservationSha256 : prior.value.afterObservationSha256;
    if (accepted !== value.beforeObservationSha256) fail('REFINEMENT_CHECKPOINT_STALE');
  }
  return Object.freeze({ sha256, value });
}

function previousCheckpoint(root: string): PreviousCheckpoint | undefined {
  if (!existsSync(resolve(root, CHECKPOINT_POINTER_PATH))) return undefined;
  const bytes = stableRead(root, CHECKPOINT_POINTER_PATH, 'rendered refinement checkpoint pointer', 'REFINEMENT_CHECKPOINT_STALE');
  const pointer = exact(json(bytes, 'REFINEMENT_CHECKPOINT_STALE'), ['schema', 'record', 'sha256'], 'REFINEMENT_CHECKPOINT_STALE');
  const sha256 = digest(pointer.sha256, 'REFINEMENT_CHECKPOINT_STALE');
  if (pointer.schema !== 'adaptive-rendered-refinement-checkpoint-pointer-v1'
    || pointer.record !== checkpointPath(sha256)) fail('REFINEMENT_CHECKPOINT_STALE');
  return checkpointAt(root, sha256);
}

function decide(
  review: RefinementReview,
  evidence: RenderedRefinementEvidence,
  previous: PreviousCheckpoint | undefined,
  reviewSha256: string,
): RenderedRefinementCheckpoint {
  const beforeAlias = variantAlias(evidence.before.observationSha256);
  const afterAlias = variantAlias(evidence.after.observationSha256);
  const allowedAliases = new Set([beforeAlias, afterAlias, 'tie']);
  if (review.votes.some(({ winnerAlias }) => !allowedAliases.has(winnerAlias))) {
    fail('REFINEMENT_REVIEW_STALE');
  }
  const winner: RenderedRefinementWinner = review.winnerAlias === afterAlias
    ? 'after'
    : review.winnerAlias === beforeAlias
      ? 'before'
      : review.winnerAlias === 'tie' || review.winnerAlias === 'disagreement'
        ? review.winnerAlias
        : fail('REFINEMENT_REVIEW_STALE');
  const classified = classifyRenderedRefinement({
    winner,
    remainingCriteria: review.remainingCriteria,
    beforeObservationSha256: evidence.before.observationSha256,
    ...(previous === undefined ? {} : { previous: previous.value }),
  });
  return Object.freeze({
    schema: 'adaptive-rendered-refinement-checkpoint-v1',
    ...classified,
    comparison: winner,
    countsRound: true,
    beforeObservationSha256: evidence.before.observationSha256,
    afterObservationSha256: evidence.after.observationSha256,
    evidenceSha256: evidence.evidenceSha256,
    reviewSha256,
    productionRepairOutcomeSha256: evidence.productionRepairOutcomeSha256,
    remainingCriteria: review.remainingCriteria,
    previousCheckpointSha256: previous?.sha256 ?? null,
  });
}

/** Pure aggregation policy used after the trusted evidence/reviewer bindings have passed. */
export function classifyRenderedRefinement(input: Readonly<{
  winner: RenderedRefinementWinner;
  remainingCriteria: readonly string[];
  beforeObservationSha256: string;
  previous?: Pick<RenderedRefinementCheckpoint, 'status' | 'comparison' | 'afterObservationSha256' | 'target'>;
}>): Readonly<{
  status: RenderedRefinementStatus;
  action: RenderedRefinementCheckpoint['action'];
  target: string | null;
}> {
  const target = input.remainingCriteria[0] ?? null;
  const chainedTie = input.winner === 'tie' && target !== null
    && input.previous?.status === 'reframe'
    && input.previous.comparison === 'tie'
    && input.previous.afterObservationSha256 === input.beforeObservationSha256
    && input.previous.target === target;
  const status: RenderedRefinementStatus = input.winner === 'after'
    ? 'improve'
    : input.winner === 'before'
      ? 'regress'
      : input.winner === 'tie' && target === null
        ? 'preserved'
        : input.winner === 'tie' && chainedTie ? 'plateau' : 'reframe';
  const action: RenderedRefinementCheckpoint['action'] = status === 'regress'
    ? 'rollback'
    : status === 'plateau'
      ? 'stop'
      : status === 'preserved'
        ? 'complete'
      : status === 'improve' && target === null
        ? 'complete'
        : 'continue';
  return Object.freeze({ status, action, target });
}

/**
 * Commits one reviewer-authorized rendered refinement decision. Review prose or caller-provided
 * winner fields are never accepted here: `reviewPath` must name a host-authorized, content-addressed
 * two-Eye quorum artifact whose bindings match the freshly revalidated observation pair.
 */
export function commitRenderedRefinementCheckpoint(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  writer: ProjectWriteAdapter;
  reviewPath: string;
}>): RenderedRefinementCheckpoint {
  const root = realpathSync(input.root);
  requireProjectWriteAdapterForInvocation(root, input.writer, input.invocation);
  const release = acquireProjectMutationLock(root, input.invocation);
  try {
    const resolved = resolveRenderedRefinementEvidence({ root, invocation: input.invocation });
    const evidence = resolved.evidence;
    const review = refinementReview(root, input.reviewPath);
    requireFinalReviewerLaneAuthorization(input.invocation, root, review.bytes);
    if (review.value.evidenceSha256 !== evidence.evidenceSha256
      || review.value.transportSha256 !== hash(resolved.reviewerPacket)
      || review.value.routeSha256 !== evidence.routeSha256
      || review.value.buildSha256 !== input.invocation.current.buildSha256
      || review.value.briefSha256 !== input.invocation.current.briefSha256) fail('REFINEMENT_REVIEW_STALE');
    const previous = previousCheckpoint(root);
    if (previous?.value.beforeObservationSha256 === evidence.before.observationSha256
      && previous.value.afterObservationSha256 === evidence.after.observationSha256) {
      fail('REFINEMENT_PAIR_ALREADY_DECIDED');
    }
    if (previous !== undefined
      && (previous.value.action === 'rollback'
        ? previous.value.beforeObservationSha256 : previous.value.afterObservationSha256)
        !== evidence.before.observationSha256) {
      fail('REFINEMENT_CHECKPOINT_STALE');
    }
    const checkpoint = decide(review.value, evidence, previous, review.sha256);
    const bytes = Buffer.from(`${canonicalJson(checkpoint)}\n`);
    const sha256 = hash(bytes);
    input.writer.writeContentAddressed(checkpointPath(sha256), bytes);
    replaceProjectFileAtomically({
      projectRoot: root,
      invocation: input.invocation,
      relativePath: CHECKPOINT_POINTER_PATH,
      content: `${canonicalJson({
        schema: 'adaptive-rendered-refinement-checkpoint-pointer-v1',
        record: checkpointPath(sha256),
        sha256,
      })}\n`,
    });
    return checkpoint;
  } finally {
    release();
  }
}

export type CurrentRenderedRefinementRequirement =
  | Readonly<{ required: false; status: 'not-applicable' }>
  | Readonly<{ required: true; status: 'complete'; checkpointSha256: string; checkpoint: RenderedRefinementCheckpoint }>;

/**
 * Read-only terminal gate. A project with no committed production repair has no refinement
 * checkpoint obligation. Once a repair exists, the current trusted repair pair must have one
 * chain-current `complete` checkpoint; continue, stop, rollback, disagreement, deletion, or stale
 * observation/source/route bindings fail closed.
 */
export function validateCurrentRenderedRefinementCheckpoint(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
}>): CurrentRenderedRefinementRequirement {
  const root = realpathSync(input.root);
  const repairs = resolve(root, '.omd/production-repairs');
  const checkpointExists = existsSync(resolve(root, CHECKPOINT_POINTER_PATH));
  if (!existsSync(repairs)) {
    if (checkpointExists) fail('REFINEMENT_CHECKPOINT_STALE');
    return Object.freeze({ required: false, status: 'not-applicable' });
  }
  const metadata = lstatSync(repairs);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('REFINEMENT_CHECKPOINT_STALE');
  const repairNames = readdirSync(repairs).sort();
  if (repairNames.length === 0) {
    if (checkpointExists) fail('REFINEMENT_CHECKPOINT_STALE');
    return Object.freeze({ required: false, status: 'not-applicable' });
  }
  if (repairNames.some((name) => !/^sha256-[a-f0-9]{64}\.json$/.test(name))) {
    fail('REFINEMENT_CHECKPOINT_STALE');
  }
  const route = readPersistedRoute(root, input.invocation);
  const routeSha256 = adaptiveRouteRecordSha256(route);
  let pair: ReturnType<typeof currentObservationPair>;
  try { pair = currentObservationPair(root); } catch (error) {
    if (error instanceof RenderedRefinementError && error.code === 'REFINEMENT_OBSERVATIONS_REQUIRED') {
      if (checkpointExists) fail('REFINEMENT_CHECKPOINT_STALE');
      return Object.freeze({ required: false, status: 'not-applicable' });
    }
    throw error;
  }
  const currentCandidate = repairNames.some((name) => {
    try {
      const bytes = stableRead(
        root, `.omd/production-repairs/${name}`, 'current refinement repair candidate',
        'REFINEMENT_CHECKPOINT_STALE',
      );
      if (!name.endsWith(`sha256-${hash(bytes)}.json`)) fail('REFINEMENT_CHECKPOINT_STALE');
      const value = JSON.parse(bytes.toString('utf8')) as unknown;
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        && (value as Record<string, unknown>).schema === 'omd-production-repair-outcome-v3'
        && (value as Record<string, unknown>).predecessorSha256 === pair[0].sha256
        && (value as Record<string, unknown>).routeSha256 === routeSha256;
    } catch (error) {
      if (error instanceof RenderedRefinementError) throw error;
      fail('REFINEMENT_CHECKPOINT_STALE');
    }
  });
  if (!currentCandidate) {
    if (checkpointExists) fail('REFINEMENT_CHECKPOINT_STALE');
    return Object.freeze({ required: false, status: 'not-applicable' });
  }
  const evidence = resolveRenderedRefinementEvidence({ root, invocation: input.invocation }).evidence;
  const current = previousCheckpoint(root);
  if (current === undefined
    || current.value.beforeObservationSha256 !== evidence.before.observationSha256
    || current.value.afterObservationSha256 !== evidence.after.observationSha256
    || current.value.evidenceSha256 !== evidence.evidenceSha256
    || current.value.productionRepairOutcomeSha256 !== evidence.productionRepairOutcomeSha256
    || current.value.action !== 'complete'
    || (current.value.status !== 'improve' && current.value.status !== 'preserved')
    || (current.value.status === 'preserved' && current.value.comparison !== 'tie')) {
    fail('REFINEMENT_CHECKPOINT_STALE');
  }
  return Object.freeze({ required: true, status: 'complete', checkpointSha256: current.sha256, checkpoint: current.value });
}
