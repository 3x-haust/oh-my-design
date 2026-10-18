import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { firstRenderContext } from './first-render-context.ts';
import { qualitativeFeedbackProjection } from './qualitative-feedback.ts';
import { consultedReferenceProjection } from './consulted-references.ts';
import { parseReferenceCaptures, referenceComparisonBindings } from './first-render-reference-comparison.ts';
import { readPersistedRoute } from '../route/index.ts';
import { checkFirstRenderEvidence } from './first-render-evidence.ts';
import { runPiFirstRenderReviewer } from '../../adapters/pi-reviewer-runtime.ts';
import { piDigest, piParse, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { DESIGN_QUALITY_AXES } from '../evidence/final-v2-design-quality.ts';
import { loadMeasurement } from '../measure/files.ts';
import { firstRenderActiveBaselines, parseFirstRenderBaselines, FIRST_RENDER_VIEWPORTS,
  type FirstRenderBaseline } from './first-render-baseline.ts';
import {
  FIRST_RENDER_REVIEW_HANDBACK, FIRST_RENDER_REVIEW_TASK, FIRST_RENDER_REVIEW_TRANSPORT,
  LEGACY_FIRST_RENDER_REVIEW_HANDBACK,
  FIRST_RENDER_REPAIR_SCOPES, FirstRenderReviewError, parseFirstRenderReview, parseFirstRenderCaptures,
  parseFirstRenderFindings, type FirstRenderFinding, type FirstRenderReview,
  type FirstRenderReviewBindings, firstRenderReviewTaskForSchema,
} from './first-render-review-contract.ts';
import {
  firstRenderIterationForReport,
  firstRenderIterationRenders,
  firstRenderLoopState,
  previousFirstRenderIteration,
  recordFirstRenderIterationReview,
  type FirstRenderLoopState,
} from './first-render-checkpoint.ts';

export const FIRST_RENDER_REVIEW_PATH = '.omd/first-render/review.json';
const SCHEMA = 'first-render-review-v6';
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
    ...(row.reportedFeedbackSha256 === undefined ? {} : { reportedFeedbackSha256: piDigest(row.reportedFeedbackSha256, 'reported-feedback') }),
    ...(row.consultedReferencesSha256 === undefined ? {} : { consultedReferencesSha256: piDigest(row.consultedReferencesSha256, 'consulted-references') }),
  };
};

function readReviewRecord(root: string, path: string) {
  const bytes = bytesAt(root, path);
  const { signature, ...record } = piRecord(piParse(bytes.toString('utf8'), 'first-render-review-json'), 'first-render-review-record');
  const digest = sha256(bytes);
  const schema = record.schema;
  if ((schema !== SCHEMA && schema !== 'first-render-review-v5' && schema !== 'first-render-review-v4' && schema !== 'first-render-review-v3' && schema !== 'first-render-review-v2' && schema !== 'first-render-review-v1') || !bytes.equals(bytesAt(root, `.omd/first-render/reviews/${digest}.json`))
    || !verifyNativeObservation(root, schema, sha256(canonicalJson(record)), piText(signature, 'review-signature'))) {
    return fail('review record changed');
  }
  if (schema !== SCHEMA && schema !== 'first-render-review-v5' && schema !== 'first-render-review-v4' && schema !== 'first-render-review-v3') return null;
  const bindings = fields(record.bindings);
  const captures = parseFirstRenderCaptures(record.captures);
  const prior = parseFirstRenderFindings(record.priorCriteria);
  const priorBaselines = parseFirstRenderBaselines(record.priorBaselines, prior);
  const role = verifySignedPiEyeRoleResult(record.roleResult, root);
  const legacy = schema === 'first-render-review-v3';
  const previousIterationCaptures = schema === SCHEMA && record.previousIterationCaptures !== null
    ? parseFirstRenderCaptures(record.previousIterationCaptures) : undefined;
  const references = legacy ? undefined : parseReferenceCaptures(record.referenceCaptures);
  const handbackSchema = legacy ? 'first-render-reviewer-handback-v2'
    : schema === SCHEMA ? FIRST_RENDER_REVIEW_HANDBACK : LEGACY_FIRST_RENDER_REVIEW_HANDBACK;
  const result = parseFirstRenderReview(piParse(role.finalMessage, 'review-handback'), bindings, prior, captures,
    references, legacy, previousIterationCaptures, handbackSchema);
  const routeSha256 = schema === SCHEMA
    ? record.routeSha256 === null ? null : piDigest(record.routeSha256, 'review-route')
    : null;
  const expectedTask = firstRenderReviewTaskForSchema(schema);
  if (expectedTask === null || role.receipt.taskSha256 !== sha256(expectedTask)
    || role.receipt.buildSha256 !== bindings.buildSha256 || role.receipt.briefSha256 !== bindings.briefSha256
    || role.receipt.reviewerEvidence.evidenceSha256 !== bindings.evidenceSha256
    || role.receipt.reviewerEvidence.packetSha256 !== record.packetSha256) return fail('review authority');
  const baselines = firstRenderActiveBaselines(result.findings, priorBaselines, { sha256: digest, captures });
  return { ...result, schema, sha256: digest, packetSha256: piDigest(record.packetSha256, 'packet-sha'),
    routeSha256,
    bindings, captures, baselines };
}

