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

/** Read the saved reference records for `cwd` and audit their capture times. */
export function auditCaptureParallelism(cwd: string, now: number = Date.now()): CaptureAudit {
  return auditCaptureTimes(loadRefs(cwd).map((r) => r.capturedAt), now);
}
