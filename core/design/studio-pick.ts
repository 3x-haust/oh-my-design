import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../ref/canonical-json.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { runPiTasteComparisonReviewers } from '../../adapters/pi-reviewer-runtime.ts';
import { piParse } from '../../adapters/pi-reviewer-contract.ts';
import { TASTE_ANCHORS_PER_RUN, captureTasteAnchors, normalizeTasteAnchor, rotatedTasteAnchors } from './taste-anchors.ts';
import {
  TASTE_COMPARISON_REVIEW_HANDBACK, TASTE_COMPARISON_REVIEW_TASK, TASTE_COMPARISON_REVIEW_TRANSPORT, TASTE_LABELS, TASTE_VIEWPORTS,
  parseTasteComparisonReview, tasteRenderBinding, type TasteComparisonReviewBindings, type TasteLabel,
} from './taste-comparison-contract.ts';
import { informativeRate, type TasteTrialOrder } from './taste-comparison-record.ts';
import type { readPersistedRoute } from '../route/index.ts';
import { newSurface } from './new-surface-advisories.ts';
import { currentStudioConcepts, STUDIO_CONCEPT_GUIDANCE, STUDIO_DIR, STUDIO_MIN_CONCEPTS, type StudioConcept } from './studio.ts';

type Route = ReturnType<typeof readPersistedRoute>;

/**
 * The concepts are judged blind, one at a time, beside pages human designers made: the reviewer never sees two
 * concepts together or learns which one the agent prefers, so the pick is not the maker grading its own work.
 */
export const STUDIO_PICK_RECORD = `${STUDIO_DIR}/pick.json`;
export const STUDIO_PICK_SCHEMA = 'omd-studio-pick-v1';
const ORDERS = Object.freeze(['project-first', 'anchor-first'] as const);
const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail = (reason: string): never => { throw new Error(`STUDIO_PICK_REFUSED: ${reason}`); };

export type StudioPickTrial = Readonly<{ concept: string; anchorUrl: string; order: TasteTrialOrder; projectLabel: TasteLabel;
  human: TasteLabel; projectJudgedAi: boolean; confidence: number; aiTells: readonly string[]; humanSignals: readonly string[] }>;
export type StudioPickScore = Readonly<{ name: string; sourceSha256: string; captureSha256: string; judgedAi: number; trials: number;
  rate: number; aiTells: readonly string[]; humanSignals: readonly string[] }>;
export type StudioPickBody = Readonly<{ schema: typeof STUDIO_PICK_SCHEMA; createdAt: string; buildSha256: string; anchors: readonly string[];
  concepts: readonly StudioPickScore[]; picked: string; trials: readonly StudioPickTrial[] }>;

export function studioPickTrialSha256(input: Readonly<{ concept: string; captureSha256: string; anchorUrl: string; anchorSha256: string; order: TasteTrialOrder }>): string {
  return sha256(canonicalJson({ subject: 'studio-concept', ...input }));
}

/** Lowest informative judged-AI rate wins; then fewer AI judgments; then the name, so the same votes always pick the same concept. */
export function scoreStudioConcepts(concepts: readonly StudioConcept[], trials: readonly StudioPickTrial[]): readonly StudioPickScore[] {
  return concepts.map(concept => {
    const own = trials.filter(trial => trial.concept === concept.name);
    const desktop = concept.captures.find(capture => capture.viewport === 'desktop')!;
    return { name: concept.name, sourceSha256: concept.sourceSha256, captureSha256: desktop.sha256,
      judgedAi: own.filter(trial => trial.projectJudgedAi).length, trials: own.length,
      rate: own.length === 0 ? 1 : informativeRate(own, trial => trial.anchorUrl),
      aiTells: own.filter(trial => trial.projectJudgedAi).flatMap(trial => trial.aiTells),
      humanSignals: own.filter(trial => !trial.projectJudgedAi).flatMap(trial => trial.humanSignals) };
  }).sort((left, right) => left.rate - right.rate || left.judgedAi - right.judgedAi || left.name.localeCompare(right.name));
}

