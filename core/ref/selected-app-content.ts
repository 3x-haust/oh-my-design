import type { Page } from 'playwright';

export async function isSelectedAppContent(page: Page, layerSelector: string, selected: readonly string[]): Promise<boolean> {
  if (!selected.length) return false;
  return page.evaluate(({ layerSelector, selected }) => {
    const root = document.querySelector(layerSelector);
    if (!root || !(/^(?:app|root|__next|application)$/i.test(root.id) || root.getAttribute('role') === 'application')) return false;
    return selected.some(selector => {
      try {
        if (/^(?:html|body|main|header|nav|footer|:root|h[1-6])$/i.test(selector.trim())) return false;
        const targets = document.querySelectorAll(selector);
        if (targets.length !== 1 || targets[0] === root || !root.contains(targets[0]!)) return false;
        const target = targets[0]!, box = target.getBoundingClientRect();
        const purpose = `${target.id} ${target.className} ${target.textContent ?? ''}`.replace(/\s+/g, ' ').trim();
        if (/recovery|maintenance|error|retry|try again|back home|help center|support|복구|점검|오류|장애|다시 시도|잠시 후|홈으로 돌아|고객센터|이용해 주세요/i.test(purpose)) return false;
        if (box.width <= 0 || box.height <= 0 || target.matches('html,body,main,header,nav,footer,h1,h2,h3,h4,h5,h6,a,button,[role="button"]')
          || target.closest('nav,header,footer,[role="dialog"],[role="alertdialog"],dialog[open]')) return false;
        for (let current: Element | null = target; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.2) return false;
        }
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return top === target || (top !== null && target.contains(top));
      } catch { return false; }
    });
  }, { layerSelector, selected: [...selected] });
}
