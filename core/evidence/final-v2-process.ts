import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import { currentRefinementBinding } from '../runtime/trusted-refinement.ts';

export type TerminalProcessBinding = Readonly<{
  schema: 'model-led-terminal-process-binding-v1';
  routeSha256: string;
  refinement: ReturnType<typeof currentRefinementBinding>;
}>;

/**
 * Model-led execution has no structured design-process artifact graph.
 * The browser observations, measurements, review policy and final reviewer lanes
 * are the complete terminal evidence surface.
 */
export function loadTerminalProcess(
  root: string,
  invocation: ProjectRunInvocation,
  observations: readonly string[],
): Readonly<{ binding: TerminalProcessBinding }> {
  const route = readPersistedRoute(root, invocation);
  if (route.sourceContract.processPolicy !== undefined && !isModelLedProcess(route.sourceContract)) {
    throw new Error('LEGACY_STRUCTURED_PROCESS_UNSUPPORTED');
  }
  return Object.freeze({ binding: Object.freeze({
    schema: 'model-led-terminal-process-binding-v1',
    routeSha256: adaptiveRouteRecordSha256(route),
    refinement: currentRefinementBinding(root, invocation, observations),
  }) });
}
