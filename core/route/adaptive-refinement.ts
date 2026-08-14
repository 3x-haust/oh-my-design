import type { AdaptiveStrategyDecision } from './adaptive-flow-domain.ts';

export type RequiredGateStatus = 'green' | 'red';
export type AdaptiveRefinementDisposition = Readonly<{
  action: 'run' | 'stop';
  producer: 'omd-hand';
  reviewer: 'omd-eye';
  reason: 'selected-method' | 'required-gate-red' | 'required-gates-green';
}>;
export type AdaptiveRefinementCheckpoint = Readonly<{
  action: 'reject' | 'continue' | 'complete';
  countsRound: boolean;
  producer: 'omd-hand';
  reviewer: 'omd-eye';
}>;

export function adaptiveRefinementCheckpoint(
  requiredGateStatus: RequiredGateStatus,
  evidence: 'present' | 'missing',
): AdaptiveRefinementCheckpoint {
  const owners = { producer: 'omd-hand', reviewer: 'omd-eye' } as const;
  if (evidence === 'missing') return { action: 'reject', countsRound: false, ...owners };
  return requiredGateStatus === 'red'
    ? { action: 'continue', countsRound: true, ...owners }
    : { action: 'complete', countsRound: true, ...owners };
}

/** Decides one evidence-driven refinement turn without imposing a remembered round count. */
export function adaptiveRefinementDisposition(
  strategy: AdaptiveStrategyDecision,
  requiredGateStatus: RequiredGateStatus,
): AdaptiveRefinementDisposition {
  if (requiredGateStatus === 'red') {
    return { action: 'run', producer: 'omd-hand', reviewer: 'omd-eye', reason: 'required-gate-red' };
  }
  if (strategy.methods.includes('evidence-driven-refinement')) {
    return { action: 'run', producer: 'omd-hand', reviewer: 'omd-eye', reason: 'selected-method' };
  }
  return { action: 'stop', producer: 'omd-hand', reviewer: 'omd-eye', reason: 'required-gates-green' };
}
