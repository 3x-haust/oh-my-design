import { resolveRenderTarget } from '../render/serve.ts';
import { findingLines, observePageFindings } from '../design/studio-page-check.ts';

/**
 * One final defect check for the thin loop, with no system file or stage record behind it: what nobody intends.
 * Layout and text defects come from the studio page observer (content wider than a phone, text off the edge, faint body
 * text, a logo on a box). Dead controls are probed by clicking every visible button-like control at desktop width and
 * watching for any effect: a change to the page, a request, a navigation, a scroll, a dialog or a new window.
 */
const PROBED = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), input[type="button"], input[type="submit"], a:not([href]), a[href="#"], a[href^="javascript:"]';
const MAX_PROBED = 60;

declare global { interface Window { __omdThinMutations?: number; __omdThinObserver?: MutationObserver } }

export async function deadControls(target: string): Promise<string[]> {
  const { chromium } = await import('playwright');
  const resolved = await resolveRenderTarget(target);
  const browser = await chromium.launch({ headless: true });
  const dead: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const open = async (): Promise<number> => {
      await page.goto(resolved.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
      return page.evaluate(selector => {
        const controls = [...document.querySelectorAll(selector)].filter(element => {
          const form = element.closest('form');
          const submits = element.matches('input[type="submit"], button:not([type]), button[type="submit"]') && form !== null;
          return !(submits && !form.checkValidity());
        });
        controls.forEach((element, index) => element.setAttribute('data-omd-thin-control', String(index)));
        return controls.length;
      }, PROBED);
    };
    const start = page.url();
    const count = Math.min(await open(), MAX_PROBED);
    const base = (url: string): string => url.replace(/#.*$/, '');
    for (let index = 0; index < count; index += 1) {
      const control = page.locator(`[data-omd-thin-control="${index}"]`).first();
      if (!(await control.isVisible().catch(() => false))) continue;
      const label = (await control.evaluate(element => (element.getAttribute('aria-label') ?? element.textContent ?? element.getAttribute('title') ?? element.tagName)
        .replace(/\s+/g, ' ').trim().slice(0, 60)).catch(() => '')) || `control ${index + 1}`;
      await page.evaluate(() => {
        window.__omdThinMutations = 0;
        window.__omdThinObserver = new MutationObserver(records => { window.__omdThinMutations = (window.__omdThinMutations ?? 0) + records.length; });
        window.__omdThinObserver.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      });
      let requests = 0;
      let opened = false;
      let dialog = false;
      const onRequest = (): void => { requests += 1; };
      const onPage = (): void => { opened = true; };
      page.on('request', onRequest);
      context.on('page', onPage);
      page.once('dialog', event => { dialog = true; void event.dismiss().catch(() => undefined); });
      const before = { url: page.url(), scroll: await page.evaluate(() => window.scrollY) };
      await control.click({ timeout: 2_000, noWaitAfter: true }).catch(() => undefined);
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => {
        window.__omdThinObserver?.disconnect();
        return { mutations: window.__omdThinMutations ?? 0, scroll: window.scrollY };
      }).catch(() => ({ mutations: 1, scroll: before.scroll }));
      page.off('request', onRequest);
      context.off('page', onPage);
      const live = after.mutations > 0 || requests > 0 || opened || dialog || page.url() !== before.url || after.scroll !== before.scroll;
      if (!live) dead.push(label);
      for (const extra of context.pages().filter(other => other !== page)) await extra.close().catch(() => undefined);
      if (base(page.url()) !== base(start)) await open();
    }
    return dead;
  } finally {
    await browser.close();
    await resolved.close();
  }
}

export async function thinDefects(target: string): Promise<string[]> {
  const findings = (await observePageFindings(target)).filter(finding => finding.tier === 'defect');
  const dead = await deadControls(target);
  return [...findingLines(findings),
    ...(dead.length === 0 ? [] : [`defect [dead-control] desktop: clicking these changed nothing (no page change, request, navigation or scroll): ${dead.map(label => `"${label}"`).join(', ')}`])];
}
