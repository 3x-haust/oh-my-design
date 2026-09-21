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
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.05
          || style.contentVisibility === 'hidden' || style.clipPath !== 'none' || style.clip !== 'auto'
          || style.filter !== 'none' || style.getPropertyValue('mask-image') !== 'none'
          || !['', 'none'].includes(style.getPropertyValue('-webkit-mask-image'))) { hidden = true; break; }
      }
      const color = getComputedStyle(parent).color;
      const fill = getComputedStyle(parent).getPropertyValue('-webkit-text-fill-color');
      if (hidden || color === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color)
        || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(color)
        || fill === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(fill)
        || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(fill)
        || getComputedStyle(parent).fontSize === '0px') continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rendered = Array.from(range.getClientRects()).some(rect => {
        let left = Math.max(0, rect.left); let right = Math.min(innerWidth, rect.right);
        let top = Math.max(0, rect.top); let bottom = Math.min(innerHeight, rect.bottom);
        for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor); const box = ancestor.getBoundingClientRect();
          if (style.overflowX !== 'visible') { left = Math.max(left, box.left); right = Math.min(right, box.right); }
          if (style.overflowY !== 'visible') { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
        }
        if (right <= left || bottom <= top) return false;
        const x = (left + right) / 2; const y = (top + bottom) / 2;
        const occluded = Array.from(parent.querySelectorAll('*')).some(candidate => {
          const style = getComputedStyle(candidate); const box = candidate.getBoundingClientRect();
          const background = style.backgroundColor;
          const z = Number.parseInt(style.zIndex, 10);
          return ['absolute', 'fixed', 'sticky'].includes(style.position) && (!Number.isFinite(z) || z >= 0)
            && style.visibility === 'visible' && Number(style.opacity) >= 0.05
            && background !== 'transparent' && !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(background)
            && !/^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(background)
            && box.left <= x && box.right >= x && box.top <= y && box.bottom >= y;
        });
        if (occluded) return false;
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
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.05
          || style.contentVisibility === 'hidden' || style.clipPath !== 'none' || style.clip !== 'auto'
          || style.filter !== 'none' || style.getPropertyValue('mask-image') !== 'none'
          || !['', 'none'].includes(style.getPropertyValue('-webkit-mask-image'))) { hidden = true; break; }
      }
      const color = getComputedStyle(parent).color;
      const fill = getComputedStyle(parent).getPropertyValue('-webkit-text-fill-color');
      if (hidden || color === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color)
        || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(color)
        || fill === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(fill)
        || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(fill)
        || getComputedStyle(parent).fontSize === '0px') continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rendered = Array.from(range.getClientRects()).some(rect => {
        let left = Math.max(0, rect.left); let right = Math.min(innerWidth, rect.right);
        let top = Math.max(0, rect.top); let bottom = Math.min(innerHeight, rect.bottom);
        for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor); const box = ancestor.getBoundingClientRect();
          if (style.overflowX !== 'visible') { left = Math.max(left, box.left); right = Math.min(right, box.right); }
          if (style.overflowY !== 'visible') { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
        }
        if (right <= left || bottom <= top) return false;
        const x = (left + right) / 2; const y = (top + bottom) / 2;
        const occluded = Array.from(parent.querySelectorAll('*')).some(candidate => {
          const style = getComputedStyle(candidate); const box = candidate.getBoundingClientRect();
          const background = style.backgroundColor;
          const z = Number.parseInt(style.zIndex, 10);
          return ['absolute', 'fixed', 'sticky'].includes(style.position) && (!Number.isFinite(z) || z >= 0)
            && style.visibility === 'visible' && Number(style.opacity) >= 0.05
            && background !== 'transparent' && !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(background)
            && !/^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(background)
            && box.left <= x && box.right >= x && box.top <= y && box.bottom >= y;
        });
        if (occluded) return false;
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
