import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';

export const PUBLIC_DIRECTORY = 'https://www.gov.uk/browse/benefits';
export const GALLERY_DIRECTORY = 'https://www.siteinspire.com/';
export const GALLERY_ITEM = 'https://www.siteinspire.com/website/123-example';
export const DOMAIN_ITEM = 'https://www.gov.uk/benefits-calculators';
export const directoryHtml = (href: string): string => `<main><h1>Public directory</h1><a href="${href}">Inspect this entry</a><p>${'Inspect the listed public resource and compare its task and presentation. '.repeat(5)}</p></main>`;
export type DiscoveryScenario = Readonly<{
  url: string;
  html: string;
  status?: number;
  finalUrl?: string;
  afterCapture?: (page: Page, count: number) => Promise<void>;
}>;

export function discoveryFixture(t: { after(fn: () => void): void }): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-direct-discovery-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

export function discoveryBrowser(browser: Browser, scenario: DiscoveryScenario) {
  const captures: Buffer[] = [];
  const abortedMethods: string[] = [];
  const contextOptions: Parameters<Browser['newContext']>[0][] = [];
  let closed = 0;
  const preparePage = async (page: Page): Promise<Page> => {
    await page.route(scenario.url, route => scenario.finalUrl
      ? route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(scenario.finalUrl)})</script>` })
      : route.fulfill({ status: scenario.status ?? 200, contentType: 'text/html', body: scenario.html }));
    if (scenario.finalUrl) await page.route(scenario.finalUrl, route => route.fulfill({ status: scenario.status ?? 200, contentType: 'text/html', body: scenario.html }));
    const goto = page.goto.bind(page);
    if (scenario.finalUrl) {
      const finalUrl = scenario.finalUrl;
      page.goto = async (...args: Parameters<Page['goto']>) => {
        const response = page.waitForResponse(finalUrl);
        try { await goto(...args); }
        catch (error) { if (!(error instanceof Error) || !error.message.includes('ERR_ABORTED')) throw error; }
        await page.waitForURL(finalUrl, { waitUntil: 'domcontentloaded' });
        return response;
      };
    }
    page.on('requestfailed', request => { abortedMethods.push(request.method()); });
    const screenshot = page.screenshot.bind(page);
    page.screenshot = async options => {
      const bytes = await screenshot(options); captures.push(bytes);
      await scenario.afterCapture?.(page, captures.length);
      return bytes;
    };
    return page;
  };
  const prepareContext = (context: BrowserContext): BrowserContext => {
    const newPage = context.newPage.bind(context);
    context.newPage = async () => preparePage(await newPage());
    context.on('close', () => { closed++; });
    return context;
  };
  const proxy = new Proxy(browser, { get(target, property) {
    if (property === 'newContext') return async (options: Parameters<Browser['newContext']>[0]) => {
      contextOptions.push(options);
      return prepareContext(await target.newContext(options));
    };
    if (property === 'newPage') return async (options: Parameters<Browser['newPage']>[0]) => preparePage(await target.newPage(options));
    return Reflect.get(target, property, target);
  } });
  return { browser: proxy, captures, abortedMethods, contextOptions, closed: () => closed };
}
