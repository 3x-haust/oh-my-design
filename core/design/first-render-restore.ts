import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adaptiveRouteRecordSha256, pathsOutsideScope, type AdaptiveRouteRecord } from '../route/index.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import {
  acquireProjectMutationLock,
  preflightProjectFileMutation,
  replaceProjectFileAtomically,
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import {
  failCheckpoint,
} from './first-render-checkpoint-common.ts';
import {
  firstRenderAllowedSourceFiles,
  firstRenderBlobPath,
  firstRenderSourceFileExists,
  firstRenderSourcePathAllowed,
  readFirstRenderSourceCheckpoint,
  type FirstRenderSourceCheckpoint,
} from './first-render-checkpoint-source.ts';
import {
  firstRenderRestorePath,
  readFirstRenderIterationHistory,
  type FirstRenderIteration,
} from './first-render-iteration-history.ts';

export const FIRST_RENDER_RESTORE_SCHEMA = 'first-render-restore-v1' as const;

function validateCheckpointForRoute(
  root: string,
  route: AdaptiveRouteRecord,
  iteration: FirstRenderIteration,
): Readonly<{ checkpoint: FirstRenderSourceCheckpoint; blobs: ReadonlyMap<string, Buffer> }> {
  const checkpoint = readFirstRenderSourceCheckpoint(root, iteration.checkpointSha256);
  if (checkpoint.sourceContractSha256 !== route.sourceContractSha256
    || checkpoint.routeSha256 !== adaptiveRouteRecordSha256(route)
    || checkpoint.reportSha256 !== iteration.reportSha256
    || canonicalJson(checkpoint.captures) !== canonicalJson(iteration.captures)) {
    return failCheckpoint('checkpoint iteration binding changed');
  }
  const blobs = new Map<string, Buffer>();
  for (const file of checkpoint.files) {
    if (!firstRenderSourcePathAllowed(route, file.path)
      || pathsOutsideScope(route, [file.path]).length > 0) {
      return failCheckpoint(`checkpoint path is outside allowedPaths: ${file.path}`);
    }
    const bytes = readContainedRegularFile(root, firstRenderBlobPath(file.sha256),
      'first-render source blob');
    if (bytes.byteLength !== file.byteLength || sha256(bytes) !== file.sha256) {
      return failCheckpoint(`checkpoint blob changed: ${file.path}`);
    }
    blobs.set(file.path, bytes);
  }
  return Object.freeze({ checkpoint, blobs });
}

function restorePlan(
  root: string,
  route: AdaptiveRouteRecord,
  checkpoint: FirstRenderSourceCheckpoint,
  blobs: ReadonlyMap<string, Buffer>,
) {
  const currentPaths = firstRenderAllowedSourceFiles(root, route);
  const expected = new Set(checkpoint.files.map(file => file.path));
  const written = checkpoint.files.filter(file =>
    !firstRenderSourceFileExists(root, file.path)
    || sha256(readFileSync(resolve(root, file.path))) !== file.sha256).map(file => file.path);
  const removed = currentPaths.filter(path => !expected.has(path));
  const unchanged = checkpoint.files.map(file => file.path).filter(path => !written.includes(path));
  return { written, removed, unchanged, blobs };
}

function preflightRestorePlan(
  root: string,
  invocation: ProjectRunInvocation,
  plan: Readonly<{ written: readonly string[]; removed: readonly string[] }>,
): void {
  for (const relativePath of [...plan.written, ...plan.removed]) {
    preflightProjectFileMutation({ projectRoot: root, relativePath, invocation });
  }
}

export function restoreFirstRenderIteration(input: Readonly<{
  root: string;
  route: AdaptiveRouteRecord;
  iterationId?: string;
  writer: ProjectWriteAdapter;
  invocation: ProjectRunInvocation;
}>) {
  requireProjectWriteAdapterForInvocation(input.root, input.writer, input.invocation);
  const history = readFirstRenderIterationHistory(input.root, input.route);
  if (history.iterations.length === 0) {
    return failCheckpoint('no checkpoint exists for the current route');
  }
  const targetId = input.iterationId ?? history.bestIterationId;
  if (targetId === null) return failCheckpoint('no best checkpoint exists for the current route');
  const iteration = history.iterations.find(item => item.id === targetId)
    ?? failCheckpoint(`iteration ${targetId} does not exist`);
  const validated = validateCheckpointForRoute(input.root, input.route, iteration);
  const initial = restorePlan(input.root, input.route, validated.checkpoint, validated.blobs);
  preflightRestorePlan(input.root, input.invocation, initial);
  const release = acquireProjectMutationLock(input.root, input.invocation);
  try {
    const currentHistory = readFirstRenderIterationHistory(input.root, input.route);
    if (canonicalJson(currentHistory) !== canonicalJson(history)) {
      return failCheckpoint('iteration history changed before restore');
    }
    const currentIteration = currentHistory.iterations.find(item => item.id === targetId)
      ?? failCheckpoint(`iteration ${targetId} does not exist`);
    const currentValidated = validateCheckpointForRoute(input.root, input.route, currentIteration);
    const plan = restorePlan(input.root, input.route, currentValidated.checkpoint, currentValidated.blobs);
    if (canonicalJson({ written: initial.written, removed: initial.removed, unchanged: initial.unchanged })
      !== canonicalJson({ written: plan.written, removed: plan.removed, unchanged: plan.unchanged })) {
      return failCheckpoint('allowed source changed before restore');
    }
    preflightRestorePlan(input.root, input.invocation, plan);
    for (const path of plan.written) {
      input.writer.write(path, plan.blobs.get(path) ?? failCheckpoint(`checkpoint blob is missing: ${path}`));
    }
    for (const path of plan.removed) input.writer.remove(path);
    const result = Object.freeze({
      schema: FIRST_RENDER_RESTORE_SCHEMA,
      iterationId: iteration.id,
      checkpointSha256: iteration.checkpointSha256,
      triggerReviewSha256: history.iterations.at(-1)?.reviewSha256 ?? null,
      best: iteration.id === history.bestIterationId,
      written: Object.freeze(plan.written),
      removed: Object.freeze(plan.removed),
      unchanged: Object.freeze(plan.unchanged),
      changed: plan.written.length + plan.removed.length,
      next: 'try-a-different-approach-from-the-restored-source',
    });
    replaceProjectFileAtomically({
      projectRoot: input.root,
      relativePath: firstRenderRestorePath(input.route),
      content: canonicalJson(result),
      invocation: input.invocation,
    });
    return result;
  } finally {
    release();
  }
}
