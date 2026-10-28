import { browserTaskOutcomeContract } from '../brief/task-outcome.ts';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun, isNativePiInvocation } from '../runtime/native-pi-run.ts';
import { readDesignJudgment } from './judgment-files.ts';

export function firstRenderContext(root: string, invocation?: ProjectRunInvocation) {
  if (invocation && isNativePiInvocation(invocation)
    && getNativePiRun(invocation, root).designPolicy?.criteriaVersion === 'model-led-design-v1') {
    const route = readPersistedRoute(root, invocation);
    if (isModelLedProcess(route.sourceContract)) {
      return {
        schema: 'model-led-first-render-context-v1' as const,
        routeSha256: adaptiveRouteRecordSha256(route),
        sourceContractSha256: route.sourceContractSha256,
        taskOutcome: browserTaskOutcomeContract(route.sourceContract.taskOutcome),
      };
    }
  }
  const hypothesis = readDesignJudgment(root)?.hypothesis;
  if (!hypothesis) throw new Error('FIRST_RENDER_REQUIRED: current design hypothesis is missing');
  return { schema: 'hypothesis-first-render-context-v1' as const, hypothesis };
}
