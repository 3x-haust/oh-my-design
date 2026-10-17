import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makerFail } from '../../adapters/pi-maker-contract.ts';
import { piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { CANDIDATE_SELECTION_POINTER_PATH, resolveCandidateSelection, validateCandidateSelectionPointer } from '../brief/candidate-selection.ts';
import { readCurrentCandidateSelection } from '../brief/candidate-choice.ts';
import { readFirstRenderReview } from '../design/first-render-review.ts';
import { readFrame } from '../frame/index.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute } from '../route/index.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { currentMakerSource } from './native-maker-state.ts';

/** Preserve old-target repair criteria; current-target approval is a separate question. */
export function nativeReframeWork(root: string, invocation: ProjectRunInvocation) {
  const review = readFirstRenderReview(root);
  if (review === null || review.decision !== 'reframe') return null;
  if (review.bindings.buildSha256 !== invocation.current.buildSha256
    || review.bindings.briefSha256 !== invocation.current.briefSha256) makerFail('reframe-lineage-stale');
  const route = readPersistedRoute(root, invocation);
  const repair = { reviewSha256: review.sha256, findings: review.findings, baselines: review.baselines };
  if (isModelLedProcess(route.sourceContract)) {
    const report = piRecord(JSON.parse(readContainedRegularFile(root,
      `.omd/first-render/reports/${review.bindings.captureReportSha256}.json`, 'model-led reframe report').toString('utf8')), 'model-led-reframe-report');
    return {
      stage: 'production' as const, owner: 'coordinator', action: 'repair-model-led-render',
      next: `omd first-render check --page ${JSON.stringify(piText(report.page, 'reframe-page'))} --json`,
      instruction: 'Repair direction/composition directly within the current production scope, rebuild and independently re-review against the preserved findings and failed baselines. No candidate competition, maker relay or design document is required. Behavior evaluation and completion remain refused until the reframe is resolved.',
      problems: ['NATIVE_REFRAME_REVIEW_REQUIRED'], repair,
    };
  }
  const candidateWork = {
    stage: 'candidate-generation' as const, owner: 'omd-sketch', action: 'author-reframe-candidate',
    next: 'omd schema native-maker --json',
    instruction: 'Repair current direction/composition through its owner, run a fresh Sketch maker with these unresolved criteria, then publish its selection with candidate select. Old target approval is not reframe resolution.',
    problems: ['NATIVE_REFRAME_CANDIDATE_REQUIRED'], repair,
  };
  if (!route.strategy.stages.includes('candidate-generation')) return {
    stage: 'production' as const, owner: 'coordinator', action: 'resolve-reframe-route',
    next: 'omd route show --json',
    instruction: 'Reconcile the independent reframe with the authorized route and its explicit stage skips through the existing route owner. No skipped stage is silently selected and no source write or evaluation resolves the reframe.',
    problems: ['NATIVE_REFRAME_ROUTE_REQUIRED'], repair,
  };
  if (!existsSync(join(root, CANDIDATE_SELECTION_POINTER_PATH))) return candidateWork;
  const read = (path: string) => readContainedRegularFile(root, path, 'native reframe lineage');
  const pointer = validateCandidateSelectionPointer(JSON.parse(read(CANDIDATE_SELECTION_POINTER_PATH).toString('utf8')));
  resolveCandidateSelection(root, pointer);
  const candidateId = 'selection' in pointer
    ? readCurrentCandidateSelection(root).selectedId
    : pointer.directory;
  const candidate = currentMakerSource(root, invocation, `sketch-${candidateId}`);
  const compositionSha256 = existsSync(join(root, '.omd/composition.md')) ? sha256(read('.omd/composition.md')) : null;
  if (candidate?.firstRenderReviewSha256 !== review.sha256 || candidate.compositionSha256 !== compositionSha256) return candidateWork;
  const hand = currentMakerSource(root, invocation, 'hand');
  if (hand?.firstRenderReviewSha256 !== review.sha256
    || hand.candidateSelectionSha256 !== sha256(canonicalJson(pointer))
    || hand.compositionSha256 !== compositionSha256) return {
    stage: 'production' as const, owner: 'omd-hand', action: 'author-reframe-production',
    next: 'omd schema native-maker --json',
    instruction: 'Run a fresh Hand maker against the newly selected candidate and preserved original-baseline repair criteria. It owns application source only.',
    problems: ['NATIVE_REFRAME_PRODUCTION_REQUIRED'], repair,
  };
  const report = piRecord(JSON.parse(read(`.omd/first-render/reports/${review.bindings.captureReportSha256}.json`).toString('utf8')), 'reframe-report');
  const page = readFrame(root)?.entrySurface?.entryPath ?? piText(report.page, 'reframe-page');
  const next = `omd first-render check --page ${JSON.stringify(page)} --json`;
  return {
    stage: 'production' as const, owner: 'coordinator', action: 'recapture-reframe',
    next,
    instruction: 'Build the maker output, capture both fixed viewports with the existing first-render publisher and obtain independent re-review. Lifecycle evaluation remains refused while reframe criteria are unresolved.',
    problems: ['NATIVE_REFRAME_REVIEW_REQUIRED'], repair,
    procedure: { read: 'omd pack protocol/native-pi-completion.md', steps: [next],
      limits: 'Fresh first-render capture and independent resolution are required before lifecycle evaluation.' },
  };
}

export function requireResolvedNativeReframe(root: string, invocation: ProjectRunInvocation): void {
  const work = nativeReframeWork(root, invocation);
  if (work !== null) makerFail(`NATIVE_REFRAME_UNRESOLVED:${work.action}; ${work.next}`);
}
