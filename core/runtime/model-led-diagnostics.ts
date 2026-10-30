import type { runNativeEvaluation } from './native-evaluation.ts';

type Evaluation = Awaited<ReturnType<typeof runNativeEvaluation>>;
export type CompletionPhase = 'authority' | 'plan' | 'verification' | 'browser' | 'seal' | 'review' | 'publication' | 'completion' | 'complete';
export type CompletionDiagnostic = Readonly<{
  schema: 'native-workflow-diagnostic-v1';
  phase: CompletionPhase;
  category: 'authority' | 'proposal' | 'verification' | 'execution' | 'bookkeeping' | 'review' | 'cancelled' | 'behavior-or-proposal' | 'access' | 'safety';
  code: string;
  message: string;
  next: string | null;
  evidencePaths: readonly string[];
  findings?: Readonly<{
    hardFloors: Evaluation['receipt']['hardFloors'];
    failedOutcomes: Evaluation['receipt']['outcomeResults'];
    repairHints: readonly string[];
    accessTargets: readonly unknown[];
    transcript: readonly string[];
  }>;
}>;

const phaseCategory: Record<CompletionPhase, CompletionDiagnostic['category']> = {
  authority: 'authority', plan: 'proposal', verification: 'verification', browser: 'execution',
  seal: 'bookkeeping', review: 'review', publication: 'bookkeeping', completion: 'bookkeeping', complete: 'bookkeeping',
};

/** The deadline alone kept being read as a flaky check and retried unchanged. */
const BROWSER_DEADLINE_HINT = 'The built page did not finish that step within the inspection budget, and retrying the same build gives the same result. Usual causes: a render loop (canvas, WebGL, requestAnimationFrame) that keeps the main thread busy, including under prefers-reduced-motion where it should draw one still frame; heavy synchronous work or asset decoding on load; web fonts or media that never finish loading. Make that step lighter in the source, rebuild, then finish again.';

export function completionErrorDiagnostic(phase: CompletionPhase, error: unknown): CompletionDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const field = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
  const prefix = message.split(':', 1)[0] ?? '';
  const code = typeof field === 'string' ? field : /^[A-Z][A-Z0-9_]+$/.test(prefix) ? prefix : 'NATIVE_COMPLETION_STEP_FAILED';
  const category = code === 'NATIVE_COMPLETION_CANCELLED' ? 'cancelled'
    : code === 'NATIVE_PI_AUTHORITY' || code === 'NATIVE_EVALUATION_BUILD_MISMATCH' ? 'authority'
    : ['NATIVE_EVALUATION_MANIFEST_MISMATCH', 'NATIVE_EVALUATION_OUTCOME_BINDING_INVALID', 'NATIVE_EVALUATION_PLAN_CHANGED'].includes(code) ? 'proposal'
    : code === 'NATIVE_EVALUATION_DECISION_GRAPH_INVALID' ? 'bookkeeping' : phaseCategory[phase];
  return { schema: 'native-workflow-diagnostic-v1', phase, category, code,
    message: code === 'BROWSER_DEADLINE' ? `${message}. ${BROWSER_DEADLINE_HINT}` : message,
    next: category === 'authority' || category === 'cancelled' ? null
      : category === 'proposal' ? 'omd schema trusted-lifecycle-manifest --json' : 'omd stage next --json',
    evidencePaths: [] };
}

/** What each behavior finding means for the manifest author; the codes alone kept being misread. */
const BEHAVIOR_REPAIR_HINTS: Readonly<Record<string, string>> = Object.freeze({
  'required-state-transition-missing': 'visible-text asserts text that appears after the actions, and this text was already visible before them. Assert text that only exists after the action, or use preserved-text for text that must stay visible through it.',
  'required-preserved-state-missing': 'preserved-text needs the text visible both before and after the actions.',
  'required-visible-result-missing': 'the asserted text was not visible after the actions.',
  'required-result-not-rendered': 'the selector and text did not match exactly one rendered, visible element (spacing and line breaks are ignored).',
  'required-element-state-missing': 'the element did not reach the asserted state after the actions; assert on the element that actually receives focus, hover or press.',
  'required-action-unavailable': 'the action could not run within 2s: the selector matched nothing visible, matched several elements, or the target was covered or off screen.',
  'required-render-not-settled': 'the page kept changing after the actions; let timers and animations settle or assert a settled state.',
  'required-page-unavailable': 'the built page did not load.',
  'required-browser-script-missing': 'no browser script covers this outcome.',
});

export function browserFailureDiagnostic(result: Evaluation): CompletionDiagnostic {
  const floors = result.receipt.hardFloors;
  const category = floors.behavior === 'fail' ? 'behavior-or-proposal' : floors.access === 'fail' ? 'access'
    : floors.safety === 'fail' ? 'safety' : 'behavior-or-proposal';
  const code = floors.behavior === 'fail' ? 'FINAL_BEHAVIOR_FAILED' : floors.access === 'fail' ? 'FINAL_ACCESS_FAILED'
    : floors.safety === 'fail' ? 'FINAL_SAFETY_FAILED' : 'FINAL_REQUIRED_OUTCOME_FAILED';
  const prefix = 'access-finding:interactive-label-detail:';
  const accessTargets: unknown[] = result.receipt.transcript.filter(line => line.startsWith(prefix))
    .map(line => JSON.parse(line.slice(prefix.length)) as unknown);
  return {
    schema: 'native-workflow-diagnostic-v1', phase: 'browser', category, code,
    message: 'Current browser checks failed. Compare the actual captures with the request and assertions; repair the implementation or an incorrect proposal, never waive a genuine requirement.',
    next: null,
    evidencePaths: [...new Set([result.receiptPath, result.observationPath,
      ...result.receipt.captures.flatMap(capture => [capture.path, ...(capture.measurement ? [capture.measurement.packet.path] : [])])])],
    findings: { hardFloors: floors, failedOutcomes: result.receipt.outcomeResults.filter(outcome => outcome.status === 'fail'),
      repairHints: [...new Set(result.receipt.outcomeResults.filter(outcome => outcome.status === 'fail').flatMap(outcome => outcome.findings))]
        .flatMap(finding => BEHAVIOR_REPAIR_HINTS[finding] ? [`${finding}: ${BEHAVIOR_REPAIR_HINTS[finding]}`] : []),
      accessTargets, transcript: result.receipt.transcript },
  };
}
