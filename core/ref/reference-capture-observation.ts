import type { Page } from 'playwright';
import type { DocumentObserver } from './document-observation.ts';
import { renderedState } from './search-observation.ts';

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
        body: before.body, visibleText: before.visibleText, url: before.url,
        httpStatus: afterDocument.httpStatus };
    }
  }
  throw new DiscoveryObservationError();
}

export const captureSearchObservation = captureDiscoveryObservation;
