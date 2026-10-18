import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { AdaptiveRouteRecord } from '../route/index.ts';
import type { FirstRenderProgress } from './first-render-review-contract.ts';
import { checkpointRecord } from './first-render-checkpoint-common.ts';
import {
  readFirstRenderSourceCheckpoint,
  sourceCheckpointMatchesCurrent,
} from './first-render-checkpoint-source.ts';
import {
  firstRenderRestorePath,
  readFirstRenderIterationHistory,
  type FirstRenderIteration,
} from './first-render-iteration-history.ts';

export type FirstRenderLoopState = Readonly<{
  stalled: boolean;
  reasons: readonly ('four-non-improving-reviews' | 'persistent-findings')[];
  bestIterationId: string | null;
  currentIterationId: string | null;
  currentProgress: FirstRenderProgress['verdict'] | null;
  bestRestored: boolean;
  bestRestoreApplied: boolean;
}>;

function loopReasons(iterations: readonly FirstRenderIteration[]): FirstRenderLoopState['reasons'] {
  const reviewed = iterations.filter(iteration => iteration.reviewSha256 !== null);
  const four = reviewed.slice(-4);
  const nonImproving = four.length === 4 && four.every(iteration =>
    iteration.decision !== 'retain' && iteration.progress !== null && iteration.progress !== 'improved');
  const three = reviewed.slice(-3);
  const persistent = three.length === 3 && three.every(iteration => iteration.decision !== 'retain')
    && three.reduce<Set<string> | null>((shared, iteration) => {
      const ids = new Set(iteration.findingIds);
      return shared === null ? ids : new Set([...shared].filter(id => ids.has(id)));
    }, null)?.size !== 0;
  return Object.freeze([
    ...(nonImproving ? ['four-non-improving-reviews' as const] : []),
    ...(persistent ? ['persistent-findings' as const] : []),
  ]);
}

export function firstRenderLoopState(root: string, route: AdaptiveRouteRecord): FirstRenderLoopState {
  const history = readFirstRenderIterationHistory(root, route);
  const current = history.iterations.at(-1) ?? null;
  const best = history.bestIterationId === null ? null
    : history.iterations.find(iteration => iteration.id === history.bestIterationId) ?? null;
  const reasons = loopReasons(history.iterations);
  const bestRestoreApplied = (() => {
    const path = firstRenderRestorePath(route);
    if (best === null || current === null || current.reviewSha256 === null
      || !existsSync(resolve(root, path))) {
      return false;
    }
    try {
      const receipt = checkpointRecord(JSON.parse(
        readContainedRegularFile(root, path, 'first-render restore receipt').toString('utf8'),
      ), 'first-render restore receipt');
      return receipt.schema === 'first-render-restore-v1'
        && receipt.iterationId === best.id
        && receipt.checkpointSha256 === best.checkpointSha256
        && receipt.triggerReviewSha256 === current.reviewSha256;
    } catch {
      return false;
    }
  })();
  return Object.freeze({
    stalled: reasons.length > 0,
    reasons,
    bestIterationId: best?.id ?? null,
    currentIterationId: current?.id ?? null,
    currentProgress: current?.progress ?? null,
    bestRestored: best === null ? false
      : sourceCheckpointMatchesCurrent(root, route,
        readFirstRenderSourceCheckpoint(root, best.checkpointSha256)),
    bestRestoreApplied,
  });
}
