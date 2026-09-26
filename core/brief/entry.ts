import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readPersistedRoute } from '../route/index.ts';
import { buildBrief, type Brief, type BriefStage } from './index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { checkProductionReadiness } from './production-readiness.ts';
import { canDeferMissingCopy, confidenceDebt, DEBT_CAPABLE_STAGES, mergeConfidenceDebt } from './confidence-debt.ts';
import { compositionEntry } from './minimal-composition.ts';
import { adaptivePrerequisiteStages, requireStage, STAGES } from '../stage/contract.ts';
import { stageArtifactProblems } from '../stage/output.ts';
import type { AdaptiveStageId } from '../route/adaptive-stage-graph.ts';
import { isNativePiInvocation } from '../runtime/native-pi-run.ts';
import { checkNativeBrowserEvidence } from '../stage/native-completion.ts';

/** Explicit coordinator entry check. Ordinary brief inspection remains available when blocked. */
export function checkBriefEntry(root: string, stage: BriefStage, packRoot: string, invocation: ProjectRunInvocation): Brief {
  const brief = buildBrief(root, stage, packRoot, invocation);
  if (stage === 'production' || (stage === 'browser-evidence' && isNativePiInvocation(invocation))) {
    const readiness = checkProductionReadiness(root, invocation, packRoot);
    return { ...brief, blockers: readiness.blockers, confidenceDebt: readiness.confidenceDebt };
  }
  const blockers = [...brief.blockers];
  const debt = [...brief.confidenceDebt];
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
        const problems = producer.id === 'composition' ? compositionEntry(root, invocation).blockers
          : stageArtifactProblems(root, producer.id, invocation);
        if (DEBT_CAPABLE_STAGES.has(upstream) || (upstream === 'copy' && !existsSync(join(root, producer.artifact))
          && canDeferMissingCopy(readPersistedRoute(root, invocation)))) debt.push(...problems.map(problem => confidenceDebt(upstream, problem)));
        else blockers.push(...problems.map(problem => `upstream ${upstream}: ${problem}`));
      }
    }
  }
  if ((stage === 'independent-review' || stage === 'review') && isNativePiInvocation(invocation)
    && brief.route?.deliveryMode !== 'design-only') {
    try { checkNativeBrowserEvidence(root, invocation); }
    catch (error) { blockers.push(error instanceof Error ? error.message : String(error)); }
  }
  return { ...brief, blockers: [...new Set(blockers)], confidenceDebt: mergeConfidenceDebt(debt) };
}
