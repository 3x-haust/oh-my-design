import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { collectSelectedReferenceOriginals, referenceFidelityExpectations, referenceFidelityRequired } from '../runtime/native-reference-fidelity.ts';
import { getNativePiRun, isNativePiInvocation } from '../runtime/native-pi-run.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { runPiCandidateReferenceReviewer } from '../../adapters/pi-reviewer-runtime.ts';
import { piParse } from '../../adapters/pi-reviewer-contract.ts';
import { captureCandidateSelection } from './candidate-visual.ts';
import { CANDIDATE_SELECTION_POINTER_PATH, resolveCandidateSelection, type CandidateSelectionPointer } from './candidate-selection.ts';
import {
  CANDIDATE_REFERENCE_REVIEW_HANDBACK, CANDIDATE_REFERENCE_REVIEW_TASK, CANDIDATE_REFERENCE_REVIEW_TRANSPORT,
  candidateReferenceBindings, parseCandidateReferenceReview,
} from './candidate-reference-contract.ts';
import {
  CANDIDATE_REFERENCE_HISTORY_BASE as BASE, CANDIDATE_REFERENCE_HISTORY_SCHEMA as SCHEMA,
  readCandidateReferenceHistory, type CandidateReferencePriorReview,
} from './candidate-reference-history.ts';

const fail = (reason: string): never => { throw new Error(`CANDIDATE_REFERENCE_REVIEW_INVALID:${reason}`); };
const bytesAt = (root: string, path: string) => readContainedRegularFile(root, path, 'candidate reference review');
const reviewPath = (directory: string) => `${BASE}/current/${directory}.json`;
const applies = (root: string, invocation: ProjectRunInvocation) =>
  isNativePiInvocation(invocation) && referenceFidelityRequired(readPersistedRoute(root, invocation).strategy);

export function candidateReferenceReviewPacket(root: string, invocation: ProjectRunInvocation, pointer: CandidateSelectionPointer) {
  resolveCandidateSelection(root, pointer);
  if (pointer.visual === undefined) return fail('paired candidate renders required');
  const route = readPersistedRoute(root, invocation);
  const originals = collectSelectedReferenceOriginals(root);
  const renders = pointer.visual.renders.map((capture, index) => ({
    role: 'first-party-candidate', viewport: index % 2 === 0 ? 'desktop' as const : 'mobile' as const,
    state: capture.state ?? 'initial', route: capture.route ?? null,
    width: capture.viewport.width, height: capture.viewport.height,
    captureSha256: capture.sha256, pngBase64: bytesAt(root, capture.path).toString('base64'),
  }));
  const expectations = referenceFidelityExpectations(originals, renders);
  const context = { request: route.sourceContract.request, taskOutcome: route.sourceContract.taskOutcome,
    designAxes: route.sourceContract.designAxes };
  const referenceSha256 = sha256(canonicalJson({ originals, context }));
  const candidateSha256 = sha256(canonicalJson(pointer));
  const previous = readCandidateReferenceHistory(root, pointer.directory);
  const sameContext = previous && previous.bindings.buildSha256 === invocation.current.buildSha256
    && previous.bindings.briefSha256 === invocation.current.briefSha256
    && previous.bindings.referenceSha256 === referenceSha256;
  const priorReview: CandidateReferencePriorReview | null = !sameContext ? null
    : previous.bindings.candidateSha256 === candidateSha256 ? previous.priorReview
      : { sha256: previous.sha256, assessments: previous.assessments, repairCriteria: previous.repairCriteria };
  const evidence = { context, renders, referenceRenders: originals, referenceFidelityExpectations: expectations,
    priorReview,
    ...(pointer.captureStates === undefined ? {} : { captureStates: pointer.captureStates }) };
  const bindings = candidateReferenceBindings({
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    evidenceSha256: sha256(canonicalJson(evidence)),
    browserSha256: sha256(canonicalJson(renders.map(({ pngBase64: _bytes, ...row }) => row))),
    candidateSha256, referenceSha256,
  });
  const packet = Buffer.from(canonicalJson({
    schema: CANDIDATE_REFERENCE_REVIEW_TRANSPORT, evidenceSha256: bindings.evidenceSha256, evidence,
    outputContract: {
      lane: 'candidateFidelity', schema: CANDIDATE_REFERENCE_REVIEW_HANDBACK, fixedBindings: bindings,
      responseTemplate: {
        schema: CANDIDATE_REFERENCE_REVIEW_HANDBACK, fixedBindings: bindings, decision: null,
        referenceFidelityAssessments: originals.flatMap(original => ['desktop', 'mobile'].map(viewport => ({
          slotId: original.slotId, referenceSha256: original.sha256, viewport,
          targetCaptureSha256: null, verdict: null, recognizable: false, sourceVisualCharacter: null,
          targetVisualCharacter: null, preservedTraits: [], departures: [], rationale: null,
        }))),
        repairCriteria: [], continuity: [],
      },
      decisions: ['retain', 'revise'], assessmentVerdicts: ['pass', 'fail', 'insufficient'],
      departureKeys: ['sourceTrait', 'targetTreatment', 'destinationConstraint', 'rationale'],
      repairKeys: ['slotId', 'viewport', 'observation', 'repairCriterion'],
      continuityKeys: ['slotId', 'viewport', 'previousCaptureSha256', 'currentCaptureSha256', 'disposition', 'observation'],
      continuityRule: 'For every priorReview assessment, bind its exact previous capture and current counterpart. Use preserved for pass to pass, resolved for nonpass to pass, regressed for pass to nonpass, unresolved for nonpass to nonpass. Explain the current visible evidence and prior repair criterion. With no priorReview return an empty continuity array.',
      assessmentFieldTypes: { recognizable: 'boolean' },
      counterpartRule: 'For each selected slot and viewport, choose exactly one matching targetCaptureSha256 from referenceFidelityExpectations. States are alternatives, not a requirement that every state imitate every source. Use state/route metadata and the actual visible pixels. If no supplied state establishes correspondence, report insufficient with recognizable:false; this does not establish that unseen pixels are poor.',
    },
  }));
  const visualSha256 = sha256(canonicalJson([...new Set(renders.map(render =>
    `${render.viewport}:${render.captureSha256}`))].sort()));
  return { packet, bindings, expectations, visualSha256, priorReview };
}

