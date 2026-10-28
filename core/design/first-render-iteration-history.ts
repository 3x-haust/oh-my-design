import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { adaptiveRouteRecordSha256, type AdaptiveRouteRecord } from '../route/index.ts';
import {
  replaceProjectFileAtomically,
} from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type {
  FirstRenderCaptureBinding,
  FirstRenderProgress,
} from './first-render-review-contract.ts';
import {
  checkpointDigest,
  checkpointRecord,
  checkpointText,
  exactCheckpointFields,
  failCheckpoint,
  parseCheckpointCaptures,
} from './first-render-checkpoint-common.ts';
import { firstRenderMotionProjection } from './first-render-motion.ts';
import { motionRequired, motionShortfall } from './new-surface-advisories.ts';

export const FIRST_RENDER_ITERATION_HISTORY_SCHEMA = 'first-render-iteration-history-v1' as const;

export type FirstRenderIteration = Readonly<{
  id: string;
  checkpointSha256: string;
  reportSha256: string;
  captures: readonly FirstRenderCaptureBinding[];
  reviewSha256: string | null;
  decision: 'retain' | 'revise' | 'reframe' | null;
  progress: FirstRenderProgress['verdict'] | null;
  findingIds: readonly string[];
}>;

export type FirstRenderIterationHistory = Readonly<{
  schema: typeof FIRST_RENDER_ITERATION_HISTORY_SCHEMA;
  sourceContractSha256: string;
  routeSha256: string;
  iterations: readonly FirstRenderIteration[];
  bestIterationId: string | null;
}>;

export const firstRenderHistoryPath = (route: AdaptiveRouteRecord): string =>
  `.omd/first-render/routes/${adaptiveRouteRecordSha256(route)}/iterations.json`;

export const firstRenderRestorePath = (route: AdaptiveRouteRecord): string =>
  `.omd/first-render/routes/${adaptiveRouteRecordSha256(route)}/restore.json`;

function parseIteration(value: unknown): FirstRenderIteration {
  const row = checkpointRecord(value, 'first-render iteration');
  exactCheckpointFields(row,
    ['id', 'checkpointSha256', 'reportSha256', 'captures', 'reviewSha256', 'decision', 'progress', 'findingIds'],
    'first-render iteration');
  const id = checkpointText(row.id, 'iteration id');
  if (!/^[1-9][0-9]*$/.test(id)) return failCheckpoint('iteration id is invalid');
  if (row.reviewSha256 !== null) checkpointDigest(row.reviewSha256, 'iteration review');
  if (row.decision !== null && row.decision !== 'retain'
    && row.decision !== 'revise' && row.decision !== 'reframe') {
    return failCheckpoint('iteration decision is invalid');
  }
  if (row.progress !== null && row.progress !== 'improved' && row.progress !== 'same'
    && row.progress !== 'regressed' && row.progress !== 'different-not-better') {
    return failCheckpoint('iteration progress is invalid');
  }
  if (!Array.isArray(row.findingIds) || row.findingIds.some(item => typeof item !== 'string' || !item.trim())
    || new Set(row.findingIds).size !== row.findingIds.length) {
    return failCheckpoint('iteration findings are invalid');
  }
  if ((row.reviewSha256 === null) !== (row.decision === null)
    || row.reviewSha256 === null && (row.progress !== null || row.findingIds.length > 0)) {
    return failCheckpoint('iteration review state is invalid');
  }
  return Object.freeze({
    id,
    checkpointSha256: checkpointDigest(row.checkpointSha256, 'iteration checkpoint'),
    reportSha256: checkpointDigest(row.reportSha256, 'iteration report'),
    captures: parseCheckpointCaptures(row.captures),
    reviewSha256: row.reviewSha256 as string | null,
    decision: row.decision,
    progress: row.progress,
    findingIds: Object.freeze([...row.findingIds] as string[]),
  });
}

function emptyHistory(route: AdaptiveRouteRecord): FirstRenderIterationHistory {
  return Object.freeze({
    schema: FIRST_RENDER_ITERATION_HISTORY_SCHEMA,
    sourceContractSha256: route.sourceContractSha256,
    routeSha256: adaptiveRouteRecordSha256(route),
    iterations: Object.freeze([]),
    bestIterationId: null,
  });
}

