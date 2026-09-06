import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import type { EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import type { TaskOutcomeContract } from '../brief/task-outcome.ts';
import { validateDecisionGraph } from '../deliberation/contracts.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { parseTaskFlowBenchmarkProjection } from '../ref/task-flow-benchmark.ts';
import {
  parseTrustedBrowserReceipt,
  trustedBrowserReceiptSha256,
} from '../runtime/trusted-browser-receipt.ts';
import {
  deriveTrustedDecisionRefs,
  deriveTrustedEvaluationIdentity,
} from '../runtime/trusted-evaluation-contract.ts';
import { requireProductProbeResultAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { redactObservationEvidence } from '../runtime/observation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';

export type FinalOutcomeGateErrorCode =
  | 'MALFORMED_FINAL_OUTCOME_EVALUATION'
  | 'STALE_FINAL_OUTCOME_PRODUCTION'
  | 'FINAL_BEHAVIOR_FAILED'
  | 'FINAL_ACCESS_FAILED'
  | 'FINAL_SAFETY_FAILED'
  | 'FINAL_REQUIRED_OUTCOME_FAILED'
  | 'MISSING_FINAL_OUTCOME_EVALUATION'
  | 'STALE_FINAL_OUTCOME_BINDING'
  | 'STALE_FINAL_OUTCOME_CAPTURE'
  | 'STALE_FINAL_OUTCOME_DECISION_GRAPH'
  | 'STALE_FINAL_OUTCOME_REFS'
  | 'UNAUTHORIZED_FINAL_OUTCOME_RECEIPT';

export class FinalOutcomeGateError extends Error {
  readonly code: FinalOutcomeGateErrorCode;

  constructor(code: FinalOutcomeGateErrorCode) {
    super(code);
    this.name = 'FinalOutcomeGateError';
    this.code = code;
  }
}

export type TrustedOutcomeProjection = Readonly<{
  schema: 'trusted-outcome-observation-v1';
  receiptSha256: string;
  routeSha256: string;
  sourceContractSha256: string;
  activationBuildSha256: string;
  productionRevisionSha256: string;
  outcomeResults: readonly Readonly<{
    outcomeRef: string;
    status: 'pass' | 'fail';
    findings: readonly string[];
  }>[];
  confirmedClaimRefs: readonly string[];
  decisionRefs: readonly string[];
  hardFloors: Readonly<{
    behavior: 'pass' | 'fail';
    access: 'pass' | 'fail';
    safety: 'pass' | 'fail';
  }>;
  captureSha256s: readonly string[];
  transcriptSha256: string;
  entrySurface?: Readonly<{
    benchmarkProjectionSha256: string;
    prerequisiteTaskId: string;
    dependentTaskId: string;
    status: 'pass' | 'fail';
  }>;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const OUTCOME_KEYS = new Set(['outcomeRef', 'status', 'findings']);
const FLOOR_KEYS = new Set(['behavior', 'access', 'safety']);
const PROJECTION_KEYS = new Set([
  'schema',
  'receiptSha256',
  'routeSha256',
  'sourceContractSha256',
  'activationBuildSha256',
  'productionRevisionSha256',
  'outcomeResults',
  'confirmedClaimRefs',
  'decisionRefs',
  'hardFloors',
  'captureSha256s',
  'transcriptSha256',
]);
const ENTRY_PROJECTION_KEYS = new Set([...PROJECTION_KEYS, 'entrySurface']);
const ENTRY_SURFACE_KEYS = new Set([
  'benchmarkProjectionSha256',
  'prerequisiteTaskId',
  'dependentTaskId',
  'status',
]);

const fail = (code: FinalOutcomeGateErrorCode): never => {
  throw new FinalOutcomeGateError(code);
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: ReadonlySet<string>): void {
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.size || own.some((key) => typeof key !== 'string' || !keys.has(key))) {
    return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  }
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  }
  return value;
}

function strings(value: unknown, sha256 = false, allowEmpty = false, unique = true): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  }
  const items = value.map((item) => {
    if (typeof item !== 'string' || item === '' || (sha256 && !SHA256.test(item))) {
      return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
    }
    return item;
  });
  if (unique && new Set(items).size !== items.length) return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  return Object.freeze(items);
}

