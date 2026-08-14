import assert from 'node:assert/strict';
import test from 'node:test';
import { emitClaude } from '../adapters/claude.ts';
import { emitCodex } from '../adapters/codex.ts';
import {
  MODEL_CAPABILITY_PROBE_RESULT_INPUT_SCHEMA,
  ModelCapabilityProfileError,
  applyModelCapabilityProbeResult,
  routeDesignAxes,
  routeModelCapabilityProbe,
  routeTaskOutcome,
} from '../core/route/index.ts';
import { parseModelCapabilityRoutingSource } from '../core/runtime/model-capability-routing.ts';
import { TASK_OUTCOME_CONTRACT_SCHEMA } from '../core/brief/task-outcome.ts';
import { UX_POLICY_SCHEMA, checkUxPolicy, parseUxPolicy } from '../core/ux/index.ts';
import { textFile } from './helpers.ts';
import { routingInput, selectedModel, validProfile } from './model-capability-profile-fixtures.ts';

const agent = {
  name: 'omd-eye',
  description: 'Reviews observed output.',
  reasoning: 'high',
  instructions: 'Review the output.\n',
};

test('current adapters leave the user-selected concrete model to host inheritance', () => {
  const codex = textFile(emitCodex({ agents: [agent] }), 'agents/omd-eye.toml');
  const claude = textFile(emitClaude({ agents: [agent] }), 'agents/omd-eye.md');

  assert.doesNotMatch(codex, /^model = /m);
  assert.match(codex, /^model_reasoning_effort = "high"$/m);
  assert.match(claude, /^model: inherit$/m);
  assert.match(claude, /^effort: high$/m);
});

test('a routine run with a fresh profile skips probing and emits only observed support recommendations', () => {
  const routed = routeModelCapabilityProbe(routingInput(validProfile()), 1_500);

  assert.deepEqual(routed.probeDecision, {
    action: 'skip',
    reason: 'fresh-profile',
    decidedAt: 1_500,
  });
  assert.deepEqual(routed.recommendation, {
    id: 'model-capability-probe',
    kind: 'recommended_method',
    status: 'skipped',
    reason: 'The selected model has a fresh capability profile without repeated relevant failures.',
  });
  assert.deepEqual(routed.supportCards, [{
    capability: 'structured-output',
    supportNeed: 'structured-output-card',
    recommendation: {
      id: 'model-support-structured-output',
      kind: 'recommended_method',
      status: 'selected',
      reason: 'Observed structured-output support is limited; apply the structured-output support card.',
    },
  }]);
  const checked = checkUxPolicy(parseUxPolicy({
    schema: UX_POLICY_SCHEMA,
    decisions: [routed.recommendation, ...routed.supportCards.map((card) => card.recommendation)],
  }));
  assert.deepEqual(checked.recommendations.map((item) => item.id), [
    'model-capability-probe',
    'model-support-structured-output',
  ]);
  assert.equal(routed.owner, 'user-selected-model');
  assert.equal(Object.isFrozen(routed), true);
  assert.equal(Object.isFrozen(routed.selectedModel), true);
  assert.equal(Object.isFrozen(routed.supportCards), true);
});

test('profile routing composes with task outcomes, design axes, and UX recommended methods', () => {
  const outcome = routeTaskOutcome({
    schema: TASK_OUTCOME_CONTRACT_SCHEMA,
    goal: 'Ship a reliable approval flow.',
    mustHave: ['Approval works with keyboard input.'],
    mustNotHave: ['Do not bypass confirmation.'],
    completionEvidence: ['A task probe completes approval.'],
    strategyFreedom: ['Choose the implementation order.'],
  });
  const axes = routeDesignAxes({
    schema: 'design-axis-input-v1',
    taskSize: 'medium',
    failureRisk: 'moderate',
    uxNeed: 'rigorous',
    expressiveDesignNeed: 'restrained',
  });
  const capability = routeModelCapabilityProbe(routingInput(validProfile()), 1_500);
  const checked = checkUxPolicy(parseUxPolicy({
    schema: UX_POLICY_SCHEMA,
    decisions: [axes.strategy.recommendation, capability.recommendation],
  }));

  assert.equal(outcome.strategy.owner, 'user-selected-model');
  assert.equal(axes.strategy.owner, outcome.strategy.owner);
  assert.equal(capability.owner, outcome.strategy.owner);
  assert.deepEqual(checked.recommendations.map((item) => item.id), [
    'design-strategy-operational-ux',
    'model-capability-probe',
  ]);
});

