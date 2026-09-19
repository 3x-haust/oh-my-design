import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import {
  acquireProjectMutationLock,
  replaceProjectFileAtomically,
  requireProjectWriteAdapter,
  type ProjectWriteAdapter,
} from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { failAdaptiveRoute, type AdaptiveRouteRecord } from './adaptive-flow-domain.ts';
import { routeAdaptiveFlow } from './adaptive-flow.ts';
import { parseRouteRecord } from './adaptive-route-record.ts';
import { publishAdaptiveRouteScopeEvidence } from './adaptive-route-scope.ts';
import { authorizeDerivedPayload } from '../runtime/activation.ts';
import { adaptiveSourceContractSha256, canonicalRouteJson } from './adaptive-source-contract.ts';
import {
  adaptiveRouteAuthorityBytes,
  adaptiveRouteAuthorityPath,
  requireAdaptiveRouteAuthority,
} from './adaptive-route-authority.ts';
import {
  canonicalLocaleDesignJson,
  parseLocaleDesignRoute,
  routeLocaleDesignContext,
  type LocaleDesignRoute,
} from '../locale/design-context.ts';

export const ADAPTIVE_ROUTE_POINTER_SCHEMA = 'adaptive-route-pointer-v1' as const;
export const ADAPTIVE_ROUTE_SOURCE_POINTER_SCHEMA = 'adaptive-route-source-pointer-v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const ROUTE_RECORD = /^route-records\/sha256-([a-f0-9]{64})\.json$/;
const SOURCE_RECORD = /^route-sources\/sha256-([a-f0-9]{64})\.json$/;
const fs = nodeStableProjectFileSystem();

type Pointer = Readonly<{ schema: string; record: string; sha256: string }>;
type PublishedAdaptiveRoute = Readonly<{ record: AdaptiveRouteRecord; pointerPath: '.omd/route.json' }>;

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fields(value: unknown): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const expected = ['schema', 'record', 'sha256'];
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const result = new Map<string, unknown>();
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    }
    result.set(key, descriptor.value);
  }
  return result;
}

