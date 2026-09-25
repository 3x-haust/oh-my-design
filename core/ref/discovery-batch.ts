import type { Browser } from 'playwright';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { directDiscoveryEntry, discoveryLane, publicDiscoveryUrl, type DirectDiscoveryEntry, type DiscoveryLane,
  type DirectDiscoveryReceipt, type DiscoveryNavigationReceipt } from './discovery-record.ts';
import { captureReferenceNavigation, ReferenceNavigationError, type ReferenceDiscoveryAttemptReceipt } from './navigation-capture.ts';
import { executeReferenceSearch, parseSearchInput, readSearchExecution, searchObserved, type SearchExecution } from './search-execution.ts';

type SearchInput = ReturnType<typeof parseSearchInput>;
export type DiscoveryBatchItem = Readonly<{ kind: 'search'; input: SearchInput }>
  | Readonly<{ kind: 'navigate'; source: string; lane: DiscoveryLane; entry?: DirectDiscoveryEntry }>;
type SearchReceipt = Awaited<ReturnType<typeof executeReferenceSearch>>;
export type DiscoveryBatchOutcome = Readonly<{ kind: 'search'; lane: DiscoveryLane; source: string; ok: boolean;
  receipt?: SearchReceipt; status?: SearchExecution['status']; error?: string }>
  | Readonly<{ kind: 'navigate'; lane: DiscoveryLane; source: string; ok: boolean;
    receipt?: DiscoveryNavigationReceipt | DirectDiscoveryReceipt; attempt?: ReferenceDiscoveryAttemptReceipt; error?: string }>;
export type DiscoveryBatchResult = Readonly<{ concurrency: number; outcomes: readonly DiscoveryBatchOutcome[] }>;

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('discovery batch item must be a plain object');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Reflect.ownKeys(value);
  if (names.some(name => typeof name !== 'string' || ![...required, ...optional].includes(name)
    || !descriptors[name]?.enumerable || !('value' in descriptors[name]!))
    || required.some(name => !Object.hasOwn(descriptors, name))) throw new Error('discovery batch item has missing or unknown fields');
  return Object.fromEntries(Object.keys(descriptors).map(name => [name, descriptors[name]!.value]));
}

export function parseDiscoveryBatchInput(value: unknown): readonly DiscoveryBatchItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16 || Object.keys(value).length !== value.length) {
    throw new Error('discovery batch requires 1–16 independent operations');
  }
  const items = value.map((item: unknown): DiscoveryBatchItem => {
    const header = record(item, ['kind'], ['input', 'source', 'lane', 'entry']);
    if (header.kind === 'search') {
      const fields = record(item, ['kind', 'input']);
      return { kind: 'search', input: parseSearchInput(fields.input) };
    }
    if (header.kind === 'navigate') {
      const fields = record(item, ['kind', 'source', 'lane'], ['entry']);
      const lane = discoveryLane(fields.lane);
      return { kind: 'navigate', source: publicDiscoveryUrl(fields.source), lane,
        ...(fields.entry === undefined ? {} : { entry: directDiscoveryEntry(fields.entry, lane) }) };
    }
    throw new Error('discovery batch kind must be search or navigate');
  });
  const identities = items.map(item => item.kind === 'search' ? `search:${item.input.url}` : `navigate:${item.lane}:${item.source}:${item.entry ?? ''}`);
  if (new Set(identities).size !== identities.length) throw new Error('discovery batch cannot repeat an identical operation');
  return items;
}

export async function runDiscoveryBatch(
  browser: Browser, root: string, items: readonly DiscoveryBatchItem[], writer: ProjectWriteAdapter,
): Promise<DiscoveryBatchResult> {
  const concurrency = Math.min(4, items.length);
  const outcomes: DiscoveryBatchOutcome[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index]!;
      if (item.kind === 'search') {
        try {
          const receipt = await executeReferenceSearch(browser, item.input, writer);
          const execution = readSearchExecution(root, receipt, item.input.lane);
          outcomes[index] = { kind: 'search', source: item.input.url, lane: item.input.lane,
            ok: searchObserved(execution), receipt, status: execution.status, ...(execution.error ? { error: execution.error } : {}) };
        } catch (error) {
          outcomes[index] = { kind: 'search', source: item.input.url, lane: item.input.lane,
            ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      } else {
        try {
          const receipt = item.entry === undefined
            ? await captureReferenceNavigation(browser, item.source, item.lane, writer)
            : await captureReferenceNavigation(browser, item.source, item.lane, writer, item.entry);
          outcomes[index] = { kind: 'navigate', source: item.source, lane: item.lane, ok: true, receipt };
        } catch (error) {
          outcomes[index] = { kind: 'navigate', source: item.source, lane: item.lane, ok: false,
            ...(error instanceof ReferenceNavigationError && error.attempt ? { attempt: error.attempt } : {}),
            error: error instanceof Error ? error.message : String(error) };
        }
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { concurrency, outcomes };
}
