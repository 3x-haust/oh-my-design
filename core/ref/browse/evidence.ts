import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readContainedRegularFile } from '../reference-selection.ts';
import { canonicalJson } from './json.ts';
import { parseCanonical } from './trace.ts';
import { verifyBrowseSession, type VerifiedBrowseSession } from './verification.ts';
import { browseFail, type BrowseSummary, type ReferenceConfidenceDebt, type Receipt } from './contract.ts';

export function readCurrentBrowseEvidence(root: string, sourceContractSha256: string): readonly Readonly<{ session: Receipt; verified: VerifiedBrowseSession; summary: BrowseSummary }>[] {
  const directory = resolve(root, '.omd/discovery/browse'); if (!existsSync(directory)) return [];
  const entries = readdirSync(directory).filter(name => /^[a-f0-9]{32}$/.test(name)).sort();
  return entries.flatMap(id => {
    const path = `.omd/discovery/browse/${id}/summary.json`; if (!existsSync(resolve(root, path))) return [];
    const summary = parseCanonical<BrowseSummary>(readContainedRegularFile(root, path, 'browse summary'));
    if (summary.schema !== 'reference-browse-summary-v1' || summary.sessionId !== id) browseFail('BROWSE_SUMMARY', 'invalid browse summary', 2);
    if (summary.sourceContractSha256 !== sourceContractSha256) return [];
    const verified = verifyBrowseSession(root, summary.session, { sourceContractSha256 });
    if (summary.lane !== verified.seal.lane || canonicalJson(summary.confidenceDebt) !== canonicalJson(verified.seal.confidenceDebt)
      || summary.stopReason !== verified.seal.stopReason || summary.productionEntryBlocking !== false) browseFail('BROWSE_SUMMARY_BINDING', 'summary differs from signed acquisition', 2);
    return [{ session: summary.session, verified, summary }];
  }).sort((left, right) => Date.parse(left.verified.seal.endedAt) - Date.parse(right.verified.seal.endedAt));
}
/** Phase 1 ABI: honest bounded gaps, independently publishable without a research record/board.
 * Integrity errors throw; they never become fictitious successful or sufficient research. */
export function readBrowseConfidenceDebt(root: string, currentContract: string): readonly ReferenceConfidenceDebt[] {
  const debt = new Map<string, ReferenceConfidenceDebt>();
  for (const { verified } of readCurrentBrowseEvidence(root, currentContract)) for (const item of verified.seal.confidenceDebt) debt.set(item.id, item);
  return [...debt.values()];
}
