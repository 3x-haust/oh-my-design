import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { artDirectionSha256, validateArtDirectionPointer, validateArtDirectionRecord } from '../art-direction/schema.ts';
import { parseReferenceHandoffReceipt, validateDecisionBoundReferenceHandoffs } from '../ref/reference-handoff.ts';
import { adaptiveRouteAuthorityBytes, adaptiveRouteAuthorityPath } from '../route/adaptive-route-authority.ts';
import {
  ADAPTIVE_ROUTE_POINTER_SCHEMA,
  ADAPTIVE_ROUTE_SOURCE_POINTER_SCHEMA,
  readPersistedRoute,
} from '../route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import { intentLedgerSha256, validateIntentCurrentPointer, validateIntentLedger } from '../runtime/intent.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { readCurrentCulturalDesignProfile } from '../locale/cultural-profile-files.ts';
import { checkReferenceApplication, REFERENCE_APPLICATION_PATH, REFERENCE_APPLICATION_PROJECTION_PATH } from '../ref/reference-application.ts';
import {
  REFERENCE_LOCALE_BINDING_EVIDENCE_PATH,
  REFERENCE_LOCALE_BINDING_PATH,
  validateReferenceLocaleBindingCurrentness,
} from '../ref/reference-locale-binding.ts';

export const ADAPTIVE_SOURCE_SEAL_ROUTE_SCHEMA = 'adaptive-source-seal-route-v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const APPROVED_INPUTS = Object.freeze([
  ['art-direction', null],
  ['copy', '.omd/copy-deck.md'],
  ['type-proof', '.omd/type-proof.md'],
  ['composition', '.omd/composition.md'],
] as const);

type Receipt = Readonly<{ path: string; sha256: string }>;
type StageBinding = Readonly<
  | { id: string; status: 'selected'; artifacts: readonly Receipt[] }
  | { id: string; status: 'skipped'; reason: string; routeSha256: string; authoritySha256: string }
>;
export type AdaptiveSourceSealRoute = Readonly<{
  schema: typeof ADAPTIVE_SOURCE_SEAL_ROUTE_SCHEMA;
  pointer: Receipt;
  record: Receipt;
  sourcePointer: Receipt;
  sourceContract: Receipt;
  authority: Receipt;
  selectedModel: AdaptiveRouteRecord['selectedModel'];
  stages: readonly StageBinding[];
  referenceApplication?: readonly Receipt[];
}>;

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fs = nodeStableProjectFileSystem();

