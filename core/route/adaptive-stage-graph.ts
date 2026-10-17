import {
  ADAPTIVE_STAGE_IDS,
  failAdaptiveRoute,
  type AdaptiveStrategyDecision,
} from './adaptive-flow-domain.ts';

export type AdaptiveStageId = (typeof ADAPTIVE_STAGE_IDS)[number];
export type AdaptiveStageNode = Readonly<{
  prerequisites: readonly AdaptiveStageId[];
  afterIfSelected: readonly AdaptiveStageId[];
}>;
export type AdaptiveStageGraph = Readonly<Record<AdaptiveStageId, AdaptiveStageNode>>;

export const ADAPTIVE_STAGE_OWNERS = Object.freeze({
  production: 'omd-hand',
  'browser-evidence': 'omd-hand',
  'independent-review': 'omd-eye',
} as const satisfies Readonly<Record<AdaptiveStageId, string>>);

export const ADAPTIVE_STAGE_GRAPH: AdaptiveStageGraph = Object.freeze({
  production: Object.freeze({ prerequisites: [] as const, afterIfSelected: [] as const }),
  'browser-evidence': Object.freeze({ prerequisites: ['production'] as const, afterIfSelected: [] as const }),
  'independent-review': Object.freeze({ prerequisites: ['browser-evidence'] as const, afterIfSelected: [] as const }),
});
export const LEGACY_ADAPTIVE_STAGE_GRAPH = ADAPTIVE_STAGE_GRAPH;
export const LEGACY_ADAPTIVE_STAGE_OWNERS = ADAPTIVE_STAGE_OWNERS;

export const adaptiveStageGraph = (_currentProcess = true): AdaptiveStageGraph => ADAPTIVE_STAGE_GRAPH;
export const adaptiveStageOwners = (_currentProcess = true): Readonly<Record<AdaptiveStageId, string>> => ADAPTIVE_STAGE_OWNERS;

const knownStage = (value: string): value is AdaptiveStageId =>
  ADAPTIVE_STAGE_IDS.some(stage => stage === value);

export function validateAdaptiveStageGraph(graph: Readonly<Record<string, AdaptiveStageNode>>): void {
  if (Object.keys(graph).length !== ADAPTIVE_STAGE_IDS.length
    || ADAPTIVE_STAGE_IDS.some(stage => !Object.hasOwn(graph, stage))) {
    failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
  }
}

export function validateAdaptiveStageOrder(
  strategy: AdaptiveStrategyDecision,
  deliveryMode?: 'design-only',
  _currentProcess = true,
): void {
  if (deliveryMode !== undefined) failAdaptiveRoute('DESIGN_ONLY_SCOPE_REQUIRED');
  validateAdaptiveStageGraph(ADAPTIVE_STAGE_GRAPH);
  if (strategy.stages.length !== ADAPTIVE_STAGE_IDS.length
    || strategy.stages.some((stage, index) => !knownStage(stage) || stage !== ADAPTIVE_STAGE_IDS[index])) {
    failAdaptiveRoute('ADAPTIVE_STAGE_ORDER_INVALID');
  }
}
