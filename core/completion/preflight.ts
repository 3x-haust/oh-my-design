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
}>;

/** Read-only terminal gate above final-v2; it never publishes, repairs, or mutates evidence. */
export function checkTerminalCompletion(root: string, invocation: ProjectRunInvocation): CompletionPreflightResult {
  const final = checkFinalEvidenceV2(root, invocation) as FinalEvidenceV2ManifestVariant;
  const prerequisites = checkCompletionPublicationPrerequisites(root, final, invocation);
  return Object.freeze({ final, ...prerequisites });
}
