import {
  type ActivationContext,
  ActivationContextValidationError,
  type HostPayloadAuthorizationPurpose,
  isHostDerivedLocalCliInvocation,
  requireHostPayloadAuthorization,
  requireSameBuildActivation,
  validateActivationContext,
} from './activation.ts';
import {
  requireReviewerLaunchReceipt,
  type ReviewerLaunchReceipt,
} from '../../adapters/reviewer-mcp.ts';
export { createLocalCliInvocation } from './activation.ts';

export type CurrentRunIdentity = {
  readonly buildSha256: string;
  readonly loadedSkillSha256: string;
  readonly briefSha256: string;
};

export type ProjectRunInvocation = {
  readonly activation: ActivationContext;
  readonly current: CurrentRunIdentity;
};

export class InvocationValidationError extends Error {
  override readonly name = 'InvocationValidationError';

  readonly reason: string;

  constructor(reason: string) {
    super(`project run invocation is invalid: ${reason}`);
    this.reason = reason;
  }
}

/**
 * Validates the receipt at the capability boundary. A parsed receipt is not enough:
 * every mutation and reviewer handoff must bind it to the currently loaded run.
 */
export function validateCurrentProjectRun(invocation: ProjectRunInvocation): ActivationContext {
  try {
    if (typeof invocation !== 'object' || invocation === null || !('activation' in invocation) || !('current' in invocation)) {
      throw new InvocationValidationError('activation and current run identity are required');
    }
    if (typeof invocation.current !== 'object' || invocation.current === null) {
      throw new InvocationValidationError('current run identity is required');
    }
    const activation = validateActivationContext(invocation.activation);
    requireSameBuildActivation(
      activation,
      invocation.current.buildSha256,
      invocation.current.loadedSkillSha256,
      invocation.current.briefSha256,
    );
    return activation;
  } catch (error) {
    if (error instanceof ActivationContextValidationError) {
      throw new InvocationValidationError(error.reason);
    }
    throw error;
  }
}

export function requireProjectWriteInvocation(invocation: ProjectRunInvocation): ActivationContext {
  const activation = validateCurrentProjectRun(invocation);
  const { host } = activation.hostCapability;
  if (host === 'local') {
    if (!isHostDerivedLocalCliInvocation(invocation)) {
      throw new InvocationValidationError('local project-write capability must be derived by the running CLI');
    }
  } else if (host !== 'claude' && host !== 'codex') {
    throw new InvocationValidationError('benchmark hosts cannot receive project-write authority');
  }
  // Cross-process authority is deliberately checked with the project-root-bound
  // inherited descriptor at the mutation boundary, never from invocation JSON.
  return activation;
}
function requirePurposeBoundPayload(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  purpose: HostPayloadAuthorizationPurpose,
  payload: Uint8Array,
): ActivationContext {
  const activation = validateCurrentProjectRun(invocation);
  if (activation.hostCapability.host !== 'claude' && activation.hostCapability.host !== 'codex') {
    throw new InvocationValidationError(`${purpose} authority must be issued by a host launcher`);
  }
  try {
    requireHostPayloadAuthorization(invocation, projectRoot, purpose, payload);
  } catch (error) {
    const reason = error instanceof ActivationContextValidationError ? error.reason : 'missing host payload authorization';
    throw new InvocationValidationError(reason);
  }
  return activation;
}

/** A current-user intent event is authority only when the launcher bound its exact bytes. */
export function requireCurrentUserIntentEventAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  eventBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'current-user-intent-event', eventBytes);
}
export function requireCurrentIntentLedgerAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  ledgerBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'current-intent-ledger', ledgerBytes);
}

/** Evaluator assessment claims are never authorized by parsed JSON or a caller hash. */
export function requireEvaluatorAssessmentAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  assessmentBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'evaluator-assessment', assessmentBytes);
}

/** Evaluator result claims are never authorized by parsed JSON or a caller hash. */
export function requireEvaluatorResultAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  resultBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'evaluator-result', resultBytes);
}

export function requireApprovedMotionRecipeAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  receiptBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'approved-motion-recipe', receiptBytes);
}

export function requireFinalReviewerLaneAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  laneBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'final-reviewer-lane', laneBytes);
}
export function requireStaticReviewReceiptAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  reviewBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'static-review-receipt', reviewBytes);
}

export function requireStaticEvidenceResultAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  resultBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'static-evidence-result', resultBytes);
}

export function requireFinalEvidenceManifestAuthorization(
  invocation: ProjectRunInvocation,
  projectRoot: string,
  manifestBytes: Uint8Array,
): ActivationContext {
  return requirePurposeBoundPayload(invocation, projectRoot, 'final-evidence-manifest', manifestBytes);
}

/**
 * Reviewer isolation is proved by a receipt issued by the host launcher, not by a
 * caller-supplied capability boolean in ActivationContext.
 */
export function requireReviewerIsolationInvocation(
  invocation: ProjectRunInvocation,
  reviewerLaunch: ReviewerLaunchReceipt,
): ActivationContext {
  const activation = validateCurrentProjectRun(invocation);
  const { host } = activation.hostCapability;
  if (host !== 'claude' && host !== 'codex') {
    throw new InvocationValidationError('local and benchmark hosts cannot launch v2 reviewers');
  }
  try {
    requireReviewerLaunchReceipt(reviewerLaunch, {
      host,
      buildSha256: activation.buildSha256,
      loadedSkillSha256: activation.loadedSkillSha256,
      briefSha256: activation.briefSha256,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'missing host reviewer launch receipt';
    throw new InvocationValidationError(reason);
  }
  return activation;
}
