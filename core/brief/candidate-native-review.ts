import { PNG } from 'pngjs';
import { runPiCandidateChoiceReviewer } from '../../adapters/pi-reviewer-runtime.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter, replaceProjectFileAtomically } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { candidateDirectionState, currentCandidateReview, publishCandidateSelection } from './candidate-choice.ts';
import { verifyDirectionAutonomyGrant } from './candidate-authority.ts';
import { CANDIDATE_QUALITY_AXES, CANDIDATE_REVIEW_FEEDBACK_PATH, candidateReviewPayload, parseCandidateEyeReview, readCandidateReviewFeedback } from './candidate-review.ts';
import { CANDIDATE_CHOICE_HANDBACK, CANDIDATE_CHOICE_TASK, CANDIDATE_CHOICE_TRANSPORT } from './candidate-choice-contract.ts';
import * as v from './candidate-data.ts';

function prepare(root: string, invocation: ProjectRunInvocation) {
  const current = currentCandidateReview(root, invocation);
  const policy = current.route.sourceContract.processPolicy;
  if (policy?.interactionMode !== 'autonomous' || policy.autonomyGrant === null) {
    return v.fail('independent harness choice requires authenticated autonomous design authority');
  }
  verifyDirectionAutonomyGrant(root, policy.autonomyGrant, current.route.request);
  const renders = current.packet.candidates.flatMap(candidate => candidate.previews.map(preview => {
    const bytes = v.readReceipt(root, preview.png), png = PNG.sync.read(bytes);
    return { role: 'candidate-option', alias: candidate.alias, viewId: preview.viewId,
      width: png.width, height: png.height, captureSha256: preview.png.sha256, pngBase64: bytes.toString('base64') };
  }));
  const referenceRenders = current.packet.references.kind === 'reference-free' ? [] : current.packet.references.originals.map(original => {
    const bytes = v.readReceipt(root, original.png), png = PNG.sync.read(bytes);
    return { role: original.role, label: original.label, referenceId: original.referenceId,
      width: png.width, height: png.height, captureSha256: original.png.sha256, pngBase64: bytes.toString('base64') };
  });
  const evidence = { context: { request: current.route.request, task: current.packet.task },
    renders, referenceRenders,
    referenceGuidance: current.packet.references.kind === 'reference-free' ? current.packet.references : {
      kind: current.packet.references.kind, handoffSha256: current.packet.references.handoffSha256,
      analysis: current.packet.references.analysis, guidance: current.packet.references.guidance,
    },
    candidates: current.packet.candidates.map(candidate => ({
      alias: candidate.alias, viewIds: candidate.previews.map(view => view.viewId),
    })) };
  const bindings = { buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    evidenceSha256: v.digest(evidence),
    browserSha256: v.digest([...renders, ...referenceRenders].map(({ pngBase64: _pixels, ...image }) => image)),
    candidatePacketSha256: current.pointer.packet.sha256, inputDigest: current.packet.inputDigest,
    sourceContractSha256: current.route.sourceContractSha256 };
  const packet = Buffer.from(canonicalJson({
    schema: CANDIDATE_CHOICE_TRANSPORT, evidenceSha256: bindings.evidenceSha256, evidence,
    outputContract: {
      lane: 'candidateChoice', schema: CANDIDATE_CHOICE_HANDBACK, fixedBindings: bindings,
      responseTemplate: { schema: CANDIDATE_CHOICE_HANDBACK, fixedBindings: bindings,
        observations: current.packet.candidates.map(candidate => ({
          alias: candidate.alias, feasibility: null, structureRelationship: null, densityTypeFit: null,
          responsiveFit: null,
          qualityAssessments: candidate.previews.flatMap(preview => CANDIDATE_QUALITY_AXES.map(axis => ({
            axis, viewId: preview.viewId, verdict: null, observation: null, consequence: null,
          }))),
          findings: [],
        })), winner: null, limitations: [] },
      feasibility: ['pass', 'fail', 'unassessed'],
      qualityAxes: CANDIDATE_QUALITY_AXES,
      qualityVerdicts: ['pass', 'fail', 'unassessed'],
      findingFields: ['viewId', 'region', 'consequence', 'blocking'],
    },
  }));
  return { ...current, packetBytes: packet, bindings, autonomyGrant: policy.autonomyGrant };
}

