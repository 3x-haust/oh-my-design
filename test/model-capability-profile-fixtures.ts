import assert from 'node:assert/strict';
import {
  MODEL_CAPABILITY_PROBE_ROUTING_INPUT_SCHEMA,
  MODEL_CAPABILITY_PROFILE_SCHEMA,
  ModelCapabilityProfileError,
  type ModelCapabilityProfileErrorCode,
} from '../core/route/index.ts';

export type MutableIdentity = {
  selection: string;
  provider: string;
  modelId: string;
  revision: string;
};
export type MutableCapability = {
  capability: string;
  status: string;
  supportNeed: string;
};
export type MutableFailure = {
  capability: string;
  failure: string;
  occurredAt: number;
};
export type MutableProfile = {
  schema: string;
  selectedModel: MutableIdentity;
  capabilities: MutableCapability[];
  observedAt: number;
  expiresAt: number;
  failures: MutableFailure[];
  probeDecision: { action: string; reason: string; decidedAt: number };
};

export const selectedModel = (): MutableIdentity => ({
  selection: 'openai-codex/gpt-5.6-sol#user-choice',
  provider: 'openai-codex',
  modelId: 'gpt-5.6-sol',
  revision: '2026-08-01',
});

export const validProfile = (): MutableProfile => ({
  schema: MODEL_CAPABILITY_PROFILE_SCHEMA,
  selectedModel: selectedModel(),
  capabilities: [
    { capability: 'structured-output', status: 'limited', supportNeed: 'structured-output-card' },
    { capability: 'tool-use', status: 'supported', supportNeed: 'none' },
  ],
  observedAt: 1_000,
  expiresAt: 2_000,
  failures: [],
  probeDecision: { action: 'skip', reason: 'fresh-profile', decidedAt: 1_100 },
});

export function firstCapability(profile: MutableProfile): MutableCapability {
  const value = profile.capabilities[0];
  if (value === undefined) throw new Error('test profile requires a first capability');
  return value;
}

export function secondCapability(profile: MutableProfile): MutableCapability {
  const value = profile.capabilities[1];
  if (value === undefined) throw new Error('test profile requires a second capability');
  return value;
}

export function routingInput(profile: unknown, model: unknown = selectedModel()) {
  return {
    schema: MODEL_CAPABILITY_PROBE_ROUTING_INPUT_SCHEMA,
    selectedModel: model,
    profile,
  };
}

export function assertProfileError(run: () => unknown, code: ModelCapabilityProfileErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ModelCapabilityProfileError);
    assert.equal(error.name, 'ModelCapabilityProfileError');
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}
