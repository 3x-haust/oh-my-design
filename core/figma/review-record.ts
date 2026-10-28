import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { piDigest, piParse, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { figmaSafeFrameId } from './diff-record.ts';
import {
  FIGMA_FIDELITY_REVIEW_HANDBACK,
  FIGMA_FIDELITY_REVIEW_TASK,
  type FigmaFidelityFix,
  type FigmaFidelityReview,
  type FigmaFidelityReviewBindings,
  type FigmaPriorFix,
} from './review-contract.ts';
import {
  FIGMA_FIDELITY_REVIEW_SCHEMA,
  figmaFidelityReviewPath,
  figmaReviewFail,
  type FigmaFidelityReviewRecord,
  type FigmaFidelityReviewRecordBody,
  type FigmaFixHistoryRound,
} from './review-types.ts';

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

function storedFix(value: unknown): FigmaFidelityFix {
  const row = piRecord(value, 'stored-figma-fix');
  const element = piRecord(row.element, 'stored-fix-element');
  if (!exact(row, ['id', 'regionIndex', 'element', 'property', 'figmaValue', 'renderValue', 'instruction'])
    || !exact(element, ['figmaNodeId', 'figmaNodeName', 'renderedSelector'])
    || typeof row.regionIndex !== 'number' || !Number.isSafeInteger(row.regionIndex) || row.regionIndex < 0) {
    return figmaReviewFail('stored fix');
  }
  const nullable = (input: unknown, label: string): string | null => input === null ? null : piText(input, label);
  return {
    id: piText(row.id, 'stored-fix-id'), regionIndex: row.regionIndex,
    element: {
      figmaNodeId: nullable(element.figmaNodeId, 'stored-node-id'),
      figmaNodeName: nullable(element.figmaNodeName, 'stored-node-name'),
      renderedSelector: nullable(element.renderedSelector, 'stored-selector'),
    },
    property: piText(row.property, 'stored-property'), figmaValue: piText(row.figmaValue, 'stored-figma-value'),
    renderValue: piText(row.renderValue, 'stored-render-value'), instruction: piText(row.instruction, 'stored-instruction'),
  };
}

function storedReview(value: unknown): FigmaFidelityReview {
  const row = piRecord(value, 'stored-figma-review');
  if (!exact(row, ['verdict', 'fixes', 'priorFixes'])
    || (row.verdict !== 'match' && row.verdict !== 'mismatch')
    || !Array.isArray(row.fixes) || !Array.isArray(row.priorFixes)) return figmaReviewFail('stored review');
  const fixes = row.fixes.map(storedFix);
  const priorFixes = row.priorFixes.map((value): FigmaPriorFix => {
    const prior = piRecord(value, 'stored-prior-fix');
    if (!exact(prior, ['id', 'status']) || (prior.status !== 'resolved' && prior.status !== 'unresolved')) {
      return figmaReviewFail('stored prior fix');
    }
    return { id: piText(prior.id, 'stored-prior-id'), status: prior.status };
  });
  if ((row.verdict === 'match') !== (fixes.length === 0)) return figmaReviewFail('stored verdict');
  return { verdict: row.verdict, fixes, priorFixes };
}

function history(value: unknown): readonly FigmaFixHistoryRound[] {
  if (!Array.isArray(value)) return figmaReviewFail('history');
  return value.map((raw): FigmaFixHistoryRound => {
    const row = piRecord(raw, 'figma-history-round');
    if (!exact(row, ['compareSha256', 'unresolved']) || !Array.isArray(row.unresolved)) return figmaReviewFail('history round');
    const unresolved = row.unresolved.map(item => {
      const count = piRecord(item, 'figma-history-count');
      if (!exact(count, ['id', 'count']) || typeof count.count !== 'number'
        || !Number.isSafeInteger(count.count) || count.count <= 0) return figmaReviewFail('history count');
      return { id: piText(count.id, 'history-fix-id'), count: count.count };
    });
    if (new Set(unresolved.map(item => item.id)).size !== unresolved.length) return figmaReviewFail('history duplicate');
    return { compareSha256: piDigest(row.compareSha256, 'history-compare'), unresolved };
  });
}

function bindings(value: unknown): FigmaFidelityReviewBindings {
  const row = piRecord(value, 'figma-review-bindings');
  if (!exact(row, ['buildSha256', 'briefSha256', 'evidenceSha256', 'browserSha256', 'diffSha256', 'compareSha256'])) {
    return figmaReviewFail('review bindings');
  }
  return {
    buildSha256: piDigest(row.buildSha256, 'review-build'), briefSha256: piDigest(row.briefSha256, 'review-brief'),
    evidenceSha256: piDigest(row.evidenceSha256, 'review-evidence'), browserSha256: piDigest(row.browserSha256, 'review-browser'),
    diffSha256: piDigest(row.diffSha256, 'review-diff'), compareSha256: piDigest(row.compareSha256, 'review-compare'),
  };
}

export function readFigmaFidelityReview(root: string, frameId: string): FigmaFidelityReviewRecord | null {
  let bytes: Buffer;
  try { bytes = readContainedRegularFile(root, figmaFidelityReviewPath(frameId), 'Figma fidelity review'); }
  catch { return null; }
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return figmaReviewFail('review JSON'); }
  const row = piRecord(value, 'figma-review-record');
  if (!exact(row, ['schema', 'frameId', 'safeId', 'diffSha256', 'compareSha256', 'previousReviewSha256',
    'bindings', 'packetSha256', 'review', 'history', 'roleResult', 'signature'])
    || row.schema !== FIGMA_FIDELITY_REVIEW_SCHEMA || row.frameId !== frameId
    || row.safeId !== figmaSafeFrameId(frameId)) return figmaReviewFail('review record fields');
  const signature = piText(row.signature, 'figma-review-signature');
  const { signature: _signature, ...body } = row;
  if (!verifyNativeObservation(root, FIGMA_FIDELITY_REVIEW_SCHEMA, sha256(canonicalJson(body)), signature)) {
    return figmaReviewFail('review signature');
  }
  const fixed = bindings(row.bindings), review = storedReview(row.review);
  const role = verifySignedPiEyeRoleResult(row.roleResult, root);
  const packetSha256 = piDigest(row.packetSha256, 'review-packet');
  if (role.receipt.taskSha256 !== sha256(FIGMA_FIDELITY_REVIEW_TASK)
    || role.receipt.buildSha256 !== fixed.buildSha256 || role.receipt.briefSha256 !== fixed.briefSha256
    || role.receipt.reviewerEvidence.evidenceSha256 !== fixed.evidenceSha256
    || role.receipt.reviewerEvidence.packetSha256 !== packetSha256
    || canonicalJson(piParse(role.finalMessage, 'figma-review-handback')) !== canonicalJson({
      schema: FIGMA_FIDELITY_REVIEW_HANDBACK, fixedBindings: fixed, ...review,
    })) return figmaReviewFail('review authority');
  const record: FigmaFidelityReviewRecordBody = {
    schema: FIGMA_FIDELITY_REVIEW_SCHEMA, frameId, safeId: figmaSafeFrameId(frameId),
    diffSha256: piDigest(row.diffSha256, 'record-diff'), compareSha256: piDigest(row.compareSha256, 'record-compare'),
    previousReviewSha256: row.previousReviewSha256 === null ? null : piDigest(row.previousReviewSha256, 'previous-review'),
    bindings: fixed, packetSha256, review, history: history(row.history), roleResult: row.roleResult,
  };
  if (record.diffSha256 !== fixed.diffSha256 || record.compareSha256 !== fixed.compareSha256) return figmaReviewFail('record bindings');
  return { ...record, signature, sha256: sha256(bytes) };
}

export function figmaReviewRecordBytes(root: string, body: FigmaFidelityReviewRecordBody): Buffer {
  return Buffer.from(`${canonicalJson({
    ...body,
    signature: signNativeObservation(root, FIGMA_FIDELITY_REVIEW_SCHEMA, sha256(canonicalJson(body))),
  })}\n`);
}
