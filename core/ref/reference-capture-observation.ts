import type { Page } from 'playwright';
import type { DocumentObserver } from './document-observation.ts';
import { inspectRenderedState } from './search-observation.ts';
import { captureFrozenSearchText } from './search-frozen-capture.ts';
import { finalizeSearchRenderedState } from './search-pixel-contrast.ts';
import { classifyKoreanServiceText } from './market-reference.ts';

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
        body: observed.body, visibleText: observed.visibleText, taskText: observed.taskText, url: observed.url,
        httpStatus: afterDocument.httpStatus };
    }
  }
  throw new DiscoveryObservationError();
}

export async function captureDomainObservation(page: Page, documents: DocumentObserver) {
  const read = async () => {
    const beforeDocument = await documents.current();
    const before = await inspectRenderedState(page, 'discovery');
    const after = await inspectRenderedState(page, 'discovery');
    const afterDocument = await documents.current();
    if (beforeDocument.identity !== afterDocument.identity || beforeDocument.httpStatus !== afterDocument.httpStatus
      || JSON.stringify(before) !== JSON.stringify(after)) return null;
    const uncertainLinks = new Set(before.uncertain.flatMap(item => item.href === null ? [] : [item.href]));
    const contentAnchors = before.anchors.filter(anchor => !anchor.chrome && !uncertainLinks.has(anchor.href))
      .sort((left, right) => Number(left.navigation) - Number(right.navigation));
    const uncertain = new Set(before.uncertain.map(item => item.id));
    const visible = before.visibleText.filter(item => !uncertain.has(item.id));
    return { links: [...new Set(contentAnchors.map(anchor => anchor.href))],
      results: contentAnchors.map(anchor => ({ url: anchor.href, text: anchor.text.replace(/\s+/g, ' ').trim() }))
        .filter((result, index, all) => result.text && all.findIndex(candidate => candidate.url === result.url) === index),
      body: before.body, visibleText: visible.map(item => item.value).join(' ').slice(0, 16384),
      taskText: visible.filter(item => item.taskClaim).map(item => item.value).join(' ').slice(0, 16384), url: before.url,
      httpStatus: afterDocument.httpStatus };
  };
  let observed = await read();
  if (observed !== null && classifyKoreanServiceText(observed.visibleText) === 'undetermined') {
    await page.evaluate(() => new Promise<void>(resolve => {
      const done = () => { observer.disconnect(); clearTimeout(timer); resolve(); };
      const observer = new MutationObserver(() => {
        const letters = document.body?.innerText.match(/\p{L}/gu)?.length ?? 0;
        if (letters >= 8) done();
      });
      const timer = setTimeout(done, 2000);
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }));
    observed = await read();
  }
  if (observed === null) throw new DiscoveryObservationError();
  return observed;
}

export const captureSearchObservation = (page: Page, documents: DocumentObserver) =>
  captureDiscoveryObservation(page, documents, 'search');
