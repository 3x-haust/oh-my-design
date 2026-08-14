import {
  MODEL_CAPABILITY_PROBE_RESULT_INPUT_SCHEMA,
  MODEL_CAPABILITY_PROFILE_SCHEMA,
  ModelCapabilityProfileError,
  failModelCapability,
  sameSelectedModel,
  validateModelCapabilityNow,
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
import { parseCapabilities, parseFailures } from './model-capability-records.ts';
import { acceptModelCapabilityProfile } from './model-capability-profile-parser.ts';

const RESULT_INPUT_KEYS: readonly string[] = ['schema', 'selectedModel', 'result'];
const RESULT_KEYS: readonly string[] = [
  'selectedModel',
  'capabilities',
  'observedAt',
  'expiresAt',
  'failures',
];

export function applyModelCapabilityProbeResult(input: unknown, now: number): ModelCapabilityProfile {
  try {
    validateModelCapabilityNow(now);
    const record = objectValue(input);
    requireExactKeys(record, RESULT_INPUT_KEYS);
    if (dataValue(record, 'schema') !== MODEL_CAPABILITY_PROBE_RESULT_INPUT_SCHEMA) {
      return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
    }
    const selectedModel = parseSelectedModelIdentity(dataValue(record, 'selectedModel'));
    const result = objectValue(dataValue(record, 'result'));
    requireExactKeys(result, RESULT_KEYS);
    const observedModel = parseSelectedModelIdentity(dataValue(result, 'selectedModel'));
    if (!sameSelectedModel(selectedModel, observedModel)) {
      return failModelCapability('MODEL_CAPABILITY_IDENTITY_MISMATCH');
    }
    const capabilities = parseCapabilities(dataValue(result, 'capabilities'));
    const observedAt = observedTimestamp(dataValue(result, 'observedAt'), now);
    const expiresAt = expiryTimestamp(dataValue(result, 'expiresAt'));
    if (expiresAt <= observedAt) {
      return failModelCapability('INCONSISTENT_MODEL_CAPABILITY_TIMESTAMP');
    }
    const failures = parseFailures(dataValue(result, 'failures'), capabilities, now);
    return acceptModelCapabilityProfile({
      schema: MODEL_CAPABILITY_PROFILE_SCHEMA,
      selectedModel,
      capabilities,
      observedAt,
      expiresAt,
      failures,
      probeDecision: Object.freeze({ action: 'skip', reason: 'fresh-profile', decidedAt: now }),
    });
  } catch (error) {
    if (error instanceof ModelCapabilityProfileError) throw error;
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
}
