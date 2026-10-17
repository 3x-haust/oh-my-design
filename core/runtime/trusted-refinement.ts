import type { Receipt } from '../measure/types.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import type { ProjectWriteAdapter } from './project-write.ts';
import type { ObservationV2 } from './observation.ts';

/** Structured production-repair checkpoints are not part of model-led execution. */
export function recordTrustedRefinementObservation(
  _root: string,
  _observation: ObservationV2,
  _measurements: readonly Receipt[],
  _writer: ProjectWriteAdapter,
  _invocation: ProjectRunInvocation,
): undefined {
  return undefined;
}

export function currentRefinementBinding(
  _root: string,
  _invocation: ProjectRunInvocation,
  _observations: readonly string[],
): null {
  return null;
}
