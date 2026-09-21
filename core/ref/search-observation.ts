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
      let opacity = 1;
      const ancestors: Element[] = [];
      const styles: CSSStyleDeclaration[] = [];
      for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        ancestors.push(ancestor); styles.push(style);
        const level = Number(style.opacity); opacity *= Number.isFinite(level) ? level : 1;
        if (style.display === 'none' || style.visibility !== 'visible' || opacity < 0.05
          || style.contentVisibility === 'hidden' || style.clipPath !== 'none' || style.clip !== 'auto'
          || style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.backgroundImage !== 'none'
          || style.getPropertyValue('mask-image') !== 'none'
          || !['', 'none'].includes(style.getPropertyValue('-webkit-mask-image'))) { hidden = true; break; }
      }
      const color = styles[0]?.color ?? '';
      const fill = styles[0]?.getPropertyValue('-webkit-text-fill-color') ?? '';
      const backgrounds = styles.map(style => style.backgroundColor);
      let red = 255; let green = 255; let blue = 255;
      for (let index = backgrounds.length - 1; index >= 0; index--) {
        const channels = backgrounds[index]!.match(/[\d.]+/g)?.map(Number) ?? [];
        if (channels.length < 3) continue;
        const alpha = channels[3] ?? 1;
        red = channels[0]! * alpha + red * (1 - alpha);
        green = channels[1]! * alpha + green * (1 - alpha);
        blue = channels[2]! * alpha + blue * (1 - alpha);
      }
      const foreground = (fill && fill !== 'currentcolor' ? fill : color).match(/[\d.]+/g)?.map(Number) ?? [];
      const foregroundAlpha = (foreground[3] ?? 1) * opacity;
      const textRed = (foreground[0] ?? red) * foregroundAlpha + red * (1 - foregroundAlpha);
      const textGreen = (foreground[1] ?? green) * foregroundAlpha + green * (1 - foregroundAlpha);
      const textBlue = (foreground[2] ?? blue) * foregroundAlpha + blue * (1 - foregroundAlpha);
      const backgroundLum = 0.2126 * (red <= 10.016 ? red / 3294.6 : Math.pow((red / 255 + .055) / 1.055, 2.4))
        + 0.7152 * (green <= 10.016 ? green / 3294.6 : Math.pow((green / 255 + .055) / 1.055, 2.4))
        + 0.0722 * (blue <= 10.016 ? blue / 3294.6 : Math.pow((blue / 255 + .055) / 1.055, 2.4));
      const textLum = 0.2126 * (textRed <= 10.016 ? textRed / 3294.6 : Math.pow((textRed / 255 + .055) / 1.055, 2.4))
        + 0.7152 * (textGreen <= 10.016 ? textGreen / 3294.6 : Math.pow((textGreen / 255 + .055) / 1.055, 2.4))
        + 0.0722 * (textBlue <= 10.016 ? textBlue / 3294.6 : Math.pow((textBlue / 255 + .055) / 1.055, 2.4));
      const contrast = (Math.max(backgroundLum, textLum) + .05) / (Math.min(backgroundLum, textLum) + .05);
      if (hidden || color === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color)
        || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(color)
        || fill === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(fill)
        || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(fill)
        || styles[0]?.fontSize === '0px' || contrast < 1.5) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rendered = Array.from(range.getClientRects()).some(rect => {
        let left = Math.max(0, rect.left); let right = Math.min(innerWidth, rect.right);
        let top = Math.max(0, rect.top); let bottom = Math.min(innerHeight, rect.bottom);
        for (let index = 0; index < ancestors.length; index++) {
          const style = styles[index]!; const box = ancestors[index]!.getBoundingClientRect();
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
        let pseudoOccluded = false;
        const proofContainer = parent.closest('a, h1, h2, h3, p, li, button, [role="heading"]');
        const pseudoOwners = proofContainer && proofContainer !== parent ? [parent, proofContainer] : [parent];
        for (const owner of pseudoOwners) {
          if (pseudoOccluded) break;
          pseudoOccluded = ['::before', '::after'].some(pseudo => {
            const style = getComputedStyle(owner, pseudo); const box = owner.getBoundingClientRect();
            const background = style.backgroundColor; const z = Number.parseInt(style.zIndex, 10);
            const horizontal = (style.left !== 'auto' && style.right !== 'auto') || Number.parseFloat(style.width) >= box.width;
            const vertical = (style.top !== 'auto' && style.bottom !== 'auto') || Number.parseFloat(style.height) >= box.height;
            const aboveText = pseudo === '::after' ? !Number.isFinite(z) || z >= 0 : Number.isFinite(z) && z > 0;
            return !['none', 'normal'].includes(style.content) && ['absolute', 'fixed', 'sticky'].includes(style.position)
              && aboveText && horizontal && vertical && box.left <= x && box.right >= x
              && box.top <= y && box.bottom >= y && background !== 'transparent'
              && !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(background) && !/^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(background);
          });
        }
        if (occluded || pseudoOccluded) return false;
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
      let opacity = 1;
      const ancestors: Element[] = [];
      const styles: CSSStyleDeclaration[] = [];
      for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        ancestors.push(ancestor); styles.push(style);
        const level = Number(style.opacity); opacity *= Number.isFinite(level) ? level : 1;
        if (style.display === 'none' || style.visibility !== 'visible' || opacity < 0.05
          || style.contentVisibility === 'hidden' || style.clipPath !== 'none' || style.clip !== 'auto'
          || style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.backgroundImage !== 'none'
          || style.getPropertyValue('mask-image') !== 'none'
          || !['', 'none'].includes(style.getPropertyValue('-webkit-mask-image'))) { hidden = true; break; }
      }
      const color = styles[0]?.color ?? '';
      const fill = styles[0]?.getPropertyValue('-webkit-text-fill-color') ?? '';
      const backgrounds = styles.map(style => style.backgroundColor);
      let red = 255; let green = 255; let blue = 255;
      for (let index = backgrounds.length - 1; index >= 0; index--) {
        const channels = backgrounds[index]!.match(/[\d.]+/g)?.map(Number) ?? [];
        if (channels.length < 3) continue;
        const alpha = channels[3] ?? 1;
        red = channels[0]! * alpha + red * (1 - alpha);
        green = channels[1]! * alpha + green * (1 - alpha);
        blue = channels[2]! * alpha + blue * (1 - alpha);
      }
      const foreground = (fill && fill !== 'currentcolor' ? fill : color).match(/[\d.]+/g)?.map(Number) ?? [];
      const foregroundAlpha = (foreground[3] ?? 1) * opacity;
      const textRed = (foreground[0] ?? red) * foregroundAlpha + red * (1 - foregroundAlpha);
      const textGreen = (foreground[1] ?? green) * foregroundAlpha + green * (1 - foregroundAlpha);
      const textBlue = (foreground[2] ?? blue) * foregroundAlpha + blue * (1 - foregroundAlpha);
      const backgroundLum = 0.2126 * (red <= 10.016 ? red / 3294.6 : Math.pow((red / 255 + .055) / 1.055, 2.4))
        + 0.7152 * (green <= 10.016 ? green / 3294.6 : Math.pow((green / 255 + .055) / 1.055, 2.4))
        + 0.0722 * (blue <= 10.016 ? blue / 3294.6 : Math.pow((blue / 255 + .055) / 1.055, 2.4));
      const textLum = 0.2126 * (textRed <= 10.016 ? textRed / 3294.6 : Math.pow((textRed / 255 + .055) / 1.055, 2.4))
        + 0.7152 * (textGreen <= 10.016 ? textGreen / 3294.6 : Math.pow((textGreen / 255 + .055) / 1.055, 2.4))
        + 0.0722 * (textBlue <= 10.016 ? textBlue / 3294.6 : Math.pow((textBlue / 255 + .055) / 1.055, 2.4));
      const contrast = (Math.max(backgroundLum, textLum) + .05) / (Math.min(backgroundLum, textLum) + .05);
      if (hidden || color === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color)
        || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(color)
        || fill === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(fill)
        || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(fill)
        || styles[0]?.fontSize === '0px' || contrast < 1.5) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rendered = Array.from(range.getClientRects()).some(rect => {
        let left = Math.max(0, rect.left); let right = Math.min(innerWidth, rect.right);
        let top = Math.max(0, rect.top); let bottom = Math.min(innerHeight, rect.bottom);
        for (let index = 0; index < ancestors.length; index++) {
          const style = styles[index]!; const box = ancestors[index]!.getBoundingClientRect();
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
        let pseudoOccluded = false;
        const proofContainer = parent.closest('a, h1, h2, h3, p, li, button, [role="heading"]');
        const pseudoOwners = proofContainer && proofContainer !== parent ? [parent, proofContainer] : [parent];
        for (const owner of pseudoOwners) {
          if (pseudoOccluded) break;
          pseudoOccluded = ['::before', '::after'].some(pseudo => {
            const style = getComputedStyle(owner, pseudo); const box = owner.getBoundingClientRect();
            const background = style.backgroundColor; const z = Number.parseInt(style.zIndex, 10);
            const horizontal = (style.left !== 'auto' && style.right !== 'auto') || Number.parseFloat(style.width) >= box.width;
            const vertical = (style.top !== 'auto' && style.bottom !== 'auto') || Number.parseFloat(style.height) >= box.height;
            const aboveText = pseudo === '::after' ? !Number.isFinite(z) || z >= 0 : Number.isFinite(z) && z > 0;
            return !['none', 'normal'].includes(style.content) && ['absolute', 'fixed', 'sticky'].includes(style.position)
              && aboveText && horizontal && vertical && box.left <= x && box.right >= x
              && box.top <= y && box.bottom >= y && background !== 'transparent'
              && !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(background) && !/^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(background);
          });
        }
        if (occluded || pseudoOccluded) return false;
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
