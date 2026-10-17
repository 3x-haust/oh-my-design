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
import { runFirstRenderReview } from '../core/design/first-render-review.ts';
import { requireConsultedPrimaryOriginal } from '../core/design/consulted-references.ts';
import { figmaCompletionIssues } from '../core/figma/completion.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { runNativeVerification } from './native-verification-command.ts';

type Verification = Awaited<ReturnType<typeof runNativeVerification>>;
type Evaluation = Awaited<ReturnType<typeof runNativeEvaluation>>;
type EvaluationSummary = Pick<Evaluation, 'executionStatus' | 'acceptanceStatus' | 'observationPath' | 'receiptPath'>;
type FirstRenderSummary = Pick<Awaited<ReturnType<typeof runFirstRenderReview>>,
  'decision' | 'findings' | 'qualityAssessments' | 'path' | 'sha256'>;
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
    requireConsultedPrimaryOriginal(input.root, route);
    const figmaIssues = figmaCompletionIssues(input.root, route.request);
    if (figmaIssues.length > 0) {
      throw new CompletionStepError('FIGMA_TARGET_NOT_PROVEN', figmaIssues.map(issue => `${issue.code}: ${issue.message}`).join('; '));
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
    inputFingerprint = modelLedCompletionFingerprint(input.root, manifest);
    phase = 'review';
    await publishFirstRenderCheck(input.root, manifest.entryPath, undefined,
      createProjectWriteAdapter(input.root, input.invocation), input.invocation);
    cancelled();
    const early = await runFirstRenderReview(input.root, input.invocation, input.signal);
    firstRender = { decision: early.decision, findings: early.findings,
      qualityAssessments: early.qualityAssessments, path: early.path, sha256: early.sha256 };
    if (early.decision !== 'retain') {
      return { ...result(false, phase), diagnostic: {
        ...completionErrorDiagnostic(phase, new CompletionStepError('FIRST_RENDER_VISUAL_REPAIR',
          'The isolated first-render reviewer requested visual repair. Inspect its current capture-bound findings before full behavior execution; do not replace a whole-system finding with an icon-library swap.')),
        next: `omd first-render check --page ${manifest.entryPath} --json`,
        evidencePaths: [early.path],
      } };
    }
    cancelled();
    if (modelLedCompletionFingerprint(input.root, manifest) !== inputFingerprint) {
      throw new CompletionStepError('NATIVE_COMPLETION_INPUT_CHANGED', 'Production or browser proposal changed during early visual review.');
    }
    phase = 'browser';
    const observed = await runNativeEvaluation({ ...input, manifest });
    evaluation = { executionStatus: observed.executionStatus, acceptanceStatus: observed.acceptanceStatus,
      observationPath: observed.observationPath, receiptPath: observed.receiptPath };
    inputFingerprint = modelLedCompletionFingerprint(input.root, manifest);
    if (!observed.ok) return { ...result(false, phase), diagnostic: browserFailureDiagnostic(observed) };
    cancelled();
    checkNativeBrowserEvidence(input.root, input.invocation);
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
