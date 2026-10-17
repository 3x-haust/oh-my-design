import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { makerFail, parseMakerInput } from '../../adapters/pi-maker-contract.ts';
import { requirePiMakerResult, type PiMakerResult } from '../../adapters/pi-maker-runtime.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { adaptiveRouteRecordSha256, pathsOutsideScope, readPersistedRoute } from '../route/index.ts';
import * as v from '../brief/candidate-data.ts';
import { getNativePiRun } from './native-pi-run.ts';
import { requirePreparedMaker, type NativeMakerContext, type PreparedNativeMaker } from './native-maker-packet.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter, replaceProjectFileAtomically, validateProjectWritePath } from './project-write.ts';
import { signNativeObservation, verifyNativeObservation } from './self-signed-activation.ts';

const SCHEMA = 'native-maker-checkpoint-v1';
const nullableBytes = (root: string, path: string): Buffer | null =>
  existsSync(join(root, path)) ? v.readBytes(root, path) : null;
const decode = (value: unknown): Buffer | null => {
  if (value === null) return null;
  if (typeof value !== 'string') return makerFail('restore-bytes');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) return makerFail('restore-bytes');
  return bytes;
};

export function preserveNativeMakerBaseline(
  context: NativeMakerContext, prepared: PreparedNativeMaker, result: PiMakerResult,
) {
  const { root, invocation } = context;
  requirePreparedMaker(prepared, root, invocation);
  requirePiMakerResult(result);
  if (result.receipt.packetSha256 !== sha256(prepared.packet)) makerFail('restore-result-binding');
  const owner = prepared.input.role === 'omd-hand' ? 'hand' : `sketch-${prepared.input.candidateId}`;
  const currentPath = `.omd/makers/current/${owner}.json`;
  const executionSha256 = sha256(canonicalJson(result));
  const payload = {
    schema: SCHEMA, runId: getNativePiRun(invocation, root).runId, owner,
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    routeSha256: prepared.bindings.routeSha256, executionSha256,
    previousCurrent: nullableBytes(root, currentPath)?.toString('base64') ?? null,
    files: result.handback.files.map(file => {
      const before = nullableBytes(root, file.path);
      return { path: file.path, before: before?.toString('base64') ?? null,
        mode: before === null ? null : lstatSync(join(root, file.path)).mode & 0o777,
        afterSha256: sha256(file.content) };
    }),
  };
  const writer = createProjectWriteAdapter(root, invocation);
  const receipt = v.publishRecord(writer, '.omd/makers/checkpoints', {
    ...payload, signature: signNativeObservation(root, SCHEMA, sha256(canonicalJson(payload))),
  });
  replaceProjectFileAtomically({ projectRoot: root, invocation,
    relativePath: `.omd/makers/checkpoints/current-${owner}.json`, content: canonicalJson(receipt) });
}

export function restoreNativeMaker(context: NativeMakerContext) {
  const { root, invocation } = context;
  const input = parseMakerInput(context.input);
  const run = getNativePiRun(invocation, root);
  const owner = input.role === 'omd-hand' ? 'hand' : `sketch-${input.candidateId}`;
  const release = acquireProjectMutationLock(root, invocation);
  try {
    const route = readPersistedRoute(root, invocation);
    const receipt = v.receipt(JSON.parse(v.readBytes(root, `.omd/makers/checkpoints/current-${owner}.json`).toString('utf8')));
    if (receipt.path !== `.omd/makers/checkpoints/sha256-${receipt.sha256}.json`) makerFail('restore-checkpoint-path');
    const record = v.object(JSON.parse(v.readReceipt(root, receipt).toString('utf8')), [
      'schema', 'runId', 'owner', 'buildSha256', 'briefSha256', 'routeSha256',
      'executionSha256', 'previousCurrent', 'files', 'signature',
    ]);
    const { signature, ...payload } = record;
    if (payload.schema !== SCHEMA || payload.runId !== run.runId || payload.owner !== owner
      || payload.buildSha256 !== invocation.current.buildSha256 || payload.briefSha256 !== invocation.current.briefSha256
      || payload.routeSha256 !== adaptiveRouteRecordSha256(route)
      || !verifyNativeObservation(root, SCHEMA, sha256(canonicalJson(payload)), v.text(signature))) {
      makerFail('restore-checkpoint-authority');
    }
    const files = v.list(payload.files, value => {
      const file = v.object(value, ['path', 'before', 'mode', 'afterSha256']);
      const path = v.path(file.path), before = decode(file.before);
      if ((before === null && file.mode !== null) || (before !== null
        && (typeof file.mode !== 'number' || !Number.isInteger(file.mode) || file.mode < 0 || file.mode > 0o777))) {
        return makerFail('restore-mode');
      }
      return { path, before, mode: typeof file.mode === 'number' ? file.mode : undefined,
        afterSha256: v.sha(file.afterSha256) };
    });
    v.unique(files, file => file.path);
    if (!files.length || files.some(file => !input.paths.includes(file.path))
      || (input.role === 'omd-hand' && pathsOutsideScope(route, files.map(file => file.path)).length)) {
      makerFail('restore-path-scope');
    }
    const previousCurrent = decode(payload.previousCurrent);
    const currentPath = `.omd/makers/current/${owner}.json`;
    const executionSha256 = v.sha(payload.executionSha256);
    const expectedCurrent = Buffer.from(canonicalJson({ schema: 'native-maker-current-v1',
      receiptPath: `.omd/makers/executions/${executionSha256}.json`, sha256: executionSha256 }));
    const actualCurrent = nullableBytes(root, currentPath);
    const matches = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
    if (!matches(actualCurrent, expectedCurrent) && !matches(actualCurrent, previousCurrent)) makerFail('restore-owner-drift');
    // A partial restore may resume, but every path must still be exactly before or after this maker.
    for (const file of files) {
      validateProjectWritePath(root, file.path);
      const current = nullableBytes(root, file.path);
      if (!matches(current, file.before) && (current === null || sha256(current) !== file.afterSha256)) {
        makerFail('restore-source-drift');
      }
      if (current !== null && (lstatSync(join(root, file.path)).mode & 0o777) !== (file.mode ?? 0o600)) {
        makerFail('restore-source-mode-drift');
      }
    }
    const writer = createProjectWriteAdapter(root, invocation);
    for (const file of files) {
      if (file.before === null) {
        if (existsSync(join(root, file.path))) writer.remove(file.path);
      } else replaceProjectFileAtomically({ projectRoot: root, invocation,
        relativePath: file.path, content: file.before, ...(file.mode === undefined ? {} : { mode: file.mode }) });
    }
    if (previousCurrent === null) {
      if (existsSync(join(root, currentPath))) writer.remove(currentPath);
    } else replaceProjectFileAtomically({ projectRoot: root, invocation,
      relativePath: currentPath, content: previousCurrent });
    return { schema: 'native-maker-restoration-v1' as const, checkpoint: receipt,
      paths: files.map(file => file.path), requiresFreshEvaluation: true };
  } finally { release(); }
}
