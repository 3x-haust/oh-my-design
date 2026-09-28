import type { RouteRecord } from '../route/index.ts';
import { withBrowser } from '../render/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { referenceDiscoveryWork, type ReferenceDiscoveryWork } from './discovery-work.ts';
import { captureReferenceNavigation, publishFailedAttempt, readReferenceDiscoveryAttempt, ReferenceNavigationError } from './navigation-capture.ts';
import { withAcquisitionDeadline, NAVIGATION_BUDGET_MS, AcquisitionTimeoutError } from './acquisition-deadline.ts';
import { executeReferenceSearch, readSearchExecution, searchObserved } from './search-execution.ts';
import { publishSearchLaunchTimeout } from './search-launch-timeout.ts';

export type ReferenceDiscoveryAdvance = Readonly<{
  schema: 'reference-discovery-advance-v1';
  outcome: 'observed' | 'unavailable';
  receipt: Readonly<{ path: string; sha256: string }>;
  previousWorkSha256: string;
  work: ReferenceDiscoveryWork;
}>;

export async function advanceReferenceDiscoveryWork(root: string, route: RouteRecord,
  writer: ProjectWriteAdapter): Promise<ReferenceDiscoveryAdvance> {
  const before = referenceDiscoveryWork(root, route);
  const action = before.action;
  if (before.status !== 'action' || action === null || action.lane === null) {
    throw new Error('REFERENCE_DISCOVERY_ADVANCE: no native acquisition action is pending');
  }
  let receipt: Readonly<{ path: string; sha256: string }>;
  let outcome: ReferenceDiscoveryAdvance['outcome'];
  switch (action.kind) {
    case 'search': {
      if (action.input === undefined) throw new Error('REFERENCE_DISCOVERY_ADVANCE: missing plan-derived search input');
      try {
        receipt = await withAcquisitionDeadline({ budgetMs: NAVIGATION_BUDGET_MS, phase: 'ref advance search' },
          scope => withBrowser(browser => { scope.own(browser); return executeReferenceSearch(browser, action.input!, writer); }));
      } catch (error) {
        if (!(error instanceof AcquisitionTimeoutError)) throw error;
        receipt = publishSearchLaunchTimeout(action.input, writer);
      }
      outcome = searchObserved(readSearchExecution(root, receipt, action.lane)) ? 'observed' : 'unavailable';
      break;
    }
    case 'direct-entry':
    case 'follow-link': {
      if (action.url === undefined) throw new Error('REFERENCE_DISCOVERY_ADVANCE: missing observed public URL');
      const url = action.url;
      try {
        const native = await withAcquisitionDeadline({ budgetMs: NAVIGATION_BUDGET_MS, phase: 'ref advance navigation' },
          scope => withBrowser(browser => { scope.own(browser); return captureReferenceNavigation(browser, url,
            action.lane, writer, action.kind === 'direct-entry' ? action.entry : undefined, scope); }));
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
    case 'retain-reference':
    case 'publish-board':
    case 'replan-discovery':
      throw new Error('REFERENCE_DISCOVERY_ADVANCE: visual judgment or board authorship is required; native acquisition cannot publish a reference');
    default: return assertNever(action.kind);
  }
  const work = referenceDiscoveryWork(root, route);
  if (work.workSha256 === before.workSha256) throw new Error('REFERENCE_DISCOVERY_ADVANCE: native evidence did not change the discovery pointer');
  return { schema: 'reference-discovery-advance-v1', outcome, receipt,
    previousWorkSha256: before.workSha256, work };
}
function assertNever(value: never): never { throw new Error(`REFERENCE_DISCOVERY_ADVANCE: unknown action ${String(value)}`); }