export async function runNativeCandidateChoice(root: string, invocation: ProjectRunInvocation, signal?: AbortSignal) {
  const run = getNativePiRun(invocation, root), prepared = prepare(root, invocation);
  const writer = createProjectWriteAdapter(root, invocation);
  const publishChoice = (review: v.Receipt, selectedId: string | null) => {
    if (selectedId === null) return { status: 'no-feasible-direction' as const, review, selection: null };
    const selection = publishCandidateSelection(root, {
      schema: 'candidate-selection-input-v2', candidateSet: prepared.pointer.candidateSet,
      selectedId, inputDigest: prepared.packet.inputDigest,
      decision: { decidedBy: 'agent', autonomyGrant: prepared.autonomyGrant,
        eyeReview: review, reviewIndependence: 'isolated' },
    }, writer, invocation);
    return { status: 'selected' as const, review, selection };
  };
  const first = prepared.pointer.aliases[0] ?? v.fail('candidate set is empty');
  const feedback = readCandidateReviewFeedback(root, run.runId, prepared.route.sourceContractSha256, first.id);
  const current = candidateDirectionState(root);
  if (current.selection !== null) return { status: 'selected' as const, selection: current.selection };
  if (feedback !== null) {
    const cached = parseCandidateEyeReview(JSON.parse(v.readReceipt(root, feedback.receipt).toString('utf8')));
    if (v.digest(cached.packet) === v.digest(prepared.pointer.packet)) {
      return publishChoice(feedback.receipt, cached.winner === null ? null
        : prepared.pointer.aliases.find(row => row.alias === cached.winner)?.id ?? v.fail('cached winner is unknown'));
    }
  }
  const roleResult = await runPiCandidateChoiceReviewer({
    root, invocation, packet: prepared.packetBytes, ...(signal === undefined ? {} : { signal }),
  });
  const verified = verifySignedPiEyeRoleResult(roleResult, root);
  if (verified.receipt.taskSha256 !== v.hash(CANDIDATE_CHOICE_TASK)
    || verified.receipt.reviewerEvidence.packetSha256 !== v.hash(prepared.packetBytes)
    || verified.receipt.reviewerEvidence.evidenceSha256 !== prepared.bindings.evidenceSha256
    || verified.receipt.provider !== run.host.provider || verified.receipt.model !== run.host.model) {
    return v.fail('candidate choice reviewer execution does not bind this packet and host');
  }
  let reviewReceipt: v.Receipt;
  let selectedId: string | null;
  const unlock = acquireProjectMutationLock(root, invocation);
  try {
    if (!prepared.packetBytes.equals(prepare(root, invocation).packetBytes)) v.fail('candidate evidence changed during review');
    const rawResult = v.publishRecord(writer, '.omd/.cache/sketches/review-results', roleResult);
    const rejection = { schema: 'native-candidate-feedback-rejection-v1', runId: run.runId,
      sourceContractSha256: prepared.route.sourceContractSha256, plan: prepared.plan,
      packet: prepared.pointer.packet, rawResult, aliases: prepared.pointer.aliases };
    replaceProjectFileAtomically({ projectRoot: root, invocation,
      relativePath: CANDIDATE_REVIEW_FEEDBACK_PATH,
      content: v.jsonBytes({ ...rejection,
        signature: signNativeObservation(root, 'native-candidate-feedback-rejection-v1', v.digest(rejection)) }) });
    const answer = v.object(JSON.parse(verified.finalMessage), ['schema', 'fixedBindings', 'observations', 'winner', 'limitations']);
    if (answer.schema !== CANDIDATE_CHOICE_HANDBACK || canonicalJson(answer.fixedBindings) !== canonicalJson(prepared.bindings)) {
      v.fail('candidate choice handback bindings changed');
    }
    const parsed = parseCandidateEyeReview({
      schema: 'candidate-eye-review-v2', packet: prepared.pointer.packet,
      observations: answer.observations, winner: answer.winner, limitations: answer.limitations,
      execution: { kind: 'isolated', launchId: verified.receipt.roleNonce, outputSha256: v.hash(verified.finalMessage) },
      attestation: { kind: 'native-observation-v1', payloadSha256: v.hash(verified.finalMessage),
        signature: roleResult.authority.signature },
    });
    if (parsed.schema !== 'candidate-eye-review-v2'
      || v.digest(parsed.observations.map(row => row.alias).sort()) !== v.digest(prepared.packet.candidates.map(row => row.alias).sort())) {
      v.fail('candidate reviewer must cover every anonymous option');
    }
    for (const observation of parsed.observations) {
      const candidate = prepared.packet.candidates.find(row => row.alias === observation.alias);
      if (!candidate || observation.findings.some(finding => !candidate.previews.some(view => view.viewId === finding.viewId))) {
        v.fail('candidate reviewer cites an unknown view');
      }
      const expected = candidate.previews.flatMap(view => CANDIDATE_QUALITY_AXES.map(axis => `${axis}:${view.viewId}`)).sort();
      const actual = observation.qualityAssessments.map(assessment => `${assessment.axis}:${assessment.viewId}`).sort();
      if (v.digest(actual) !== v.digest(expected)) v.fail('candidate reviewer must judge every quality axis for every supplied view');
    }
    const winner = parsed.observations.find(row => row.alias === parsed.winner);
    if (parsed.winner !== null && (!winner || winner.feasibility !== 'pass'
      || winner.findings.some(finding => finding.blocking)
      || winner.qualityAssessments.some(assessment => assessment.verdict !== 'pass'))) {
      v.fail('candidate reviewer winner lacks complete independent visual qualification');
    }
    selectedId = parsed.winner === null ? null
      : prepared.pointer.aliases.find(row => row.alias === parsed.winner)?.id ?? v.fail('candidate reviewer winner is unknown');
    const payload = candidateReviewPayload(parsed), payloadSha256 = v.digest(payload);
    reviewReceipt = v.publishRecord(writer, '.omd/.cache/sketches/reviews', {
      ...payload, attestation: { kind: 'native-observation-v1', payloadSha256,
        signature: signNativeObservation(root, 'candidate-eye-review-v2', payloadSha256) },
    });
    const feedback = { schema: 'native-candidate-feedback-v2', runId: run.runId,
      sourceContractSha256: prepared.route.sourceContractSha256, plan: prepared.plan,
      packet: prepared.pointer.packet, review: reviewReceipt, aliases: prepared.pointer.aliases };
    replaceProjectFileAtomically({ projectRoot: root, invocation,
      relativePath: CANDIDATE_REVIEW_FEEDBACK_PATH,
      content: v.jsonBytes({ ...feedback,
        signature: signNativeObservation(root, 'native-candidate-feedback-v2', v.digest(feedback)) }) });
  } finally { unlock(); }
  return publishChoice(reviewReceipt, selectedId);
}
