import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { validateActivationContext } from '../runtime/activation.ts';
import type { ActivationContext } from '../runtime/activation.ts';
import { intentLedgerSha256, resolveCurrentUserBeatExceptionReceipt, validateIntentLedger, validateIntentCurrentPointer } from '../runtime/intent.ts';
import { validateSourceSeal } from '../source-seal/index.ts';
import { parseReferenceBoard } from '../ref/board-parser.ts';
import { parseReferenceHandoffReceipt, referenceHandoffPayloadSha256, validateDecisionBoundReferenceHandoffs } from '../ref/reference-handoff.ts';
import { motionResolutionProjectionSha256, parseReferenceSelectionV2, referenceSelectionV2Sha256, validateMotionResolutionProjection, validateReferenceSelectionV2 } from '../ref/reference-selection.ts';
import { parseReferenceUsageV2, readValidatedReferenceUsage, referenceUsageV2Sha256 } from '../ref/reference-usage-snapshot.ts';
import { artDirectionSha256, validateArtDirectionRecord } from '../art-direction/schema.ts';
import { NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256, exceedsCanonicalBeatBudget } from '../art-direction/decision.ts';
import { validateCanonicalCopyDeckReceipt } from '../copy/index.ts';
import { requireFinalReviewerLaneAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { checkFrameUx, normalizeUxSurface } from '../frame/check-ux.ts';
import { checkTaskEvidence } from './task.ts';

export const FINAL_EVIDENCE_V2_GRAPH_SCHEMA = 'final-evidence-v2-graph' as const;
const SHA256 = /^[a-f0-9]{64}$/;

export type ArtifactReceipt = Readonly<{ path: string; schema: string; sha256: string }>;
export type FinalEvidenceV2Graph = Readonly<{
  schema: typeof FINAL_EVIDENCE_V2_GRAPH_SCHEMA;
  activation: ArtifactReceipt;
  intent: ArtifactReceipt;
  artDirection: ArtifactReceipt;
  board: ArtifactReceipt;
  selection: ArtifactReceipt;
  settledSelection: ArtifactReceipt;
  handoff: ArtifactReceipt;
  usage: ArtifactReceipt;
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
export type FinalEvidenceV2GraphBindings = Readonly<{
  readonly activation: ActivationContext;
  readonly artDirectionSha256: string;
  readonly selectionSha256: string;
  readonly settledSelectionSha256: string;
  readonly handoffSha256: string;
  readonly buildSha256: string;
  readonly allowedMotionReferenceSlotIds: readonly string[];
  readonly approvedMotionRecipe?: Readonly<{ recipeId: string; recipeSha256: string }>;
}>;

export interface EvidenceGraphFs {
  readFile(path: string | number): Buffer;
  lstat(path: string): { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; dev?: number; ino?: number };
  open(path: string, flags: number, mode: number): number;
  fstat(fd: number): { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; dev?: number; ino?: number };
  close(fd: number): void;
}

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
  artDirection: ['art-direction-record-v2'],
  board: ['reference-board-v1'],
  selection: ['reference-selection-v2'],
  settledSelection: ['reference-selection-v2'],
  handoff: ['reference-handoff-v2'],
  usage: ['reference-usage-v2'],
  copy: ['copy-deck-receipt-v1'],
  renderedBeats: ['rendered-beat-receipt-v1'],
  sourceSeal: ['source-seal-v1'],
  buildIdentity: ['omd-build-identity-v1'],
  blindLane: ['blind-review-v1'],
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
  if (path.startsWith('/') || path.includes('\\') || path === '.' || path.split('/').includes('..')) fail(`${label}.path must be a project-relative path`);
  const supported = RECEIPT_SCHEMAS[label] ?? fail(`${label} has no typed production artifact contract`);
  if (!supported.includes(schema)) fail(`${label}.schema is not an accepted production artifact type`);
  return { path, schema, sha256: digest(item.sha256, `${label}.sha256`) };
}

export function validateFinalEvidenceV2Graph(value: unknown): FinalEvidenceV2Graph {
  const graph = object(value, 'graph');
  const keys = ['schema', 'activation', 'intent', 'artDirection', 'board', 'selection', 'settledSelection', 'handoff', 'usage', 'copy', 'renderedBeats', 'sourceSeal', 'buildIdentity', 'blindLane', 'fidelityLane', 'protocolLane', 'taskEvidence', 'observations'].filter((key) => key in graph);
  exact(graph, keys, 'graph');
  if (graph.schema !== FINAL_EVIDENCE_V2_GRAPH_SCHEMA) fail('unsupported graph schema');
  const observations = array(graph.observations, 'graph.observations');
  if (observations.length === 0) fail('graph requires a non-empty observation chain');
  const result = {
    schema: FINAL_EVIDENCE_V2_GRAPH_SCHEMA,
    activation: receipt(graph.activation, 'activation'), intent: receipt(graph.intent, 'intent'), artDirection: receipt(graph.artDirection, 'artDirection'),
    board: receipt(graph.board, 'board'), selection: receipt(graph.selection, 'selection'), settledSelection: receipt(graph.settledSelection, 'settledSelection'), handoff: receipt(graph.handoff, 'handoff'), usage: receipt(graph.usage, 'usage'),
    copy: receipt(graph.copy, 'copy'), renderedBeats: receipt(graph.renderedBeats, 'renderedBeats'), sourceSeal: receipt(graph.sourceSeal, 'sourceSeal'), buildIdentity: receipt(graph.buildIdentity, 'buildIdentity'),
    blindLane: receipt(graph.blindLane, 'blindLane'), fidelityLane: receipt(graph.fidelityLane, 'fidelityLane'), protocolLane: receipt(graph.protocolLane, 'protocolLane'),
    ...(graph.taskEvidence === undefined ? {} : { taskEvidence: receipt(graph.taskEvidence, 'taskEvidence') }),
    observations: observations.map((item: unknown, index: number) => receipt(item, 'observation')),
  } as const;
  const paths = [
    result.activation, result.intent, result.artDirection, result.board, result.selection, result.settledSelection, result.handoff, result.usage,
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
    case 'handoff': {
      const { payloadSha256, ...receipt } = parseReferenceHandoffReceipt(value);
      if (referenceHandoffPayloadSha256(receipt) !== payloadSha256) fail('handoff semantic hash is invalid');
      return payloadSha256;
    }
    default: return createHash('sha256').update(canonical(value)).digest('hex');
  }
}
function requireRealReceiptAncestors(root: string, path: string, fs: EvidenceGraphFs, label: string): void {
  let current = root;
  const segments = relative(root, path).split('/');
  for (const segment of segments.slice(0, -1)) {
    current = resolve(current, segment);
    const stat = fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} has a symlink or non-directory ancestor`);
  }
}
function sameFileIdentity(left: { dev?: number; ino?: number }, right: { dev?: number; ino?: number }): boolean {
  return left.dev !== undefined && left.ino !== undefined && left.dev === right.dev && left.ino === right.ino;
}
function readStableRegularFile(root: string, fs: EvidenceGraphFs, path: string, label: string): Buffer {
  requireRealReceiptAncestors(root, path, fs, label);
  const before = fs.lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) fail(`${label} is not a regular receipt file`);
  const fd = fs.open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW, 0o600);
  try {
    const opened = fs.fstat(fd);
    const entry = fs.lstat(path);
    if (!opened.isFile() || !entry.isFile() || entry.isSymbolicLink() || !sameFileIdentity(opened, entry)) {
      fail(`${label} changed or is not a regular receipt file`);
    }
    const bytes = fs.readFile(fd);
    requireRealReceiptAncestors(root, path, fs, label);
    const current = fs.lstat(path);
    if (!current.isFile() || current.isSymbolicLink() || !sameFileIdentity(opened, current)) {
      fail(`${label} changed while it was read`);
    }
    return bytes;
  } finally {
    fs.close(fd);
  }
}
function readReceipt(root: string, fs: EvidenceGraphFs, receipt: ArtifactReceipt, label: string): { bytes: Buffer; byteHash: string; semanticHash: string; value: Record<string, unknown> } {
  const path = resolve(root, receipt.path);
  const outside = relative(root, path);
  if (outside === '' || outside.startsWith('..') || resolve(root, outside) !== path) fail(`${label} escapes the project root`);
  const rootStat = fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('project root is not a real directory');
  requireRealReceiptAncestors(root, path, fs, label);
  const stat = fs.lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} is not a regular receipt file`);
  const bytes = fs.readFile(path);
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
      case 'renderedBeats': {
        exact(value, ['schema', 'artDirectionHash', 'copyDeckSha256', 'beatIds', 'renderedBeats', 'captureViewports'], 'renderedBeats');
        if (value.schema !== 'rendered-beat-receipt-v1') fail('renderedBeats schema changed');
        digest(value.artDirectionHash, 'renderedBeats.artDirectionHash');
        digest(value.copyDeckSha256, 'renderedBeats.copyDeckSha256');
        const beatIds = array(value.beatIds, 'renderedBeats.beatIds');
        if (beatIds.length === 0 || new Set(beatIds).size !== beatIds.length || beatIds.some((id, index) => !/^B-\d+$/.test(stringValue(id, `renderedBeats.beatIds[${index}]`)))) fail('renderedBeats has invalid Beat identities');
        const viewports = array(value.captureViewports, 'renderedBeats.captureViewports');
        const viewportKeys = new Set(viewports.map((viewport, index) => {
          const item = object(viewport, `renderedBeats.captureViewports[${index}]`);
          exact(item, ['width', 'height'], `renderedBeats.captureViewports[${index}]`);
          return `${item.width}x${item.height}`;
        }));
        if (viewports.length !== 2 || viewportKeys.size !== 2 || !viewportKeys.has('1280x900') || !viewportKeys.has('390x844')) fail('renderedBeats must bind the canonical desktop and mobile viewports');
        const beats = array(value.renderedBeats, 'renderedBeats.renderedBeats');
        if (beats.length !== beatIds.length * 2) fail('renderedBeats must observe every Beat at both canonical viewports');
        const observed = new Set<string>();
        for (const [index, beat] of beats.entries()) {
          const item = object(beat, `renderedBeats.renderedBeats[${index}]`);
          exact(item, ['id', 'boundary', 'distinctRegions', 'ancestorBeatIds', 'rendered', 'observedViewport'], `renderedBeats.renderedBeats[${index}]`);
          const viewport = object(item.observedViewport, `renderedBeats.renderedBeats[${index}].observedViewport`);
          exact(viewport, ['width', 'height'], `renderedBeats.renderedBeats[${index}].observedViewport`);
          const id = stringValue(item.id, `renderedBeats.renderedBeats[${index}].id`);
          const viewportKey = `${viewport.width}x${viewport.height}`;
          if (!beatIds.includes(id) || item.boundary !== true || item.distinctRegions !== 0 || !Array.isArray(item.ancestorBeatIds) || item.ancestorBeatIds.length !== 0 || item.rendered !== true || !viewportKeys.has(viewportKey) || observed.has(`${id}@${viewportKey}`)) fail('renderedBeats contains a hidden, nested, merged, duplicate, or non-canonical Beat observation');
          observed.add(`${id}@${viewportKey}`);
        }
        return;
      }
      case 'sourceSeal': {
        exact(value, ['schemaVersion', 'sealedAt', 'inputs', 'sources'], 'sourceSeal');
        if (value.schemaVersion !== 1) fail('sourceSeal schema changed');
        stringValue(value.sealedAt, 'sourceSeal.sealedAt');
        const inputs = object(value.inputs, 'sourceSeal.inputs');
        exact(inputs, ['copyDeckSha256', 'typeProofSha256', 'compositionSha256'], 'sourceSeal.inputs');
        for (const key of ['copyDeckSha256', 'typeProofSha256', 'compositionSha256'] as const) digest(inputs[key], `sourceSeal.inputs.${key}`);
        const sources = array(value.sources, 'sourceSeal.sources');
        for (const [index, source] of sources.entries()) {
          const item = object(source, `sourceSeal.sources[${index}]`);
          exact(item, ['path', 'sha256'], `sourceSeal.sources[${index}]`);
          stringValue(item.path, `sourceSeal.sources[${index}].path`);
          digest(item.sha256, `sourceSeal.sources[${index}].sha256`);
        }
        return;
      }
      case 'blindLane':
      case 'fidelityLane':
      case 'protocolLane': {
        exact(value, ['schema', 'artDirectionSha256', 'buildSha256', 'isolationReceipt', 'verdicts', 'criticalFloors', 'quorum', 'provenance'], label);
        digest(value.artDirectionSha256, `${label}.artDirectionSha256`);
        digest(value.buildSha256, `${label}.buildSha256`);
        const isolation = object(value.isolationReceipt, `${label}.isolationReceipt`);
        exact(isolation, ['schema', 'sha256'], `${label}.isolationReceipt`);
        if (isolation.schema !== 'reviewer-isolation-v1') fail(`${label} requires an isolation receipt`);
        digest(isolation.sha256, `${label}.isolationReceipt.sha256`);
        const verdicts = object(value.verdicts, `${label}.verdicts`);
        const verdictValues = Object.values(verdicts);
        if (verdictValues.length < 2 || verdictValues.some((verdict) => verdict !== 'GREEN')) fail(`${label} requires conjunctive independent GREEN verdicts`);
        const floors = object(value.criticalFloors, `${label}.criticalFloors`);
        if (Object.keys(floors).length === 0 || Object.values(floors).some((floor) => typeof floor !== 'number' || !Number.isFinite(floor) || floor < 3)) fail(`${label} critical floors are invalid`);
        const quorum = object(value.quorum, `${label}.quorum`);
        exact(quorum, ['required', 'passed'], `${label}.quorum`);
        const required = quorum.required;
        const passed = quorum.passed;
        if (typeof required !== 'number' || typeof passed !== 'number'
          || !Number.isSafeInteger(required) || !Number.isSafeInteger(passed)
          || required < 2 || passed < required) fail(`${label} quorum is not satisfied`);
        const provenance = object(value.provenance, `${label}.provenance`);
        exact(provenance, ['observationSha256s', 'reviewerIds'], `${label}.provenance`);
        const observations = array(provenance.observationSha256s, `${label}.provenance.observationSha256s`);
        const reviewers = array(provenance.reviewerIds, `${label}.provenance.reviewerIds`);
        if (observations.length === 0 || reviewers.length < 2) fail(`${label} provenance is incomplete`);
        observations.forEach((item, index) => digest(item, `${label}.provenance.observationSha256s[${index}]`));
        reviewers.forEach((item, index) => stringValue(item, `${label}.provenance.reviewerIds[${index}]`));
        return;
      }
      case 'observation': {
        exact(value, ['schema', 'buildSha256', 'predecessorSha256', 'observedAt'], 'observation');
        digest(value.buildSha256, 'observation.buildSha256');
        if (value.predecessorSha256 !== null) digest(value.predecessorSha256, 'observation.predecessorSha256');
        stringValue(value.observedAt, 'observation.observedAt');
        return;
      }
      case 'taskEvidence': {
        exact(value, ['schemaVersion', 'surface', 'frame', 'composition', 'tasks'], 'taskEvidence');
        if (value.schemaVersion !== 1 || (value.surface !== 'product' && value.surface !== 'mixed')) fail('taskEvidence schema changed');
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

export function validateFinalEvidenceV2GraphFiles(root: string, graphInput: unknown, fs: EvidenceGraphFs, invocation: ProjectRunInvocation): { graph: FinalEvidenceV2Graph; rootHash: string; bindings: FinalEvidenceV2GraphBindings } {
  const graph = validateFinalEvidenceV2Graph(graphInput);
  const entries: ReadonlyArray<readonly [string, ArtifactReceipt]> = [
    ['activation', graph.activation], ['intent', graph.intent], ['artDirection', graph.artDirection], ['board', graph.board],
    ['selection', graph.selection], ['settledSelection', graph.settledSelection], ['handoff', graph.handoff], ['usage', graph.usage], ['copy', graph.copy],
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
    const currentHandoff = parseReferenceHandoffReceipt(parseReceipt(fs.readFile(resolve(root, '.omd', 'reference-handoffs', 'art-direction.json')), 'current art-direction handoff'));
    const currentUsage = readValidatedReferenceUsage(root);
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
    requireRealReceiptAncestors(root, pointerPath, fs, 'intent current pointer');
    const pointer = validateIntentCurrentPointer(parseReceipt(fs.readFile(pointerPath), 'intent current pointer'));
    if (`.omd/${pointer.record}` !== graph.intent.path || pointer.sha256 !== hashes.get('intent')) {
      fail('intent receipt is not the current immutable ledger');
    }
    const boardPath = resolve(root, '.omd', 'reference-board.json');
    requireRealReceiptAncestors(root, boardPath, fs, 'current reference board');
    if (semanticHash('board', parseReceipt(fs.readFile(boardPath), 'current reference board')) !== hashes.get('board')) {
      fail('board receipt is not the current canonical board');
    }
  } catch (error) {
    if (error instanceof FinalEvidenceGraphError) throw error;
    fail(`current intent or board validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const framePath = resolve(root, '.omd', 'frame.md');
  const frameBytes = readStableRegularFile(root, fs, framePath, 'current frame');
  const currentFrameSha256 = createHash('sha256').update(frameBytes).digest('hex');
  const frameMatch = /^---\n([\s\S]*?)\n---/.exec(frameBytes.toString('utf8'));
  const frame = frameMatch === null ? {} : object(parse(frameMatch[1] ?? '') ?? {}, 'frame frontmatter');
  const frameUxViolations = checkFrameUx(root);
  if (frameUxViolations.length > 0) {
    fail(`current frame fails UX contract: ${frameUxViolations.map((violation) => violation.id).join(', ')}`);
  }
  const surface = normalizeUxSurface(frame.uxSurface);
  if (surface === null) fail('frame does not expose a supported uxSurface');
  const taskEvidence = graph.taskEvidence;
  if (surface === 'product' || surface === 'mixed') {
    if (taskEvidence === undefined) fail(`${surface} final publication requires current task evidence`);
    if ((taskEvidence ?? fail('task evidence receipt is missing')).path !== '.omd/task-evidence.json') fail('task evidence receipt must identify the current canonical task evidence');
    try {
      const currentTask = checkTaskEvidence(root);
      if (currentTask.surface !== surface || currentTask.frame.sha256 !== currentFrameSha256
        || canonical(currentTask) !== canonical(values.get('taskEvidence') ?? fail('task evidence receipt is missing'))) {
        fail('task evidence receipt is not the current validated task evidence');
      }
    } catch (error) {
      if (error instanceof FinalEvidenceGraphError) throw error;
      fail(`current task evidence validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (taskEvidence !== undefined) {
    fail(`${surface} final publication must not include task evidence`);
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
  requireRealReceiptAncestors(root, copyDeckPath, fs, 'canonical copy deck');
  const copyDeckStat = fs.lstat(copyDeckPath);
  if (!copyDeckStat.isFile() || copyDeckStat.isSymbolicLink()) fail('canonical copy deck is not a regular file');
  const copyDeckBytes = fs.readFile(copyDeckPath);
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
  if (renderedBeats.artDirectionHash !== hashes.get('artDirection')
    || renderedBeats.copyDeckSha256 !== createHash('sha256').update(copyDeckBytes).digest('hex')) {
    fail('rendered Beats do not bind the current art direction and copy output');
  }
  const renderedBeatIds = array(renderedBeats.beatIds, 'renderedBeats.beatIds').map((beat, index) => stringValue(beat, `renderedBeats.beatIds[${index}]`));
  if (renderedBeatIds.length !== decisionBeatIds.length || renderedBeatIds.some((beat) => !decisionBeatIds.includes(beat))) fail('rendered Beats do not cover exactly the decision-bound Beat identities');
  const sourceSeal = values.get('sourceSeal') ?? fail('source seal receipt is missing');
  if (object(sourceSeal.inputs, 'sourceSeal.inputs').copyDeckSha256 !== createHash('sha256').update(copyDeckBytes).digest('hex')) fail('source seal does not bind copy output bytes');
  if (graph.sourceSeal.path !== '.omd/source-seal.json' || validateSourceSeal(root).length !== 0) fail('source seal is not the current canonical source snapshot');
  const sealedSources = array(sourceSeal.sources, 'sourceSeal.sources').map((source, index) => digest(object(source, `sourceSeal.sources[${index}]`).sha256, `sourceSeal.sources[${index}].sha256`));
  if (!sealedSources.includes(activation.briefSha256) || !sealedSources.includes(activation.loadedSkillSha256)) {
    fail('source seal does not bind the active task brief and loaded skill identities');
  }
  for (const label of ['blindLane', 'fidelityLane', 'protocolLane'] as const) {
    const lane = values.get(label) ?? fail(`${label} receipt is missing`);
    if (lane.artDirectionSha256 !== hashes.get('artDirection') || lane.buildSha256 !== buildSha256) fail(`${label} does not bind art direction and build`);
    const observedHashes = new Set(graph.observations.map((_, index) => hashes.get(`observations[${index}]`) ?? fail('observation semantic hash is missing')));
    const laneObservationHashes = array(object(lane.provenance, `${label}.provenance`).observationSha256s, `${label}.provenance.observationSha256s`);
    if (laneObservationHashes.length !== observedHashes.size || laneObservationHashes.some((item) => typeof item !== 'string' || !observedHashes.has(item))) fail(`${label} does not bind the complete observed evidence chain`);
    rejectRed(lane, label);
  }
  let predecessor: string | null = null;
  graph.observations.forEach((item, index) => {
    const value = values.get(`observations[${index}]`) ?? fail(`observation ${index} receipt is missing`);
    const claimed = observationPredecessor(value, index);
    if (claimed !== predecessor) fail('observations fork or break predecessor chain');
    if (value.buildSha256 !== buildSha256) fail('observation does not bind build');
    predecessor = hashes.get(`observations[${index}]`) ?? fail('observation receipt semantic hash is missing');
  });
  const motionResolutionSha256 = digest(decision.motionResolutionProjectionSha256, 'art direction motion resolution');
  const motionResolutionPath = resolve(root, '.omd', 'motion-resolutions', `sha256-${motionResolutionSha256}.json`);
  requireRealReceiptAncestors(root, motionResolutionPath, fs, 'motion resolution');
  const motionResolutionStat = fs.lstat(motionResolutionPath);
  if (!motionResolutionStat.isFile() || motionResolutionStat.isSymbolicLink()) fail('motion resolution is not a regular receipt file');
  const motionResolutionBytes = fs.readFile(motionResolutionPath);
  const motionResolution = validateMotionResolutionProjection(parseReceipt(motionResolutionBytes, 'motion resolution'));
  if (motionResolutionProjectionSha256(motionResolution) !== motionResolutionSha256
    || motionResolution.motionDecision !== selectedCopyMotion
    || motionResolution.selectionSha256 !== hashes.get('selection')
    || motionResolution.handoffSha256 !== handoff.payloadSha256) fail('motion resolution is not the pre-selection-bound decision settlement');
  try {
    const handoffs = validateDecisionBoundReferenceHandoffs({
      composer: parseReferenceHandoffReceipt(parseReceipt(readStableRegularFile(root, fs, resolve(root, '.omd', 'reference-handoffs', 'composer.json'), 'composer handoff'), 'composer handoff')),
      hand: parseReferenceHandoffReceipt(parseReceipt(readStableRegularFile(root, fs, resolve(root, '.omd', 'reference-handoffs', 'hand.json'), 'hand handoff'), 'hand handoff')),
    }, hashes.get('artDirection') ?? fail('art direction semantic hash is missing'));
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
    },
  };
}

export const canonicalFinalEvidenceV2Graph = canonical;