function pointer(bytes: Buffer, schema: string, pattern: RegExp): Pointer {
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  const item = fields(value);
  const record = item.get('record');
  const sha256 = item.get('sha256');
  if (item.get('schema') !== schema || typeof record !== 'string' || typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const match = pattern.exec(record);
  if (match === null || match[1] !== sha256) return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
  return Object.freeze({ schema, record, sha256 });
}

function stableRead(root: string, path: string, label: string): Buffer {
  return readStableProjectFile({ root, path: resolve(root, '.omd', path), label, fs });
}

export function adaptiveRouteRecordSha256(record: AdaptiveRouteRecord): string {
  return hash(Buffer.from(`${canonicalRouteJson(record)}\n`));
}

export function publishAdaptiveRoute(
  root: string,
  input: unknown,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
  localeDesign?: LocaleDesignRoute,
): PublishedAdaptiveRoute {
  requireProjectWriteAdapter(root, writer);
  const release = acquireProjectMutationLock(root, invocation);
  try {
    if (localeDesign !== undefined) requireCurrentLocaleDesignContext(root, localeDesign);
    const record = routeAdaptiveFlow(input, { root, invocation }, localeDesign);
    const sourceSha256 = adaptiveSourceContractSha256(record.sourceContract);
    const sourcePath = `route-sources/sha256-${sourceSha256}.json`;
    const recordSha256 = adaptiveRouteRecordSha256(record);
    const recordPath = `route-records/sha256-${recordSha256}.json`;
    const authorityBytes = adaptiveRouteAuthorityBytes(record, recordSha256, invocation);
    // The CLI derived these bytes from the record it is publishing, so it is the authority for them:
    // there is no launcher to ask, and asking one to bless our own derivation was circular. The
    // authorization names this exact purpose and this exact digest, so it authorizes nothing else.
    authorizeDerivedPayload(invocation, root, 'adaptive-route-authority', authorityBytes);
    requireAdaptiveRouteAuthority(root, invocation, authorityBytes);
    publishAdaptiveRouteScopeEvidence(root, recordSha256, writer, invocation);
    writer.writeContentAddressed(`.omd/${adaptiveRouteAuthorityPath(authorityBytes)}`, authorityBytes);
    writer.writeContentAddressed(`.omd/${sourcePath}`, `${canonicalRouteJson(record.sourceContract)}\n`);
    writer.writeContentAddressed(`.omd/${recordPath}`, `${canonicalRouteJson(record)}\n`);
    replaceProjectFileAtomically({
      projectRoot: root,
      invocation,
      relativePath: '.omd/route-source.json',
      content: `${canonicalRouteJson({
        schema: ADAPTIVE_ROUTE_SOURCE_POINTER_SCHEMA, record: sourcePath, sha256: sourceSha256,
      })}\n`,
    });
    replaceProjectFileAtomically({
      projectRoot: root,
      invocation,
      relativePath: '.omd/route.json',
      content: `${canonicalRouteJson({
        schema: ADAPTIVE_ROUTE_POINTER_SCHEMA, record: recordPath, sha256: recordSha256,
      })}\n`,
    });
    return Object.freeze({ record, pointerPath: '.omd/route.json' });
  } finally {
    release();
  }
}

function requireCurrentLocaleDesignContext(root: string, expected: LocaleDesignRoute): void {
  let bytes: Buffer;
  try {
    bytes = readStableProjectFile({
      root,
      path: resolve(root, '.omd', 'locale-design-context.json'),
      label: 'locale design context',
      fs,
    });
  } catch {
    return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
  }
  let current: LocaleDesignRoute;
  try {
    current = routeLocaleDesignContext(JSON.parse(bytes.toString('utf8')) as unknown);
  } catch {
    return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
  }
  const parsedExpected = parseLocaleDesignRoute(expected);
  if (canonicalLocaleDesignJson(current) !== canonicalLocaleDesignJson(parsedExpected)) {
    return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
  }
}

export function readPersistedRoute(root: string, invocation: ProjectRunInvocation): AdaptiveRouteRecord {
  try {
    if (invocation === undefined) return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sourcePointerBytes = stableRead(root, 'route-source.json', 'adaptive route source pointer');
      const routePointerBytes = stableRead(root, 'route.json', 'adaptive route pointer');
      const sourcePointer = pointer(
        sourcePointerBytes,
        ADAPTIVE_ROUTE_SOURCE_POINTER_SCHEMA,
        SOURCE_RECORD,
      );
      const routePointer = pointer(
        routePointerBytes,
        ADAPTIVE_ROUTE_POINTER_SCHEMA,
        ROUTE_RECORD,
      );
      const sourceBytes = stableRead(root, sourcePointer.record, 'adaptive route source authority');
      const recordBytes = stableRead(root, routePointer.record, 'adaptive route record');
      const sourcePointerCurrent = stableRead(
        root,
        'route-source.json',
        'adaptive route source pointer currentness',
      );
      const routePointerCurrent = stableRead(root, 'route.json', 'adaptive route pointer currentness');
      if (!sourcePointerCurrent.equals(sourcePointerBytes)
        || !routePointerCurrent.equals(routePointerBytes)) continue;
      if (hash(sourceBytes) !== sourcePointer.sha256 || hash(recordBytes) !== routePointer.sha256) {
        return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
      }
      const persistedRecord: unknown = JSON.parse(recordBytes.toString('utf8'));
      const legacyRecord = typeof persistedRecord === 'object'
        && persistedRecord !== null
        && !Array.isArray(persistedRecord)
        && !Object.hasOwn(persistedRecord, 'projectMode');
      const record = parseRouteRecord(persistedRecord, { root, invocation });
      if (record.sourceContract.localeDesign !== undefined) {
        requireCurrentLocaleDesignContext(root, record.sourceContract.localeDesign);
      }
      const authorityRecord = legacyRecord
        ? Object.freeze({ ...record, sourceContractSha256: sourcePointer.sha256 })
        : record;
      const authorityBytes = adaptiveRouteAuthorityBytes(
        authorityRecord,
        routePointer.sha256,
        invocation,
      );
      // Reading re-derives the same authority bytes, so the reader is again the authority for them.
      // This is a consistency check, not a second approval: the persisted file must equal what this
      // process derives, which is what detects a tampered record.
      authorizeDerivedPayload(invocation, root, 'adaptive-route-authority', authorityBytes);
      requireAdaptiveRouteAuthority(root, invocation, authorityBytes);
      let persistedAuthority: Buffer;
      try {
        persistedAuthority = stableRead(root, adaptiveRouteAuthorityPath(authorityBytes), 'adaptive route host authority');
      } catch {
        return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED');
      }
      if (!persistedAuthority.equals(authorityBytes)) return failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED');
      const persistedSource = typeof persistedRecord === 'object'
        && persistedRecord !== null
        && !Array.isArray(persistedRecord)
        ? Reflect.get(persistedRecord, 'sourceContract')
        : undefined;
      const sourceMatches = legacyRecord
        ? Reflect.get(persistedRecord, 'sourceContractSha256') === sourcePointer.sha256
          && `${canonicalRouteJson(persistedSource)}\n` === sourceBytes.toString('utf8')
        : record.sourceContractSha256 === sourcePointer.sha256
          && `${canonicalRouteJson(record.sourceContract)}\n` === sourceBytes.toString('utf8');
      if (!sourceMatches) {
        return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
      }
      return record;
    }
    return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
  } catch (error) {
    if (error instanceof Error && error.name === 'AdaptiveRouteError') throw error;
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
}
