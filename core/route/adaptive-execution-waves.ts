import { failAdaptiveRoute, type AdaptiveStrategyDecision } from './adaptive-flow-domain.ts';

export function validateAdaptiveExecutionWaves(
  strategy: Pick<AdaptiveStrategyDecision, 'roles' | 'stages' | 'methods' | 'executionWaves'>,
  deliveryMode?: 'design-only',
  _currentProcess = true,
): void {
  if (deliveryMode !== undefined
    || strategy.roles.join(',') !== 'omd-hand,omd-eye'
    || strategy.stages.join(',') !== 'production,browser-evidence,independent-review'
    || strategy.methods.length !== 0
    || strategy.executionWaves.length !== 2
    || strategy.executionWaves[0]?.id !== 'build'
    || strategy.executionWaves[0]?.roles.join(',') !== 'omd-hand'
    || strategy.executionWaves[1]?.id !== 'verify'
    || strategy.executionWaves[1]?.roles.join(',') !== 'omd-eye') {
    failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID');
  }
}
