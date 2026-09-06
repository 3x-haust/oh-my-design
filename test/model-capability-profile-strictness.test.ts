import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODEL_CAPABILITY_PROBE_RESULT_INPUT_SCHEMA,
  applyModelCapabilityProbeResult,
  parseModelCapabilityProfile,
  routeModelCapabilityProbe,
} from '../core/route/index.ts';
import {
  assertProfileError,
  firstCapability,
  routingInput,
  secondCapability,
  selectedModel,
  validProfile,
} from './model-capability-profile-fixtures.ts';

test('parser rejects repeated-failure reason when expiry has higher precedence at decidedAt', () => {
  // Given: one profile that is both expired and repeatedly failing at its recorded decision time.
  const profile = validProfile();
  profile.failures.push(
    { capability: 'structured-output', failure: 'invalid-output', occurredAt: 1_300 },
    { capability: 'structured-output', failure: 'invalid-output', occurredAt: 1_400 },
  );
  profile.probeDecision = { action: 'probe', reason: 'repeated-relevant-failure', decidedAt: 2_000 };

  // When: the lower-priority historical reason is parsed. Then: precedence makes it contradictory.
  assertProfileError(() => parseModelCapabilityProfile(profile, 2_000), 'CONTRADICTORY_PROBE_DECISION');
});

test('unknown, hidden, Symbol, accessor, and proxy input fails closed', () => {
  assertProfileError(
    () => parseModelCapabilityProfile({ ...validProfile(), extra: true }, 1_500),
    'UNEXPECTED_MODEL_CAPABILITY_FIELD',
  );
  assertProfileError(
    () => routeModelCapabilityProbe({ ...routingInput(validProfile()), extra: true }, 1_500),
    'UNEXPECTED_MODEL_CAPABILITY_FIELD',
  );
  const hidden = validProfile();
  Object.defineProperty(hidden, 'concealed', { value: true });
  assertProfileError(() => parseModelCapabilityProfile(hidden, 1_500), 'UNEXPECTED_MODEL_CAPABILITY_FIELD');

  const symbolic = validProfile();
  Object.defineProperty(symbolic.selectedModel, Symbol('concealed'), { value: true });
  assertProfileError(() => parseModelCapabilityProfile(symbolic, 1_500), 'UNEXPECTED_MODEL_CAPABILITY_FIELD');

  let getterRead = false;
  const accessor = validProfile();
  Object.defineProperty(accessor, 'expiresAt', {
    enumerable: true,
    get: () => {
      getterRead = true;
      return 2_000;
    },
  });
  assertProfileError(() => parseModelCapabilityProfile(accessor, 1_500), 'MALFORMED_MODEL_CAPABILITY_PROFILE');
  assert.equal(getterRead, false);

  const hostile = new Proxy({}, { ownKeys: () => { throw new Error('proxy trap'); } });
  assertProfileError(() => routeModelCapabilityProbe(hostile, 1_500), 'MALFORMED_MODEL_CAPABILITY_PROFILE');
});

test('profile parsing rejects an inherited enumerable provider override', () => {
  // Given: valid own profile fields on an object carrying inherited model-selection authority.
  const inherited: object = Object.create({ providerOverride: 'evil' });
  Object.assign(inherited, validProfile());

  // When: the polluted boundary value is parsed. Then: inherited authority fails closed.
  assertProfileError(() => parseModelCapabilityProfile(inherited, 1_500), 'UNEXPECTED_MODEL_CAPABILITY_FIELD');
});

test('profile parsing rejects inherited enumerable __proto__ pollution', () => {
  // Given: a null-prototype parent with an enumerable __proto__ authority payload.
  const pollutedPrototype = Object.create(null);
  Object.defineProperty(pollutedPrototype, '__proto__', {
    value: { providerOverride: 'evil' },
    enumerable: true,
  });
  const inherited: object = Object.create(pollutedPrototype);
  Object.assign(inherited, validProfile());

  // When: the polluted boundary value is parsed. Then: ordinary Object.prototype remains benign.
  assertProfileError(() => parseModelCapabilityProfile(inherited, 1_500), 'UNEXPECTED_MODEL_CAPABILITY_FIELD');
});

test('decorated arrays and nested accessors fail closed without executing getters', () => {
  const decorated = validProfile();
  Object.defineProperty(decorated.capabilities, 'hidden', { value: true });
  assertProfileError(() => parseModelCapabilityProfile(decorated, 1_500), 'UNEXPECTED_MODEL_CAPABILITY_FIELD');

  const symbolic = validProfile();
  Object.defineProperty(symbolic.failures, Symbol('extra'), { value: true });
  assertProfileError(() => parseModelCapabilityProfile(symbolic, 1_500), 'UNEXPECTED_MODEL_CAPABILITY_FIELD');

  let getterRead = false;
  const accessor = validProfile();
  Object.defineProperty(firstCapability(accessor), 'status', {
    enumerable: true,
    get: () => {
      getterRead = true;
      return 'supported';
    },
  });
  assertProfileError(() => parseModelCapabilityProfile(accessor, 1_500), 'MALFORMED_MODEL_CAPABILITY_PROFILE');
  assert.equal(getterRead, false);
});

