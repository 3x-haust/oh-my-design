import { loadRefs } from './store.ts';

/**
 * Deterministic capture-parallelism audit.
 *
 * Every saved reference carries a `capturedAt` timestamp. `omd ref add-batch` captures a whole set
 * concurrently over one browser, so their timestamps cluster within seconds; a sequential run of
 * `omd ref add` launches a separate browser per reference, so the timestamps spread out by tens of
 * seconds or minutes. The scout is told to batch known references in parallel — this measures whether
 * it actually did, from the recorded times, so the guidance can bite instead of being ignored.
 *
 * A warn, not a hard defect of the design: it reports a slow, serial research pass, not a broken build.
 */
export interface CaptureAudit {
  readonly ok: boolean;
  readonly refs: number;
  readonly medianGapSeconds: number;
  readonly reason: string;
}

/** Only judge captures from the current run (batching a week-old cached inventory is moot). */
const RECENT_MS = 6 * 60 * 60 * 1000;
/** A median gap this large between consecutive captures means a separate browser launch each. */
const SEQUENTIAL_GAP_MS = 15_000;
/** Batching is only material once several references were captured. */
const MIN_REFS = 4;

export type CaptureAuditRecord = {
  readonly capturedAt: string;
  readonly captureBatchId?: string;
};

export function auditCaptureRecords(records: readonly CaptureAuditRecord[], now: number = Date.now()): CaptureAudit {
  const recent = records.filter((record) => {
    const time = Date.parse(record.capturedAt);
    return Number.isFinite(time) && time <= now && now - time <= RECENT_MS;
  });
  if (recent.length >= MIN_REFS) {
    const groups = new Map<string, number>();
    for (const record of recent) {
      if (record.captureBatchId !== undefined) groups.set(record.captureBatchId, (groups.get(record.captureBatchId) ?? 0) + 1);
    }
    const batchedRefs = recent.reduce((count, record) => count + (
      record.captureBatchId !== undefined && (groups.get(record.captureBatchId) ?? 0) >= 2 ? 1 : 0
    ), 0);
    if (batchedRefs >= recent.length - 1) {
      const timing = auditCaptureTimes(recent.map((record) => record.capturedAt), now);
      return {
        ok: true,
        refs: recent.length,
        medianGapSeconds: timing.medianGapSeconds,
        reason: `${batchedRefs} of ${recent.length} references carry explicit shared-batch provenance; remote completion gaps do not imply separate browser launches`,
      };
    }
  }
  return auditCaptureTimes(recent.map((record) => record.capturedAt), now);
}
/** Pure core: judge a list of `capturedAt` strings. */
export function auditCaptureTimes(capturedAt: readonly string[], now: number = Date.now()): CaptureAudit {
  const times = capturedAt
    .map((s) => Date.parse(s))
    .filter((t) => Number.isFinite(t) && t <= now && now - t <= RECENT_MS)
    .sort((a, b) => a - b);

  if (times.length < MIN_REFS) {
    return { ok: true, refs: times.length, medianGapSeconds: 0, reason: `fewer than ${MIN_REFS} recent captures — batching is not material yet` };
  }

  const gaps = times.slice(1).map((t, i) => t - times[i]!).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  const medianSeconds = Math.round(median / 1000);

  if (median >= SEQUENTIAL_GAP_MS) {
    return {
      ok: false,
      refs: times.length,
      medianGapSeconds: medianSeconds,
      reason: `${times.length} references were captured sequentially — a median ${medianSeconds}s between captures, i.e. a separate browser launch each. Capture the known set in one pass with \`omd ref add-batch <manifest.json>\` (one browser for the whole batch) so the research runs in parallel. A lone late straggler is fine; an all-sequential pass is not.`,
    };
  }

  return {
    ok: true,
    refs: times.length,
    medianGapSeconds: medianSeconds,
    reason: `${times.length} references captured in a tight window (median ${medianSeconds}s between captures) — batched or parallel`,
  };
}

/** Read the saved reference records for `cwd` and audit explicit batch provenance before legacy timing. */
export function auditCaptureParallelism(cwd: string, now: number = Date.now()): CaptureAudit {
  return auditCaptureRecords(loadRefs(cwd).map((reference) => ({
    capturedAt: reference.capturedAt,
    ...(reference.captureBatchId === undefined ? {} : { captureBatchId: reference.captureBatchId }),
  })), now);
}
