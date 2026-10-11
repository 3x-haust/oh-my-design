import { MAX_SOURCE_STUDY_HTML_BYTES, SourceStudyContractError } from '../../adapters/pi-study-contract.ts';
import { withBrowser } from '../render/index.ts';
import { inspectionDeadline } from '../render/stateful.ts';
import type { SourceStudyWorkState } from '../../adapters/pi-study-work-state.ts';

export type SourceStudyRender = Readonly<{
  state: 'initial' | 'primary-work';
  viewport: Readonly<{ name: 'desktop' | 'mobile'; width: number; height: number }>;
  png: Buffer;
}>;

const ENTRY = 'http://omd-study.invalid/index.html';
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;
const POLICY = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

export async function renderSourceStudyHtml(html: string, workState: SourceStudyWorkState): Promise<readonly SourceStudyRender[]> {
  if (!html.trim() || Buffer.byteLength(html) > MAX_SOURCE_STUDY_HTML_BYTES) {
    throw new SourceStudyContractError('render-html-size');
  }
  return withBrowser(async browser => {
    const renders: SourceStudyRender[] = [];
    for (const viewport of VIEWPORTS) {
      const pair = await inspectionDeadline(async own => {
        const context = await own(browser.newContext({
          viewport, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false,
        }));
        const page = await context.newPage();
        let entryDelivered = false;
        let resourceViolation = false;
        let scriptFailure = false;
        const audit = await context.newCDPSession(page);
        audit.on('Audits.issueAdded', (event: Readonly<{ issue: Readonly<{ code: string }> }>) => {
          if (event.issue.code === 'ContentSecurityPolicyIssue') resourceViolation = true;
        });
        await audit.send('Audits.enable');
        page.on('pageerror', () => { scriptFailure = true; });
        await context.routeWebSocket('**/*', socket => {
          resourceViolation = true;
          socket.close();
        });
        await context.route('**/*', async route => {
          const request = route.request();
          if (!entryDelivered && request.url() === ENTRY && request.method() === 'GET'
            && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            entryDelivered = true;
            await route.fulfill({
              status: 200, contentType: 'text/html; charset=utf-8', body: html,
              headers: { 'Content-Security-Policy': POLICY },
            });
            return;
          }
          resourceViolation = true;
          await route.abort('blockedbyclient');
        });
        await page.goto(ENTRY, { waitUntil: 'load', timeout: 10000 });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        const png = await page.screenshot({ fullPage: false, timeout: 5000 });
        if (resourceViolation) throw new SourceStudyContractError('external-resource');
        if (scriptFailure) throw new SourceStudyContractError('render-script');
        const ready = page.locator(workState.readySelector);
        if (workState.triggerSelector !== null) {
          if (await ready.isVisible()) throw new SourceStudyContractError('work-state-already-visible');
          await Promise.all([
            ready.waitFor({ state: 'visible', timeout: 5000 }),
            page.locator(workState.triggerSelector).click({ timeout: 5000 }),
          ]);
        }
        if (await ready.count() !== 1 || !await ready.isVisible()) throw new SourceStudyContractError('work-not-visible');
        const visibleWork = await ready.evaluate(element => {
          if (element.tagName === 'HTML' || element.tagName === 'BODY'
            || element.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
          for (let parent: Element | null = element; parent; parent = parent.parentElement) {
            if (getComputedStyle(parent).opacity === '0') return false;
          }
          const rect = element.getBoundingClientRect();
          const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
          const right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
          if (right <= left || bottom <= top) return false;
          const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
          return hit !== null && (hit === element || element.contains(hit));
        });
        if (!visibleWork) throw new SourceStudyContractError('work-not-in-viewport');
        const workPng = workState.triggerSelector === null ? png
          : await page.screenshot({ fullPage: false, animations: 'disabled', timeout: 5000 });
        if (resourceViolation) throw new SourceStudyContractError('external-resource');
        if (scriptFailure) throw new SourceStudyContractError('render-script');
        return [
          { viewport, png, state: 'initial' as const },
          { viewport, png: workPng, state: 'primary-work' as const },
        ];
      }, 15000);
      renders.push(...pair);
    }
    return renders;
  });
}
