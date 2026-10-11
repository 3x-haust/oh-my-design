import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { CANDIDATE_SELECTION_POINTER_PATH, resolveCandidateSelection, validateCandidateSelectionPointer } from '../brief/candidate-selection.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readDesignJudgment } from './judgment-files.ts';
import { checkFirstRenderEvidence } from './first-render-evidence.ts';
import { runPiFirstRenderReviewer } from '../../adapters/pi-reviewer-runtime.ts';
import { piDigest, piParse, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { DESIGN_QUALITY_AXES } from '../evidence/final-v2-design-quality.ts';
import { firstRenderActiveBaselines, parseFirstRenderBaselines, FIRST_RENDER_VIEWPORTS,
  type FirstRenderBaseline } from './first-render-baseline.ts';
import {
  FIRST_RENDER_REVIEW_HANDBACK, FIRST_RENDER_REVIEW_TASK, FIRST_RENDER_REVIEW_TRANSPORT,
  FIRST_RENDER_REPAIR_SCOPES, FirstRenderReviewError, parseFirstRenderReview, parseFirstRenderCaptures,
  parseFirstRenderFindings, type FirstRenderFinding, type FirstRenderReview,
  type FirstRenderReviewBindings,
} from './first-render-review-contract.ts';

export const FIRST_RENDER_REVIEW_PATH = '.omd/first-render/review.json';
const SCHEMA = 'first-render-review-v3';
const fail = (reason: string): never => { throw new FirstRenderReviewError(reason); };
const bytesAt = (root: string, path: string) => readContainedRegularFile(root, path, 'first render review');
const fields = (value: unknown): FirstRenderReviewBindings => {
  const row = piRecord(value, 'first-render-bindings');
  return {
    buildSha256: piDigest(row.buildSha256, 'build'), briefSha256: piDigest(row.briefSha256, 'brief'),
    evidenceSha256: piDigest(row.evidenceSha256, 'evidence'), browserSha256: piDigest(row.browserSha256, 'browser'),
    captureReportSha256: piDigest(row.captureReportSha256, 'capture-report'),
    previousReviewSha256: row.previousReviewSha256 === null ? null : piDigest(row.previousReviewSha256, 'previous-review'),
    ...(row.candidateTargetSha256 === undefined ? {} : { candidateTargetSha256: piDigest(row.candidateTargetSha256, 'candidate-target') }),
  };
};

function candidateTarget(root: string) {
  if (!existsSync(join(root, CANDIDATE_SELECTION_POINTER_PATH))) return null;
  const pointer = validateCandidateSelectionPointer(piParse(
    bytesAt(root, CANDIDATE_SELECTION_POINTER_PATH).toString('utf8'), 'candidate-target'));
  resolveCandidateSelection(root, pointer);
  if (pointer.visual === undefined) return fail('selected candidate needs both approved visual targets');
  return {
    sha256: sha256(canonicalJson(pointer)),
    renders: pointer.visual.renders.slice(0, 2).map((render, index) => ({
      role: 'selected-first-party-target', viewport: index === 0 ? 'desktop' : 'mobile',
      width: render.viewport.width, height: render.viewport.height, captureSha256: render.sha256,
      pngBase64: bytesAt(root, render.path).toString('base64'),
    })),
  };
}

function readReviewRecord(root: string, path: string) {
  const bytes = bytesAt(root, path);
  const { signature, ...record } = piRecord(piParse(bytes.toString('utf8'), 'first-render-review-json'), 'first-render-review-record');
  const digest = sha256(bytes);
  const schema = record.schema;
  if ((schema !== SCHEMA && schema !== 'first-render-review-v2' && schema !== 'first-render-review-v1') || !bytes.equals(bytesAt(root, `.omd/first-render/reviews/${digest}.json`))
    || !verifyNativeObservation(root, schema, sha256(canonicalJson(record)), piText(signature, 'review-signature'))) {
    return fail('review record changed');
  }
  if (schema !== SCHEMA) return null;
  const bindings = fields(record.bindings);
  const captures = parseFirstRenderCaptures(record.captures);
  const prior = parseFirstRenderFindings(record.priorCriteria);
  const priorBaselines = parseFirstRenderBaselines(record.priorBaselines, prior);
  const role = verifySignedPiEyeRoleResult(record.roleResult, root);
  const result = parseFirstRenderReview(piParse(role.finalMessage, 'review-handback'), bindings, prior, captures);
  if (role.receipt.taskSha256 !== sha256(FIRST_RENDER_REVIEW_TASK)
    || role.receipt.buildSha256 !== bindings.buildSha256 || role.receipt.briefSha256 !== bindings.briefSha256
    || role.receipt.reviewerEvidence.evidenceSha256 !== bindings.evidenceSha256
    || role.receipt.reviewerEvidence.packetSha256 !== record.packetSha256) return fail('review authority');
  const baselines = firstRenderActiveBaselines(result.findings, priorBaselines, { sha256: digest, captures });
  return { ...result, sha256: digest, packetSha256: piDigest(record.packetSha256, 'packet-sha'),
    bindings, captures, baselines };
}

export function readFirstRenderReview(root: string) {
  return existsSync(join(root, FIRST_RENDER_REVIEW_PATH)) ? readReviewRecord(root, FIRST_RENDER_REVIEW_PATH) : null;
}

export function baselineRenders(root: string, baselines: readonly FirstRenderBaseline[], findings: readonly FirstRenderFinding[]) {
  const captures = new Map<string, FirstRenderBaseline['captures'][number]>();
  const origins = new Map<string, ReturnType<typeof readReviewRecord>>();
  for (const baseline of baselines) {
    if (!origins.has(baseline.reviewSha256)) {
      origins.set(baseline.reviewSha256, readReviewRecord(root, `.omd/first-render/reviews/${baseline.reviewSha256}.json`));
    }
    const origin = origins.get(baseline.reviewSha256);
    const finding = findings.find(finding => finding.id === baseline.id);
    const original = origin?.findings.find(finding => finding.id === baseline.id);
    const originalBaseline = origin?.baselines.find(row => row.id === baseline.id);
    if (!origin || origin.sha256 !== baseline.reviewSha256 || !finding || !original || !originalBaseline
      || original.axis !== finding.axis || original.viewport !== finding.viewport
      || original.repairCriterion !== finding.repairCriterion
      || canonicalJson(originalBaseline) !== canonicalJson(baseline)) {
      return fail('baseline origin changed');
    }
    for (const capture of baseline.captures) captures.set(`${capture.viewport}/${capture.captureSha256}`, capture);
  }
  return [...captures.values()].map(capture => {
    const bytes = bytesAt(root, `.omd/first-render/captures/${capture.captureSha256}.png`);
    if (sha256(bytes) !== capture.captureSha256) return fail('baseline capture drift');
    return { ...capture, role: 'repair-baseline' as const, ...FIRST_RENDER_VIEWPORTS[capture.viewport],
      pngBase64: bytes.toString('base64') };
  });
}

function prepareFirstRenderReviewPacket(
  root: string,
  invocation: ProjectRunInvocation,
  previous: ReturnType<typeof readReviewRecord>,
) {
  const current = checkFirstRenderEvidence(root);
  if (current === null || current.schema !== 'first-render-check-v3') return fail('capture both fixed viewports first');
  const hypothesis = readDesignJudgment(root)?.hypothesis ?? fail('hypothesis missing');
  const captures: unknown = current.captures;
  if (!Array.isArray(captures) || captures.length !== 2) return fail('captures missing');
  const renders = captures.map((item, index) => {
    const capture = piRecord(item, 'first-render-capture');
    const bytes = bytesAt(root, piText(capture.path, 'capture-path'));
    const digest = piDigest(capture.sha256, 'capture-sha');
    if (sha256(bytes) !== digest) return fail('capture drift');
    return { viewport: index === 0 ? 'desktop' as const : 'mobile' as const, width: index === 0 ? 1280 : 390,
      height: index === 0 ? 900 : 844, captureSha256: digest, pngBase64: bytes.toString('base64') };
  });
  const priorCriteria: readonly FirstRenderFinding[] = previous?.findings ?? [];
  const priorBaselines = previous?.baselines ?? [];
  const priorRenders = baselineRenders(root, priorBaselines, priorCriteria);
  const target = candidateTarget(root);
  const evidence = { hypothesis, renders, priorCriteria, priorBaselines, priorRenders,
    ...(target === null ? {} : { referenceRenders: target.renders }),
    scope: 'early-representative-viewports-not-final' };
  const bindings: FirstRenderReviewBindings = {
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    evidenceSha256: sha256(canonicalJson(evidence)),
    browserSha256: sha256(canonicalJson(renders.map(({ pngBase64: _bytes, ...row }) => row))),
    captureReportSha256: piDigest(current.reportSha256, 'report-sha'),
    previousReviewSha256: previous?.sha256 ?? null,
    ...(target === null ? {} : { candidateTargetSha256: target.sha256 }),
  };
  const packet = Buffer.from(canonicalJson({
    schema: FIRST_RENDER_REVIEW_TRANSPORT, evidenceSha256: bindings.evidenceSha256, evidence,
    outputContract: {
      lane: 'firstRender', schema: FIRST_RENDER_REVIEW_HANDBACK, fixedBindings: bindings,
      responseTemplate: {
        schema: FIRST_RENDER_REVIEW_HANDBACK, fixedBindings: bindings, decision: null,
        qualityAssessments: DESIGN_QUALITY_AXES.flatMap(axis => renders.map(render => ({
          axis, viewport: render.viewport, captureSha256: render.captureSha256,
          verdict: null, observation: null, consequence: null,
        }))),
        findings: [], resolvedFindings: [],
      },
      requiredKeys: ['schema', 'fixedBindings', 'decision', 'qualityAssessments', 'findings', 'resolvedFindings'],
      decisions: ['retain', 'revise', 'reframe'],
      qualityAxes: DESIGN_QUALITY_AXES,
      qualityKeys: ['axis', 'viewport', 'captureSha256', 'verdict', 'observation', 'consequence'],
      qualityVerdicts: ['pass', 'fail', 'insufficient'],
      findingKeys: ['id', 'axis', 'repairScope', 'viewport', 'observation', 'consequence', 'repairCriterion'],
      repairScopes: FIRST_RENDER_REPAIR_SCOPES,
      resolutionKeys: ['id', 'evidence'],
      resolutionEvidenceKeys: ['viewport', 'captureSha256', 'observation'],
      qualityViewports: ['desktop', 'mobile'],
      findingViewports: ['desktop', 'mobile', 'both'],
      rules: 'Assess all six quality axes in each current viewport. Each fail or insufficient needs a finding on that axis and viewport; pass cannot carry a finding. Direction or composition repair requires reframe. Other repairs require revise. Retain requires every axis to pass. Resolve each prior id with current capture-bound observations for its viewport or both, or preserve its id, axis, viewport and repair criterion as a finding.',
    },
  }));
  return { packet, bindings, priorCriteria, priorBaselines,
    captures: renders.map(({ viewport, captureSha256 }) => ({ viewport, captureSha256 })) };
}

export function firstRenderReviewPacket(root: string, invocation: ProjectRunInvocation) {
  return prepareFirstRenderReviewPacket(root, invocation, readFirstRenderReview(root));
}

export function requireRetainedFirstRenderReview(root: string, invocation: ProjectRunInvocation) {
  const review = readFirstRenderReview(root);
  if (review === null) return fail('current retained review is missing');
  if (review.decision !== 'retain') return fail('current review decision must retain');
  const previous = review.bindings.previousReviewSha256 === null ? null
    : readReviewRecord(root, `.omd/first-render/reviews/${review.bindings.previousReviewSha256}.json`);
  if (previous !== null && previous.sha256 !== review.bindings.previousReviewSha256) {
    return fail('previous review binding changed');
  }
  const prepared = prepareFirstRenderReviewPacket(root, invocation, previous);
  if (canonicalJson(review.bindings) !== canonicalJson(prepared.bindings)
    || review.packetSha256 !== sha256(prepared.packet)) return fail('current review evidence changed');
  return review;
}

export async function runFirstRenderReview(root: string, invocation: ProjectRunInvocation, signal?: AbortSignal) {
  const run = getNativePiRun(invocation, root);
  const previous = readFirstRenderReview(run.projectRoot);
  const capture = checkFirstRenderEvidence(run.projectRoot);
  const target = candidateTarget(run.projectRoot);
  const next = (review: FirstRenderReview) => {
    const owners = { direction: 'coordinator', composition: 'omd-composer', type: 'omd-typesetter',
      copy: 'omd-copywriter', surface: 'omd-hand' } as const;
    return { next: review.decision === 'retain' ? 'continue-selected-production'
      : review.decision === 'revise' ? 'repair-rebuild-recapture'
        : review.findings.some(finding => finding.repairScope === 'direction')
          ? 'return-to-visual-direction-owner' : 'return-to-composition-owner',
    repairOwners: [...new Set(review.findings.map(finding => owners[finding.repairScope]))] };
  };
  if (previous && previous.bindings.captureReportSha256 === capture?.reportSha256
    && previous.bindings.buildSha256 === invocation.current.buildSha256
    && previous.bindings.briefSha256 === invocation.current.briefSha256
    && previous.bindings.candidateTargetSha256 === target?.sha256) {
    return { ...previous, path: FIRST_RENDER_REVIEW_PATH, ...next(previous) };
  }
  const prepared = firstRenderReviewPacket(run.projectRoot, invocation);
  const roleResult = await runPiFirstRenderReviewer({
    root: run.projectRoot, invocation, packet: prepared.packet,
    ...(signal === undefined ? {} : { signal }),
  });
  const verified = verifySignedPiEyeRoleResult(roleResult, run.projectRoot);
  if (verified.receipt.taskSha256 !== sha256(FIRST_RENDER_REVIEW_TASK)
    || verified.receipt.reviewerEvidence.packetSha256 !== sha256(prepared.packet)
    || verified.receipt.reviewerEvidence.evidenceSha256 !== prepared.bindings.evidenceSha256
    || verified.receipt.provider !== run.host.provider || verified.receipt.model !== run.host.model) return fail('review execution binding');
  const release = acquireProjectMutationLock(run.projectRoot, invocation);
  try {
    if (!prepared.packet.equals(firstRenderReviewPacket(run.projectRoot, invocation).packet)) return fail('evidence changed during review');
    const record = { schema: SCHEMA, bindings: prepared.bindings, packetSha256: sha256(prepared.packet),
      priorCriteria: prepared.priorCriteria, priorBaselines: prepared.priorBaselines, captures: prepared.captures, roleResult };
    const bytes = Buffer.from(canonicalJson({ ...record,
      signature: signNativeObservation(run.projectRoot, SCHEMA, sha256(canonicalJson(record))) }));
    const writer = createProjectWriteAdapter(run.projectRoot, invocation);
    writer.writeContentAddressed(`.omd/first-render/reviews/${sha256(bytes)}.json`, bytes);
    const review = parseFirstRenderReview(piParse(verified.finalMessage, 'first-render-handback'),
      prepared.bindings, prepared.priorCriteria, prepared.captures);
    writer.write(FIRST_RENDER_REVIEW_PATH, bytes);
    return { ...review, path: FIRST_RENDER_REVIEW_PATH, sha256: sha256(bytes),
      ...next(review) };
  } finally { release(); }
}