function parseHistory(value: unknown, route: AdaptiveRouteRecord): FirstRenderIterationHistory {
  const row = checkpointRecord(value, 'first-render iteration history');
  exactCheckpointFields(row,
    ['schema', 'sourceContractSha256', 'routeSha256', 'iterations', 'bestIterationId'],
    'first-render iteration history');
  if (row.schema !== FIRST_RENDER_ITERATION_HISTORY_SCHEMA
    || row.sourceContractSha256 !== route.sourceContractSha256
    || row.routeSha256 !== adaptiveRouteRecordSha256(route)) {
    return failCheckpoint('iteration history route binding changed');
  }
  if (!Array.isArray(row.iterations)) return failCheckpoint('iteration history is invalid');
  const iterations = row.iterations.map(parseIteration);
  if (iterations.some((iteration, index) => iteration.id !== String(index + 1))) {
    return failCheckpoint('iteration history order is invalid');
  }
  const bestIterationId = row.bestIterationId === null ? null
    : checkpointText(row.bestIterationId, 'best iteration id');
  if (bestIterationId !== null && !iterations.some(iteration => iteration.id === bestIterationId)) {
    return failCheckpoint('best iteration is missing');
  }
  return Object.freeze({
    schema: FIRST_RENDER_ITERATION_HISTORY_SCHEMA,
    sourceContractSha256: route.sourceContractSha256,
    routeSha256: adaptiveRouteRecordSha256(route),
    iterations: Object.freeze(iterations),
    bestIterationId,
  });
}

export function readFirstRenderIterationHistory(
  root: string,
  route: AdaptiveRouteRecord,
): FirstRenderIterationHistory {
  const path = firstRenderHistoryPath(route);
  if (!existsSync(resolve(root, path))) return emptyHistory(route);
  return parseHistory(JSON.parse(
    readContainedRegularFile(root, path, 'first-render iteration history').toString('utf8'),
  ), route);
}

export function appendFirstRenderIteration(input: Readonly<{
  root: string;
  route: AdaptiveRouteRecord;
  checkpointSha256: string;
  reportSha256: string;
  captures: readonly FirstRenderCaptureBinding[];
  invocation: ProjectRunInvocation;
}>): FirstRenderIteration {
  const history = readFirstRenderIterationHistory(input.root, input.route);
  const checkpointSha256 = checkpointDigest(input.checkpointSha256, 'iteration checkpoint');
  const reportSha256 = checkpointDigest(input.reportSha256, 'iteration report');
  const captures = parseCheckpointCaptures(input.captures);
  const latest = history.iterations.at(-1);
  // Recapturing unchanged source and pixels is the same iteration, not a new attempt.
  // A fresh slot would discard the existing judgment and re-ask the reviewer.
  if (latest !== undefined && latest.checkpointSha256 === checkpointSha256
    && latest.reportSha256 === reportSha256 && canonicalJson(latest.captures) === canonicalJson(captures)) {
    return latest;
  }
  const iteration: FirstRenderIteration = Object.freeze({
    id: String(history.iterations.length + 1),
    checkpointSha256,
    reportSha256,
    captures,
    reviewSha256: null,
    decision: null,
    progress: null,
    findingIds: Object.freeze([]),
  });
  replaceProjectFileAtomically({
    projectRoot: input.root,
    relativePath: firstRenderHistoryPath(input.route),
    content: canonicalJson({ ...history, iterations: [...history.iterations, iteration] }),
    invocation: input.invocation,
  });
  return iteration;
}

export function firstRenderIterationForReport(
  root: string,
  route: AdaptiveRouteRecord,
  reportSha256: string,
): FirstRenderIteration | null {
  return [...readFirstRenderIterationHistory(root, route).iterations]
    .reverse().find(iteration => iteration.reportSha256 === reportSha256) ?? null;
}

export function firstRenderReviewMatchesCurrentRoute(
  root: string,
  route: AdaptiveRouteRecord,
  review: Readonly<{ routeSha256: string | null; sha256: string }>,
): boolean {
  const current = readFirstRenderIterationHistory(root, route).iterations.at(-1) ?? null;
  return review.routeSha256 === adaptiveRouteRecordSha256(route)
    && current?.reviewSha256 === review.sha256;
}

