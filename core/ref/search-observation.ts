import type { Page } from 'playwright';
import { captureFrozenSearchText } from './search-frozen-capture.ts';
import { finalizeSearchRenderedState, type RawSearchRenderedState, type SearchPixelSample } from './search-pixel-contrast.ts';

export async function inspectRenderedState(page: Page): Promise<RawSearchRenderedState> {
  const rendered = await page.locator('body').evaluate(body => {
    const pointerlessOverlays = Array.from(document.querySelectorAll<HTMLElement>('*')).flatMap(element => {
      const style = getComputedStyle(element);
      if (style.pointerEvents !== 'none' || !['absolute', 'fixed', 'sticky'].includes(style.position)
        || style.display === 'none' || style.visibility !== 'visible') return [];
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return [];
      let opacity = 1; let effectiveZ = Number.NaN;
      for (let owner: HTMLElement | null = element; owner; owner = owner.parentElement) {
        const ownerStyle = getComputedStyle(owner); const amount = Number(ownerStyle.opacity);
        opacity *= Number.isFinite(amount) ? amount : 1;
        if (!Number.isFinite(effectiveZ)) {
          const z = Number.parseInt(ownerStyle.zIndex, 10); if (Number.isFinite(z)) effectiveZ = z;
        }
      }
      const colour = style.backgroundColor; const colourParts = colour.match(/[\d.]+/g)?.map(Number) ?? [];
      const colourAlpha = colourParts.length >= 4 ? colourParts[3] ?? 0 : colour === 'transparent' ? 0 : 1;
      const ownPaint = colourAlpha >= .05 || style.backgroundImage !== 'none'
        || ['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE'].includes(element.tagName);
      const pseudoPaint = ['::before', '::after'].flatMap(pseudo => {
        const pseudoStyle = getComputedStyle(element, pseudo);
        const pseudoColour = pseudoStyle.backgroundColor;
        const parts = pseudoColour.match(/[\d.]+/g)?.map(Number) ?? [];
        const alpha = parts.length >= 4 ? parts[3] ?? 0 : pseudoColour === 'transparent' ? 0 : 1;
        if (['none', 'normal'].includes(pseudoStyle.content) || Number(pseudoStyle.opacity) < .05
          || (alpha < .05 && pseudoStyle.backgroundImage === 'none')) return [];
        const pseudoZ = Number.parseInt(pseudoStyle.zIndex, 10);
        return [{ element, box, effectiveZ: Number.isFinite(pseudoZ) ? pseudoZ : effectiveZ }];
      });
      if (opacity < .05) return [];
      return [...(ownPaint ? [{ element, box, effectiveZ }] : []), ...pseudoPaint];
    });

    const anchors = new Map<HTMLAnchorElement, { href: string; text: string[]; left: number; right: number; top: number; bottom: number }>();
    for (const element of body.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      let parsed: URL;
      try { parsed = new URL(element.href); } catch { continue; }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) continue;
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || box.right <= 0 || box.bottom <= 0
        || box.left >= innerWidth || box.top >= innerHeight) continue;
      anchors.set(element, { href: parsed.href, text: [], left: box.left, right: box.right, top: box.top, bottom: box.bottom });
    }

    const visibleText: Array<{ id: number; value: string }> = [];
    const uncertain: SearchPixelSample[] = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!(parent instanceof HTMLElement) || value === '') continue;

      const styles: CSSStyleDeclaration[] = [];
      let opacity = 1; let transformScale = 1; let filterOpacity = 1; let hidden = false; let targetZ = Number.NaN;
      for (let ancestor: HTMLElement | null = parent; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor); styles.push(style);
        const level = Number(style.opacity); opacity *= Number.isFinite(level) ? level : 1;
        if (!Number.isFinite(targetZ)) {
          const z = Number.parseInt(style.zIndex, 10); if (Number.isFinite(z)) targetZ = z;
        }
        if (style.transform !== 'none') {
          const matrix = new DOMMatrixReadOnly(style.transform);
          transformScale *= Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
        }
        for (const match of style.filter.matchAll(/opacity\(\s*([0-9.]+)(%)?\s*\)/g)) {
          const amount = Number(match[1]); filterOpacity *= match[2] ? amount / 100 : amount;
        }
        const blurred = [...style.filter.matchAll(/blur\(\s*([0-9.]+)px\s*\)/g)]
          .some(match => Number(match[1]) >= 4);
        const mask = style.getPropertyValue('mask-image') || style.getPropertyValue('-webkit-mask-image');
        const maskColours = [...mask.matchAll(/rgba?\([^)]*\)/g)].map(match => match[0]);
        const transparentMask = mask !== '' && mask !== 'none' && maskColours.length > 0
          && maskColours.every(colour => colour === 'transparent'
            || /rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(colour) || /rgb\([^)]*\/\s*0(?:\.0+)?%?\)$/.test(colour));
        const clipBox = ancestor.getBoundingClientRect();
        const inset = style.clipPath.match(/^inset\(([^)]*?)(?:\s+round\s+[^)]*)?\)$/);
        let tinyClip = false;
        if (inset) {
          const raw = inset[1] ?? '';
          const values = raw.trim().split(/\s+/).map(token => {
            const amount = Number.parseFloat(token); if (!Number.isFinite(amount)) return 0;
            return token.endsWith('%') ? amount / 100 : token.endsWith('px') ? amount : 0;
          });
          const [top = 0, right = top, bottom = top, left = right] = values.length === 2
            ? [values[0], values[1], values[0], values[1]] : values.length === 3
              ? [values[0], values[1], values[2], values[1]] : values;
          tinyClip = raw.includes('%') ? top + bottom >= .99 || left + right >= .99
            : clipBox.height - top - bottom < 2 || clipBox.width - left - right < 2;
        }
        const radial = style.clipPath.match(/^(?:circle|ellipse)\(\s*([0-9.]+)(px|%)/);
        tinyClip ||= radial !== null && (radial[2] === '%' ? Number(radial[1]) < 1 : Number(radial[1]) < 2);
        const polygon = style.clipPath.match(/^polygon\(([^)]*)\)$/);
        if (polygon) {
          const points = [...(polygon[1] ?? '').matchAll(/([0-9.]+)(%|px)\s+([0-9.]+)(%|px)/g)];
          if (points.length >= 3) {
            const xs = points.map(point => Number(point[1]) * (point[2] === '%' ? clipBox.width / 100 : 1));
            const ys = points.map(point => Number(point[3]) * (point[4] === '%' ? clipBox.height / 100 : 1));
            tinyClip ||= Math.max(...xs) - Math.min(...xs) < 2 || Math.max(...ys) - Math.min(...ys) < 2;
          } else tinyClip = true;
        }
        tinyClip ||= /^path\(/.test(style.clipPath) || style.clipPath.includes('calc(');
        if (style.display === 'none' || style.visibility !== 'visible' || opacity < .05
          || transformScale < .05 || filterOpacity < .05 || style.contentVisibility === 'hidden'
          || tinyClip || transparentMask || blurred || style.mixBlendMode !== 'normal') { hidden = true; break; }
      }
      const color = styles[0]?.color ?? '';
      const fill = styles[0]?.getPropertyValue('-webkit-text-fill-color') ?? '';
      const effectiveFontSize = Number.parseFloat(styles[0]?.fontSize ?? '0') * transformScale;
      if (hidden || color === 'transparent' || fill === 'transparent' || effectiveFontSize < 4) continue;

      let backgroundCandidates = [[255, 255, 255]]; let unknownBackground = false;
      for (let index = styles.length - 1; index >= 0; index--) {
        const candidate = styles[index]?.backgroundColor ?? 'transparent';
        const parts = candidate.match(/[\d.]+/g)?.map(Number) ?? [];
        if (parts.length >= 3) {
          let alpha = parts.length >= 4 ? parts[3] ?? 0 : candidate === 'transparent' ? 0 : 1;
          if (candidate.includes('/') && candidate.includes('%')) alpha /= 100;
          backgroundCandidates = backgroundCandidates.map(background => [0, 1, 2].map(channel =>
            (parts[channel] ?? 0) * alpha + (background[channel] ?? 255) * (1 - alpha)));
          if (alpha >= .99) unknownBackground = false;
        }
        const image = styles[index]?.backgroundImage ?? 'none';
        if (image !== 'none') {
          const tokens = /(?:linear|radial|conic)-gradient\(/u.test(image)
            ? image.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:white|black|transparent)\b/giu) ?? [] : [];
          const colours: Array<[number, number, number, number]> = [];
          for (const token of tokens) {
            const lower = token.toLocaleLowerCase('und');
            if (lower === 'transparent') { colours.push([0, 0, 0, 0]); continue; }
            if (lower === 'white' || lower === 'black') { colours.push(lower === 'white' ? [255, 255, 255, 1] : [0, 0, 0, 1]); continue; }
            if (lower.startsWith('#')) {
              const hex = lower.slice(1); const full = hex.length <= 4 ? [...hex].map(part => part + part).join('') : hex;
              const alpha = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
              colours.push([Number.parseInt(full.slice(0, 2), 16), Number.parseInt(full.slice(2, 4), 16),
                Number.parseInt(full.slice(4, 6), 16), alpha]);
              continue;
            }
            const rgba = lower.match(/[\d.]+/g)?.map(Number) ?? [];
            let alpha = rgba.length >= 4 ? rgba[3] ?? 0 : 1;
            if (lower.includes('/') && lower.includes('%')) alpha /= 100;
            if (rgba.length >= 3) colours.push([rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, alpha]);
          }
          if (colours.length > 0) {
            backgroundCandidates = colours.flatMap(([red, green, blue, alpha]) => backgroundCandidates.map(background =>
              [red * alpha + (background[0] ?? 255) * (1 - alpha), green * alpha + (background[1] ?? 255) * (1 - alpha),
                blue * alpha + (background[2] ?? 255) * (1 - alpha)]));
            unknownBackground = image.includes('url(') && colours.some(colour => colour[3] < .99);
          }
          else unknownBackground = true;
        }
      }
      const foreground = /^rgba?\(/.test(fill) ? fill : color;
      const foregroundParts = foreground.match(/[\d.]+/g)?.map(Number) ?? [];
      if (foregroundParts.length < 3) continue;
      let foregroundAlpha = foregroundParts.length >= 4 ? foregroundParts[3] ?? 0 : 1;
      if (foreground.includes('/') && foreground.includes('%')) foregroundAlpha /= 100;
      const weights = [.2126, .7152, .0722];
      const lowContrast = !unknownBackground && backgroundCandidates.some(backgroundRgb => {
        const paintedForeground = [0, 1, 2].map(channel => (foregroundParts[channel] ?? 0) * foregroundAlpha
          + (backgroundRgb[channel] ?? 255) * (1 - foregroundAlpha));
        const foregroundLuminance = paintedForeground.map(channel => channel / 255)
          .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
          .reduce((sum, channel, index) => sum + channel * (weights[index] ?? 0), 0);
        const backgroundLuminance = backgroundRgb.map(channel => channel / 255)
          .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
          .reduce((sum, channel, index) => sum + channel * (weights[index] ?? 0), 0);
        return (Math.max(foregroundLuminance, backgroundLuminance) + .05)
          / (Math.min(foregroundLuminance, backgroundLuminance) + .05) < 1.2;
      });
      if (lowContrast) continue;

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
          const normalCover = stack.slice(0, parentIndex).some(candidate => {
            if (candidate.contains(parent)) return false;
            const style = getComputedStyle(candidate); let alpha = 1;
            for (let owner: Element | null = candidate; owner; owner = owner.parentElement) {
              const amount = Number(getComputedStyle(owner).opacity); alpha *= Number.isFinite(amount) ? amount : 1;
            }
            const colour = style.backgroundColor; const parts = colour.match(/[\d.]+/g)?.map(Number) ?? [];
            const colourAlpha = parts.length >= 4 ? parts[3] ?? 0 : colour === 'transparent' ? 0 : 1;
            return alpha >= .05 && (colourAlpha >= .05 || style.backgroundImage !== 'none'
              || ['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE'].includes(candidate.tagName));
          });
          if (normalCover) return false;
          const pointerlessCover = pointerlessOverlays.some(candidate => {
            if (candidate.element.contains(parent)) return false;
            if (candidate.box.left > x || candidate.box.right < x || candidate.box.top > y || candidate.box.bottom < y) return false;
            if (Number.isFinite(candidate.effectiveZ) && Number.isFinite(targetZ)) {
              if (candidate.effectiveZ !== targetZ) return candidate.effectiveZ > targetZ;
            } else if (Number.isFinite(candidate.effectiveZ)) return candidate.effectiveZ > 0;
            else if (Number.isFinite(targetZ)) return targetZ <= 0;
            return Boolean(parent.compareDocumentPosition(candidate.element) & Node.DOCUMENT_POSITION_FOLLOWING);
          });
          if (pointerlessCover) return false;
          for (let owner: HTMLElement | null = parent; owner && owner !== body; owner = owner.parentElement) {
            const ownerBox = owner.getBoundingClientRect();
            const pseudoCovered = ['::before', '::after'].some(pseudo => {
              const style = getComputedStyle(owner, pseudo); const z = Number.parseInt(style.zIndex, 10);
              const horizontal = (style.left !== 'auto' && style.right !== 'auto') || Number.parseFloat(style.width) >= ownerBox.width;
              const vertical = (style.top !== 'auto' && style.bottom !== 'auto') || Number.parseFloat(style.height) >= ownerBox.height;
              const aboveText = pseudo === '::after' ? !Number.isFinite(z) || z >= 0 : Number.isFinite(z) && z > 0;
              const colour = style.backgroundColor; const parts = colour.match(/[\d.]+/g)?.map(Number) ?? [];
              const alpha = parts.length >= 4 ? parts[3] ?? 0 : colour === 'transparent' ? 0 : 1;
              return !['none', 'normal'].includes(style.content) && ['absolute', 'fixed', 'sticky'].includes(style.position)
                && aboveText && horizontal && vertical && Number(style.opacity) >= .05
                && x >= ownerBox.left && x <= ownerBox.right && y >= ownerBox.top && y <= ownerBox.bottom
                && (alpha >= .05 || style.backgroundImage !== 'none');
            });
            if (pseudoCovered) return false;
          }
          return true;
        });
      });
      range.detach();
      if (!textVisible) continue;
      const anchor = parent.closest<HTMLAnchorElement>('a[href]'); const record = anchor ? anchors.get(anchor) : undefined;
      const id = visibleText.length; visibleText.push({ id, value });
      if (unknownBackground) uncertain.push({ id, href: record?.href ?? null,
        minimumChangedPixels: Math.min(256, Math.max(12, [...value].filter(character => !/\s/u.test(character)).length * 4)),
        rects: rects.map(rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })) });
      if (record) record.text.push(value);
    }
    return {
      anchors: [...anchors.entries()].flatMap(([element, anchor]) => {
        if (anchor.text.length > 0) return [{ ...anchor, text: anchor.text.join(' ').slice(0, 4096) }];
        return [];
      }).slice(0, 2000),
      visibleText, uncertain, viewport: { width: innerWidth, height: innerHeight },
    };
  });
  return { anchors: rendered.anchors, body: await page.locator('body').innerText(), visibleText: rendered.visibleText, uncertain: rendered.uncertain, viewport: rendered.viewport, url: page.url() };
}

export async function renderedState(page: Page) {
  const raw = await inspectRenderedState(page);
  if (raw.uncertain.length === 0) return finalizeSearchRenderedState(raw, Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0));
  const capture = await captureFrozenSearchText(page);
  return finalizeSearchRenderedState(raw, capture.visibleText, capture.hiddenText, capture.confirmedVisibleText);
}