export function readFirstRenderReview(root: string) {
  return existsSync(join(root, FIRST_RENDER_REVIEW_PATH)) ? readReviewRecord(root, FIRST_RENDER_REVIEW_PATH) : null;
}

export function readCurrentFirstRenderReview(root: string, invocation: ProjectRunInvocation) {
  const review = readFirstRenderReview(root);
  if (review === null) return null;
  const context = firstRenderContext(root, invocation);
  return context.schema === 'model-led-first-render-context-v1'
    && review.routeSha256 !== context.routeSha256 ? null : review;
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
  const current = checkFirstRenderEvidence(root, 'review', invocation);
  if (current === null || !['first-render-check-v3', 'first-render-check-v4'].includes(current.schema)) return fail('capture both fixed viewports first');
  const context = firstRenderContext(root, invocation);
  const feedback = qualitativeFeedbackProjection(root,
    existsSync(join(root, '.omd/route.json')) ? sha256(readPersistedRoute(root, invocation).request) : undefined, true);
  const consulted = consultedReferenceProjection(root,
    existsSync(join(root, '.omd/route.json')) ? sha256(readPersistedRoute(root, invocation).request) : undefined);
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
  const referenceCaptures = (consulted?.renders ?? []).map(({ captureSha256, referenceRole }) => ({ captureSha256, referenceRole }));
  const comparisons = referenceComparisonBindings(referenceCaptures, renders);
  const measurement = loadMeasurement(root, current.measurements[0]!);
  const evidence = { ...(context.schema === 'model-led-first-render-context-v1'
    ? { taskContext: context } : { hypothesis: context.hypothesis }), renders, priorCriteria, priorBaselines, priorRenders,
    measurementDiagnostics: measurement.findings,
    ...(feedback === null ? {} : { reportedFeedback: feedback.context, feedbackRenders: feedback.renders }),
    ...(consulted === null ? {} : { consultedReferences: consulted.context, consultedReferenceRenders: consulted.renders }),
    scope: 'early-representative-viewports-not-final' };
  const route = context.schema === 'model-led-first-render-context-v1'
    ? readPersistedRoute(root, invocation) : null;
  const currentIteration = route === null ? null : firstRenderIterationForReport(root, route, current.reportSha256)
    ?? fail('current source checkpoint is missing');
  const previousIteration = route === null ? null : previousFirstRenderIteration(root, route, current.reportSha256);
  const previousIterationRenders = previousIteration === null ? undefined
    : firstRenderIterationRenders(root, previousIteration, 'previous-iteration');
  const completeEvidence = {
    ...evidence,
    ...(previousIterationRenders === undefined ? {} : { previousIterationRenders }),
  };
  const bindings: FirstRenderReviewBindings = {
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    evidenceSha256: sha256(canonicalJson(completeEvidence)),
    browserSha256: sha256(canonicalJson(renders.map(({ pngBase64: _bytes, ...row }) => row))),
    captureReportSha256: piDigest(current.reportSha256, 'report-sha'),
    previousReviewSha256: previous?.sha256 ?? null,
    ...(feedback === null ? {} : { reportedFeedbackSha256: feedback.context.sha256 }),
    ...(consulted === null ? {} : { consultedReferencesSha256: consulted.context.sha256 }),
  };
  const packet = Buffer.from(canonicalJson({
    schema: FIRST_RENDER_REVIEW_TRANSPORT, evidenceSha256: bindings.evidenceSha256, evidence: completeEvidence,
    outputContract: {
      lane: 'firstRender', schema: FIRST_RENDER_REVIEW_HANDBACK, fixedBindings: bindings,
      responseTemplate: {
        schema: FIRST_RENDER_REVIEW_HANDBACK, fixedBindings: bindings, decision: null,
        qualityAssessments: DESIGN_QUALITY_AXES.flatMap(axis => renders.map(render => ({
          axis, viewport: render.viewport, captureSha256: render.captureSha256,
          verdict: null, observation: null, consequence: null,
        }))),
        findings: [], resolvedFindings: [],
        ...(previousIteration === null ? {} : {
          progress: {
            verdict: null,
            comparisons: renders.map(render => ({
              viewport: render.viewport,
              previousCaptureSha256: previousIteration.captures
                .find(capture => capture.viewport === render.viewport)?.captureSha256 ?? null,
              currentCaptureSha256: render.captureSha256,
              observation: null,
            })),
            findingIds: [],
          },
        }),
        ...(consulted === null ? {} : { referenceComparisons: comparisons.map(binding => ({
          ...binding, verdict: null, sourceIdentity: null, preservedTraits: [], departures: [], findingIds: [],
        })) }),
      },
      requiredKeys: ['schema', 'fixedBindings', 'decision', 'qualityAssessments', 'findings', 'resolvedFindings',
        ...(previousIteration === null ? [] : ['progress']),
        ...(consulted === null ? [] : ['referenceComparisons'])],
      referenceComparisons: comparisons,
      referenceComparisonKeys: ['viewport', 'captureSha256', 'referenceSha256', 'verdict', 'sourceIdentity', 'preservedTraits', 'departures', 'findingIds'],
      decisions: ['retain', 'revise', 'reframe'],
      qualityAxes: DESIGN_QUALITY_AXES,
      qualityKeys: ['axis', 'viewport', 'captureSha256', 'verdict', 'observation', 'consequence'],
      qualityVerdicts: ['pass', 'fail', 'insufficient'],
      findingKeys: ['id', 'axis', 'repairScope', 'viewport', 'observation', 'consequence', 'repairCriterion'],
      repairScopes: FIRST_RENDER_REPAIR_SCOPES,
      resolutionKeys: ['id', 'evidence'],
      resolutionEvidenceKeys: ['viewport', 'captureSha256', 'observation'],
      progressVerdicts: ['improved', 'same', 'regressed', 'different-not-better'],
      progressKeys: ['verdict', 'comparisons', 'findingIds'],
      progressComparisonKeys: ['viewport', 'previousCaptureSha256', 'currentCaptureSha256', 'observation'],
      qualityViewports: ['desktop', 'mobile'],
      findingViewports: ['desktop', 'mobile', 'both'],
      rules: 'Assess all six quality axes in each current viewport. Each fail or insufficient needs a finding on that axis and viewport; pass cannot carry a finding. Direction or composition repair requires reframe. Other repairs require revise. Retain requires every axis to pass. Resolve each prior id with current capture-bound observations for its viewport or both, or preserve its id, axis, viewport and repair criterion as a finding. When previousIterationRenders are supplied, progress is required with both previous/current capture bindings. Regressed requires at least one current localized finding id.',
    },
  }));
  return { packet, bindings, priorCriteria, priorBaselines, referenceCaptures,
    routeSha256: context.schema === 'model-led-first-render-context-v1' ? context.routeSha256 : null,
    currentIteration, previousIterationCaptures: previousIteration?.captures,
    captures: renders.map(({ viewport, captureSha256 }) => ({ viewport, captureSha256 })) };
}

