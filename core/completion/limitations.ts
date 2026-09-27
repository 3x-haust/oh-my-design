import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import { confidenceDebt, mergeConfidenceDebt, readConfidenceDebt, type ConfidenceDebt } from '../brief/confidence-debt.ts';
import { readPublishedReferenceResearch, validateReferenceResearch } from '../ref/reference-research.ts';
import { checkReferenceApplication, type ReferenceApplicationProjection } from '../ref/reference-application.ts';

/** Limitations never authorize a reference-grounding, candidate-comparison or cultural-fit claim.
 * They are not a substitute for product/browser, safety, current copy/type, review or slop gates.
 */
export function completionLimitations(root: string, route: AdaptiveRouteRecord): {
  limitations: readonly ConfidenceDebt[]; application: ReferenceApplicationProjection | null;
} {
  const limitations = [...readConfidenceDebt(root, route.sourceContractSha256)];
  let application: ReferenceApplicationProjection | null = null;
  if (route.gates.includes('dual-reference-research')
    || (route.projectMode === 'greenfield' && existsSync(resolve(root, '.omd/reference-research.json')))) {
    try {
      const options = { expectedSourceContractSha256: route.sourceContractSha256,
        benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'), expectedRequest: route.request };
      validateReferenceResearch(root, readPublishedReferenceResearch(root), options);
      application = checkReferenceApplication(root, options);
    } catch (error) {
      limitations.push(confidenceDebt('reference-board', `Reference grounding not verified: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  return { limitations: mergeConfidenceDebt(limitations), application };
}