function read(root: string, path: string, label: string): Buffer {
  return readStableProjectFile({ root, path: resolve(root, path), label, fs });
}
function receipt(root: string, path: string, label: string): Receipt {
  return Object.freeze({ path, sha256: hash(read(root, path, label)) });
}
function json(root: string, path: string, label: string): unknown {
  const value: unknown = JSON.parse(read(root, path, label).toString('utf8'));
  return value;
}
function currentArtDirection(root: string): readonly Receipt[] {
  const pointerPath = '.omd/art-direction.json';
  let pointer;
  try { pointer = validateArtDirectionPointer(json(root, pointerPath, 'art-direction current pointer')); } catch {
    throw new Error('ART_DIRECTION_DECISION_REQUIRED: selected adaptive art-direction requires its exact current decision');
  }
  const recordPath = `.omd/${pointer.record}`;
  const record = validateArtDirectionRecord(json(root, recordPath, 'art-direction immutable record'));
  if (pointer.sha256 !== artDirectionSha256(record)) throw new Error('ART_DIRECTION_RECORD_STALE: current pointer does not match immutable record');
  const intentPointer = validateIntentCurrentPointer(json(root, '.omd/intent-current.json', 'intent current pointer'));
  const ledger = validateIntentLedger(json(root, `.omd/${intentPointer.record}`, 'intent immutable record'));
  if (intentLedgerSha256(ledger) !== intentPointer.sha256 || record.intentLedgerSha256 !== intentPointer.sha256) {
    throw new Error('ART_DIRECTION_INTENT_STALE: current art direction is not bound to the current intent ledger');
  }
  const composer = parseReferenceHandoffReceipt(json(root, '.omd/reference-handoffs/composer.json', 'composer reference handoff'));
  const hand = parseReferenceHandoffReceipt(json(root, '.omd/reference-handoffs/hand.json', 'hand reference handoff'));
  validateDecisionBoundReferenceHandoffs(root, { composer, hand });
  return Object.freeze([
    receipt(root, pointerPath, 'art-direction current pointer'),
    receipt(root, recordPath, 'art-direction immutable record'),
    receipt(root, '.omd/reference-handoffs/composer.json', 'composer reference handoff'),
    receipt(root, '.omd/reference-handoffs/hand.json', 'hand reference handoff'),
  ]);
}
function stageBindings(
  root: string,
  record: AdaptiveRouteRecord,
  routeSha256: string,
  authoritySha256: string,
  invocation: ProjectRunInvocation,
): readonly StageBinding[] {
  return Object.freeze(APPROVED_INPUTS.map(([id, path]): StageBinding => {
    if (record.strategy.stages.includes(id)) {
      let artifacts = path === null
        ? currentArtDirection(root)
        : Object.freeze([receipt(root, path, `${id} approved input`)]);
      if (id === 'composition' && record.sourceContract.localeDesign?.decision === 'research') {
        const locale = readCurrentCulturalDesignProfile(root, invocation);
        const referenceBinding = record.strategy.stages.includes('reference-board')
          && existsSync(resolve(root, '.omd/reference-board.json'))
          ? validateReferenceLocaleBindingCurrentness(root)
          : null;
        artifacts = Object.freeze([
          ...artifacts,
          receipt(root, locale.profilePointerPath, 'cultural profile pointer'),
          receipt(root, locale.profileRecordPath, 'cultural profile record'),
          receipt(root, locale.projectionPointerPath, 'cultural projection pointer'),
          receipt(root, locale.projectionRecordPath, 'cultural projection record'),
          ...(referenceBinding === null ? [] : [
            receipt(root, REFERENCE_LOCALE_BINDING_PATH, 'locale reference binding projection'),
            receipt(root, REFERENCE_LOCALE_BINDING_EVIDENCE_PATH, 'locale reference binding evidence'),
          ]),
        ]);
      }
      return Object.freeze({ id, status: 'selected', artifacts });
    }
    const skipped = record.strategy.skips.find((entry) => entry.id === id);
    if (skipped === undefined) throw new Error(`ADAPTIVE_SKIP_AUTHORITY_REQUIRED: ${id} has no exact route skip decision`);
    return Object.freeze({ id, status: 'skipped', reason: skipped.reason, routeSha256, authoritySha256 });
  }));
}
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

