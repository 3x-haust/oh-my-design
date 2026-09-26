import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkTerminalCompletion } from '../completion/preflight.ts';
import { checkFinalEvidenceV2 } from '../evidence/final-v2.ts';
import { readFrame } from '../frame/index.ts';
import { checkReferenceApplication } from '../ref/reference-application.ts';
import { checkReferenceApplicationReview, referenceApplicationReviewContext } from '../ref/reference-application-review.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { finalRenderReviewerPacket } from '../runtime/final-render-review.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { currentNativeFinalObservations } from '../runtime/native-final-manifest.ts';
import { checkNativeFinalReview } from '../runtime/native-final-review-state.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { checkSlopFinalGraph } from '../slop/review.ts';

const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function checkNativeBrowserEvidence(root: string, invocation: ProjectRunInvocation) {
  getNativePiRun(invocation, root);
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
  const route = readPersistedRoute(root, invocation);
  const entry = readFrame(root)?.entrySurface?.entryPath;
  if (entry !== undefined) {
    try { readContainedRegularFile(root, join(root, entry), 'production entry'); }
    catch (error) { return { ...WORK.production, problems: [reason(error)] }; }
  } else if (!existsSync(join(root, '.omd/observation-v2.json'))) {
    return { ...WORK.production, problems: ['No current production entry or authenticated browser observation is available.'] };
  }
  let graph: ReturnType<typeof checkNativeBrowserEvidence>;
  try { graph = checkNativeBrowserEvidence(root, invocation); }
  catch (error) { return { ...WORK.browser, problems: [reason(error)] }; }
  try { checkSlopFinalGraph(root, graph); }
  catch (error) { return { ...WORK.slop, problems: [reason(error)] }; }
  try { checkNativeFinalReview({ root, invocation }); }
  catch (error) { return { ...WORK.review, problems: [reason(error)] }; }
  let final: ReturnType<typeof checkFinalEvidenceV2>;
  try { final = checkFinalEvidenceV2(root, invocation); }
  catch (error) { return { ...WORK.finalize, problems: [reason(error)] }; }
  if (route.references.decision === 'discover') {
    try {
      const application = checkReferenceApplication(root, { expectedSourceContractSha256: route.sourceContractSha256,
        benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'), expectedRequest: route.request });
      checkReferenceApplicationReview(root, referenceApplicationReviewContext(root, application, final.graph));
    } catch (error) { return { ...WORK.application, problems: [reason(error)] }; }
  }
  try { checkTerminalCompletion(root, invocation); }
  catch (error) { return { ...WORK.completion, problems: [reason(error)] }; }
  return { stage: null, owner: 'coordinator', action: 'validate-selected-gates', next: 'omd guard completion --json',
    instruction: 'Current terminal evidence passed read-only validation. Use the completion guard for the final handoff.', problems: [] };
}
