import { createHash } from 'node:crypto';
import type { MotionDecision, Register } from '../art-direction/schema.ts';

export const INTENT_LEDGER_SCHEMA_VERSION = 'intent-ledger-v1' as const;
export const INTENT_CURRENT_POINTER_SCHEMA_VERSION = 'intent-current-v2' as const;

export type IntentLock = {
  readonly register?: Register;
  readonly motionDecision?: MotionDecision;
};

export type ExplicitIntentEvent = {
  readonly eventId: string;
  readonly sequence: number;
  readonly currentUser: true;
  readonly kind: 'explicit-intent';
  readonly lock: IntentLock;
  readonly recordedAt: string;
  readonly previousEventSha256: string | null;
};

export type BeatExceptionIntentEvent = {
  readonly eventId: string;
  readonly sequence: number;
  readonly currentUser: true;
  readonly kind: 'current-user-beat-exception';
  readonly lock: Record<never, never>;
  readonly recordedAt: string;
  readonly previousEventSha256: string | null;
};

/** A host-authorized, append-only current-user event; only this event can authorize an over-budget Beat set. */
export type IntentEvent = ExplicitIntentEvent | BeatExceptionIntentEvent;

export type IntentLedger = {
  readonly schemaVersion: typeof INTENT_LEDGER_SCHEMA_VERSION;
  readonly events: readonly IntentEvent[];
  readonly currentEventId: string | null;
};
export type IntentCurrentPointer = {
  readonly schemaVersion: typeof INTENT_CURRENT_POINTER_SCHEMA_VERSION;
  readonly record: string;
  readonly sha256: string;
};

export class IntentValidationError extends Error {
  override readonly name = 'IntentValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`intent ledger is invalid: ${reason}`);
    this.reason = reason;
  }
}

const SHA256 = /^[a-f0-9]{64}$/;
const EVENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const LEDGER_KEYS = ['schemaVersion', 'events', 'currentEventId'] as const;
const EVENT_KEYS = ['eventId', 'sequence', 'currentUser', 'kind', 'lock', 'recordedAt', 'previousEventSha256'] as const;
const POINTER_KEYS = ['schemaVersion', 'record', 'sha256'] as const;
const RECORD = /^intent-runs\/sha256-([a-f0-9]{64})\.json$/;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
/** The autonomous no-lock state contains no event and therefore no current-user claim. */
export function createEmptyIntentLedger(): IntentLedger {
  return Object.freeze({
    schemaVersion: INTENT_LEDGER_SCHEMA_VERSION,
    events: Object.freeze([]),
    currentEventId: null,
  });
}

export function validateIntentLedger(value: unknown): IntentLedger {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new IntentValidationError('ledger must be an object');
  }
  const ledger = value as Record<string, unknown>;
  if (!hasExactKeys(ledger, LEDGER_KEYS) || ledger.schemaVersion !== INTENT_LEDGER_SCHEMA_VERSION || !Array.isArray(ledger.events) || (typeof ledger.currentEventId !== 'string' && ledger.currentEventId !== null)) {
    throw new IntentValidationError('ledger has an invalid shape');
  }
  let previousHash: string | null = null;
  const eventIds = new Set<string>();
  ledger.events.forEach((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new IntentValidationError(`event ${index} must be an object`);
    const event = value as Record<string, unknown>;
    if (!hasExactKeys(event, EVENT_KEYS) || event.currentUser !== true
      || (event.kind !== 'explicit-intent' && event.kind !== 'current-user-beat-exception')
      || typeof event.eventId !== 'string' || !EVENT_ID.test(event.eventId)
      || event.sequence !== index + 1 || typeof event.recordedAt !== 'string' || Number.isNaN(Date.parse(event.recordedAt))
      || event.previousEventSha256 !== previousHash || typeof event.lock !== 'object' || event.lock === null || Array.isArray(event.lock)) {
      throw new IntentValidationError(`event ${index} is invalid or breaks append-only order`);
    }
    if (eventIds.has(event.eventId)) throw new IntentValidationError(`event ${index} duplicates eventId`);
    eventIds.add(event.eventId);
    const lock = event.lock as Record<string, unknown>;
    const validExplicitLock = event.kind === 'explicit-intent'
      && !Object.keys(lock).some((key) => key !== 'register' && key !== 'motionDecision')
      && (lock.register === undefined || ['quiet', 'confident', 'showpiece'].includes(String(lock.register)))
      && (lock.motionDecision === undefined || ['none', 'one'].includes(String(lock.motionDecision)))
      && (lock.register !== undefined || lock.motionDecision !== undefined);
    const validBeatException = event.kind === 'current-user-beat-exception' && Object.keys(lock).length === 0;
    if (!validExplicitLock && !validBeatException) {
      throw new IntentValidationError(`event ${index} does not contain its required typed intent`);
    }
    previousHash = eventHash(event as IntentEvent);
  });
  const currentId = ledger.currentEventId;
  if ((ledger.events.length === 0 && currentId !== null) || (ledger.events.length > 0 && currentId !== ledger.events.at(-1)?.eventId)) {
    throw new IntentValidationError('currentEventId must point to the final append-only event');
  }
  return ledger as IntentLedger;
}