test('a selected model update triggers a justified probe without adopting stale identity', () => {
  const current = selectedModel();
  current.revision = '2026-08-10';
  const routed = routeModelCapabilityProbe(routingInput(validProfile(), current), 1_500);

  assert.deepEqual(routed.probeDecision, {
    action: 'probe',
    reason: 'model-updated',
    decidedAt: 1_500,
  });
  assert.equal(routed.recommendation.status, 'selected');
  assert.equal(routed.selectedModel.selection, current.selection);
  assert.equal(routed.selectedModel.provider, current.provider);
  assert.equal(routed.selectedModel.modelId, current.modelId);
  assert.equal(routed.selectedModel.revision, current.revision);
  assert.deepEqual(routed.supportCards, []);
});

test('an expired profile triggers a justified probe at the injected expiry boundary', () => {
  const routed = routeModelCapabilityProbe(routingInput(validProfile()), 2_000);
  assert.deepEqual(routed.probeDecision, {
    action: 'probe',
    reason: 'profile-expired',
    decidedAt: 2_000,
  });
  assert.deepEqual(routed.supportCards, []);
});

test('two relevant failures trigger while one or unrelated failures do not', () => {
  const one = validProfile();
  one.failures.push({ capability: 'structured-output', failure: 'invalid-output', occurredAt: 1_300 });
  assert.equal(routeModelCapabilityProbe(routingInput(one), 1_500).probeDecision.reason, 'fresh-profile');

  const unrelated = validProfile();
  unrelated.failures.push(
    { capability: 'structured-output', failure: 'invalid-output', occurredAt: 1_300 },
    { capability: 'tool-use', failure: 'tool-call-failed', occurredAt: 1_400 },
  );
  assert.equal(routeModelCapabilityProbe(routingInput(unrelated), 1_500).probeDecision.reason, 'fresh-profile');

  const repeated = validProfile();
  repeated.failures.push(
    { capability: 'structured-output', failure: 'invalid-output', occurredAt: 1_300 },
    { capability: 'structured-output', failure: 'invalid-output', occurredAt: 1_400 },
  );
  const routed = routeModelCapabilityProbe(routingInput(repeated), 1_500);
  assert.equal(routed.probeDecision.action, 'probe');
  assert.equal(routed.probeDecision.reason, 'repeated-relevant-failure');
  assert.deepEqual(routed.supportCards, []);
});

test('a missing profile requests an initial probe instead of guessing capabilities', () => {
  const routed = routeModelCapabilityProbe(routingInput(null), 1_500);
  assert.equal(routed.probeDecision.reason, 'profile-missing');
  assert.equal(routed.recommendation.status, 'selected');
  assert.deepEqual(routed.supportCards, []);
});

test('probe results change support cards while preserving selected identity byte for byte', () => {
  const current = selectedModel();
  const selectedBytes = current.selection;
  const profile = applyModelCapabilityProbeResult({
    schema: MODEL_CAPABILITY_PROBE_RESULT_INPUT_SCHEMA,
    selectedModel: current,
    result: {
      selectedModel: selectedModel(),
      capabilities: [
        { capability: 'constraint-following', status: 'unsupported', supportNeed: 'constraint-card' },
        { capability: 'tool-use', status: 'supported', supportNeed: 'none' },
      ],
      observedAt: 3_000,
      expiresAt: 4_000,
      failures: [],
    },
  }, 3_100);
  const routed = routeModelCapabilityProbe(routingInput(profile, current), 3_200);

  assert.equal(profile.selectedModel.selection, selectedBytes);
  assert.equal(profile.selectedModel.provider, current.provider);
  assert.equal(profile.selectedModel.modelId, current.modelId);
  assert.equal(profile.selectedModel.revision, current.revision);
  assert.equal(routed.selectedModel.selection, selectedBytes);
  assert.deepEqual(routed.supportCards.map((card) => card.supportNeed), ['constraint-card']);
  assert.equal(Object.hasOwn(profile, 'replacementModel'), false);
  assert.equal(Object.hasOwn(profile, 'providerOverride'), false);
  assert.equal(Object.hasOwn(routed, 'modelOverride'), false);
});

test('routing source parser normalizes hostile Proxy traps to its typed boundary error', () => {
  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error('hostile ownKeys trap');
    },
  });
  assert.throws(
    () => parseModelCapabilityRoutingSource(hostile, 1_500),
    (error: unknown) => error instanceof ModelCapabilityProfileError
      && error.code === 'MALFORMED_MODEL_CAPABILITY_PROFILE',
  );
});
