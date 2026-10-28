import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProductionReadiness } from '../brief/production-readiness.ts';
import { checkTerminalCompletion } from '../completion/preflight.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/index.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { readFirstRenderReview } from '../design/first-render-review.ts';
import { COMPONENT_REFERENCE_GUIDANCE, referenceBreadth } from '../ref/component-references.ts';
import { componentReferencesPending, designBriefPending, directionReviewPending, graphicDecisionPending, GRAPHIC_COMPARISON_GUIDANCE } from '../design/new-surface-advisories.ts';
import { DESIGN_BRIEF_GUIDANCE } from '../design/design-brief.ts';
import { composeGuidance, REPAIR_KNOWLEDGE } from '../design/compose-guidance.ts';
import {
  firstRenderLoopState,
  firstRenderReviewMatchesCurrentRoute,
} from '../design/first-render-checkpoint.ts';

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
  // New products and landings start from a written brief, then look for references in its words.
  if (designBriefPending(root, route)) {
    return {
      ...base(routeSha256),
      stage: 'brief',
      action: 'write-design-brief',
      next: 'omd schema design-brief',
      instruction: DESIGN_BRIEF_GUIDANCE,
    };
  }
  // New products and landings point to component references once.
  if (componentReferencesPending(root, route)) {
    return {
      ...base(routeSha256),
      stage: 'references',
      action: 'gather-component-references',
      next: 'omd ref browse start --lane design --json',
      instruction: `${referenceBreadth(root)} ${COMPONENT_REFERENCE_GUIDANCE}`,
    };
  }
  if (directionReviewPending(root, route)) {
    return {
      ...base(routeSha256),
      stage: 'references',
      action: 'review-reference-directions',
      next: 'omd ref direction-review --json',
      instruction: 'An isolated reviewer judges every kept page for craft and fit: direction, support or reject. Choose the primary '
        + 'from the pages it marks direction and give support pages one named part each; if none is direction, keep better finished sites and review again.',
    };
  }
  // The section graphics are designed before the page around them, as the brief's "shows" plans them.
  if (graphicDecisionPending(root, route, invocation.current.briefSha256)) {
    return {
      ...base(routeSha256),
      stage: 'graphics',
      action: 'compare-section-graphics',
      next: 'omd pack theory/imagegen.md',
      instruction: GRAPHIC_COMPARISON_GUIDANCE,
    };
  }
  // Until the first render exists, the work is composing the page; name the knowledge for that.
  if (!existsSync(resolve(root, '.omd/first-render'))) {
    return {
      ...base(routeSha256),
      stage: 'production',
      action: 'compose-first-render',
      next: 'omd guard production --json',
      instruction: composeGuidance(route),
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
  const firstRender = readFirstRenderReview(root);
  const firstRenderIsCurrent = firstRender !== null
    && firstRenderReviewMatchesCurrentRoute(root, route, firstRender);
  if (firstRender !== null && firstRenderIsCurrent) {
    const loop = firstRenderLoopState(root, route);
    if (loop.stalled) {
      return {
        ...base(routeSha256),
        stage: 'independent-review',
        action: loop.bestRestored ? 'report-stalled-first-render' : 'restore-best-first-render',
        problems: ['FIRST_RENDER_LOOP_STALLED', ...loop.reasons],
        next: loop.bestRestored ? null : 'omd first-render restore --json',
        instruction: loop.bestRestored
          ? 'The first-render loop stalled and the best source is restored. Stop repairing; report the remaining localized findings and the current desktop/mobile captures to the user.'
          : 'The first-render loop stalled. Restore the best checkpoint, then report the remaining localized findings and both current captures to the user instead of continuing repair.',
      };
    }
    if (firstRender.progress?.verdict === 'regressed'
      && !(loop.bestRestoreApplied && !loop.bestRestored)) {
      return {
        ...base(routeSha256),
        stage: 'independent-review',
        action: loop.bestRestoreApplied ? 'change-approach-from-restored-best' : 'restore-best-first-render',
        problems: ['FIRST_RENDER_REGRESSED'],
        next: loop.bestRestoreApplied ? null : 'omd first-render restore --json',
        instruction: loop.bestRestoreApplied
          ? `The best first-render source is restored. Try a materially different approach before recapturing; do not patch forward from the regressed attempt. ${REPAIR_KNOWLEDGE}`
          : 'Restore the best first-render checkpoint before trying a materially different approach.',
      };
    }
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
