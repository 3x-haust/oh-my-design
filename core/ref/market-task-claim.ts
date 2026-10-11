import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';

/** Historical API cannot establish task support from vocabulary. */
export function selfRootTaskClaim(_taskCategory: string, _taskText: string): 'unclear' { return 'unclear'; }

export async function assessedTaskCapability(sourceUrl: string, binding?: ReferenceJudgmentBinding) {
  if (binding && binding.subjectId !== sourceUrl) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
  return referenceDecision('task-capability', binding);
}