export function eventHash(event: IntentEvent): string {
  return createHash('sha256').update(JSON.stringify({
    eventId: event.eventId,
    sequence: event.sequence,
    currentUser: event.currentUser,
    kind: event.kind,
    lock: event.lock,
    recordedAt: event.recordedAt,
    previousEventSha256: event.previousEventSha256,
  })).digest('hex');
}

export function appendExplicitIntent(
  ledger: IntentLedger,
  event: Omit<ExplicitIntentEvent | BeatExceptionIntentEvent, 'sequence' | 'previousEventSha256'>,
): IntentLedger {
  validateIntentLedger(ledger);
  if (event.currentUser !== true || (event.kind !== 'explicit-intent' && event.kind !== 'current-user-beat-exception')) {
    throw new IntentValidationError('only typed current-user intent events can be appended');
  }
  const last = ledger.events.at(-1);
  const next: IntentEvent = { ...event, sequence: ledger.events.length + 1, previousEventSha256: last === undefined ? null : eventHash(last) };
  return validateIntentLedger({ schemaVersion: INTENT_LEDGER_SCHEMA_VERSION, events: [...ledger.events, next], currentEventId: next.eventId });
}

export function resolveCurrentUserIntent(ledger: IntentLedger): IntentLock {
  validateIntentLedger(ledger);
  return ledger.events.findLast((event) => event.kind === 'explicit-intent')?.lock ?? {};
}

/** Null explicitly means no Beat exception; a non-null value is the exact host-authorized event receipt. */
export function resolveCurrentUserBeatExceptionReceipt(ledger: IntentLedger): string | null {
  validateIntentLedger(ledger);
  const event = ledger.events.findLast((candidate) => candidate.kind === 'current-user-beat-exception');
  return event === undefined ? null : eventHash(event);
}
/** The immutable ledger representation whose exact bytes are host-authorized. */
export function serializeIntentLedger(ledger: IntentLedger): Buffer {
  validateIntentLedger(ledger);
  return Buffer.from(JSON.stringify(ledger, null, 2));
}
export function intentLedgerSha256(ledger: IntentLedger): string {
  validateIntentLedger(ledger);
  return createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
}

export function validateIntentCurrentPointer(value: unknown): IntentCurrentPointer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new IntentValidationError('current pointer must be an object');
  }
  const pointer = value as Record<string, unknown>;
  if (!hasExactKeys(pointer, POINTER_KEYS)
    || pointer.schemaVersion !== INTENT_CURRENT_POINTER_SCHEMA_VERSION
    || typeof pointer.record !== 'string' || !RECORD.test(pointer.record)
    || typeof pointer.sha256 !== 'string' || !SHA256.test(pointer.sha256)) {
    throw new IntentValidationError('current pointer has an invalid shape');
  }
  return pointer as IntentCurrentPointer;
}
