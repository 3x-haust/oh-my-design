import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEvidenceClaimPublication, type EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { hasHostBoundLocalProjectWriteAuthority } from '../runtime/activation.ts';
import {
  requireFinalEvidenceManifestAuthorization,
  requireFinalReviewerLaneAuthorization,
  type ProjectRunInvocation,
} from '../runtime/invocation.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { validateCurrentRenderedRefinementCheckpoint } from '../runtime/rendered-refinement.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { checkCompletionPublicationPrerequisites } from '../completion/publication.ts';
import type { AdaptiveFinalEvidenceV2Graph } from './final-v2-adaptive-contract.ts';
import {
  type FinalEvidenceV2GraphBindings,
  validateFinalEvidenceV2Graph,
  validateFinalEvidenceV2GraphFiles,
} from './final-v2-graph.ts';
import {
  preflightFinalEvidenceGraph,
  revalidateFinalEvidenceGraph,
} from './final-v2-publication-preflight.ts';

export const FINAL_EVIDENCE_V2_SCHEMA = 'final-evidence-v2';
export const FINAL_EVIDENCE_V2_POINTER_SCHEMA = 'final-evidence-v2-pointer';
export const FINAL_EVIDENCE_V2_LOCK_TTL_MS = 15 * 60 * 1000;
export const FINAL_EVIDENCE_V2_GC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MotionDecision = 'none';
export type FinalEvidenceV2Bindings = FinalEvidenceV2GraphBindings;
export interface FinalEvidenceV2Manifest {
  schema: typeof FINAL_EVIDENCE_V2_SCHEMA;
  motionDecision: 'none';
  claimPublication: EvidenceClaimPublication;
  graph: AdaptiveFinalEvidenceV2Graph;
  graphRootHash?: string;
  motionEvidence?: never;
  staticEvidence?: never;
}
export type FinalEvidenceV2ManifestVariant = FinalEvidenceV2Manifest;
export interface FinalEvidenceV2Pointer {
  schema: typeof FINAL_EVIDENCE_V2_POINTER_SCHEMA;
  record: string;
  sha256: string;
}
export interface FinalEvidenceV2GcResult {
  dryRun: boolean;
  quarantined: string[];
  deleted: string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const fs = nodeStableProjectFileSystem();
const hash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail = (message: string): never => { throw new Error(`final-evidence-v2: ${message}`); };
const object = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(`${label} must be an object`);
  return Object.fromEntries(Object.entries(value));
};
const rootPath = (input: string): string => {
  try {
    const root = realpathSync(resolve(input));
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail('project root is unsafe');
    return root;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('final-evidence-v2:')) throw error;
    return fail('project root must be an existing real directory');
  }
};
const requireAuthority = (rootInput: string, invocation: ProjectRunInvocation): string => {
  const root = rootPath(rootInput);
  if (!hasHostBoundLocalProjectWriteAuthority(invocation, root)) {
    return fail('a current host-issued project invocation bound to this project root is required');
  }
  return root;
};
const manifestBytes = (manifest: FinalEvidenceV2Manifest): Buffer =>
  Buffer.from(`${canonicalJson(manifest)}\n`);

export function validateFinalEvidenceV2ManifestVariant(value: unknown): FinalEvidenceV2ManifestVariant {
  const manifest = object(value, 'manifest');
  const keys = Object.keys(manifest).sort();
  const expected = ['claimPublication', 'graph', 'motionDecision', 'schema',
    ...(manifest.graphRootHash === undefined ? [] : ['graphRootHash'])].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return fail('manifest has unexpected keys');
  }
  if (manifest.schema !== FINAL_EVIDENCE_V2_SCHEMA || manifest.motionDecision !== 'none') {
    return fail('model-led final evidence requires schema final-evidence-v2 and motionDecision none');
  }
  const graph = validateFinalEvidenceV2Graph(manifest.graph);
  const graphRootHash = manifest.graphRootHash;
  if (graphRootHash !== undefined && (typeof graphRootHash !== 'string' || !SHA256.test(graphRootHash))) {
    return fail('graphRootHash must be a sha256 hex digest');
  }
  return Object.freeze({
    schema: FINAL_EVIDENCE_V2_SCHEMA,
    motionDecision: 'none',
    claimPublication: parseEvidenceClaimPublication(manifest.claimPublication),
    graph,
    ...(graphRootHash === undefined ? {} : { graphRootHash }),
  });
}
export function validateFinalEvidenceV2Manifest(value: unknown): FinalEvidenceV2Manifest;
export function validateFinalEvidenceV2Manifest(value: unknown): FinalEvidenceV2Manifest {
  return validateFinalEvidenceV2ManifestVariant(value);
}

