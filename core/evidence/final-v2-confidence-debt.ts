import { confidenceDebt, readConfidenceDebt, DEBT_CAPABLE_STAGES, canDeferMissingCopy, type ConfidenceDebt } from '../brief/confidence-debt.ts';
import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import { readArtifact } from '../measure/inputs.ts';
import { sha256 } from '../measure/identity.ts';
import * as v from '../measure/validation.ts';
export type FinalConfidenceDebt = { schema: 'terminal-confidence-debt-v1'; receipt: { path: string; schema: 'confidence-debt-v1'; sha256: string }; limitations: readonly ConfidenceDebt[] };
export function parseFinalConfidenceDebt(value: unknown): FinalConfidenceDebt {
  v.object({ schema: v.enumeration('terminal-confidence-debt-v1'), receipt: v.object({ path: v.enumeration('.omd/confidence-debt.json'), schema: v.enumeration('confidence-debt-v1'), sha256: v.sha }), limitations: v.array(v.object({ id: v.sha, stage: v.text, reason: v.text, kind: v.enumeration('evidence-gap', 'budget-exhausted'), claim: v.enumeration('not-verified') })) })(value);
  const debt = value as FinalConfidenceDebt;
  v.unique(debt.limitations.map(d => d.id), 'confidence debt');
  if (!debt.limitations.length || debt.limitations.some(d => confidenceDebt(d.stage, d.reason, d.kind).id !== d.id)) v.fail('confidence debt ids/limitations invalid');
  return debt;
}
/** Debt is a disclosed limitation, never an approved artifact, claim receipt, or route skip. */
export function validateFinalConfidenceDebt(root: string, route: AdaptiveRouteRecord, value: FinalConfidenceDebt | undefined, deferred: readonly { routeSkipId: string; debtIds: readonly string[]; reason: string }[], evidenceReceipts: readonly { path: string; sha256: string }[]): readonly ConfidenceDebt[] {
  if (!value) { if (deferred.length) v.fail('selected-with-debt needs its current ledger receipt and limitations'); return []; }
  const debt = parseFinalConfidenceDebt(value), bytes = readArtifact(root, debt.receipt.path);
  if (sha256(bytes) !== debt.receipt.sha256) v.fail('confidence debt ledger changed');
  const current = readConfidenceDebt(root, route.sourceContractSha256);
  if (canonicalRouteJson(current) !== canonicalRouteJson(debt.limitations)) v.fail('terminal limitations do not disclose the exact current debt ledger');
  if (evidenceReceipts.some(r => r.path === debt.receipt.path || r.sha256 === debt.receipt.sha256)) v.fail('confidence debt cannot be claimed as verified evidence');
  for (const binding of deferred) {
    if (!route.strategy.stages.includes(binding.routeSkipId) || route.strategy.skips.some(s => s.id === binding.routeSkipId)) v.fail('selected-with-debt must preserve route selection');
    if (!DEBT_CAPABLE_STAGES.has(binding.routeSkipId) && !(binding.routeSkipId === 'copy' && canDeferMissingCopy(route))) v.fail('stage cannot be deferred as confidence debt');
    const items = current.filter(d => d.stage === binding.routeSkipId);
    if (!items.length || binding.debtIds.length !== items.length || binding.debtIds.some(id => !items.some(d => d.id === id))) v.fail('selected-with-debt must cite the exact stage debt set');
    if (!items.some(d => d.reason === binding.reason)) v.fail('debt binding reason is not in the current ledger');
  }
  return debt.limitations;
}
