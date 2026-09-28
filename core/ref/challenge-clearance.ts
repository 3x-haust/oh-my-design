import type { Page } from 'playwright';
import { browserCallback } from './browser-evaluation.ts';

const CHECKBOX_SELECTORS = [
  'input[type="checkbox"]', '[role="checkbox"]', '#recaptcha-anchor', '.hcaptcha-checkbox',
  'label[for*="checkbox"]',
];
const CHALLENGE_FRAMES = /(?:cloudflare|turnstile|recaptcha|google\.com\/recaptcha|hcaptcha)/i;

/** Attempt a checkbox only inside a known challenge iframe; never submit unrelated forms. */
export async function clearCheckboxChallenge(page: Page, blocked: () => Promise<boolean>, signal?: AbortSignal): Promise<boolean> {
  if (!await blocked()) return true;
  for (const frame of page.frames()) {
    if (!CHALLENGE_FRAMES.test(frame.url())) continue;
    for (const selector of CHECKBOX_SELECTORS) {
      if (signal?.aborted) return false;
      const checkbox = frame.locator(selector).first();
      if (!await checkbox.isVisible().catch(() => false)) continue;
      await checkbox.click({ timeout: 2000 }).catch(() => undefined);
      break;
    }
  }
  // Subscribe before attempting clearance: load/navigation and DOM mutations are
  // the precise signals, bounded by the acquisition deadline rather than sleeps.
  if (await blocked()) {
    await page.evaluate(browserCallback(() => new Promise<void>(resolve => {
      const observer = new MutationObserver(() => { observer.disconnect(); resolve(); });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      setTimeout(() => { observer.disconnect(); resolve(); }, 5000);
    }))).catch(() => undefined);
  }
  return !await blocked();
}
