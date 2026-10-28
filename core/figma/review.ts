import { createHash } from 'node:crypto';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { runPiFigmaFidelityReviewer } from '../../adapters/pi-reviewer-runtime.ts';
import { piParse } from '../../adapters/pi-reviewer-contract.ts';
import {
  FIGMA_FIDELITY_REVIEW_TASK,
  parseFigmaFidelityReview,
} from './review-contract.ts';
import {
  nextFigmaFixHistory,
  prepareFigmaReview,
} from './review-evidence.ts';
import {
  figmaReviewRecordBytes,
} from './review-record.ts';
import {
  FIGMA_FIDELITY_REVIEW_SCHEMA,
  FIGMA_FIX_STUCK_ROUNDS,
  figmaFidelityReviewPath,
  figmaReviewFail,
  type FigmaFidelityReviewRecordBody,
  type FigmaFidelityReviewResult,
} from './review-types.ts';

export * from './review-types.ts';
export { readFigmaFidelityReview } from './review-record.ts';

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function figmaFidelityReviewPacket(
  root: string,
  invocation: ProjectRunInvocation,
  frameId: string,
): Buffer {
  return prepareFigmaReview(root, invocation, frameId).packet;
}

export async function runFigmaFidelityReview(
  root: string,
  frameId: string,
  invocation: ProjectRunInvocation,
  signal?: AbortSignal,
): Promise<FigmaFidelityReviewResult> {
  const run = getNativePiRun(invocation, root);
  const prepared = prepareFigmaReview(run.projectRoot, invocation, frameId);
  const roleResult = await runPiFigmaFidelityReviewer({
    root: run.projectRoot, invocation, packet: prepared.packet,
    ...(signal === undefined ? {} : { signal }),
  });
  const verified = verifySignedPiEyeRoleResult(roleResult, run.projectRoot);
  if (verified.receipt.taskSha256 !== sha256(FIGMA_FIDELITY_REVIEW_TASK)
    || verified.receipt.reviewerEvidence.packetSha256 !== sha256(prepared.packet)
    || verified.receipt.reviewerEvidence.evidenceSha256 !== prepared.bindings.evidenceSha256
    || verified.receipt.provider !== run.host.provider || verified.receipt.model !== run.host.model) {
    return figmaReviewFail('review execution binding');
  }
  const review = parseFigmaFidelityReview(
    piParse(verified.finalMessage, 'figma-fidelity-handback'),
    prepared.bindings,
    prepared.compare.regions,
    prepared.previous?.review.fixes ?? [],
  );
  const history = nextFigmaFixHistory(prepared.previous, review, prepared.compareSha256);
  const release = acquireProjectMutationLock(run.projectRoot, invocation);
  try {
    if (!prepareFigmaReview(run.projectRoot, invocation, frameId).packet.equals(prepared.packet)) {
      return figmaReviewFail('evidence changed during review');
    }
    const body: FigmaFidelityReviewRecordBody = {
      schema: FIGMA_FIDELITY_REVIEW_SCHEMA, frameId, safeId: frameId.replaceAll(/[:/]/g, '_'),
      diffSha256: prepared.diffSha256, compareSha256: prepared.compareSha256,
      previousReviewSha256: prepared.previous?.sha256 ?? null, bindings: prepared.bindings,
      packetSha256: sha256(prepared.packet), review, history, roleResult,
    };
    const bytes = figmaReviewRecordBytes(run.projectRoot, body);
    const path = figmaFidelityReviewPath(frameId);
    createProjectWriteAdapter(run.projectRoot, invocation).write(path, bytes);
    return {
      path, sha256: sha256(bytes), verdict: review.verdict,
      fixes: review.fixes, priorFixes: review.priorFixes,
      stuckFixes: history.at(-1)?.unresolved.filter(item => item.count >= FIGMA_FIX_STUCK_ROUNDS) ?? [],
    };
  } finally { release(); }
}

