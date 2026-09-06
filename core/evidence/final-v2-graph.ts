import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { validateActivationContext } from '../runtime/activation.ts';
import type { ActivationContext } from '../runtime/activation.ts';
import { intentLedgerSha256, resolveCurrentUserBeatExceptionReceipt, validateIntentLedger, validateIntentCurrentPointer } from '../runtime/intent.ts';
import { validateSourceSeal, validateSourceSealArtifact } from '../source-seal/index.ts';
import {
  createAdaptiveWorkflowSourceBinding,
  isAdaptiveWorkflowSourceBinding,
  type AdaptiveWorkflowSourceBinding,
} from '../design-development/workflow-persistence.ts';
import { parseReferenceBoard } from '../ref/board-parser.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { parseReferenceHandoffReceipt, referenceHandoffPayloadSha256, validateDecisionBoundReferenceHandoffs } from '../ref/reference-handoff.ts';
import { motionResolutionProjectionSha256, parseReferenceSelectionV2, referenceSelectionV2Sha256, validateMotionResolutionProjection, validateReferenceSelectionV2 } from '../ref/reference-selection.ts';
import { canonicalJson, projectRawReferenceBoard, sha256 } from '../ref/board-artifacts.ts';
import { resolveReferenceBoard } from '../ref/board.ts';
import { parseReferenceUsageV2, referenceUsageV2Sha256 } from '../ref/reference-usage-snapshot.ts';
import { validateReferenceUsage } from '../ref/reference-usage.ts';
import {
  parseSelectedReferenceDistanceReceipt,
  selectedReferenceDistanceSha256,
  validateSelectedReferenceDistanceReceipt,
} from '../ref/selected-reference-distance.ts';
import { artDirectionSha256, validateArtDirectionRecord } from '../art-direction/schema.ts';
import { NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256, exceedsCanonicalBeatBudget } from '../art-direction/decision.ts';
import { validateCanonicalCopyDeckReceipt, validatePostRenderBeatProof } from '../copy/index.ts';
import { requireCurrentIntentLedgerAuthorization, requireFinalReviewerLaneAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { normalizeUxSurface, validateFrameUxBytes } from '../frame/check-ux.ts';
import { checkTaskEvidenceAgainstSources, requireTaskEvidenceProbeAuthorizations } from './task.ts';
import { validateCompositionContract } from '../composition-contract/index.ts';
import { validateRenderedBeatResultAuthority } from '../render/index.ts';
import { validateFinalBrowserObservations } from './final-v2-browser-observations.ts';
import { validateTrustedOutcomeEvidence } from './final-v2-outcome-gate.ts';
import { assertDesignQualityGreen } from './final-v2-design-quality.ts';
import { readStableProjectFile, StableProjectFileReadError, type StableProjectFileSystem } from '../runtime/stable-project-file.ts';
import {
  isAdaptiveFinalEvidenceV2Graph,
  validateAdaptiveFinalEvidenceV2Graph,
  type AdaptiveFinalEvidenceV2Bindings,
  type AdaptiveFinalEvidenceV2Graph,
} from './final-v2-adaptive-contract.ts';
import {
  REALITY_FIT_PASS_VALUE,
  validateAdaptiveFinalEvidenceV2GraphFiles,
} from './final-v2-adaptive-files.ts';

export const FINAL_EVIDENCE_V2_GRAPH_SCHEMA = 'final-evidence-v2-graph' as const;
export const FINAL_EVIDENCE_V2_WORKFLOW_GRAPH_SCHEMA = 'final-evidence-v2-workflow-graph-v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;

export type ArtifactReceipt = Readonly<{ path: string; schema: string; sha256: string }>;
export type FinalReviewerLane = 'blindLane' | 'fidelityLane' | 'protocolLane';
export type FinalReviewerLaneContract = Readonly<{
  schema: 'blind-review-v1' | 'blind-review-v2' | 'fidelity-review-v1' | 'protocol-review-v1';
  verdictKeys: readonly string[];
  floorDimensions: readonly string[];
  requiresDesignQuality: boolean;
  executionSchema: 'final-reviewer-execution-v1' | 'final-reviewer-execution-v2';
}>;
const FINAL_REVIEWER_LANE_CONTRACTS: Readonly<Record<FinalReviewerLane, FinalReviewerLaneContract>> = {
  blindLane: { schema: 'blind-review-v2', verdictKeys: ['blindVisual', 'blindNarrative'], floorDimensions: ['composition', 'copy'], requiresDesignQuality: true, executionSchema: 'final-reviewer-execution-v2' },
  fidelityLane: { schema: 'fidelity-review-v1', verdictKeys: ['referenceFidelity', 'renderFidelity'], floorDimensions: ['desktop', 'mobile'], requiresDesignQuality: false, executionSchema: 'final-reviewer-execution-v1' },
  protocolLane: { schema: 'protocol-review-v1', verdictKeys: ['evidenceIntegrity', 'publicationProtocol'], floorDimensions: ['authority', 'currentness'], requiresDesignQuality: false, executionSchema: 'final-reviewer-execution-v1' },
};
const LEGACY_BLIND_REVIEW_CONTRACT: FinalReviewerLaneContract = {
  schema: 'blind-review-v1',
  verdictKeys: ['blindVisual', 'blindNarrative'],
  floorDimensions: ['composition', 'copy'],
  requiresDesignQuality: false,
  executionSchema: 'final-reviewer-execution-v1',
};
function finalReviewerLaneContract(
  label: FinalReviewerLane,
  schema: unknown,
): FinalReviewerLaneContract {
  if (label === 'blindLane' && schema === LEGACY_BLIND_REVIEW_CONTRACT.schema) {
    return LEGACY_BLIND_REVIEW_CONTRACT;
  }
  const contract = FINAL_REVIEWER_LANE_CONTRACTS[label];
  if (schema !== contract.schema) fail(`${label} schema does not match its critical lane`);
  return contract;
}
export type ArtSelectedFinalEvidenceV2Graph = Readonly<{
  schema: typeof FINAL_EVIDENCE_V2_GRAPH_SCHEMA;
  activation: ArtifactReceipt;
  intent: ArtifactReceipt;
  artDirection: ArtifactReceipt;
  board: ArtifactReceipt;
  selection: ArtifactReceipt;
  settledSelection: ArtifactReceipt;
  handoff: ArtifactReceipt;
  usage: ArtifactReceipt;
  referenceDistance?: ArtifactReceipt;
  copy: ArtifactReceipt;
  renderedBeats: ArtifactReceipt;
  sourceSeal: ArtifactReceipt;
  buildIdentity: ArtifactReceipt;
  blindLane: ArtifactReceipt;
  fidelityLane: ArtifactReceipt;
  protocolLane: ArtifactReceipt;
  taskEvidence?: ArtifactReceipt;
  observations: readonly ArtifactReceipt[];
}>;
export type FinalEvidenceV2Graph = ArtSelectedFinalEvidenceV2Graph;
export type WorkflowArtSelectedFinalEvidenceV2Graph = Readonly<Omit<ArtSelectedFinalEvidenceV2Graph, 'schema' | 'sourceSeal'> & {
  schema: typeof FINAL_EVIDENCE_V2_WORKFLOW_GRAPH_SCHEMA;
  productionSchema: typeof FINAL_EVIDENCE_V2_GRAPH_SCHEMA;
  workflow: AdaptiveWorkflowSourceBinding;
  sourceSeal: ArtifactReceipt & Readonly<{ schema: 'source-seal-v2' }>;
}>;
export type WorkflowAdaptiveFinalEvidenceV2Graph = Readonly<Omit<AdaptiveFinalEvidenceV2Graph, 'schema' | 'sourceSeal'> & {
  schema: typeof FINAL_EVIDENCE_V2_WORKFLOW_GRAPH_SCHEMA;
  productionSchema: 'final-evidence-v2-adaptive-omission-graph';
  workflow: AdaptiveWorkflowSourceBinding;
  sourceSeal: ArtifactReceipt & Readonly<{ schema: 'source-seal-v2' }>;
}>;
export type WorkflowFinalEvidenceV2Graph = WorkflowArtSelectedFinalEvidenceV2Graph | WorkflowAdaptiveFinalEvidenceV2Graph;
export type FinalEvidenceV2GraphVariant = FinalEvidenceV2Graph | AdaptiveFinalEvidenceV2Graph | WorkflowFinalEvidenceV2Graph;
export type ArtSelectedFinalEvidenceV2GraphBindings = Readonly<{
  readonly branch: 'art-selected';
  readonly activation: ActivationContext;
  readonly artDirectionSha256: string;
  readonly selectionSha256: string;
  readonly settledSelectionSha256: string;
  readonly handoffSha256: string;
  readonly buildSha256: string;
  readonly allowedMotionReferenceSlotIds: readonly string[];
  readonly approvedMotionRecipe?: Readonly<{ recipeId: string; recipeSha256: string }>;
  readonly motionTask?: Readonly<{ taskId: string; route: string; targets: readonly string[] }>;
}>;
export type FinalEvidenceV2GraphBindings = ArtSelectedFinalEvidenceV2GraphBindings;
export type FinalEvidenceV2GraphBindingsVariant = FinalEvidenceV2GraphBindings | AdaptiveFinalEvidenceV2Bindings;

export interface EvidenceGraphFs extends StableProjectFileSystem {}

export class FinalEvidenceGraphError extends Error {
  constructor(reason: string) { super(`final-evidence-v2 graph: ${reason}`); }
}

const fail = (reason: string): never => { throw new FinalEvidenceGraphError(reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const digest = (value: unknown, label: string): string => (
  typeof value === 'string' && SHA256.test(value) ? value : fail(`${label} must be a SHA-256 digest`)
);
const stringValue = (value: unknown, label: string): string => (
  typeof value === 'string' && value !== '' ? value : fail(`${label} must be a non-empty string`)
);
const array = (value: unknown, label: string): readonly unknown[] => (
  Array.isArray(value) ? value : fail(`${label} must be an array`)
);
const object = (value: unknown, label: string): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(`${label} must be an object`)
);
const exact = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} has unexpected keys`);
};
const PLACEHOLDER_TEXT_FIELDS = new Set([
  'adaptation', 'conceptRole', 'fallbackPath', 'lawfulImplementationPath', 'macroCompositionHypothesis',
  'markdown', 'obligationReason', 'performanceAccessibilityBudget', 'rationale', 'reason',
  'rejectionCondition', 'subjectIdentityFit', 'take', 'transformation', 'uxAccessibilityPerformanceRisks',
  'verificationNote',
]);
const rejectPlaceholderText = (value: unknown, label: string): void => {
  if (typeof value === 'string' && /^(?:placeholder|todo|tbd|n\/a|null)$/i.test(value.trim())) fail(`${label} contains a hand-authored placeholder`);
  if (Array.isArray(value)) { value.forEach((item) => rejectPlaceholderText(item, label)); return; }
  if (isRecord(value)) Object.values(value).forEach((item) => rejectPlaceholderText(item, label));
};
const rejectHandAuthoredPlaceholder = (value: unknown, label: string): void => {
  if (Array.isArray(value)) { value.forEach((item) => rejectHandAuthoredPlaceholder(item, label)); return; }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) => {
      if (PLACEHOLDER_TEXT_FIELDS.has(key)) rejectPlaceholderText(item, label);
      else rejectHandAuthoredPlaceholder(item, label);
    });
  }
};

const RECEIPT_SCHEMAS: Readonly<Record<string, readonly string[]>> = {
  activation: ['activation-context-v2'],
  intent: ['intent-ledger-v1'],
  artDirection: ['art-direction-record-v2', 'art-direction-record-v3'],
  board: ['reference-board-v1'],
  selection: ['reference-selection-v2'],
  settledSelection: ['reference-selection-v2'],
  handoff: ['reference-handoff-v2'],
  usage: ['reference-usage-v2'],
  referenceDistance: ['selected-reference-distance-v1'],
  copy: ['copy-deck-receipt-v1'],
  renderedBeats: ['rendered-beat-receipt-v1'],
  sourceSeal: ['source-seal-v1'],
  buildIdentity: ['omd-build-identity-v1'],
  blindLane: ['blind-review-v1', 'blind-review-v2'],
  fidelityLane: ['fidelity-review-v1'],
  protocolLane: ['protocol-review-v1'],
  observation: ['observation-v2'],
  taskEvidence: ['task-evidence-v1'],
};

function receipt(value: unknown, label: string): ArtifactReceipt {
  const item = object(value, label);
  exact(item, ['path', 'schema', 'sha256'], label);
  const path = stringValue(item.path, `${label}.path`);
  const schema = stringValue(item.schema, `${label}.schema`);
  if (path.startsWith('/') || path.includes('\\') || path === '.' || path.split('/').some((segment) => segment === '' || segment === '..')) fail(`${label}.path must be a normalized project-relative path`);
  const supported = RECEIPT_SCHEMAS[label] ?? fail(`${label} has no typed production artifact contract`);
  if (!supported.includes(schema)) fail(`${label}.schema is not an accepted production artifact type`);
  return { path, schema, sha256: digest(item.sha256, `${label}.sha256`) };
}

export function isWorkflowFinalEvidenceV2Graph(value: unknown): value is WorkflowFinalEvidenceV2Graph {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Reflect.get(value, 'schema') === FINAL_EVIDENCE_V2_WORKFLOW_GRAPH_SCHEMA;
}
export function isWorkflowAdaptiveFinalEvidenceV2Graph(value: unknown): value is WorkflowAdaptiveFinalEvidenceV2Graph {
  return isWorkflowFinalEvidenceV2Graph(value) && Reflect.get(value, 'productionSchema') === 'final-evidence-v2-adaptive-omission-graph';
}
export function isWorkflowArtSelectedFinalEvidenceV2Graph(value: unknown): value is WorkflowArtSelectedFinalEvidenceV2Graph {
  return isWorkflowFinalEvidenceV2Graph(value) && Reflect.get(value, 'productionSchema') === FINAL_EVIDENCE_V2_GRAPH_SCHEMA;
}
function workflowProductionGraph(value: WorkflowFinalEvidenceV2Graph | Record<string, unknown>): Record<string, unknown> {
  const projected = { ...(value as Record<string, unknown>) };
  projected.schema = projected.productionSchema;
  delete projected.productionSchema; delete projected.workflow;
  const sourceSeal = object(projected.sourceSeal, 'workflow graph sourceSeal');
  projected.sourceSeal = { ...sourceSeal, schema: 'source-seal-v1' };
  return projected;
}
function validateWorkflowFinalEvidenceV2Graph(value: unknown): WorkflowFinalEvidenceV2Graph {
  const graph = object(value, 'workflow graph');
  if (graph.schema !== FINAL_EVIDENCE_V2_WORKFLOW_GRAPH_SCHEMA
    || (graph.productionSchema !== FINAL_EVIDENCE_V2_GRAPH_SCHEMA && graph.productionSchema !== 'final-evidence-v2-adaptive-omission-graph')
    || !isAdaptiveWorkflowSourceBinding(graph.workflow)) fail('workflow graph identity or binding is invalid');
  const sourceSeal = object(graph.sourceSeal, 'workflow graph sourceSeal');
  if (sourceSeal.schema !== 'source-seal-v2') fail('workflow graph requires a source-seal-v2 receipt');
  const production = validateFinalEvidenceV2Graph(workflowProductionGraph(graph));
  if ((graph.productionSchema === FINAL_EVIDENCE_V2_GRAPH_SCHEMA && production.schema !== FINAL_EVIDENCE_V2_GRAPH_SCHEMA)
    || (graph.productionSchema !== FINAL_EVIDENCE_V2_GRAPH_SCHEMA && !isAdaptiveFinalEvidenceV2Graph(production))) fail('workflow production graph schema is inconsistent');
  const expectedKeys = [...Object.keys(production).filter((key) => key !== 'schema'), 'schema', 'productionSchema', 'workflow'].sort();
  const actualKeys = Object.keys(graph).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) fail('workflow graph has unexpected keys');
  return Object.freeze({ ...production, schema: FINAL_EVIDENCE_V2_WORKFLOW_GRAPH_SCHEMA, productionSchema: graph.productionSchema, workflow: graph.workflow,
    sourceSeal: Object.freeze({ path: stringValue(sourceSeal.path, 'workflow graph sourceSeal.path'), schema: 'source-seal-v2', sha256: digest(sourceSeal.sha256, 'workflow graph sourceSeal.sha256') }) }) as WorkflowFinalEvidenceV2Graph;
}

export function validateFinalEvidenceV2Graph(value: unknown): FinalEvidenceV2GraphVariant {
  if (isWorkflowFinalEvidenceV2Graph(value)) return validateWorkflowFinalEvidenceV2Graph(value);
  if (isAdaptiveFinalEvidenceV2Graph(value)) return validateAdaptiveFinalEvidenceV2Graph(value);
  const graph = object(value, 'graph');
  const keys = ['schema', 'activation', 'intent', 'artDirection', 'board', 'selection', 'settledSelection', 'handoff', 'usage', 'referenceDistance', 'copy', 'renderedBeats', 'sourceSeal', 'buildIdentity', 'blindLane', 'fidelityLane', 'protocolLane', 'taskEvidence', 'observations'].filter((key) => key in graph);
  exact(graph, keys, 'graph');
  if (graph.schema !== FINAL_EVIDENCE_V2_GRAPH_SCHEMA) fail('unsupported graph schema');
  const observations = array(graph.observations, 'graph.observations');
  if (observations.length === 0) fail('graph requires a non-empty observation chain');
  const result = {
    schema: FINAL_EVIDENCE_V2_GRAPH_SCHEMA,
    activation: receipt(graph.activation, 'activation'), intent: receipt(graph.intent, 'intent'), artDirection: receipt(graph.artDirection, 'artDirection'),
    board: receipt(graph.board, 'board'), selection: receipt(graph.selection, 'selection'), settledSelection: receipt(graph.settledSelection, 'settledSelection'), handoff: receipt(graph.handoff, 'handoff'), usage: receipt(graph.usage, 'usage'),
    ...(graph.referenceDistance === undefined ? {} : { referenceDistance: receipt(graph.referenceDistance, 'referenceDistance') }),
    copy: receipt(graph.copy, 'copy'), renderedBeats: receipt(graph.renderedBeats, 'renderedBeats'), sourceSeal: receipt(graph.sourceSeal, 'sourceSeal'), buildIdentity: receipt(graph.buildIdentity, 'buildIdentity'),
    blindLane: receipt(graph.blindLane, 'blindLane'), fidelityLane: receipt(graph.fidelityLane, 'fidelityLane'), protocolLane: receipt(graph.protocolLane, 'protocolLane'),
    ...(graph.taskEvidence === undefined ? {} : { taskEvidence: receipt(graph.taskEvidence, 'taskEvidence') }),
    observations: observations.map((item: unknown, index: number) => receipt(item, 'observation')),
  } as const;
  const paths = [
    result.activation, result.intent, result.artDirection, result.board, result.selection, result.settledSelection, result.handoff, result.usage,
    ...(result.referenceDistance === undefined ? [] : [result.referenceDistance]),
    result.copy, result.renderedBeats, result.sourceSeal, result.buildIdentity, result.blindLane, result.fidelityLane,
    result.protocolLane, ...(result.taskEvidence === undefined ? [] : [result.taskEvidence]), ...result.observations,
  ].map((item) => item.path);
  if (new Set(paths).size !== paths.length) fail('receipt paths must be unique');
  return result;
}

function semanticHash(label: string, value: Record<string, unknown>): string {
  switch (label) {
    case 'artDirection': return artDirectionSha256(validateArtDirectionRecord(value));
    case 'activation': return createHash('sha256').update(canonical(validateActivationContext(value))).digest('hex');
    case 'intent': return intentLedgerSha256(validateIntentLedger(value));
    case 'selection':
    case 'settledSelection': return referenceSelectionV2Sha256(parseReferenceSelectionV2(value));
    case 'usage': return referenceUsageV2Sha256(parseReferenceUsageV2(value));
    case 'referenceDistance': return selectedReferenceDistanceSha256(parseSelectedReferenceDistanceReceipt(value));
    case 'handoff': {
      const { payloadSha256, ...receipt } = parseReferenceHandoffReceipt(value);
      if (referenceHandoffPayloadSha256(receipt) !== payloadSha256) fail('handoff semantic hash is invalid');
      return payloadSha256;
    }
    default: return createHash('sha256').update(canonical(value)).digest('hex');
  }
}
function readStableRegularFile(root: string, fs: EvidenceGraphFs, path: string, label: string): Buffer {
  try { return readStableProjectFile({ root, fs, path, label }); } catch (error) {
    if (error instanceof StableProjectFileReadError) fail(error.message);
    throw error;
  }
}
function readReceipt(root: string, fs: EvidenceGraphFs, receipt: ArtifactReceipt, label: string): { bytes: Buffer; byteHash: string; semanticHash: string; value: Record<string, unknown> } {
  const path = resolve(root, receipt.path);
  const outside = relative(root, path);
  if (outside === '' || outside.startsWith('..') || resolve(root, outside) !== path) fail(`${label} escapes the project root`);
  const rootStat = fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('project root is not a real directory');
  const bytes = readStableRegularFile(root, fs, path, label);
  const value = parseReceipt(bytes, label);
  const byteHash = createHash('sha256').update(bytes).digest('hex');
  if (byteHash !== receipt.sha256) fail(`${label} storage-byte hash changed`);
  if (label !== 'sourceSeal' && label !== 'taskEvidence' && value.schema !== receipt.schema && value.schemaVersion !== receipt.schema) fail(`${label} schema does not match descriptor`);
  return { bytes, byteHash, semanticHash: semanticHash(label.startsWith('observations[') ? 'observation' : label, value), value };
}
function validateTypedReceipt(label: string, value: Record<string, unknown>): void {
  try {
    switch (label) {
      case 'activation': validateActivationContext(value); return;
      case 'intent': validateIntentLedger(value); return;
      case 'board': parseReferenceBoard(value); return;
      case 'selection':
      case 'settledSelection': parseReferenceSelectionV2(value); return;
      case 'handoff': parseReferenceHandoffReceipt(value); return;
      case 'usage': parseReferenceUsageV2(value); return;
      case 'referenceDistance': parseSelectedReferenceDistanceReceipt(value); return;
      case 'artDirection': {
        validateArtDirectionRecord(value);
        return;
      }
      case 'copy': {
        exact(value, ['schemaVersion', 'copyDeckSha256', 'artDirectionSha256', 'selectedRegister', 'motionDecision', 'beatIds', 'currentUserBeatExceptionReceiptSha256'], 'copy');
        if (value.schemaVersion !== 'copy-deck-receipt-v1') fail('copy schema changed');
        digest(value.copyDeckSha256, 'copy.copyDeckSha256');
        digest(value.artDirectionSha256, 'copy.artDirectionSha256');
        digest(value.currentUserBeatExceptionReceiptSha256, 'copy.currentUserBeatExceptionReceiptSha256');
        if (value.selectedRegister !== 'quiet' && value.selectedRegister !== 'confident' && value.selectedRegister !== 'showpiece') fail('copy selected register is invalid');
        if (value.motionDecision !== 'none' && value.motionDecision !== 'one') fail('copy motion decision is invalid');
        const beats = array(value.beatIds, 'copy.beatIds');
        if (beats.length === 0 || new Set(beats).size !== beats.length || beats.some((beat, index) => !/^B-\d+$/.test(stringValue(beat, `copy.beatIds[${index}]`)))) fail('copy Beat identities are invalid');
        return;
      }
      case 'renderedBeats':
        // The complete host-authorized Beat contract needs the resolved task binding below.
        return;
      case 'sourceSeal': validateSourceSealArtifact(value); return;
      case 'blindLane':
      case 'fidelityLane':
      case 'protocolLane': {
        const contract = finalReviewerLaneContract(label, value.schema);
        exact(value, ['schema', 'artDirectionSha256', 'buildSha256', 'isolationReceipt', 'verdicts', 'criticalFloors', ...(contract.requiresDesignQuality ? ['designQuality'] : []), 'quorum', 'provenance', 'executionReceipts'], label);
        digest(value.artDirectionSha256, `${label}.artDirectionSha256`);
        digest(value.buildSha256, `${label}.buildSha256`);
        const isolation = object(value.isolationReceipt, `${label}.isolationReceipt`);
        exact(isolation, ['schema', 'sha256'], `${label}.isolationReceipt`);
        if (isolation.schema !== 'reviewer-isolation-v1') fail(`${label} requires an isolation receipt`);
        const isolationSha256 = digest(isolation.sha256, `${label}.isolationReceipt.sha256`);
        const verdicts = object(value.verdicts, `${label}.verdicts`);
        const verdictKeys = label === 'blindLane' && Object.hasOwn(verdicts, 'realityFit')
          ? [...contract.verdictKeys, 'realityFit']
          : contract.verdictKeys;
        exact(verdicts, verdictKeys, `${label}.verdicts`);
        if (Object.values(verdicts).some((verdict) => verdict !== 'GREEN')) fail(`${label} requires all critical GREEN verdicts`);
        const floors = object(value.criticalFloors, `${label}.criticalFloors`);
        exact(floors, contract.floorDimensions, `${label}.criticalFloors`);
        for (const dimension of contract.floorDimensions) {
          const floor = floors[dimension];
          if (typeof floor !== 'number' || !Number.isFinite(floor) || floor < 3) fail(`${label} critical floor ${dimension} is invalid`);
        }
        const quorum = object(value.quorum, `${label}.quorum`);
        exact(quorum, ['required', 'passed'], `${label}.quorum`);
        const required = quorum.required;
        const passed = quorum.passed;
        if (typeof required !== 'number' || typeof passed !== 'number'
          || !Number.isSafeInteger(required) || !Number.isSafeInteger(passed)
          || required < 2 || passed < required) fail(`${label} quorum is not satisfied`);
        const provenance = object(value.provenance, `${label}.provenance`);
        exact(provenance, ['observationSha256s', 'reviewerIds', 'reviewerSessionSha256'], `${label}.provenance`);
        const observations = array(provenance.observationSha256s, `${label}.provenance.observationSha256s`);
        const reviewers = array(provenance.reviewerIds, `${label}.provenance.reviewerIds`);
        if (observations.length === 0 || reviewers.length !== passed || new Set(reviewers).size !== reviewers.length) fail(`${label} provenance is incomplete or reuses a reviewer`);
        if (new Set(observations).size !== observations.length) {
          fail(`${label} does not bind the complete duplicate-free observed evidence set`);
        }
        observations.forEach((item, index) => digest(item, `${label}.provenance.observationSha256s[${index}]`));
        if (contract.requiresDesignQuality) {
          assertDesignQualityGreen(value.designQuality, {
            expectedObservationSha256s: observations.map((item, index) =>
              digest(item, `${label}.provenance.observationSha256s[${index}]`)),
          });
        }
        reviewers.forEach((item, index) => stringValue(item, `${label}.provenance.reviewerIds[${index}]`));
        const executions = array(value.executionReceipts, `${label}.executionReceipts`);
        if (executions.length !== passed) fail(`${label} requires one completed host reviewer execution receipt per quorum member`);
        for (const [index, execution] of executions.entries()) {
          const item = object(execution, `${label}.executionReceipts[${index}]`);
          exact(item, ['path', 'sha256'], `${label}.executionReceipts[${index}]`);
          const path = stringValue(item.path, `${label}.executionReceipts[${index}].path`);
          if (path.startsWith('/') || path.includes('\\') || path === '.' || path.split('/').some((segment) => segment === '' || segment === '..')) fail(`${label} execution receipt path must be normalized and project-relative`);
          digest(item.sha256, `${label}.executionReceipts[${index}].sha256`);
        }
        if (digest(provenance.reviewerSessionSha256, `${label}.provenance.reviewerSessionSha256`) !== isolationSha256) fail(`${label} is not bound to its reviewer session evidence`);
        return;
      }
      case 'observation': {
        exact(value, ['schema', 'buildSha256', 'currentArtifact', 'predecessorSha256', 'observedAt', 'evidence'], 'observation');
        digest(value.buildSha256, 'observation.buildSha256');
        const currentArtifact = object(value.currentArtifact, 'observation.currentArtifact');
        exact(currentArtifact, ['path', 'sha256'], 'observation.currentArtifact');
        stringValue(currentArtifact.path, 'observation.currentArtifact.path');
        digest(currentArtifact.sha256, 'observation.currentArtifact.sha256');
        if (value.predecessorSha256 !== null) digest(value.predecessorSha256, 'observation.predecessorSha256');
        stringValue(value.observedAt, 'observation.observedAt');
        return;
      }
      case 'taskEvidence': {
        exact(value, ['schemaVersion', 'buildSha256', 'surface', 'frame', 'composition', 'tasks'], 'taskEvidence');
        if (value.schemaVersion !== 1 || (value.surface !== 'product' && value.surface !== 'mixed')) fail('taskEvidence schema changed');
        digest(value.buildSha256, 'taskEvidence.buildSha256');
        return;
      }
      case 'buildIdentity': {
        exact(value, ['schemaVersion', 'packageVersion', 'buildSha256', 'sourceSkillSha256'], 'buildIdentity');
        if (value.schemaVersion !== 'omd-build-identity-v1') fail('buildIdentity schema changed');
        digest(value.buildSha256, 'buildIdentity.buildSha256');
        digest(value.sourceSkillSha256, 'buildIdentity.sourceSkillSha256');
        stringValue(value.packageVersion, 'buildIdentity.packageVersion');
        return;
      }
      default: fail(`${label} has no semantic production validator`);
    }
  } catch (error: unknown) {
    if (error instanceof FinalEvidenceGraphError) throw error;
    fail(`${label} is not a valid typed production artifact: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseReceipt(bytes: Buffer, label: string): Record<string, unknown> {
  try { return object(JSON.parse(bytes.toString('utf8')), label); } catch { return fail(`${label} is not JSON`); }
}

function observationPredecessor(value: Record<string, unknown>, index: number): string | null {
  const predecessor = value.predecessorSha256;
  return predecessor === null ? null : digest(predecessor, `observations[${index}].predecessorSha256`);
}
function rejectRed(value: unknown, label: string): void {
  if (Array.isArray(value)) { value.forEach((item) => rejectRed(item, label)); return; }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (item === 'RED' || (key.toLowerCase().includes('critical') && typeof item === 'number' && item < 3)) fail(`${label} is RED or below a critical floor`);
    rejectRed(item, label);
  }
}
export function assertArtSelectedGreenfieldRealityFit(
  projectMode: 'greenfield' | 'existing',
  verdicts: unknown,
): void {
  const value = object(verdicts, 'blindLane.verdicts');
  const actual = Object.hasOwn(value, 'realityFit')
    ? stringValue(value.realityFit, 'blindLane.realityFit')
    : '';
  if (projectMode === 'greenfield' && actual !== REALITY_FIT_PASS_VALUE) {
    fail('greenfield art-selected final evidence requires realityFit: GREEN');
  }
}
function validateCompletedReviewerExecutions(
  root: string,
  fs: EvidenceGraphFs,
  invocation: ProjectRunInvocation,
  label: FinalReviewerLane,
  lane: Record<string, unknown>,
  usedExecutions: Set<string>,
): void {
  const provenance = object(lane.provenance, `${label}.provenance`);
  const expectedReviewers = array(provenance.reviewerIds, `${label}.provenance.reviewerIds`).map((value, index) => stringValue(value, `${label}.provenance.reviewerIds[${index}]`));
  const expectedObservations = array(provenance.observationSha256s, `${label}.provenance.observationSha256s`).map((value, index) => digest(value, `${label}.provenance.observationSha256s[${index}]`));
  const expectedIsolation = digest(object(lane.isolationReceipt, `${label}.isolationReceipt`).sha256, `${label}.isolationReceipt.sha256`);
  const contract = finalReviewerLaneContract(label, lane.schema);
  const executions = array(lane.executionReceipts, `${label}.executionReceipts`);
  const completedReviewers = new Set<string>();
  for (const [index, descriptor] of executions.entries()) {
    const item = object(descriptor, `${label}.executionReceipts[${index}]`);
    const executionPath = stringValue(item.path, `${label}.executionReceipts[${index}].path`);
    const bytes = readStableRegularFile(root, fs, resolve(root, executionPath), `${label}.executionReceipts[${index}]`);
    if (createHash('sha256').update(bytes).digest('hex') !== digest(item.sha256, `${label}.executionReceipts[${index}].sha256`)) fail(`${label} completed execution receipt bytes changed`);
    requireFinalReviewerLaneAuthorization(invocation, root, bytes);
    const execution = parseReceipt(bytes, `${label}.executionReceipts[${index}]`);
    exact(execution, ['schema', 'lane', 'reviewerId', 'verdicts', 'criticalFloors', ...(contract.requiresDesignQuality ? ['designQuality'] : []), 'isolationReceiptSha256', 'observationSha256s', 'artDirectionSha256', 'buildSha256', 'briefSha256', 'browserSha256', 'childPid', 'sessionId', 'nonce', 'evidenceSha256', 'configurationSha256'], `${label}.executionReceipts[${index}]`);
    if (execution.schema !== contract.executionSchema || execution.lane !== label) fail(`${label} execution receipt is not a completed host reviewer execution for this lane`);
    const reviewerId = stringValue(execution.reviewerId, `${label}.executionReceipts[${index}].reviewerId`);
    if (!expectedReviewers.includes(reviewerId) || completedReviewers.has(reviewerId)) fail(`${label} execution receipts do not cover the issued reviewer identities exactly once`);
    completedReviewers.add(reviewerId);
    if (canonical(execution.verdicts) !== canonical(lane.verdicts) || canonical(execution.criticalFloors) !== canonical(lane.criticalFloors)
      || digest(execution.isolationReceiptSha256, `${label}.executionReceipts[${index}].isolationReceiptSha256`) !== expectedIsolation
      || execution.artDirectionSha256 !== lane.artDirectionSha256 || execution.buildSha256 !== lane.buildSha256
      || execution.briefSha256 !== invocation.activation.briefSha256) fail(`${label} execution receipt does not bind the lane verdict, floors, isolation, current brief, art direction, and build`);
    const observations = array(execution.observationSha256s, `${label}.executionReceipts[${index}].observationSha256s`).map((value, observationIndex) => digest(value, `${label}.executionReceipts[${index}].observationSha256s[${observationIndex}]`));
    if (new Set(observations).size !== observations.length
      || observations.length !== expectedObservations.length
      || observations.some((value) => !expectedObservations.includes(value))) fail(`${label} execution receipt does not bind the complete duplicate-free lane observation set`);
    if (contract.requiresDesignQuality) {
      assertDesignQualityGreen(execution.designQuality, {
        expectedObservationSha256s: expectedObservations,
      });
      if (canonical(execution.designQuality) !== canonical(lane.designQuality)) {
        fail(`${label} execution receipt does not bind design quality`);
      }
    }
    const childPid = execution.childPid;
    if (typeof childPid !== 'number' || !Number.isSafeInteger(childPid) || childPid <= 0) fail(`${label} execution receipt child process is invalid`);
    const sessionId = stringValue(execution.sessionId, `${label}.executionReceipts[${index}].sessionId`);
    const nonce = stringValue(execution.nonce, `${label}.executionReceipts[${index}].nonce`);
    const configurationSha256 = digest(execution.configurationSha256, `${label}.executionReceipts[${index}].configurationSha256`);
    digest(execution.browserSha256, `${label}.executionReceipts[${index}].browserSha256`);
    digest(execution.evidenceSha256, `${label}.executionReceipts[${index}].evidenceSha256`);
    const identities = [`process:${childPid}`, `session:${sessionId}`, `nonce:${nonce}`, `configuration:${configurationSha256}`];
    if (identities.some((identity) => usedExecutions.has(identity))) fail('completed host reviewer execution receipts cannot reuse a process, session, nonce, or configuration');
    identities.forEach((identity) => usedExecutions.add(identity));
  }
  if (completedReviewers.size !== expectedReviewers.length) fail(`${label} execution receipts do not cover the final quorum`);
}

