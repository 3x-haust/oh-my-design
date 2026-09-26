import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../core/runtime/stable-project-file.ts';
import { signNativeObservation, verifyNativeObservation } from '../core/runtime/self-signed-activation.ts';

const KIND = 'pi-user-request';
const POINTER = '.omd/request-source.json';
const DIRECTORY = '.omd/request-sources';
const SHA256 = /^[a-f0-9]{64}$/u;
const fs = nodeStableProjectFileSystem();
export const requestDigest = (text: string): string => createHash('sha256').update(text).digest('hex');
export type PiRequestSource = Readonly<{ request: string; requestSha256: string; recordSha256: string }>;

export class PiRequestBindingError extends Error {
  override readonly name = 'PiRequestBindingError';
  constructor(reason: string) { super(`OMD_REQUEST_BINDING: ${reason}`); }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new PiRequestBindingError('invalid source record');
  return Object.fromEntries(Object.entries(value));
}

function read(root: string, path: string): string {
  return readStableProjectFile({ root, path: join(root, path), label: 'Pi request source', fs }).toString('utf8');
}

function directory(root: string, path: string): void {
  let current = root;
  for (const segment of path.split('/')) {
    current = join(current, segment);
    try { mkdirSync(current, { mode: 0o700 }); }
    catch (error) { if (!(error instanceof Error && Reflect.get(error, 'code') === 'EEXIST')) throw error; }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new PiRequestBindingError('source directory must not be a symlink');
  }
}

/** A signed native input observation, never a review or permission receipt. */
export function capturePiRequest(root: string, request: string): PiRequestSource {
  const projectRoot = realpathSync(root);
  directory(projectRoot, DIRECTORY);
  directory(projectRoot, '.omd/activation');
  const payload = { schema: 'pi-request-source-v1', projectRoot, request, requestSha256: requestDigest(request), nonce: randomBytes(16).toString('hex') };
  const signature = signNativeObservation(projectRoot, KIND, requestDigest(canonicalRouteJson(payload)));
  const bytes = `${canonicalRouteJson({ ...payload, signature })}\n`;
  const recordSha256 = requestDigest(bytes);
  const record = `${DIRECTORY}/sha256-${recordSha256}.json`;
  writeFileSync(join(projectRoot, record), bytes, { flag: 'wx', mode: 0o600 });
  const staging = join(projectRoot, `.omd/.request-source-${randomBytes(8).toString('hex')}.tmp`);
  try {
    writeFileSync(staging, `${canonicalRouteJson({ schema: 'pi-request-source-pointer-v1', record, sha256: recordSha256 })}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(staging, join(projectRoot, POINTER));
  } finally {
    if (existsSync(staging)) unlinkSync(staging);
  }
  return Object.freeze({ request, requestSha256: payload.requestSha256, recordSha256 });
}

export function readPiRequest(root: string): PiRequestSource | undefined {
  try {
    const projectRoot = realpathSync(root);
    if (!existsSync(join(projectRoot, POINTER))) {
      if (existsSync(join(projectRoot, DIRECTORY))) throw new PiRequestBindingError('captured source pointer is missing');
      return;
    }
    const pointer = object(JSON.parse(read(projectRoot, POINTER)));
    if (Object.keys(pointer).sort().join(',') !== 'record,schema,sha256' || pointer.schema !== 'pi-request-source-pointer-v1'
      || typeof pointer.sha256 !== 'string' || !SHA256.test(pointer.sha256)
      || pointer.record !== `${DIRECTORY}/sha256-${pointer.sha256}.json`) throw new PiRequestBindingError('source pointer is invalid');
    const bytes = read(projectRoot, `${DIRECTORY}/sha256-${pointer.sha256}.json`);
    if (requestDigest(bytes) !== pointer.sha256) throw new PiRequestBindingError('source digest changed');
    const record = object(JSON.parse(bytes));
    if (Object.keys(record).sort().join(',') !== 'nonce,projectRoot,request,requestSha256,schema,signature'
      || record.schema !== 'pi-request-source-v1' || record.projectRoot !== projectRoot
      || typeof record.request !== 'string' || !record.request.trim()
      || record.requestSha256 !== requestDigest(record.request) || typeof record.nonce !== 'string' || !/^[a-f0-9]{32}$/u.test(record.nonce)
      || typeof record.signature !== 'string') throw new PiRequestBindingError('source record is invalid');
    const { signature, ...payload } = record;
    if (!verifyNativeObservation(projectRoot, KIND, requestDigest(canonicalRouteJson(payload)), signature)) throw new PiRequestBindingError('source signature is invalid');
    return Object.freeze({ request: record.request, requestSha256: requestDigest(record.request), recordSha256: pointer.sha256 });
  } catch (error) {
    if (error instanceof PiRequestBindingError) throw error;
    if (error instanceof Error) throw new PiRequestBindingError('captured source cannot be read or verified');
    throw error;
  }
}
