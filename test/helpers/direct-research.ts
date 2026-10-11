import type { Browser } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../../core/ref/board-artifacts.ts';
import { signNativeObservation } from '../../core/runtime/self-signed-activation.ts';
import { testPng } from './search-execution.ts';
import { captureReferenceNavigation } from '../../core/ref/navigation-capture.ts';
import type { designAdmissionFixture } from './design-admission.ts';
import { discoveryBrowser, directoryHtml, PUBLIC_DIRECTORY } from './discovery-capture.ts';
import { directRootAt } from './market-reference.ts';

export function historicalDomainNavigationAt(root: string, url: string, links: readonly string[]) {
  const directory = '.omd/discovery/domain/navigation';
  mkdirSync(join(root, directory), { recursive: true });
  const image = testPng(1280, 900, Number.parseInt(sha256(url).slice(0, 2), 16));
  const imageSha256 = sha256(image);
  const evidence = { path: `${directory}/${imageSha256}.png`, sha256: imageSha256 };
  writeFileSync(join(root, evidence.path), image);
  const unsigned = { schema: 'reference-navigation-capture-v4', source: url, researchLane: 'domain', kind: 'page',
    capturedAt: new Date().toISOString(), imagePath: evidence.path,
    acquisition: { requestedUrl: url, finalUrl: url, httpStatus: 200, links, imageSha256 },
    limitations: 'native-public-get; stable-rendered-viewport-links; no-authentication; no-interaction-probes; not-provider-attested' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const capture = { path: `${directory}/${sha256(bytes)}.json`, sha256: sha256(bytes) };
  writeFileSync(join(root, capture.path), bytes);
  return { url, evidence, capture };
}

export async function directResearch(browser: Browser, fixture: ReturnType<typeof designAdmissionFixture>, destination = fixture.domain.source) {
  const galleryUrl = 'https://www.pinterest.com/';
  const design = discoveryBrowser(browser, { url: galleryUrl, html: `<h1>Free visual gallery</h1>${directoryHtml(fixture.gallery.source)}` });
  const domainRoot = directRootAt(fixture.root, 'domain', PUBLIC_DIRECTORY,
    [destination, fixture.domainTwo.source, fixture.domainThree.source]);
  const designRoot = await captureReferenceNavigation(design.browser, galleryUrl, 'design', fixture.writer, 'free-gallery');
  return { ...fixture.research, schema: 'reference-research-v6',
    domainReference: { ...fixture.research.domainReference, queries: [], searches: [],
      discoveryRoots: [domainRoot] },
    designReference: { ...fixture.research.designReference, queries: [], searches: [],
      discoveryRoots: [{ ...designRoot, reason: 'Inspect the free gallery list.' }] } };
}