function readReview(root: string, directory: string, prepared: ReturnType<typeof candidateReferenceReviewPacket>) {
  const record = readCandidateReferenceHistory(root, directory);
  if (record === null) return null;
  const bindings = record.bindings;
  if (bindings.buildSha256 !== prepared.bindings.buildSha256
    || bindings.briefSha256 !== prepared.bindings.briefSha256
    || record.visualSha256 !== prepared.visualSha256
    || bindings.referenceSha256 !== prepared.bindings.referenceSha256) return null;
  if (bindings.candidateSha256 === prepared.bindings.candidateSha256
    && record.packetSha256 !== sha256(prepared.packet)) return fail('review execution');
  if (record.decision === 'retain' && (bindings.candidateSha256 !== prepared.bindings.candidateSha256
    || bindings.evidenceSha256 !== prepared.bindings.evidenceSha256
    || bindings.browserSha256 !== prepared.bindings.browserSha256)) return null;
  return record;
}

export function checkCandidateReferenceReview(root: string, invocation: ProjectRunInvocation, pointer: CandidateSelectionPointer): void {
  if (!applies(root, invocation)) return;
  const current = readReview(root, pointer.directory, candidateReferenceReviewPacket(root, invocation, pointer));
  if (current?.decision !== 'retain') throw new Error('CANDIDATE_REFERENCE_REVIEW_REQUIRED: select a current visually faithful candidate');
}

export async function runCandidateReferenceReview(
  root: string, invocation: ProjectRunInvocation, pointer: CandidateSelectionPointer, signal?: AbortSignal,
) {
  const run = getNativePiRun(invocation, root);
  const prepared = candidateReferenceReviewPacket(root, invocation, pointer);
  const cached = readReview(root, pointer.directory, prepared);
  if (cached !== null) return cached;
  const roleResult = await runPiCandidateReferenceReviewer({
    root, invocation, packet: prepared.packet, ...(signal === undefined ? {} : { signal }),
  });
  const verified = verifySignedPiEyeRoleResult(roleResult, root);
  if (verified.receipt.taskSha256 !== sha256(CANDIDATE_REFERENCE_REVIEW_TASK)
    || verified.receipt.reviewerEvidence.packetSha256 !== sha256(prepared.packet)
    || verified.receipt.reviewerEvidence.evidenceSha256 !== prepared.bindings.evidenceSha256
    || verified.receipt.provider !== run.host.provider || verified.receipt.model !== run.host.model) return fail('execution binding');
  const release = acquireProjectMutationLock(root, invocation);
  try {
    if (!prepared.packet.equals(candidateReferenceReviewPacket(root, invocation, pointer).packet)) return fail('evidence changed during review');
    const record = { schema: SCHEMA, bindings: prepared.bindings, packetSha256: sha256(prepared.packet),
      visualSha256: prepared.visualSha256, expectations: prepared.expectations,
      priorReview: prepared.priorReview, roleResult };
    const bytes = Buffer.from(canonicalJson({ ...record,
      signature: signNativeObservation(root, SCHEMA, sha256(canonicalJson(record))) }));
    const writer = createProjectWriteAdapter(root, invocation);
    writer.writeContentAddressed(`${BASE}/records/${sha256(bytes)}.json`, bytes);
    // Preserve authenticated invalid handbacks for privileged diagnosis, never as approval.
    const result = parseCandidateReferenceReview(piParse(verified.finalMessage, 'candidate-handback'),
      prepared.bindings, prepared.expectations, prepared.priorReview?.assessments ?? []);
    writer.write(reviewPath(pointer.directory), bytes);
    return { ...result, sha256: sha256(bytes) };
  } finally { release(); }
}

export async function selectReviewedCandidate(
  root: string, invocation: ProjectRunInvocation, pointer: CandidateSelectionPointer, signal?: AbortSignal,
) {
  const writer = createProjectWriteAdapter(root, invocation);
  const captured = await captureCandidateSelection(root, pointer, writer);
  const review = applies(root, invocation) ? await runCandidateReferenceReview(root, invocation, captured, signal) : null;
  if (review?.decision === 'revise') throw new Error(`CANDIDATE_REFERENCE_REPAIR_REQUIRED:${JSON.stringify({
    decision: review.decision, repairCriteria: review.repairCriteria, continuity: review.continuity,
  })}`);
  const release = acquireProjectMutationLock(root, invocation);
  try {
    resolveCandidateSelection(root, captured);
    checkCandidateReferenceReview(root, invocation, captured);
    writer.mkdir('.omd/.cache/sketches');
    writer.write(CANDIDATE_SELECTION_POINTER_PATH, `${JSON.stringify(captured, null, 2)}\n`);
  } finally { release(); }
  return { path: CANDIDATE_SELECTION_POINTER_PATH, directory: pointer.directory,
    ...(review === null ? {} : { referenceReview: { decision: review.decision, sha256: review.sha256 } }) };
}
