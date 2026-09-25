import type { Page } from 'playwright';
import type { DocumentObserver } from './document-observation.ts';
import { inspectRenderedState } from './search-observation.ts';
import { captureFrozenSearchText } from './search-frozen-capture.ts';
import { finalizeSearchRenderedState } from './search-pixel-contrast.ts';

class DiscoveryObservationError extends Error {
  constructor() { super('Discovery rendering changed during both bounded captures; no consistent screenshot/link evidence was retained.'); }
}

export async function captureDiscoveryObservation(page: Page, documents: DocumentObserver,
  purpose: 'search' | 'discovery' = 'discovery') {
  for (let attempt = 0; attempt < 2; attempt++) {
    const beforeDocument = await documents.current();
    const before = await inspectRenderedState(page, purpose);
    const capture = before.uncertain.length > 0 ? await captureFrozenSearchText(page) : null;
    const bytes = capture?.evidence ?? await page.screenshot({ timeout: 10000, animations: 'disabled' });
    const after = await inspectRenderedState(page, purpose);
    const afterDocument = await documents.current();
    if (beforeDocument.identity === afterDocument.identity && beforeDocument.httpStatus === afterDocument.httpStatus
      && JSON.stringify(before) === JSON.stringify(after)) {
      const observed = finalizeSearchRenderedState(before, capture?.visibleText ?? Buffer.alloc(0),
        capture?.hiddenText ?? Buffer.alloc(0), capture?.confirmedVisibleText ?? Buffer.alloc(0));
      const contentAnchors = observed.anchors.filter(anchor => !anchor.chrome)
        .sort((left, right) => Number(left.navigation) - Number(right.navigation));
      return { bytes, links: [...new Set(contentAnchors.map(anchor => anchor.href))],
        results: contentAnchors.map(anchor => ({ url: anchor.href, text: anchor.text.replace(/\s+/g, ' ').trim() }))
          .filter((result, index, all) => result.text && all.findIndex(candidate => candidate.url === result.url) === index),
        body: observed.body, visibleText: observed.visibleText, url: observed.url,
        httpStatus: afterDocument.httpStatus };
    }
  }
  throw new DiscoveryObservationError();
}

export const captureSearchObservation = (page: Page, documents: DocumentObserver) =>
  captureDiscoveryObservation(page, documents, 'search');
