import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProductionReadiness } from '../brief/production-readiness.ts';
import { checkTerminalCompletion } from '../completion/preflight.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/index.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';

const base = (routeSha256: string | null) => ({
  schema: 'stage-next-v2' as const,
  meaning: 'next-work-not-completion' as const,
  deliveryMode: 'implementation' as const,
  owner: 'coordinator' as const,
  confidenceDebt: [],
  deferredStages: [] as string[],
  progress: {
    routeSha256,
    workSha256: null,
    materialProgressIdentities: [] as string[],
    validatedStages: [] as string[],
  },
  problems: [] as string[],
  entryBlockers: [] as string[],
  planning: [] as string[],
  schemas: [] as string[],
  contracts: [] as string[],
  judgedBy: [] as string[],
  referenceWork: null,
});

/** Sole model-led work pointer retained for host continuation. */
export function nextStageWork(root: string, packRoot: string, invocation: ProjectRunInvocation) {
  if (!existsSync(resolve(root, '.omd/route.json'))) {
    return {
      ...base(null),
      stage: 'route',
      action: 'classify-route',
      next: 'omd route starter --json',
      instruction: 'Author the model-led route input, validate it, and classify it before production.',
    };
  }
  const route = readPersistedRoute(root, invocation);
  const routeSha256 = adaptiveRouteRecordSha256(route);
  if (!isModelLedProcess(route.sourceContract)) {
    return {
      ...base(routeSha256),
      stage: 'unsupported',
      action: 'stop-blocked',
      problems: ['LEGACY_STRUCTURED_PROCESS_UNSUPPORTED'],
      next: null,
      instruction: 'This persisted structured route is historical and cannot resume production. Start a new model-led route from the unchanged request.',
    };
  }
  const readiness = checkProductionReadiness(root, invocation, packRoot);
  if (!readiness.ok) {
    return {
      ...base(routeSha256),
      stage: 'production',
      action: 'repair-production-readiness',
      problems: readiness.blockers,
      next: 'omd guard production --json',
      instruction: 'Repair the current authority, scope, design-language, or unresolved reframe blocker, then rerun the production guard.',
    };
  }
  if (!existsSync(resolve(root, '.omd/.cache/trusted-lifecycle-manifest.json'))) {
    return {
      ...base(routeSha256),
      stage: 'browser-evidence',
      action: 'author-lifecycle-manifest',
      next: 'omd schema trusted-lifecycle-manifest --json',
      instruction: 'Author the trusted lifecycle manifest for the actual built entry and requested outcomes.',
    };
  }
  try {
    checkTerminalCompletion(root, invocation);
    return {
      ...base(routeSha256),
      stage: null,
      action: 'report-completion',
      next: 'omd guard completion --json',
      instruction: 'Terminal evidence is current. Run the completion guard before reporting completion.',
    };
  } catch {
    return {
      ...base(routeSha256),
      stage: 'independent-review',
      action: 'finish-model-led',
      next: 'omd lifecycle finish --json',
      instruction: 'Run model-led lifecycle completion to evaluate the real build, perform isolated review, and publish final evidence.',
    };
  }
}
