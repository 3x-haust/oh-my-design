import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/index.ts';
import { buildBrief } from '../brief/index.ts';
import { checkBriefEntry } from '../brief/entry.ts';
import { unconfirmedPlanningStatements, validateDomainBrief } from '../domain/domain-brief.ts';
import { resolveRunState } from './contract.ts';
import { stageArtifactProblems } from './output.ts';
import { referenceResearchWork } from './reference-work.ts';
import { referenceDiscoveryWork } from '../ref/discovery-work.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { isNativePiInvocation } from '../runtime/native-pi-run.ts';
import { nativeCompletionWork } from './native-completion.ts';

/** Fresh and interrupted runs use the same current-disk work pointer. No artifacts are fabricated. */
export function nextStageWork(root: string, packRoot: string, invocation: ProjectRunInvocation) {
  const route = readPersistedRoute(root, invocation);
  const state = resolveRunState(root, packRoot, invocation);
  const planning: Array<{ field: string; text: string }> = [];
  if (state.stages.some(s => s.stage === 'domain' && s.present) && !stageArtifactProblems(root, 'domain', invocation).length) {
    const brief = validateDomainBrief(JSON.parse(readFileSync(join(root, '.omd/domain-brief.json'), 'utf8')));
    for (const field of unconfirmedPlanningStatements(brief.planning)) {
      const match = field.match(/\d+/);
      const statement = field.startsWith('nonGoals[')
        ? match === null ? undefined : brief.planning.nonGoals[Number(match[0])]
        : brief.planning[field as 'businessGoal' | 'successSignal'];
      if (statement === undefined) throw new Error(`Invalid planning field: ${field}`);
      planning.push({ field, text: statement.text });
    }
  }
  const outputs = state.stages.map(s => ({ ...s, problems: stageArtifactProblems(root, s.stage, invocation),
    entry: checkBriefEntry(root, s.stage, packRoot, invocation) }));
  const incomplete = outputs.find(s => s.stage === 'reference-board' && !s.present && route.references.decision === 'discover');
  let discoveryWork: ReturnType<typeof referenceDiscoveryWork> | null = null;
  let referenceLimitation: string | null = null;
  if (incomplete) {
    try { discoveryWork = referenceDiscoveryWork(root, route); }
    catch (error) { referenceLimitation = error instanceof Error ? error.message : String(error); }
  }
  const referenceExhausted = discoveryWork?.status === 'exhausted' || referenceLimitation !== null;
  // Resolve planning provenance early, not only at the eventual source boundary. The agent must
  // check the original brief first; absent evidence requires a question, never automatic confirmation.
  // Design-only handoffs may deliberately retain open planning questions. Do not turn a
  // production-only confirmation rule into a universal design-stage gate.
  const planningBlocksProduction = planning.length > 0 && route.deliveryMode !== 'design-only' && route.strategy.stages.includes('production');
  const stage = referenceExhausted ? null : incomplete?.stage ?? null;
  const brief = stage === null ? null : buildBrief(root, stage, packRoot, invocation);
  const entry = stage === null ? null : checkBriefEntry(root, stage, packRoot, invocation);
  const interpretation = null;
  const research = stage === 'reference-board' && route.references.decision === 'discover'
    ? referenceResearchWork(root, { expectedSourceContractSha256: route.sourceContractSha256,
      benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'), expectedRequest: route.request }) : null;
  const native = stage === null && interpretation === null && route.deliveryMode !== 'design-only'
    && isNativePiInvocation(invocation) ? nativeCompletionWork(root, invocation) : null;
  const nativeBrief = native?.stage ? checkBriefEntry(root, native.stage, packRoot, invocation) : null;
  return {
    schema: 'stage-next-v2', meaning: 'next-work-not-completion', deliveryMode: route.deliveryMode ?? 'implementation',
    hardBlockers: [], warnings: [...(entry?.blockers ?? []), ...(referenceLimitation === null ? [] : [`Reference discovery limitation: ${referenceLimitation}`]), ...(discoveryWork?.status === 'exhausted' ? ['Reference acquisition budget exhausted; continue implementation with the recorded limitation'] : []), ...planning.map(p => `unconfirmed planning: ${p.field}`)]
      .map(message => ({ code: 'STAGE_PROCESS_ADVISORY', classification: 'advisory' as const, subjectId: stage ?? 'run', sourceDigests: [], message })),
    advisoryResponsesNeeded: [...(entry?.blockers ?? []).map(message => ({ code: 'STAGE_PROCESS_ADVISORY', subjectId: stage ?? 'run', message, status: 'needs-agent-reason' as const }))],
    evidenceAvailable: outputs.filter(s => s.present && s.problems.length === 0).map(s => s.stage),
    completion: { browserEvidence: native?.stage === 'independent-review' ? 'current' as const : 'missing' as const,
      independentReview: native?.stage === null ? 'pass' as const : 'missing' as const },
    stage, owner: brief?.owner ?? null,
    progress: { routeSha256: adaptiveRouteRecordSha256(route), workSha256: discoveryWork?.workSha256 ?? null,
      materialProgressIdentities: discoveryWork?.materialProgressIdentities ?? [], validatedStages: outputs
      .filter(s => ['domain', 'frame', 'reference-board', 'copy', 'composition'].includes(s.stage)
        && s.problems.length === 0 && !(s.stage === 'domain' && planningBlocksProduction)
        && s.entry.blockers.length === 0)
      .map(s => s.stage) },
    action: stage === null ? route.deliveryMode === 'design-only' ? 'review-design-handoff' : 'implement-or-evaluate'
      : discoveryWork?.action?.kind === 'replan-discovery' ? 'replan-reference-discovery'
        : discoveryWork?.status === 'action' ? 'acquire-reference'
        : discoveryWork?.status === 'exhausted' ? 'resolve-external-blocker'
          : incomplete?.present ? 'repair-output' : 'author-output',
    problems: stage === null ? [] : stageArtifactProblems(root, stage, invocation),
    entryBlockers: entry?.blockers ?? [], planning,
    next: discoveryWork !== null && !referenceExhausted
      ? discoveryWork.next
      : stage === null
      ? route.deliveryMode === 'design-only' ? 'omd completion design-check --input .omd/design-handoff.json --json' : 'omd guard production --json'
      : `omd brief ${stage} --check --json`,
    schemas: brief?.schemas ?? [], contracts: brief?.contracts ?? [], judgedBy: brief?.judgedBy ?? [],
    instruction: planningBlocksProduction
      ? 'Check each statement against the original user request/artifacts. Attach exact userEvidence only where genuinely supported. If not supplied, ask the user one concrete question quoting these statements. Do not infer confirmation, silently narrow scope, or replace the question with completion diagnostics.'
      : discoveryWork !== null && !referenceExhausted
        ? discoveryWork.instruction
        : 'Read and deliver this stage\'s contracts, satisfy entry, execute the owned work, then its applicable output checks. Recompute stage next after changes. Remaining output quality, reference currentness, candidates, rendered evidence and independent review still require their own gates; this pointer never certifies completion.',
    referenceWork: discoveryWork,
    ...(research ?? interpretation ?? {}),
    ...(native === null ? {} : { ...native, entryBlockers: nativeBrief?.blockers ?? [],
      schemas: nativeBrief?.schemas ?? [], contracts: nativeBrief?.contracts ?? [], judgedBy: nativeBrief?.judgedBy ?? [],
      ...(nativeBrief?.procedure === undefined ? {} : { procedure: nativeBrief.procedure }) }),
  };
}
