import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { firstRenderContext } from './first-render-context.ts';
import { qualitativeFeedbackProjection } from './qualitative-feedback.ts';
import { consultedReferenceProjection } from './consulted-references.ts';
import { consultedDesignerCases } from './designer-cases.ts';
import { designerJudgmentProjection } from './designer-judgments.ts';
import { firstRenderMotionProjection } from './first-render-motion.ts';
import { attestedJudgmentIds, firstRenderTemplateTells } from './first-render-template-tells.ts';
import { motionRequired } from './new-surface-advisories.ts';
import { readDesignBrief } from './design-brief.ts';
import { ideaImages, pageIdeaPreview } from './idea-image.ts';
import { MAX_BROKERED_EVIDENCE_BYTES } from '../runtime/evidence-proxy.ts';
import { pageBasicsTells, proofShowsOutput, readPageBasics } from './page-basics.ts';
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
  LEGACY_FIRST_RENDER_REVIEW_HANDBACK_V6,
  LEGACY_FIRST_RENDER_REVIEW_HANDBACK_V7,
  JUDGMENT_CHECK_VERDICTS,
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
const SCHEMA = 'first-render-review-v8';
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
    ...(row.designerCasesSha256 === undefined ? {} : { designerCasesSha256: piDigest(row.designerCasesSha256, 'designer-cases') }),
    ...(row.designerJudgmentsSha256 === undefined ? {} : { designerJudgmentsSha256: piDigest(row.designerJudgmentsSha256, 'designer-judgments') }),
  };
};

