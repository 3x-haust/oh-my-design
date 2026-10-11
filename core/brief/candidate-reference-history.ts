import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ReferenceFidelityExpectation } from '../runtime/native-reference-fidelity.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { piDigest, piParse, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import {
  CANDIDATE_REFERENCE_REVIEW_HANDBACK, CANDIDATE_REFERENCE_REVIEW_TASK,
  candidateReferenceBindings, parseCandidateReferenceReview,
} from './candidate-reference-contract.ts';

export const CANDIDATE_REFERENCE_HISTORY_SCHEMA = 'candidate-reference-review-v3';
export const CANDIDATE_REFERENCE_HISTORY_BASE = '.omd/.cache/candidate-reference-reviews';
type Review = ReturnType<typeof parseCandidateReferenceReview>;
export type CandidateReferencePriorReview = Readonly<{
  sha256: string;
  assessments: Review['assessments'];
  repairCriteria: Review['repairCriteria'];
}>;
const fail = (reason: string): never => { throw new Error(`CANDIDATE_REFERENCE_REVIEW_INVALID:${reason}`); };
const bytesAt = (root: string, path: string) => readContainedRegularFile(root, path, 'candidate review history');

function expectationsFrom(value: unknown): readonly ReferenceFidelityExpectation[] {
  if (!Array.isArray(value)) return fail('history expectations');
  return value.map(item => {
    const row = piRecord(item, 'candidate-history-expectation');
    if (row.viewport !== 'desktop' && row.viewport !== 'mobile') return fail('history viewport');
    return { slotId: piText(row.slotId, 'history-slot'), viewport: row.viewport,
      referenceSha256: piDigest(row.referenceSha256, 'history-reference'),
      targetCaptureSha256: piDigest(row.targetCaptureSha256, 'history-capture') };
  });
}

export function readCandidateReferenceHistory(root: string, directory: string) {
  const path = `${CANDIDATE_REFERENCE_HISTORY_BASE}/current/${directory}.json`;
  if (!existsSync(join(root, path))) return null;
  const bytes = bytesAt(root, path);
  const { signature, ...record } = piRecord(piParse(bytes.toString('utf8'), 'candidate-review'), 'candidate-review');
  const digest = sha256(bytes);
  if ((record.schema !== CANDIDATE_REFERENCE_HISTORY_SCHEMA && record.schema !== 'candidate-reference-review-v2')
    || !bytes.equals(bytesAt(root, `${CANDIDATE_REFERENCE_HISTORY_BASE}/records/${digest}.json`))
    || !verifyNativeObservation(root, record.schema, sha256(canonicalJson(record)), piText(signature, 'signature'))) {
    return fail('record authority');
  }
  // Earlier records remain historical bytes, not approval under the continuity contract.
  if (record.schema !== CANDIDATE_REFERENCE_HISTORY_SCHEMA) return null;
  const bindings = candidateReferenceBindings(record.bindings);
  let priorReview: CandidateReferencePriorReview | null = null;
  if (record.priorReview !== null) {
    const prior = piRecord(record.priorReview, 'candidate-prior-review');
    if (Object.keys(prior).sort().join() !== 'assessments,repairCriteria,sha256') return fail('history fields');
    const expectations = expectationsFrom(prior.assessments);
    const rows = Array.isArray(prior.assessments) ? prior.assessments : [];
    const priorResult = parseCandidateReferenceReview({
      schema: CANDIDATE_REFERENCE_REVIEW_HANDBACK, fixedBindings: bindings,
      decision: rows.every(item => piRecord(item, 'prior-assessment').verdict === 'pass') ? 'retain' : 'revise',
      referenceFidelityAssessments: rows, repairCriteria: prior.repairCriteria, continuity: [],
    }, bindings, expectations);
    priorReview = { sha256: piDigest(prior.sha256, 'prior-review'), assessments: priorResult.assessments,
      repairCriteria: priorResult.repairCriteria };
  }
  const role = verifySignedPiEyeRoleResult(record.roleResult, root);
  const packetSha256 = piDigest(record.packetSha256, 'review-packet');
  if (role.receipt.taskSha256 !== sha256(CANDIDATE_REFERENCE_REVIEW_TASK)
    || role.receipt.buildSha256 !== bindings.buildSha256 || role.receipt.briefSha256 !== bindings.briefSha256
    || role.receipt.reviewerEvidence.evidenceSha256 !== bindings.evidenceSha256
    || role.receipt.reviewerEvidence.packetSha256 !== packetSha256) return fail('review execution');
  const result = parseCandidateReferenceReview(piParse(role.finalMessage, 'candidate-handback'), bindings,
    expectationsFrom(record.expectations), priorReview?.assessments ?? []);
  return { ...result, sha256: digest, bindings, packetSha256, priorReview,
    visualSha256: piDigest(record.visualSha256, 'history-visual') };
}