function validateBackedManifest(
  root: string,
  value: unknown,
  invocation: ProjectRunInvocation,
): Readonly<{
  manifest: FinalEvidenceV2Manifest;
  bindings: ReturnType<typeof validateFinalEvidenceV2GraphFiles>['bindings'];
}> {
  const manifest = validateFinalEvidenceV2ManifestVariant(value);
  const checked = validateFinalEvidenceV2GraphFiles(root, manifest.graph, fs, invocation);
  if (manifest.graphRootHash !== checked.rootHash) fail('graph root hash changed');
  const refinement = validateCurrentRenderedRefinementCheckpoint({ root, invocation });
  if (refinement.required) {
    const terminal = manifest.graph.observations.at(-1) ?? fail('a completed refinement requires a terminal final observation');
    if (terminal.sha256 !== refinement.checkpoint.afterObservationSha256) {
      fail('terminal final observation does not match the current completed refinement checkpoint');
    }
  }
  if (canonicalJson(manifest.claimPublication) !== canonicalJson(checked.bindings.claimPublication)) {
    fail('claim publication does not match the adaptive source contract');
  }
  if (checked.bindings.activation.buildSha256 !== invocation.current.buildSha256
    || checked.bindings.activation.loadedSkillSha256 !== invocation.current.loadedSkillSha256) {
    fail('graph activation and source identities are not current');
  }
  return { manifest, bindings: checked.bindings };
}

function parsePointer(bytes: Buffer): FinalEvidenceV2Pointer {
  const value = object(JSON.parse(bytes.toString('utf8')), 'pointer');
  if (Object.keys(value).sort().join(',') !== 'record,schema,sha256'
    || value.schema !== FINAL_EVIDENCE_V2_POINTER_SCHEMA
    || typeof value.record !== 'string'
    || typeof value.sha256 !== 'string'
    || !SHA256.test(value.sha256)
    || value.record !== `sha256-${value.sha256}.json`) {
    return fail('pointer is invalid');
  }
  return { schema: FINAL_EVIDENCE_V2_POINTER_SCHEMA, record: value.record, sha256: value.sha256 };
}

export function checkFinalEvidenceV2(rootInput: string, invocation?: ProjectRunInvocation): FinalEvidenceV2Manifest;
export function checkFinalEvidenceV2(rootInput: string, invocation?: ProjectRunInvocation): FinalEvidenceV2Manifest {
  if (invocation === undefined) fail('a fresh host invocation is required to check final v2 evidence');
  const currentInvocation = invocation as ProjectRunInvocation;
  const root = requireAuthority(rootInput, currentInvocation);
  const pointerPath = '.omd/final-evidence-v2.json';
  const pointerBytes = readStableProjectFile({ root, path: resolve(root, pointerPath), label: 'final evidence pointer', fs });
  requireFinalReviewerLaneAuthorization(currentInvocation, root, pointerBytes);
  const pointer = parsePointer(pointerBytes);
  const recordPath = `.omd/final-evidence-v2-runs/${pointer.record}`;
  const bytes = readStableProjectFile({ root, path: resolve(root, recordPath), label: 'final evidence record', fs });
  if (hash(bytes) !== pointer.sha256) fail('pointer does not identify an intact immutable record');
  requireFinalEvidenceManifestAuthorization(currentInvocation, root, bytes);
  return validateBackedManifest(root, JSON.parse(bytes.toString('utf8')), currentInvocation).manifest;
}

export function publishFinalEvidenceV2(
  rootInput: string,
  input: unknown,
  invocation: ProjectRunInvocation,
): string {
  const root = requireAuthority(rootInput, invocation);
  const submitted = validateFinalEvidenceV2ManifestVariant(input);
  const validated = preflightFinalEvidenceGraph({ root, graph: submitted.graph, fs, invocation });
  checkCompletionPublicationPrerequisites(root, submitted, invocation);
  const manifest = validateFinalEvidenceV2ManifestVariant({ ...submitted, graphRootHash: validated.rootHash });
  const bytes = manifestBytes(manifest);
  requireFinalEvidenceManifestAuthorization(invocation, root, bytes);
  const release = acquireProjectMutationLock(root, invocation);
  try {
    const current = revalidateFinalEvidenceGraph(validated, { root, graph: manifest.graph, fs, invocation });
    if (current.rootHash !== manifest.graphRootHash) fail('graph changed before publication');
    checkCompletionPublicationPrerequisites(root, manifest, invocation);
    validateCurrentRenderedRefinementCheckpoint({ root, invocation });
    const sha256 = hash(bytes);
    const writer = createProjectWriteAdapter(root, invocation);
    writer.mkdir('.omd/final-evidence-v2-runs');
    writer.writeContentAddressed(`.omd/final-evidence-v2-runs/sha256-${sha256}.json`, bytes);
    const pointer: FinalEvidenceV2Pointer = {
      schema: FINAL_EVIDENCE_V2_POINTER_SCHEMA,
      record: `sha256-${sha256}.json`,
      sha256,
    };
    writer.write('.omd/final-evidence-v2.json', `${canonicalJson(pointer)}\n`);
    return '.omd/final-evidence-v2.json';
  } finally {
    release();
  }
}

export function recoverFinalEvidenceV2Lock(rootInput: string, invocation: ProjectRunInvocation): boolean {
  requireAuthority(rootInput, invocation);
  return false;
}

export function garbageCollectFinalEvidenceV2(
  rootInput: string,
  invocation: ProjectRunInvocation,
  options: { dryRun?: boolean; now?: number } = {},
): FinalEvidenceV2GcResult {
  requireAuthority(rootInput, invocation);
  return { dryRun: options.dryRun !== false, quarantined: [], deleted: [] };
}

export const finalizeFinalEvidenceV2 = publishFinalEvidenceV2;
export const checkFinalEvidenceV2Manifest = validateFinalEvidenceV2Manifest;
