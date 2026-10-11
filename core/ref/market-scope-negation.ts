import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';

/** Legacy lexical classifier cannot establish inclusion or exclusion. */
export function negatesMarketScope(_value: string, _tokens: readonly string[]): 'unclear' { return 'unclear'; }

export async function assessedMarketScope(sourceUrl: string, binding?: ReferenceJudgmentBinding) {
  if (binding && binding.subjectId !== sourceUrl) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
  return referenceDecision('market-scope', binding);
}
