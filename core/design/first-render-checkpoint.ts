import { adaptiveRouteRecordSha256, type AdaptiveRouteRecord } from '../route/index.ts';
import {
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { FirstRenderCaptureBinding } from './first-render-review-contract.ts';
import {
  assertFirstRenderSourceSnapshotCurrent,
  writeFirstRenderSourceCheckpoint,
  type FirstRenderSnapshotSource,
} from './first-render-checkpoint-source.ts';
import { failCheckpoint } from './first-render-checkpoint-common.ts';
import { appendFirstRenderIteration } from './first-render-iteration-history.ts';

export {
  FirstRenderCheckpointError,
} from './first-render-checkpoint-common.ts';
export {
  FIRST_RENDER_CHECKPOINT_SCHEMA,
  MAX_FIRST_RENDER_CHECKPOINT_BYTES,
  assertFirstRenderSourceSnapshotCurrent,
  collectFirstRenderSourceSnapshot,
  type FirstRenderCheckpointFile,
  type FirstRenderSnapshotSource,
  type FirstRenderSourceCheckpoint,
} from './first-render-checkpoint-source.ts';
export {
  FIRST_RENDER_ITERATION_HISTORY_SCHEMA,
  firstRenderIterationForReport,
  firstRenderIterationRenders,
  firstRenderReviewMatchesCurrentRoute,
  previousFirstRenderIteration,
  readFirstRenderIterationHistory,
  recordFirstRenderIterationReview,
  type FirstRenderIteration,
  type FirstRenderIterationHistory,
} from './first-render-iteration-history.ts';
export {
  firstRenderLoopState,
  type FirstRenderLoopState,
} from './first-render-loop-state.ts';
export {
  FIRST_RENDER_RESTORE_SCHEMA,
  restoreFirstRenderIteration,
} from './first-render-restore.ts';

export function persistFirstRenderCheckpoint(input: Readonly<{
  root: string;
  route: AdaptiveRouteRecord;
  routeSha256: string;
  source: FirstRenderSnapshotSource;
  reportSha256: string;
  captures: readonly FirstRenderCaptureBinding[];
  writer: ProjectWriteAdapter;
  invocation: ProjectRunInvocation;
}>) {
  requireProjectWriteAdapterForInvocation(input.root, input.writer, input.invocation);
  const routeSha256 = adaptiveRouteRecordSha256(input.route);
  if (input.routeSha256 !== routeSha256) return failCheckpoint('checkpoint route binding changed');
  assertFirstRenderSourceSnapshotCurrent(input.root, input.route, input.source);
  const stored = writeFirstRenderSourceCheckpoint({
    sourceContractSha256: input.route.sourceContractSha256,
    routeSha256,
    reportSha256: input.reportSha256,
    captures: input.captures,
    source: input.source,
    writer: input.writer,
  });
  return appendFirstRenderIteration({
    root: input.root,
    route: input.route,
    checkpointSha256: stored.checkpointSha256,
    reportSha256: stored.checkpoint.reportSha256,
    captures: stored.checkpoint.captures,
    invocation: input.invocation,
  });
}
