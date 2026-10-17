import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkTerminalCompletion } from '../completion/preflight.ts';
import { checkFinalEvidenceV2 } from '../evidence/final-v2.ts';
import { readFrame } from '../frame/index.ts';
import { completionLimitations } from '../completion/limitations.ts';
import { checkReferenceApplicationReview, referenceApplicationReviewContext } from '../ref/reference-application-review.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { finalRenderReviewerPacket } from '../runtime/final-render-review.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { currentNativeFinalObservations } from '../runtime/native-final-manifest.ts';
import { checkNativeFinalReview } from '../runtime/native-final-review-state.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { checkSlopFinalGraph } from '../slop/review.ts';
import { nativeReframeWork, requireResolvedNativeReframe } from '../runtime/native-reframe.ts';
import { refinementEscalation } from './refinement-work.ts';
import { validateDecisionGraph } from '../deliberation/contracts.ts';
import { FinalOutcomeGateError } from '../evidence/final-v2-outcome-gate.ts';
import { requiresMeasuredTerminal } from '../measure/review-policy.ts';
import { checkRouteMeasuredSlopReview } from '../slop/measured-review.ts';
import { isModelLedProcess } from '../route/process-policy.ts';

const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function checkNativeBrowserEvidence(root: string, invocation: ProjectRunInvocation) {
  getNativePiRun(invocation, root);
  requireResolvedNativeReframe(root, invocation);
  const observations = currentNativeFinalObservations(root);
  finalRenderReviewerPacket({ root, invocation, packetInput: {
    schema: 'adaptive-final-render-reviewer-packet-input-v1',
    observationSha256s: observations.map(item => item.receipt.sha256),
  } });
  return { observations: observations.map(item => item.receipt) };
}

const WORK = {
  production: { stage: 'production', owner: 'omd-hand', action: 'author-production', next: 'omd brief production --check --json',
    instruction: 'Complete the selected production work and its build. Keep the frame entry path accurate, then run the native evaluator on the real local entry.' },
  browser: { stage: 'browser-evidence', owner: 'omd-hand', action: 'evaluate-production', next: 'omd lifecycle evaluate --json',
    instruction: 'Run the project-derived native evaluator. Repair measured failures and gather every required screen/state; entry captures alone are not full-surface proof.' },
  surface: { stage: 'browser-evidence', owner: 'omd-hand', action: 'author-surface-coverage', next: 'omd schema surface-captures --json',
    instruction: 'Map every exact current Frame surface/state/view cell to its real successful lifecycle measurement packet and retained PNG, then publish through lifecycle surface-captures. Use composition-owned expansion when selected. If composition is omitted, return to the route owner for an explicit applicability skip before authoring mappings. Preserve required content-case proofs; never relabel entry captures, downgrade RED, infer a skip, or treat behavior success as design approval.' },
  slop: { stage: 'browser-evidence', owner: 'omd-hand', action: 'review-rendered-findings', next: 'omd schema slop-scope',
    instruction: 'Use slop checkpoint with the actual required views, inspect its saved renders, publish each rendered judgment with slop review-set and run slop review-check. Do not narrow scope or relabel captures.' },
  review: { stage: 'independent-review', owner: 'coordinator', action: 'run-independent-review', next: 'omd review run --json',
    instruction: 'Launch the isolated native reviewer lanes from current authenticated evidence. Repair rejecting findings and rerun after collecting fresh evidence.' },
  finalize: { stage: 'independent-review', owner: 'coordinator', action: 'publish-final-evidence', next: 'omd lifecycle finalize --json',
    instruction: 'Derive and publish final evidence through the native finalizer. Preserve every selected gate and repair reported prerequisites; do not author a replacement manifest.' },
  application: { stage: 'independent-review', owner: 'coordinator', action: 'review-reference-application', next: 'omd ref apply-review-plan --json',
    instruction: 'Inspect actual authenticated final captures for every surface criterion at both viewports. Publish apply-review-set and run apply-review-check. Missing routes/states require real evidence, never entry-capture relabeling.' },
  completion: { stage: 'independent-review', owner: 'coordinator', action: 'validate-terminal-gates', next: 'omd guard completion --json',
    instruction: 'Run the unchanged completion guard and resolve each reported prerequisite. Final publication alone is not terminal acceptance.' },
} as const;

