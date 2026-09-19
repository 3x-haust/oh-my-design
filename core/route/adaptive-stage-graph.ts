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
  domain: 'coordinator', depth: 'coordinator', frame: 'omd-framer',
  'content-grain': 'omd-framer', acquisition: 'omd-framer',
  scout: 'omd-scout', moodboard: 'omd-scout', 'reference-board': 'omd-scout', 'reference-selection': 'coordinator',
  'art-direction': 'coordinator', copy: 'omd-writer', 'type-proof': 'omd-typesetter',
  composition: 'omd-composer', 'candidate-generation': 'omd-sketch',
  'safety-validation': 'omd-writer', production: 'omd-hand',
  'browser-evidence': 'omd-hand', 'independent-review': 'omd-eye',
} as const satisfies Readonly<Record<AdaptiveStageId, string>>);

export const ADAPTIVE_STAGE_GRAPH = Object.freeze({
  domain: { prerequisites: [], afterIfSelected: [] },
  depth: { prerequisites: [], afterIfSelected: [] },
  frame: { prerequisites: [], afterIfSelected: ['domain'] },
  'content-grain': { prerequisites: ['frame'], afterIfSelected: [] },
  acquisition: { prerequisites: ['frame'], afterIfSelected: [] },
  scout: { prerequisites: [], afterIfSelected: ['acquisition'] },
  moodboard: { prerequisites: ['domain'], afterIfSelected: [] },
  'reference-board': { prerequisites: ['scout'], afterIfSelected: [] },
  'reference-selection': { prerequisites: ['reference-board'], afterIfSelected: [] },
  'art-direction': { prerequisites: [], afterIfSelected: ['depth', 'reference-selection'] },
  copy: { prerequisites: [], afterIfSelected: ['art-direction'] },
  'type-proof': { prerequisites: ['copy'], afterIfSelected: [] },
  composition: {
    prerequisites: ['frame', 'copy'],
    afterIfSelected: [
      'content-grain', 'scout', 'reference-selection', 'art-direction', 'type-proof',
    ],
  },
  'candidate-generation': { prerequisites: ['composition'], afterIfSelected: [] },
  'safety-validation': { prerequisites: [], afterIfSelected: [] },
  production: { prerequisites: [], afterIfSelected: [
    'domain', 'depth', 'frame', 'content-grain', 'acquisition', 'scout', 'moodboard', 'reference-board',
    'reference-selection', 'art-direction', 'copy', 'type-proof', 'composition',
    'candidate-generation', 'safety-validation',
  ] },
  'browser-evidence': { prerequisites: ['production'], afterIfSelected: [] },
  'independent-review': { prerequisites: ['browser-evidence'], afterIfSelected: [] },
} as const satisfies AdaptiveStageGraph);

function knownStage(value: string): value is AdaptiveStageId {
  return ADAPTIVE_STAGE_IDS.some((stage) => stage === value);
}

/** Audits the fixed graph itself so an unknown edge or cycle fails before routing. */
export function validateAdaptiveStageGraph(graph: Readonly<Record<string, AdaptiveStageNode>>): void {
  const keys = Object.keys(graph);
  if (keys.length !== ADAPTIVE_STAGE_IDS.length
    || ADAPTIVE_STAGE_IDS.some((stage) => !Object.hasOwn(graph, stage))) {
    return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
  }
  for (const stage of ADAPTIVE_STAGE_IDS) {
    const node = graph[stage];
    if (node === undefined) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
    const edges = [...node.prerequisites, ...node.afterIfSelected];
    if (edges.some((edge) => !knownStage(edge))) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
    if (new Set(edges).size !== edges.length || edges.includes(stage)) {
      return failAdaptiveRoute('ADAPTIVE_STAGE_ORDER_INVALID');
    }
  }
  const visiting = new Set<AdaptiveStageId>();
  const visited = new Set<AdaptiveStageId>();
  const visit = (stage: AdaptiveStageId): void => {
    if (visiting.has(stage)) return failAdaptiveRoute('ADAPTIVE_STAGE_ORDER_INVALID');
    if (visited.has(stage)) return;
    visiting.add(stage);
    const node = graph[stage];
    if (node === undefined) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
    for (const dependency of [...node.prerequisites, ...node.afterIfSelected]) visit(dependency);
    visiting.delete(stage);
    visited.add(stage);
  };
  for (const stage of ADAPTIVE_STAGE_IDS) visit(stage);
}

export function validateAdaptiveStageOrder(strategy: AdaptiveStrategyDecision): void {
  validateAdaptiveStageGraph(ADAPTIVE_STAGE_GRAPH);
  const selected = new Map(strategy.stages.map((stage, index) => [stage, index]));
  for (const stage of strategy.stages) {
    if (!knownStage(stage)) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
    const node = ADAPTIVE_STAGE_GRAPH[stage];
    const current = selected.get(stage);
    if (current === undefined) return failAdaptiveRoute('ADAPTIVE_STAGE_ORDER_INVALID');
    for (const prerequisite of node.prerequisites) {
      const index = selected.get(prerequisite);
      if (index === undefined || index >= current) return failAdaptiveRoute('ADAPTIVE_STAGE_ORDER_INVALID', `strategyDecision.stages must include ${prerequisite} before ${stage}`);
    }
    for (const dependency of node.afterIfSelected) {
      const index = selected.get(dependency);
      if (index !== undefined && index >= current) return failAdaptiveRoute('ADAPTIVE_STAGE_ORDER_INVALID', `selected stage ${dependency} must precede ${stage} in strategyDecision.stages`);
    }
  }
}
