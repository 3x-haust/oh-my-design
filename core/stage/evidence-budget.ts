import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { readCurrentReferenceDiscoveryEvidence } from '../ref/discovery-evidence.ts';

export const EVIDENCE_BUDGET_PATH = '.omd/discovery/stage-budget.json';
export const MAX_EVIDENCE_REPLANS = 3;
export const MAX_REFERENCE_ATTEMPTS = 12;
const referenceStages = new Set(['acquisition', 'scout', 'reference-board', 'reference-selection', 'moodboard', 'reference-interpretation']);
type Budget = { schema: 'stage-evidence-budget-v1'; sourceContractSha256: string;
  stages: Record<string, { replans: number; nativeAttempts: number }> };

/** A bounded number of coordinator reconsiderations, or actual native attempts, ends evidence work.
 * Repeated inspection is not evidence progress and can never reset this route-bound budget.
 */
export function evidenceBudget(root: string, sourceContractSha256: string, stage: string,
  invocation: ProjectRunInvocation): { exhausted: boolean; reason: string } {
  let budget: Budget = { schema: 'stage-evidence-budget-v1', sourceContractSha256, stages: {} };
  if (existsSync(resolve(root, EVIDENCE_BUDGET_PATH))) {
    const saved = JSON.parse(readStableProjectFile({ root, path: resolve(root, EVIDENCE_BUDGET_PATH),
      label: 'stage evidence budget', fs: nodeStableProjectFileSystem() }).toString('utf8')) as Budget;
    if (saved.schema !== budget.schema || !/^[a-f0-9]{64}$/.test(saved.sourceContractSha256)
      || !saved.stages || typeof saved.stages !== 'object' || Array.isArray(saved.stages)
      || Object.values(saved.stages).some(value => !value || !Number.isSafeInteger(value.replans) || value.replans < 0
        || !Number.isSafeInteger(value.nativeAttempts) || value.nativeAttempts < 0)) throw new Error('invalid stage evidence budget');
    if (saved.sourceContractSha256 === sourceContractSha256) budget = saved;
  }
  const reference = referenceStages.has(stage), key = reference ? 'reference-acquisition' : stage;
  const previous = budget.stages[key] ?? { replans: 0, nativeAttempts: 0 };
  const evidence = reference ? readCurrentReferenceDiscoveryEvidence(root) : null;
  const nativeAttempts = evidence === null ? 0 : [evidence.domain, evidence.design]
    .reduce((sum, lane) => sum + lane.searches.length + lane.entries.length + lane.visits.length + lane.unavailable.length, 0);
  const current = { replans: Math.min(MAX_EVIDENCE_REPLANS, previous.replans + 1), nativeAttempts: Math.max(previous.nativeAttempts, nativeAttempts) };
  if (JSON.stringify(previous) !== JSON.stringify(current)) {
    budget.stages[key] = current;
    createProjectWriteAdapter(root, invocation).write(EVIDENCE_BUDGET_PATH, `${JSON.stringify(budget, null, 2)}\n`);
  }
  const exhausted = current.replans >= MAX_EVIDENCE_REPLANS || current.nativeAttempts >= MAX_REFERENCE_ATTEMPTS;
  return { exhausted, reason: `Evidence budget: ${current.replans}/${MAX_EVIDENCE_REPLANS} coordinator replans, ${current.nativeAttempts}/${MAX_REFERENCE_ATTEMPTS} native reference attempts; selected work yields, not verified.` };
}
