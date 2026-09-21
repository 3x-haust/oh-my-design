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
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const lines: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null) continue;
      let hidden = false;
      for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0
          || style.contentVisibility === 'hidden') { hidden = true; break; }
      }
      if (hidden) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rendered = Array.from(range.getClientRects()).some(rect => {
        const x = (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2;
        const y = (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
        if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return false;
        const front = document.elementsFromPoint(x, y)[0];
        return front === parent || front?.contains(parent) === true;
      });
      range.detach();
      const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (rendered && value) lines.push(value);
    }
    return [{ href, text: lines.join(' ').slice(0, 4096), left, right, top, bottom }];
  }).slice(0, 2000));
  const visibleText = await page.locator('body').evaluate(body => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const lines: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || parent.closest('h1, h2, h3, p, li, a, button, [role="heading"]') === null) continue;
      let hidden = false;
      for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0
          || style.contentVisibility === 'hidden') { hidden = true; break; }
      }
      if (hidden) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rendered = Array.from(range.getClientRects()).some(rect => {
        const x = (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2;
        const y = (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
        if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return false;
        const front = document.elementsFromPoint(x, y)[0];
        return front === parent || front?.contains(parent) === true;
      });
      range.detach();
      const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (rendered && value) lines.push(value);
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
      return { bytes, links: [...new Set(before.anchors.map(anchor => anchor.href))],
        results: before.anchors.map(anchor => ({ url: anchor.href, text: anchor.text.replace(/\s+/g, ' ').trim() }))
          .filter((result, index, all) => result.text && all.findIndex(candidate => candidate.url === result.url) === index),
        body: before.body,
        visibleText: before.visibleText, url: before.url,
        httpStatus: afterDocument.httpStatus };
    }
  }
  throw new DiscoveryObservationError();
}

export const captureSearchObservation = captureDiscoveryObservation;