export function parseTrustedOutcomeProjection(value: unknown): TrustedOutcomeProjection {
  const input = record(value);
  exact(
    input,
    Object.hasOwn(input, 'entrySurface') ? ENTRY_PROJECTION_KEYS : PROJECTION_KEYS,
  );
  if (input.schema !== 'trusted-outcome-observation-v1') {
    return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  }
  if (!Array.isArray(input.outcomeResults) || input.outcomeResults.length === 0) {
    return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  }
  const outcomeResults = input.outcomeResults.map((candidate) => {
    const outcome = record(candidate);
    exact(outcome, OUTCOME_KEYS);
    if (typeof outcome.outcomeRef !== 'string' || outcome.outcomeRef === ''
      || (outcome.status !== 'pass' && outcome.status !== 'fail')
      || !Array.isArray(outcome.findings)
      || outcome.findings.some((finding) => typeof finding !== 'string' || finding === '')
      || (outcome.status === 'pass' && outcome.findings.length !== 0)
      || (outcome.status === 'fail' && outcome.findings.length === 0)) {
      return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
    }
    return Object.freeze({
      outcomeRef: outcome.outcomeRef,
      status: outcome.status,
      findings: Object.freeze([...outcome.findings]) as readonly string[],
    });
  });
  if (new Set(outcomeResults.map((result) => result.outcomeRef)).size !== outcomeResults.length) {
    return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  }
  const hardFloors = record(input.hardFloors);
  exact(hardFloors, FLOOR_KEYS);
  for (const value of Object.values(hardFloors)) {
    if (value !== 'pass' && value !== 'fail') return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
  }
  const entrySurface = input.entrySurface === undefined
    ? undefined
    : (() => {
      const entry = record(input.entrySurface);
      exact(entry, ENTRY_SURFACE_KEYS);
      if (typeof entry.prerequisiteTaskId !== 'string' || entry.prerequisiteTaskId === ''
        || typeof entry.dependentTaskId !== 'string' || entry.dependentTaskId === ''
        || (entry.status !== 'pass' && entry.status !== 'fail')) {
        return fail('MALFORMED_FINAL_OUTCOME_EVALUATION');
      }
      return Object.freeze({
        benchmarkProjectionSha256: digest(entry.benchmarkProjectionSha256),
        prerequisiteTaskId: entry.prerequisiteTaskId,
        dependentTaskId: entry.dependentTaskId,
        status: entry.status,
      });
    })();
  return Object.freeze({
    schema: 'trusted-outcome-observation-v1',
    receiptSha256: digest(input.receiptSha256),
    routeSha256: digest(input.routeSha256),
    sourceContractSha256: digest(input.sourceContractSha256),
    activationBuildSha256: digest(input.activationBuildSha256),
    productionRevisionSha256: digest(input.productionRevisionSha256),
    outcomeResults: Object.freeze(outcomeResults),
    confirmedClaimRefs: strings(input.confirmedClaimRefs, false, true),
    decisionRefs: strings(input.decisionRefs),
    hardFloors: Object.freeze({
      behavior: hardFloors.behavior as 'pass' | 'fail',
      access: hardFloors.access as 'pass' | 'fail',
      safety: hardFloors.safety as 'pass' | 'fail',
    }),
    captureSha256s: strings(input.captureSha256s, true, false, false),
    transcriptSha256: digest(input.transcriptSha256),
    ...(entrySurface === undefined ? {} : { entrySurface }),
  });
}

export function validateFinalOutcomeGate(input: Readonly<{
  branch: 'art-selected' | 'adaptive-omission';
  trustedOutcome: unknown;
  expectedProductionRevisionSha256: string;
}>): Readonly<{ branch: typeof input.branch; productionRevisionSha256: string }> {
  const outcome = parseTrustedOutcomeProjection(input.trustedOutcome);
  if (outcome.productionRevisionSha256 !== input.expectedProductionRevisionSha256) {
    return fail('STALE_FINAL_OUTCOME_PRODUCTION');
  }
  if (outcome.hardFloors.behavior === 'fail') return fail('FINAL_BEHAVIOR_FAILED');
  if (outcome.hardFloors.access === 'fail') return fail('FINAL_ACCESS_FAILED');
  if (outcome.entrySurface?.status === 'fail') return fail('FINAL_ACCESS_FAILED');
  if (outcome.hardFloors.safety === 'fail') return fail('FINAL_SAFETY_FAILED');
  if (outcome.outcomeResults.some((result) => result.status === 'fail')) {
    return fail('FINAL_REQUIRED_OUTCOME_FAILED');
  }
  return Object.freeze({
    branch: input.branch,
    productionRevisionSha256: outcome.productionRevisionSha256,
  });
}

