import type { Page } from 'playwright';

export type NoticeDismissal = Readonly<{ dialog: string; control: string }>;

const MODALS = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]';
const NOTICE = /공지|안내|알림|notice|announcement/i;
const SENSITIVE = /쿠키|cookie|consent|동의|privacy|개인정보|로그인|sign\s?in|결제|payment/i;
const CLOSE = /^(?:close(?:\s+(?:dialog|popup|window))?|dismiss|닫기|(?:창|팝업)\s*닫기|[×✕x])$/i;

function obstruction(message: string): never {
  throw new Error(`REFERENCE_CAPTURE_VISUAL_OBSTRUCTION: ${message}`);
}

export async function clearReferenceNotices(page: Page, allowedStateSelectors: readonly string[] = [], settleMs = 0): Promise<NoticeDismissal[]> {
  if (settleMs > 0) await page.waitForTimeout(settleMs);
  const dismissals: NoticeDismissal[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const dialogs = page.locator(MODALS);
    let visibleIndex = -1;
    for (let index = 0; index < await dialogs.count(); index++) {
      const dialog = dialogs.nth(index);
      if (!await dialog.isVisible()) continue;
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      if (!box || !viewport || box.x >= viewport.width || box.y >= viewport.height
        || box.x + box.width <= 0 || box.y + box.height <= 0) continue;
      visibleIndex = index;
      break;
    }
    if (visibleIndex < 0) return dismissals;
    const dialog = dialogs.nth(visibleIndex);
    const intentional = await dialog.evaluate((element, selectors) => selectors.some(selector => {
      try { return element.matches(selector) || element.querySelector(selector) !== null; }
      catch { return false; }
    }), allowedStateSelectors);
    if (intentional) return dismissals;
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
        href: element.getAttribute('href'), type: element.getAttribute('type'),
      }));
      if (info.href !== null || info.type === 'submit' || !CLOSE.test(info.name)) continue;
      closeIndex = index; closeName = info.name;
      break;
    }
    if (closeIndex < 0) obstruction(`notice has no safe close control: ${title}`);
    const beforeUrl = page.url();
    await controls.nth(closeIndex).click({ timeout: 2000 });
    await dialog.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => obstruction(`notice did not close: ${title}`));
    if (page.url() !== beforeUrl) obstruction(`notice close navigated away: ${title}`);
    dismissals.push({ dialog: title, control: closeName });
  }
  obstruction('too many stacked notices');
}
