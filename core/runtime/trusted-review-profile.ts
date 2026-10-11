import { loadRoleProfile } from '../brief/profiles.ts';
export type ProfileReviewLane = 'blindLane' | 'fidelityLane' | 'protocolLane';
export function trustedReviewProfile(lane: ProfileReviewLane) {
  return loadRoleProfile('omd-eye', { blindLane: 'production-visual', fidelityLane: 'fidelity', protocolLane: 'protocol' }[lane]);
}
export function reviewProfileBinding(lane: ProfileReviewLane) {
  const { role, mode, sha256 } = trustedReviewProfile(lane); return { role, mode, sha256 };
}
export function measuredReviewerTask(lane: ProfileReviewLane): string {
  const profile = trustedReviewProfile(lane);
  const task = lane === 'blindLane' ? 'Judge only the anonymous production images and native measurements, never maker rationale or reference images.'
    : lane === 'fidelityLane' ? 'Compare the production images against the supplied approved contracts and reference context.'
    : 'Audit the native evidence, current source bindings, and publication protocol; do not replace deterministic checks with a judgment.';
  // Exactly one trusted profile body reaches the isolated task. Its digest also binds the system
  // identity, packet fixed fields and configuration; untrusted document prose cannot replace it.
  return `${task} Assess every supplied required view/state. Return exactly the embedded output contract.\n\n${profile.source}`;
}
