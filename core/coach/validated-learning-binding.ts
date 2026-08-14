import type { DesignDecision } from '../deliberation/contracts.ts';
import type { LearningProposition } from './validated-learning-contract.ts';

const SURFACE_PREFIX = 'surface:';
const LEARNING_PREFIX = 'learning:';
const NAMESPACE_MASK = /[\p{Cc}\p{Default_Ignorable_Code_Point}]/gu;

function hasOneExactBinding(affects: readonly string[], prefix: string, expected: string): boolean {
  let count = 0;
  let matched = false;
  for (const raw of affects) {
    const normalized = raw.normalize('NFKC');
    const visible = normalized.replace(NAMESPACE_MASK, '');
    if (!visible.startsWith(prefix)) continue;
    count += 1;
    if (raw !== normalized || visible !== normalized) return false;
    if (normalized === expected) matched = true;
  }
  return count === 1 && matched;
}

/** Requires one unambiguous surface join and one unambiguous proposition join. */
export function hasExactLearningDecisionBindings(
  decision: DesignDecision,
  proposition: LearningProposition,
): boolean {
  return hasOneExactBinding(decision.affects, SURFACE_PREFIX, `${SURFACE_PREFIX}${proposition.scope.surface}`)
    && hasOneExactBinding(decision.affects, LEARNING_PREFIX, `${LEARNING_PREFIX}${proposition.id}`);
}