test('invalid or duplicate capability and failure records have stable typed errors', () => {
  const invalidCapability = validProfile();
  firstCapability(invalidCapability).capability = 'telepathy';
  assertProfileError(() => parseModelCapabilityProfile(invalidCapability, 1_500), 'INVALID_CAPABILITY_RECORD');

  const contradictorySupport = validProfile();
  secondCapability(contradictorySupport).supportNeed = 'tool-use-card';
  assertProfileError(() => parseModelCapabilityProfile(contradictorySupport, 1_500), 'INVALID_CAPABILITY_RECORD');

  const duplicateCapability = validProfile();
  duplicateCapability.capabilities.push({ capability: 'structured-output', status: 'limited', supportNeed: 'structured-output-card' });
  assertProfileError(() => parseModelCapabilityProfile(duplicateCapability, 1_500), 'DUPLICATE_CAPABILITY_RECORD');

  const invalidFailure = validProfile();
  invalidFailure.failures.push({ capability: 'structured-output', failure: 'tool-call-failed', occurredAt: 1_300 });
  assertProfileError(() => parseModelCapabilityProfile(invalidFailure, 1_500), 'INVALID_FAILURE_RECORD');

  const missingCapability = validProfile();
  missingCapability.failures.push({ capability: 'failure-recovery', failure: 'recovery-failed', occurredAt: 1_300 });
  assertProfileError(() => parseModelCapabilityProfile(missingCapability, 1_500), 'INVALID_FAILURE_RECORD');

  const duplicateFailure = validProfile();
  duplicateFailure.failures.push(
    { capability: 'tool-use', failure: 'tool-call-failed', occurredAt: 1_300 },
    { capability: 'tool-use', failure: 'tool-call-failed', occurredAt: 1_300 },
  );
  assertProfileError(() => parseModelCapabilityProfile(duplicateFailure, 1_500), 'DUPLICATE_FAILURE_RECORD');
});

test('non-finite, negative, future, and inconsistent timestamps fail closed', () => {
  for (const observedAt of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1_501]) {
    assertProfileError(
      () => parseModelCapabilityProfile({ ...validProfile(), observedAt }, 1_500),
      'INVALID_MODEL_CAPABILITY_TIMESTAMP',
    );
  }
  assertProfileError(
    () => parseModelCapabilityProfile({ ...validProfile(), expiresAt: 1_000 }, 1_500),
    'INCONSISTENT_MODEL_CAPABILITY_TIMESTAMP',
  );
  const futureFailure = validProfile();
  futureFailure.failures.push({ capability: 'tool-use', failure: 'tool-call-failed', occurredAt: 1_501 });
  assertProfileError(() => parseModelCapabilityProfile(futureFailure, 1_500), 'INVALID_MODEL_CAPABILITY_TIMESTAMP');

  const futureDecision = validProfile();
  futureDecision.probeDecision.decidedAt = 1_501;
  assertProfileError(() => parseModelCapabilityProfile(futureDecision, 1_500), 'INVALID_MODEL_CAPABILITY_TIMESTAMP');

  const earlyDecision = validProfile();
  earlyDecision.probeDecision.decidedAt = 999;
  assertProfileError(() => parseModelCapabilityProfile(earlyDecision, 1_500), 'INCONSISTENT_MODEL_CAPABILITY_TIMESTAMP');
  assertProfileError(() => routeModelCapabilityProbe(routingInput(validProfile()), -1), 'INVALID_MODEL_CAPABILITY_TIMESTAMP');
});

test('parsed profiles and routing are detached from mutable input', () => {
  const source = validProfile();
  const parsed = parseModelCapabilityProfile(source, 1_500);
  const routed = routeModelCapabilityProbe(routingInput(source), 1_500);

  source.selectedModel.provider = 'changed-provider';
  firstCapability(source).status = 'supported';
  source.failures.push({ capability: 'tool-use', failure: 'tool-call-failed', occurredAt: 1_300 });
  source.probeDecision.reason = 'model-updated';

  const parsedCapability = parsed.capabilities[0];
  assert.ok(parsedCapability);
  assert.deepEqual(parsed.selectedModel, selectedModel());
  assert.equal(parsedCapability.status, 'limited');
  assert.deepEqual(parsed.failures, []);
  assert.deepEqual(parsed.probeDecision, { action: 'skip', reason: 'fresh-profile', decidedAt: 1_100 });
  assert.deepEqual(routed.selectedModel, selectedModel());
  assert.equal(routed.probeDecision.reason, 'fresh-profile');
  assert.equal(Object.isFrozen(parsed.capabilities), true);
  assert.equal(Object.isFrozen(parsedCapability), true);
  assert.equal(Object.isFrozen(parsed.failures), true);
  assert.equal(Object.isFrozen(parsed.probeDecision), true);
});

test('model mismatch and contradictory probe reasons fail closed', () => {
  const mismatchedResultModel = selectedModel();
  mismatchedResultModel.provider = 'different-provider';
  assertProfileError(() => applyModelCapabilityProbeResult({
    schema: MODEL_CAPABILITY_PROBE_RESULT_INPUT_SCHEMA,
    selectedModel: selectedModel(),
    result: {
      selectedModel: mismatchedResultModel,
      capabilities: [{ capability: 'tool-use', status: 'supported', supportNeed: 'none' }],
      observedAt: 1_000,
      expiresAt: 2_000,
      failures: [],
    },
  }, 1_100), 'MODEL_CAPABILITY_IDENTITY_MISMATCH');

  const wrongAction = validProfile();
  wrongAction.probeDecision.action = 'probe';
  assertProfileError(() => parseModelCapabilityProfile(wrongAction, 1_500), 'CONTRADICTORY_PROBE_DECISION');

  const prematureExpiry = validProfile();
  prematureExpiry.probeDecision.action = 'probe';
  prematureExpiry.probeDecision.reason = 'profile-expired';
  assertProfileError(() => parseModelCapabilityProfile(prematureExpiry, 1_500), 'CONTRADICTORY_PROBE_DECISION');

  const unsupportedReason = validProfile();
  unsupportedReason.probeDecision.reason = 'because-I-said-so';
  assertProfileError(() => parseModelCapabilityProfile(unsupportedReason, 1_500), 'CONTRADICTORY_PROBE_DECISION');
});
