import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Browser, Page, Route } from 'playwright';
import { errors } from 'playwright';
import { homedir } from 'node:os';
import { browserProfilePath, readBrowserConsent } from './browser-consent.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';
import { disableUnproxiedRealtimeTransports } from './browser-security.ts';

export type CookieControlInput = Readonly<{ url: string; selector: string; text: string; contentSelector?: string }>;
const fail = (reason: string): never => { throw new Error(`REFERENCE_COOKIE_CONTROL_${reason}`); };

/** This action is deliberately not a generic click API: the model supplies the exact text it
 * judged to mean a necessary-only cookie choice; the browser enforces only structural safety. */
export async function runReferenceCookieControl(browser: Browser, input: CookieControlInput, home = homedir()) {
  if (readBrowserConsent(home) !== 'consented' || !existsSync(browserProfilePath(home))) fail('CONSENT_REQUIRED');
  const url = publicDiscoveryUrl(input.url);
  if (typeof input.selector !== 'string' || !input.selector.trim() || input.selector.length > 512
    || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 512) fail('TARGET_INVALID');
  const contentSelector = input.contentSelector ?? 'main';
  if (typeof contentSelector !== 'string' || !contentSelector.trim() || contentSelector.length > 512) fail('TARGET_INVALID');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
  await disableUnproxiedRealtimeTransports(context);
  const origin = new URL(url).origin;
  let loaded = false;
  const blocked: string[] = [];
  const deny = (route: Route) => { blocked.push(`${route.request().method()} ${route.request().url()}`); return route.abort(); };
  const guard = async (route: Route) => {
    const request = route.request();
    if (request.isNavigationRequest() && (loaded || request.method() !== 'GET' || request.url() !== url)) return deny(route);
    if (!['GET', 'HEAD'].includes(request.method()) && new URL(request.url()).origin !== origin) return deny(route);
    return route.continue();
  };
  await context.route('**/*', guard);
  let page: Page | undefined;
  try {
    page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    if (page.url() !== url || !response || response.status() >= 400) fail('DOCUMENT_CHANGED');
    const target = page.locator(input.selector);
    if (await target.count() > 1) fail('TARGET_INVALID');
    try { await target.waitFor({ state: 'visible', timeout: 5_000 }); }
    catch (error) {
      if (error instanceof errors.TimeoutError) fail('TARGET_INVALID');
      throw error;
    }
    if (await target.count() !== 1 || !await target.isVisible()) fail('TARGET_INVALID');
    const before = await target.evaluate((element, expected) => {
      const dialog = element.closest('[role="dialog"], [role="alertdialog"], dialog[open]');
      const rect = element.getBoundingClientRect();
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      let positioned: Element | null = dialog;
      while (positioned && !['fixed', 'absolute'].includes(getComputedStyle(positioned).position)) positioned = positioned.parentElement;
      const box = positioned?.getBoundingClientRect();
      return {
        safe: element instanceof HTMLButtonElement && (element.type === 'button' || (element.type === 'submit' && element.form === null))
          && !element.disabled
          && !element.closest('form, a, [role="link"]') && !element.hasAttribute('formaction')
          && !element.hasAttribute('form') && !element.hasAttribute('popovertarget')
          && (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim() === expected && top !== null && element.contains(top)
          && !!dialog && !dialog.querySelector('form, input[type="password"]') && !!box
          && box.width * box.height >= innerWidth * innerHeight * 0.1
          && box.left < innerWidth && box.top < innerHeight && box.right > 0 && box.bottom > 0,
        dialog: dialog ? Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')).indexOf(dialog) : -1,
      };
    }, input.text);
    if (!before.safe || before.dialog < 0) fail('TARGET_INVALID');
    const documentSha256 = createHash('sha256').update(await page.content()).digest('hex');
    // No second document or destination is authorized, even a same-origin GET navigation.
    loaded = true;
    if (page.url() !== url || await target.count() !== 1 || !await target.isVisible()
      || (await target.innerText()).replace(/\s+/g, ' ').trim() !== input.text
      || createHash('sha256').update(await page.content()).digest('hex') !== documentSha256) fail('TARGET_INVALID');
    await target.click({ timeout: 5_000, noWaitAfter: true });
    if (page.url() !== url || blocked.length) fail('DOCUMENT_CHANGED');
    try { await page.locator(contentSelector).waitFor({ state: 'visible', timeout: 4_000 }); }
    catch { fail('NOT_CLEARED'); }
    const confirmed = await page.evaluate(({ index, contentSelector }) => {
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]');
      const dialog = dialogs[index];
      const contents = document.querySelectorAll(contentSelector);
      const content = contents[0];
      if (contents.length !== 1 || !content || !content.textContent?.trim()
        || content.matches('html,body,header,nav,footer,h1,h2,h3,h4,h5,h6,a,button,[role="button"]')
        || content.closest('[role="dialog"],[role="alertdialog"],dialog[open]')
        || (dialog && getComputedStyle(dialog).display !== 'none'
        && getComputedStyle(dialog).visibility !== 'hidden' && dialog.getBoundingClientRect().width > 0)) return false;
      for (let element: Element | null = content; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.2) return false;
      }
      const box = content.getBoundingClientRect();
      if (Math.min(innerWidth, box.right) <= Math.max(0, box.left)
        || Math.min(innerHeight, box.bottom) <= Math.max(0, box.top)) return false;
      const x = (Math.max(0, box.left) + Math.min(innerWidth, box.right)) / 2;
      const y = (Math.max(0, box.top) + Math.min(innerHeight, box.bottom)) / 2;
      const top = document.elementFromPoint(x, y);
      return top !== null && content.contains(top);
    }, { index: before.dialog, contentSelector }).catch(() => fail('DOCUMENT_CHANGED'));
    if (blocked.length || page.url() !== url) fail('DOCUMENT_CHANGED');
    if (!confirmed) fail('NOT_CLEARED');
    return { schema: 'reference-cookie-control-v1' as const, status: 'cleared' as const, url, selector: input.selector, text: input.text,
      documentSha256, contentSelector, finalUrl: page.url() };
  } finally {
    await page?.close();
    // The persistent context is owned and closed by withBrowser, not by this operation.
    await context.unroute('**/*', guard);
  }
}
