import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { validateActivationContext } from '../runtime/activation.ts';
import { requireFinalReviewerLaneAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { observationV2Sha256, validateObservationV2 } from '../runtime/observation.ts';
import { parseRouteRecord } from '../route/adaptive-route-record.ts';
import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import { validateSourceSeal, validateSourceSealArtifact } from '../source-seal/index.ts';
import { validateFinalBrowserObservations } from './final-v2-browser-observations.ts';
import { validateTrustedOutcomeEvidence } from './final-v2-outcome-gate.ts';
import { validateFinalV2ContentFitCurrentness } from './final-v2-content-fit.ts';
import { assertDesignQualityGreen } from './final-v2-design-quality.ts';
import { readStableProjectFile, StableProjectFileReadError, type StableProjectFileSystem } from '../runtime/stable-project-file.ts';
import {
  AdaptiveFinalEvidenceGraphError,
  adaptiveFinalOmissionMappings,
  validateAdaptiveFinalEvidenceV2Graph,
  type AdaptiveArtifactReceipt,
  type AdaptiveFinalEvidenceV2Bindings,
  type AdaptiveFinalEvidenceV2Graph,
} from './final-v2-adaptive-contract.ts';

export interface AdaptiveEvidenceGraphFs extends StableProjectFileSystem {}
const SHA256 = /^[a-f0-9]{64}$/;
export const REALITY_FIT_PASS_VALUE = 'GREEN' as const;
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const fail = (reason: string): never => { throw new AdaptiveFinalEvidenceGraphError(reason); };
export function assertGreenfieldRealityFit(projectMode: 'greenfield' | 'existing', actual: string): void {
  if (projectMode === 'greenfield' && actual !== REALITY_FIT_PASS_VALUE) {
    fail('greenfield final evidence requires realityFit: GREEN');
  }
}
function fields(value: unknown, keys: readonly string[], label: string): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(`${label} must be an object`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key))) return fail(`${label} has unexpected keys`);
  const result = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return fail(`${label} has invalid fields`);
    result.set(key, descriptor.value);
  }
  return result;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fail(`${label} must be non-empty text`);
  return value;
}
function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return fail(`${label} must be a SHA-256 digest`);
  return value;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return fail(`${label} must be a positive integer`);
  return value;
}
function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(`${label} must be an array`);
  return value;
}
function read(root: string, fs: AdaptiveEvidenceGraphFs, path: string, label: string): Buffer {
  const absolute = resolve(root, path); const outside = relative(root, absolute);
  if (outside === '' || outside.startsWith('..') || resolve(root, outside) !== absolute) return fail(`${label} escapes the project root`);
  try { return readStableProjectFile({ root, fs, path: absolute, label }); } catch (error) {
    if (error instanceof StableProjectFileReadError) return fail(error.message);
    throw error;
  }
}
function load(root: string, fs: AdaptiveEvidenceGraphFs, receipt: AdaptiveArtifactReceipt, label: string): Readonly<{ bytes: Buffer; value: unknown }> {
  const bytes = read(root, fs, receipt.path, label);
  if (hash(bytes) !== receipt.sha256) fail(`${label} storage-byte hash changed`);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return fail(`${label} is not JSON`); }
  return Object.freeze({ bytes, value });
}
function laneContract(
  name: 'blindLane' | 'fidelityLane' | 'protocolLane',
  projectMode: 'greenfield' | 'existing',
  benchmarkRequired: boolean,
): Readonly<{ schema: string; verdicts: readonly string[]; floors: readonly string[] }> {
  if (name === 'blindLane') {
    return {
      schema: 'adaptive-blind-review-v3',
      verdicts: benchmarkRequired
        ? [
          'blindVisual',
          'blindNarrative',
          'interactionBenchmarkFit',
          'domainSpecificity',
          ...(projectMode === 'greenfield' ? ['realityFit'] : []),
        ]
        : [
          'blindVisual',
          'blindNarrative',
          ...(projectMode === 'greenfield' ? ['realityFit'] : []),
        ],
      floors: benchmarkRequired
        ? ['composition', 'copy', 'interactionQuality']
        : ['composition', 'copy'],
    };
  }
  return name === 'fidelityLane'
    ? { schema: 'adaptive-fidelity-review-v1', verdicts: ['referenceFidelity', 'renderFidelity'], floors: ['desktop', 'mobile'] }
    : { schema: 'adaptive-protocol-review-v1', verdicts: ['evidenceIntegrity', 'publicationProtocol'], floors: ['authority', 'currentness'] };
}
export function adaptiveBlindLaneContract(
  routeRecord: Pick<AdaptiveRouteRecord, 'projectMode' | 'gates'>,
): Readonly<{ schema: string; verdicts: readonly string[]; floors: readonly string[] }> {
  return laneContract(
    'blindLane',
    routeRecord.projectMode,
    routeRecord.gates.includes('greenfield-task-flow-benchmark'),
  );
}
function greenValues(value: unknown, keys: readonly string[], label: string, floor: boolean): void {
  const item = fields(value, keys, label);
  for (const key of keys) {
    const observed = item.get(key);
    if (floor ? typeof observed !== 'number' || !Number.isFinite(observed) || observed < 3 : observed !== 'GREEN') fail(`${label}.${key} is not GREEN`);
  }
}
export function validateAdaptiveBlindExecutionVerdicts(
  value: unknown,
  projectMode: 'greenfield' | 'existing',
  benchmarkRequired: boolean,
): void {
  const verdicts = laneContract('blindLane', projectMode, benchmarkRequired).verdicts;
  greenValues(value, verdicts, 'blindLane verdicts', false);
  if (projectMode === 'greenfield') {
    const item = fields(value, verdicts, 'blindLane verdicts');
    assertGreenfieldRealityFit(projectMode, text(item.get('realityFit'), 'blindLane realityFit'));
  }
}
function stringSet(value: unknown, label: string): readonly string[] {
  const items = array(value, label).map((item, index) => text(item, `${label}[${index}]`));
  if (items.length === 0 || new Set(items).size !== items.length) fail(`${label} must be non-empty and unique`);
  return items;
}
function execution(
  root: string,
  fs: AdaptiveEvidenceGraphFs,
  invocation: ProjectRunInvocation,
  lane: 'blindLane' | 'fidelityLane' | 'protocolLane',
  projectMode: 'greenfield' | 'existing',
  benchmarkRequired: boolean,
  descriptor: unknown,
  expected: Readonly<{ routeSha256: string; buildSha256: string; briefSha256: string; isolation: string; observations: readonly string[]; reviewers: readonly string[]; verdicts: unknown; floors: unknown; designQuality?: unknown; browserSha256: string }>,
  completed: Set<string>,
): string {
  const receipt = fields(descriptor, ['path', 'sha256'], `${lane} execution descriptor`);
  const path = text(receipt.get('path'), `${lane} execution path`); const bytes = read(root, fs, path, `${lane} execution`);
  if (hash(bytes) !== digest(receipt.get('sha256'), `${lane} execution sha256`)) fail(`${lane} execution bytes changed`);
  requireFinalReviewerLaneAuthorization(invocation, root, bytes);
  let parsed: unknown; try { parsed = JSON.parse(bytes.toString('utf8')); } catch { return fail(`${lane} execution is not JSON`); }
  const item = fields(parsed, ['schema', 'lane', 'reviewerId', 'verdicts', 'criticalFloors', ...(lane === 'blindLane' ? ['designQuality'] : []), 'isolationReceiptSha256', 'observationSha256s', 'routeSha256', 'buildSha256', 'briefSha256', 'browserSha256', 'childPid', 'sessionId', 'nonce', 'evidenceSha256', 'configurationSha256'], `${lane} execution`);
  const reviewer = text(item.get('reviewerId'), `${lane} reviewerId`);
  const executionSchema = lane === 'blindLane'
    ? 'adaptive-final-reviewer-execution-v2'
    : 'adaptive-final-reviewer-execution-v1';
  if (item.get('schema') !== executionSchema || item.get('lane') !== lane || !expected.reviewers.includes(reviewer)) fail(`${lane} execution identity is invalid`);
  if (canonicalRouteJson(item.get('verdicts')) !== canonicalRouteJson(expected.verdicts) || canonicalRouteJson(item.get('criticalFloors')) !== canonicalRouteJson(expected.floors)
    || item.get('routeSha256') !== expected.routeSha256 || item.get('buildSha256') !== expected.buildSha256
    || item.get('briefSha256') !== expected.briefSha256 || item.get('browserSha256') !== expected.browserSha256
    || item.get('isolationReceiptSha256') !== expected.isolation || canonicalRouteJson(item.get('observationSha256s')) !== canonicalRouteJson(expected.observations)) fail(`${lane} execution provenance is stale`);
  if (lane === 'blindLane') {
    assertDesignQualityGreen(item.get('designQuality'), {
      expectedObservationSha256s: expected.observations,
    });
    if (canonicalRouteJson(item.get('designQuality')) !== canonicalRouteJson(expected.designQuality)) {
      fail(`${lane} execution design quality is stale`);
    }
  }
  if (lane === 'blindLane' && projectMode === 'greenfield') {
    validateAdaptiveBlindExecutionVerdicts(item.get('verdicts'), projectMode, benchmarkRequired);
  }
  const identities = [String(integer(item.get('childPid'), `${lane} childPid`)), text(item.get('sessionId'), `${lane} sessionId`), text(item.get('nonce'), `${lane} nonce`), digest(item.get('configurationSha256'), `${lane} configurationSha256`)];
  digest(item.get('evidenceSha256'), `${lane} evidenceSha256`);
  if (identities.some((identity) => completed.has(identity))) fail('reviewer execution identities are reused');
  identities.forEach((identity) => completed.add(identity));
  return reviewer;
}
function validateLane(
  root: string,
  fs: AdaptiveEvidenceGraphFs,
  invocation: ProjectRunInvocation,
  name: 'blindLane' | 'fidelityLane' | 'protocolLane',
  projectMode: 'greenfield' | 'existing',
  benchmarkRequired: boolean,
  descriptor: AdaptiveArtifactReceipt,
  routeSha256: string,
  buildSha256: string,
  briefSha256: string,
  observations: readonly string[],
  browserSha256: string,
  completed: Set<string>,
): void {
  const loaded = load(root, fs, descriptor, name); requireFinalReviewerLaneAuthorization(invocation, root, loaded.bytes);
  const contract = laneContract(name, projectMode, benchmarkRequired);
  const item = fields(loaded.value, ['schema', 'routeSha256', 'buildSha256', 'isolationReceipt', 'verdicts', 'criticalFloors', ...(name === 'blindLane' ? ['designQuality'] : []), 'quorum', 'provenance', 'executionReceipts'], name);
  if (item.get('schema') !== contract.schema || item.get('routeSha256') !== routeSha256 || item.get('buildSha256') !== buildSha256) fail(`${name} route or build binding is stale`);
  greenValues(item.get('verdicts'), contract.verdicts, `${name}.verdicts`, false); greenValues(item.get('criticalFloors'), contract.floors, `${name}.criticalFloors`, true);
  const isolation = fields(item.get('isolationReceipt'), ['schema', 'sha256'], `${name}.isolationReceipt`);
  if (isolation.get('schema') !== 'reviewer-isolation-v1') fail(`${name} isolation schema is invalid`);
  const isolationSha256 = digest(isolation.get('sha256'), `${name} isolation sha256`);
  const quorum = fields(item.get('quorum'), ['required', 'passed'], `${name}.quorum`); const required = integer(quorum.get('required'), `${name} quorum required`); const passed = integer(quorum.get('passed'), `${name} quorum passed`);
  if (required < 2 || passed < required) fail(`${name} quorum failed`);
  const provenance = fields(item.get('provenance'), ['observationSha256s', 'reviewerIds', 'reviewerSessionSha256'], `${name}.provenance`);
  const laneObservations = stringSet(provenance.get('observationSha256s'), `${name} observations`); const reviewers = stringSet(provenance.get('reviewerIds'), `${name} reviewers`);
  if (canonicalRouteJson(laneObservations) !== canonicalRouteJson(observations) || reviewers.length !== passed || provenance.get('reviewerSessionSha256') !== isolationSha256) fail(`${name} provenance is incomplete`);
  const designQuality = name === 'blindLane'
    ? assertDesignQualityGreen(item.get('designQuality'), {
      expectedObservationSha256s: observations,
    })
    : undefined;
  const executions = array(item.get('executionReceipts'), `${name} executions`);
  if (executions.length !== reviewers.length) fail(`${name} execution quorum is incomplete`);
  const observed = executions.map((value) => execution(root, fs, invocation, name, projectMode, benchmarkRequired, value, { routeSha256, buildSha256, briefSha256, isolation: isolationSha256, observations, reviewers, verdicts: item.get('verdicts'), floors: item.get('criticalFloors'), ...(designQuality === undefined ? {} : { designQuality }), browserSha256 }, completed));
  if (new Set(observed).size !== reviewers.length) fail(`${name} reviewers are not covered exactly once`);
}