function readReviewRecord(root: string, path: string) {
  const bytes = bytesAt(root, path);
  const { signature, ...record } = piRecord(piParse(bytes.toString('utf8'), 'first-render-review-json'), 'first-render-review-record');
  const digest = sha256(bytes);
  const schema = record.schema;
  if ((schema !== SCHEMA && schema !== 'first-render-review-v7' && schema !== 'first-render-review-v6' && schema !== 'first-render-review-v5' && schema !== 'first-render-review-v4' && schema !== 'first-render-review-v3' && schema !== 'first-render-review-v2' && schema !== 'first-render-review-v1') || !bytes.equals(bytesAt(root, `.omd/first-render/reviews/${digest}.json`))
    || !verifyNativeObservation(root, schema, sha256(canonicalJson(record)), piText(signature, 'review-signature'))) {
    return fail('review record changed');
  }
  if (schema !== SCHEMA && schema !== 'first-render-review-v7' && schema !== 'first-render-review-v6' && schema !== 'first-render-review-v5' && schema !== 'first-render-review-v4' && schema !== 'first-render-review-v3') return null;
  const iterationReview = schema === SCHEMA || schema === 'first-render-review-v7' || schema === 'first-render-review-v6';
  const bindings = fields(record.bindings);
  const captures = parseFirstRenderCaptures(record.captures);
  const prior = parseFirstRenderFindings(record.priorCriteria);
  const priorBaselines = parseFirstRenderBaselines(record.priorBaselines, prior);
  const role = verifySignedPiEyeRoleResult(record.roleResult, root);
  const legacy = schema === 'first-render-review-v3';
  const previousIterationCaptures = iterationReview && record.previousIterationCaptures !== null
    ? parseFirstRenderCaptures(record.previousIterationCaptures) : undefined;
  const references = legacy ? undefined : parseReferenceCaptures(record.referenceCaptures);
  const handbackSchema = legacy ? 'first-render-reviewer-handback-v2'
    : schema === 'first-render-review-v6' ? LEGACY_FIRST_RENDER_REVIEW_HANDBACK_V6
    : schema === 'first-render-review-v7' ? LEGACY_FIRST_RENDER_REVIEW_HANDBACK_V7
    : schema === SCHEMA ? FIRST_RENDER_REVIEW_HANDBACK : LEGACY_FIRST_RENDER_REVIEW_HANDBACK;
  const judgmentIds = schema === SCHEMA && Array.isArray(record.designerJudgmentIds)
    ? record.designerJudgmentIds.map(id => piText(id, 'designer-judgment-id')) : undefined;
  const result = parseFirstRenderReview(piParse(role.finalMessage, 'review-handback'), bindings, prior, captures,
    references, legacy, previousIterationCaptures, handbackSchema, judgmentIds);
  const routeSha256 = iterationReview
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

/** Context images left out, in this order, while the packet exceeds what the reviewer transport carries: the maker's
 * page ideas, reference states deferred to the final review, supplemental references, designer case renders. The
 * current, prior, previous-iteration, motion and feedback renders and the primary reference are evidence and stay. */
const TRANSPORT_SHED_LEVELS = 4;

function prepareFirstRenderReviewPacket(
  root: string,
  invocation: ProjectRunInvocation,
  previous: ReturnType<typeof readReviewRecord>,
): ReturnType<typeof preparePacket> {
  // Context, not evidence, gives way first: the review goes ahead without it rather than not at all.
  for (let shed = 0; ; shed++) {
    const prepared = preparePacket(root, invocation, previous, shed);
    if (prepared.packet.byteLength <= MAX_BROKERED_EVIDENCE_BYTES || shed === TRANSPORT_SHED_LEVELS) return prepared;
  }
}

function preparePacket(
  root: string,
  invocation: ProjectRunInvocation,
  previous: ReturnType<typeof readReviewRecord>,
  shed: number,
) {
  const current = checkFirstRenderEvidence(root, 'review', invocation);
  if (current === null || !['first-render-check-v3', 'first-render-check-v4'].includes(current.schema)) return fail('capture both fixed viewports first');
  const context = firstRenderContext(root, invocation);
  const feedback = qualitativeFeedbackProjection(root,
    existsSync(join(root, '.omd/route.json')) ? sha256(readPersistedRoute(root, invocation).request) : undefined, true);
  const consulted = consultedReferenceProjection(root,
    existsSync(join(root, '.omd/route.json')) ? sha256(readPersistedRoute(root, invocation).request) : undefined);
  const cases = consultedDesignerCases(root,
    existsSync(join(root, '.omd/route.json')) ? sha256(readPersistedRoute(root, invocation).request) : undefined);
  const judgments = designerJudgmentProjection();
  const brief = readDesignBrief(root);
  const motion = firstRenderMotionProjection(root, piDigest(current.reportSha256, 'report-sha'));
  const ideas = shed < 1 ? pageIdeaRenders(root) : [];
  const keptReference = (render: { state: string; referenceRole: string }) =>
    (shed < 2 || render.state === 'default') && (shed < 3 || render.referenceRole === 'primary');
  const referenceRenders = (consulted?.renders ?? []).filter(keptReference);
  const omittedReferences = (consulted?.renders ?? []).filter(render => !keptReference(render)).map(render => render.captureSha256);
  const omitCases = cases !== null && shed >= 4;
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
  const referenceCaptures = referenceRenders.filter(render => render.state === 'default')
    .map(({ captureSha256, referenceRole }) => ({ captureSha256, referenceRole }));
  const comparisons = referenceComparisonBindings(referenceCaptures, renders);
  const measurement = loadMeasurement(root, current.measurements[0]!);
  const landing = context.schema === 'model-led-first-render-context-v1' && motionRequired(readPersistedRoute(root, invocation));
  const tells = [...firstRenderTemplateTells(root, measurement, landing), ...pageBasicsTells(readPageBasics(root, current.reportSha256), proofShowsOutput(root))];
  const attested = attestedJudgmentIds(tells, judgments.judgments.map(judgment => judgment.id), landing);
  // The fixed captures are pixel-identical to a review that retained them (typically after motion was added): the
  // reviewer keeps that verdict for them and judges only what changed, instead of re-litigating the same pixels.
  const unchanged = previous?.decision === 'retain' && renders.every(render => previous.captures.some(capture =>
    capture.viewport === render.viewport && capture.captureSha256 === render.captureSha256));
  const evidence = { ...(context.schema === 'model-led-first-render-context-v1'
    ? { taskContext: context } : { hypothesis: context.hypothesis }), renders, priorCriteria, priorBaselines, priorRenders,
    ...(unchanged ? { unchangedSinceRetainedReview: { reviewSha256: previous!.sha256, captures: renders.map(({ viewport, captureSha256 }) => ({ viewport, captureSha256 })) } } : {}),
    measurementDiagnostics: measurement.findings,
    templateTells: tells,
    ...(cases === null ? {} : { designerCases: cases.context, ...(omitCases ? {} : { designerCaseRenders: cases.renders }) }),
    designerJudgments: judgments,
    ...(brief === null ? {} : { designBrief: brief }),
    ...(motion === null ? {} : { motion: motion.context, motionRenders: motion.renders }),
    ...(ideas.length ? { pageIdeas: ideas } : {}),
    ...(feedback === null ? {} : { reportedFeedback: feedback.context, feedbackRenders: feedback.renders }),
    ...(consulted === null ? {} : {
      consultedReferences: consulted.context,
      consultedReferenceRenders: referenceRenders,
      referenceComparisonScope: {
        productionState: 'default',
        deferredToFinal: consulted.renders.filter(render => render.state !== 'default')
          .map(({ captureSha256, component, state }) => ({ captureSha256, component, state })),
      },
    }),
    ...(omittedReferences.length || omitCases ? { transportOmissions: {
      consultedReferenceRenders: omittedReferences, designerCaseRenders: omitCases,
      reason: 'the complete packet exceeds the reviewer transport; these context images were left out and are not evidence for or against the page',
    } } : {}),
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
    ...(cases === null ? {} : { designerCasesSha256: cases.context.sha256 }),
    designerJudgmentsSha256: judgments.sha256,
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
        // Attested judgments are answered in writing, so their template already names a viewport to refine.
        judgmentChecks: judgments.judgments.map(judgment => ({
          judgmentId: judgment.id, verdict: null, viewport: attested.includes(judgment.id) ? 'both' : null, observation: null, findingIds: [],
        })),
      },
      requiredKeys: ['schema', 'fixedBindings', 'decision', 'qualityAssessments', 'findings', 'resolvedFindings',
        ...(previousIteration === null ? [] : ['progress']),
        ...(consulted === null ? [] : ['referenceComparisons']), 'judgmentChecks'],
      referenceComparisons: comparisons,
      judgmentCheckKeys: ['judgmentId', 'verdict', 'viewport', 'observation', 'findingIds'],
      judgmentCheckVerdicts: JUDGMENT_CHECK_VERDICTS,
      referenceComparisonKeys: ['viewport', 'captureSha256', 'referenceSha256', 'verdict', 'sourceIdentity', 'preservedTraits', 'departures', 'findingIds'],
      decisions: ['retain', 'revise', 'reframe'],
      qualityAxes: DESIGN_QUALITY_AXES,
      qualityKeys: ['axis', 'viewport', 'captureSha256', 'verdict', 'observation', 'consequence'],
      qualityVerdicts: ['pass', 'fail', 'insufficient'],
      findingKeys: ['id', 'axis', 'repairScope', 'viewport', 'observation', 'consequence', 'repairCriterion'],
      repairScopes: FIRST_RENDER_REPAIR_SCOPES,
      attestedJudgmentIds: attested,
      resolutionKeys: ['id', 'evidence'],
      resolutionTemplates: priorCriteria.map(finding => ({ id: finding.id,
        evidence: renders.filter(render => finding.viewport === 'both' || render.viewport === finding.viewport)
          .map(render => ({ viewport: render.viewport, captureSha256: render.captureSha256, observation: null })) })),
      resolutionEvidenceKeys: ['viewport', 'captureSha256', 'observation'],
      progressVerdicts: ['improved', 'same', 'regressed', 'different-not-better'],
      progressKeys: ['verdict', 'comparisons', 'findingIds'],
      progressComparisonKeys: ['viewport', 'previousCaptureSha256', 'currentCaptureSha256', 'observation'],
      qualityViewports: ['desktop', 'mobile'],
      findingViewports: ['desktop', 'mobile', 'both'],
      rules: 'Assess all six quality axes in each current viewport. Each fail or insufficient needs a finding on that axis and viewport; pass cannot carry a finding. Direction or composition repair requires reframe. Other repairs require revise. Retain requires every axis to pass. Resolve each prior id by copying its resolutionTemplates row (one evidence row per listed viewport) and filling every observation, or preserve its id, axis, viewport and repair criterion as a finding. When previousIterationRenders are supplied, progress is required with both previous/current capture bindings. progress.findingIds lists only ids present in the current findings array (empty when none remain); report resolved ids in resolvedFindings, not progress. Regressed requires at least one current localized finding id. Answer every designerJudgments id exactly once in judgmentChecks; violated lists the current finding ids that localize it, holds and not-applicable list none.',
    },
  }));
  return { packet, bindings, priorCriteria, priorBaselines, referenceCaptures, previousDecision: previous?.decision,
    judgmentIds: judgments.judgments.map(judgment => judgment.id), attestedJudgmentIds: attested,
    routeSha256: context.schema === 'model-led-first-render-context-v1' ? context.routeSha256 : null,
    currentIteration, previousIterationCaptures: previousIteration?.captures,
    captures: renders.map(({ viewport, captureSha256 }) => ({ viewport, captureSha256 })) };
}

