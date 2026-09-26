import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validateFinalEvidenceV2ManifestVariant, type FinalEvidenceV2ManifestVariant } from '../evidence/final-v2.ts';
import type { ArtifactReceipt } from '../evidence/final-v2-graph.ts';
import { adaptiveFinalOmissionMappings } from '../evidence/final-v2-adaptive-contract.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { createAdaptiveSourceSealRoute } from '../source-seal/adaptive-inputs.ts';
import { validateSourceSealArtifact } from '../source-seal/index.ts';
import { createAdaptiveWorkflowSourceBinding } from '../design-development/workflow-persistence.ts';
import { requireFinalReviewerLaneAuthorization, validateCurrentProjectRun, type ProjectRunInvocation } from './invocation.ts';
import { observationV2Sha256, readCurrentObservationV2, validateObservationV2, type ObservationV2 } from './observation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import { getNativePiRun } from './native-pi-run.ts';

export type NativeFinalObservation = Readonly<{ receipt: ArtifactReceipt; value: ObservationV2 }>;
const fs = nodeStableProjectFileSystem();
const sha = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const pointerPath = '.omd/final-review/native-current.json';
const hashPattern = /^[a-f0-9]{64}$/;

export class NativeFinalManifestError extends Error {
  override readonly name = 'NativeFinalManifestError';
  readonly reason: string;
  constructor(reason: string) { super(`NATIVE_FINAL_MANIFEST_INVALID: ${reason}`); this.reason = reason; }
}
const fail = (reason: string): never => { throw new NativeFinalManifestError(reason); };
function read(root: string, path: string): Buffer {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '' || part === '.' || part === '..')) {
    fail('artifact path must be normalized and project-relative');
  }
  return readStableProjectFile({ root, path: resolve(root, path), label: path, fs });
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(`${label} must be an object`);
  return Object.fromEntries(Object.entries(value));
}
function json(bytes: Buffer): unknown { return JSON.parse(bytes.toString('utf8')); }
function descriptor(root: string, path: string, schema: string): ArtifactReceipt {
  return { path, schema, sha256: sha(read(root, path)) };
}

export function currentNativeFinalObservations(root: string): readonly NativeFinalObservation[] {
  const tail = readCurrentObservationV2(root) ?? fail('current observation is missing');
  const result: NativeFinalObservation[] = [];
  const seen = new Set<string>();
  let digest: string | null = observationV2Sha256(tail);
  while (digest !== null) {
    if (seen.has(digest)) fail('observation chain contains a cycle');
    seen.add(digest);
    const path = `.omd/observation-v2/sha256-${digest}.json`;
    const bytes = read(root, path);
    const value = validateObservationV2(json(bytes));
    if (sha(bytes) !== digest || observationV2Sha256(value) !== digest) fail('observation chain digest changed');
    if (value.buildSha256 !== tail.buildSha256
      || canonicalJson(value.currentArtifact) !== canonicalJson(tail.currentArtifact)) fail('observation chain mixes builds');
    result.push({ receipt: { path, schema: 'observation-v2', sha256: digest }, value });
    digest = value.predecessorSha256;
  }
  if (sha(read(root, tail.currentArtifact.path)) !== tail.currentArtifact.sha256) fail('observation build identity is stale');
  return Object.freeze(result.reverse());
}

