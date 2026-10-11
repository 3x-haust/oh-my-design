export const NAVIGATION_BUDGET_MS = 60_000;
export const SEARCH_BUDGET_MS = 60_000;
export const REF_ADD_BUDGET_MS = 120_000;
export const BATCH_BUDGET_MS = 240_000;

const CLEANUP_BUDGET_MS = 2_000;

type DeadlineClock = Readonly<{
  now(): number;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}>;

type OwnedResource = { close(): Promise<unknown> };

export type AcquisitionDeadlineScope = Readonly<{
  signal: AbortSignal;
  own<R extends OwnedResource>(resource: R): R;
  assertLive(): void;
}>;

export class AcquisitionTimeoutError extends Error {
  override readonly name = 'AcquisitionTimeoutError';
  readonly code = 'REFERENCE_ACQUISITION_TIMEOUT';
  readonly budgetMs: number;
  readonly phase: string;

  constructor(budgetMs: number, phase: string) {
    super(`REFERENCE_ACQUISITION_TIMEOUT: ${phase} exceeded its ${budgetMs}ms acquisition budget`);
    this.budgetMs = budgetMs;
    this.phase = phase;
  }
}

const systemClock: DeadlineClock = {
  now: () => Date.now(),
  setTimeout,
  clearTimeout,
};

export async function withAcquisitionDeadline<T>(
  input: {
    budgetMs: number;
    phase: string;
    clock?: DeadlineClock;
    onExpire?: () => void | Promise<void>;
  },
  work: (scope: AcquisitionDeadlineScope) => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(input.budgetMs) || input.budgetMs <= 0) throw new Error('acquisition budget must be a positive finite number');
  const clock = input.clock ?? systemClock;
  const startedAt = clock.now();
  const expiresAt = startedAt + input.budgetMs;
  const controller = new AbortController();
  const resources = new Set<OwnedResource>();
  let expired = false;
  let settled = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

  const timeoutError = (): AcquisitionTimeoutError => new AcquisitionTimeoutError(input.budgetMs, input.phase);
  const close = (resource: OwnedResource): Promise<unknown> => Promise.resolve().then(() => resource.close());
  const scope: AcquisitionDeadlineScope = {
    signal: controller.signal,
    own<R extends OwnedResource>(resource: R): R {
      if (expired || settled || clock.now() >= expiresAt) void close(resource).catch(() => undefined);
      else resources.add(resource);
      return resource;
    },
    assertLive(): void {
      if (expired || settled || controller.signal.aborted || clock.now() >= expiresAt) throw timeoutError();
    },
  };

  const expiry = new Promise<never>((_resolve, reject) => {
    const expire = (): void => {
      if (settled || expired) return;
      expired = true;
      controller.abort(timeoutError());
      const cleanup = Promise.allSettled([
        ...(input.onExpire === undefined ? [] : [Promise.resolve().then(input.onExpire)]),
        ...[...resources].map(close),
      ]);
      const cap = new Promise<void>(resolve => {
        cleanupTimer = clock.setTimeout(resolve, CLEANUP_BUDGET_MS);
      });
      void Promise.race([cleanup, cap]).then(() => reject(timeoutError()), () => reject(timeoutError()));
    };
    expiryTimer = clock.setTimeout(expire, Math.max(0, expiresAt - clock.now()));
  });

  const running = Promise.resolve().then(() => work(scope)).then(value => {
    scope.assertLive();
    return value;
  });
  // The losing operation may settle after forced teardown. It must not become an
  // unhandled rejection or regain publication authority.
  void running.catch(() => undefined);
  try {
    return await Promise.race([running, expiry]);
  } finally {
    settled = true;
    if (expiryTimer !== undefined) clock.clearTimeout(expiryTimer);
    if (cleanupTimer !== undefined) clock.clearTimeout(cleanupTimer);
  }
}
