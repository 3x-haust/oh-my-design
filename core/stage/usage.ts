// Per-stage cost accounting.
//
// A full L4 run costs about an hour of wall clock and a large share of a weekly model quota. When
// one dies the run reports nothing about where the budget went, so nobody can tell an expensive
// stage from a runaway one. Host logs only expose a cumulative total, so a stage's cost is the
// delta between the snapshot taken when it ended and the previous one.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageDefinition, StageError, type StageId } from './contract.ts';

export const STAGE_USAGE_SCHEMA = 'stage-usage-v1' as const;
export const STAGE_USAGE_LOG = '.omd/stage-usage.jsonl';

export type StageUsageSample = {
  readonly schema: typeof STAGE_USAGE_SCHEMA;
  readonly stage: StageId;
  readonly at: string;
  /** Cumulative run totals at the moment the stage ended, as reported by the host session log. */
  readonly totalTokens: number;
  readonly outputTokens: number;
  readonly elapsedMs: number;
  readonly approximate: boolean;
};

export type StageCost = {
  readonly stage: StageId;
  readonly totalTokens: number;
  readonly outputTokens: number;
  readonly elapsedMs: number;
  /** True when the host total moved backwards or the source declared itself partial. */
  readonly approximate: boolean;
};

export type StageBudget = {
  readonly maxStageTokens?: number;
  readonly maxRunTokens?: number;
  readonly maxRunElapsedMs?: number;
};

export type StageBudgetReport = {
  readonly ok: boolean;
  readonly costs: readonly StageCost[];
  readonly runTokens: number;
  readonly runElapsedMs: number;
  readonly findings: readonly string[];
};

export function validateStageUsageSample(value: unknown): StageUsageSample {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new StageError('stage usage sample must be an object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'approximate,at,elapsedMs,outputTokens,schema,stage,totalTokens') throw new StageError('stage usage sample has unknown or missing keys');
  if (record.schema !== STAGE_USAGE_SCHEMA) throw new StageError(`stage usage schema must be ${STAGE_USAGE_SCHEMA}`);
  if (typeof record.at !== 'string' || !Number.isFinite(Date.parse(record.at))) throw new StageError('stage usage sample needs an ISO timestamp');
  if (typeof record.approximate !== 'boolean') throw new StageError('stage usage sample needs an approximate flag');
  for (const key of ['totalTokens', 'outputTokens', 'elapsedMs'] as const) {
    if (!Number.isFinite(record[key]) || (record[key] as number) < 0) throw new StageError(`stage usage ${key} must be a non-negative number`);
  }
  return {
    schema: STAGE_USAGE_SCHEMA,
    stage: stageDefinition(String(record.stage)).id,
    at: record.at,
    totalTokens: record.totalTokens as number,
    outputTokens: record.outputTokens as number,
    elapsedMs: record.elapsedMs as number,
    approximate: record.approximate,
  };
}

export function readStageUsage(projectRoot: string): readonly StageUsageSample[] {
  const path = join(projectRoot, STAGE_USAGE_LOG);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw new StageError(`stage usage log line ${index + 1} is not JSON`); }
      return validateStageUsageSample(value);
    });
}

export function serializeStageUsage(samples: readonly StageUsageSample[]): string {
  return `${samples.map((sample) => JSON.stringify(sample)).join('\n')}\n`;
}

/** Deltas between consecutive snapshots. A backwards total means the host log rotated: clamp and flag. */
export function stageCosts(samples: readonly StageUsageSample[]): readonly StageCost[] {
  let previous: StageUsageSample | undefined;
  return samples.map((sample) => {
    const delta = (current: number, before: number): number => (current >= before ? current - before : current);
    const rolled = previous !== undefined && (sample.totalTokens < previous.totalTokens || sample.elapsedMs < previous.elapsedMs);
    const cost: StageCost = {
      stage: sample.stage,
      totalTokens: previous === undefined ? sample.totalTokens : delta(sample.totalTokens, previous.totalTokens),
      outputTokens: previous === undefined ? sample.outputTokens : delta(sample.outputTokens, previous.outputTokens),
      elapsedMs: previous === undefined ? sample.elapsedMs : delta(sample.elapsedMs, previous.elapsedMs),
      approximate: sample.approximate || rolled,
    };
    previous = sample;
    return cost;
  });
}

export function evaluateStageBudget(samples: readonly StageUsageSample[], budget: StageBudget): StageBudgetReport {
  const costs = stageCosts(samples);
  const last = samples[samples.length - 1];
  const runTokens = last?.totalTokens ?? 0;
  const runElapsedMs = last?.elapsedMs ?? 0;
  const findings: string[] = [];
  if (budget.maxStageTokens !== undefined) {
    for (const cost of costs) {
      if (cost.totalTokens > budget.maxStageTokens) findings.push(`stage ${cost.stage} used ${cost.totalTokens} tokens over the ${budget.maxStageTokens} stage budget`);
    }
  }
  if (budget.maxRunTokens !== undefined && runTokens > budget.maxRunTokens) findings.push(`run used ${runTokens} tokens over the ${budget.maxRunTokens} run budget`);
  if (budget.maxRunElapsedMs !== undefined && runElapsedMs > budget.maxRunElapsedMs) findings.push(`run took ${Math.round(runElapsedMs / 60000)} minutes over the ${Math.round(budget.maxRunElapsedMs / 60000)} minute budget`);
  return { ok: findings.length === 0, costs, runTokens, runElapsedMs, findings };
}
