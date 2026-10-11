import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { makerFail } from '../../adapters/pi-maker-contract.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { verifyNativeObservation } from './self-signed-activation.ts';

/** Current source ownership, not aesthetic approval. Historical receipts remain immutable. */
export function currentMakerSource(root: string, invocation: ProjectRunInvocation, owner: string) {
  if (!/^(?:hand|sketch-[A-Za-z0-9][A-Za-z0-9._-]*)$/.test(owner)) return makerFail('current-owner');
  const path = `.omd/makers/current/${owner}.json`;
  if (!existsSync(join(root, path))) return null;
  const read = (path: string) => readContainedRegularFile(root, path, 'current maker execution');
  const pointer = piRecord(JSON.parse(read(path).toString('utf8')), 'maker-pointer');
  const digest = piDigest(pointer.sha256, 'maker-execution-sha');
  const receiptPath = `.omd/makers/executions/${digest}.json`;
  if (pointer.schema !== 'native-maker-current-v1' || pointer.receiptPath !== receiptPath) makerFail('current-pointer');
  const bytes = read(receiptPath);
  if (sha256(bytes) !== digest) makerFail('current-execution-drift');
  const result = piRecord(JSON.parse(bytes.toString('utf8')), 'maker-execution');
  const receipt = piRecord(result.receipt, 'maker-execution-receipt');
  const role = owner === 'hand' ? 'omd-hand' : 'omd-sketch';
  if (receipt.schema !== 'native-pi-maker-execution-v1' || receipt.projectRoot !== root || receipt.role !== role
    || !verifyNativeObservation(root, 'native-pi-maker-execution-v1', sha256(canonicalJson(receipt)),
      piText(result.signature, 'maker-execution-signature'))) makerFail('current-execution-authority');
  const handback = piRecord(result.handback, 'maker-execution-handback');
  if (canonicalJson(JSON.parse(piText(receipt.finalMessage, 'maker-execution-final'))) !== canonicalJson(handback)) {
    makerFail('current-handback-authority');
  }
  const bindings = piRecord(receipt.fixedBindings, 'maker-execution-bindings');
  const route = readPersistedRoute(root, invocation);
  if (bindings.buildSha256 !== invocation.current.buildSha256 || bindings.briefSha256 !== invocation.current.briefSha256
    || bindings.routeSha256 !== adaptiveRouteRecordSha256(route)) return null;
  if (!Array.isArray(handback.files)) return makerFail('current-handback-files');
  for (const value of handback.files) {
    const file = piRecord(value, 'maker-current-file');
    const path = piText(file.path, 'maker-current-file-path');
    if (role === 'omd-sketch' && !path.startsWith(`.omd/.cache/sketches/${owner.slice('sketch-'.length)}/`)) {
      makerFail('current-owner-files');
    }
    if (!existsSync(join(root, path)) || read(path).toString('utf8') !== file.content) return null;
  }
  const nullableDigest = (value: unknown): string | null => value === null ? null : piDigest(value, 'maker-lineage');
  return {
    executionSha256: digest,
    firstRenderReviewSha256: nullableDigest(bindings.firstRenderReviewSha256),
    candidateSelectionSha256: nullableDigest(bindings.candidateSelectionSha256),
    compositionSha256: nullableDigest(bindings.compositionSha256),
  };
}
