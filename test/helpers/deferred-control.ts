import type { Locator, Page } from 'playwright';

/** Release hydration only after the observer subscribes to control visibility. */
export function releaseControlOnVisibleWait(page: Page, selector: string): void {
  const locator = page.locator.bind(page);
  page.locator = (...args: Parameters<Page['locator']>) => {
    const target = locator(...args);
    if (args[0] !== selector) return target;
    return new Proxy(target, {
      get(target, property) {
        if (property !== 'waitFor') return Reflect.get(target, property, target);
        return async (...options: Parameters<Locator['waitFor']>) => {
          const visible = target.waitFor(...options);
          await page.evaluate(() => document.dispatchEvent(new Event('control-ready')));
          await visible;
        };
      },
    });
  };
}