export function previousFirstRenderIteration(
  root: string,
  route: AdaptiveRouteRecord,
  reportSha256: string,
): FirstRenderIteration | null {
  const history = readFirstRenderIterationHistory(root, route);
  const index = history.iterations.findLastIndex(iteration => iteration.reportSha256 === reportSha256);
  return index > 0 ? history.iterations[index - 1] ?? null : null;
}

/** The previous entry pair, then that iteration's below-the-fold section frames so lower-section progress can be judged. */
export function firstRenderIterationRenders(root: string, iteration: FirstRenderIteration, role: 'previous-iteration') {
  const sections = (firstRenderMotionProjection(root, iteration.reportSha256)?.renders ?? [])
    .flatMap(render => render.role === 'scroll-section'
      ? [{ ...render, role: 'previous-scroll-section' as const }] : []);
  const entry = iteration.captures.map(capture => {
    const path = `.omd/first-render/captures/${capture.captureSha256}.png`;
    const bytes = readContainedRegularFile(root, path, 'first-render iteration capture');
    if (sha256(bytes) !== capture.captureSha256) return failCheckpoint('iteration capture digest changed');
    return {
      role,
      viewport: capture.viewport,
      width: capture.viewport === 'desktop' ? 1280 : 390,
      height: capture.viewport === 'desktop' ? 900 : 844,
      captureSha256: capture.captureSha256,
      pngBase64: bytes.toString('base64'),
    };
  });
  return [...entry, ...sections];
}

const pickBest = (iterations: readonly FirstRenderIteration[]): string | null =>
  iterations.filter(iteration => iteration.decision === 'retain').at(-1)?.id
  ?? iterations.filter(iteration => iteration.reviewSha256 !== null
    && iteration.progress !== 'regressed').at(-1)?.id
  ?? null;

/**
 * Work a later finish boundary demanded is not rolled back: while the route requires motion, an iteration
 * whose rendered page does not move enough is not a restore target as long as one that does has been reviewed.
 */
function bestIterationId(root: string, route: AdaptiveRouteRecord, iterations: readonly FirstRenderIteration[]): string | null {
  if (!motionRequired(route as Parameters<typeof motionRequired>[0])) return pickBest(iterations);
  const moving = iterations.filter(iteration => {
    const timeline = firstRenderMotionProjection(root, iteration.reportSha256)?.context.timeline;
    return timeline !== undefined && motionShortfall(timeline) === null;
  });
  return pickBest(moving) ?? pickBest(iterations);
}

export function recordFirstRenderIterationReview(input: Readonly<{
  root: string;
  route: AdaptiveRouteRecord;
  reportSha256: string;
  reviewSha256: string;
  decision: 'retain' | 'revise' | 'reframe';
  progress: FirstRenderProgress | null;
  findingIds: readonly string[];
  invocation: ProjectRunInvocation;
}>): FirstRenderIterationHistory {
  const history = readFirstRenderIterationHistory(input.root, input.route);
  let current = history.iterations;
  let index = current.findLastIndex(iteration =>
    iteration.reportSha256 === input.reportSha256 && iteration.reviewSha256 === null);
  if (index < 0) {
    // Changed review context (feedback or originals) can re-judge identical pixels.
    // Only the current (latest) report may be re-judged; a historical report never becomes current.
    const source = current.at(-1);
    if (source === undefined || source.reportSha256 !== input.reportSha256) {
      return failCheckpoint('current iteration is missing or already reviewed');
    }
    current = [...current, Object.freeze({ ...source, id: String(current.length + 1),
      reviewSha256: null, decision: null, progress: null, findingIds: Object.freeze([]) })];
    index = current.length - 1;
  }
  const iterations = current.map((iteration, iterationIndex): FirstRenderIteration =>
    iterationIndex === index ? Object.freeze({
      ...iteration,
      reviewSha256: checkpointDigest(input.reviewSha256, 'iteration review'),
      decision: input.decision,
      progress: input.progress?.verdict ?? null,
      findingIds: Object.freeze([...input.findingIds]),
    }) : iteration);
  const next = Object.freeze({ ...history, iterations: Object.freeze(iterations),
    bestIterationId: bestIterationId(input.root, input.route, iterations) });
  replaceProjectFileAtomically({
    projectRoot: input.root,
    relativePath: firstRenderHistoryPath(input.route),
    content: canonicalJson(next),
    invocation: input.invocation,
  });
  return next;
}

