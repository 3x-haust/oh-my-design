import type { CDPSession, Page, Route } from 'playwright';

export type NoticeDismissal = Readonly<{ dialog: string; control: string; method: 'visual-only'; suppressedBackdrops: number }>;

const MODALS = '[role="dialog"], [role="alertdialog"], dialog[open], [id*="popup" i], [class*="popup" i], [id*="modal" i], [class*="modal" i], [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i]';
const NOTICE = /공지|안내|알림|notice|announcement/i;
const SENSITIVE = /쿠키|cookie|consent|동의|privacy|개인정보|로그인|sign\s?in|결제|payment/i;
const SENSITIVE_BODY = /쿠키|cookie|consent|동의|privacy|개인정보|결제|payment|로그인(?:해|하기|하세요|후)|sign\s?in|log\s?in/i;
const CLOSE = /^(?:close(?:\s+(?:dialog|popup|window))?|dismiss|닫기|(?:창|팝업)\s*닫기|[×✕x])$/i;
const BACKDROP_NAME = /overlay|backdrop|shade|dimmer|scrim/i;
type SuppressedDocument = { session: CDPSession; id: string; loaderId: string; selectors: string[];
  blockedRequests: string[]; requestGuard?: (route: Route) => Promise<void>; allowedNavigationUrl: string | undefined };
const sheets = new WeakMap<Page, SuppressedDocument>();
const browserExpression = (source: string) => `(() => { const __name = (callback) => callback; return (${source})(); })()`;

function obstruction(message: string): never {
  throw new Error(`REFERENCE_CAPTURE_VISUAL_OBSTRUCTION: ${message}`);
}

