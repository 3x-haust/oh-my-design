import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/index.ts';
import { buildBrief } from '../brief/index.ts';
import { checkBriefEntry } from '../brief/entry.ts';
import { unprovidedPlanningStatements, validateDomainBrief, type DomainPlanningDisposition } from '../domain/domain-brief.ts';
import { resolveRunState } from './contract.ts';
import { stageArtifactProblems } from './output.ts';
import { referenceInterpretationWork, referenceResearchWork } from './reference-work.ts';
import { referenceDiscoveryWork, type ReferenceDiscoveryAction } from '../ref/discovery-work.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { isNativePiInvocation } from '../runtime/native-pi-run.ts';
import { nativeCompletionWork } from './native-completion.ts';
import { canDeferMissingCopy, confidenceDebt, DEBT_CAPABLE_STAGES, readConfidenceDebt, recordConfidenceDebt } from '../brief/confidence-debt.ts';
import { evidenceBudget } from './evidence-budget.ts';
import { candidateDirectionState, directionPresentation } from '../brief/candidate-choice.ts';
import { refinementEscalation } from './refinement-work.ts';

/** Fresh and interrupted runs use the same current-disk work pointer. No artifacts are fabricated. */
export function nextStageWork(root: string, packRoot: string, invocation: ProjectRunInvocation) {
  const route = readPersistedRoute(root, invocation);
  const escalation = route.sourceContract.processPolicy ? refinementEscalation(root, route.sourceContractSha256) : null;
  if (escalation) {
    const { defects, ...pending } = escalation;
    return {
    schema: 'stage-next-v2', meaning: 'next-work-not-completion', deliveryMode: route.deliveryMode ?? 'implementation',
    action: 'await-user', stage: 'production', owner: 'coordinator', reason: 'repeated-defect',
    pending, escalationEvidence: defects, resumeAuthority: null,
    confidenceDebt: readConfidenceDebt(root, route.sourceContractSha256), deferredStages: [] as string[],
    progress: { routeSha256: adaptiveRouteRecordSha256(route), workSha256: null, validatedStages: [] as string[] },
    problems: [], entryBlockers: [], planning: [], schemas: [], contracts: [], judgedBy: [], referenceWork: null,
    next: null, instruction: 'Stop automatic repairs and completion retries. Preserve the actual three fixes/results and wait for renewed human authority; budget cannot waive a required defect.',
    };
  }
  const direction = route.sourceContract.processPolicy ? candidateDirectionState(root) : null;
  if (direction?.pending) return {
    schema: 'stage-next-v2', meaning: 'next-work-not-completion', deliveryMode: route.deliveryMode ?? 'implementation',
    action: 'await-user', stage: 'candidate-generation', owner: 'coordinator',
    reason: direction.selectionStatus === 'stale' ? 'stale-direction' : 'direction-choice',
    pending: direction.pending, resumeAuthority: null, selectionStatus: direction.selectionStatus,
    presentation: directionPresentation(root, direction.pending),
    confidenceDebt: readConfidenceDebt(root, route.sourceContractSha256), deferredStages: [] as string[],
    progress: { routeSha256: adaptiveRouteRecordSha256(route), workSha256: null, validatedStages: [] as string[] },
    problems: [], entryBlockers: [], planning: [], schemas: [], contracts: [], judgedBy: [], referenceWork: null,
    next: 'omd candidate select --input <selection-input.json> --json',
    instruction: 'Present all actual previews and tradeoffs once, then wait for actual user input. No acquisition, repair or completion retry may cross this pause. Representative source repair and inspection remain available.',
  };
  const state = resolveRunState(root, packRoot, invocation);
  const planning: Array<{ field: string; text: string; disposition: DomainPlanningDisposition }> = [];
  if (state.stages.some(s => s.stage === 'domain' && s.present) && !stageArtifactProblems(root, 'domain', invocation).length) {
    const brief = validateDomainBrief(JSON.parse(readFileSync(join(root, '.omd/domain-brief.json'), 'utf8')));
    planning.push(...unprovidedPlanningStatements(brief.planning));
  }
  const outputs = state.stages.map(s => ({ ...s, problems: stageArtifactProblems(root, s.stage, invocation),
    entry: checkBriefEntry(root, s.stage, packRoot, invocation) }));
  const browseStop = route.sourceContract.reviewPurpose !== undefined && route.references.decision === 'discover'
    ? referenceDiscoveryWork(root, route) : null;
  let incomplete: typeof outputs[number] | undefined;
  const deferredStages: string[] = [];
  for (const output of outputs) {
    if (!output.problems.length && (route.sourceContract.processPolicy === undefined || !output.entry.blockers.length)) continue;
    const debtCapable = DEBT_CAPABLE_STAGES.has(output.stage)
      || (output.stage === 'copy' && !output.present && canDeferMissingCopy(route));
    if (!debtCapable || route.sourceContract.processPolicy === undefined) { incomplete = output; break; }
    if (browseStop?.status === 'stopped-with-debt' && !output.present
      && ['acquisition', 'scout', 'reference-board', 'reference-selection', 'moodboard'].includes(output.stage)) {
      recordConfidenceDebt(root, route.sourceContractSha256,
        [confidenceDebt(output.stage, `${browseStop.instruction} ${output.problems.join('; ')}`, 'evidence-gap')], invocation);
      deferredStages.push(output.stage); continue;
    }
    const budget = evidenceBudget(root, route.sourceContractSha256, output.stage, invocation);
    if (!budget.exhausted) { incomplete = output; break; }
    recordConfidenceDebt(root, route.sourceContractSha256,
      [confidenceDebt(output.stage, `${budget.reason} ${[...output.problems, ...output.entry.blockers].join('; ')}`, 'budget-exhausted')], invocation);
    deferredStages.push(output.stage);
  }
  const stage = incomplete?.stage ?? null;
  const brief = stage === null ? null : buildBrief(root, stage, packRoot, invocation);
  const entry = stage === null ? null : checkBriefEntry(root, stage, packRoot, invocation);
  let interpretation = route.sourceContract.processPolicy !== undefined && !deferredStages.includes('reference-board') && route.strategy.stages.includes('reference-board')
    && (stage === null || ['art-direction', 'composition', 'candidate-generation'].includes(stage))
    ? referenceInterpretationWork(root, route.sourceContract.reviewPurpose === undefined ? undefined
      : { sourceContractSha256: route.sourceContractSha256, request: route.request }) : null;
  if (interpretation && browseStop?.status === 'stopped-with-debt') {
    recordConfidenceDebt(root, route.sourceContractSha256, [confidenceDebt('reference-interpretation', browseStop.instruction)], invocation);
    interpretation = null; deferredStages.push('reference-interpretation');
  }
  if (interpretation) {
    const budget = evidenceBudget(root, route.sourceContractSha256, 'reference-interpretation', invocation);
    if (budget.exhausted) {
      recordConfidenceDebt(root, route.sourceContractSha256,
        [confidenceDebt('reference-interpretation', budget.reason, 'budget-exhausted')], invocation);
      interpretation = null;
      deferredStages.push('reference-interpretation');
    }
  }
  const research = stage === 'reference-board' && (route.sourceContract.processPolicy === undefined || entry?.blockers.length === 0) && route.references.decision === 'discover'
    ? referenceResearchWork(root, { expectedSourceContractSha256: route.sourceContractSha256,
      benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'), expectedRequest: route.request,
      wholeScreen: route.sourceContract.reviewPurpose !== undefined }) : null;
  const missingReferenceBoard = stage === 'reference-board' && incomplete?.present === false
    && (route.sourceContract.processPolicy === undefined || entry?.blockers.length === 0) && route.references.decision === 'discover';
  let discoveryWork: ReturnType<typeof referenceDiscoveryWork> | null = null;
  let referenceLimitation: string | null = null;
  if (missingReferenceBoard) {
    try { discoveryWork = referenceDiscoveryWork(root, route); }
    catch (error) { referenceLimitation = error instanceof Error ? error.message : String(error); }
  }
  const referenceExhausted = discoveryWork?.status === 'exhausted' || referenceLimitation !== null;
  const native = stage === null && interpretation === null && route.deliveryMode !== 'design-only'
    && isNativePiInvocation(invocation) ? nativeCompletionWork(root, invocation) : null;
  const nativeBrief = native?.stage ? checkBriefEntry(root, native.stage, packRoot, invocation) : null;
  return {
    schema: 'stage-next-v2', meaning: 'next-work-not-completion', deliveryMode: route.deliveryMode ?? 'implementation',
    hardBlockers: [], warnings: [...(entry?.blockers ?? []), ...(referenceLimitation === null ? [] : [`Reference discovery limitation: ${referenceLimitation}`]), ...(discoveryWork?.status === 'exhausted' ? ['Reference acquisition budget exhausted; continue implementation with the recorded limitation'] : []), ...planning.map(p => `non-factual planning: ${p.field} (${p.disposition})`)]
      .map(message => ({ code: 'STAGE_PROCESS_ADVISORY', classification: 'advisory' as const, subjectId: stage ?? 'run', sourceDigests: [], message })),
    advisoryResponsesNeeded: [...(entry?.blockers ?? []).map(message => ({ code: 'STAGE_PROCESS_ADVISORY', subjectId: stage ?? 'run', message, status: 'needs-agent-reason' as const }))],
    evidenceAvailable: outputs.filter(s => s.present && s.problems.length === 0).map(s => s.stage),
    completion: { browserEvidence: native?.stage === 'independent-review' ? 'current' as const : 'missing' as const,
      independentReview: native?.stage === null ? 'pass' as const : 'missing' as const },
    selectionStatus: direction?.selectionStatus ?? 'skipped',
    confidenceDebt: readConfidenceDebt(root, route.sourceContractSha256), deferredStages,
    stage, owner: brief?.owner ?? null,
    progress: { routeSha256: adaptiveRouteRecordSha256(route), workSha256: discoveryWork?.workSha256 ?? null,
      materialProgressIdentities: discoveryWork?.materialProgressIdentities ?? [], validatedStages: outputs
      .filter(s => ['domain', 'frame', 'reference-board', 'copy', 'composition'].includes(s.stage)
        && s.problems.length === 0 && s.entry.blockers.length === 0)
      .map(s => s.stage) },
    action: stage === null ? route.deliveryMode === 'design-only' ? 'review-design-handoff' : 'implement-or-evaluate'
      : discoveryWork?.action?.kind === 'replan-discovery' ? 'replan-reference-discovery'
        : discoveryWork?.status === 'action' && discoveryWork.action !== null
          ? ({
            'browser-consent': 'browser-consent',
            'collect-leads': 'collect-leads',
            'direct-entry': 'acquire-reference',
            'follow-link': 'acquire-reference',
            'publish-board': 'author-output',
            'replan-discovery': 'replan-reference-discovery',
            'retain-reference': 'retain-reference',
            'review-candidates': 'review-candidates',
            'start-browse': 'acquire-reference',
            'continue-browse': 'acquire-reference',
            'narrow-tray': 'acquire-reference',
            'end-browse': 'acquire-reference',
            search: 'acquire-reference',
          } satisfies Readonly<Record<ReferenceDiscoveryAction['kind'], string>>)[discoveryWork.action.kind]
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
    instruction: discoveryWork !== null && !referenceExhausted
        ? discoveryWork.instruction
        : `Read and deliver this stage's contracts, satisfy entry, execute the owned work, then its applicable output checks. Recompute stage next after changes.${planning.length === 0 ? '' : ' Keep classified planning hypotheses non-factual: omit omit-from-production-claims statements from claims, label non-factual-working-decision statements as run-owned decisions, and never use either to remove explicit requirements.'} Remaining output quality, reference currentness, candidates, rendered evidence and independent review still require their own gates; this pointer never certifies completion.`,
    referenceWork: discoveryWork,
    ...(research ?? interpretation ?? {}),
    ...(native === null ? {} : { ...native, entryBlockers: nativeBrief?.blockers ?? [],
      schemas: nativeBrief?.schemas ?? [], contracts: nativeBrief?.contracts ?? [], judgedBy: nativeBrief?.judgedBy ?? [],
      ...('procedure' in native ? { procedure: native.procedure }
        : nativeBrief?.procedure === undefined ? {} : { procedure: nativeBrief.procedure }) }),
  };
}
