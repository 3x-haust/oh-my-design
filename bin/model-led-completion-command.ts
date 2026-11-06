import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';
import { checkTerminalCompletion } from '../core/completion/preflight.ts';
import { readContainedRegularFile } from '../core/ref/reference-selection.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { adaptiveRouteRecordSha256 } from '../core/route/index.ts';
import { isModelLedProcess } from '../core/route/process-policy.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { checkNativeBrowserEvidence } from '../core/stage/native-completion.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { runNativeEvaluation } from '../core/runtime/native-evaluation.ts';
import { runNativeFinalReview, finalizeNativeEvidence } from '../core/runtime/native-final-publication.ts';
import { modelLedCompletionFingerprint } from '../core/runtime/model-led-execution.ts';
import { browserFailureDiagnostic, completionErrorDiagnostic, type CompletionDiagnostic, type CompletionPhase } from '../core/runtime/model-led-diagnostics.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';
import { publishFirstRenderCheck } from '../core/design/first-render-evidence.ts';
import { captureFirstRenderMotion, firstRenderMotionProjection } from '../core/design/first-render-motion.ts';
import {
  FIRST_RENDER_REVIEW_PATH,
  readFirstRenderReview,
  requireRetainedFirstRenderReview,
  runFirstRenderReview,
} from '../core/design/first-render-review.ts';
import {
  firstRenderLoopState,
  stallMessage,
  firstRenderReviewMatchesCurrentRoute,
} from '../core/design/first-render-checkpoint.ts';
import { requireConsultedPrimaryOriginal } from '../core/design/consulted-references.ts';
import { newSurface, requireNoticeableMotion } from '../core/design/new-surface-advisories.ts';
import { readStudioSystem, requireStudioSystem, requireStudioSystemHeld } from '../core/design/studio.ts';
import { requireStudioFloors } from '../core/design/studio-floors.ts';
import { readFirstRenderIterationHistory } from '../core/design/first-render-iteration-history.ts';
import { STUDIO_DELIVERY_RECORD, STUDIO_REVIEW_ROUNDS, studioEntry, studioReviewRounds, studioSite, writeStudioDelivery } from '../core/design/studio-delivery.ts';
import { REPAIR_KNOWLEDGE } from '../core/design/compose-guidance.ts';
import { capturePageBasics } from '../core/design/page-basics.ts';
import { requireReviewableSource } from '../core/design/source-readability.ts';
import { figmaCompletionIssues, figmaTargetsInRequest } from '../core/figma/completion.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { runNativeVerification } from './native-verification-command.ts';

type Verification = Awaited<ReturnType<typeof runNativeVerification>>;
type Evaluation = Awaited<ReturnType<typeof runNativeEvaluation>>;
type EvaluationSummary = Pick<Evaluation, 'executionStatus' | 'acceptanceStatus' | 'observationPath' | 'receiptPath'>;
type FirstRenderSummary = Pick<Awaited<ReturnType<typeof runFirstRenderReview>>,
  'decision' | 'findings' | 'qualityAssessments' | 'path' | 'sha256' | 'progress' | 'captures'>;
export type ModelLedCompletionResult = Readonly<{
  schema: 'model-led-completion-result-v1';
  meaning: 'native-completion';
  ok: boolean;
  phase: CompletionPhase;
  runId?: string;
  inputFingerprint?: string;
  verification: readonly Verification[];
  evaluation?: EvaluationSummary;
  firstRender?: FirstRenderSummary;
  finalEvidencePath?: string;
  /** A new surface ends in a studio delivery instead of the final evidence chain. */
  studioDeliveryPath?: string;
  designEvidence?: 'isolated-model-proxy';
  limitations?: readonly Readonly<{ stage: string; reason: string }>[];
  diagnostic?: CompletionDiagnostic;
}>;

