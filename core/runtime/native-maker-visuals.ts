import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { makerFail, type MakerInput } from '../../adapters/pi-maker-contract.ts';
import { piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { readSelectedSourceStudy } from '../art-direction/source-study-records.ts';
import { CANDIDATE_SELECTION_POINTER_PATH, resolveCandidateSelection, validateCandidateSelectionPointer } from '../brief/candidate-selection.ts';
import { readCurrentCandidateSelection } from '../brief/candidate-choice.ts';
import { CANDIDATE_REVIEW_FEEDBACK_PATH, readCandidateReviewFeedback, readCurrentCandidateReviewFeedback } from '../brief/candidate-review.ts';
import { readCandidateReferenceHistory } from '../brief/candidate-reference-history.ts';
import { baselineRenders, readFirstRenderReview } from '../design/first-render-review.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import type { RouteRecord } from '../route/index.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { getNativePiRun, requireNativePiPayload } from './native-pi-run.ts';
import { verifySignedPiEyeRoleResult } from './pi-role-receipt.ts';
import type { MakerDocument } from './native-maker-context.ts';
import { materializeProjectTree } from '../render/serve.ts';
import { makerEvaluationLineage } from './native-maker-evaluation.ts';
import { selectedReferenceMakerProjection } from './native-maker-reference-images.ts';
import { readConfidenceDebt } from '../brief/confidence-debt.ts';
import { measuredSlopRepairInput } from '../slop/measured-review.ts';
import { qualitativeFeedbackProjection } from '../design/qualitative-feedback.ts';

export type MakerRender = Readonly<{
  role: string; path: string; captureSha256: string; width: number; height: number; pngBase64: string;
}>;
export function makerVisuals(input: Readonly<{
  root: string; invocation: ProjectRunInvocation; route: RouteRecord; maker: MakerInput;
}>) {
  const { root, invocation, route, maker } = input;
  const documents: MakerDocument[] = [];
  const renders: MakerRender[] = [];
  const lineage: unknown[] = [];
  const feedback = qualitativeFeedbackProjection(root, sha256(route.request));
  if (feedback !== null) {
    lineage.push({ kind: 'reported-qualitative-feedback', ...feedback.context });
    for (const render of feedback.renders) renders.push({
      ...render, path: `.omd/qualitative-feedback/images/${render.captureSha256}.png`,
    });
  }
  let candidateSelectionSha256: string | null = null;
  const bytesAt = (path: string) => readContainedRegularFile(root, path, 'maker first-party material');
  const image = (file: Readonly<{ path: string; sha256: string }>, role: string): void => {
    const bytes = bytesAt(file.path);
    if (sha256(bytes) !== file.sha256) makerFail('first-party-image-drift');
    if (['first-party-browser-execution', 'first-party-measured-repair'].includes(role)
      && renders.some(render => render.role === role && render.captureSha256 === file.sha256)) return;
    const png = PNG.sync.read(bytes);
    renders.push({ role, path: file.path, captureSha256: file.sha256,
      width: png.width, height: png.height, pngBase64: bytes.toString('base64') });
  };
  const selectedReferences = selectedReferenceMakerProjection(root, route, maker);
  documents.push(...selectedReferences.documents);
  renders.push(...selectedReferences.renders);
  lineage.push(...selectedReferences.lineage);
  const choiceFeedback = (candidateId: string): void => {
    if (!existsSync(join(root, CANDIDATE_REVIEW_FEEDBACK_PATH))) return;
    const feedback = readCandidateReviewFeedback(root, getNativePiRun(invocation, root).runId,
      route.sourceContractSha256, candidateId);
    if (feedback === null) return;
    lineage.push({ kind: 'prior-candidate-review', reviewSha256: feedback.receipt.sha256,
      observation: feedback.observation });
    for (const preview of feedback.previews) {
      if (!renders.some(render => render.captureSha256 === preview.png.sha256)) image(preview.png, 'first-party-candidate-review-baseline');
    }
  };
  if (maker.role === 'omd-sketch' && maker.candidateId !== null) choiceFeedback(maker.candidateId);
  if (maker.role === 'omd-sketch' && route.strategy.methods.includes('provisional-source-study')) {
    const study = readSelectedSourceStudy(root, invocation);
    documents.push({ path: study.html.path, content: bytesAt(study.html.path).toString('utf8') });
    for (const render of study.renders) image(render, 'selected-first-party-study');
    lineage.push({ kind: 'provisional-study', selectionSha256: study.sha256,
      unresolvedConstraints: study.unresolvedConstraints });
  }
  const deferredCandidate = maker.role === 'omd-hand'
    && route.strategy.stages.includes('candidate-generation')
    && route.sourceContract.processPolicy !== undefined
    && lstatSync(join(root, CANDIDATE_SELECTION_POINTER_PATH), { throwIfNoEntry: false }) === undefined
    && readCurrentCandidateReviewFeedback(root, getNativePiRun(invocation, root).runId,
      route.sourceContractSha256) === null
    && readConfidenceDebt(root, route.sourceContractSha256).some(item => item.stage === 'candidate-generation');
  if (deferredCandidate) lineage.push({ kind: 'candidate-exploration-deferred', claim: 'not-verified' });
  if (maker.role === 'omd-hand' && route.strategy.stages.includes('candidate-generation') && !deferredCandidate) {
    const pointer = validateCandidateSelectionPointer(JSON.parse(bytesAt(CANDIDATE_SELECTION_POINTER_PATH).toString('utf8')));
    candidateSelectionSha256 = sha256(canonicalJson(pointer));
    resolveCandidateSelection(root, pointer);
    const selected = 'selection' in pointer ? readCurrentCandidateSelection(root) : undefined;
    if (!('selection' in pointer) && pointer.visual === undefined) makerFail('selected-candidate-images-required');
    const directory = 'selection' in pointer
      ? `.omd/.cache/sketches/${selected!.selectedId}`
      : `.omd/.cache/sketches/${pointer.directory}`;
    const entry = 'selection' in pointer ? selected!.selectedSource.path : `${directory}/index.html`;
    const tree = materializeProjectTree(root, entry);
    for (const [path, bytes] of tree.files) {
      if (/\.(?:html|css|[cm]?[jt]sx?|svg)$/.test(path)) {
        documents.push({ path: `${directory}/${path}`, content: bytes.toString('utf8') });
      }
    }
    if ('selection' in pointer) {
      for (const preview of selected!.previews) image(preview.png, 'selected-first-party-candidate');
      choiceFeedback(selected!.selectedId);
      lineage.push({ kind: 'selected-direction', selectionSha256: pointer.selection.sha256,
        selectedId: selected!.selectedId, decidedBy: selected!.decision.decidedBy,
        inputDigest: selected!.inputDigest });
    } else {
      for (const render of pointer.visual!.renders) image(render, 'selected-first-party-candidate');
      const review = readCandidateReferenceHistory(root, pointer.directory);
      if (review !== null) lineage.push({ kind: 'selected-candidate-review', sha256: review.sha256,
        bindings: review.bindings, repairCriteria: review.repairCriteria, continuity: review.continuity,
        previousReviewSha256: review.priorReview?.sha256 ?? null });
    }
  }
  if (maker.candidateId !== null) {
    const review = readCandidateReferenceHistory(root, maker.candidateId);
    if (review !== null) {
      const counterparts = review.assessments.map(assessment => ({
        slotId: assessment.slotId, viewport: assessment.viewport,
        targetCaptureSha256: assessment.targetCaptureSha256,
        targetVisualCharacter: assessment.targetVisualCharacter, verdict: assessment.verdict,
      }));
      lineage.push({ kind: 'candidate-repair', sha256: review.sha256,
        bindings: review.bindings, repairCriteria: review.repairCriteria, continuity: review.continuity,
        counterparts, previousReviewSha256: review.priorReview?.sha256 ?? null });
      for (const { targetCaptureSha256 } of counterparts) {
        if (renders.some(render => render.captureSha256 === targetCaptureSha256)) continue;
        image({ path: `.omd/.cache/candidate-renders/${targetCaptureSha256}.png`, sha256: targetCaptureSha256 },
          'first-party-candidate-repair-baseline');
      }
    }
  }
  const first = readFirstRenderReview(root);
  if (existsSync(join(root, '.omd/first-render/review.json')) && first === null) makerFail('first-render-lineage-upgrade-required');
  if (first !== null) {
    if (first.bindings.buildSha256 !== invocation.current.buildSha256
      || first.bindings.briefSha256 !== invocation.current.briefSha256) makerFail('first-render-lineage-stale');
    lineage.push({ kind: 'first-render', sha256: first.sha256, bindings: first.bindings,
      decision: first.decision, findings: first.findings, qualityAssessments: first.qualityAssessments,
      resolvedFindings: first.resolvedFindings, baselines: first.baselines });
    const captures = [...first.captures, ...baselineRenders(root, first.baselines, first.findings)];
    for (const capture of captures) {
      if (renders.some(render => render.captureSha256 === capture.captureSha256)) continue;
      image({ path: `.omd/first-render/captures/${capture.captureSha256}.png`, sha256: capture.captureSha256 },
        'first-party-repair-baseline');
    }
  }
  for (const execution of makerEvaluationLineage(root, invocation)) {
    lineage.push(execution);
    for (const capture of execution.captures) image(capture, 'first-party-browser-execution');
  }
  if (maker.role === 'omd-hand') {
    const measured = measuredSlopRepairInput(root);
    if (measured !== null) {
      lineage.push({ kind: 'measured-slop', ...measured.lineage });
      for (const capture of measured.captures) image(capture.capture, 'first-party-measured-repair');
    }
  }
  // Project the authenticated current evaluator attempt, including rejected lanes, never its raw file.
  const finalPath = '.omd/final-review/native-current.json';
  if (existsSync(join(root, finalPath))) {
    const bytes = bytesAt(finalPath);
    requireNativePiPayload(invocation, root, 'final-reviewer-lane', bytes);
    const current = piRecord(JSON.parse(bytes.toString('utf8')), 'maker-final-lineage');
    if (current.schema === 'native-pi-final-review-pending-v1') makerFail('final-review-in-progress');
    const attempt = piRecord(current.attempt, 'maker-review-attempt');
    const attemptPath = piText(attempt.path, 'maker-review-attempt-path');
    if (!/^\.omd\/final-review\/attempts\/sha256-[a-f0-9]{64}\.json$/.test(attemptPath)) makerFail('review-attempt-path');
    const attemptBytes = bytesAt(attemptPath);
    if (sha256(attemptBytes) !== attempt.sha256) makerFail('review-attempt-drift');
    const record = piRecord(JSON.parse(attemptBytes.toString('utf8')), 'maker-review-attempt');
    if (!Array.isArray(record.results)) makerFail('review-attempt-results');
    const results = record.results.map(value => {
      const lane = piRecord(value, 'maker-review-lane');
      if (!Array.isArray(lane.roleResults)) return makerFail('review-role-results');
      return { lane: lane.lane, reviews: lane.roleResults.map(value => {
        const verified = verifySignedPiEyeRoleResult(value, root);
        if (verified.receipt.buildSha256 !== invocation.current.buildSha256
          || verified.receipt.briefSha256 !== invocation.current.briefSha256) makerFail('final-lineage-stale');
        const review = piRecord(JSON.parse(verified.finalMessage), 'maker-review-handback');
        return { transcriptSha256: verified.receipt.transcriptSha256,
          evidence: verified.receipt.reviewerEvidence,
          ...Object.fromEntries(['findings', 'verdicts', 'criticalFloors', 'qualityAssessments',
            'outcomeAssessments', 'referenceFidelityAssessments'].filter(key => review[key] !== undefined)
            .map(key => [key, review[key]])) };
      }) };
    });
    lineage.push({ kind: 'final-review', pointerSha256: sha256(bytes), attemptSha256: attempt.sha256,
      status: current.schema, results, failures: record.failures });
  }
  return { documents, renders, lineage, candidateSelectionSha256, firstRenderReviewSha256: first?.sha256 ?? null };
}