async function coveringLayers(page: Page): Promise<{ selector: string; name: string }[]> {
  return page.evaluate(browserExpression((() => {
    const width = innerWidth, height = innerHeight;
    const points = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
    const onTop = (element: Element, x: number, y: number) => {
      const top = document.elementFromPoint(width * x, height * y);
      return top === element || (top !== null && element.contains(top));
    };
    const path = (element: Element) => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.documentElement) {
        const parent: Element | null = current.parentElement;
        if (!parent) return '';
        parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(current) + 1})`);
        current = parent;
      }
      return `html > ${parts.join(' > ')}`;
    };
    return [...document.querySelectorAll('body *')].filter(element => {
      const style = getComputedStyle(element);
      if (!['fixed', 'absolute'].includes(style.position) || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.2 || Number(style.zIndex) < 0) return false;
      const namedOverlay = /overlay|backdrop|shade|dimmer|scrim/i.test(`${element.id} ${element.className}`);
      const errorLayer = /error|unavailable|failure|blocked|오류|장애|접속불가/i.test(`${element.id} ${element.className}`)
        || /^(?:service unavailable|서비스 (?:오류|이용 불가|접속 불가)|접속 (?:오류|불가)|페이지를 표시할 수 없)/i.test((element.querySelector('h1,h2,h3,header')?.textContent ?? '').trim());
      const appRoot = /^(?:app|root|__next|application)$/i.test(element.id) || element.getAttribute('role') === 'application';
      const background = style.backgroundColor.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)$/);
      if (!namedOverlay && (!background || Number(background[4] ?? 1) < 0.15) && style.backgroundImage === 'none' && style.backdropFilter === 'none') return false;
      if (!namedOverlay && !errorLayer
        && (element.matches('main') || element.querySelector('main') !== null
          || (appRoot && element.querySelector('header,nav') !== null && element.querySelector('section,article') !== null))) return false;
      const box = element.getBoundingClientRect();
      if (box.width * box.height < width * height * 0.6) return false;
      return onTop(element, 0.5, 0.5) && points.filter(([x, y]) => onTop(element, x!, y!)).length >= 2;
    }).map(element => ({ selector: path(element), name: `${element.id} ${element.className}` }))
      .filter(item => item.selector);
  }).toString())) as Promise<{ selector: string; name: string }[]>;
}

async function suppressByBrowserStyle(page: Page, selectors: readonly string[]): Promise<void> {
  let sheet = sheets.get(page);
  if (!sheet) {
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const tree = await session.send('Page.getFrameTree');
    const created = await session.send('CSS.createStyleSheet', { frameId: tree.frameTree.frame.id });
    await session.send('Emulation.setScriptExecutionDisabled', { value: true });
    sheet = { session, id: created.styleSheetId, loaderId: tree.frameTree.frame.loaderId, selectors: [], blockedRequests: [], allowedNavigationUrl: undefined };
    sheets.set(page, sheet);
  }
  sheet.selectors.push(...selectors);
  await sheet.session.send('CSS.setStyleSheetText', {
    styleSheetId: sheet.id,
    text: `${sheet.selectors.join(', ')} { display: none !important; visibility: hidden !important; }`,
  });
}

async function guardSuppressedDocumentRequests(page: Page): Promise<void> {
  const sheet = sheets.get(page);
  if (!sheet || sheet.requestGuard) return;
  const guard = async (route: Route) => {
    const request = route.request();
    if (sheet.allowedNavigationUrl === request.url() && request.isNavigationRequest()
      && request.frame() === page.mainFrame() && request.method() === 'GET')
      return route.continue();
    if (sheet.blockedRequests.length < 5) sheet.blockedRequests.push(`${request.method()}:${request.resourceType()}`);
    return route.abort();
  };
  await page.context().route('**/*', guard);
  sheet.requestGuard = guard;
}

export function prepareSuppressedReferenceLink(page: Page, destination: string): void {
  const sheet = sheets.get(page);
  if (!sheet) return;
  if (sheet.blockedRequests.length) obstruction(`suppressed document attempted a request (${sheet.blockedRequests.join(', ')})`);
  const networkUrl = new URL(destination);
  networkUrl.hash = '';
  sheet.allowedNavigationUrl = networkUrl.href;
}

export async function resumeScriptsOnNewReferenceDocument(page: Page, previousUrl?: string): Promise<void> {
  const sheet = sheets.get(page);
  if (!sheet) return;
  const tree = await sheet.session.send('Page.getFrameTree');
  if (tree.frameTree.frame.loaderId === sheet.loaderId) {
    sheet.allowedNavigationUrl = undefined;
    if (previousUrl) {
      const before = new URL(previousUrl), after = new URL(page.url());
      if (before.hash !== after.hash && before.origin === after.origin
        && before.pathname === after.pathname && before.search === after.search) return;
    }
    obstruction('same-document navigation cannot safely resume page scripts after notice suppression');
  }
  if (sheet.requestGuard) await page.context().unroute('**/*', sheet.requestGuard);
  await sheet.session.send('Emulation.setScriptExecutionDisabled', { value: false });
  sheets.delete(page);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
}

export function hasSuspendedReferenceScripts(page: Page): boolean { return sheets.has(page); }

export async function suspendReferenceScriptsForShot(page: Page): Promise<() => Promise<void>> {
  if (sheets.has(page)) return async () => {};
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setScriptExecutionDisabled', { value: true });
  return async () => {
    if (!sheets.has(page)) await session.send('Emulation.setScriptExecutionDisabled', { value: false });
    await session.detach();
  };
}

async function browserState(page: Page): Promise<string> {
  const storage = await page.evaluate(browserExpression((() => {
    const entries = (item: Storage) => Array.from({ length: item.length }, (_, index) => {
      const key = item.key(index)!;
      return [key, item.getItem(key)];
    }).sort(([left], [right]) => left!.localeCompare(right!));
    return { cookie: document.cookie, local: entries(localStorage), session: entries(sessionStorage) };
  }).toString()));
  const cookies = (await page.context().cookies()).sort((left, right) => `${left.domain}/${left.path}/${left.name}`.localeCompare(`${right.domain}/${right.path}/${right.name}`));
  return JSON.stringify({ storage, cookies });
}

async function guardedVisualSuppression<T>(page: Page, work: () => Promise<T>): Promise<T> {
  const before = await browserState(page);
  const blocked: string[] = [];
  const handler = (route: Route) => {
    if (blocked.length < 5) blocked.push(`${route.request().method()}:${route.request().resourceType()}`);
    return route.abort();
  };
  await page.context().route('**/*', handler);
  try {
    const result = await work();
    await page.waitForTimeout(250);
    if (blocked.length || await browserState(page) !== before) obstruction(`notice visual suppression caused request or browser-state change (${blocked.join(', ')})`);
    return result;
  } finally { await page.context().unroute('**/*', handler); }
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
      const backdrop = await dialog.evaluate(element => /overlay|backdrop|shade|dimmer|scrim/i.test(`${element.id} ${element.className}`));
      if (backdrop) continue;
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      if (!box || !viewport || box.x >= viewport.width || box.y >= viewport.height
        || box.x + box.width <= 0 || box.y + box.height <= 0) continue;
      const intentional = await dialog.evaluate((element, selectors) => {
        for (const selector of selectors) {
          try { if (element.matches(selector) || element.querySelector(selector) !== null) return true; }
          catch { continue; }
        }
        return false;
      }, allowedStateSelectors);
      if (intentional) { intentionalModal = true; continue; }
      visibleIndex = index;
      break;
    }
    if (visibleIndex < 0) {
      const blocked = sheets.get(page)?.blockedRequests ?? [];
      if (blocked.length) obstruction(`suppressed document attempted a request (${blocked.join(', ')})`);
      if (!intentionalModal && (await coveringLayers(page)).length)
        obstruction('a covering layer still obscures the reference viewport');
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
    const selector = await dialog.evaluate(element => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.documentElement) {
        const parent: Element | null = current.parentElement;
        if (!parent) return '';
        parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(current) + 1})`);
        current = parent;
      }
      return `html > ${parts.join(' > ')}`;
    });
    if (!selector) obstruction(`notice cannot be isolated for visual suppression: ${title}`);
    const suppressedBackdrops = await guardedVisualSuppression(page, async () => {
      await suppressByBrowserStyle(page, [selector]);
      const layers = await coveringLayers(page);
      const backdrops = layers.filter(layer => BACKDROP_NAME.test(layer.name));
      if (backdrops.length) await suppressByBrowserStyle(page, backdrops.map(layer => layer.selector));
      if (page.url() !== beforeUrl || (await coveringLayers(page)).length) obstruction(`notice visual suppression did not clear the viewport: ${title}`);
      return backdrops.length;
    });
    await guardSuppressedDocumentRequests(page);
    dismissals.push({ dialog: title, control: closeName, method: 'visual-only', suppressedBackdrops });
  }
  obstruction('too many stacked notices');
}