export async function runStudioPick(root: string, invocation: ProjectRunInvocation,
  options: Readonly<{ anchors?: readonly string[]; signal?: AbortSignal }> = {}): Promise<StudioPickBody & Readonly<{ path: string; next: string }>> {
  const run = getNativePiRun(invocation, root);
  const concepts = currentStudioConcepts(run.projectRoot);
  if (concepts.length < STUDIO_MIN_CONCEPTS) return fail('render three concept sketches with omd studio concepts first');
  const explicit = [...new Set((options.anchors ?? []).map(normalizeTasteAnchor))];
  const writer = createProjectWriteAdapter(run.projectRoot, invocation);
  const anchors = await captureTasteAnchors(writer, explicit.length > 0 ? explicit : rotatedTasteAnchors(invocation.current.buildSha256),
    explicit.length > 0 ? explicit.length : TASTE_ANCHORS_PER_RUN);
  if (anchors.used.length === 0) return fail(`no human-made page could be captured (${anchors.skipped.map(item => `${item.url}: ${item.reason}`).join('; ')})`);
  const size = TASTE_VIEWPORTS.desktop;
  const plans = concepts.flatMap(concept => {
    const capture = concept.captures.find(item => item.viewport === 'desktop')!;
    const shot = readContainedRegularFile(run.projectRoot, capture.path, 'concept render');
    if (sha256(shot) !== capture.sha256) return fail(`${capture.path} changed; run omd studio concepts again`);
    return anchors.used.flatMap(anchor => {
      const anchorCapture = anchor.captures.find(item => item.viewport === 'desktop') ?? fail('anchor capture missing');
      const anchorShot = readContainedRegularFile(run.projectRoot, anchorCapture.path, 'anchor capture');
      return ORDERS.map(order => {
        const renders = (order === 'project-first' ? [shot, anchorShot] : [anchorShot, shot]).map((bytes, index) => ({
          label: TASTE_LABELS[index]!, ...size, captureSha256: sha256(bytes), pngBase64: bytes.toString('base64') }));
        const evidence = { renders };
        const bindings: TasteComparisonReviewBindings = {
          buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
          evidenceSha256: sha256(canonicalJson(evidence)), browserSha256: tasteRenderBinding(renders),
          trialSha256: studioPickTrialSha256({ concept: concept.name, captureSha256: capture.sha256, anchorUrl: anchor.url,
            anchorSha256: anchorCapture.sha256, order }),
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
        return { concept: concept.name, anchorUrl: anchor.url, order, bindings, packet };
      });
    });
  });
  // One concept's trials at a time: a provider hiccup voids one batch, not all of them, and fewer reviewers run at once.
  const trials: StudioPickTrial[] = [];
  for (const concept of concepts) {
    const batch = plans.filter(plan => plan.concept === concept.name);
    const roleResults = await runPiTasteComparisonReviewers({
      root: run.projectRoot, invocation, ...(options.signal === undefined ? {} : { signal: options.signal }),
      trials: batch.map(plan => ({ packet: plan.packet,
        validateHandback: (final: string) => { parseTasteComparisonReview(piParse(final, 'taste-handback'), plan.bindings); } })),
    });
    batch.forEach((plan, index) => {
      const verified = verifySignedPiEyeRoleResult(roleResults[index], run.projectRoot);
      if (verified.receipt.taskSha256 !== sha256(TASTE_COMPARISON_REVIEW_TASK)
        || verified.receipt.reviewerEvidence.packetSha256 !== sha256(plan.packet)
        || verified.receipt.reviewerEvidence.evidenceSha256 !== plan.bindings.evidenceSha256
        || verified.receipt.provider !== run.host.provider || verified.receipt.model !== run.host.model) fail('review execution binding');
      const review = parseTasteComparisonReview(piParse(verified.finalMessage, 'taste-handback'), plan.bindings);
      const projectLabel: TasteLabel = plan.order === 'project-first' ? 'A' : 'B';
      trials.push({ concept: plan.concept, anchorUrl: plan.anchorUrl, order: plan.order, projectLabel, human: review.human,
        projectJudgedAi: review.human !== projectLabel, confidence: review.confidence, aiTells: review.aiTells, humanSignals: review.humanSignals });
    });
  }
  const scores = scoreStudioConcepts(concepts, trials);
  const body: StudioPickBody = { schema: STUDIO_PICK_SCHEMA, createdAt: new Date().toISOString(), buildSha256: invocation.current.buildSha256,
    anchors: anchors.used.map(anchor => anchor.url), concepts: scores, picked: scores[0]!.name, trials };
  const release = acquireProjectMutationLock(run.projectRoot, invocation);
  try {
    if (canonicalJson(currentStudioConcepts(run.projectRoot)) !== canonicalJson(concepts)) return fail('a concept changed during the pick');
    const bytes = `${canonicalJson({ ...body, signature: signNativeObservation(run.projectRoot, STUDIO_PICK_SCHEMA, sha256(canonicalJson(body))) })}\n`;
    writer.write(STUDIO_PICK_RECORD, bytes);
  } finally { release(); }
  const [best, runnerUp] = scores;
  return { ...body, path: STUDIO_PICK_RECORD, next: `Build ${best!.name}: judged AI-made in ${best!.judgedAi} of ${best!.trials} blind trials`
    + `${runnerUp ? ` (next: ${runnerUp.name}, ${runnerUp.judgedAi} of ${runnerUp.trials})` : ''}. Carry its strengths into the build and fix the `
    + 'tells the reviewers named; if the loop later stalls, recompose from the runner-up.' };
}

/** The signed pick whose concepts are still the current renders; anything else is stale. */
export function currentStudioPick(root: string): StudioPickBody | null {
  try {
    const { signature, ...body } = JSON.parse(readFileSync(join(root, STUDIO_PICK_RECORD), 'utf8')) as StudioPickBody & { signature?: unknown };
    if (body.schema !== STUDIO_PICK_SCHEMA || typeof signature !== 'string'
      || !verifyNativeObservation(root, STUDIO_PICK_SCHEMA, sha256(canonicalJson(body)), signature)) return null;
    const current = new Map(currentStudioConcepts(root).map(concept => [concept.name, concept.sourceSha256]));
    return body.concepts.length >= STUDIO_MIN_CONCEPTS && body.concepts.length === current.size
      && body.concepts.every(concept => current.get(concept.name) === concept.sourceSha256) ? body : null;
  } catch { return null; }
}

export const STUDIO_PICK_GUIDANCE = 'Run omd studio pick --json: isolated reviewers judge each concept blind beside pages human designers made, '
  + 'and the concept they least often take for AI work is the one to build.';

/** What a new surface still owes before its page is built: rendered concepts, then a blind pick among them. */
export function studioPending(root: string, route: Route): 'concepts' | 'pick' | null {
  if (!newSurface(route)) return null;
  if (currentStudioConcepts(root).length < STUDIO_MIN_CONCEPTS) return 'concepts';
  return currentStudioPick(root) === null ? 'pick' : null;
}

/** Refusal boundary at the first render and at finish: a new surface is built from a concept picked blind among rendered alternatives. */
export function requireStudioPick(root: string, route: Route): void {
  const pending = studioPending(root, route);
  if (pending === 'concepts') {
    throw Object.assign(new Error(`STUDIO_CONCEPTS_MISSING: render three concept sketches before the page. ${STUDIO_CONCEPT_GUIDANCE}`),
      { code: 'STUDIO_CONCEPTS_MISSING' });
  }
  if (pending === 'pick') {
    throw Object.assign(new Error(`STUDIO_PICK_MISSING: the current concepts have no blind pick. ${STUDIO_PICK_GUIDANCE}`), { code: 'STUDIO_PICK_MISSING' });
  }
}
