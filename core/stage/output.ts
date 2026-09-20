import { join } from 'node:path';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { validateDomainBrief } from '../domain/domain-brief.ts';
import { validateFrameUxBytes } from '../frame/check-ux.ts';
import { validateCopyDeck, validateCurrentCopyReview } from '../copy/index.ts';
import { readFrame } from '../frame/index.ts';
import { readPersistedRoute } from '../route/index.ts';
import { readReferenceBoardArtifacts } from '../ref/board-artifacts.ts';
import { checkReferenceApplication } from '../ref/reference-application.ts';
import { validateCurrentCompositionContract } from '../composition-contract/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { stageDefinition, type StageId } from './contract.ts';

/** Early structural checks, not render/review acceptance. Never equate a file with completed work. */
export function stageArtifactProblems(root: string, stage: StageId, invocation?: ProjectRunInvocation): string[] {
  try {
    const path = stageDefinition(stage).artifact;
    const bytes = readContainedRegularFile(root, join(root, path), path);
    if (!bytes.toString('utf8').trim()) return [`${path} is empty`];
    if (stage === 'domain') {
      const domain = validateDomainBrief(JSON.parse(bytes.toString('utf8')));
      if (invocation && domain.request !== readPersistedRoute(root, invocation).request) {
        return ['Domain brief request differs from the current route request. Read omd route show --json and preserve its request verbatim in domain-brief.json; do not rewrite the route to match a shortened brief.'];
      }
    }
    if (stage === 'frame') {
      const problems = validateFrameUxBytes(bytes).map(f => f.message);
      if (invocation) {
        const route = readPersistedRoute(root, invocation), frame = readFrame(root);
        if (route.projectMode === 'greenfield' && !frame?.reality) problems.push('greenfield frame needs reality; use omd schema frame');
        if (route.sourceContract.referenceDiscovery.taskNeed === 'new-product' && frame?.uxSurface !== 'product' && frame?.uxSurface !== 'mixed') problems.push('new-product requires product/mixed UX framing, not an editorial relabel');
      }
      return problems;
    }
    if (stage === 'copy') {
      const problems = validateCopyDeck(bytes.toString('utf8')).map(f => f.message);
      if (invocation && readPersistedRoute(root, invocation).behavior.active.copyRepairWorkflow.status === 'selected') {
        try {
          const review = readContainedRegularFile(root, join(root, '.omd/.cache/copy-eye.md'), 'current copy review');
          problems.push(...validateCurrentCopyReview(review.toString('utf8'), bytes).map(f => f.message));
        } catch (error) { problems.push(error instanceof Error ? error.message : String(error)); }
      }
      return problems;
    }
    if (stage === 'reference-board') {
      readReferenceBoardArtifacts(root);
      if (invocation) {
        const route = readPersistedRoute(root, invocation);
        if (route.references.decision === 'discover') {
          try {
            checkReferenceApplication(root, { expectedSourceContractSha256: route.sourceContractSha256,
              benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'), expectedRequest: route.sourceContract.request });
          } catch (error) {
            return [`Reference board is a draft until both research lanes and their surface application pass: ${error instanceof Error ? error.message : String(error)}; run omd ref research-check --json and omd ref apply-check --json`];
          }
        }
      }
    }
    if (stage === 'composition' && invocation) return validateCurrentCompositionContract(root, invocation).map(f => f.message);
    return [];
  } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
}
