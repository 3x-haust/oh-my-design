import { buildBrief, type Brief, type BriefStage } from './index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { checkProductionReadiness } from '../runtime/production-reference-gate.ts';
import { adaptivePrerequisiteStages, requireStage, STAGES } from '../stage/contract.ts';
import { stageArtifactProblems } from '../stage/output.ts';
import type { AdaptiveStageId } from '../route/adaptive-stage-graph.ts';

/** Explicit coordinator entry check. Ordinary brief inspection remains available when blocked. */
export function checkBriefEntry(root: string, stage: BriefStage, packRoot: string, invocation: ProjectRunInvocation): Brief {
  const brief = buildBrief(root, stage, packRoot, invocation);
  const blockers = [...brief.blockers];
  if (brief.entryGate.selected === false) blockers.push(`stage is not selected by the current route: ${stage}`);
  const definition = STAGES.find(s => s.id === stage);
  if (brief.entryGate.selected === true) {
    if (definition) {
      const requirement = requireStage(root, packRoot, definition.id, invocation);
      blockers.push(...requirement.missingArtifacts.map(path => `upstream artifact missing: ${path}`));
    }
    for (const upstream of adaptivePrerequisiteStages(root, invocation, (stage === 'review' ? 'independent-review' : stage) as AdaptiveStageId) ?? []) {
      const producer = STAGES.find(s => s.id === upstream);
      if (producer) {
        blockers.push(...stageArtifactProblems(root, producer.id, invocation).map(problem => `upstream ${upstream}: ${problem}`));
      }
    }
  }
  if (stage === 'production') blockers.push(...checkProductionReadiness(root, invocation, packRoot).blockers);
  return { ...brief, blockers: [...new Set(blockers)] };
}
