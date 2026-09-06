import {
  UX_POLICY_SCHEMA,
  parseUxPolicy,
  type RecommendedMethodDecision,
} from '../ux/policy.ts';
import {
  MODEL_CAPABILITY_PROBE_ROUTING_INPUT_SCHEMA,
  MODEL_CAPABILITY_PROBE_ROUTING_SCHEMA,
  ModelCapabilityProfileError,
  failModelCapability,
  sameSelectedModel,
  validateModelCapabilityNow,
  type ModelCapabilityObservation,
  type ModelCapabilityProbeDecision,
  type ModelCapabilityProbeReason,
  type ModelCapabilityProbeRouting,
  type ModelCapabilityProfile,
  type ModelCapabilityRoutingSource,
  type ModelCapabilitySupportCard,
  type SelectedModelIdentity,
} from './model-capability-domain.ts';
import {
  dataValue,
  objectValue,
  parseSelectedModelIdentity,
  requireExactKeys,
} from './model-capability-boundary.ts';
import { hasRepeatedRelevantFailure } from './model-capability-records.ts';
import { parseModelCapabilityProfileValue } from './model-capability-profile-parser.ts';

const ROUTING_INPUT_KEYS: readonly string[] = ['schema', 'selectedModel', 'profile'];

function recommendation(status: 'selected' | 'skipped', reason: string): RecommendedMethodDecision {
  const value: RecommendedMethodDecision = Object.freeze({
    id: 'model-capability-probe',
    kind: 'recommended_method',
    status,
    reason,
  });
  parseUxPolicy({ schema: UX_POLICY_SCHEMA, decisions: [value] });
  return value;
}

function supportRecommendation(observation: ModelCapabilityObservation): RecommendedMethodDecision {
  const value: RecommendedMethodDecision = Object.freeze({
    id: `model-support-${observation.capability}`,
    kind: 'recommended_method',
    status: 'selected',
    reason: `Observed ${observation.capability} support is ${observation.status}; apply the ${observation.capability} support card.`,
  });
  parseUxPolicy({ schema: UX_POLICY_SCHEMA, decisions: [value] });
  return value;
}

function supportCards(profile: ModelCapabilityProfile): readonly ModelCapabilitySupportCard[] {
  const cards: ModelCapabilitySupportCard[] = [];
  for (const observation of profile.capabilities) {
    if (observation.supportNeed === 'none') continue;
    cards.push(Object.freeze({
      capability: observation.capability,
      supportNeed: observation.supportNeed,
      recommendation: supportRecommendation(observation),
    }));
  }
  return Object.freeze(cards);
}

function unreachableReason(value: never): never {
  return failModelCapability('CONTRADICTORY_PROBE_DECISION');
}

function recommendationReason(reason: ModelCapabilityProbeReason): string {
  switch (reason) {
    case 'profile-missing':
      return 'No capability profile exists for the selected model; observe it before applying support cards.';
    case 'model-updated':
      return 'The user-selected model identity or revision changed; refresh observations without replacing the selection.';
    case 'profile-expired':
      return 'The selected model capability profile expired; refresh observations before applying support cards.';
    case 'repeated-relevant-failure':
      return 'The fresh profile has repeated relevant failures; refresh the affected capability observations.';
    case 'fresh-profile':
      return 'The selected model has a fresh capability profile without repeated relevant failures.';
    default:
      return unreachableReason(reason);
  }
}

function probeRouting(
  selectedModel: SelectedModelIdentity,
  decision: ModelCapabilityProbeDecision,
  profile: ModelCapabilityProfile | null,
): ModelCapabilityProbeRouting {
  const shouldProbe = decision.action === 'probe';
  return Object.freeze({
    schema: MODEL_CAPABILITY_PROBE_ROUTING_SCHEMA,
    owner: 'user-selected-model',
    selectedModel,
    probeDecision: decision,
    recommendation: recommendation(
      shouldProbe ? 'selected' : 'skipped',
      recommendationReason(decision.reason),
    ),
    supportCards: shouldProbe || profile === null ? Object.freeze([]) : supportCards(profile),
  });
}

export function parseModelCapabilityRoutingSource(input: unknown, now: number): ModelCapabilityRoutingSource {
  try {
    validateModelCapabilityNow(now);
    const record = objectValue(input);
    requireExactKeys(record, ROUTING_INPUT_KEYS);
    if (dataValue(record, 'schema') !== MODEL_CAPABILITY_PROBE_ROUTING_INPUT_SCHEMA) {
      return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
    }
    const selectedModel = parseSelectedModelIdentity(dataValue(record, 'selectedModel'));
    const profileInput = dataValue(record, 'profile');
    const profile = profileInput === null ? null : parseModelCapabilityProfileValue(profileInput, now);
    return Object.freeze({ schema: MODEL_CAPABILITY_PROBE_ROUTING_INPUT_SCHEMA, selectedModel, profile });
  } catch (error) {
    if (error instanceof ModelCapabilityProfileError) throw error;
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
}

export function routeModelCapabilityProbe(input: unknown, now: number): ModelCapabilityProbeRouting {
  try {
    const source = parseModelCapabilityRoutingSource(input, now);
    if (source.profile === null) {
      return probeRouting(
        source.selectedModel,
        Object.freeze({ action: 'probe', reason: 'profile-missing', decidedAt: now }),
        null,
      );
    }
    const profile = source.profile;
    if (!sameSelectedModel(source.selectedModel, profile.selectedModel)) {
      return probeRouting(
        source.selectedModel,
        Object.freeze({ action: 'probe', reason: 'model-updated', decidedAt: now }),
        profile,
      );
    }
    if (profile.expiresAt <= now) {
      return probeRouting(
        source.selectedModel,
        Object.freeze({ action: 'probe', reason: 'profile-expired', decidedAt: now }),
        profile,
      );
    }
    if (hasRepeatedRelevantFailure(profile.failures, profile.observedAt, now)) {
      return probeRouting(
        source.selectedModel,
        Object.freeze({ action: 'probe', reason: 'repeated-relevant-failure', decidedAt: now }),
        profile,
      );
    }
    return probeRouting(
      source.selectedModel,
      Object.freeze({ action: 'skip', reason: 'fresh-profile', decidedAt: now }),
      profile,
    );
  } catch (error) {
    if (error instanceof ModelCapabilityProfileError) throw error;
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
}
