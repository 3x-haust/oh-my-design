import type { RecommendedMethodDecision } from '../ux/policy.ts';

export const MODEL_CAPABILITY_PROFILE_SCHEMA = 'model-capability-profile-v1';
export const MODEL_CAPABILITY_PROBE_ROUTING_INPUT_SCHEMA = 'model-capability-probe-routing-input-v1';
export const MODEL_CAPABILITY_PROBE_ROUTING_SCHEMA = 'model-capability-probe-routing-v1';
export const MODEL_CAPABILITY_PROBE_RESULT_INPUT_SCHEMA = 'model-capability-probe-result-input-v1';
export const REPEATED_RELEVANT_FAILURE_COUNT = 2;

export type ModelCapabilityProfileErrorCode =
  | 'MALFORMED_MODEL_CAPABILITY_PROFILE'
  | 'UNEXPECTED_MODEL_CAPABILITY_FIELD'
  | 'INVALID_MODEL_CAPABILITY_IDENTITY'
  | 'INVALID_CAPABILITY_RECORD'
  | 'DUPLICATE_CAPABILITY_RECORD'
  | 'INVALID_FAILURE_RECORD'
  | 'DUPLICATE_FAILURE_RECORD'
  | 'INVALID_MODEL_CAPABILITY_TIMESTAMP'
  | 'INCONSISTENT_MODEL_CAPABILITY_TIMESTAMP'
  | 'CONTRADICTORY_PROBE_DECISION'
  | 'MODEL_CAPABILITY_IDENTITY_MISMATCH';

export class ModelCapabilityProfileError extends Error {
  override readonly name = 'ModelCapabilityProfileError';
  readonly code: ModelCapabilityProfileErrorCode;

  constructor(code: ModelCapabilityProfileErrorCode) {
    super(code);
    this.code = code;
  }
}

export type SelectedModelIdentity = Readonly<{
  selection: string;
  provider: string;
  modelId: string;
  revision: string;
}>;

export type ModelCapability =
  | 'structured-output'
  | 'tool-use'
  | 'constraint-following'
  | 'scoped-editing'
  | 'failure-recovery';
export type ModelCapabilityStatus = 'supported' | 'limited' | 'unsupported';
export type ModelSupportNeed =
  | 'none'
  | 'structured-output-card'
  | 'tool-use-card'
  | 'constraint-card'
  | 'scoped-edit-card'
  | 'recovery-card';
export type ModelCapabilityObservation = Readonly<{
  capability: ModelCapability;
  status: ModelCapabilityStatus;
  supportNeed: ModelSupportNeed;
}>;

export type ModelCapabilityFailureKind =
  | 'invalid-output'
  | 'tool-call-failed'
  | 'constraint-violation'
  | 'scope-expansion'
  | 'recovery-failed';
export type ModelCapabilityFailure = Readonly<{
  capability: ModelCapability;
  failure: ModelCapabilityFailureKind;
  occurredAt: number;
}>;

export type ModelCapabilityProbeReason =
  | 'profile-missing'
  | 'model-updated'
  | 'profile-expired'
  | 'repeated-relevant-failure'
  | 'fresh-profile';
export type ModelCapabilityProbeDecision = Readonly<{
  action: 'probe' | 'skip';
  reason: ModelCapabilityProbeReason;
  decidedAt: number;
}>;

export type ModelCapabilityProfile = Readonly<{
  schema: typeof MODEL_CAPABILITY_PROFILE_SCHEMA;
  selectedModel: SelectedModelIdentity;
  capabilities: readonly ModelCapabilityObservation[];
  observedAt: number;
  expiresAt: number;
  failures: readonly ModelCapabilityFailure[];
  probeDecision: ModelCapabilityProbeDecision;
}>;
export type ModelCapabilitySupportCard = Readonly<{
  capability: ModelCapability;
  supportNeed: Exclude<ModelSupportNeed, 'none'>;
  recommendation: RecommendedMethodDecision;
}>;
export type ModelCapabilityRoutingSource = Readonly<{
  schema: typeof MODEL_CAPABILITY_PROBE_ROUTING_INPUT_SCHEMA;
  selectedModel: SelectedModelIdentity;
  profile: ModelCapabilityProfile | null;
}>;

export type ModelCapabilityProbeRouting = Readonly<{
  schema: typeof MODEL_CAPABILITY_PROBE_ROUTING_SCHEMA;
  owner: 'user-selected-model';
  selectedModel: SelectedModelIdentity;
  probeDecision: ModelCapabilityProbeDecision;
  recommendation: RecommendedMethodDecision;
  supportCards: readonly ModelCapabilitySupportCard[];
}>;

export function failModelCapability(code: ModelCapabilityProfileErrorCode): never {
  throw new ModelCapabilityProfileError(code);
}

export function validateModelCapabilityNow(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) {
    return failModelCapability('INVALID_MODEL_CAPABILITY_TIMESTAMP');
  }
}

export function sameSelectedModel(
  left: SelectedModelIdentity,
  right: SelectedModelIdentity,
): boolean {
  return left.selection === right.selection
    && left.provider === right.provider
    && left.modelId === right.modelId
    && left.revision === right.revision;
}
