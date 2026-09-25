import type { BrowserContext, Page } from 'playwright';

export type NoticeDismissal = Readonly<{ dialog: string; control: string; blockedRequests: readonly string[] }>;

const MODALS = '[role="dialog"], [role="alertdialog"], dialog[open], [id*="popup" i], [class*="popup" i], [id*="modal" i], [class*="modal" i]';
const NOTICE = /공지|안내|알림|notice|announcement/i;
const SENSITIVE = /쿠키|cookie|consent|동의|privacy|개인정보|로그인|sign\s?in|결제|payment/i;
const CLOSE = /^(?:close(?:\s+(?:dialog|popup|window))?|dismiss|닫기|(?:창|팝업)\s*닫기|[×✕x])$/i;
const guardedContexts = new WeakMap<BrowserContext, { attempts: string[]; allowedNavigation: string | null }>();

function obstruction(message: string): never {
  throw new Error(`REFERENCE_CAPTURE_VISUAL_OBSTRUCTION: ${message}`);
}

export function blockedNoticeRequests(page: Page): readonly string[] { return guardedContexts.get(page.context())?.attempts ?? []; }

export async function withReadOnlyNoticeNavigation<T>(page: Page, target: string, action: () => Promise<T>): Promise<T> {
  const guard = guardedContexts.get(page.context());
  if (!guard) return action();
  guard.allowedNavigation = target;
  try { return await action(); }
  finally { guard.allowedNavigation = null; }
}

async function guardNoticeClick(page: Page): Promise<void> {
  const context = page.context();
  if (guardedContexts.has(context)) return;
  const guard = { attempts: [] as string[], allowedNavigation: null as string | null };
  await context.route('**/*', route => {
    const request = route.request();
    if (guard.allowedNavigation === request.url() && request.method() === 'GET'
      && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      guard.allowedNavigation = null;
      return route.continue();
    }
    if (guard.attempts.length < 5) guard.attempts.push(`${request.method()}:${request.resourceType()}`);
    return route.abort();
  });
  guardedContexts.set(context, guard);
}

async function assertNoDimBackdrop(page: Page, intentionalModal: boolean): Promise<void> {
  if (intentionalModal) return;
  const obstructed = await page.evaluate(() => {
    const width = innerWidth, height = innerHeight;
    const points = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
    return [...document.querySelectorAll('body *')].some(element => {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.2 || Number(style.zIndex) < 0) return false;
      const box = element.getBoundingClientRect();
      if (box.width * box.height < width * height * 0.6) return false;
      const rgba = style.backgroundColor.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)$/);
      if (!rgba || Math.max(Number(rgba[1]), Number(rgba[2]), Number(rgba[3])) > 180 || Number(rgba[4] ?? 1) < 0.2) return false;
      return points.some(([x, y]) => {
        const top = document.elementFromPoint(width * x!, height * y!);
        return top === element || (top !== null && element.contains(top));
      });
    });
  });
  if (obstructed) obstruction('a dim fixed backdrop still covers the reference viewport');
}

export async function clearReferenceNotices(page: Page, allowedStateSelectors: readonly string[] = [], settleMs = 0): Promise<NoticeDismissal[]> {
  if (settleMs > 0) await page.waitForTimeout(settleMs);
  const dismissals: NoticeDismissal[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const dialogs = page.locator(MODALS);
    let visibleIndex = -1;
    let intentionalModal = false;
    for (let index = 0; index < await dialogs.count(); index++) {
      const dialog = dialogs.nth(index);
      if (!await dialog.isVisible()) continue;
      const plausiblePopup = await dialog.evaluate(element => element.matches('[role="dialog"], [role="alertdialog"], dialog[open]')
        || ['fixed', 'absolute'].includes(getComputedStyle(element).position));
      if (!plausiblePopup) continue;
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      if (!box || !viewport || box.x >= viewport.width || box.y >= viewport.height
        || box.x + box.width <= 0 || box.y + box.height <= 0) continue;
      const intentional = await dialog.evaluate((element, selectors) => selectors.some(selector => {
        try { return element.matches(selector) || element.querySelector(selector) !== null; }
        catch { return false; }
      }), allowedStateSelectors);
      if (intentional) { intentionalModal = true; continue; }
      visibleIndex = index;
      break;
    }
    if (visibleIndex < 0) { await assertNoDimBackdrop(page, intentionalModal); return dismissals; }
    const dialog = dialogs.nth(visibleIndex);
    const title = await dialog.evaluate(element => {
      const heading = element.querySelector('h1,h2,h3,[class*="header"],[class*="title"]');
      return (element.getAttribute('aria-label') || heading?.textContent || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    });
    if (!NOTICE.test(title) || SENSITIVE.test(title)) obstruction(`modal is not a safe informational notice: ${title}`);
    const controls = dialog.locator('button,[role="button"],a');
    let closeIndex = -1;
    let closeName = '';
    for (let index = 0; index < await controls.count(); index++) {
      const control = controls.nth(index);
      if (!await control.isVisible()) continue;
      const info = await control.evaluate(element => ({
        name: (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').replace(/\s+/g, ' ').trim(),
        href: element.getAttribute('href'), type: element.getAttribute('type'), form: element.closest('form') !== null,
      }));
      if (info.href !== null || info.type === 'submit' || (info.form && info.type !== 'button') || !CLOSE.test(info.name)) continue;
      closeIndex = index; closeName = info.name;
      break;
    }
    if (closeIndex < 0) obstruction(`notice has no safe close control: ${title}`);
    const beforeUrl = page.url();
    await guardNoticeClick(page);
    await controls.nth(closeIndex).click({ timeout: 2000 });
    await dialog.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => obstruction(`notice did not close: ${title}`));
    if (page.url() !== beforeUrl) obstruction(`notice close navigated away: ${title}`);
    await page.waitForTimeout(100);
    dismissals.push({ dialog: title, control: closeName, blockedRequests: [...blockedNoticeRequests(page)] });
  }
  obstruction('too many stacked notices');
}
