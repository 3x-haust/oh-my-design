import type { Page } from 'playwright';
import type { DocumentObserver } from './document-observation.ts';

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
  const visibleText = await page.locator('body').evaluate(body => {
    const selector = 'h1, h2, h3, p, li, a, button, [role="heading"]';
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const lines: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || parent.closest(selector) === null) continue;
      let hidden = false;
      for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0
          || style.contentVisibility === 'hidden') { hidden = true; break; }
      }
      if (hidden) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rendered = Array.from(range.getClientRects()).some(box => {
        const left = Math.max(0, box.left); const right = Math.min(innerWidth, box.right);
        const top = Math.max(0, box.top); const bottom = Math.min(innerHeight, box.bottom);
        if (right <= left || bottom <= top) return false;
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        return hit !== null && parent.contains(hit);
      });
      range.detach();
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (rendered && text) lines.push(text);
    }
    return lines.join('\n').slice(0, 4096);
  });
  return { anchors, body: await page.locator('body').innerText(), visibleText, url: page.url() };
}

class DiscoveryObservationError extends Error {
  constructor() { super('Discovery rendering changed during both bounded captures; no consistent screenshot/link evidence was retained.'); }
}

export async function captureDiscoveryObservation(page: Page, documents: DocumentObserver) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const beforeDocument = await documents.current();
    const before = await renderedState(page);
    const bytes = await page.screenshot({ timeout: 10000 });
    const after = await renderedState(page);
    const afterDocument = await documents.current();
    if (beforeDocument.identity === afterDocument.identity && beforeDocument.httpStatus === afterDocument.httpStatus
      && JSON.stringify(before) === JSON.stringify(after)) {
      return { bytes, links: [...new Set(before.anchors.map(anchor => anchor.href))], body: before.body,
        visibleText: before.visibleText, url: before.url,
        httpStatus: afterDocument.httpStatus };
    }
  }
  throw new DiscoveryObservationError();
}

export const captureSearchObservation = captureDiscoveryObservation;
