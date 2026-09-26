import type { Page } from 'playwright';
import type { DocumentObserver } from './document-observation.ts';
import { DirectDiscoveryLinksError } from './discovery-record.ts';

export type DiscoveryScroll = Readonly<{
  strategy: 'bounded-same-page-scroll';
  steps: number;
  initialOffset: Readonly<{ x: number; y: number }>;
  finalOffset: Readonly<{ x: number; y: number }>;
}>;

class DiscoveryScrollError extends Error {
  constructor() { super('Direct discovery scroll changed its document, URL, or bounded viewport position.'); }
}

export async function recoverDirectDiscoveryScroll<T>(input: Readonly<{
  page: Page;
  documents: DocumentObserver;
  observe: () => Promise<T>;
}>): Promise<Readonly<{ observation: T; scroll: DiscoveryScroll }> | null> {
  const { page, documents, observe } = input;
  const initialDocument = await documents.current();
  const initialUrl = page.url();
  const initialOffset = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  let previousY = initialOffset.y;
  for (let steps = 1; steps <= 3; steps++) {
    const offset = await page.evaluate(() => {
      window.scrollBy({ top: innerHeight * .75, behavior: 'instant' });
      return { x: scrollX, y: scrollY };
    });
    if (offset.x !== initialOffset.x || offset.y - initialOffset.y > steps * 675) throw new DiscoveryScrollError();
    if (offset.y <= previousY) return null;
    previousY = offset.y;
    const before = await documents.current();
    if (before.identity !== initialDocument.identity || before.httpStatus !== initialDocument.httpStatus
      || page.url() !== initialUrl) throw new DiscoveryScrollError();
    let observation: T;
    try { observation = await observe(); }
    catch (error) {
      if (!(error instanceof DirectDiscoveryLinksError)) throw error;
      continue;
    }
    const after = await documents.current();
    const finalOffset = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    if (after.identity !== initialDocument.identity || after.httpStatus !== initialDocument.httpStatus
      || page.url() !== initialUrl || offset.x !== finalOffset.x || offset.y !== finalOffset.y) throw new DiscoveryScrollError();
    return { observation, scroll: { strategy: 'bounded-same-page-scroll', steps, initialOffset, finalOffset } };
  }
  return null;
}