export function validateTrustedOutcomeEvidence(
  input: Readonly<{
    root: string;
    branch: 'art-selected' | 'adaptive-omission';
    observations: readonly Readonly<{ evidence: unknown; buildSha256: string }>[];
    required: boolean;
    invocation?: ProjectRunInvocation;
    expected?: Readonly<{
      routeSha256?: string;
      sourceContractSha256?: string;
      buildSha256: string;
      sourceContract?: Readonly<{
        taskOutcome: TaskOutcomeContract;
        evidenceClaims: EvidenceClaimPublication;
        allowedPaths: readonly string[];
      }>;
      requiredOutcomeRefs?: readonly string[];
      confirmedClaimRefs?: readonly string[];
      decisionRefs?: readonly string[];
      entrySurfaceRequired?: boolean;
    }>;
  }>,
): void {
  const latest = input.observations.at(-1);
  if (latest === undefined || typeof latest.evidence !== 'object' || latest.evidence === null) {
    if (input.required) return fail('MISSING_FINAL_OUTCOME_EVALUATION');
    return;
  }
  const outcome = (latest.evidence as Record<string, unknown>).trustedOutcome;
  if (outcome === undefined) {
    if (input.required) return fail('MISSING_FINAL_OUTCOME_EVALUATION');
    return;
  }
  const parsed = parseTrustedOutcomeProjection(outcome);
  const receiptPath = `.omd/trusted-browser-receipt-sha256-${parsed.receiptSha256}.json`;
  let receiptBytes: Buffer;
  try {
    receiptBytes = readStableProjectFile({
      root: input.root,
      path: resolve(input.root, receiptPath),
      label: 'trusted final outcome receipt',
      fs: nodeStableProjectFileSystem(),
    });
  } catch {
    return fail('UNAUTHORIZED_FINAL_OUTCOME_RECEIPT');
  }
  if (input.invocation === undefined) return fail('UNAUTHORIZED_FINAL_OUTCOME_RECEIPT');
  try {
    requireProductProbeResultAuthorization(input.invocation, input.root, receiptBytes);
  } catch {
    return fail('UNAUTHORIZED_FINAL_OUTCOME_RECEIPT');
  }
  let receipt;
  try {
    receipt = parseTrustedBrowserReceipt(JSON.parse(receiptBytes.toString('utf8')) as unknown);
  } catch {
    return fail('UNAUTHORIZED_FINAL_OUTCOME_RECEIPT');
  }
  if (trustedBrowserReceiptSha256(receipt) !== parsed.receiptSha256
    || receipt.routeSha256 !== parsed.routeSha256
    || receipt.sourceContractSha256 !== parsed.sourceContractSha256
    || receipt.activationBuildSha256 !== parsed.activationBuildSha256
    || receipt.productionRevisionSha256 !== parsed.productionRevisionSha256
    || canonicalJson(redactObservationEvidence(receipt.outcomeResults)) !== canonicalJson(parsed.outcomeResults)
    || canonicalJson(redactObservationEvidence(receipt.confirmedClaimRefs)) !== canonicalJson(parsed.confirmedClaimRefs)
    || canonicalJson(redactObservationEvidence(receipt.decisionRefs)) !== canonicalJson(parsed.decisionRefs)
    || canonicalJson(receipt.hardFloors) !== canonicalJson(parsed.hardFloors)
    || canonicalJson(receipt.entrySurface ?? null) !== canonicalJson(parsed.entrySurface ?? null)
    || canonicalJson(receipt.captures.map((capture) => capture.sha256)) !== canonicalJson(parsed.captureSha256s)
    || createHash('sha256').update(canonicalJson(receipt.transcript)).digest('hex') !== parsed.transcriptSha256) {
    return fail('UNAUTHORIZED_FINAL_OUTCOME_RECEIPT');
  }
  if (input.expected?.entrySurfaceRequired === true) {
    const entrySurface = parsed.entrySurface;
    if (entrySurface === undefined || entrySurface.status !== 'pass') {
      return fail('FINAL_ACCESS_FAILED');
    }
    let projectionBytes: Buffer;
    try {
      projectionBytes = readStableProjectFile({
        root: input.root,
        path: resolve(input.root, '.omd/task-flow-benchmark-projection.json'),
        label: 'trusted final entry-surface benchmark projection',
        fs: nodeStableProjectFileSystem(),
      });
    } catch {
      return fail('STALE_FINAL_OUTCOME_BINDING');
    }
    if (createHash('sha256').update(projectionBytes).digest('hex')
      !== entrySurface.benchmarkProjectionSha256) {
      return fail('STALE_FINAL_OUTCOME_BINDING');
    }
    let projection;
    try {
      projection = parseTaskFlowBenchmarkProjection(
        JSON.parse(projectionBytes.toString('utf8')) as unknown,
        input.expected.sourceContractSha256 === undefined
          ? {}
          : { expectedSourceContractSha256: input.expected.sourceContractSha256 },
      );
    } catch {
      return fail('STALE_FINAL_OUTCOME_BINDING');
    }
    const dependent = projection.taskSteps.find(({ id }) =>
      id === entrySurface.dependentTaskId);
    if (dependent === undefined
      || !dependent.dependsOn.includes(entrySurface.prerequisiteTaskId)) {
      return fail('STALE_FINAL_OUTCOME_BINDING');
    }
  }
  const root = resolve(input.root);
  const stableReceiptFile = (path: string, label: string): Buffer => {
    const absolute = resolve(root, path);
    const scoped = relative(root, absolute);
    if (scoped === '' || scoped.startsWith('..') || scoped.includes('\\')) {
      return fail('STALE_FINAL_OUTCOME_BINDING');
    }
    return readStableProjectFile({
      root,
      path: absolute,
      label,
      fs: nodeStableProjectFileSystem(),
    });
  };
  for (const capture of receipt.captures) {
    let bytes: Buffer;
    try { bytes = stableReceiptFile(capture.path, 'trusted final browser capture'); } catch {
      return fail('STALE_FINAL_OUTCOME_CAPTURE');
    }
    if (createHash('sha256').update(bytes).digest('hex') !== capture.sha256) {
      return fail('STALE_FINAL_OUTCOME_CAPTURE');
    }
  }
  let decisionGraphBytes: Buffer;
  try { decisionGraphBytes = stableReceiptFile('.omd/decision-graph.json', 'trusted final decision graph'); } catch {
    return fail('STALE_FINAL_OUTCOME_DECISION_GRAPH');
  }
  if (createHash('sha256').update(decisionGraphBytes).digest('hex') !== receipt.decisionGraphSha256) {
    return fail('STALE_FINAL_OUTCOME_DECISION_GRAPH');
  }
  let expectedOutcomeRefs = input.expected?.requiredOutcomeRefs;
  let expectedClaimRefs = input.expected?.confirmedClaimRefs;
  let expectedDecisionRefs = input.expected?.decisionRefs;
  if (input.expected?.sourceContract !== undefined) {
    if (input.expected.sourceContractSha256 === undefined) return fail('STALE_FINAL_OUTCOME_REFS');
    try {
      const identity = deriveTrustedEvaluationIdentity({
        sourceContractSha256: input.expected.sourceContractSha256,
        taskOutcome: input.expected.sourceContract.taskOutcome,
        evidenceClaims: input.expected.sourceContract.evidenceClaims,
        allowedPaths: input.expected.sourceContract.allowedPaths,
        entryPath: receipt.productionPath,
      });
      expectedOutcomeRefs = identity.requiredOutcomeRefs;
      expectedClaimRefs = identity.confirmedClaimRefs;
      let graphInput: unknown;
      try { graphInput = JSON.parse(decisionGraphBytes.toString('utf8')) as unknown; } catch {
        return fail('STALE_FINAL_OUTCOME_DECISION_GRAPH');
      }
      const graph = validateDecisionGraph(graphInput);
      if (graph.value === undefined) return fail('STALE_FINAL_OUTCOME_DECISION_GRAPH');
      expectedDecisionRefs = deriveTrustedDecisionRefs(
        input.expected.sourceContractSha256,
        graph.value.decisions,
      );
    } catch (error) {
      if (error instanceof FinalOutcomeGateError) throw error;
      return fail('STALE_FINAL_OUTCOME_REFS');
    }
  }
  const outcomeRefs = receipt.outcomeResults.map((result) => result.outcomeRef);
  if ((expectedOutcomeRefs !== undefined && canonicalJson(outcomeRefs) !== canonicalJson(expectedOutcomeRefs))
    || (expectedClaimRefs !== undefined && canonicalJson(receipt.confirmedClaimRefs) !== canonicalJson(expectedClaimRefs))
    || (expectedDecisionRefs !== undefined && canonicalJson(receipt.decisionRefs) !== canonicalJson(expectedDecisionRefs))) {
    return fail('STALE_FINAL_OUTCOME_REFS');
  }
  const currentProductionSha256 = servedProjectTreeSha256(root, receipt.productionPath);
  if (currentProductionSha256 !== receipt.productionRevisionSha256
    || latest.buildSha256 !== receipt.activationBuildSha256
    || (input.expected !== undefined
      && input.expected.buildSha256 !== receipt.activationBuildSha256)
    || (input.expected?.routeSha256 !== undefined && input.expected.routeSha256 !== receipt.routeSha256)
    || (input.expected?.sourceContractSha256 !== undefined
      && input.expected.sourceContractSha256 !== receipt.sourceContractSha256)) {
    return fail('STALE_FINAL_OUTCOME_BINDING');
  }
  validateFinalOutcomeGate({
    branch: input.branch,
    trustedOutcome: parsed,
    expectedProductionRevisionSha256: currentProductionSha256,
  });
}
