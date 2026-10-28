import { createHash } from 'node:crypto';
import { readFrame } from '../frame/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun, isNativePiInvocation } from '../runtime/native-pi-run.ts';
import { selectDeveloperEvaluationCases, type DeveloperEvaluationScope } from './developer-evaluation-contract.ts';

export function currentCalibrationScope(root: string): DeveloperEvaluationScope | null {
  const frame = readFrame(root);
  if (!frame?.uxSurface || !frame.uxTask || !frame.entrySurface) return null;
  return Object.freeze({
    route: `/${frame.entrySurface.entryPath}`,
    surface: frame.uxSurface,
    task: createHash('sha256').update(frame.uxTask).digest('hex'),
  });
}

export function currentDeveloperCalibration(root: string, invocation?: ProjectRunInvocation) {
  if (invocation === undefined || !isNativePiInvocation(invocation)) return null;
  const snapshot = getNativePiRun(invocation, root).calibration;
  if (snapshot === undefined) return null;
  const scope = currentCalibrationScope(root);
  const cases = scope === null ? [] : selectDeveloperEvaluationCases(snapshot, scope);
  return Object.freeze({
    snapshotSha256: snapshot.digest,
    mode: snapshot.mode,
    scope,
    cases,
    precedence: 'Current request, project constraints and verified evidence override these advisory examples.',
    limitation: snapshot.mode === 'experimental'
      ? 'These are unvalidated developer experiment examples, not approved calibration, this user’s taste or a verdict on this output.'
      : 'Past developer comparisons are calibration data, not this user’s taste or a verdict on this output.',
  });
}
