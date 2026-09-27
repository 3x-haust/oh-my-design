import { checkFinalEvidence, type FinalEvidence } from '../evidence/final.ts';

/** Migration-only verifier for already-published v1 final evidence. V1 publication remains disabled. */
export function verifyLegacyFinalEvidenceV1(root: string): FinalEvidence {
  return checkFinalEvidence(root);
}
