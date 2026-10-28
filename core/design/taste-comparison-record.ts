import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/canonical-json.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { piDigest, piParse, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import {
  TASTE_COMPARISON_REVIEW_HANDBACK, TASTE_COMPARISON_REVIEW_TASK, TASTE_LABELS, TASTE_VIEWPORTS,
  parseTasteComparisonReview, tasteRenderBinding,
  type TasteComparisonReviewBindings, type TasteLabel, type TasteViewport,
} from './taste-comparison-contract.ts';

export const TASTE_COMPARISON_RECORD_SCHEMA = 'omd-taste-comparison-review-v1';
/** At or above this share of trials judging the build AI-made, a reviewer can tell it apart from human work. */
export const TASTE_DISTINGUISHABLE_RATE = 0.75;
export const tasteComparisonReviewPath = (id: string): string => `.omd/taste/reviews/${id}.json`;

export type TasteTrialOrder = 'project-first' | 'anchor-first';
export type TasteComparisonTrial = Readonly<{
  viewport: TasteViewport;
  anchorUrl: string;
  anchorCaptureSha256: string;
  projectCaptureSha256: string;
  order: TasteTrialOrder;
  projectLabel: TasteLabel;
  human: TasteLabel;
  projectJudgedAi: boolean;
  confidence: number;
  aiTells: readonly string[];
  humanSignals: readonly string[];
  bindings: TasteComparisonReviewBindings;
  packetSha256: string;
  roleResult: unknown;
}>;
export type TasteComparisonSummary = Readonly<{
  judgedAi: number;
  trials: number;
  rate: number;
  verdict: 'distinguishable' | 'not-distinguishable';
  /** Tells named only where the build itself was judged AI-made; otherwise the tells describe the human page. */
  recurringTells: Readonly<Record<TasteViewport, readonly string[]>>;
}>;
export type TasteAnchorRecord = Readonly<{ url: string; captures: readonly Readonly<{ viewport: TasteViewport; sha256: string }>[] }>;
export type TasteComparisonRecordBody = Readonly<{
  schema: typeof TASTE_COMPARISON_RECORD_SCHEMA;
  id: string;
  createdAt: string;
  buildSha256: string;
  briefSha256: string;
  firstRender: Readonly<{ reportSha256: string; captures: readonly Readonly<{ viewport: TasteViewport; captureSha256: string }>[] }>;
  anchors: Readonly<{ candidates: readonly string[]; used: readonly TasteAnchorRecord[]; skipped: readonly Readonly<{ url: string; reason: string }>[] }>;
  trials: readonly TasteComparisonTrial[];
  summary: TasteComparisonSummary;
}>;
export type TasteComparisonRecord = TasteComparisonRecordBody & Readonly<{ signature: string; sha256: string }>;

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail = (reason: string): never => { throw new Error(`TASTE_COMPARISON_RECORD_INVALID: ${reason}`); };
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const viewportOf = (value: unknown): TasteViewport => value === 'desktop' || value === 'mobile' ? value : fail('viewport');

export function tasteTrialSha256(input: Readonly<{ reportSha256: string; viewport: TasteViewport; order: TasteTrialOrder;
  anchorUrl: string; anchorCaptureSha256: string; projectCaptureSha256: string }>): string {
  return sha256(canonicalJson(input));
}
/** The A/B digest binding the reviewer saw, rebuilt from the hidden order. */
export function tasteTrialBrowserSha256(viewport: TasteViewport, order: TasteTrialOrder, projectCaptureSha256: string, anchorCaptureSha256: string): string {
  const shas = order === 'project-first' ? [projectCaptureSha256, anchorCaptureSha256] : [anchorCaptureSha256, projectCaptureSha256];
  return tasteRenderBinding(shas.map((captureSha256, index) => ({ label: TASTE_LABELS[index]!, ...TASTE_VIEWPORTS[viewport], captureSha256, pngBase64: '' })));
}

/**
 * Each anchor is judged twice with the A/B order swapped. A judge that names the same slot human both times is reading
 * the position, not the work, so that pair says nothing; the rate counts only pairs judged the same way in both orders,
 * and with no such pair nothing was shown, so the rate is 1 (still told apart) rather than a coin flip's 0.5.
 */
export function informativeRate<T extends Readonly<{ order: TasteTrialOrder; projectJudgedAi: boolean }>>(trials: readonly T[], pairKey: (trial: T) => string): number {
  const groups = new Map<string, T[]>();
  for (const trial of trials) groups.set(pairKey(trial), [...(groups.get(pairKey(trial)) ?? []), trial]);
  const informative = [...groups.values()].flatMap(group => {
    const first = group.filter(trial => trial.order === 'project-first'), second = group.filter(trial => trial.order === 'anchor-first');
    return first.length === 1 && second.length === 1 && first[0]!.projectJudgedAi !== second[0]!.projectJudgedAi ? [] : group;
  });
  return informative.length === 0 ? 1 : informative.filter(trial => trial.projectJudgedAi).length / informative.length;
}

export function summarizeTasteTrials(trials: readonly Pick<TasteComparisonTrial, 'viewport' | 'anchorUrl' | 'order' | 'projectJudgedAi' | 'aiTells'>[]): TasteComparisonSummary {
  const judgedAi = trials.filter(trial => trial.projectJudgedAi).length;
  const rate = trials.length === 0 ? 0 : informativeRate(trials, trial => `${trial.viewport}\n${trial.anchorUrl}`);
  const tells = (viewport: TasteViewport) => trials.filter(trial => trial.viewport === viewport && trial.projectJudgedAi).flatMap(trial => trial.aiTells);
  return { judgedAi, trials: trials.length, rate, verdict: rate >= TASTE_DISTINGUISHABLE_RATE ? 'distinguishable' : 'not-distinguishable',
    recurringTells: { desktop: tells('desktop'), mobile: tells('mobile') } };
}

function storedTrial(root: string, value: unknown, reportSha256: string, record: Pick<TasteComparisonRecordBody, 'buildSha256' | 'briefSha256'>): TasteComparisonTrial {
  const row = piRecord(value, 'taste-trial');
  if (!exact(row, ['viewport', 'anchorUrl', 'anchorCaptureSha256', 'projectCaptureSha256', 'order', 'projectLabel', 'human',
    'projectJudgedAi', 'confidence', 'aiTells', 'humanSignals', 'bindings', 'packetSha256', 'roleResult'])) return fail('trial fields');
  const viewport = viewportOf(row.viewport);
  const order = row.order === 'project-first' || row.order === 'anchor-first' ? row.order : fail('trial order');
  const anchorUrl = piText(row.anchorUrl, 'trial-anchor');
  const anchorCaptureSha256 = piDigest(row.anchorCaptureSha256, 'trial-anchor-capture');
  const projectCaptureSha256 = piDigest(row.projectCaptureSha256, 'trial-project-capture');
  const bindingsRow = piRecord(row.bindings, 'trial-bindings');
  if (!exact(bindingsRow, ['buildSha256', 'briefSha256', 'evidenceSha256', 'browserSha256', 'trialSha256'])) return fail('trial bindings');
  const bindings: TasteComparisonReviewBindings = {
    buildSha256: piDigest(bindingsRow.buildSha256, 'trial-build'), briefSha256: piDigest(bindingsRow.briefSha256, 'trial-brief'),
    evidenceSha256: piDigest(bindingsRow.evidenceSha256, 'trial-evidence'), browserSha256: piDigest(bindingsRow.browserSha256, 'trial-browser'),
    trialSha256: piDigest(bindingsRow.trialSha256, 'trial-sha'),
  };
  const packetSha256 = piDigest(row.packetSha256, 'trial-packet');
  const role = verifySignedPiEyeRoleResult(row.roleResult, root);
  const review = parseTasteComparisonReview(piParse(role.finalMessage, 'taste-handback'), bindings);
  const projectLabel: TasteLabel = order === 'project-first' ? 'A' : 'B';
  if (bindings.buildSha256 !== record.buildSha256 || bindings.briefSha256 !== record.briefSha256
    || bindings.trialSha256 !== tasteTrialSha256({ reportSha256, viewport, order, anchorUrl, anchorCaptureSha256, projectCaptureSha256 })
    || bindings.browserSha256 !== tasteTrialBrowserSha256(viewport, order, projectCaptureSha256, anchorCaptureSha256)
    || role.receipt.taskSha256 !== sha256(TASTE_COMPARISON_REVIEW_TASK)
    || role.receipt.buildSha256 !== bindings.buildSha256 || role.receipt.briefSha256 !== bindings.briefSha256
    || role.receipt.reviewerEvidence.evidenceSha256 !== bindings.evidenceSha256
    || role.receipt.reviewerEvidence.packetSha256 !== packetSha256
    || canonicalJson(piParse(role.finalMessage, 'taste-handback')) !== canonicalJson({ schema: TASTE_COMPARISON_REVIEW_HANDBACK, fixedBindings: bindings, ...review })
    || row.projectLabel !== projectLabel || row.human !== review.human || row.projectJudgedAi !== (review.human !== projectLabel)
    || row.confidence !== review.confidence || canonicalJson(row.aiTells) !== canonicalJson(review.aiTells)
    || canonicalJson(row.humanSignals) !== canonicalJson(review.humanSignals)) return fail('trial authority');
  return { viewport, anchorUrl, anchorCaptureSha256, projectCaptureSha256, order, projectLabel, human: review.human,
    projectJudgedAi: review.human !== projectLabel, confidence: review.confidence, aiTells: review.aiTells,
    humanSignals: review.humanSignals, bindings, packetSha256, roleResult: row.roleResult };
}

export function readTasteComparisonReview(root: string, id: string): TasteComparisonRecord | null {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return fail('review id');
  let bytes: Buffer;
  try { bytes = readContainedRegularFile(root, tasteComparisonReviewPath(id), 'taste comparison review'); }
  catch { return null; }
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return fail('review JSON'); }
  const row = piRecord(value, 'taste-record');
  if (!exact(row, ['schema', 'id', 'createdAt', 'buildSha256', 'briefSha256', 'firstRender', 'anchors', 'trials', 'summary', 'signature'])
    || row.schema !== TASTE_COMPARISON_RECORD_SCHEMA || row.id !== id) return fail('record fields');
  const signature = piText(row.signature, 'taste-signature');
  const { signature: _signature, ...body } = row;
  if (!verifyNativeObservation(root, TASTE_COMPARISON_RECORD_SCHEMA, sha256(canonicalJson(body)), signature)) return fail('signature');
  const firstRender = piRecord(row.firstRender, 'taste-first-render');
  if (!exact(firstRender, ['reportSha256', 'captures']) || !Array.isArray(firstRender.captures)) return fail('first-render binding');
  const reportSha256 = piDigest(firstRender.reportSha256, 'taste-report');
  const projectCaptures = new Map(firstRender.captures.map(item => {
    const capture = piRecord(item, 'taste-first-render-capture');
    return [viewportOf(capture.viewport), piDigest(capture.captureSha256, 'taste-first-render-capture')] as const;
  }));
  const header = { buildSha256: piDigest(row.buildSha256, 'taste-build'), briefSha256: piDigest(row.briefSha256, 'taste-brief') };
  if (!Array.isArray(row.trials) || row.trials.length === 0) return fail('trials');
  const trials = row.trials.map(trial => storedTrial(root, trial, reportSha256, header));
  const receipts = trials.map(trial => verifySignedPiEyeRoleResult(trial.roleResult, root).receipt);
  if (trials.some(trial => projectCaptures.get(trial.viewport) !== trial.projectCaptureSha256)
    || new Set(receipts.map(receipt => receipt.processPid)).size !== trials.length
    || new Set(receipts.map(receipt => receipt.sessionId)).size !== trials.length
    || new Set(receipts.map(receipt => receipt.roleNonce)).size !== trials.length
    || canonicalJson(row.summary) !== canonicalJson(summarizeTasteTrials(trials))) return fail('trial set');
  return { ...(body as TasteComparisonRecordBody), trials, signature, sha256: sha256(bytes) };
}

export function tasteComparisonRecordBytes(root: string, body: TasteComparisonRecordBody): Buffer {
  return Buffer.from(`${canonicalJson({
    ...body,
    signature: signNativeObservation(root, TASTE_COMPARISON_RECORD_SCHEMA, sha256(canonicalJson(body))),
  })}\n`);
}
