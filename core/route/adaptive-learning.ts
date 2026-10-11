import { applicableLearnedRules } from '../learning/index.ts';
import { ADAPTIVE_LEARNING_CONTEXT_SCHEMA, type AdaptiveLearningContext } from './adaptive-flow-domain.ts';
import { parseAdaptiveLearningContext } from './adaptive-flow-boundary.ts';

export type RouteLearningScope = Readonly<{ surface: string }>;
export const UNSELECTED_LEARNING: AdaptiveLearningContext = Object.freeze({
  schema: ADAPTIVE_LEARNING_CONTEXT_SCHEMA, status: 'none', learningIds: Object.freeze([]),
  reason: 'Advisory learning is selected from the local rule store at publication, not from caller IDs.',
});

/** Publication snapshots advisory IDs. Replay never reloads a changing user/project index. */
export function publishedRouteLearning(root: string, scope: RouteLearningScope): AdaptiveLearningContext {
  try {
    const learningIds = Object.freeze([...new Set(applicableLearnedRules(scope, { projectRoot: root }).map(rule => rule.id))].sort());
    // No advice must preserve the exact neutral preview bytes used by host route authorization.
    if (learningIds.length === 0) return UNSELECTED_LEARNING;
    return parseAdaptiveLearningContext({ schema: ADAPTIVE_LEARNING_CONTEXT_SCHEMA,
      status: 'promoted', learningIds,
      reason: 'Applicable local learned rules; advisory, not completion evidence or gates.' });
  } catch (error) {
    // A malformed/unavailable advisory index must neither become a required gate nor disappear silently.
    return Object.freeze({ ...UNSELECTED_LEARNING,
      reason: `Advisory learning unavailable: ${error instanceof Error ? error.message : String(error)}` });
  }
}
