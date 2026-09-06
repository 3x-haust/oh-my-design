import {
  ADAPTIVE_ROLE_IDS,
  ADAPTIVE_STAGE_IDS,
  failAdaptiveRoute,
  type AdaptiveStrategyDecision,
} from './adaptive-flow-domain.ts';
import { ADAPTIVE_STAGE_GRAPH, ADAPTIVE_STAGE_OWNERS, type AdaptiveStageId } from './adaptive-stage-graph.ts';

function knownRole(value: string): boolean {
  return ADAPTIVE_ROLE_IDS.some((role) => role === value);
}

function knownStage(value: string): value is AdaptiveStageId {
  return ADAPTIVE_STAGE_IDS.some((stage) => stage === value);
}

function selectedDependencies(stage: AdaptiveStageId, selected: ReadonlySet<string>): readonly AdaptiveStageId[] {
  const node = ADAPTIVE_STAGE_GRAPH[stage];
  return [...node.prerequisites, ...node.afterIfSelected].filter((dependency) => selected.has(dependency));
}

/** Validates explicit concurrency groups against selected roles and the artifact DAG. */
export function validateAdaptiveExecutionWaves(strategy: AdaptiveStrategyDecision): void {
  const waveByRole = new Map<string, number>();
  for (const [waveIndex, wave] of strategy.executionWaves.entries()) {
    if (wave.roles.length === 0) return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID');
    for (const role of wave.roles) {
      if (!knownRole(role) || !strategy.roles.includes(role) || waveByRole.has(role)) {
        return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID');
      }
      waveByRole.set(role, waveIndex);
    }
  }
  if (strategy.roles.some((role) => !waveByRole.has(role))) {
    return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID');
  }

  const selected = new Set(strategy.stages);
  for (const stage of strategy.stages) {
    if (!knownStage(stage)) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
    const stageOwner = ADAPTIVE_STAGE_OWNERS[stage];
    if (!stageOwner.startsWith('omd-')) continue;
    const stageWave = waveByRole.get(stageOwner);
    if (stageWave === undefined) return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID');
    for (const dependency of selectedDependencies(stage, selected)) {
      const dependencyOwner = ADAPTIVE_STAGE_OWNERS[dependency];
      if (!dependencyOwner.startsWith('omd-') || dependencyOwner === stageOwner) continue;
      const dependencyWave = waveByRole.get(dependencyOwner);
      if (dependencyWave === undefined || dependencyWave >= stageWave) {
        return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID');
      }
    }
  }

  if (strategy.methods.includes('parallel-reference-acquisition')
    && strategy.roles.includes('omd-scout') && strategy.roles.includes('omd-writer')
    && waveByRole.get('omd-scout') !== waveByRole.get('omd-writer')) {
    return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID');
  }
}