function currentLanes(root: string, invocation: ProjectRunInvocation): Readonly<{
  blindLane: ArtifactReceipt; fidelityLane: ArtifactReceipt; protocolLane: ArtifactReceipt;
}> {
  const bytes = read(root, pointerPath);
  requireFinalReviewerLaneAuthorization(invocation, root, bytes);
  const pointer = object(json(bytes), 'native review pointer');
  if (Object.keys(pointer).sort().join(',') !== 'attempt,briefSha256,buildSha256,lanes,runId,schema'
    || pointer.schema !== 'native-pi-final-review-v1'
    || typeof pointer.runId !== 'string' || pointer.runId.trim() === ''
    || pointer.buildSha256 !== invocation.current.buildSha256
    || pointer.briefSha256 !== invocation.current.briefSha256) fail('native review pointer is not current');
  if (invocation.activation.hostCapability.host === 'pi'
    && pointer.runId !== getNativePiRun(invocation, root).runId) fail('native review pointer run is not current');
  const attempt = object(pointer.attempt, 'native review attempt');
  if (Object.keys(attempt).sort().join(',') !== 'path,sha256'
    || typeof attempt.path !== 'string' || typeof attempt.sha256 !== 'string' || !hashPattern.test(attempt.sha256)
    || attempt.path !== `.omd/final-review/attempts/sha256-${attempt.sha256}.json`) return fail('native review attempt descriptor is invalid');
  if (sha(read(root, attempt.path)) !== attempt.sha256) fail('native review attempt digest changed');
  const lanes = object(pointer.lanes, 'native lanes');
  if (Object.keys(lanes).sort().join(',') !== 'blindLane,fidelityLane,protocolLane') fail('native lanes are incomplete');
  const lane = (name: string): ArtifactReceipt => {
    const item = object(lanes[name], name);
    if (Object.keys(item).sort().join(',') !== 'path,sha256' || typeof item.path !== 'string'
      || typeof item.sha256 !== 'string' || !hashPattern.test(item.sha256)) return fail(`${name} descriptor is invalid`);
    const laneBytes = read(root, item.path);
    if (sha(laneBytes) !== item.sha256) fail(`${name} digest changed`);
    requireFinalReviewerLaneAuthorization(invocation, root, laneBytes);
    const value = object(json(laneBytes), name);
    if (typeof value.schema !== 'string') return fail(`${name} schema is missing`);
    return { path: item.path, sha256: item.sha256, schema: value.schema };
  };
  return { blindLane: lane('blindLane'), fidelityLane: lane('fidelityLane'), protocolLane: lane('protocolLane') };
}

export function buildNativeFinalManifest(
  root: string,
  invocation: ProjectRunInvocation,
  activationPath: string,
): FinalEvidenceV2ManifestVariant {
  validateCurrentProjectRun(invocation);
  const record = readPersistedRoute(root, invocation);
  if (record.strategy.stages.includes('art-direction')) fail('selected art requires current authored-art evidence receipts');
  if (canonicalJson(json(read(root, activationPath))) !== canonicalJson(invocation.activation)) fail('activation receipt is not current');
  const route = createAdaptiveSourceSealRoute(root, invocation);
  const observed = currentNativeFinalObservations(root);
  const first = observed[0] ?? fail('current observation is missing');
  if (first.value.buildSha256 !== invocation.current.buildSha256) fail('observation build is not current');
  const seal = validateSourceSealArtifact(json(read(root, '.omd/source-seal.json')));
  const productionSchema = 'final-evidence-v2-adaptive-omission-graph';
  const graph = {
    schema: productionSchema,
    activation: descriptor(root, activationPath, 'activation-context-v2'), route,
    omissions: adaptiveFinalOmissionMappings().flatMap(([id, routeSkipId]) => {
      const skip = record.strategy.skips.find(item => item.id === routeSkipId);
      return skip === undefined ? [] : [{ id, status: 'skipped', routeSkipId, reason: skip.reason,
        routeSha256: route.record.sha256, authoritySha256: route.authority.sha256 }];
    }),
    copy: descriptor(root, '.omd/copy-deck.md', 'copy-deck-v2'),
    sourceSeal: descriptor(root, '.omd/source-seal.json', seal.schemaVersion === 2 ? 'source-seal-v2' : 'source-seal-v1'),
    buildIdentity: descriptor(root, first.value.currentArtifact.path, 'omd-build-identity-v1'),
    ...currentLanes(root, invocation),
    ...(record.strategy.stages.includes('content-grain')
      ? { contentFit: descriptor(root, '.omd/content-fit.json', 'content-fit-receipt-v1') } : {}),
    observations: observed.map(item => item.receipt),
  };
  return validateFinalEvidenceV2ManifestVariant({
    schema: 'final-evidence-v2', motionDecision: 'none', claimPublication: record.sourceContract.evidenceClaims,
    graph: seal.schemaVersion === 2 ? { ...graph, schema: 'final-evidence-v2-workflow-graph-v1',
      productionSchema, workflow: createAdaptiveWorkflowSourceBinding(root, invocation) } : graph,
  });
}
