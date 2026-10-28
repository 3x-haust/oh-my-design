import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { adaptiveRouteAuthorityBytes, adaptiveRouteAuthorityPath } from '../route/adaptive-route-authority.ts';
import {
  ADAPTIVE_ROUTE_POINTER_SCHEMA,
  ADAPTIVE_ROUTE_SOURCE_POINTER_SCHEMA,
  readPersistedRoute,
} from '../route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import {
  checkReferenceApplication,
  hasReferenceApplicationArtifacts,
  REFERENCE_APPLICATION_PATH,
  REFERENCE_APPLICATION_PROJECTION_PATH,
} from '../ref/reference-application.ts';

export const ADAPTIVE_SOURCE_SEAL_ROUTE_SCHEMA = 'adaptive-source-seal-route-v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const STAGES = Object.freeze(['art-direction', 'copy', 'type-proof', 'composition'] as const);
type Receipt = Readonly<{ path: string; sha256: string }>;
export type SourceSealConfidenceDebt = Readonly<{
  record: Receipt;
  itemIds: readonly string[];
  claim: 'not-verified';
}>;
type StageBinding = Readonly<
  | { id: typeof STAGES[number]; status: 'selected'; artifacts: readonly Receipt[]; confidenceDebt?: SourceSealConfidenceDebt }
  | { id: typeof STAGES[number]; status: 'skipped'; reason: string; routeSha256: string; authoritySha256: string }
  | { id: typeof STAGES[number]; status: 'not-selected'; routeSha256: string; authoritySha256: string }
>;
export type AdaptiveSourceSealRoute = Readonly<{
  schema: typeof ADAPTIVE_SOURCE_SEAL_ROUTE_SCHEMA;
  executionStyle: 'model-led';
  pointer: Receipt;
  record: Receipt;
  sourcePointer: Receipt;
  sourceContract: Receipt;
  authority: Receipt;
  selectedModel: AdaptiveRouteRecord['selectedModel'];
  stages: readonly StageBinding[];
  referenceApplication?: readonly Receipt[];
}>;

const fs = nodeStableProjectFileSystem();
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const read = (root: string, path: string, label: string): Buffer =>
  readStableProjectFile({ root, path: resolve(root, path), label, fs });
const receipt = (root: string, path: string, label: string): Receipt =>
  Object.freeze({ path, sha256: hash(read(root, path, label)) });
const json = (root: string, path: string, label: string): unknown =>
  JSON.parse(read(root, path, label).toString('utf8'));
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function persistedPointer(
  root: string,
  path: '.omd/route.json' | '.omd/route-source.json',
  schema: string,
  prefix: 'route-records' | 'route-sources',
): Readonly<{ record: string; sha256: string }> {
  const value = json(root, path, `${prefix} pointer`);
  if (!object(value) || Object.keys(value).length !== 3 || value.schema !== schema
    || typeof value.record !== 'string' || typeof value.sha256 !== 'string'
    || !SHA256.test(value.sha256)
    || value.record !== `${prefix}/sha256-${value.sha256}.json`) {
    throw new Error(`ADAPTIVE_SOURCE_POINTER_INVALID: ${path}`);
  }
  return Object.freeze({ record: value.record, sha256: value.sha256 });
}

export function createAdaptiveSourceSealRoute(
  root: string,
  invocation: ProjectRunInvocation,
): AdaptiveSourceSealRoute {
  const record = readPersistedRoute(root, invocation);
  if (record.sourceContract.processPolicy?.schema === 'human-design-process-v1') {
    throw new Error('LEGACY_STRUCTURED_PROCESS_UNSUPPORTED');
  }
  const routePointer = persistedPointer(root, '.omd/route.json', ADAPTIVE_ROUTE_POINTER_SCHEMA, 'route-records');
  const sourcePointer = persistedPointer(root, '.omd/route-source.json', ADAPTIVE_ROUTE_SOURCE_POINTER_SCHEMA, 'route-sources');
  const authorityRecord = record.sourceContractSha256 === sourcePointer.sha256
    ? record
    : Object.freeze({ ...record, sourceContractSha256: sourcePointer.sha256 });
  const authorityBytes = adaptiveRouteAuthorityBytes(authorityRecord, routePointer.sha256, invocation);
  const authoritySha256 = hash(authorityBytes);
  const needsApplication = hasReferenceApplicationArtifacts(root);
  if (needsApplication) {
    checkReferenceApplication(root, {
      expectedSourceContractSha256: record.sourceContractSha256,
      benchmarkRequired: record.gates.includes('greenfield-task-flow-benchmark'),
      expectedRequest: record.request,
    });
  }
  return Object.freeze({
    schema: ADAPTIVE_SOURCE_SEAL_ROUTE_SCHEMA,
    executionStyle: 'model-led',
    pointer: receipt(root, '.omd/route.json', 'adaptive route pointer'),
    record: receipt(root, `.omd/${routePointer.record}`, 'adaptive route record'),
    sourcePointer: receipt(root, '.omd/route-source.json', 'adaptive route source pointer'),
    sourceContract: receipt(root, `.omd/${sourcePointer.record}`, 'adaptive route source contract'),
    authority: receipt(root, `.omd/${adaptiveRouteAuthorityPath(authorityBytes)}`, 'adaptive route authority'),
    selectedModel: record.selectedModel,
    stages: Object.freeze(STAGES.map(id => Object.freeze({
      id,
      status: 'not-selected' as const,
      routeSha256: routePointer.sha256,
      authoritySha256,
    }))),
    ...(needsApplication ? { referenceApplication: Object.freeze([
      receipt(root, REFERENCE_APPLICATION_PATH, 'screen reference application'),
      receipt(root, REFERENCE_APPLICATION_PROJECTION_PATH, 'source-free reference application'),
    ]) } : {}),
  });
}

const isReceipt = (value: unknown): value is Receipt =>
  object(value) && Object.keys(value).length === 2 && typeof value.path === 'string'
  && typeof value.sha256 === 'string' && SHA256.test(value.sha256);

export function adaptiveSourceSealInputHashes(route: AdaptiveSourceSealRoute): Record<string, string> {
  return route.referenceApplication
    ? { referenceApplicationSha256: route.referenceApplication[0]!.sha256 }
    : {};
}

export function isAdaptiveSourceSealRoute(value: unknown): value is AdaptiveSourceSealRoute {
  if (!object(value) || value.schema !== ADAPTIVE_SOURCE_SEAL_ROUTE_SCHEMA
    || value.executionStyle !== 'model-led'
    || ![value.pointer, value.record, value.sourcePointer, value.sourceContract, value.authority].every(isReceipt)
    || !object(value.selectedModel)
    || !Array.isArray(value.stages)
    || value.stages.length !== STAGES.length) return false;
  if (Object.hasOwn(value, 'referenceApplication') && (!Array.isArray(value.referenceApplication)
    || value.referenceApplication.length !== 2
    || !value.referenceApplication.every(isReceipt)
    || value.referenceApplication[0]?.path !== REFERENCE_APPLICATION_PATH
    || value.referenceApplication[1]?.path !== REFERENCE_APPLICATION_PROJECTION_PATH)) return false;
  return value.stages.every((stage, index) => object(stage)
    && stage.id === STAGES[index]
    && stage.status === 'not-selected'
    && typeof stage.routeSha256 === 'string' && SHA256.test(stage.routeSha256)
    && typeof stage.authoritySha256 === 'string' && SHA256.test(stage.authoritySha256))
    && canonicalRouteJson(value.stages.map(stage => Reflect.get(stage, 'id'))) === canonicalRouteJson(STAGES);
}
