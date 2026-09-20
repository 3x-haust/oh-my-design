import { buildBrief, type Brief, type BriefStage } from './index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { checkProductionReadiness } from '../runtime/production-reference-gate.ts';

/** Explicit coordinator entry check. Ordinary brief inspection remains available when blocked. */
export function checkBriefEntry(root: string, stage: BriefStage, packRoot: string, invocation: ProjectRunInvocation): Brief {
  const brief = buildBrief(root, stage, packRoot, invocation);
  const blockers = [...brief.blockers];
  if (brief.entryGate.selected === false) blockers.push(`stage is not selected by the current route: ${stage}`);
  if (stage === 'production') blockers.push(...checkProductionReadiness(root, invocation, packRoot).blockers);
  return { ...brief, blockers: [...new Set(blockers)] };
}
