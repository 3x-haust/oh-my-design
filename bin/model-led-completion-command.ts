import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';
import { checkTerminalCompletion } from '../core/completion/preflight.ts';
import { readContainedRegularFile } from '../core/ref/reference-selection.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
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
  firstRenderReviewMatchesCurrentRoute,
} from '../core/design/first-render-checkpoint.ts';
import { requireConsultedPrimaryOriginal } from '../core/design/consulted-references.ts';
import { requireConsultedReferences, requireDesignBrief, requireGraphicDecision, requireGraphicsStarted, requireNoticeableMotion } from '../core/design/new-surface-advisories.ts';
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
    } else {
      requireConsultedPrimaryOriginal(input.root, route);
      requireGraphicDecision(input.root, route, input.invocation.current.briefSha256);
    }
    const readiness = checkProductionReadiness(input.root, input.invocation, input.packRoot);
    if (!readiness.ok) throw new CompletionStepError('NATIVE_PRODUCTION_NOT_READY', readiness.blockers.join('; '));
    phase = 'plan';
    const path = '.omd/.cache/trusted-lifecycle-manifest.json';
    if (input.manifest === undefined && !existsSync(resolve(input.root, path))) {
      throw new CompletionStepError('NATIVE_BROWSER_PLAN_REQUIRED', 'Author one outcome-bound plan from the actual implementation: omd schema trusted-lifecycle-manifest --json');
    }
    const manifest = parseTrustedLifecycleManifest(input.manifest
      ?? JSON.parse(readContainedRegularFile(input.root, path, 'browser plan').toString('utf8')));
    phase = 'verification';
    if (existsSync(resolve(input.root, 'package.json'))) {
      const pkg: unknown = JSON.parse(readContainedRegularFile(input.root, 'package.json', 'package manifest').toString('utf8'));
      if (!object(pkg) || (pkg.scripts !== undefined && !object(pkg.scripts))) throw new CompletionStepError('PROJECT_SCRIPTS_INVALID');
      const scripts = object(pkg.scripts) ? pkg.scripts : {};
      const actions: string[] = [];
      if (!existsSync(resolve(input.root, 'node_modules'))
        && [pkg.dependencies, pkg.devDependencies].some(deps => object(deps) && Object.keys(deps).length > 0)) actions.push('install');
      actions.push(...['typecheck', 'test', 'build'].filter(action => typeof scripts[action] === 'string'));
      for (const command of actions) {
        cancelled();
        const checked = await runNativeVerification({ ...input, command });
        verification.push(checked);
        if (checked.code !== 0 || checked.killed) {
          throw new CompletionStepError('PACKAGE_VERIFICATION_FAILED', `Project command failed: ${checked.command.join(' ')}; inspect its retained stdout, stderr and exit code.`);
        }
      }
    }
    cancelled();
    requireReviewableSource(input.root, route);
    requireDesignBrief(input.root, route);
    // The same entry conditions as omd first-render check: finish captures a first render too.
    requireConsultedReferences(input.root, route);
    requireGraphicsStarted(input.root, route);
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
          ? 'The first-render repair loop is stalled. Restore the best iteration and report the remaining findings with both captures to the user instead of continuing.'
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
        ? 'The first-render repair loop stalled. Restore the best iteration and report the remaining findings with both captures to the user instead of continuing.'
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
