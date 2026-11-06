import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { AdaptiveRouteRecord } from '../route/index.ts';
import type { FirstRenderProgress } from './first-render-review-contract.ts';
import { newSurface } from './new-surface-advisories.ts';
import { STUDIO_DELIVER_MESSAGE, STUDIO_REVIEW_ROUNDS } from './studio-delivery.ts';
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
  /** Past the review ceiling a stall is reported instead of answered with another recomposition. */
  exhausted: boolean;
  /** A new surface: its ceiling is the studio's few rounds, after which the best render is delivered. */
  studio: boolean;
}>;

/** Reviews after which a stalled loop stops and reports; designers' iterations run five to fifteen rounds, not four. */
export const FIRST_RENDER_REVIEW_CEILING = 12;

export const STALL_PIVOT_MESSAGE = 'First-render repair stopped improving. Restore the best iteration, then recompose instead of patching: '
  + 'build the strongest concept you did not choose, or change the macro structure the persistent finding points at (section order, '
  + 'the protagonist\'s scale, what to cut or merge), and check again.';
export const STALL_REPORT_MESSAGE = `After ${FIRST_RENDER_REVIEW_CEILING} reviews the loop stops: restore the best iteration and report the remaining `
  + 'findings with both captures to the user instead of continuing.';
export const stallMessage = (loop: Pick<FirstRenderLoopState, 'exhausted'> & Partial<Pick<FirstRenderLoopState, 'studio'>>): string =>
  loop.exhausted ? loop.studio ? STUDIO_DELIVER_MESSAGE : STALL_REPORT_MESSAGE : STALL_PIVOT_MESSAGE;

/** Reviews after which an unresolved finding is reported even while each round still improves. */
const PERSISTENT_REVIEW_CEILING = 6;

export function loopReasons(iterations: readonly FirstRenderIteration[]): readonly ('four-non-improving-reviews' | 'persistent-findings')[] {
  const reviewed = iterations.filter(iteration => iteration.reviewSha256 !== null);
  const four = reviewed.slice(-4);
  const nonImproving = four.length === 4 && four.every(iteration =>
    iteration.decision !== 'retain' && iteration.progress !== null && iteration.progress !== 'improved');
  const three = reviewed.slice(-3);
  // A finding still open while each review says improved is a large repair in progress, not a stall; past six
  // reviews it is reported either way.
  const improving = three.length === 3 && three.slice(1).every(iteration => iteration.progress === 'improved');
  const persistent = three.length === 3 && (!improving || reviewed.length >= PERSISTENT_REVIEW_CEILING)
    && three.every(iteration => iteration.decision !== 'retain')
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
  const studio = newSurface(route);
  const reviewed = history.iterations.filter(iteration => iteration.reviewSha256 !== null).length;
  const exhausted = reviewed >= (studio ? STUDIO_REVIEW_ROUNDS : FIRST_RENDER_REVIEW_CEILING);
  // A new page's one spent review is not a stall: the maker answers it and delivers (test-333 restored the reviewed page instead).
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
    exhausted,
    studio,
  });
}
