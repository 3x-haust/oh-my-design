import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../ref/canonical-json.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { runPiTasteComparisonReviewers } from '../../adapters/pi-reviewer-runtime.ts';
import { piDigest, piParse, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { checkFirstRenderEvidence } from './first-render-evidence.ts';
import { TASTE_ANCHORS_PER_RUN, captureTasteAnchors, normalizeTasteAnchor, rotatedTasteAnchors } from './taste-anchors.ts';
import {
  TASTE_COMPARISON_REVIEW_HANDBACK, TASTE_COMPARISON_REVIEW_TASK, TASTE_COMPARISON_REVIEW_TRANSPORT, TASTE_LABELS, TASTE_VIEWPORTS,
  parseTasteComparisonReview, tasteRenderBinding,
  type TasteComparisonReviewBindings, type TasteLabel, type TasteViewport,
} from './taste-comparison-contract.ts';
import {
  TASTE_COMPARISON_RECORD_SCHEMA, summarizeTasteTrials, tasteComparisonRecordBytes, tasteComparisonReviewPath, tasteTrialSha256,
  type TasteComparisonRecordBody, type TasteComparisonSummary, type TasteComparisonTrial, type TasteTrialOrder,
} from './taste-comparison-record.ts';
import { TASTE_REPAIR_ROUNDS } from './taste-graphic-decision.ts';

export { TASTE_REPAIR_ROUNDS } from './taste-graphic-decision.ts';

export * from './taste-comparison-record.ts';

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail = (reason: string): never => { throw new Error(`TASTE_COMPARISON_REFUSED: ${reason}`); };
const VIEWPORTS = Object.freeze(['desktop', 'mobile'] as const);
const ORDERS = Object.freeze(['project-first', 'anchor-first'] as const);

type Shot = Readonly<{ sha256: string; bytes: Buffer }>;
type TrialPlan = Readonly<{ viewport: TasteViewport; order: TasteTrialOrder; anchorUrl: string; anchor: Shot; project: Shot;
  bindings: TasteComparisonReviewBindings; packet: Buffer }>;

export type TasteComparisonResult = Readonly<{
  path: string;
  sha256: string;
  id: string;
  anchors: Readonly<{ used: readonly string[]; skipped: readonly Readonly<{ url: string; reason: string }>[] }>;
  summary: TasteComparisonSummary;
  trials: readonly Omit<TasteComparisonTrial, 'bindings' | 'packetSha256' | 'roleResult'>[];
  round: number;
  next: string;
}>;

function shot(root: string, path: string, digest: string, label: string): Shot {
  const bytes = readContainedRegularFile(root, path, label);
  return sha256(bytes) === digest ? { sha256: digest, bytes } : fail(`${label} bytes changed`);
}

/** The build under comparison is exactly the current first-render capture pair; nothing else stands in for it. */
function projectCaptures(root: string, invocation: ProjectRunInvocation): Readonly<{ reportSha256: string; shots: Readonly<Record<TasteViewport, Shot>> }> {
  let current: ReturnType<typeof checkFirstRenderEvidence>;
  try { current = checkFirstRenderEvidence(root, 'review', invocation); }
  catch (error) { return fail(`the first-render check is not current (${error instanceof Error ? error.message : String(error)}); run omd first-render check first`); }
  if (current === null) return fail('no current first-render check exists; run omd first-render check first');
  const captures: unknown = current.captures;
  if (!Array.isArray(captures) || captures.length !== 2) return fail('first-render captures missing; run omd first-render check first');
  const [desktop, mobile] = captures.map((item, index) => {
    const capture = piRecord(item, 'first-render-capture');
    return shot(root, piText(capture.path, 'first-render-capture-path'), piDigest(capture.sha256, 'first-render-capture-sha'),
      `${index === 0 ? 'desktop' : 'mobile'} first-render capture`);
  });
  return { reportSha256: piDigest(current.reportSha256, 'first-render-report'), shots: { desktop: desktop!, mobile: mobile! } };
}

function trialPacket(invocation: ProjectRunInvocation, reportSha256: string, viewport: TasteViewport, order: TasteTrialOrder,
  anchorUrl: string, anchor: Shot, project: Shot): TrialPlan {
  const size = TASTE_VIEWPORTS[viewport];
  const renders = (order === 'project-first' ? [project, anchor] : [anchor, project]).map((item, index) => ({
    label: TASTE_LABELS[index]!, ...size, captureSha256: item.sha256, pngBase64: item.bytes.toString('base64'),
  }));
  const evidence = { renders };
  const bindings: TasteComparisonReviewBindings = {
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    evidenceSha256: sha256(canonicalJson(evidence)), browserSha256: tasteRenderBinding(renders),
    trialSha256: tasteTrialSha256({ reportSha256, viewport, order, anchorUrl, anchorCaptureSha256: anchor.sha256, projectCaptureSha256: project.sha256 }),
  };
  const packet = Buffer.from(canonicalJson({
    schema: TASTE_COMPARISON_REVIEW_TRANSPORT, evidenceSha256: bindings.evidenceSha256, evidence,
    outputContract: {
      lane: 'tasteComparison', schema: TASTE_COMPARISON_REVIEW_HANDBACK, fixedBindings: bindings,
      responseTemplate: { schema: TASTE_COMPARISON_REVIEW_HANDBACK, fixedBindings: bindings, human: null, confidence: null, aiTells: [], humanSignals: [] },
      requiredKeys: ['schema', 'fixedBindings', 'human', 'confidence', 'aiTells', 'humanSignals'],
      labels: TASTE_LABELS, confidenceRange: [0.5, 1], itemsPerList: [1, 6],
      rules: 'human is the label of the capture a human designer made. confidence is a number from 0.5 to 1. aiTells describe the other capture and humanSignals describe the chosen one; each item says where on the screen it appears. Copy schema and fixedBindings exactly.',
    },
  }));
  return { viewport, order, anchorUrl, anchor, project, bindings, packet };
}

export async function runTasteComparison(root: string, invocation: ProjectRunInvocation,
  options: Readonly<{ anchors?: readonly string[]; signal?: AbortSignal }> = {}): Promise<TasteComparisonResult> {
  const run = getNativePiRun(invocation, root);
  const project = projectCaptures(run.projectRoot, invocation);
  const explicit = [...new Set((options.anchors ?? []).map(normalizeTasteAnchor))];
  const candidates = explicit.length > 0 ? explicit : rotatedTasteAnchors(invocation.current.buildSha256);
  const writer = createProjectWriteAdapter(run.projectRoot, invocation);
  // An explicit anchor list is the user's whole choice; the default list stops after the per-run count.
  const anchors = await captureTasteAnchors(writer, candidates, explicit.length > 0 ? explicit.length : TASTE_ANCHORS_PER_RUN);
  if (anchors.used.length === 0) {
    return fail(`no anchor page could be captured (${anchors.skipped.map(item => `${item.url}: ${item.reason}`).join('; ')})`);
  }
  const plans = anchors.used.flatMap(anchor => VIEWPORTS.flatMap(viewport => {
    const capture = anchor.captures.find(item => item.viewport === viewport) ?? fail('anchor capture missing');
    const anchorShot = shot(run.projectRoot, capture.path, capture.sha256, 'anchor capture');
    return ORDERS.map(order => trialPacket(invocation, project.reportSha256, viewport, order, anchor.url, anchorShot, project.shots[viewport]));
  }));
  const roleResults = await runPiTasteComparisonReviewers({
    root: run.projectRoot, invocation, ...(options.signal === undefined ? {} : { signal: options.signal }),
    trials: plans.map(plan => ({ packet: plan.packet,
      validateHandback: (final: string) => { parseTasteComparisonReview(piParse(final, 'taste-handback'), plan.bindings); } })),
  });
  const trials = plans.map((plan, index): TasteComparisonTrial => {
    const roleResult = roleResults[index];
    const verified = verifySignedPiEyeRoleResult(roleResult, run.projectRoot);
    if (verified.receipt.taskSha256 !== sha256(TASTE_COMPARISON_REVIEW_TASK)
      || verified.receipt.reviewerEvidence.packetSha256 !== sha256(plan.packet)
      || verified.receipt.reviewerEvidence.evidenceSha256 !== plan.bindings.evidenceSha256
      || verified.receipt.provider !== run.host.provider || verified.receipt.model !== run.host.model) return fail('review execution binding');
    const review = parseTasteComparisonReview(piParse(verified.finalMessage, 'taste-handback'), plan.bindings);
    const projectLabel: TasteLabel = plan.order === 'project-first' ? 'A' : 'B';
    return { viewport: plan.viewport, anchorUrl: plan.anchorUrl, anchorCaptureSha256: plan.anchor.sha256,
      projectCaptureSha256: plan.project.sha256, order: plan.order, projectLabel, human: review.human,
      projectJudgedAi: review.human !== projectLabel, confidence: review.confidence, aiTells: review.aiTells,
      humanSignals: review.humanSignals, bindings: plan.bindings, packetSha256: sha256(plan.packet), roleResult };
  });
  const summary = summarizeTasteTrials(trials);
  const createdAt = new Date().toISOString();
  const id = `${createdAt.replace(/\D/g, '').slice(0, 14)}-${sha256(`${createdAt}\n${canonicalJson(trials.map(trial => trial.packetSha256))}`).slice(0, 8)}`;
  const body: TasteComparisonRecordBody = {
    schema: TASTE_COMPARISON_RECORD_SCHEMA, id, createdAt,
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    firstRender: { reportSha256: project.reportSha256,
      captures: VIEWPORTS.map(viewport => ({ viewport, captureSha256: project.shots[viewport].sha256 })) },
    anchors: { candidates, used: anchors.used.map(anchor => ({ url: anchor.url,
      captures: anchor.captures.map(capture => ({ viewport: capture.viewport, sha256: capture.sha256 })) })), skipped: anchors.skipped },
    trials, summary,
  };
  const release = acquireProjectMutationLock(run.projectRoot, invocation);
  try {
    if (projectCaptures(run.projectRoot, invocation).reportSha256 !== project.reportSha256) return fail('first-render evidence changed during comparison');
    const bytes = tasteComparisonRecordBytes(run.projectRoot, body);
    const path = tasteComparisonReviewPath(id);
    createProjectWriteAdapter(run.projectRoot, invocation).write(path, bytes);
    const round = tasteRound(run.projectRoot, body.briefSha256);
    return { path, sha256: sha256(bytes), id, round, next: tasteNext(summary.verdict, round),
      anchors: { used: anchors.used.map(anchor => anchor.url), skipped: anchors.skipped }, summary,
      trials: trials.map(({ bindings: _bindings, packetSha256: _packet, roleResult: _role, ...trial }) => trial) };
  } finally { release(); }
}

/** Comparisons already recorded for this brief, this one included; counts rounds of the repair loop. */
function tasteRound(projectRoot: string, briefSha256: string): number {
  const dir = join(projectRoot, '.omd/taste/reviews');
  if (!existsSync(dir)) return 1;
  return readdirSync(dir).filter(name => name.endsWith('.json')).filter(name => {
    try { return (JSON.parse(readFileSync(join(dir, name), 'utf8')) as { briefSha256?: unknown }).briefSha256 === briefSha256; } catch { return false; }
  }).length || 1;
}
// Reporting the rate alone left a distinguishable page unrepaired; name the next step and the stop.
export function tasteNext(verdict: TasteComparisonSummary['verdict'], round: number): string {
  if (verdict === 'not-distinguishable') return 'Not reliably distinguishable from the human-made pages; continue and report the rate at completion.';
  if (round >= TASTE_REPAIR_ROUNDS) return `Round ${round} of ${TASTE_REPAIR_ROUNDS}: still distinguishable. Stop repairing for taste and report the rate and the remaining tells honestly at completion.`;
  return `Round ${round} of ${TASTE_REPAIR_ROUNDS}: distinguishable. Repair the recurring tells across the whole visible system (not by imitating an anchor, never with annotation decorations), run omd first-render check, then omd taste compare again before final verification.`;
}
