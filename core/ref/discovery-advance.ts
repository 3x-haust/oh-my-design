import type { RouteRecord } from '../route/index.ts';
import type { Browser } from 'playwright';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import { referenceDiscoveryWork, legacyReferenceDiscoveryWork, type ReferenceDiscoveryWork } from './discovery-work.ts';
import { publishFailedAttempt, readReferenceDiscoveryAttempt, ReferenceNavigationError } from './navigation-capture.ts';
import { createReferenceAcquisitionSession } from './acquisition-session.ts';
import { withAcquisitionDeadline, NAVIGATION_BUDGET_MS, AcquisitionTimeoutError } from './acquisition-deadline.ts';
import { executeReferenceSearch, executeUserBrowserSearch, readSearchExecution } from './search-execution.ts';
import { readReferenceBrowserConfig } from './browser-config.ts';
import { withBrowser } from '../render/index.ts';
import { runDiscoveryBatch, type DiscoveryBatchOutcome } from './discovery-batch.ts';

export type ReferenceDiscoveryAdvance = Readonly<{
  schema: 'reference-discovery-advance-v1' | 'reference-discovery-advance-v2';
  outcome: 'observed' | 'unavailable' | 'needs-model-action' | 'stopped-with-debt';
  receipt: Readonly<{ path: string; sha256: string }> | null;
  previousWorkSha256: string;
  work: ReferenceDiscoveryWork;
  outcomes?: readonly DiscoveryBatchOutcome[];
}>;

export async function advanceReferenceDiscoveryWork(root: string, route: RouteRecord,
  writer: ProjectWriteAdapter, batchBrowser?: Browser | null): Promise<ReferenceDiscoveryAdvance> {
  if (batchBrowser !== undefined) return advanceLegacyReferenceDiscoveryWork(root, route, writer, batchBrowser);
  requireProjectWriteAdapter(root, writer);
  const work = referenceDiscoveryWork(root, route);
  return { schema: 'reference-discovery-advance-v2', outcome: work.status === 'stopped-with-debt' ? 'stopped-with-debt' : 'needs-model-action',
    receipt: null, previousWorkSha256: work.workSha256, work };
}

export async function advanceLegacyReferenceDiscoveryWork(root: string, route: RouteRecord,
  writer: ProjectWriteAdapter, batchBrowser: Browser | null = null): Promise<ReferenceDiscoveryAdvance> {
  requireProjectWriteAdapter(root, writer);
  const before = legacyReferenceDiscoveryWork(root, route);
  const action = before.action;
  if (before.status !== 'action' || action === null || action.lane === null) {
    throw new Error('REFERENCE_DISCOVERY_ADVANCE: no native acquisition action is pending');
  }
  if (action.kind === 'follow-link' && action.batchUrls !== undefined && action.batchUrls.length > 1) {
    const lane = action.lane;
    const batchUrls = action.batchUrls;
    const batch = await withAcquisitionDeadline({ budgetMs: NAVIGATION_BUDGET_MS, phase: 'ref advance independent sources' },
      scope => runDiscoveryBatch(batchBrowser, root,
        batchUrls.map(source => ({ kind: 'navigate' as const, source, lane })), writer, scope));
    let receipt: ReferenceDiscoveryAdvance['receipt'] | undefined;
    let observed = false;
    for (const item of batch.outcomes) {
      if (item.kind !== 'navigate') continue;
      if (item.ok && item.receipt !== undefined && !observed) {
        receipt = item.receipt.capture;
        observed = true;
      } else if (receipt === undefined && item.attempt !== undefined) receipt = item.attempt;
    }
    if (receipt === undefined) throw new Error(`REFERENCE_DISCOVERY_ADVANCE: no batch receipt: ${JSON.stringify(batch.outcomes)}`);
    return {
      schema: 'reference-discovery-advance-v1',
      outcome: observed ? 'observed' : 'unavailable',
      receipt, previousWorkSha256: before.workSha256, outcomes: batch.outcomes,
      work: legacyReferenceDiscoveryWork(root, route),
    };
  }
  let receipt: Readonly<{ path: string; sha256: string }>;
  let outcome: ReferenceDiscoveryAdvance['outcome'];
  const session = createReferenceAcquisitionSession(writer);
  try { switch (action.kind) {
    case 'search': {
      if (!action.input) throw new Error('REFERENCE_DISCOVERY_ADVANCE: missing search input');
      if (action.engine === 'user-browser') receipt = await executeUserBrowserSearch(action.input, writer);
      else {
        const config = readReferenceBrowserConfig();
        receipt = await withBrowser(browser => executeReferenceSearch(browser, action.input!, writer), undefined,
          { reference: true, config });
        const first = readSearchExecution(root, receipt, action.lane);
        // A fresh, signed page-access judgment is required before requesting human handoff.
        // The search attempt remains available as evidence even when access is unclear.
        void first;
      }
      readSearchExecution(root, receipt, action.lane);
      outcome = readSearchExecution(root, receipt, action.lane).status === 'page-observed' ? 'observed' : 'unavailable';
      break;
    }
    case 'direct-entry':
    case 'follow-link': {
      if (action.url === undefined) throw new Error('REFERENCE_DISCOVERY_ADVANCE: missing observed public URL');
      const url = action.url;
      try {
        const native = await withAcquisitionDeadline({ budgetMs: NAVIGATION_BUDGET_MS, phase: 'ref advance navigation' },
          scope => session.navigate(url, action.lane!, action.kind === 'direct-entry' ? action.entry : undefined, scope));
        receipt = native.capture;
        outcome = 'observed';
      } catch (error) {
        const attempt = error instanceof ReferenceNavigationError ? error.attempt
          : error instanceof AcquisitionTimeoutError ? publishFailedAttempt(writer, url, action.lane!,
            action.kind === 'direct-entry' ? action.entry : undefined, null, error) : undefined;
        if (attempt === undefined) throw error;
        readReferenceDiscoveryAttempt(root, attempt);
        receipt = attempt;
        outcome = 'unavailable';
      }
      break;
    }
    case 'collect-leads':
      throw new Error('REFERENCE_DISCOVERY_ADVANCE: follow the collect-leads action (host search if available, otherwise omd ref leads search via DuckDuckGo HTML)');
    case 'browser-consent':
      throw new Error('REFERENCE_DISCOVERY_ADVANCE: ask the browser-consent question before acquisition');
    case 'start-browse':
    case 'continue-browse':
    case 'narrow-tray':
    case 'end-browse':
    case 'retain-reference':
    case 'review-candidates':
    case 'publish-board':
    case 'replan-discovery':
      throw new Error('REFERENCE_DISCOVERY_ADVANCE: visual judgment or board authorship is required; native acquisition cannot publish a reference');
    default: return assertNever(action.kind);
  } } finally { await session.close(); }
  const work = legacyReferenceDiscoveryWork(root, route);
  if (work.workSha256 === before.workSha256) throw new Error('REFERENCE_DISCOVERY_ADVANCE: native evidence did not change the discovery pointer');
  return { schema: 'reference-discovery-advance-v1', outcome, receipt,
    previousWorkSha256: before.workSha256, work };
}
function assertNever(value: never): never { throw new Error(`REFERENCE_DISCOVERY_ADVANCE: unknown action ${String(value)}`); }
