import type { RouteRecord } from '../route/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { referenceDiscoveryWork, type ReferenceDiscoveryWork } from './discovery-work.ts';
import { publishFailedAttempt, readReferenceDiscoveryAttempt, ReferenceNavigationError } from './navigation-capture.ts';
import { createReferenceAcquisitionSession } from './acquisition-session.ts';
import { withAcquisitionDeadline, NAVIGATION_BUDGET_MS, AcquisitionTimeoutError } from './acquisition-deadline.ts';
import { executeReferenceSearch, executeUserBrowserSearch, readSearchExecution } from './search-execution.ts';
import { readReferenceBrowserConfig } from './browser-config.ts';
import { withBrowser } from '../render/index.ts';
import { handoffBrowserChallenge } from './browser-profile.ts';

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
        if (first.status === 'blocked' && action.engine === 'omd-profile') {
          const cleared = await handoffBrowserChallenge({ url: action.input.url, cleared: async page => {
            const body = await page.locator('body').innerText();
            return !/captcha|unusual traffic|verify you are human/i.test(body);
          } });
          if (cleared) receipt = await withBrowser(browser => executeReferenceSearch(browser, action.input!, writer), undefined,
            { reference: true, config });
        }
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
    case 'retain-reference':
    case 'publish-board':
    case 'replan-discovery':
      throw new Error('REFERENCE_DISCOVERY_ADVANCE: visual judgment or board authorship is required; native acquisition cannot publish a reference');
    default: return assertNever(action.kind);
  } } finally { await session.close(); }
  const work = referenceDiscoveryWork(root, route);
  if (work.workSha256 === before.workSha256) throw new Error('REFERENCE_DISCOVERY_ADVANCE: native evidence did not change the discovery pointer');
  return { schema: 'reference-discovery-advance-v1', outcome, receipt,
    previousWorkSha256: before.workSha256, work };
}
function assertNever(value: never): never { throw new Error(`REFERENCE_DISCOVERY_ADVANCE: unknown action ${String(value)}`); }
