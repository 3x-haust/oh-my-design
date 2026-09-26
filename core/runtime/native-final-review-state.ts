import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { buildFinalReviewerPublication } from '../../adapters/final-reviewer-publication.ts';
import { requireFinalReviewerLaneAuthorization, type ProjectRunInvocation } from './invocation.ts';
import { getNativePiRun } from './native-pi-run.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';

type Descriptor = Readonly<{ path: string; sha256: string }>;
type Lane = 'blindLane' | 'fidelityLane' | 'protocolLane';
const pointerPath = '.omd/final-review/native-current.json';
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export class NativeFinalReviewStateError extends Error {
  override readonly name = 'NativeFinalReviewStateError';
  constructor(reason: string) { super(`NATIVE_FINAL_REVIEW_INVALID:${reason}`); }
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NativeFinalReviewStateError('object required');
  return Object.fromEntries(Object.entries(value));
}
function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new NativeFinalReviewStateError('unexpected fields');
}
function descriptor(value: unknown): Descriptor {
  const item = object(value);
  exact(item, ['path', 'sha256']);
  if (typeof item.path !== 'string' || !item.path.startsWith('.omd/final-review/')
    || item.path.includes('\\') || item.path.split('/').some(part => part === '..' || part === '.' || part === '')
    || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new NativeFinalReviewStateError('artifact descriptor');
  return { path: item.path, sha256: item.sha256 };
}

export function checkNativeFinalReview(input: Readonly<{ root: string; invocation: ProjectRunInvocation }>): Readonly<{
  ok: true; lanes: Readonly<Record<Lane, Descriptor>>; executions: readonly Descriptor[];
}> {
  const run = getNativePiRun(input.invocation, input.root);
  const read = (path: string): Buffer => readStableProjectFile({ root: run.projectRoot, path: resolve(run.projectRoot, path),
    label: 'native final review state', fs: nodeStableProjectFileSystem() });
  const bytes = read(pointerPath);
  requireFinalReviewerLaneAuthorization(input.invocation, run.projectRoot, bytes);
  const pointer = object(JSON.parse(bytes.toString('utf8')));
  if (pointer.schema === 'native-pi-final-review-pending-v1') throw new NativeFinalReviewStateError('review in progress or rejected; inspect review attempts');
  if (pointer.schema === 'native-pi-final-review-rejected-v1') {
    const attempt = descriptor(pointer.attempt);
    throw new NativeFinalReviewStateError(`review in progress or rejected: ${String(pointer.reason)}; inspect ${attempt.path}`);
  }
  exact(pointer, ['schema', 'runId', 'buildSha256', 'briefSha256', 'lanes', 'attempt']);
  if (pointer.schema !== 'native-pi-final-review-v1' || pointer.runId !== run.runId
    || pointer.buildSha256 !== run.buildSha256 || pointer.briefSha256 !== run.briefSha256) throw new NativeFinalReviewStateError('run binding');
  const load = (artifact: Descriptor): Buffer => {
    const bytes = read(artifact.path);
    if (hash(bytes) !== artifact.sha256) throw new NativeFinalReviewStateError('artifact changed');
    return bytes;
  };
  const attemptDescriptor = descriptor(pointer.attempt);
  if (attemptDescriptor.path !== `.omd/final-review/attempts/sha256-${attemptDescriptor.sha256}.json`) throw new NativeFinalReviewStateError('attempt path');
  const attempt = object(JSON.parse(load(attemptDescriptor).toString('utf8')));
  exact(attempt, ['schema', 'runId', 'results', 'failures']);
  if (attempt.schema !== 'native-pi-final-review-attempt-v1' || attempt.runId !== run.runId
    || !Array.isArray(attempt.failures) || attempt.failures.length !== 0
    || !Array.isArray(attempt.results) || attempt.results.length !== 3) throw new NativeFinalReviewStateError('review attempt');
  const rawLanes = object(pointer.lanes);
  exact(rawLanes, ['blindLane', 'fidelityLane', 'protocolLane']);
  const lanes = { blindLane: descriptor(rawLanes.blindLane), fidelityLane: descriptor(rawLanes.fidelityLane), protocolLane: descriptor(rawLanes.protocolLane) };
  const results = attempt.results.map(object);
  const executions: Descriptor[] = [];
  for (const name of ['blindLane', 'fidelityLane', 'protocolLane'] as const) {
    const matching = results.filter(result => result.lane === name);
    const result = matching[0];
    if (matching.length !== 1 || !result) throw new NativeFinalReviewStateError('lane results missing or reused');
    exact(result, ['lane', 'roleResults']);
    const laneBytes = load(lanes[name]);
    requireFinalReviewerLaneAuthorization(input.invocation, run.projectRoot, laneBytes);
    const current = buildFinalReviewerPublication({ schema: 'adaptive-final-review-publication-v1',
      laneSchema: object(JSON.parse(laneBytes.toString('utf8'))).schema, roleResults: result.roleResults }, {
      projectRoot: run.projectRoot, invocation: input.invocation, buildSha256: run.buildSha256, briefSha256: run.briefSha256,
    });
    if (current.lane.path !== lanes[name].path || !current.lane.bytes.equals(laneBytes)) throw new NativeFinalReviewStateError('lane no longer matches current review');
    for (const execution of current.executions) {
      const bytes = load(execution);
      requireFinalReviewerLaneAuthorization(input.invocation, run.projectRoot, bytes);
      if (!bytes.equals(execution.bytes)) throw new NativeFinalReviewStateError('execution changed');
      executions.push({ path: execution.path, sha256: execution.sha256 });
    }
  }
  return { ok: true, lanes, executions };
}
