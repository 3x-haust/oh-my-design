import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { parseNativePiRun } from '../runtime/native-pi-run-record.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';

export type DirectionAuthorityReceipt = Readonly<{ path: string; sha256: string }>;
export type DirectionUserInput = Readonly<{
  schema: 'direction-user-input-v1';
  projectRoot: string;
  requestSha256: string;
  sourceContractSha256: string;
  inputDigest: string;
  displayedSet: DirectionAuthorityReceipt;
  pendingId: string;
  userMessage: string;
  source: 'pi-interactive' | 'pi-rpc' | 'host-user-input';
  resumeAuthority: DirectionAuthorityReceipt | null;
  signature: string;
}>;
export type NativeDirectionAuthority = Readonly<{
  source: 'native-host-policy';
  projectRoot: string;
  requestSha256: string;
  runId: string;
  policy: 'autonomous-direction';
}>;
const hash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
const object = (value: unknown, keys?: readonly string[]): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('native design authority is malformed');
  const record = Object.fromEntries(Object.entries(value));
  if (keys && Object.keys(record).sort().join(',') !== [...keys].sort().join(',')) return fail('native design authority is malformed');
  return record;
};
const text = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : fail('native design authority is malformed');

export function verifyDirectionAutonomyGrant(
  root: string,
  receipt: DirectionAuthorityReceipt,
  request: string,
): NativeDirectionAuthority {
  const bytes = readStableProjectFile({
    root,
    path: resolve(root, receipt.path),
    label: 'native design authority',
    fs: nodeStableProjectFileSystem(),
  });
  if (hash(bytes) !== receipt.sha256) return fail('native design authority changed');
  const value = object(JSON.parse(bytes.toString('utf8')), ['schema', 'run', 'signature']);
  if (value.schema !== 'native-pi-run-v1') return fail('legacy direction authority is unsupported');
  const run = parseNativePiRun(value.run);
  if (receipt.path !== '.omd/native-pi/run.json' || run.projectRoot !== realpathSync(root)
    || run.briefSha256 !== hash(request) || run.designPolicy?.selectionActor !== 'harness'
    || run.designPolicy.criteriaVersion !== 'model-led-design-v1'
    || !verifyNativeObservation(realpathSync(root), 'pi-run', hash(canonicalRouteJson(run)), text(value.signature))) {
    return fail('native design authority requires the current signed model-led host policy and exact request');
  }
  return {
    source: 'native-host-policy',
    projectRoot: run.projectRoot,
    requestSha256: run.briefSha256,
    runId: run.runId,
    policy: 'autonomous-direction',
  };
}

/** Historical structured selection is no longer a production input. */
export function verifyDirectionUserInput(_root: string, _value: unknown): DirectionUserInput {
  return fail('LEGACY_STRUCTURED_PROCESS_UNSUPPORTED');
}

export function chosenDirectionId(_userMessage: string, _options: readonly string[]): null {
  return null;
}
