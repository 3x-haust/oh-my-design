import type { Page } from 'playwright';

export type NoticeDismissal = Readonly<{ dialog: string; control: string; method: 'visual-only'; suppressedBackdrops: number }>;

const MODALS = '[role="dialog"], [role="alertdialog"], dialog[open], [id*="popup" i], [class*="popup" i], [id*="modal" i], [class*="modal" i], [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i]';
const NOTICE = /공지|안내|알림|notice|announcement/i;
const SENSITIVE = /쿠키|cookie|consent|동의|privacy|개인정보|로그인|sign\s?in|결제|payment/i;
const SENSITIVE_BODY = /쿠키|cookie|consent|동의|privacy|개인정보|결제|payment|로그인(?:해|하기|하세요|후)|sign\s?in|log\s?in/i;
const CLOSE = /^(?:close(?:\s+(?:dialog|popup|window))?|dismiss|닫기|(?:창|팝업)\s*닫기|[×✕x])$/i;

function obstruction(message: string): never {
  throw new Error(`REFERENCE_CAPTURE_VISUAL_OBSTRUCTION: ${message}`);
}

async function dimBackdrops(page: Page, suppress: boolean): Promise<number> {
  return page.evaluate(shouldSuppress => {
    const width = innerWidth, height = innerHeight;
    const points = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
    const matches = [...document.querySelectorAll('body *')].filter(element => {
      const style = getComputedStyle(element);
      if (!['fixed', 'absolute'].includes(style.position) || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.2 || Number(style.zIndex) < 0) return false;
      const box = element.getBoundingClientRect();
      if (box.width * box.height < width * height * 0.6) return false;
      const rgba = style.backgroundColor.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)$/);
      if (!rgba || Math.max(Number(rgba[1]), Number(rgba[2]), Number(rgba[3])) > 180 || Number(rgba[4] ?? 1) < 0.2) return false;
      return points.some(([x, y]) => {
        const top = document.elementFromPoint(width * x!, height * y!);
        return top === element || (top !== null && element.contains(top));
      });
    });
    if (shouldSuppress) {
      const named = matches.filter(element => /overlay|backdrop|shade|dimmer|scrim/i.test(`${element.id} ${element.className}`));
      for (const element of named) element.remove();
      return named.length;
    }
    return matches.length;
  }, suppress);
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
    if (visibleIndex < 0) {
      if (!intentionalModal && await dimBackdrops(page, false)) obstruction('a dim backdrop still covers the reference viewport');
      return dismissals;
    }
    const dialog = dialogs.nth(visibleIndex);
    const info = await dialog.evaluate(element => {
      const heading = element.querySelector('h1,h2,h3,[class*="header"],[class*="title"]');
      return {
        title: (element.getAttribute('aria-label') || heading?.textContent || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        body: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
        sensitiveForm: element.querySelector('input[type="password"],form') !== null,
      };
    });
    const { title } = info;
    if (!NOTICE.test(title) || SENSITIVE.test(title) || SENSITIVE_BODY.test(info.body) || info.sensitiveForm) obstruction(`modal is not a safe informational notice: ${title}`);
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
    await dialog.evaluate(element => element.remove());
    const suppressedBackdrops = await dimBackdrops(page, true);
    if (page.url() !== beforeUrl || await dimBackdrops(page, false)) obstruction(`notice visual suppression did not clear the viewport: ${title}`);
    dismissals.push({ dialog: title, control: closeName, method: 'visual-only', suppressedBackdrops });
  }
  obstruction('too many stacked notices');
}
