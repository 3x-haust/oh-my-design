import type { Browser } from 'playwright';
import { captureReferenceNavigation } from '../../core/ref/navigation-capture.ts';
import type { designAdmissionFixture } from './design-admission.ts';
import { discoveryBrowser, directoryHtml, PUBLIC_DIRECTORY } from './discovery-capture.ts';

export async function directResearch(browser: Browser, fixture: ReturnType<typeof designAdmissionFixture>, destination = fixture.domain.source) {
  const domain = discoveryBrowser(browser, { url: PUBLIC_DIRECTORY, html: directoryHtml(destination, fixture.domainTwo.source, fixture.domainThree.source) });
  const galleryUrl = 'https://www.pinterest.com/';
  const design = discoveryBrowser(browser, { url: galleryUrl, html: `<h1>Free visual gallery</h1>${directoryHtml(fixture.gallery.source)}` });
  const domainRoot = await captureReferenceNavigation(domain.browser, PUBLIC_DIRECTORY, 'domain', fixture.writer, 'public-directory');
  const designRoot = await captureReferenceNavigation(design.browser, galleryUrl, 'design', fixture.writer, 'free-gallery');
  return { ...fixture.research, schema: 'reference-research-v6',
    domainReference: { ...fixture.research.domainReference, queries: [], searches: [],
      discoveryRoots: [{ ...domainRoot, reason: 'Inspect the public task directory.' }] },
    designReference: { ...fixture.research.designReference, queries: [], searches: [],
      discoveryRoots: [{ ...designRoot, reason: 'Inspect the free gallery list.' }] } };
}
