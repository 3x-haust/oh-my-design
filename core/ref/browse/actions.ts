import type { Page } from 'playwright';
import { canonicalJson } from './json.ts';
import { inspectVisible } from './observation.ts';
import { authorizeBrowseControl, authorizeBrowseDestination, authorizeCookieChoice, searchUrl } from './safety.ts';
import { browseFail, type BrowseAction, type BrowseControl, type BrowseObservation, type Start } from './contract.ts';
import { clearCheckboxChallenge } from '../challenge-clearance.ts';

const CHALLENGE_TITLE = /captcha|verify you are human|are you a robot|just a moment|unusual traffic|security check|로봇이 아닙니다|보안 문자/iu;
const CHALLENGE_FRAME = /(?:recaptcha|hcaptcha|turnstile|challenges\.cloudflare\.com|arkoselabs|geetest)/i;
/** The page the person would recognise as "prove you are human": a known challenge frame, Google's sorry page, or a challenge title. */
export async function isChallengePage(page: Page): Promise<boolean> {
  if (/^https:\/\/(?:www\.)?google\.[a-z.]+\/sorry\//.test(page.url())) return true;
  if (page.frames().some(frame => frame !== page.mainFrame() && CHALLENGE_FRAME.test(frame.url()))) return true;
  return CHALLENGE_TITLE.test(await page.title().catch(() => ''));
}
const SUBMITS_PER_CHALLENGE = 2;
const TILE_CLICKS_PER_CHALLENGE = 24;
const challengeLedger = new WeakMap<Page, Map<string, { submits: number; clicks: number }>>();

/**
 * A captcha stands between the person and their own errand, so the job is to get them past it, never to
 * defeat it at scale: two honest submissions read from the screenshot, then hand it to the person or move
 * to another source. No solving service, no reloading for an easier puzzle.
 */
async function executeChallenge(page: Page, action: Extract<BrowseAction, { verb: 'challenge' }>, prior: BrowseObservation | null): Promise<null> {
  if (!await isChallengePage(page)) browseFail('BROWSE_CHALLENGE_ABSENT', 'challenge actions apply only to a captcha page; use ordinary browse actions elsewhere');
  if (!prior || prior.url !== page.url()) browseFail('BROWSE_STALE_OBSERVATION', 'take a shot of the challenge first; coordinates come from that screenshot');
  const key = new URL(page.url()).origin + new URL(page.url()).pathname;
  const ledger = challengeLedger.get(page) ?? new Map<string, { submits: number; clicks: number }>();
  challengeLedger.set(page, ledger);
  const entry = ledger.get(key) ?? { submits: 0, clicks: 0 };
  const submits = action.method !== 'click' || action.submit;
  if (submits && entry.submits >= SUBMITS_PER_CHALLENGE) {
    browseFail('BROWSE_CHALLENGE_HANDOFF', 'two honest attempts did not pass. Hand the challenge to the person watching this browser (profile or cdp mode), or record the source as blocked and continue with another provider. Do not use a solving service or reload for an easier puzzle.');
  }
  if (!submits && entry.clicks >= TILE_CLICKS_PER_CHALLENGE) browseFail('BROWSE_CHALLENGE_HANDOFF', 'tile clicks exhausted for this challenge; hand it to the person or move to another source.');
  // Screenshot pixels to CSS pixels: the observation records its device pixel ratio.
  const css = (value: number | null) => value === null ? 0 : value / prior.dpr;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= prior.viewport.width && y <= prior.viewport.height;
  const from = { x: css(action.x), y: css(action.y) }, to = { x: css(action.toX), y: css(action.toY) };
  if ((action.method === 'click' || action.method === 'drag') && !inside(from.x, from.y)) browseFail('BROWSE_CHALLENGE_TARGET', 'coordinates fall outside the last screenshot');
  if (action.method === 'drag' && !inside(to.x, to.y)) browseFail('BROWSE_CHALLENGE_TARGET', 'drag end falls outside the last screenshot');
  ledger.set(key, { submits: entry.submits + Number(submits), clicks: entry.clicks + Number(!submits) });
  if (action.method === 'checkbox') await clearCheckboxChallenge(page, () => isChallengePage(page));
  else if (action.method === 'click') await page.mouse.click(from.x, from.y, { delay: 60 });
  else if (action.method === 'drag') {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 28 });
    await page.mouse.up();
  } else {
    await page.keyboard.type(action.text ?? '', { delay: 70 });
    await page.keyboard.press('Enter');
  }
  // Let the widget answer (tick, new grid, navigation) before the engine captures the result.
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(submits ? 2500 : 400);
  return null;
}

async function exactTarget(page: Page, action: { selector: string | null; text: string | null }, prior: BrowseObservation | null): Promise<BrowseControl> {
  if (!prior || prior.url !== page.url()) browseFail('BROWSE_STALE_OBSERVATION', 'take a shot before acting on unobserved page state');
  const controls = prior.controls.filter(control => action.selector ? control.selector === action.selector : control.label === action.text);
  if (controls.length !== 1) browseFail('BROWSE_TARGET', 'target must name exactly one control in the recorded visible snapshot; gallery result cards that are not links are kept with shot --selector <that item\'s img>');
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
    case 'cookie': {
      const target = await exactTarget(page, action, prior); authorizeCookieChoice(target);
      // Structure, not wording: a form-free button inside the dialog or fixed layer that covers the page.
      const notice = await page.locator(target.selector).evaluate(node => {
        if (!(node instanceof HTMLButtonElement) || node.disabled || (node.type !== 'button' && (node.type !== 'submit' || node.form))
          || node.closest('form, a, [role="link"]') || node.hasAttribute('formaction') || node.hasAttribute('popovertarget')) return false;
        for (let layer: Element | null = node; layer; layer = layer.parentElement) {
          if (layer.matches('dialog[open], [role="dialog"], [role="alertdialog"]') || ['fixed', 'sticky'].includes(getComputedStyle(layer).position)) {
            return !layer.querySelector('input[type="password"], input[autocomplete^="cc-"]');
          }
        }
        return false;
      });
      if (!notice) browseFail('BROWSE_COOKIE_CHOICE', 'the button must sit in the fixed notice or dialog that covers the page, outside any form');
      const url = page.url();
      await page.locator(target.selector).click({ timeout, noWaitAfter: true });
      if (page.url() !== url) browseFail('BROWSE_COOKIE_CHOICE', 'the cookie choice navigated away; go back to the page');
      return target;
    }
    case 'back': await page.goBack({ waitUntil: 'domcontentloaded', timeout }); return null;
    case 'challenge': return executeChallenge(page, action, prior);
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
