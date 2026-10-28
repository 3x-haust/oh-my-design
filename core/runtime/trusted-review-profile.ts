import { loadRoleProfile } from '../brief/profiles.ts';
import {
  REVIEWER_ITERATION_DISCIPLINE_CHECKLIST,
  WORDS_TYPE_FLOW_REVIEW_CHECKLIST,
} from './reviewer-task-checklist.ts';
export type ProfileReviewLane = 'blindLane' | 'fidelityLane' | 'protocolLane';
export function trustedReviewProfile(lane: ProfileReviewLane) {
  return loadRoleProfile('omd-eye', { blindLane: 'production-visual', fidelityLane: 'fidelity', protocolLane: 'protocol' }[lane]);
}
export function reviewProfileBinding(lane: ProfileReviewLane) {
  const { role, mode, sha256 } = trustedReviewProfile(lane); return { role, mode, sha256 };
}
export function measuredReviewerTask(lane: ProfileReviewLane): string {
  const profile = trustedReviewProfile(lane);
  const task = lane === 'blindLane' ? 'Judge only the anonymous production images and native measurements, never maker rationale or reference images. Optional temporal renders supplement comparison of observed states; they are not additional required measured views. Use settled measured renders for static design quality. A sampled intermediate frame does not establish the whole progression, speed, smoothness, input latency, interruption, reduced-motion parity or reference timing. The control-accessibility measurement covers form fields only (input, select, textarea): an empty list on a page without form fields is complete coverage, not missing evidence; judge buttons and links from the captures and the behavior evidence.'
    : lane === 'fidelityLane' ? 'Compare the production images against the supplied approved contracts and reference context. Complete every supplied consulted-reference component, state, viewport and digest comparison; a non-pass comparison requires findings and RED reference fidelity.'
    : 'Audit the native evidence, current source bindings, and publication protocol; do not replace deterministic checks with a judgment.';
  // Exactly one trusted profile body reaches the isolated task. Its digest also binds the system
  // identity, packet fixed fields and configuration; untrusted document prose cannot replace it.
  const checklist = lane === 'blindLane'
    ? ` ${WORDS_TYPE_FLOW_REVIEW_CHECKLIST} ${REVIEWER_ITERATION_DISCIPLINE_CHECKLIST}` : '';
  return `${task}${checklist} Assess every supplied required view/state. Return exactly the embedded output contract.\n\n${profile.source}`;
}
