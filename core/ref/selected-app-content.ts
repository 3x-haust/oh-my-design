import { browserCallback } from './browser-evaluation.ts';
import type { Page } from 'playwright';
import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';

export async function isSelectedAppContent(page: Page, layerSelector: string, selected: readonly string[],
  contentJudgment?: (selector: string, documentUrl: string) => Promise<ReferenceJudgmentBinding | undefined>): Promise<boolean> {
  if (!selected.length) return false;
  const binding = await contentJudgment?.(layerSelector, page.url());
  if (binding && binding.subjectId !== `${page.url()}#${layerSelector}`) return false;
  if ((await referenceDecision('surface-content', binding)).decision !== 'task-content') return false;
  return page.evaluate(browserCallback(({ layerSelector, selected }: { layerSelector: string; selected: string[] }) => {
    const root = document.querySelector(layerSelector);
    if (!root || !(/^(?:app|root|__next|application)$/i.test(root.id) || root.getAttribute('role') === 'application')) return false;
    return selected.some(selector => {
      try {
        if (/^(?:html|body|main|header|nav|footer|:root|h[1-6])$/i.test(selector.trim())) return false;
        const targets = document.querySelectorAll(selector);
        if (targets.length !== 1 || targets[0] === root || !root.contains(targets[0]!)) return false;
        const target = targets[0]!, box = target.getBoundingClientRect();
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
  }), { layerSelector, selected: [...selected] });
}
