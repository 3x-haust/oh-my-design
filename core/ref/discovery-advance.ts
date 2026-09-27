import type { RouteRecord } from '../route/index.ts';
import { withBrowser } from '../render/index.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import { referenceDiscoveryWork, legacyReferenceDiscoveryWork, type ReferenceDiscoveryWork } from './discovery-work.ts';
import { captureReferenceNavigation, readReferenceDiscoveryAttempt, ReferenceNavigationError } from './navigation-capture.ts';
import { executeReferenceSearch, readSearchExecution, searchObserved } from './search-execution.ts';

export type ReferenceDiscoveryAdvance = Readonly<{
  schema: 'reference-discovery-advance-v1' | 'reference-discovery-advance-v2';
  outcome: 'observed' | 'unavailable' | 'needs-model-action' | 'stopped-with-debt';
  receipt: Readonly<{ path: string; sha256: string }> | null;
  previousWorkSha256: string;
  work: ReferenceDiscoveryWork;
}>;

export async function advanceReferenceDiscoveryWork(root: string, route: RouteRecord,
  writer: ProjectWriteAdapter): Promise<ReferenceDiscoveryAdvance> {
  requireProjectWriteAdapter(root, writer);
  const work = referenceDiscoveryWork(root, route);
  return { schema: 'reference-discovery-advance-v2', outcome: work.status === 'stopped-with-debt' ? 'stopped-with-debt' : 'needs-model-action',
    receipt: null, previousWorkSha256: work.workSha256, work };
}

export async function advanceLegacyReferenceDiscoveryWork(root: string, route: RouteRecord,
  writer: ProjectWriteAdapter): Promise<ReferenceDiscoveryAdvance> {
  const before = legacyReferenceDiscoveryWork(root, route);
  const action = before.action;
  if (before.status !== 'action' || action === null || action.lane === null) {
    throw new Error('REFERENCE_DISCOVERY_ADVANCE: no native acquisition action is pending');
  }
  let receipt: Readonly<{ path: string; sha256: string }>;
  let outcome: ReferenceDiscoveryAdvance['outcome'];
  switch (action.kind) {
    case 'search': {
      if (action.input === undefined) throw new Error('REFERENCE_DISCOVERY_ADVANCE: missing plan-derived search input');
      receipt = await withBrowser(browser => executeReferenceSearch(browser, action.input, writer));
      outcome = searchObserved(readSearchExecution(root, receipt, action.lane)) ? 'observed' : 'unavailable';
      break;
    }
    case 'direct-entry':
    case 'follow-link': {
      if (action.url === undefined) throw new Error('REFERENCE_DISCOVERY_ADVANCE: missing observed public URL');
      const url = action.url;
      try {
        const native = await withBrowser(browser => captureReferenceNavigation(browser, url,
          action.lane, writer, action.kind === 'direct-entry' ? action.entry : undefined));
        receipt = native.capture;
        outcome = 'observed';
      } catch (error) {
        if (!(error instanceof ReferenceNavigationError) || error.attempt === undefined) throw error;
        readReferenceDiscoveryAttempt(root, error.attempt);
        receipt = error.attempt;
        outcome = 'unavailable';
      }
      break;
    }
    case 'start-browse':
    case 'continue-browse':
    case 'narrow-tray':
    case 'end-browse':
    case 'retain-reference':
    case 'publish-board':
    case 'replan-discovery':
      throw new Error('REFERENCE_DISCOVERY_ADVANCE: visual judgment or board authorship is required; native acquisition cannot publish a reference');
    default: return assertNever(action.kind);
  }
  const work = legacyReferenceDiscoveryWork(root, route);
  if (work.workSha256 === before.workSha256) throw new Error('REFERENCE_DISCOVERY_ADVANCE: native evidence did not change the discovery pointer');
  return { schema: 'reference-discovery-advance-v1', outcome, receipt,
    previousWorkSha256: before.workSha256, work };
}
function assertNever(value: never): never { throw new Error(`REFERENCE_DISCOVERY_ADVANCE: unknown action ${String(value)}`); }
