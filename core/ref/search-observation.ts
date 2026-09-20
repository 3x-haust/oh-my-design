import type { Page } from 'playwright';

async function renderedState(page: Page) {
  const anchors = await page.locator('a[href]').evaluateAll(elements => elements.flatMap(element => {
    if (!(element instanceof HTMLAnchorElement)) return [];
    const href = element.href;
    try {
      const link = new URL(href);
      if (link.protocol !== 'https:' || link.username || link.password || link.hash) return [];
    } catch { return []; }
    const box = element.getBoundingClientRect();
    const left = Math.max(0, box.left); const right = Math.min(innerWidth, box.right);
    const top = Math.max(0, box.top); const bottom = Math.min(innerHeight, box.bottom);
    if (right <= left || bottom <= top) return [];
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0
        || style.contentVisibility === 'hidden') return [];
    }
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    if (!hit || !element.contains(hit)) return [];
    return [{ href, text: element.innerText, left, right, top, bottom }];
  }).slice(0, 2000));
  return { anchors, body: await page.locator('body').innerText(), url: page.url() };
}

class DiscoveryObservationError extends Error {
  constructor() { super('Discovery rendering changed during both bounded captures; no consistent screenshot/link evidence was retained.'); }
}

export async function captureDiscoveryObservation(page: Page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await renderedState(page);
    const bytes = await page.screenshot({ timeout: 10000 });
    const after = await renderedState(page);
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return { bytes, links: [...new Set(before.anchors.map(anchor => anchor.href))], body: before.body, url: before.url };
    }
  }
  throw new DiscoveryObservationError();
}

export const captureSearchObservation = captureDiscoveryObservation;
