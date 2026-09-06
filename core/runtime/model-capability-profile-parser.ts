import {
  MODEL_CAPABILITY_PROFILE_SCHEMA,
  ModelCapabilityProfileError,
  failModelCapability,
  validateModelCapabilityNow,
  type ModelCapabilityProbeDecision,
  type ModelCapabilityProbeReason,
  type ModelCapabilityProfile,
} from './model-capability-domain.ts';
import {
  dataValue,
  expiryTimestamp,
  objectValue,
  observedTimestamp,
  parseSelectedModelIdentity,
  requireExactKeys,
} from './model-capability-boundary.ts';
import {
  hasRepeatedRelevantFailure,
  parseCapabilities,
  parseFailures,
} from './model-capability-records.ts';

const PROFILE_KEYS: readonly string[] = [
  'schema',
  'selectedModel',
  'capabilities',
  'observedAt',
  'expiresAt',
  'failures',
  'probeDecision',
];
const DECISION_KEYS: readonly string[] = ['action', 'reason', 'decidedAt'];

function probeAction(value: unknown): 'probe' | 'skip' {
  if (value === 'probe' || value === 'skip') return value;
  return failModelCapability('CONTRADICTORY_PROBE_DECISION');
}

function probeReason(value: unknown): ModelCapabilityProbeReason {
  switch (value) {
    case 'profile-missing': return value;
    case 'model-updated': return value;
    case 'profile-expired': return value;
    case 'repeated-relevant-failure': return value;
    case 'fresh-profile': return value;
    default: return failModelCapability('CONTRADICTORY_PROBE_DECISION');
  }
}

function parseProbeDecision(input: unknown, now: number): ModelCapabilityProbeDecision {
  const record = objectValue(input);
  requireExactKeys(record, DECISION_KEYS);
  return Object.freeze({
    action: probeAction(dataValue(record, 'action')),
    reason: probeReason(dataValue(record, 'reason')),
    decidedAt: observedTimestamp(dataValue(record, 'decidedAt'), now),
  });
}

function unreachableReason(value: never): never {
  return failModelCapability('CONTRADICTORY_PROBE_DECISION');
}

function decisionMatchesPrecedence(profile: ModelCapabilityProfile): boolean {
  const decision = profile.probeDecision;
  const expired = decision.decidedAt >= profile.expiresAt;
  const repeated = hasRepeatedRelevantFailure(
    profile.failures,
    profile.observedAt,
    decision.decidedAt,
  );
  switch (decision.reason) {
    case 'model-updated':
      return decision.action === 'probe';
    case 'profile-expired':
      return decision.action === 'probe' && expired;
    case 'repeated-relevant-failure':
      return decision.action === 'probe' && !expired && repeated;
    case 'fresh-profile':
      return decision.action === 'skip' && !expired && !repeated;
    case 'profile-missing':
      return false;
    default:
      return unreachableReason(decision.reason);
  }
}

export function acceptModelCapabilityProfile(profile: ModelCapabilityProfile): ModelCapabilityProfile {
  if (profile.probeDecision.decidedAt < profile.observedAt) {
    return failModelCapability('INCONSISTENT_MODEL_CAPABILITY_TIMESTAMP');
  }
  if (!decisionMatchesPrecedence(profile)) {
    return failModelCapability('CONTRADICTORY_PROBE_DECISION');
  }
  return Object.freeze(profile);
}

export function parseModelCapabilityProfileValue(input: unknown, now: number): ModelCapabilityProfile {
  const record = objectValue(input);
  requireExactKeys(record, PROFILE_KEYS);
  if (dataValue(record, 'schema') !== MODEL_CAPABILITY_PROFILE_SCHEMA) {
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
  const selectedModel = parseSelectedModelIdentity(dataValue(record, 'selectedModel'));
  const capabilities = parseCapabilities(dataValue(record, 'capabilities'));
  const observedAt = observedTimestamp(dataValue(record, 'observedAt'), now);
  const expiresAt = expiryTimestamp(dataValue(record, 'expiresAt'));
  if (expiresAt <= observedAt) {
    return failModelCapability('INCONSISTENT_MODEL_CAPABILITY_TIMESTAMP');
  }
  const failures = parseFailures(dataValue(record, 'failures'), capabilities, now);
  const probeDecision = parseProbeDecision(dataValue(record, 'probeDecision'), now);
  return acceptModelCapabilityProfile({
    schema: MODEL_CAPABILITY_PROFILE_SCHEMA,
    selectedModel,
    capabilities,
    observedAt,
    expiresAt,
    failures,
    probeDecision,
  });
}

export function parseModelCapabilityProfile(input: unknown, now: number): ModelCapabilityProfile {
  try {
    validateModelCapabilityNow(now);
    return parseModelCapabilityProfileValue(input, now);
  } catch (error) {
    if (error instanceof ModelCapabilityProfileError) throw error;
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
}