export function firstRenderReviewPacket(root: string, invocation: ProjectRunInvocation) {
  return prepareFirstRenderReviewPacket(root, invocation, readCurrentFirstRenderReview(root, invocation));
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
  const previous = readCurrentFirstRenderReview(run.projectRoot, invocation);
  const capture = checkFirstRenderEvidence(run.projectRoot, 'review', invocation);
  const context = firstRenderContext(run.projectRoot, invocation);
  const route = context.schema === 'model-led-first-render-context-v1'
    ? readPersistedRoute(run.projectRoot, invocation) : null;
  const next = (review: FirstRenderReview): Readonly<{
    next: string;
    repairOwners: readonly string[];
    loop: FirstRenderLoopState | null;
    bestIterationId: string | null;
    diagnostic?: Readonly<{ code: 'FIRST_RENDER_LOOP_STALLED' | 'FIRST_RENDER_REGRESSED'; message: string }>;
  }> => {
    if (route === null) {
      return {
        next: review.decision === 'retain' ? 'continue-selected-production' : 'repair-model-led-source-and-recapture',
        repairOwners: review.findings.length === 0 ? [] : ['coordinator'],
        loop: null,
        bestIterationId: null,
      };
    }
    const loop = firstRenderLoopState(run.projectRoot, route);
    const diagnostic = loop.stalled ? {
      code: 'FIRST_RENDER_LOOP_STALLED' as const,
      message: 'First-render repair is no longer demonstrating improvement. Restore the best iteration and report the remaining findings with both captures to the user instead of continuing the loop.',
    } : review.progress?.verdict === 'regressed' ? {
      code: 'FIRST_RENDER_REGRESSED' as const,
      message: 'The latest first-render review regressed. Restore the best iteration before trying a different approach.',
    } : null;
    return {
      next: loop.stalled || review.progress?.verdict === 'regressed'
        ? 'omd first-render restore --json'
        : review.decision === 'retain' ? 'continue-selected-production' : 'repair-model-led-source-and-recapture',
      repairOwners: review.findings.length === 0 ? [] : ['coordinator'],
      loop,
      bestIterationId: loop.bestIterationId,
      ...(diagnostic === null ? {} : { diagnostic }),
    };
  };
  const currentIteration = capture === null || route === null ? null
    : firstRenderIterationForReport(run.projectRoot, route, capture.reportSha256);
  if (previous && previous.schema === SCHEMA && previous.bindings.captureReportSha256 === capture?.reportSha256
    && (route === null || currentIteration?.reviewSha256 === previous.sha256)
    && previous.bindings.buildSha256 === invocation.current.buildSha256
    && previous.bindings.briefSha256 === invocation.current.briefSha256
    && previous.bindings.candidateTargetSha256 === undefined
    && previous.bindings.consultedReferencesSha256 === consultedReferenceProjection(root)?.context.sha256
    && previous.bindings.reportedFeedbackSha256 === qualitativeFeedbackProjection(root)?.context.sha256) {
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
      priorCriteria: prepared.priorCriteria, priorBaselines: prepared.priorBaselines, captures: prepared.captures,
      referenceCaptures: prepared.referenceCaptures,
      iterationId: prepared.currentIteration?.id ?? null,
      checkpointSha256: prepared.currentIteration?.checkpointSha256 ?? null,
      routeSha256: prepared.routeSha256,
      previousIterationCaptures: prepared.previousIterationCaptures ?? null,
      roleResult };
    const bytes = Buffer.from(canonicalJson({ ...record,
      signature: signNativeObservation(run.projectRoot, SCHEMA, sha256(canonicalJson(record))) }));
    const writer = createProjectWriteAdapter(run.projectRoot, invocation);
    writer.writeContentAddressed(`.omd/first-render/reviews/${sha256(bytes)}.json`, bytes);
    const review = parseFirstRenderReview(piParse(verified.finalMessage, 'first-render-handback'),
      prepared.bindings, prepared.priorCriteria, prepared.captures, prepared.referenceCaptures,
      false, prepared.previousIterationCaptures, FIRST_RENDER_REVIEW_HANDBACK);
    if (prepared.currentIteration !== null && route !== null) {
      recordFirstRenderIterationReview({
        root: run.projectRoot,
        route,
        reportSha256: prepared.bindings.captureReportSha256,
        reviewSha256: sha256(bytes),
        decision: review.decision,
        progress: review.progress,
        findingIds: review.findings.map(finding => finding.id),
        invocation,
      });
    }
    writer.write(FIRST_RENDER_REVIEW_PATH, bytes);
    return { ...review, path: FIRST_RENDER_REVIEW_PATH, sha256: sha256(bytes), captures: prepared.captures,
      routeSha256: prepared.routeSha256,
      ...next(review) };
  } finally { release(); }
}
