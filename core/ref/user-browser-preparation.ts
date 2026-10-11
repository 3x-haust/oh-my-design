import type { AcquisitionPage } from './acquisition-engine.ts';
import { browserEvaluationExpression } from './browser-evaluation.ts';
import type { CapturePreparation, CapturePreparationReceipt } from './capture-preparation.ts';

function observeInPage(assertions: CapturePreparation['assertions']) {
  return new Promise<CapturePreparationReceipt['observations']>((resolve, reject) => {
    const cleanup = () => { observer.disconnect(); clearTimeout(timer); };
    const check = () => {
      try {
        const observations: CapturePreparationReceipt['observations'] = [];
        for (const assertion of assertions) {
          const matches = document.querySelectorAll(assertion.selector);
          if (matches.length > 1 || assertion.state === 'hidden' && matches.length === 0)
            throw new Error(`assertion ${assertion.selector} must identify exactly one existing element`);
          const element = matches[0];
          if (!element) return;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const visible = rect.width > 0 && rect.height > 0 && style.display !== 'none'
            && style.visibility !== 'hidden' && style.visibility !== 'collapse';
          if (visible !== (assertion.state === 'visible')) return;
          observations.push({ ...assertion, passed: true });
        }
        cleanup(); resolve(observations);
      } catch (error) { cleanup(); reject(error); }
    };
    const observer = new MutationObserver(check);
    const timer = setTimeout(() => {
      cleanup(); reject(new Error('reference capture preparation: asserted state did not become observable'));
    }, 2000);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    check();
  });
}

/** Read-only state observation; no user-browser clicks are authorized by preparation. */
export async function observeUserBrowserPreparation(
  page: Pick<AcquisitionPage, 'evaluate'>, preparation: CapturePreparation,
): Promise<CapturePreparationReceipt['observations']> {
  if (preparation.actions.length !== 0)
    throw new Error('USER_BROWSER_PREPARATION_ACTION_UNSUPPORTED: only zero-action observations are supported');
  const value = await page.evaluate<unknown>(browserEvaluationExpression(
    observeInPage.toString(), [preparation.assertions]));
  if (!Array.isArray(value) || value.length !== preparation.assertions.length
    || value.some((row: unknown, index: number) => {
      const expected = preparation.assertions[index];
      return typeof row !== 'object' || row === null || expected === undefined
        || !('selector' in row) || row.selector !== expected.selector
        || !('state' in row) || row.state !== expected.state
        || !('passed' in row) || row.passed !== true;
    })) throw new Error('reference capture preparation: invalid browser observation');
  return preparation.assertions.map(assertion => ({ ...assertion, passed: true }));
}
