import type { Page } from 'playwright';
import type { DocumentObserver } from './document-observation.ts';
import { inspectRenderedState } from './search-observation.ts';
import { finalizeSearchRenderedState, HIDE_SEARCH_TEXT_STYLE } from './search-pixel-contrast.ts';

class DiscoveryObservationError extends Error {
  constructor() { super('Discovery rendering changed during both bounded captures; no consistent screenshot/link evidence was retained.'); }
}

export async function captureDiscoveryObservation(page: Page, documents: DocumentObserver) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const beforeDocument = await documents.current();
    const before = await inspectRenderedState(page);
    const bytes = await page.screenshot({ timeout: 10000, animations: 'disabled' });
    const withoutText = before.uncertain.length > 0
      ? await page.screenshot({ timeout: 10000, animations: 'disabled', style: HIDE_SEARCH_TEXT_STYLE }) : bytes;
    const after = await inspectRenderedState(page);
    const afterDocument = await documents.current();
    if (beforeDocument.identity === afterDocument.identity && beforeDocument.httpStatus === afterDocument.httpStatus
      && JSON.stringify(before) === JSON.stringify(after)) {
      const observed = finalizeSearchRenderedState(before, bytes, withoutText);
      return { bytes, links: [...new Set(observed.anchors.map(anchor => anchor.href))],
        results: observed.anchors.map(anchor => ({ url: anchor.href, text: anchor.text.replace(/\s+/g, ' ').trim() }))
          .filter((result, index, all) => result.text && all.findIndex(candidate => candidate.url === result.url) === index),
        body: observed.body, visibleText: observed.visibleText, url: observed.url,
        httpStatus: afterDocument.httpStatus };
    }
  }
  throw new DiscoveryObservationError();
}

export const captureSearchObservation = captureDiscoveryObservation;