export function nativeCompletionWork(root: string, invocation: ProjectRunInvocation) {
  getNativePiRun(invocation, root);
  const reframe = nativeReframeWork(root, invocation);
  if (reframe !== null) return reframe;
  const route = readPersistedRoute(root, invocation);
  if (isModelLedProcess(route.sourceContract)) {
    try {
      checkTerminalCompletion(root, invocation);
      return { stage: null, owner: 'coordinator', action: 'validate-selected-gates',
        next: 'omd guard completion --json', instruction: 'Report the actual result and limitations.', problems: [] };
    } catch {
      const plan = existsSync(join(root, '.omd/.cache/trusted-lifecycle-manifest.json'));
      return { stage: 'browser-evidence' as const, owner: 'coordinator',
        action: plan ? 'finish-model-led' : 'author-browser-plan',
        next: plan ? 'omd lifecycle finish --json' : 'omd schema trusted-lifecycle-manifest --json',
        instruction: plan
          ? 'The harness runs package checks, real browser actions, isolated visual review and final publication together. Repair concrete returned failures; do not manufacture intermediate design paperwork.'
          : 'Build the requested product directly, then author one browser proposal from its actual controls and outcomes. Preserve every requested outcome. Methods and delegation are your choice.',
        problems: [] };
    }
  }
  const browserWork = route.sourceContract.processPolicy === undefined ? WORK.browser : {
    ...WORK.browser,
    next: existsSync(join(root, '.omd/.cache/trusted-lifecycle-manifest.json'))
      ? 'omd lifecycle evaluate --manifest .omd/.cache/trusted-lifecycle-manifest.json --json'
      : 'omd schema trusted-lifecycle-manifest --json',
    instruction: 'Author the request-bound browser proposal in .omd/.cache/trusted-lifecycle-manifest.json from the actual implementation. Cover every required outcome exactly once and every required view/state; omit benchmark entrySurface when no genuine benchmark exists. Run lifecycle evaluate --manifest with real actions. Do not invent benchmark evidence or substitute page labels for behavior.',
  };
  const escalation = route.sourceContract.processPolicy ? refinementEscalation(root, route.sourceContractSha256) : null;
  if (escalation) {
    const { defects, limitations, ...pending } = escalation;
    const autonomous = route.sourceContract.processPolicy?.interactionMode === 'autonomous';
    return { schema: 'stage-next-v2', stage: 'production', owner: 'coordinator',
      action: autonomous ? 'stop-blocked' : 'await-user',
      reason: 'repeated-defect', pending: autonomous ? null : pending,
      escalationEvidence: defects, resumeAuthority: null, next: null, problems: autonomous ? limitations : [],
      instruction: autonomous
        ? 'Stop automatic repairs. Preserve the artifact and actual fix/result evidence; deliver unresolved limitations without asking for a design decision or claiming approval.'
        : 'The same required defect survived three distinct repairs. Stop automatic recovery and await real human authority; do not waive the failed requirement.' } as const;
  }
  const entry = readFrame(root)?.entrySurface?.entryPath;
  if (entry !== undefined) {
    try { readContainedRegularFile(root, join(root, entry), 'production entry'); }
    catch (error) { return { ...WORK.production, problems: [reason(error)] }; }
  } else if (!existsSync(join(root, '.omd/observation-v2.json'))) {
    return { ...WORK.production, problems: ['No current production entry or authenticated browser observation is available.'] };
  }
  try {
    const checked = validateDecisionGraph(JSON.parse(readContainedRegularFile(root,
      '.omd/decision-graph.json', 'native evaluation decision graph').toString('utf8')));
    if (checked.value === undefined || checked.value.decisions.length === 0) {
      throw new Error('NATIVE_EVALUATION_DECISION_GRAPH_INVALID');
    }
  } catch (error) {
    return { stage: 'production', owner: 'omd-hand', action: 'author-evaluation-decision',
      next: 'omd schema decision-entry --json', problems: [reason(error)],
      instruction: 'Obtain an actual owner-authored production decision from Hand, using its implementation and durable evidence. The coordinator preserves the returned entry unchanged and publishes it through deliberate append, then deliberate check. Do not invent an owner handback or patch the final graph. Browser evidence remains required.',
      procedure: { read: 'omd pack protocol/design-deliberation.md', steps: [
        'omd brief production --json',
        'omd schema decision-entry --json',
        'omd deliberate append --input .omd/.cache/decision-entry.json --json',
        'omd deliberate check --json',
      ], limits: 'Only actual owner decisions; no browser execution, approval or completion is established by append.' } } as const;
  }
  let graph: ReturnType<typeof checkNativeBrowserEvidence>;
  try { graph = checkNativeBrowserEvidence(root, invocation); }
  catch (error) {
    const problem = reason(error);
    if (route.sourceContract.processPolicy && /surface-captures\.json|native surface coverage|surface capture|surface mapping|content[- ]case|content stress/i.test(problem)) {
      return { ...WORK.surface, problems: [problem],
        procedure: { read: 'omd pack protocol/native-pi-completion.md', steps: [
          'omd schema surface-captures --json',
          'omd lifecycle surface-captures --input .omd/.cache/surface-captures-input.json --json',
        ], limits: 'Only current successful native measurement/capture receipts and required content proofs may be published. A route without composition still needs its explicit route-owned applicability skip; this procedure cannot infer one. Publication does not waive measured slop or independent review.' } };
    }
    if (error instanceof FinalOutcomeGateError
      && (error.code === 'FINAL_BEHAVIOR_FAILED' || error.code === 'FINAL_ACCESS_FAILED'
        || error.code === 'FINAL_SAFETY_FAILED' || error.code === 'FINAL_REQUIRED_OUTCOME_FAILED')) {
      return { ...browserWork, action: 'repair-browser-evidence',
        next: 'omd brief browser-evidence --json', problems: [problem],
        procedure: { read: 'omd pack protocol/native-pi-completion.md',
          steps: ['omd brief browser-evidence --json', 'omd schema trusted-lifecycle-manifest --json'],
          limits: 'These commands inspect the repair contract, not rerun evaluation. Diagnose the current failed evidence and repair the owned proposal or authorized application input before refreshing evaluation. No failure, requirement, authority boundary or independent-review gate is waived.' },
        instruction: 'Inspect the current failed trusted receipt, captures and executed plan before another evaluation. Determine whether the defect is in the implementation or the authored assertions. Use preserved-text for content already visible before an action, and visible-text for a newly rendered consequence; preservation does not replace required state change. Hand repairs application defects only through the authorized native maker; the coordinator repairs its owned proposal without changing requirements, signed results or failure floors. Reevaluate after the affected input changes, not as an unchanged retry. Retain the failed evidence chain and refresh all affected captures before independent review.' } as const;
    }
    return { ...browserWork, problems: [problem] };
  }
  if (requiresMeasuredTerminal(route)) {
    try { checkRouteMeasuredSlopReview(root, invocation); }
    catch (error) {
      return { ...WORK.slop, next: 'omd schema slop-measured-scope --json',
        problems: [reason(error)],
        instruction: 'Use the current authenticated browser measurement receipts and required supplemental surface packets for a measured slop checkpoint. Inspect its saved whole captures, publish each scoped finding judgment and run slop review-check before isolated final review. Historical v1 screenshots do not satisfy measured closure; preserve all failed evidence and required states.',
        procedure: { read: 'omd pack protocol/slop-review.md', steps: [
          'omd schema slop-measured-scope --json',
          'omd slop checkpoint --input .omd/.cache/slop-measured-scope.json --json',
          'omd slop review-set --input .omd/.cache/slop-review.json --json',
          'omd slop review-check --json',
        ], limits: 'Only current native measurement receipts and evidence-citing finding judgments. No source mutation, waived floor or independent visual approval is established by this procedure.' } };
    }
  }
  try { checkNativeFinalReview({ root, invocation }); }
  catch (error) { return { ...WORK.review, problems: [reason(error)] }; }
  let final: ReturnType<typeof checkFinalEvidenceV2>;
  try { final = checkFinalEvidenceV2(root, invocation); }
  catch (error) { return { ...WORK.finalize, problems: [reason(error)] }; }
  const { application, limitations } = completionLimitations(root, route);
  if (application) {
    try { checkReferenceApplicationReview(root, referenceApplicationReviewContext(root, application, final.graph)); }
    catch (error) { return { ...WORK.application, problems: [reason(error)], limitations }; }
  }
  try { checkTerminalCompletion(root, invocation); }
  catch (error) { return { ...WORK.completion, problems: [reason(error)] }; }
  return { stage: null, owner: 'coordinator', action: 'validate-selected-gates', next: 'omd guard completion --json',
    instruction: 'Current terminal evidence passed read-only validation. Include every limitation in the final handoff; no reference-grounding or cultural-fit claim is implied.', problems: [], limitations };
}
