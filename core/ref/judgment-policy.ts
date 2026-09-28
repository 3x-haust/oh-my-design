import { JudgmentError, knownFields, readCurrentJudgment, type JudgmentPolicy, type JudgmentReadContext, type JudgmentReceipt } from '../judgment/index.ts';

/** Semantic reference decisions are authored by the agent and verified against signed observations.
 * Callers must supply a trusted reader: agent-authored excerpts cannot resolve a source. */
export const REFERENCE_JUDGMENT_DECISIONS = {
  'market-scope': ['serves', 'excludes', 'unclear'],
  'task-capability': ['supports', 'does-not-support', 'unclear'],
  'search-result-role': ['task-source', 'design-source', 'editorial', 'navigation', 'irrelevant', 'unclear'],
  'link-role': ['task-source', 'design-source', 'navigation', 'editorial', 'irrelevant', 'unclear'],
  'discovery-target': ['inspect', 'skip'],
  'page-access': ['content', 'challenge', 'login', 'error', 'unclear'],
  'reference-action': ['read-only-navigation', 'disclosure', 'sensitive', 'unclear'],
  'overlay-action': ['suppress-informational', 'preserve-sensitive', 'preserve-content', 'unclear'],
  'surface-content': ['task-content', 'error-state', 'other'],
  'discovery-query': ['use', 'revise', 'skip'],
  'source-language': ['korean', 'non-korean', 'undetermined'],
  'mood-direction': ['user-stated', 'adopted'],
  'reference-interaction': ['interactive', 'autonomous'],
  'claim-kind': ['felt-quality', 'measured-property', 'other'],
} as const;
export type ReferenceJudgmentPurpose = keyof typeof REFERENCE_JUDGMENT_DECISIONS;

export function referenceJudgmentPolicy(purpose: ReferenceJudgmentPurpose, fields: readonly string[],
  requiredSourceKinds: JudgmentPolicy['requiredSourceKinds'] =
    ['mood-direction', 'reference-interaction', 'discovery-query'].includes(purpose) ? ['route-request'] : ['receipt']): JudgmentPolicy {
  return {
    purpose, decisions: REFERENCE_JUDGMENT_DECISIONS[purpose], authorRoles: ['scout', 'reference-owner', 'coordinator', 'designer'],
    sourceKinds: ['receipt', 'route-request', 'user-turn', 'artifact'], fields, requiredSourceKinds,
    parsePayload: input => {
      const payload = knownFields(input, purpose === 'mood-direction' ? ['direction'] : [],
        ['region', 'task', 'direction', 'target', 'control'], `reference.${purpose}.payload`).value;
      for (const value of Object.values(payload)) if (typeof value !== 'string' || !value.trim() || value.length > 4096)
        throw new JudgmentError('AI_JUDGMENT_INVALID', 'judgment payload must contain bounded text');
      return payload;
    },
    mode: ['reference-action', 'overlay-action'].includes(purpose) ? 'hard' : 'advisory',
  };
}

export type ReferenceJudgmentBinding = Readonly<{
  receipt: JudgmentReceipt;
  context: JudgmentReadContext;
  /** Exact URL, control selector or source identity; checked separately from the quote. */
  subjectId: string;
  fields: readonly string[];
  sourceKinds?: JudgmentPolicy['requiredSourceKinds'];
}>;
export type ReferenceDecision = Readonly<{ decision: string; limitation: string | null }>;

export async function readReferenceJudgment(binding: ReferenceJudgmentBinding, purpose: ReferenceJudgmentPurpose) {
  const verified = await readCurrentJudgment(binding.receipt,
    referenceJudgmentPolicy(purpose, binding.fields, binding.sourceKinds), binding.context);
  if (verified.judgment.subjectId !== binding.subjectId) throw new JudgmentError('AI_JUDGMENT_CONTEXT_MISMATCH', 'subject identity changed');
  if (['reference-action', 'overlay-action'].includes(purpose)
    && (binding.context.documentSha256 === null
      || !verified.judgment.quotes.some(quote => quote.source.kind === 'receipt'
        && quote.itemId !== null && binding.subjectId.endsWith(`#${quote.itemId}`))))
    throw new JudgmentError('AI_JUDGMENT_CONTEXT_MISMATCH', 'action requires current document and exact signed control target');
  return verified;
}

/** Missing advisory judgment means unknown, not a positive semantic finding. Invalid submitted
 * judgments always reject: a false quote is not an optional process omission. */
export async function referenceDecision(purpose: ReferenceJudgmentPurpose, binding?: ReferenceJudgmentBinding): Promise<ReferenceDecision> {
  if (!binding) {
    if (['reference-action', 'overlay-action'].includes(purpose)) throw new JudgmentError('AI_JUDGMENT_REQUIRED');
    return { decision: 'unclear', limitation: `${purpose}: no verified current judgment` };
  }
  const { judgment } = await readReferenceJudgment(binding, purpose);
  return { decision: judgment.decision, limitation: null };
}

export async function assessPageAccess(url: string, binding?: ReferenceJudgmentBinding): Promise<ReferenceDecision> {
  if (binding && binding.subjectId !== url) throw new JudgmentError('AI_JUDGMENT_CONTEXT_MISMATCH', 'page-access document URL differs');
  return referenceDecision('page-access', binding);
}