class CompletionStepError extends Error {
  readonly code: string;
  constructor(code: string, message = code) { super(message); this.code = code; }
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function runModelLedCompletion(input: Readonly<{
  root: string; packRoot: string; invocation: ProjectRunInvocation; manifest?: unknown; signal?: AbortSignal;
}>): Promise<ModelLedCompletionResult> {
  let phase: Exclude<CompletionPhase, 'complete'> = 'authority';
  const verification: Verification[] = [];
  let evaluation: EvaluationSummary | undefined;
  let firstRender: FirstRenderSummary | undefined;
  let runId: string | undefined;
  let inputFingerprint: string | undefined;
  const cancelled = () => { if (input.signal?.aborted) throw new CompletionStepError('NATIVE_COMPLETION_CANCELLED'); };
  const result = (ok: boolean, step: CompletionPhase): ModelLedCompletionResult => ({
    schema: 'model-led-completion-result-v1', meaning: 'native-completion', ok, phase: step,
    ...(runId === undefined ? {} : { runId }), ...(inputFingerprint === undefined ? {} : { inputFingerprint }),
    verification, ...(evaluation === undefined ? {} : { evaluation }),
    ...(firstRender === undefined ? {} : { firstRender }),
  });
  try {
    cancelled();
    const run = getNativePiRun(input.invocation, input.root);
    runId = run.runId;
    const route = readPersistedRoute(input.root, input.invocation);
    if (!isModelLedProcess(route.sourceContract)) throw new CompletionStepError('MODEL_LED_WORKFLOW_REQUIRED');
    const figmaTargets = figmaTargetsInRequest(route.request);
    if (figmaTargets.length > 0) {
      const figmaIssues = figmaCompletionIssues(input.root, route.request);
      if (figmaIssues.length > 0) {
        throw new CompletionStepError('FIGMA_TARGET_NOT_PROVEN', figmaIssues.map(issue => `${issue.code}: ${issue.message}`).join('; '));
      }
    } else if (!newSurface(route)) {
      // A new surface is judged on its rendered concept and recompositions, not on a reference ledger.
      requireConsultedPrimaryOriginal(input.root, route);
    }
    const readiness = checkProductionReadiness(input.root, input.invocation, input.packRoot);
    if (!readiness.ok) throw new CompletionStepError('NATIVE_PRODUCTION_NOT_READY', readiness.blockers.join('; '));
    // A new page is delivered from its build, floors and review rounds; it owes no browser plan.
    const studio = figmaTargets.length === 0 && newSurface(route);
    let manifest: ReturnType<typeof parseTrustedLifecycleManifest> | undefined;
    if (!studio) {
      phase = 'plan';
      const path = '.omd/.cache/trusted-lifecycle-manifest.json';
      if (input.manifest === undefined && !existsSync(resolve(input.root, path))) {
        throw new CompletionStepError('NATIVE_BROWSER_PLAN_REQUIRED', 'Author one outcome-bound plan from the actual implementation: omd schema trusted-lifecycle-manifest --json');
      }
      manifest = parseTrustedLifecycleManifest(input.manifest
        ?? JSON.parse(readContainedRegularFile(input.root, path, 'browser plan').toString('utf8')));
    }
    phase = 'verification';
    // A new page is verified in the package that builds it, which may be a site folder beside the project's own package.
    const packageDir = studio ? studioSite(input.root).dir : '';
    const manifestPath = packageDir === '' ? 'package.json' : `${packageDir}/package.json`;
    if (existsSync(resolve(input.root, manifestPath))) {
      const pkg: unknown = JSON.parse(readContainedRegularFile(input.root, manifestPath, 'package manifest').toString('utf8'));
      if (!object(pkg) || (pkg.scripts !== undefined && !object(pkg.scripts))) throw new CompletionStepError('PROJECT_SCRIPTS_INVALID');
      const scripts = object(pkg.scripts) ? pkg.scripts : {};
      const actions: string[] = [];
      if (!existsSync(resolve(input.root, packageDir, 'node_modules'))
        && [pkg.dependencies, pkg.devDependencies].some(deps => object(deps) && Object.keys(deps).length > 0)) actions.push('install');
      actions.push(...['typecheck', 'test', 'build'].filter(action => typeof scripts[action] === 'string'));
      for (const command of actions) {
        cancelled();
        const checked = await runNativeVerification({ ...input, command, packageDir });
        verification.push(checked);
        if (checked.code !== 0 || checked.killed) {
          throw new CompletionStepError('PACKAGE_VERIFICATION_FAILED', `Project command failed: ${checked.command.join(' ')}; inspect its retained stdout, stderr and exit code.`);
        }
      }
    }
    cancelled();
    requireReviewableSource(input.root, route);
    // The same entry condition as omd first-render check: finish captures a first render too.
    requireStudioSystem(input.root, route);
    if (studio) {
      phase = 'review';
      const delivered = await deliverStudioPage(input, route, verification);
      if ('diagnostic' in delivered) {
        if (delivered.firstRender !== undefined) firstRender = delivered.firstRender;
        return { ...result(false, phase), diagnostic: delivered.diagnostic };
      }
      firstRender = delivered.firstRender;
      return { ...result(true, 'complete'), studioDeliveryPath: STUDIO_DELIVERY_RECORD, designEvidence: 'isolated-model-proxy',
        limitations: delivered.openFindings.map(id => ({ stage: 'first-render', reason: `open after the comparison with the reference: ${id}` })) };
    }
    if (manifest === undefined) throw new CompletionStepError('NATIVE_BROWSER_PLAN_REQUIRED');
    inputFingerprint = modelLedCompletionFingerprint(input.root, manifest);
    phase = 'review';
    const existingFirstRender = readFirstRenderReview(input.root);
    const existingReviewIsCurrent = existingFirstRender !== null
      && firstRenderReviewMatchesCurrentRoute(input.root, route, existingFirstRender);
    if (existingFirstRender !== null && existingReviewIsCurrent) {
      const loop = firstRenderLoopState(input.root, route);
      const regressed = existingFirstRender.progress?.verdict === 'regressed';
      if (loop.stalled || regressed && (!loop.bestRestoreApplied || loop.bestRestored)) {
        firstRender = {
          decision: existingFirstRender.decision,
          findings: existingFirstRender.findings,
          qualityAssessments: existingFirstRender.qualityAssessments,
          path: FIRST_RENDER_REVIEW_PATH,
          sha256: existingFirstRender.sha256,
          progress: existingFirstRender.progress,
          captures: existingFirstRender.captures,
        };
        const code = loop.stalled ? 'FIRST_RENDER_LOOP_STALLED' : 'FIRST_RENDER_REGRESSED';
        const message = loop.stalled
          ? stallMessage(loop)
          : loop.bestRestoreApplied
            ? 'The best first-render iteration is restored. Try a materially different approach before recapturing.'
            : `The latest first-render iteration regressed. Restore the best iteration before trying a materially different approach. ${REPAIR_KNOWLEDGE}`;
        return { ...result(false, phase), diagnostic: {
          ...completionErrorDiagnostic(phase, new CompletionStepError(code, message)),
          next: loop.bestRestoreApplied ? null : 'omd first-render restore --json',
          evidencePaths: [FIRST_RENDER_REVIEW_PATH, ...existingFirstRender.captures.map(capture =>
            `.omd/first-render/captures/${capture.captureSha256}.png`)],
        } };
      }
    }
    const writer = createProjectWriteAdapter(input.root, input.invocation);
    const checked = await publishFirstRenderCheck(input.root, manifest.entryPath, undefined, writer, input.invocation);
    // Without the scroll sections the reviewer cannot resolve or credit anything below the entry; an
    // existing observation of this same report is kept so unchanged pixels keep their evidence.
    if (firstRenderMotionProjection(input.root, checked.reportSha256) === null) {
      await captureFirstRenderMotion(input.root, resolve(input.root, manifest.entryPath), checked.reportSha256, writer).catch(() => undefined);
    }
    await capturePageBasics(input.root, resolve(input.root, manifest.entryPath), checked.reportSha256, writer).catch(() => undefined);
    const motion = firstRenderMotionProjection(input.root, checked.reportSha256);
    if (motion !== null) await requireNoticeableMotion(input.root, route, motion.context.timeline, input.invocation.current.briefSha256);
    cancelled();
    // Deterministic behavior and measurement take about a minute; the isolated visual review takes several.
    // Run the cheap checks first so a failing assertion or measurement never waits behind a review of
    // pixels that are about to change anyway.
    phase = 'browser';
    const observed = await runNativeEvaluation({ ...input, manifest });
    evaluation = { executionStatus: observed.executionStatus, acceptanceStatus: observed.acceptanceStatus,
      observationPath: observed.observationPath, receiptPath: observed.receiptPath };
    inputFingerprint = modelLedCompletionFingerprint(input.root, manifest);
    if (!observed.ok) return { ...result(false, phase), diagnostic: browserFailureDiagnostic(observed) };
    cancelled();
    checkNativeBrowserEvidence(input.root, input.invocation);
    phase = 'review';
    // A retain already given to these exact pixels and evidence stands; asking again only re-rolls the verdict.
    const retained = (() => {
      try { return requireRetainedFirstRenderReview(input.root, input.invocation); } catch { return null; }
    })();
    const early = retained !== null
      ? { decision: retained.decision, findings: retained.findings, qualityAssessments: retained.qualityAssessments,
        path: FIRST_RENDER_REVIEW_PATH, sha256: retained.sha256, progress: retained.progress, captures: retained.captures,
        diagnostic: undefined }
      : await runFirstRenderReview(input.root, input.invocation, input.signal);
    firstRender = { decision: early.decision, findings: early.findings,
      qualityAssessments: early.qualityAssessments, path: early.path, sha256: early.sha256,
      progress: early.progress, captures: early.captures };
    if (early.decision !== 'retain') {
      const stalled = early.diagnostic?.code === 'FIRST_RENDER_LOOP_STALLED';
      const regressed = early.diagnostic?.code === 'FIRST_RENDER_REGRESSED';
      const code = stalled ? 'FIRST_RENDER_LOOP_STALLED'
        : regressed ? 'FIRST_RENDER_REGRESSED' : 'FIRST_RENDER_VISUAL_REPAIR';
      const message = stalled
        ? early.diagnostic!.message
        : regressed
          ? `The latest first-render iteration regressed. Restore the best iteration before trying a materially different approach. ${REPAIR_KNOWLEDGE}`
          : `The isolated first-render reviewer requested visual repair. Inspect its current capture-bound findings before full behavior execution; do not replace a whole-system finding with an icon-library swap. ${REPAIR_KNOWLEDGE}`;
      return { ...result(false, phase), diagnostic: {
        ...completionErrorDiagnostic(phase, new CompletionStepError(code, message)),
        next: stalled || regressed ? 'omd first-render restore --json'
          : `omd first-render check --page ${manifest.entryPath} --json`,
        evidencePaths: [early.path, ...early.captures.map(capture =>
          `.omd/first-render/captures/${capture.captureSha256}.png`)],
      } };
    }
    cancelled();
    if (modelLedCompletionFingerprint(input.root, manifest) !== inputFingerprint) {
      throw new CompletionStepError('NATIVE_COMPLETION_INPUT_CHANGED', 'Production or browser proposal changed during the first-render review.');
    }
    phase = 'seal';
    writeSourceSeal(input.root, input.invocation);
    cancelled();
    phase = 'review';
    await runNativeFinalReview(input);
    cancelled();
    if (modelLedCompletionFingerprint(input.root, manifest) !== inputFingerprint) {
      throw new CompletionStepError('NATIVE_COMPLETION_INPUT_CHANGED', 'Production or browser proposal changed during review; retain the attempt and verify the current inputs.');
    }
    phase = 'publication';
    const published = finalizeNativeEvidence(input);
    cancelled();
    phase = 'completion';
    const terminal = checkTerminalCompletion(input.root, input.invocation);
    return { ...result(true, 'complete'), finalEvidencePath: published.path, designEvidence: 'isolated-model-proxy',
      limitations: terminal.limitations.map(({ stage, reason }) => ({ stage, reason })) };
  } catch (error) {
    return { ...result(false, phase), diagnostic: completionErrorDiagnostic(phase, error) };
  }
}

type StudioInput = Readonly<{ root: string; invocation: ProjectRunInvocation; signal?: AbortSignal }>;
type StudioRoute = ReturnType<typeof readPersistedRoute>;
const firstRenderSummary = (review: Readonly<FirstRenderSummary>): FirstRenderSummary => ({ decision: review.decision, findings: review.findings,
  qualityAssessments: review.qualityAssessments, path: review.path, sha256: review.sha256, progress: review.progress, captures: review.captures });
const reviewDiagnostic = (code: string, message: string, next: string | null, review: FirstRenderSummary): CompletionDiagnostic => ({
  ...completionErrorDiagnostic('review', new CompletionStepError(code, message)), next,
  evidencePaths: [review.path, ...review.captures.map(capture => `.omd/first-render/captures/${capture.captureSha256}.png`)] });

/**
 * Deliver a new page: the floors on the real build, then the current render's review. A retained review delivers;
 * otherwise each round asks for a recomposition until the rounds are spent, and then the best iteration is delivered
 * with its open findings named, as a studio ships on a deadline instead of reviewing forever.
 */
async function deliverStudioPage(input: StudioInput, route: StudioRoute, verification: readonly Verification[]): Promise<
  Readonly<{ firstRender: FirstRenderSummary; openFindings: readonly string[] }>
  | Readonly<{ firstRender?: FirstRenderSummary; diagnostic: CompletionDiagnostic }>> {
  const entry = studioEntry(input.root);
  const target = resolve(input.root, entry);
  await requireStudioFloors(input.root, route, target);
  const writer = createProjectWriteAdapter(input.root, input.invocation);
  await requireStudioSystemHeld(input.root, route, target, writer);
  const checked = await publishFirstRenderCheck(input.root, entry, undefined, writer, input.invocation);
  if (firstRenderMotionProjection(input.root, checked.reportSha256) === null) {
    await captureFirstRenderMotion(input.root, target, checked.reportSha256, writer).catch(() => undefined);
  }
  await capturePageBasics(input.root, target, checked.reportSha256, writer).catch(() => undefined);
  const spent = studioReviewRounds(input.root, route) >= STUDIO_REVIEW_ROUNDS;
  const retained = (() => { try { return requireRetainedFirstRenderReview(input.root, input.invocation); } catch { return null; } })();
  let review: FirstRenderSummary;
  if (retained !== null) review = firstRenderSummary({ ...retained, path: FIRST_RENDER_REVIEW_PATH });
  else if (spent) {
    // The one comparison has been answered: the page as it stands is delivered without a second look.
    const latest = readFirstRenderReview(input.root);
    if (latest === null) throw new CompletionStepError('FIRST_RENDER_REVIEW_REQUIRED');
    review = firstRenderSummary({ ...latest, path: FIRST_RENDER_REVIEW_PATH });
  } else {
    const early = await runFirstRenderReview(input.root, input.invocation, input.signal);
    review = firstRenderSummary(early);
    // A lead's critique is acted on before the page ships: the maker answers it once, and that answer is not reviewed
    // again. test-330 delivered a reframe (one message lost to a logo, three identical slogan sections) untouched.
    if (early.decision !== 'retain') {
      return { firstRender: review, diagnostic: reviewDiagnostic('FIRST_RENDER_VISUAL_REPAIR',
        `The comparison with the reference named ${review.findings.map(finding => finding.id).join(', ')}: recompose for them once, `
          + 'structure before polish, keeping the page idea you chose. Rebuild and finish again; that finish delivers the page without '
          + `another review. ${REPAIR_KNOWLEDGE}`,
        'omd lifecycle finish --json', review) };
    }
  }
  const history = readFirstRenderIterationHistory(input.root, route);
  const best = history.iterations.find(iteration => iteration.id === history.bestIterationId) ?? history.iterations.at(-1);
  const openFindings = review.decision === 'retain' ? [] : [...(best?.findingIds ?? review.findings.map(finding => finding.id))];
  writeStudioDelivery(input.root, writer, {
    routeSha256: adaptiveRouteRecordSha256(route), entryPath: entry, reference: readStudioSystem(input.root)?.reference ?? '',
    verification: verification.map(checkedCommand => checkedCommand.command.join(' ')),
    review: { sha256: review.sha256, decision: review.decision, rounds: studioReviewRounds(input.root, route), openFindings },
  });
  return { firstRender: review, openFindings };
}
