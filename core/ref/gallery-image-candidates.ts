import type { Page } from 'playwright';

export type GalleryImageCandidate = Readonly<{
  selector: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}>;

/** Collect actionable, plain-CSS selectors for loaded gallery screenshots. */
export async function collectGalleryImageCandidates(
  page: Page,
  limit = 8,
): Promise<readonly GalleryImageCandidate[]> {
  const boundedLimit = Math.max(0, Math.min(8, Math.floor(limit)));
  if (boundedLimit === 0) return [];
  return page.evaluate((candidateLimit) => {
    const unique = (selector: string): boolean => {
      try { return document.querySelectorAll(selector).length === 1; }
      catch { return false; }
    };
    const selectorFor = (image: HTMLImageElement): string => {
      if (image.id) {
        const selector = `#${CSS.escape(image.id)}`;
        if (unique(selector)) return selector;
      }
      for (const name of ['data-testid', 'data-test', 'data-cy', 'aria-label', 'alt'] as const) {
        const value = image.getAttribute(name);
        if (!value) continue;
        const selector = `img[${name}=${JSON.stringify(value)}]`;
        if (unique(selector)) return selector;
      }
      const segments: string[] = [];
      for (let element: Element | null = image; element && element !== document.documentElement; element = element.parentElement) {
        const tag = element.localName;
        const siblings = element.parentElement === null ? [] : Array.from(element.parentElement.children).filter(item => item.localName === tag);
        segments.unshift(`${tag}:nth-of-type(${Math.max(1, siblings.indexOf(element) + 1)})`);
        const selector = `html > ${segments.join(' > ')}`;
        if (unique(selector)) return selector;
      }
      return `html > ${segments.join(' > ')}`;
    };
    const visible = (image: HTMLImageElement): boolean => {
      if (!image.complete || image.naturalWidth < 100 || image.naturalHeight < 100) return false;
      const box = image.getBoundingClientRect();
      if (box.width < 100 || box.height < 100) return false;
      for (let element: Element | null = image; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
          || Number(style.opacity) <= 0) return false;
      }
      return true;
    };
    return Array.from(document.querySelectorAll('img')).map((element, order) => {
      const image = element as HTMLImageElement;
      if (!visible(image)) return null;
      const box = image.getBoundingClientRect();
      return { selector: selectorFor(image), width: box.width, height: box.height,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, order };
    }).filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => right.width * right.height - left.width * left.height || left.order - right.order)
      .filter((item, index, all) => all.findIndex(candidate => candidate.selector === item.selector) === index)
      .slice(0, candidateLimit)
      .map(({ order: _order, ...candidate }) => candidate);
  }, boundedLimit);
}
