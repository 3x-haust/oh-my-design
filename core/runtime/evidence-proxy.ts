import { createHash, randomUUID } from 'node:crypto';
/** Retained for callers that size evidence; receipts are never inline. */
export const MAX_INLINE_EVIDENCE_BYTES = 8 * 1024 * 1024;
export const MAX_LOOPBACK_ALIAS_TTL_MS = 5 * 60 * 1000;

/** Metadata only: reviewer evidence bytes stay in the launch broker. */
export type BrokeredReviewerEvidence = {
  readonly kind: 'brokered';
  readonly sha256: string;
  readonly byteLength: number;
};

export type LoopbackEvidenceAlias = {
  readonly kind: 'loopback-alias';
  readonly alias: string;
  readonly sha256: string;
  readonly scope: string;
  readonly expiresAt: string;
  readonly byteLimit: number;
};

export type ReviewerEvidenceReceipt = BrokeredReviewerEvidence | LoopbackEvidenceAlias;

export type LoopbackAliasOptions = {
  readonly scope: string;
  readonly expiresAt: string;
  readonly byteLimit: number;
};

export class ReviewerIsolationError extends Error {
  override readonly name = 'ReviewerIsolationError';
  readonly reason: string;
  constructor(reason: string) {
    super(`reviewer isolation rejected: ${reason}`);
    this.reason = reason;
  }
}

function toPayload(value: unknown): Uint8Array {
  if (typeof value === 'string') return Buffer.from(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  throw new ReviewerIsolationError('evidence payload must be opaque bytes or text, not a path or tool declaration');
}

/**
 * Creates non-recoverable evidence metadata. This class deliberately retains no payload:
 * the reviewer launch broker is the sole holder of bytes and clears them after consumption.
 */
export class ReviewerEvidenceProxy {
  constructor(_now: () => number = Date.now) {}

  create(payloadInput: unknown, aliasOptions: LoopbackAliasOptions): LoopbackEvidenceAlias;
  create(payloadInput: unknown, aliasOptions?: LoopbackAliasOptions): ReviewerEvidenceReceipt;
  create(payloadInput: unknown, aliasOptions?: LoopbackAliasOptions): ReviewerEvidenceReceipt {
    const payload = toPayload(payloadInput);
    if (payload.byteLength === 0) throw new ReviewerIsolationError('evidence payload must not be empty');
    if (aliasOptions === undefined && payload.byteLength > MAX_INLINE_EVIDENCE_BYTES) {
      throw new ReviewerIsolationError(`brokered evidence payload exceeds ${MAX_INLINE_EVIDENCE_BYTES} bytes`);
    }
    if (aliasOptions !== undefined) {
      if (!aliasOptions.scope || !Number.isSafeInteger(aliasOptions.byteLimit) || aliasOptions.byteLimit !== payload.byteLength || !Number.isFinite(Date.parse(aliasOptions.expiresAt))) {
        throw new ReviewerIsolationError('alias metadata must exactly bind the evidence payload');
      }
      return Object.freeze({ kind: 'loopback-alias', alias: `omd-evidence://broker/${randomUUID()}`, sha256: createHash('sha256').update(payload).digest('hex'), scope: aliasOptions.scope, expiresAt: aliasOptions.expiresAt, byteLimit: payload.byteLength });
    }
    return Object.freeze({
      kind: 'brokered',
      sha256: createHash('sha256').update(payload).digest('hex'),
      byteLength: payload.byteLength,
    });
  }
  /** Evidence aliases were retired: only the launch broker can consume bytes. */
  consume(_request: { readonly alias: string; readonly scope: string; readonly maxBytes: number }): Uint8Array {
    throw new ReviewerIsolationError('reviewer evidence is held only by the launch broker');
  }
}

export function createReviewerEvidenceProxy(now?: () => number): ReviewerEvidenceProxy {
  return now === undefined ? new ReviewerEvidenceProxy() : new ReviewerEvidenceProxy(now);
}
