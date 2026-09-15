import { createHash } from 'node:crypto';

import { canonicalJson } from '../core/ref/board-artifacts.ts';
import {
  RENDERED_REFINEMENT_REVIEWER_TASK,
  renderedRefinementReviewerPacket,
} from '../core/runtime/rendered-refinement.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { verifySignedEyeRoleResult } from './final-reviewer-publication.ts';

const SHA256 = /^[a-f0-9]{64}$/;

type Artifact = Readonly<{ path: string; sha256: string; bytes: Buffer }>;
type Vote = Readonly<{
  reviewerId: string;
  winnerAlias: string | 'tie';
  remainingCriteria: readonly string[];
  findings: readonly string[];
}>;

export type RefinementReviewerPublication = Readonly<{
  review: Artifact;
  executions: readonly Artifact[];
}>;

export class RefinementReviewerPublicationError extends Error {
  override readonly name = 'RefinementReviewerPublicationError';
}

function fail(message: string): never {
  throw new RefinementReviewerPublicationError(`REFINEMENT_REVIEW_PUBLICATION_INVALID:${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(label);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(label);
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return fail(label);
  return value;
}

function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)
    || value.some((item) => typeof item !== 'string' || item.trim() === '' || item.length > 4096)
    || new Set(value).size !== value.length) fail(label);
  return Object.freeze([...value]) as readonly string[];
}

const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

/**
 * Preserves two independent Eye votes while binding both to one immutable rendered packet.
 * Rationale and findings may differ. A winner disagreement is retained as `disagreement`, which
 * the runtime can only reframe; it can never complete or roll back from split reviewer votes.
 */
export function buildRefinementReviewerPublication(
  input: unknown,
  context: Readonly<{
    projectRoot: string;
    buildSha256: string;
    briefSha256: string;
    publicKeyPath: string;
    invocation: ProjectRunInvocation;
  }>,
): RefinementReviewerPublication {
  const publication = record(input, 'publication');
  exact(publication, ['schema', 'roleResults'], 'publication');
  if (publication.schema !== 'adaptive-refinement-review-publication-v1'
    || !Array.isArray(publication.roleResults) || publication.roleResults.length !== 2) fail('publication');
  const roles = publication.roleResults.map((value) =>
    verifySignedEyeRoleResult(value, context.projectRoot, context.publicKeyPath));
  const identities = roles.map((role) => ({
    processPid: role.receipt.processPid,
    sessionId: role.receipt.sessionId,
    nonce: role.receipt.roleNonce,
    configurationSha256: role.receipt.configurationSha256,
  }));
  const evidenceProofs = roles.map((role, index) => {
    const proof = role.receipt.reviewerEvidence;
    if (proof === undefined || role.receipt.taskSha256 === undefined
      || proof.taskSha256 !== role.receipt.taskSha256
      || !SHA256.test(proof.evidenceSha256) || !SHA256.test(proof.packetSha256)) {
      fail(`roleResults[${index}] did not consume isolated reviewer evidence`);
    }
    return proof;
  });
  if (evidenceProofs[0]!.packetSha256 !== evidenceProofs[1]!.packetSha256) {
    fail('reviewers did not consume the same rendered packet');
  }
  const expectedTaskSha256 = hash(RENDERED_REFINEMENT_REVIEWER_TASK);
  if (roles.some((role) => role.receipt.taskSha256 !== expectedTaskSha256)
    || evidenceProofs.some((proof) => proof.taskSha256 !== expectedTaskSha256)) {
    fail('reviewers did not use the host-owned neutral comparison task');
  }
  const currentPacket = renderedRefinementReviewerPacket({ root: context.projectRoot, invocation: context.invocation });
  if (hash(currentPacket) !== evidenceProofs[0]!.packetSha256) fail('reviewers did not consume the current rendered packet');
  let packetValue: unknown;
  try { packetValue = JSON.parse(currentPacket.toString('utf8')) as unknown; } catch { return fail('current rendered packet'); }
  const packet = record(packetValue, 'current rendered packet');
  const outputContract = record(packet.outputContract, 'current rendered packet output contract');
  const allowedWinnerAliases = strings(outputContract.allowedWinnerAliases, 'current rendered packet aliases');
  if (allowedWinnerAliases.length !== 3 || !allowedWinnerAliases.includes('tie')
    || evidenceProofs.some((proof) => proof.evidenceSha256 !== packet.evidenceSha256)) {
    fail('reviewers did not consume the current rendered evidence');
  }
  if (new Set(identities.map(({ configurationSha256 }) => configurationSha256)).size !== 1
    || new Set(identities.flatMap(({ processPid, sessionId, nonce }) => [
      String(processPid), sessionId, nonce,
    ])).size !== 6) {
    fail('reviewer identities are reused');
  }
  const isolationSha256 = hash(canonicalJson(identities));
  const handbacks = roles.map((role, index) => {
    if (role.receipt.buildSha256 !== context.buildSha256
      || role.receipt.briefSha256 !== context.briefSha256) fail(`roleResults[${index}] binding`);
    let parsed: unknown;
    try { parsed = JSON.parse(role.finalMessage) as unknown; } catch { return fail(`handback[${index}]`); }
    const handback = record(parsed, `handback[${index}]`);
    exact(handback, [
      'schema', 'winnerAlias', 'evidenceSha256',
      'routeSha256', 'buildSha256', 'briefSha256', 'remainingCriteria', 'findings',
    ], `handback[${index}]`);
    if (handback.schema !== 'adaptive-refinement-reviewer-handback-v1'
      || (handback.winnerAlias !== 'tie'
        && (typeof handback.winnerAlias !== 'string' || !/^variant-[a-f0-9]{16}$/.test(handback.winnerAlias)))
      || handback.buildSha256 !== context.buildSha256
      || handback.briefSha256 !== context.briefSha256) fail(`handback[${index}] binding`);
    if (!allowedWinnerAliases.includes(String(handback.winnerAlias))) fail(`handback[${index}] alias`);
    return Object.freeze({
      winnerAlias: handback.winnerAlias as Vote['winnerAlias'],
      evidenceSha256: digest(handback.evidenceSha256, `handback[${index}].evidenceSha256`),
      routeSha256: digest(handback.routeSha256, `handback[${index}].routeSha256`),
      buildSha256: digest(handback.buildSha256, `handback[${index}].buildSha256`),
      briefSha256: digest(handback.briefSha256, `handback[${index}].briefSha256`),
      remainingCriteria: strings(handback.remainingCriteria, `handback[${index}].remainingCriteria`),
      findings: strings(handback.findings, `handback[${index}].findings`),
    });
  });
  const shared = ['evidenceSha256', 'routeSha256', 'buildSha256', 'briefSha256'] as const;
  if (shared.some((key) => handbacks[0]![key] !== handbacks[1]![key])) fail('reviewers did not receive the same immutable evidence');
  if (handbacks.some((handback, index) => handback.evidenceSha256 !== evidenceProofs[index]!.evidenceSha256)) {
    fail('reviewer handback does not bind the consumed rendered evidence');
  }
  const reviewerIds = roles.map((role) => `omd-eye-${hash(role.receipt.sessionId!).slice(0, 16)}`);
  const votes: readonly Vote[] = Object.freeze(handbacks.map((handback, index) => Object.freeze({
    reviewerId: reviewerIds[index]!,
    winnerAlias: handback.winnerAlias,
    remainingCriteria: handback.remainingCriteria,
    findings: handback.findings,
  })));
  const executions = roles.map((role, index) => {
    const handback = handbacks[index]!;
    const value = {
      schema: 'adaptive-refinement-reviewer-execution-v1',
      reviewerId: reviewerIds[index]!,
      winnerAlias: handback.winnerAlias,
      remainingCriteria: handback.remainingCriteria,
      findings: handback.findings,
      evidenceSha256: handback.evidenceSha256,
      routeSha256: handback.routeSha256,
      buildSha256: handback.buildSha256,
      briefSha256: handback.briefSha256,
      isolationReceiptSha256: isolationSha256,
      childPid: role.receipt.processPid,
      sessionId: role.receipt.sessionId,
      nonce: role.receipt.roleNonce,
      configurationSha256: role.receipt.configurationSha256,
    };
    const bytes = Buffer.from(`${canonicalJson(value)}\n`);
    const sha256 = hash(bytes);
    return Object.freeze({
      path: `.omd/final-review/refinement-executions/sha256-${sha256}.json`,
      sha256,
      bytes,
    });
  });
  const winnerAlias = handbacks[0]!.winnerAlias === handbacks[1]!.winnerAlias
    ? handbacks[0]!.winnerAlias : 'disagreement' as const;
  const remainingCriteria = Object.freeze([...new Set(votes.flatMap((vote) => vote.remainingCriteria))]);
  const reviewValue = {
    schema: 'adaptive-refinement-review-v1',
    winnerAlias,
    evidenceSha256: handbacks[0]!.evidenceSha256,
    transportSha256: evidenceProofs[0]!.packetSha256,
    routeSha256: handbacks[0]!.routeSha256,
    buildSha256: handbacks[0]!.buildSha256,
    briefSha256: handbacks[0]!.briefSha256,
    remainingCriteria,
    votes,
    quorum: { required: 2, passed: 2 },
    provenance: { reviewerIds, reviewerSessionSha256: isolationSha256 },
    executionReceipts: executions.map(({ path, sha256 }) => ({ path, sha256 })),
  };
  const reviewBytes = Buffer.from(`${canonicalJson(reviewValue)}\n`);
  const reviewSha256 = hash(reviewBytes);
  return Object.freeze({
    review: Object.freeze({
      path: `.omd/final-review/refinements/sha256-${reviewSha256}.json`,
      sha256: reviewSha256,
      bytes: reviewBytes,
    }),
    executions: Object.freeze(executions),
  });
}
