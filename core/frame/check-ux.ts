import type { Violation } from '../types.ts';
import { readFrame } from './index.ts';

/**
 * Validate that the frame artifact has been fully UX-interrogated.
 *
 * FRAME-UX-INCOMPLETE warns when `.omd/frame.md` exists but any of the three
 * UX anchor questions is unanswered:
 *   1. uxTask          — what task does the user arrive with?
 *   2. uxFrequentAction — what is the most frequent action on the primary screen?
 *   3. uxCostliestError — what is the costliest error, and what is the recovery path?
 *
 * These map to the three questions in theory/ux.md §Task-first framing and in
 * src/agents/framer.agent.yaml. The framer is expected to answer all three and
 * emit them via `omd frame set --task ... --frequent-action ... --costliest-error ...`.
 *
 * ── Scope boundary ───────────────────────────────────────────────────────────
 * This validator checks that the frame ARTIFACT is complete — that someone answered
 * the three questions before building. It does NOT verify that the rendered build
 * actually serves the named task: "does the page fulfil the user's task?" is a fuzzy
 * semantic judgment that requires the eye agent's task-first walk, not a string check.
 * Determining task-fulfillment from the IR alone would require reading the page copy,
 * understanding the user's domain context, and evaluating whether the named task is
 * achievable — all beyond deterministic measurement.
 *
 * What IS deterministic: whether the three fields are present and non-empty in the
 * frame's YAML frontmatter. A field absent or set to an empty string is a signal that
 * the framer skipped the question — which theory/ux.md §Task-first framing identifies
 * as the frame not being done.
 *
 * Only called when `.omd/frame.md` exists (the caller guards that).
 */
export function checkFrameUx(cwd: string): Violation[] {
  const frame = readFrame(cwd);
  if (!frame) return [];

  const missing: string[] = [];

  if (!frame.uxTask || String(frame.uxTask).trim().length === 0) {
    missing.push('uxTask (--task)');
  }
  if (!frame.uxFrequentAction || String(frame.uxFrequentAction).trim().length === 0) {
    missing.push('uxFrequentAction (--frequent-action)');
  }
  if (!frame.uxCostliestError || String(frame.uxCostliestError).trim().length === 0) {
    missing.push('uxCostliestError (--costliest-error)');
  }

  if (missing.length === 0) return [];

  return [
    {
      id: 'FRAME-UX-INCOMPLETE',
      severity: 'warn',
      layer: 1,
      category: 'ux',
      nodeId: 'page',
      path: 'frame',
      value: missing.join(', '),
      message:
        `The frame exists but the following UX anchor question${missing.length === 1 ? ' is' : 's are'} unanswered: `
        + `${missing.join('; ')}. `
        + 'A frame that cannot name the costliest error has not been interrogated. '
        + 'Run `omd frame set --task "..." --frequent-action "..." --costliest-error "..."` to complete it. '
        + 'See theory/ux.md §Task-first framing.',
    },
  ];
}
