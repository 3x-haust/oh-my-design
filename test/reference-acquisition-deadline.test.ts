import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AcquisitionTimeoutError, withAcquisitionDeadline, NAVIGATION_BUDGET_MS, SEARCH_BUDGET_MS, REF_ADD_BUDGET_MS, BATCH_BUDGET_MS } from '../core/ref/acquisition-deadline.ts';

function clock() {
  let now = 0;
  let next = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    setTimeout: ((callback: () => void, delay: number) => {
      const id = ++next;
      timers.set(id, { at: now + delay, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeout: ((id: ReturnType<typeof setTimeout>) => { timers.delete(id as unknown as number); }) as typeof clearTimeout,
    advance(ms: number) {
      const end = now + ms;
      while (true) {
        const due = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = end;
    },
  };
}

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

test('deadline succeeds before expiry and clears its timer', async () => {
  const time = clock();
  assert.equal(await withAcquisitionDeadline({ budgetMs: 10, phase: 'test', clock: time }, async scope => {
    scope.assertLive();
    return 42;
  }), 42);
  time.advance(20);
  assert.deepEqual([NAVIGATION_BUDGET_MS, SEARCH_BUDGET_MS, REF_ADD_BUDGET_MS, BATCH_BUDGET_MS], [60_000, 60_000, 120_000, 240_000]);
});

test('deadline aborts, concurrently closes resources and rejects even if cleanup hangs; late publication is refused', async () => {
  const time = clock();
  const ready = deferred<{ assertLive(): void; own<R extends { close(): Promise<unknown> }>(resource: R): R; signal: AbortSignal }>();
  const work = deferred<number>();
  const calls: string[] = [];
  const running = withAcquisitionDeadline({ budgetMs: 10, phase: 'navigation', clock: time }, async scope => {
    scope.own({ close: async () => { calls.push('hung'); return new Promise<void>(() => undefined); } });
    scope.own({ close: async () => { calls.push('closed'); } });
    ready.resolve(scope);
    return work.promise;
  });
  const scope = await ready.promise;
  time.advance(10);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(scope.signal.aborted, true);
  assert.deepEqual(calls, ['hung', 'closed']);
  assert.throws(() => scope.assertLive(), AcquisitionTimeoutError);
  time.advance(2000);
  await assert.rejects(running, (error: unknown) => error instanceof AcquisitionTimeoutError && error.code === 'REFERENCE_ACQUISITION_TIMEOUT' && error.phase === 'navigation');
  scope.own({ close: async () => { calls.push('late'); } });
  work.resolve(3);
  await Promise.resolve();
  assert.ok(calls.includes('late'));
});
