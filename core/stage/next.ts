import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProductionReadiness } from '../brief/production-readiness.ts';
import { checkTerminalCompletion } from '../completion/preflight.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/index.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { readFirstRenderReview } from '../design/first-render-review.ts';
import { STUDIO_IDEA_GUIDANCE } from '../design/studio-concept.ts';
import { STUDIO_CONCEPT_GUIDANCE, STUDIO_STUDY_GUIDANCE, STUDIO_SYSTEM_GUIDANCE, studioPending, type StudioStage } from '../design/studio.ts';
import { STUDIO_ASSETS_GUIDANCE, STUDIO_BOARD_GUIDANCE, STUDIO_DIRECTION_GUIDANCE } from '../design/studio-stages.ts';
import { STUDIO_LEDGER_GUIDANCE } from '../design/studio-redesign.ts';
import { composeGuidance, REPAIR_KNOWLEDGE } from '../design/compose-guidance.ts';
import { newSurface } from '../design/new-surface-advisories.ts';
import { currentStudioDelivery, STUDIO_DELIVER_MESSAGE, STUDIO_REVIEW_ROUNDS, studioReviewRounds } from '../design/studio-delivery.ts';
import {
  firstRenderLoopState,
  stallMessage,
  firstRenderReviewMatchesCurrentRoute,
} from '../design/first-render-checkpoint.ts';

/** Each stage a track owes before its screens: the action, the command that does it and what to do. */
const STUDIO_STAGE_WORK: Readonly<Record<StudioStage, Readonly<{ action: string; next: string; instruction: string }>>> = {
  idea: { action: 'decide-visual-idea', next: 'omd guard production --json', instruction: STUDIO_IDEA_GUIDANCE },
  study: { action: 'study-studio-references', next: 'omd studio refs <url> <url> --json', instruction: STUDIO_STUDY_GUIDANCE },
  board: { action: 'compose-reference-board', next: 'omd studio board --json', instruction: STUDIO_BOARD_GUIDANCE },
  direction: { action: 'choose-concept-direction', next: 'omd imagegen --kind board --name concept-a --prompt "<the product, key screens, palette, type, asset style>" --reference .omd/studio/board.png --json', instruction: STUDIO_DIRECTION_GUIDANCE },
  system: { action: 'write-studio-system', next: 'omd guard production --json', instruction: STUDIO_SYSTEM_GUIDANCE },
  concept: { action: 'draw-page-ideas', next: 'omd imagegen --kind page --name hero-1 --prompt "<composition>"', instruction: STUDIO_CONCEPT_GUIDANCE },
  assets: { action: 'make-asset-sets', next: 'omd imagegen --kind asset --name <set> --prompt "<items, one shared style, plain background>" --reference <chosen concept board> --json', instruction: STUDIO_ASSETS_GUIDANCE },
  baseline: { action: 'capture-redesign-baseline', next: 'omd studio baseline <url> <url> --json', instruction: 'A redesign starts from the screens as they are: run omd studio baseline on every existing screen the work touches (omd pack guides/redesign.md).' },
  ledger: { action: 'write-redesign-ledger', next: 'omd guard production --json', instruction: STUDIO_LEDGER_GUIDANCE },
};

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
  // A new product, a landing or a redesign passes its references, direction and owned assets before its screens.
  const studio = studioPending(root, route);
  if (studio !== null) return { ...base(routeSha256), stage: 'concepts', ...STUDIO_STAGE_WORK[studio] };
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
  // A new page is delivered from its build and a few review rounds: no browser plan, no final evidence chain.
  if (newSurface(route)) {
    if (currentStudioDelivery(root, route) !== null) {
      return {
        ...base(routeSha256),
        stage: null,
        action: 'report-completion',
        next: 'omd guard completion --json',
        instruction: 'The page is delivered. Run the completion guard, then report it with its open findings and both captures.',
      };
    }
    const rounds = studioReviewRounds(root, route);
    return {
      ...base(routeSha256),
      stage: 'independent-review',
      action: 'finish-model-led',
      next: 'omd lifecycle finish --json',
      instruction: rounds >= STUDIO_REVIEW_ROUNDS ? STUDIO_DELIVER_MESSAGE
        : 'omd lifecycle finish builds the page, checks its logo, 3D and system by measurement, and compares the render once with the '
          + 'primary reference; fix what the measurement names before that. Compare and cut yourself while building (omd studio check), '
          + `not after. ${REPAIR_KNOWLEDGE}`,
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
      const report = loop.exhausted && loop.bestRestored;
      return {
        ...base(routeSha256),
        stage: 'independent-review',
        action: report ? 'report-stalled-first-render' : loop.bestRestored ? 'recompose-from-restored-best' : 'restore-best-first-render',
        problems: ['FIRST_RENDER_LOOP_STALLED', ...loop.reasons],
        next: loop.bestRestored ? null : 'omd first-render restore --json',
        instruction: stallMessage(loop),
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
