import type { Page } from 'playwright';
import { canonicalJson } from './json.ts';
import { inspectVisible } from './observation.ts';
import { authorizeBrowseControl, authorizeBrowseDestination, searchUrl } from './safety.ts';
import { browseFail, type BrowseAction, type BrowseControl, type BrowseObservation, type Start } from './contract.ts';

async function exactTarget(page: Page, action: { selector: string | null; text: string | null }, prior: BrowseObservation | null): Promise<BrowseControl> {
  if (!prior || prior.url !== page.url()) browseFail('BROWSE_STALE_OBSERVATION', 'take a shot before acting on unobserved page state');
  const controls = prior.controls.filter(control => action.selector ? control.selector === action.selector : control.label === action.text);
  if (controls.length !== 1) browseFail('BROWSE_TARGET', 'target must name exactly one control in the recorded visible snapshot');
  const target = controls[0]!;
  const fresh = (await inspectVisible(page)).controls.find(control => control.selector === target.selector);
  if (!fresh || canonicalJson(fresh) !== canonicalJson(target)) browseFail('BROWSE_STALE_TARGET', 'target changed since observation; take a fresh shot');
  const locator = page.locator(target.selector);
  if (await locator.count() !== 1 || !await locator.isVisible()) browseFail('BROWSE_TARGET', 'target is not uniquely visible');
  return target;
}
export async function executeBrowseAction(page: Page, action: BrowseAction, start: Start, prior: BrowseObservation | null, timeout: number): Promise<BrowseControl | null> {
  switch (action.verb) {
    case 'goto': await page.goto(authorizeBrowseDestination(action.url, start), { waitUntil: 'domcontentloaded', timeout }); return null;
    case 'search': {
      const url = searchUrl(action.provider, action.query, action.queryParam);
      if (!action.querySelector) { await page.goto(authorizeBrowseDestination(url, start), { waitUntil: 'domcontentloaded', timeout }); return null; }
      const target = await exactTarget(page, { selector: action.querySelector, text: null }, prior);
      if (target.role !== 'searchbox' && target.type !== 'search') browseFail('BROWSE_SEARCH_CONTROL', 'only a recorded search control can receive a query');
      const input = page.locator(action.querySelector), submit = page.locator(action.submitSelector!);
      if (await submit.count() !== 1 || !await submit.isVisible()) browseFail('BROWSE_SEARCH_CONTROL', 'unique visible search submit required');
      const form = await input.evaluate(node => {
        const field = node as HTMLInputElement, form = field.form;
        return form ? { method: form.method.toUpperCase(), action: form.action, id: form.id, fields: Array.from(form.elements).map(element => ({ tag: element.tagName, type: element.getAttribute('type') })) } : null;
      });
      const same = await submit.evaluate((node, selector) => (node as HTMLButtonElement).form === (document.querySelector(selector) as HTMLInputElement)?.form, action.querySelector);
      if (!form || !same || form.method !== 'GET' || new URL(form.action).origin !== new URL(page.url()).origin
        || form.fields.some(field => field.tag === 'INPUT' && !['search', 'hidden', 'submit'].includes(field.type ?? ''))) browseFail('BROWSE_SEARCH_FORM', 'search must be a same-origin GET form without unrelated fields');
      authorizeBrowseDestination(form.action, start);
      await input.fill(action.query, { timeout }); await submit.click({ timeout }); return target;
    }
    case 'click': case 'similar': {
      const target = await exactTarget(page, action, prior); authorizeBrowseControl(target, start);
      // In-viewport hit testing above means Playwright cannot silently frame an offscreen target.
      await page.locator(target.selector).click({ timeout }); return target;
    }
    case 'back': await page.goBack({ waitUntil: 'domcontentloaded', timeout }); return null;
    case 'scroll': {
      await page.evaluate(({ selector, direction, amount }) => {
        const node = selector ? document.querySelector(selector) : document.scrollingElement;
        if (!node || (selector && document.querySelectorAll(selector).length !== 1)) throw new Error('BROWSE_SCROLL_TARGET');
        const horizontal = direction === 'left' || direction === 'right';
        const size = horizontal ? (selector ? node.clientWidth : innerWidth) : (selector ? node.clientHeight : innerHeight);
        const delta = Math.min(amount ?? Math.floor(size * .75), size) * (direction === 'left' || direction === 'up' ? -1 : 1);
        node.scrollBy({ left: horizontal ? delta : 0, top: horizontal ? 0 : delta, behavior: 'instant' });
      }, action);
      // Frame event, not elapsed-time luck: flush the scroll event/render caused by this action.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))); return null;
    }
    case 'shot':
      for (const selector of action.assertVisible) {
        const locator = page.locator(selector);
        if (await locator.count() !== 1 || !await locator.isVisible()) browseFail('BROWSE_ASSERTION', `visible assertion failed: ${selector}`);
        const box = await locator.boundingBox(), viewport = page.viewportSize()!;
        if (!box || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height) browseFail('BROWSE_ASSERTION', 'visible assertion is not framed in capture viewport');
      }
      for (const selector of action.assertHidden) if (await page.locator(selector).isVisible()) browseFail('BROWSE_ASSERTION', `hidden assertion failed: ${selector}`);
      return null;
    case 'crop': return null;
    default: return browseFail('BROWSE_ACTION', 'not a browser action', 2);
  }
}
