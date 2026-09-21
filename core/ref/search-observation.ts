import type { Page } from 'playwright';

export async function renderedState(page: Page) {
  const rendered = await page.locator('body').evaluate(body => {
    const pointerless = Array.from(document.querySelectorAll<HTMLElement>('*'))
      .filter(element => getComputedStyle(element).pointerEvents === 'none')
      .map(element => ({ element, value: element.style.getPropertyValue('pointer-events'),
        priority: element.style.getPropertyPriority('pointer-events') }));
    for (const entry of pointerless) entry.element.style.setProperty('pointer-events', 'auto', 'important');
    try {
      const anchors = new Map<HTMLAnchorElement, { href: string; text: string[]; left: number; right: number; top: number; bottom: number }>();
      for (const element of body.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        let href: string;
        try { href = new URL(element.href).href; } catch { continue; }
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const box = element.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0 || box.right <= 0 || box.bottom <= 0
          || box.left >= innerWidth || box.top >= innerHeight) continue;
        anchors.set(element, { href, text: [], left: box.left, right: box.right, top: box.top, bottom: box.bottom });
      }

      const visibleText: string[] = [];
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!(parent instanceof HTMLElement) || value === '') continue;

        const styles: CSSStyleDeclaration[] = [];
        let opacity = 1; let transformScale = 1; let filterOpacity = 1; let hidden = false;
        for (let ancestor: HTMLElement | null = parent; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor); styles.push(style);
          const level = Number(style.opacity); opacity *= Number.isFinite(level) ? level : 1;
          if (style.transform !== 'none') {
            const matrix = new DOMMatrixReadOnly(style.transform);
            transformScale *= Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
          }
          for (const match of style.filter.matchAll(/opacity\(\s*([0-9.]+)(%)?\s*\)/g)) {
            const amount = Number(match[1]); filterOpacity *= match[2] ? amount / 100 : amount;
          }
          if (style.display === 'none' || style.visibility !== 'visible' || opacity < .05
            || transformScale < .05 || filterOpacity < .05 || style.contentVisibility === 'hidden'
            || /^inset\(100%/.test(style.clipPath)
            || /blur\(\s*(?:[89]|[1-9]\d)(?:\.\d+)?px/.test(style.filter)
            || style.mixBlendMode !== 'normal') { hidden = true; break; }
        }
        const color = styles[0]?.color ?? '';
        const fill = styles[0]?.getPropertyValue('-webkit-text-fill-color') ?? '';
        if (hidden || color === 'transparent' || fill === 'transparent'
          || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color) || /^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(color)) continue;

        let background = 'rgb(255, 255, 255)';
        for (const style of styles) {
          const candidate = style.backgroundColor;
          if (candidate !== 'transparent' && !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(candidate)
            && !/^rgb\([^)]*\/\s*0(?:\.0+)?\)$/.test(candidate)) { background = candidate; break; }
        }
        const foregroundRgb = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        const backgroundRgb = background.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        if (foregroundRgb?.length === 3 && backgroundRgb?.length === 3) {
          const foregroundLuminance = foregroundRgb.map(channel => channel / 255)
            .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
            .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index]!, 0);
          const backgroundLuminance = backgroundRgb.map(channel => channel / 255)
            .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
            .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index]!, 0);
          if ((Math.max(foregroundLuminance, backgroundLuminance) + .05)
            / (Math.min(foregroundLuminance, backgroundLuminance) + .05) < 1.2) continue;
        }

        const range = document.createRange(); range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0
          && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight);
        const textVisible = rects.some(rect => {
          const points = [[rect.left + 1, rect.top + 1], [rect.right - 1, rect.top + 1],
            [rect.left + rect.width / 2, rect.top + rect.height / 2],
            [rect.left + 1, rect.bottom - 1], [rect.right - 1, rect.bottom - 1]];
          return points.some(([rawX, rawY]) => {
            const x = Math.min(innerWidth - 1, Math.max(0, rawX ?? 0));
            const y = Math.min(innerHeight - 1, Math.max(0, rawY ?? 0));
            const stack = document.elementsFromPoint(x, y);
            const parentIndex = stack.findIndex(element => element === parent || element.contains(parent));
            if (parentIndex < 0) return false;
            const covered = stack.slice(0, parentIndex).some(candidate => {
              if (candidate.contains(parent)) return false;
              const style = getComputedStyle(candidate); let alpha = 1;
              for (let owner: Element | null = candidate; owner; owner = owner.parentElement) {
                const amount = Number(getComputedStyle(owner).opacity); alpha *= Number.isFinite(amount) ? amount : 1;
              }
              const colour = style.backgroundColor;
              const alphaMatch = colour.match(/rgba\([^)]*,\s*([\d.]+)\)|rgb\([^)]*\/\s*([\d.]+)(%)?\)/);
              const colourAlpha = alphaMatch ? Number(alphaMatch[1] ?? alphaMatch[2]) / (alphaMatch[3] ? 100 : 1)
                : colour === 'transparent' ? 0 : 1;
              const painted = colourAlpha >= .05 || style.backgroundImage !== 'none'
                || ['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE'].includes(candidate.tagName);
              return alpha >= .05 && painted;
            });
            if (covered) return false;

            const proofContainer = parent.closest('a, h1, h2, h3, p, li, button, [role="heading"]');
            const pseudoOwners = proofContainer && proofContainer !== parent ? [parent, proofContainer] : [parent];
            for (const owner of pseudoOwners) {
              const ownerBox = owner.getBoundingClientRect();
              const pseudoCovered = ['::before', '::after'].some(pseudo => {
                const style = getComputedStyle(owner, pseudo); const z = Number.parseInt(style.zIndex, 10);
                const horizontal = (style.left !== 'auto' && style.right !== 'auto') || Number.parseFloat(style.width) >= ownerBox.width;
                const vertical = (style.top !== 'auto' && style.bottom !== 'auto') || Number.parseFloat(style.height) >= ownerBox.height;
                const aboveText = pseudo === '::after' ? !Number.isFinite(z) || z >= 0 : Number.isFinite(z) && z > 0;
                const colour = style.backgroundColor;
                const alphaMatch = colour.match(/rgba\([^)]*,\s*([\d.]+)\)|rgb\([^)]*\/\s*([\d.]+)(%)?\)/);
                const colourAlpha = alphaMatch ? Number(alphaMatch[1] ?? alphaMatch[2]) / (alphaMatch[3] ? 100 : 1)
                  : colour === 'transparent' ? 0 : 1;
                return !['none', 'normal'].includes(style.content) && ['absolute', 'fixed', 'sticky'].includes(style.position)
                  && aboveText && horizontal && vertical && Number(style.opacity) >= .05
                  && x >= ownerBox.left && x <= ownerBox.right && y >= ownerBox.top && y <= ownerBox.bottom
                  && (colourAlpha >= .05 || style.backgroundImage !== 'none');
              });
              if (pseudoCovered) return false;
            }
            return true;
          });
        });
        range.detach();
        if (!textVisible) continue;
        visibleText.push(value);
        const anchor = parent.closest<HTMLAnchorElement>('a[href]');
        if (anchor && anchors.has(anchor)) anchors.get(anchor)!.text.push(value);
      }
      return {
        anchors: [...anchors.values()].map(anchor => ({ ...anchor, text: anchor.text.join(' ').slice(0, 4096) })).slice(0, 2000),
        visibleText: visibleText.join('\n'),
      };
    } finally {
      for (const entry of pointerless) {
        if (entry.value) entry.element.style.setProperty('pointer-events', entry.value, entry.priority);
        else entry.element.style.removeProperty('pointer-events');
      }
    }
  });
  return { anchors: rendered.anchors, body: await page.locator('body').innerText(),
    visibleText: rendered.visibleText, url: page.url() };
}