export function validateFinalEvidenceV2GraphFiles(root: string, graphInput: FinalEvidenceV2Graph, fs: EvidenceGraphFs, invocation: ProjectRunInvocation): { graph: FinalEvidenceV2Graph; rootHash: string; bindings: FinalEvidenceV2GraphBindings };
export function validateFinalEvidenceV2GraphFiles(root: string, graphInput: unknown, fs: EvidenceGraphFs, invocation: ProjectRunInvocation): { graph: FinalEvidenceV2GraphVariant; rootHash: string; bindings: FinalEvidenceV2GraphBindingsVariant };
export function validateFinalEvidenceV2GraphFiles(root: string, graphInput: unknown, fs: EvidenceGraphFs, invocation: ProjectRunInvocation): { graph: FinalEvidenceV2GraphVariant; rootHash: string; bindings: FinalEvidenceV2GraphBindingsVariant } {
  const graph = validateFinalEvidenceV2Graph(graphInput);
  if (isWorkflowFinalEvidenceV2Graph(graph)) {
    const production = validateFinalEvidenceV2GraphFiles(root, workflowProductionGraph(graph), fs, invocation);
    const currentWorkflow = createAdaptiveWorkflowSourceBinding(root, invocation);
    if (canonical(graph.workflow) !== canonical(currentWorkflow)) fail('workflow plan, route authority, selected proofs, reviews, or pointers are stale');
    const source = readReceipt(root, fs, graph.sourceSeal, 'sourceSeal');
    const seal = validateSourceSealArtifact(source.value);
    if (seal.schemaVersion !== 2 || canonical(seal.workflow) !== canonical(graph.workflow) || validateSourceSeal(root, invocation).length !== 0) {
      fail('source seal does not bind the current workflow proof plane');
    }
    return { graph, rootHash: createHash('sha256').update(canonical({ productionRootHash: production.rootHash, graph })).digest('hex'), bindings: production.bindings };
  }
  if (graph.schema !== FINAL_EVIDENCE_V2_GRAPH_SCHEMA) return validateAdaptiveFinalEvidenceV2GraphFiles(root, graph, fs, invocation);
  const entries: ReadonlyArray<readonly [string, ArtifactReceipt]> = [
    ['activation', graph.activation], ['intent', graph.intent], ['artDirection', graph.artDirection], ['board', graph.board],
    ['selection', graph.selection], ['settledSelection', graph.settledSelection], ['handoff', graph.handoff], ['usage', graph.usage], ['copy', graph.copy],
    ...(graph.referenceDistance === undefined ? [] : [['referenceDistance', graph.referenceDistance] as const]),
    ['renderedBeats', graph.renderedBeats], ['sourceSeal', graph.sourceSeal], ['buildIdentity', graph.buildIdentity],
    ['blindLane', graph.blindLane], ['fidelityLane', graph.fidelityLane], ['protocolLane', graph.protocolLane],
    ...(graph.taskEvidence === undefined ? [] : [['taskEvidence', graph.taskEvidence] as const]),
    ...graph.observations.map((receipt, index): readonly [string, ArtifactReceipt] => [`observations[${index}]`, receipt]),
  ];
  const hashes = new Map<string, string>();
  const values = new Map<string, Record<string, unknown>>();
  for (const [label, item] of entries) {
    const loaded = readReceipt(root, fs, item, label);
    hashes.set(label, loaded.semanticHash);
    values.set(label, loaded.value);
    validateTypedReceipt(label.startsWith('observations[') ? 'observation' : label, loaded.value);
    rejectHandAuthoredPlaceholder(loaded.value, label);
    if (label === 'blindLane' || label === 'fidelityLane' || label === 'protocolLane') {
      requireFinalReviewerLaneAuthorization(invocation, root, loaded.bytes);
    }
  }
  const selection = parseReferenceSelectionV2(values.get('selection') ?? fail('selection receipt is missing'));
  const settledSelection = parseReferenceSelectionV2(values.get('settledSelection') ?? fail('settled selection receipt is missing'));
  const handoff = parseReferenceHandoffReceipt(values.get('handoff') ?? fail('handoff receipt is missing'));
  const usage = parseReferenceUsageV2(values.get('usage') ?? fail('usage receipt is missing'));
  const referenceDistance = graph.referenceDistance === undefined
    ? undefined
    : parseSelectedReferenceDistanceReceipt(values.get('referenceDistance') ?? fail('selected reference distance receipt is missing'));
  if (handoff.preSelectionSha256 !== hashes.get('selection') || handoff.captureSha256 !== selection.captureSha256
    || handoff.assemblySha256 !== selection.assemblySha256 || handoff.projectionSha256 !== selection.projectionSha256) {
    fail('handoff does not bind the immutable pre-selection reference artifacts');
  }
  if (handoff.role !== 'art-direction' || handoff.artDirectionSha256 !== undefined) {
    fail('final publication requires the canonical pre-composition art-direction role receipt');
  }
  if (usage.captureSha256 !== settledSelection.captureSha256 || usage.assemblySha256 !== settledSelection.assemblySha256
    || usage.projectionSha256 !== settledSelection.projectionSha256 || usage.selectionSha256 !== hashes.get('settledSelection')) {
    fail('usage does not bind the exact v2 settled capture, assembly, projection, and selection');
  }
  const usedSlots = new Set(usage.rows.filter((row) => row.status === 'used').map((row) => row.slotId));
  for (const slot of settledSelection.slots) {
    if (slot.obligationDisposition === 'used' && !usedSlots.has(slot.slotId)) fail(`selected slot ${slot.slotId} has no observed usage`);
  }
  try {
    const currentSelection = validateReferenceSelectionV2(root);
    const currentHandoff = parseReferenceHandoffReceipt(parseReceipt(readStableRegularFile(root, fs, resolve(root, '.omd', 'reference-handoffs', 'art-direction.json'), 'current art-direction handoff'), 'current art-direction handoff'));
    const currentUsage = validateReferenceUsage(root);
    if (referenceSelectionV2Sha256(currentSelection) !== hashes.get('settledSelection')
      || currentHandoff.payloadSha256 !== handoff.payloadSha256
      || referenceUsageV2Sha256(currentUsage.usage) !== hashes.get('usage')) {
      fail('settled selection, handoff, or usage receipt is not the current canonical snapshot');
    }
  } catch (error) {
    if (error instanceof FinalEvidenceGraphError) throw error;
    fail(`current reference snapshot validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const pointerPath = resolve(root, '.omd', 'intent-current.json');
    const pointer = validateIntentCurrentPointer(parseReceipt(readStableRegularFile(root, fs, pointerPath, 'intent current pointer'), 'intent current pointer'));
    if (`.omd/${pointer.record}` !== graph.intent.path || pointer.sha256 !== hashes.get('intent')) {
      fail('intent receipt is not the current immutable ledger');
    }
    const currentIntentBytes = readStableRegularFile(root, fs, resolve(root, '.omd', pointer.record), 'current intent ledger');
    if (createHash('sha256').update(currentIntentBytes).digest('hex') !== graph.intent.sha256) {
      fail('current intent ledger bytes do not match the graph receipt');
    }
    requireCurrentIntentLedgerAuthorization(invocation, root, currentIntentBytes);
    const boardPath = resolve(root, '.omd', 'reference-board.json');
    if (semanticHash('board', parseReceipt(readStableRegularFile(root, fs, boardPath, 'current reference board'), 'current reference board')) !== hashes.get('board')) {
      fail('board receipt is not the current canonical board');
    }
  } catch (error) {
    if (error instanceof FinalEvidenceGraphError) throw error;
    fail(`current intent or board validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const framePath = resolve(root, '.omd', 'frame.md');
  const frameBytes = readStableRegularFile(root, fs, framePath, 'current frame');
  const compositionBytes = readStableRegularFile(root, fs, resolve(root, '.omd', 'composition.md'), 'current composition');
  const currentFrameSha256 = createHash('sha256').update(frameBytes).digest('hex');
  const frameMatch = /^---\n([\s\S]*?)\n---/.exec(frameBytes.toString('utf8'));
  const frame = frameMatch === null ? {} : object(parse(frameMatch[1] ?? '') ?? {}, 'frame frontmatter');
  const frameUxViolations = validateFrameUxBytes(frameBytes);
  if (frameUxViolations.length > 0) {
    fail(`current frame fails UX contract: ${frameUxViolations.map((violation) => violation.id).join(', ')}`);
  }
  const surface = normalizeUxSurface(frame.uxSurface);
  if (surface === null) fail('frame does not expose a supported uxSurface');
  const taskEvidence = graph.taskEvidence;
  let currentTaskEvidence: ReturnType<typeof checkTaskEvidenceAgainstSources> | undefined;
  if (surface === 'product' || surface === 'mixed') {
    if (taskEvidence === undefined) fail(`${surface} final publication requires current task evidence`);
    if ((taskEvidence ?? fail('task evidence receipt is missing')).path !== '.omd/task-evidence.json') fail('task evidence receipt must identify the current canonical task evidence');
    try {
      const currentTask = checkTaskEvidenceAgainstSources(root, frameBytes, compositionBytes);
      currentTaskEvidence = currentTask;
      if (currentTask.surface !== surface || currentTask.frame.sha256 !== currentFrameSha256
        || canonical(currentTask) !== canonical(values.get('taskEvidence') ?? fail('task evidence receipt is missing'))) {
        fail('task evidence receipt is not the current validated task evidence');
      }
      requireTaskEvidenceProbeAuthorizations(root, currentTask, invocation);
    } catch (error) {
      if (error instanceof FinalEvidenceGraphError) throw error;
      fail(`current task evidence validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (taskEvidence !== undefined) {
    fail(`${surface} final publication must not include task evidence`);
  }
  const graphBoard = parseReferenceBoard(values.get('board') ?? fail('board receipt is missing'));
  const graphBoardCaptureSha256 = (() => {
    try {
      return sha256(canonicalJson(projectRawReferenceBoard(root, resolveReferenceBoard(root, graphBoard))));
    } catch (error) {
      return fail(`graph board capture provenance validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
  if (selection.captureSha256 !== graphBoardCaptureSha256 || settledSelection.captureSha256 !== graphBoardCaptureSha256) {
    fail('selection capture provenance does not bind the exact current graph board');
  }
  const artDirection = values.get('artDirection') ?? fail('art direction receipt is missing');
  const decision = object(artDirection.decision, 'artDirection.decision');
  if (artDirection.activationSha256 !== hashes.get('activation') || artDirection.intentLedgerSha256 !== hashes.get('intent')
    || decision.boardSha256 !== selection.captureSha256 || decision.preSelectionSha256 !== hashes.get('selection')
    || decision.settledSelectionSha256 !== hashes.get('settledSelection') || artDirection.referenceHandoffSha256 !== handoff.payloadSha256) {
    fail('art direction provenance does not bind current semantic activation, intent, board, pre-selection, settled selection, and handoff');
  }
  const build = values.get('buildIdentity') ?? fail('build identity receipt is missing');
  const buildSha256 = build.buildSha256;
  if (referenceDistance !== undefined) {
    if (graph.referenceDistance?.path !== '.omd/selected-reference-distance.json') {
      fail('selected reference distance receipt must identify the current canonical path');
    }
    if (referenceDistance.verdict !== 'pass') fail('selected reference distance verdict is not pass');
    if (referenceDistance.selectionSha256 !== hashes.get('settledSelection')
      || referenceDistance.usageSha256 !== hashes.get('usage')
      || referenceDistance.buildSha256 !== buildSha256
      || referenceDistance.candidateId !== settledSelection.candidateId) {
      fail('selected reference distance does not bind settled selection, usage, build, and candidate');
    }
    try {
      const current = validateSelectedReferenceDistanceReceipt(root);
      if (selectedReferenceDistanceSha256(current) !== hashes.get('referenceDistance')) {
        fail('selected reference distance is not the current canonical receipt');
      }
    } catch (error) {
      if (error instanceof FinalEvidenceGraphError) throw error;
      fail(`selected reference distance currentness failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const activation = validateActivationContext(values.get('activation') ?? fail('activation receipt is missing'));
  if (buildSha256 !== activation.buildSha256 || build.sourceSkillSha256 !== activation.loadedSkillSha256) {
    fail('build identity does not bind the current activation identity');
  }
  const copy = values.get('copy') ?? fail('copy receipt is missing');
  const decisionBeatIds = array(artDirection.beatIds, 'artDirection.beatIds').map((beat, index) => stringValue(beat, `artDirection.beatIds[${index}]`));
  const selectedRegister = decision.selectedRegister;
  const motionDecision = decision.motionDecision;
  const currentUserBeatExceptionReceiptSha256 = decision.currentUserBeatExceptionReceiptSha256;
  const selectedCopyRegister = selectedRegister === 'quiet' || selectedRegister === 'confident' || selectedRegister === 'showpiece'
    ? selectedRegister : fail('art direction does not expose a selected copy register');
  const selectedCopyMotion = motionDecision === 'none' || motionDecision === 'one'
    ? motionDecision : fail('art direction does not expose a selected copy motion decision');
  if (surface === 'product' && selectedCopyMotion === 'one' && selectedCopyRegister !== 'showpiece') {
    fail('product routes cannot publish an unscoped signature scene');
  }
  if (surface === 'mixed') {
    const task = currentTaskEvidence ?? fail('mixed publication requires current task evidence');
    const routes = new Set(task.tasks.map((entry) => entry.production.route));
    if (routes.size < 2) {
      fail('mixed publication requires task evidence for at least two distinct production routes');
    }
    if (!routes.has(stringValue(decision.route, 'art direction route'))) {
      fail('mixed publication task routes do not include the art-direction-bound production route');
    }
  }
  const selectedCopyException = typeof currentUserBeatExceptionReceiptSha256 === 'string'
    ? currentUserBeatExceptionReceiptSha256 : fail('art direction does not expose a selected copy exception receipt');
  const currentIntentLedger = validateIntentLedger(values.get('intent') ?? fail('intent receipt is missing'));
  const currentLedgerBeatExceptionReceiptSha256 = resolveCurrentUserBeatExceptionReceipt(currentIntentLedger)
    ?? NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256;
  if (selectedCopyException !== currentLedgerBeatExceptionReceiptSha256) {
    fail('art direction Beat exception receipt does not match the current intent ledger');
  }
  if (exceedsCanonicalBeatBudget(selectedCopyRegister, decisionBeatIds, currentLedgerBeatExceptionReceiptSha256)) {
    fail('art direction Beat identities exceed the canonical register budget without a current-user exception');
  }
  const copyDeckPath = resolve(root, '.omd', 'copy-deck.md');
  const copyDeckBytes = readStableRegularFile(root, fs, copyDeckPath, 'canonical copy deck');
  try {
    validateCanonicalCopyDeckReceipt(copy, copyDeckBytes, {
      selectedRegister: selectedCopyRegister,
      motionDecision: selectedCopyMotion,
      beatIds: decisionBeatIds,
      currentUserBeatExceptionReceiptSha256: selectedCopyException,
    });
  } catch (error) {
    fail(`copy receipt does not bind the canonical copy deck: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (copy.artDirectionSha256 !== hashes.get('artDirection')) fail('copy does not bind art direction semantics');
  const renderedBeats = values.get('renderedBeats') ?? fail('rendered Beat receipt is missing');
  if (surface === 'product' && selectedCopyMotion === 'one') {
    const task = currentTaskEvidence ?? fail('showpiece product motion requires current task evidence');
    const taskTargets = new Set(task.tasks.map((entry) => `http://localhost${entry.production.route}`));
    if (!taskTargets.has(stringValue(renderedBeats.target, 'renderedBeats.target'))) {
      fail('showpiece product motion target is not scoped to a production task');
    }
  }
  if (referenceDistance !== undefined
    && (referenceDistance.route !== decision.route || referenceDistance.target !== renderedBeats.target)) {
    fail('selected reference distance does not bind art direction route and rendered target');
  }
  if (renderedBeats.artDirectionHash !== hashes.get('artDirection')
    || renderedBeats.buildSha256 !== buildSha256
    || renderedBeats.copyDeckSha256 !== createHash('sha256').update(copyDeckBytes).digest('hex')) {
    fail('rendered Beats do not bind the current art direction, build, and copy output');
  }
  for (const [index, capture] of array(renderedBeats.captures, 'renderedBeats.captures').entries()) {
    const item = object(capture, `renderedBeats.captures[${index}]`);
    const path = stringValue(item.path, `renderedBeats.captures[${index}].path`);
    const bytes = readStableRegularFile(root, fs, resolve(root, path), `renderedBeats.captures[${index}]`);
    if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) fail('rendered Beat capture bytes changed');
  }
  const renderedBeatIds = array(renderedBeats.beatIds, 'renderedBeats.beatIds').map((beat, index) => stringValue(beat, `renderedBeats.beatIds[${index}]`));
  if (renderedBeatIds.length !== decisionBeatIds.length || renderedBeatIds.some((beat) => !decisionBeatIds.includes(beat))) fail('rendered Beats do not cover exactly the decision-bound Beat identities');
  const sourceSeal = values.get('sourceSeal') ?? fail('source seal receipt is missing');
  const compositionFindings = validateCompositionContract(root, invocation);
  if (compositionFindings.length > 0) {
    fail(`composition contract is not semantically valid: ${compositionFindings.map((finding) => finding.id).join(', ')}`);
  }
  if (object(sourceSeal.inputs, 'sourceSeal.inputs').copyDeckSha256 !== createHash('sha256').update(copyDeckBytes).digest('hex')) fail('source seal does not bind copy output bytes');
  if (graph.sourceSeal.path !== '.omd/source-seal.json' || validateSourceSeal(root, invocation).length !== 0) fail('source seal is not the current canonical source snapshot');
  const sealedSources = array(sourceSeal.sources, 'sourceSeal.sources').map((source, index) => digest(object(source, `sourceSeal.sources[${index}]`).sha256, `sourceSeal.sources[${index}].sha256`));
  if (!sealedSources.includes(activation.briefSha256) || !sealedSources.includes(activation.loadedSkillSha256)) {
    fail('source seal does not bind the active task brief and loaded skill identities');
  }
  // allow: SIZE_OK - this pre-existing graph orchestrator keeps one call at the immutable receipt join; browser parsing and stable reads live in the bounded responsibility module.
  validateFinalBrowserObservations(root, fs, graph.observations.map((_, index) => (values.get(`observations[${index}]`) ?? fail(`observation ${index} receipt is missing`)).evidence));
  const trustedOutcomeRoute = sourceSeal.route === undefined
    ? undefined
    : readPersistedRoute(root, invocation);
  assertArtSelectedGreenfieldRealityFit(
    trustedOutcomeRoute?.projectMode ?? 'existing',
    object(values.get('blindLane') ?? fail('blindLane receipt is missing'), 'blindLane').verdicts,
  );
  validateTrustedOutcomeEvidence({
    root,
    branch: 'art-selected',
    required: trustedOutcomeRoute !== undefined,
    invocation,
    expected: {
      buildSha256: digest(buildSha256, 'buildIdentity.buildSha256'),
      ...(trustedOutcomeRoute === undefined ? {} : (() => {
        const route = object(sourceSeal.route, 'sourceSeal.route');
        return {
          routeSha256: digest(
            object(route.record, 'sourceSeal.route.record').sha256,
            'sourceSeal.route.record.sha256',
          ),
          sourceContractSha256: trustedOutcomeRoute.sourceContractSha256,
          sourceContract: trustedOutcomeRoute.sourceContract,
        };
      })()),
    },
    observations: graph.observations.map((_, index) => {
      const observation = values.get(`observations[${index}]`)
        ?? fail(`observation ${index} receipt is missing`);
      return {
        evidence: observation.evidence,
        buildSha256: stringValue(observation.buildSha256, 'observation buildSha256'),
      };
    }),
  });
  const observationHashes = graph.observations.map((_, index) => hashes.get(`observations[${index}]`) ?? fail('observation semantic hash is missing'));
  if (new Set(observationHashes).size !== observationHashes.length) fail('graph observations must be a duplicate-free exact set');
  const criticalReviewerIds = new Set<string>();
  const completedReviewerExecutions = new Set<string>();
  for (const label of ['blindLane', 'fidelityLane', 'protocolLane'] as const) {
    const lane = values.get(label) ?? fail(`${label} receipt is missing`);
    if (lane.artDirectionSha256 !== hashes.get('artDirection') || lane.buildSha256 !== buildSha256) fail(`${label} does not bind art direction and build`);
    const observedHashes = new Set(observationHashes);
    const provenance = object(lane.provenance, `${label}.provenance`);
    const laneObservationHashes = array(provenance.observationSha256s, `${label}.provenance.observationSha256s`)
      .map((item, index) => digest(item, `${label}.provenance.observationSha256s[${index}]`));
    if (new Set(laneObservationHashes).size !== laneObservationHashes.length
      || laneObservationHashes.length !== observedHashes.size
      || laneObservationHashes.some((item) => !observedHashes.has(item))) fail(`${label} does not bind the complete duplicate-free observed evidence set`);
    for (const reviewerId of array(provenance.reviewerIds, `${label}.provenance.reviewerIds`)) {
      const reviewer = stringValue(reviewerId, `${label}.provenance.reviewerIds`);
      if (criticalReviewerIds.has(reviewer)) fail('critical reviewer identities must be unique across final lanes');
      criticalReviewerIds.add(reviewer);
    }
    validateCompletedReviewerExecutions(root, fs, invocation, label, lane, completedReviewerExecutions);
    rejectRed(lane, label);
  }
  let predecessor: string | null = null;
  graph.observations.forEach((item, index) => {
    const value = values.get(`observations[${index}]`) ?? fail(`observation ${index} receipt is missing`);
    const claimed = observationPredecessor(value, index);
    if (claimed !== predecessor) fail('observations fork or break predecessor chain');
    if (value.buildSha256 !== buildSha256) fail('observation does not bind build');
    const currentArtifact = object(value.currentArtifact, `observations[${index}].currentArtifact`);
    if (currentArtifact.path !== graph.buildIdentity.path || currentArtifact.sha256 !== graph.buildIdentity.sha256) fail('observation does not bind the exact current build artifact');
    predecessor = hashes.get(`observations[${index}]`) ?? fail('observation receipt semantic hash is missing');
  });
  const motionResolutionSha256 = digest(decision.motionResolutionProjectionSha256, 'art direction motion resolution');
  const motionResolutionPath = resolve(root, '.omd', 'motion-resolutions', `sha256-${motionResolutionSha256}.json`);
  const motionResolutionBytes = readStableRegularFile(root, fs, motionResolutionPath, 'motion resolution');
  const motionResolution = validateMotionResolutionProjection(parseReceipt(motionResolutionBytes, 'motion resolution'));
  if (motionResolutionProjectionSha256(motionResolution) !== motionResolutionSha256
    || motionResolution.motionDecision !== selectedCopyMotion
    || motionResolution.selectionSha256 !== hashes.get('selection')
    || motionResolution.handoffSha256 !== handoff.payloadSha256) fail('motion resolution is not the pre-selection-bound decision settlement');
  const route = stringValue(decision.route, 'art direction route');
  const fallbackRenderedBeatTask = {
    taskId: stringValue(renderedBeats.taskId, 'rendered Beat task'),
    route,
    targets: [stringValue(renderedBeats.target, 'rendered Beat target')],
  };
  const renderedBeatTask = currentTaskEvidence === undefined ? fallbackRenderedBeatTask : (() => {
    const tasks = currentTaskEvidence.tasks.filter((task) => task.production.route === route);
    if (tasks.length !== 1) fail('current task evidence must identify exactly one task for the art-direction motion route');
    const task = tasks[0] ?? fail('current task evidence did not retain its unique route task');
    const targets = [...new Set(currentTaskEvidence.snapshot.probes
      .filter((probe) => probe.taskId === task.id)
      .map((probe) => probe.target))];
    if (targets.length === 0) fail('current task evidence must expose host-authorized motion probe targets');
    return { taskId: task.id, route: task.production.route, targets };
  })();
  const motionTask = currentTaskEvidence === undefined ? undefined : renderedBeatTask;
  let renderedBeatError: unknown;
  let canonicalRenderedBeats: ReturnType<typeof validateRenderedBeatResultAuthority> | undefined;
  for (const target of renderedBeatTask.targets) {
    try {
      canonicalRenderedBeats = validateRenderedBeatResultAuthority(renderedBeats, {
        invocation,
        root,
        buildSha256: digest(buildSha256, 'buildIdentity.buildSha256'),
        artDirectionHash: hashes.get('artDirection') ?? fail('art direction semantic hash is missing'),
        route: renderedBeatTask.route,
        target,
        taskId: renderedBeatTask.taskId,
      });
      break;
    } catch (error) {
      renderedBeatError = error instanceof Error ? error : new Error(String(error));
    }
  }
  const validatedRenderedBeats = canonicalRenderedBeats
    ?? fail(`rendered Beat result is not current and host-authorized: ${renderedBeatError instanceof Error ? renderedBeatError.message : String(renderedBeatError)}`);
  const beatViolations = validatePostRenderBeatProof('', validatedRenderedBeats, { beatIds: decisionBeatIds });
  if (beatViolations.length > 0) fail(`rendered Beat result fails canonical DOM semantics: ${(beatViolations[0] ?? fail('rendered Beat violation disappeared during validation')).message}`);
  try {
    const handoffs = validateDecisionBoundReferenceHandoffs(root, {
      composer: parseReferenceHandoffReceipt(parseReceipt(readStableRegularFile(root, fs, resolve(root, '.omd', 'reference-handoffs', 'composer.json'), 'composer handoff'), 'composer handoff')),
      hand: parseReferenceHandoffReceipt(parseReceipt(readStableRegularFile(root, fs, resolve(root, '.omd', 'reference-handoffs', 'hand.json'), 'hand handoff'), 'hand handoff')),
    });
    if (handoffs.composer.motionResolutionProjectionSha256 !== motionResolutionSha256
      || handoffs.composer.settledSelectionSha256 !== hashes.get('settledSelection')) {
      fail('composer and hand handoffs do not bind the settled selection');
    }
  } catch (error) {
    if (error instanceof FinalEvidenceGraphError) throw error;
    fail(`decision-bound handoff validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const branch = graph.artDirection.path; // force graph root to include branch-relevant artifacts, not caller supplied hashes.
  if (branch.length === 0) fail('missing art direction receipt');
  return {
    graph,
    rootHash: createHash('sha256').update(canonical({ graph, currentFrameSha256 })).digest('hex'),
    bindings: {
      branch: 'art-selected',
      activation,
      artDirectionSha256: hashes.get('artDirection') ?? fail('art direction semantic hash is missing'),
      selectionSha256: hashes.get('selection') ?? fail('selection semantic hash is missing'),
      settledSelectionSha256: hashes.get('settledSelection') ?? fail('settled selection semantic hash is missing'),
      handoffSha256: handoff.payloadSha256,
      buildSha256: digest(buildSha256, 'buildIdentity.buildSha256'),
      allowedMotionReferenceSlotIds: motionResolution.slots
        .filter((slot) => slot.obligationDisposition === 'used')
        .map((slot) => slot.slotId),
      ...(motionResolution.approvedRecipe === undefined ? {} : { approvedMotionRecipe: motionResolution.approvedRecipe }),
      ...(motionTask === undefined ? {} : { motionTask }),
    },
  };
}

export const canonicalFinalEvidenceV2Graph = canonical;
