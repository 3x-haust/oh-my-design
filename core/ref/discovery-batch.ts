import type { Browser } from 'playwright';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { directDiscoveryEntry, discoveryLane, publicDiscoveryUrl, type DirectDiscoveryEntry, type DiscoveryLane,
  type DirectDiscoveryReceipt, type DiscoveryNavigationReceipt } from './discovery-record.ts';
import { captureReferenceNavigation, ReferenceNavigationError, type ReferenceDiscoveryAttemptReceipt, type ReferenceNavigationReceipt } from './navigation-capture.ts';
import { executeReferenceSearch, parseSearchInput, readSearchExecution, searchObserved, type SearchExecution } from './search-execution.ts';

import type { AcquisitionDeadlineScope } from './acquisition-deadline.ts';
import { createReferenceAcquisitionSession } from './acquisition-session.ts';
import { discoveryProvider, providerCircuitSummaries } from './provider-circuit.ts';
import { readCurrentReferenceDiscoveryEvidence } from './discovery-evidence.ts';
type SearchInput = ReturnType<typeof parseSearchInput>;
export type DiscoveryBatchItem = Readonly<{ kind: 'search'; input: SearchInput }>
  | Readonly<{ kind: 'navigate'; source: string; lane: DiscoveryLane; entry?: DirectDiscoveryEntry }>;
type SearchReceipt = Awaited<ReturnType<typeof executeReferenceSearch>>;
export type DiscoveryBatchOutcome = Readonly<{ kind: 'search'; lane: DiscoveryLane; source: string; ok: boolean;
  receipt?: SearchReceipt; status?: SearchExecution['status']; error?: string }>
  | Readonly<{ kind: 'navigate'; lane: DiscoveryLane; source: string; ok: boolean;
    receipt?: ReferenceNavigationReceipt; attempt?: ReferenceDiscoveryAttemptReceipt; error?: string }>;
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
  browser: Browser | null, root: string, items: readonly DiscoveryBatchItem[], writer: ProjectWriteAdapter,
  parentScope?: AcquisitionDeadlineScope,
): Promise<DiscoveryBatchResult> {
  const concurrency = Math.min(4, items.length);
  const outcomes: DiscoveryBatchOutcome[] = new Array(items.length);
  let next = 0;
  const providerQueues = new Map<string, Promise<void>>();
  const session = createReferenceAcquisitionSession(writer);
  const navigate = async (item: Extract<DiscoveryBatchItem, { kind: 'navigate' }>, index: number): Promise<void> => {
    const provider = item.lane === 'design' ? discoveryProvider(item.source) : null;
    if (provider && providerCircuitSummaries(readCurrentReferenceDiscoveryEvidence(root).design)
      .some(circuit => circuit.provider === provider)) {
      outcomes[index] = { kind: 'navigate', source: item.source, lane: item.lane, ok: false,
        error: `REFERENCE_PROVIDER_CIRCUIT_OPEN: ${provider}` };
      return;
    }
    try {
      const receipt = browser === null
        ? await session.navigate(item.source, item.lane, item.entry, parentScope)
        : await captureReferenceNavigation(browser, item.source, item.lane, writer, item.entry, parentScope);
      parentScope?.assertLive();
      outcomes[index] = { kind: 'navigate', source: item.source, lane: item.lane, ok: true, receipt };
    } catch (error) {
      outcomes[index] = { kind: 'navigate', source: item.source, lane: item.lane, ok: false,
        ...(error instanceof ReferenceNavigationError && error.attempt ? { attempt: error.attempt } : {}),
        error: error instanceof Error ? error.message : String(error) };
    }
  };
  const worker = async (): Promise<void> => {
    for (;;) {
      if (parentScope?.signal.aborted) return;
      const index = next++;
      if (index >= items.length) return;
      const item = items[index]!;
      if (item.kind === 'search') {
        try {
          if (browser === null) throw new Error('REFERENCE_SEARCH_UNAVAILABLE: legacy browser search requires an explicit browser');
          const receipt = await executeReferenceSearch(browser, item.input, writer);
          const execution = readSearchExecution(root, receipt, item.input.lane);
          outcomes[index] = { kind: 'search', source: item.input.url, lane: item.input.lane,
            ok: searchObserved(execution), receipt, status: execution.status, ...(execution.error ? { error: execution.error } : {}) };
        } catch (error) {
          outcomes[index] = { kind: 'search', source: item.input.url, lane: item.input.lane,
            ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      } else {
        const provider = item.lane === 'design' ? discoveryProvider(item.source) : null;
        if (provider === null) await navigate(item, index);
        else {
          const previous = providerQueues.get(provider) ?? Promise.resolve();
          const queued = previous.then(() => navigate(item, index));
          providerQueues.set(provider, queued);
          await queued;
        }
      }
    }
  };
  try { await Promise.all(Array.from({ length: concurrency }, () => worker())); }
  finally { await session.close(); }
  return { concurrency, outcomes };
}
