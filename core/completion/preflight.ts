import { existsSync } from 'node:fs';
import { checkFirstRenderEvidence } from '../design/first-render-evidence.ts';
import { resolve } from 'node:path';
import type { ExecutionRequirement } from '../brief/execution-requirements.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { requireConfirmedPlanningForProduction } from '../stage/contract.ts';
import { checkFinalEvidenceV2, type FinalEvidenceV2ManifestVariant } from '../evidence/final-v2.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import {
  checkCompletionPublicationPrerequisites,
  CompletionPreflightError,
  type CompletionPublicationResult,
  type CompletionTypographyBinding,
} from './publication.ts';
import { completionLimitations } from './limitations.ts';
import type { ConfidenceDebt } from '../brief/confidence-debt.ts';
import { checkReferenceApplicationReview, referenceApplicationReviewContext } from '../ref/reference-application-review.ts';
import { checkSlopFinalGraph } from '../slop/review.ts';

export { checkCompletionPublicationPrerequisites, CompletionPreflightError } from './publication.ts';
export type { CompletionPublicationResult, CompletionTypographyBinding } from './publication.ts';

export type CompletionPreflightResult = Readonly<{
  final: FinalEvidenceV2ManifestVariant;
  limitations: readonly ConfidenceDebt[];
  completeness?: CompletionPublicationResult['completeness'];
  typography: CompletionTypographyBinding;
  executionRequirements?: Readonly<{
    schema: 'execution-requirement-check-v1';
    sourceContractSha256: string;
    checkedAt: 'terminal-preflight';
    requirements: readonly ExecutionRequirement[];
  }>;
}>;

/** Read-only terminal gate above final-v2; it never publishes, repairs, or mutates evidence. */
export function checkTerminalCompletion(root: string, invocation: ProjectRunInvocation): CompletionPreflightResult {
  if (existsSync(resolve(root, '.omd/route.json')) && readPersistedRoute(root, invocation).deliveryMode === 'design-only') {
    throw new CompletionPreflightError('design-only route has no implemented application; use omd completion design-check --input .omd/design-handoff.json');
  }
  const final = checkFinalEvidenceV2(root, invocation) as FinalEvidenceV2ManifestVariant;
  const prerequisites = checkCompletionPublicationPrerequisites(root, final, invocation);
  checkSlopFinalGraph(root, final.graph);
  // Planning the user never confirmed is not a design decision to be repaired later; refuse here,
  // before any completion artifact publishes an invented business goal as delivered.
  const unconfirmedPlanning = requireConfirmedPlanningForProduction(root);
  if (unconfirmedPlanning.length > 0) {
    throw new CompletionPreflightError(`planning is unconfirmed for ${unconfirmedPlanning.join(', ')}: ask the user rather than shipping an invented business goal`);
  }
  // This projection is returned only AFTER current final evidence and terminal prerequisites pass.
  // It cannot be supplied by a caller or used to make the earlier browser evaluation pass.
  const route = existsSync(resolve(root, '.omd/route.json')) ? readPersistedRoute(root, invocation) : undefined;
  const { limitations, application } = route ? completionLimitations(root, route) : { limitations: [], application: null };
  // Once a current application asserts rendered criteria, its review remains strict: a known
  // failed criterion cannot be relabelled research debt to claim the product was verified.
  if (application) checkReferenceApplicationReview(root, referenceApplicationReviewContext(root, application, final.graph));
  // A completed render must have survived the earlier gestalt read. The final Eye is intentionally
  // not the first reader: if the benefit/card composition never communicated the task, polishing its
  // pixels into a final review packet is late and expensive.
  try { checkFirstRenderEvidence(root); }
  catch (error) { throw new CompletionPreflightError(`first-render gestalt critic: ${error instanceof Error ? error.message : String(error)}`); }
  const requirements = route?.sourceContract.taskOutcome.executionRequirements;
  if (route !== undefined && requirements !== undefined) {
    for (const { enforcedBy } of requirements) {
      if (enforcedBy.some((gate) => gate !== 'completion-preflight' && !route.gates.includes(gate))) {
        throw new CompletionPreflightError('execution requirement is not bound to its required host gate');
      }
    }
    return Object.freeze({
      final,
      limitations,
      ...prerequisites,
      executionRequirements: Object.freeze({
        schema: 'execution-requirement-check-v1',
        sourceContractSha256: route.sourceContractSha256,
        checkedAt: 'terminal-preflight',
        requirements,
      }),
    });
  }
  return Object.freeze({ final, limitations, ...prerequisites });
}
