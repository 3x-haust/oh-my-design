import {
  REPEATED_RELEVANT_FAILURE_COUNT,
  failModelCapability,
  type ModelCapability,
  type ModelCapabilityFailure,
  type ModelCapabilityFailureKind,
  type ModelCapabilityObservation,
  type ModelCapabilityStatus,
  type ModelSupportNeed,
} from './model-capability-domain.ts';
import {
  dataValue,
  objectValue,
  observedTimestamp,
  requireExactKeys,
  strictArray,
} from './model-capability-boundary.ts';

const CAPABILITY_KEYS: readonly string[] = ['capability', 'status', 'supportNeed'];
const FAILURE_KEYS: readonly string[] = ['capability', 'failure', 'occurredAt'];

function parseCapability(value: unknown, failureRecord: boolean): ModelCapability {
  switch (value) {
    case 'structured-output': return value;
    case 'tool-use': return value;
    case 'constraint-following': return value;
    case 'scoped-editing': return value;
    case 'failure-recovery': return value;
    default: return failModelCapability(failureRecord ? 'INVALID_FAILURE_RECORD' : 'INVALID_CAPABILITY_RECORD');
  }
}

function parseCapabilityStatus(value: unknown): ModelCapabilityStatus {
  switch (value) {
    case 'supported': return value;
    case 'limited': return value;
    case 'unsupported': return value;
    default: return failModelCapability('INVALID_CAPABILITY_RECORD');
  }
}

function parseSupportNeed(value: unknown): ModelSupportNeed {
  switch (value) {
    case 'none': return value;
    case 'structured-output-card': return value;
    case 'tool-use-card': return value;
    case 'constraint-card': return value;
    case 'scoped-edit-card': return value;
    case 'recovery-card': return value;
    default: return failModelCapability('INVALID_CAPABILITY_RECORD');
  }
}

function unreachableCapability(value: never): never {
  return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
}

function expectedSupportNeed(value: ModelCapability): Exclude<ModelSupportNeed, 'none'> {
  switch (value) {
    case 'structured-output': return 'structured-output-card';
    case 'tool-use': return 'tool-use-card';
    case 'constraint-following': return 'constraint-card';
    case 'scoped-editing': return 'scoped-edit-card';
    case 'failure-recovery': return 'recovery-card';
    default: return unreachableCapability(value);
  }
}

export function parseCapabilities(input: unknown): readonly ModelCapabilityObservation[] {
  const values = strictArray(input);
  if (values.length === 0) return failModelCapability('INVALID_CAPABILITY_RECORD');
  const seen = new Set<ModelCapability>();
  const parsed: ModelCapabilityObservation[] = [];
  for (const value of values) {
    const record = objectValue(value);
    requireExactKeys(record, CAPABILITY_KEYS);
    const capability = parseCapability(dataValue(record, 'capability'), false);
    const status = parseCapabilityStatus(dataValue(record, 'status'));
    const supportNeed = parseSupportNeed(dataValue(record, 'supportNeed'));
    if ((status === 'supported' && supportNeed !== 'none')
      || (status !== 'supported' && supportNeed !== expectedSupportNeed(capability))) {
      return failModelCapability('INVALID_CAPABILITY_RECORD');
    }
    if (seen.has(capability)) return failModelCapability('DUPLICATE_CAPABILITY_RECORD');
    seen.add(capability);
    parsed.push(Object.freeze({ capability, status, supportNeed }));
  }
  return Object.freeze(parsed);
}

function parseFailureKind(value: unknown): ModelCapabilityFailureKind {
  switch (value) {
    case 'invalid-output': return value;
    case 'tool-call-failed': return value;
    case 'constraint-violation': return value;
    case 'scope-expansion': return value;
    case 'recovery-failed': return value;
    default: return failModelCapability('INVALID_FAILURE_RECORD');
  }
}

function expectedFailure(value: ModelCapability): ModelCapabilityFailureKind {
  switch (value) {
    case 'structured-output': return 'invalid-output';
    case 'tool-use': return 'tool-call-failed';
    case 'constraint-following': return 'constraint-violation';
    case 'scoped-editing': return 'scope-expansion';
    case 'failure-recovery': return 'recovery-failed';
    default: return unreachableCapability(value);
  }
}

export function parseFailures(
  input: unknown,
  capabilities: readonly ModelCapabilityObservation[],
  now: number,
): readonly ModelCapabilityFailure[] {
  const values = strictArray(input);
  const observed = new Set(capabilities.map((entry) => entry.capability));
  const seen = new Set<string>();
  const parsed: ModelCapabilityFailure[] = [];
  for (const value of values) {
    const record = objectValue(value);
    requireExactKeys(record, FAILURE_KEYS);
    const capability = parseCapability(dataValue(record, 'capability'), true);
    const failure = parseFailureKind(dataValue(record, 'failure'));
    const occurredAt = observedTimestamp(dataValue(record, 'occurredAt'), now);
    if (!observed.has(capability) || failure !== expectedFailure(capability)) {
      return failModelCapability('INVALID_FAILURE_RECORD');
    }
    const key = `${capability}:${failure}:${occurredAt}`;
    if (seen.has(key)) return failModelCapability('DUPLICATE_FAILURE_RECORD');
    seen.add(key);
    parsed.push(Object.freeze({ capability, failure, occurredAt }));
  }
  return Object.freeze(parsed);
}

export function hasRepeatedRelevantFailure(
  failures: readonly ModelCapabilityFailure[],
  observedAt: number,
  through: number,
): boolean {
  const counts = new Map<ModelCapability, number>();
  for (const failure of failures) {
    if (failure.occurredAt < observedAt || failure.occurredAt > through) continue;
    const count = (counts.get(failure.capability) ?? 0) + 1;
    if (count >= REPEATED_RELEVANT_FAILURE_COUNT) return true;
    counts.set(failure.capability, count);
  }
  return false;
}
