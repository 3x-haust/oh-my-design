import type { ExpressiveDesignNeed } from './design-axis-routing.ts';
import { failAdaptiveRoute, type AdaptiveStrategyDecision } from './adaptive-flow-domain.ts';

export type MotionAmbition = 'baseline' | 'award-level' | 'canonical';
export type AdaptiveMotionContract = Readonly<
  | { selected: false; ambition: null }
  | { selected: true; ambition: MotionAmbition }
>;

const PREFIX = 'motion-ambition:';

export function adaptiveMotionContract(
  expressiveDesignNeed: ExpressiveDesignNeed,
  strategy: AdaptiveStrategyDecision,
): AdaptiveMotionContract {
  const selected = strategy.methods.includes('motion-one');
  const ambitions = strategy.methods.filter((method) => method.startsWith(PREFIX));
  if (!selected) {
    if (ambitions.length !== 0) return failAdaptiveRoute('SHOWPIECE_MOTION_AMBITION_INVALID');
    return Object.freeze({ selected: false, ambition: null });
  }
  if (ambitions.length !== 1) return failAdaptiveRoute('SHOWPIECE_MOTION_AMBITION_INVALID');
  const ambition = ambitions[0]?.slice(PREFIX.length);
  if (ambition !== 'baseline' && ambition !== 'award-level' && ambition !== 'canonical') {
    return failAdaptiveRoute('SHOWPIECE_MOTION_AMBITION_INVALID');
  }
  if (expressiveDesignNeed === 'showpiece' && ambition === 'baseline') {
    return failAdaptiveRoute('SHOWPIECE_MOTION_AMBITION_INVALID');
  }
  return Object.freeze({ selected: true, ambition });
}
