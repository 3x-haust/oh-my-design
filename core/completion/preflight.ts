import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExecutionRequirement } from '../brief/execution-requirements.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { checkFinalEvidenceV2, type FinalEvidenceV2ManifestVariant } from '../evidence/final-v2.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import {
  checkCompletionPublicationPrerequisites,
  CompletionPreflightError,
  type CompletionPublicationResult,
  type CompletionTypographyBinding,
} from './publication.ts';

export { checkCompletionPublicationPrerequisites, CompletionPreflightError } from './publication.ts';
export type { CompletionPublicationResult, CompletionTypographyBinding } from './publication.ts';

export type CompletionPreflightResult = Readonly<{
  final: FinalEvidenceV2ManifestVariant;
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
  const final = checkFinalEvidenceV2(root, invocation) as FinalEvidenceV2ManifestVariant;
  const prerequisites = checkCompletionPublicationPrerequisites(root, final, invocation);
  // This projection is returned only AFTER current final evidence and terminal prerequisites pass.
  // It cannot be supplied by a caller or used to make the earlier browser evaluation pass.
  const route = existsSync(resolve(root, '.omd/route.json')) ? readPersistedRoute(root, invocation) : undefined;
  const requirements = route?.sourceContract.taskOutcome.executionRequirements;
  if (route !== undefined && requirements !== undefined) {
    for (const { enforcedBy } of requirements) {
      if (enforcedBy.some((gate) => gate !== 'completion-preflight' && !route.gates.includes(gate))) {
        throw new CompletionPreflightError('execution requirement is not bound to its required host gate');
      }
    }
    return Object.freeze({
      final,
      ...prerequisites,
      executionRequirements: Object.freeze({
        schema: 'execution-requirement-check-v1',
        sourceContractSha256: route.sourceContractSha256,
        checkedAt: 'terminal-preflight',
        requirements,
      }),
    });
  }
  return Object.freeze({ final, ...prerequisites });
}