/** The latest page idea of each section (up to four), with its prompt: the maker's drafts made before building. */
function pageIdeaRenders(root: string) {
  const latest = new Map<string, ReturnType<typeof ideaImages>[number]>();
  for (const idea of ideaImages(root).filter(idea => idea.kind === 'page')) latest.set(idea.path.replace(/-\d+\.png$/, ''), idea);
  return [...latest.values()].slice(-4).map(idea => {
    const source = readFileSync(join(root, idea.path)), bytes = pageIdeaPreview(source);
    return { role: 'page-idea' as const, path: idea.path, prompt: idea.prompt, sourceSha256: sha256(source), captureSha256: sha256(bytes), pngBase64: bytes.toString('base64') };
  });
}

export function firstRenderReviewPacket(root: string, invocation: ProjectRunInvocation) {
  return prepareFirstRenderReviewPacket(root, invocation, readCurrentFirstRenderReview(root, invocation));
}

/** The packet at one shedding level, whatever its size: lets tests reach the levels without 16 MB of images. */
export function firstRenderReviewPacketAtShedLevel(root: string, invocation: ProjectRunInvocation, shed: number) {
  return preparePacket(root, invocation, readCurrentFirstRenderReview(root, invocation), shed);
}

export function requireRetainedFirstRenderReview(root: string, invocation: ProjectRunInvocation) {
  const review = readFirstRenderReview(root);
  if (review === null) return fail('current retained review is missing');
  if (review.schema !== SCHEMA) return fail('current review generation is stale; run first-render check');
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
    && previous.bindings.designerCasesSha256 === consultedDesignerCases(root)?.context.sha256
    && previous.bindings.designerJudgmentsSha256 === designerJudgmentProjection().sha256
    && previous.bindings.reportedFeedbackSha256 === qualitativeFeedbackProjection(root)?.context.sha256) {
    return { ...previous, path: FIRST_RENDER_REVIEW_PATH, ...next(previous) };
  }
  const prepared = firstRenderReviewPacket(run.projectRoot, invocation);
  const roleResult = await runPiFirstRenderReviewer({
    root: run.projectRoot, invocation, packet: prepared.packet,
    // The same parser that publishes the review, so a refused answer can be corrected in session. Withdrawing a
    // retained verdict without calling the change a regression is questioned once here; a reviewer that keeps its
    // decision after that is answered by its own judgment, not overruled.
    validateHandback: text => { parseFirstRenderReview(piParse(text, 'first-render-handback'), prepared.bindings, prepared.priorCriteria,
      prepared.captures, prepared.referenceCaptures, false, prepared.previousIterationCaptures, FIRST_RENDER_REVIEW_HANDBACK, prepared.judgmentIds, prepared.attestedJudgmentIds,
      prepared.previousDecision); },
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
      designerJudgmentIds: prepared.judgmentIds,
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
      false, prepared.previousIterationCaptures, FIRST_RENDER_REVIEW_HANDBACK, prepared.judgmentIds, prepared.attestedJudgmentIds);
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
