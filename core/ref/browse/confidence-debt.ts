import { confidenceDebt, type ConfidenceDebt, type ConfidenceDebtRecord } from '../../brief/confidence-debt.ts';
import { readBrowseConfidenceDebt } from './evidence.ts';
import type { ReferenceConfidenceDebt } from './contract.ts';

/** Phase 1's id is derived by its own constructor; browse detail stays in the signed session.
 * No source/auth URLs or raw private pixels enter source-free downstream briefs. */
export function browseDebtToConfidenceDebt(debt: ReferenceConfidenceDebt): ConfidenceDebt {
  return confidenceDebt('scout', `${debt.lane}: ${debt.code}. ${debt.limitation} ${debt.consequence}`,
    debt.code === 'budget-exhausted' ? 'budget-exhausted' : 'evidence-gap');
}
export function readBrowseConfidenceDebtRecord(root: string, sourceContractSha256: string): ConfidenceDebtRecord {
  return { schema: 'confidence-debt-v1', sourceContractSha256,
    items: readBrowseConfidenceDebt(root, sourceContractSha256).map(browseDebtToConfidenceDebt) };
}