export function adaptiveFinalEvidenceV2RootHash(graph: AdaptiveFinalEvidenceV2Graph): string {
  return hash(canonicalRouteJson({ graph }));
}

export function validateAdaptiveFinalEvidenceV2GraphFiles(
  root: string,
  graphInput: unknown,
  fs: AdaptiveEvidenceGraphFs,
  invocation: ProjectRunInvocation,
): Readonly<{ graph: AdaptiveFinalEvidenceV2Graph; rootHash: string; bindings: AdaptiveFinalEvidenceV2Bindings }> {
  const graph = validateAdaptiveFinalEvidenceV2Graph(graphInput);
  const routeRecordBytes = read(root, fs, graph.route.record.path, 'routeRecord');
  if (hash(routeRecordBytes) !== graph.route.record.sha256) fail('route record bytes changed');
  let routeRecordValue: unknown;
  try { routeRecordValue = JSON.parse(routeRecordBytes.toString('utf8')); }
  catch { return fail('route record is not JSON'); }
  const record = parseRouteRecord(
    routeRecordValue,
    { root, invocation },
  );
  const expectedOmissions = adaptiveFinalOmissionMappings().filter(([, routeSkipId]) =>
    record.strategy.skips.some(({ id }) => id === routeSkipId));
  if (graph.omissions.length !== expectedOmissions.length) {
    fail('omissions do not match the selected and skipped stages in the current route');
  }
  for (const [index, mapping] of expectedOmissions.entries()) {
    const omission = graph.omissions[index];
    const skip = record.strategy.skips.find((entry) => entry.id === mapping[1]);
    if (omission === undefined || omission.id !== mapping[0]
      || omission.routeSkipId !== mapping[1] || skip === undefined
      || omission.reason !== skip.reason) {
      fail(`${mapping[0]} omission does not bind the exact current route skip`);
    }
  }
  const activationLoaded = load(root, fs, graph.activation, 'activation'); const activation = validateActivationContext(activationLoaded.value);
  const build = fields(load(root, fs, graph.buildIdentity, 'buildIdentity').value, ['schemaVersion', 'packageVersion', 'buildSha256', 'sourceSkillSha256'], 'buildIdentity');
  if (build.get('schemaVersion') !== 'omd-build-identity-v1' || build.get('buildSha256') !== activation.buildSha256 || build.get('sourceSkillSha256') !== activation.loadedSkillSha256) fail('build identity is not current');
  const copyBytes = read(root, fs, graph.copy.path, 'copy'); if (hash(copyBytes) !== graph.copy.sha256) fail('copy bytes changed');
  const sealLoaded = load(root, fs, graph.sourceSeal, 'sourceSeal'); const seal = validateSourceSealArtifact(sealLoaded.value);
  const sourceSealFindings = seal.schemaVersion === 1
    ? validateSourceSeal(root, undefined, graph.route)
    : validateSourceSeal(root, invocation);
  if (seal.route === undefined || canonicalRouteJson(seal.route) !== canonicalRouteJson(graph.route)
    || seal.inputs.copyDeckSha256 !== graph.copy.sha256
    || sourceSealFindings.length !== 0) {
    fail('source seal does not bind current route and copy bytes');
  }
  const observations = graph.observations.map((item, index) => {
    const loaded = load(root, fs, item, `observations[${index}]`); const value = validateObservationV2(loaded.value);
    if (observationV2Sha256(value) !== item.sha256 || value.buildSha256 !== activation.buildSha256 || value.currentArtifact.path !== graph.buildIdentity.path || value.currentArtifact.sha256 !== graph.buildIdentity.sha256) fail(`observations[${index}] is stale`);
    return Object.freeze({ value, storageSha256: item.sha256 });
  });
  let predecessor: string | null = null;
  for (const observation of observations) { if (observation.value.predecessorSha256 !== predecessor) fail('observations fork or break predecessor chain'); predecessor = observation.storageSha256; }
  validateFinalBrowserObservations(root, fs, observations.map((item) => item.value.evidence));
  if (graph.contentFit !== undefined) load(root, fs, graph.contentFit, 'contentFit');
  validateFinalV2ContentFitCurrentness({
    root,
    route: record,
    ...(graph.contentFit === undefined ? {} : { contentFit: graph.contentFit }),
    observations: observations.map((item) => item.value.evidence),
  });
  const benchmarkRequired = record.gates.includes('greenfield-task-flow-benchmark');
  validateTrustedOutcomeEvidence({
    root,
    branch: 'adaptive-omission',
    required: true,
    invocation,
    expected: {
      routeSha256: graph.route.record.sha256,
      sourceContractSha256: record.sourceContractSha256,
      sourceContract: record.sourceContract,
      buildSha256: activation.buildSha256,
      entrySurfaceRequired: benchmarkRequired,
    },
    observations: observations.map((item) => item.value),
  });
  const observationHashes = observations.map((item) => item.storageSha256); const browserSha256 = hash(read(root, fs, '.omd/decision-graph.json', 'decision graph'));
  const completed = new Set<string>();
  validateLane(root, fs, invocation, 'blindLane', record.projectMode, benchmarkRequired, graph.blindLane, graph.route.record.sha256, activation.buildSha256, activation.briefSha256, observationHashes, browserSha256, completed);
  validateLane(root, fs, invocation, 'fidelityLane', record.projectMode, benchmarkRequired, graph.fidelityLane, graph.route.record.sha256, activation.buildSha256, activation.briefSha256, observationHashes, browserSha256, completed);
  validateLane(root, fs, invocation, 'protocolLane', record.projectMode, benchmarkRequired, graph.protocolLane, graph.route.record.sha256, activation.buildSha256, activation.briefSha256, observationHashes, browserSha256, completed);
  return Object.freeze({ graph, rootHash: adaptiveFinalEvidenceV2RootHash(graph), bindings: Object.freeze({ branch: 'adaptive-omission', activation, buildSha256: activation.buildSha256, routeSha256: graph.route.record.sha256, claimPublication: record.sourceContract.evidenceClaims }) });
}