export function createAdaptiveSourceSealRoute(root: string, invocation: ProjectRunInvocation): AdaptiveSourceSealRoute {
  const record = readPersistedRoute(root, invocation);
  const routePointer = persistedPointer(
    root,
    '.omd/route.json',
    ADAPTIVE_ROUTE_POINTER_SCHEMA,
    'route-records',
  );
  const sourcePointer = persistedPointer(
    root,
    '.omd/route-source.json',
    ADAPTIVE_ROUTE_SOURCE_POINTER_SCHEMA,
    'route-sources',
  );
  const authorityRecord = record.sourceContractSha256 === sourcePointer.sha256
    ? record
    : Object.freeze({ ...record, sourceContractSha256: sourcePointer.sha256 });
  const authorityBytes = adaptiveRouteAuthorityBytes(
    authorityRecord,
    routePointer.sha256,
    invocation,
  );
  const authoritySha256 = hash(authorityBytes);
  const routePath = `.omd/${routePointer.record}`;
  const sourcePath = `.omd/${sourcePointer.record}`;
  const authorityPath = `.omd/${adaptiveRouteAuthorityPath(authorityBytes)}`;
  const stages = stageBindings(root, record, routePointer.sha256, authoritySha256, invocation);
  // Selected research decisions are approved production inputs, not mutable notes outside the seal.
  // Keep non-discovery/copy-only routes free of unrelated reference requirements.
  const requiresApplication = record.gates.includes('dual-reference-research')
    || (record.projectMode === 'greenfield' && existsSync(resolve(root, '.omd/reference-research.json')));
  // Partial pre-production snapshots remain possible. They cannot pass application review/final
  // completion: that gate requires the exact application input digest. Publishing the missing plan
  // changes this route binding and invalidates the preliminary seal rather than blessing it later.
  const needsApplication = requiresApplication && existsSync(resolve(root, REFERENCE_APPLICATION_PATH));
  if (needsApplication) checkReferenceApplication(root, {
    expectedSourceContractSha256: record.sourceContractSha256,
    benchmarkRequired: record.gates.includes('greenfield-task-flow-benchmark'), expectedRequest: record.request,
  });
  return Object.freeze({
    schema: ADAPTIVE_SOURCE_SEAL_ROUTE_SCHEMA,
    pointer: receipt(root, '.omd/route.json', 'adaptive route pointer'),
    record: receipt(root, routePath, 'adaptive route record'),
    sourcePointer: receipt(root, '.omd/route-source.json', 'adaptive route source pointer'),
    sourceContract: receipt(root, sourcePath, 'adaptive route source contract'),
    authority: receipt(root, authorityPath, 'adaptive route authority'),
    selectedModel: record.selectedModel,
    stages,
    ...(needsApplication ? { referenceApplication: Object.freeze([
      receipt(root, REFERENCE_APPLICATION_PATH, 'screen reference application'),
      receipt(root, REFERENCE_APPLICATION_PROJECTION_PATH, 'source-free reference application'),
    ]) } : {}),
  });
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isReceipt(value: unknown): value is Receipt {
  return object(value) && Object.keys(value).length === 2 && typeof value.path === 'string'
    && typeof value.sha256 === 'string' && SHA256.test(value.sha256);
}
function isStage(value: unknown): value is StageBinding {
  if (!object(value) || typeof value.id !== 'string') return false;
  if (value.status === 'selected') return Object.keys(value).length === 3
    && Array.isArray(value.artifacts) && value.artifacts.length > 0 && value.artifacts.every(isReceipt);
  return value.status === 'skipped' && Object.keys(value).length === 5 && typeof value.reason === 'string'
    && value.reason.trim().length > 0 && typeof value.routeSha256 === 'string' && SHA256.test(value.routeSha256)
    && typeof value.authoritySha256 === 'string' && SHA256.test(value.authoritySha256);
}
export function adaptiveSourceSealInputHashes(route: AdaptiveSourceSealRoute): Record<string, string> {
  const hashes: Record<string, string> = {};
  if (route.referenceApplication) hashes.referenceApplicationSha256 = route.referenceApplication[0]!.sha256;
  for (const stage of route.stages) {
    if (stage.status !== 'selected') continue;
    const artifact = stage.id === 'art-direction' ? stage.artifacts[1] : stage.artifacts[0];
    if (artifact === undefined) throw new Error(`cannot seal source: ${stage.id} selected artifact is missing`);
    const key = stage.id === 'art-direction' ? 'artDirectionSha256'
      : stage.id === 'copy' ? 'copyDeckSha256'
      : stage.id === 'type-proof' ? 'typeProofSha256'
      : stage.id === 'composition' ? 'compositionSha256' : undefined;
    if (key !== undefined) hashes[key] = artifact.sha256;
  }
  return hashes;
}

export function isAdaptiveSourceSealRoute(value: unknown): value is AdaptiveSourceSealRoute {
  if (!object(value) || Object.keys(value).length !== (Object.hasOwn(value, 'referenceApplication') ? 9 : 8) || value.schema !== ADAPTIVE_SOURCE_SEAL_ROUTE_SCHEMA) return false;
  if (Object.hasOwn(value, 'referenceApplication') && (!Array.isArray(value.referenceApplication)
    || value.referenceApplication.length !== 2 || !value.referenceApplication.every(isReceipt)
    || value.referenceApplication[0]?.path !== REFERENCE_APPLICATION_PATH
    || value.referenceApplication[1]?.path !== REFERENCE_APPLICATION_PROJECTION_PATH)) return false;
  if (![value.pointer, value.record, value.sourcePointer, value.sourceContract, value.authority].every(isReceipt)) return false;
  if (!object(value.selectedModel) || !Array.isArray(value.stages) || value.stages.length !== APPROVED_INPUTS.length
    || !value.stages.every(isStage)) return false;
  return canonicalRouteJson(value.stages.map((stage) => stage.id)) === canonicalRouteJson(APPROVED_INPUTS.map(([id]) => id));
}
