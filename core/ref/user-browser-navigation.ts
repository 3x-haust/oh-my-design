import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { UserBrowserDriver } from '../browser/contracts.ts';
import { canonicalJson } from './board-artifacts.ts';
import { withUserBrowserPage } from './user-browser-engine.ts';
import { clearUserBrowserChallenge, observeUserBrowser, observeUserBrowserImages } from './user-browser-observation.ts';
import { USER_BROWSER_LIMITATIONS, USER_BROWSER_PROVENANCE } from './user-browser-provenance.ts';
import { discoveryDigest, publicDiscoveryUrl, validateDirectDiscoveryLinks, type DirectDiscoveryEntry, type DiscoveryLane } from './discovery-record.ts';
import { classifyKoreanServiceText } from './market-reference.ts';
import { designDiscoveryDirectoryProvider, designDiscoveryItemIdentity } from './design-discovery-sources.ts';
import type { PublicHostLookup } from './public-network.ts';
import type { AcquisitionDeadlineScope } from './acquisition-deadline.ts';
import type { ReferenceNavigationReceipt } from './navigation-capture.ts';

export async function captureUserBrowserNavigation(writer: ProjectWriteAdapter, source: string, lane: DiscoveryLane,
  entry?: DirectDiscoveryEntry, options: { driver?: UserBrowserDriver; lookup?: PublicHostLookup; scope?: AcquisitionDeadlineScope } = {},
): Promise<ReferenceNavigationReceipt> {
  const url = publicDiscoveryUrl(source);
  if (entry === 'free-gallery' && designDiscoveryDirectoryProvider(url) === null)
    throw new Error('free-gallery entry requires a supported public list URL');
  return withUserBrowserPage({ ...(options.driver ? { driver: options.driver } : {}),
    ...(options.lookup ? { lookup: options.lookup } : {}), ...(options.scope ? { signal: options.scope.signal } : {}) }, async page => {
    if (lane === 'design') await page.resize(1280, 900);
    await page.navigate(url);
    await clearUserBrowserChallenge(page, options.lookup, options.scope?.signal);
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await observeUserBrowser(page, options.lookup);
      if (before.loginOccludes) throw new Error('login form obscures the reference');
      if (entry !== undefined) validateDirectDiscoveryLinks(entry, { url, finalUrl: before.url, links: before.links });
      const inspectImages = lane === 'design' && designDiscoveryItemIdentity(before.url) !== null;
      const images = inspectImages ? await observeUserBrowserImages(page) : [];
      const image = lane === 'design' ? await page.screenshot() : null;
      const after = await observeUserBrowser(page, options.lookup);
      if (JSON.stringify(before) !== JSON.stringify(after)
        || inspectImages && JSON.stringify(images) !== JSON.stringify(await observeUserBrowserImages(page))) continue;
      if (image && (before.viewport.width !== 1280 || before.viewport.height !== 900
        || image.width !== 1280 || image.height !== 900)) throw new Error('OMD Browser discovery viewport differs from 1280x900');
      options.scope?.assertLive();
      const capturedAt = new Date().toISOString();
      if (lane === 'domain') {
        const schema = 'reference-domain-observation-v2' as const;
        const unsigned = { schema, source: url, researchLane: 'domain' as const,
          method: entry === undefined ? 'navigation' as const : 'direct-public' as const,
          entry: entry === undefined ? null : 'public-directory' as const, capturedAt,
          acquisition: { requestedUrl: url, finalUrl: before.url, ...USER_BROWSER_PROVENANCE, links: before.links },
          observedText: before.visibleText, taskText: before.taskText, linkLabels: before.linkLabels,
          language: classifyKoreanServiceText(before.visibleText), limitations: USER_BROWSER_LIMITATIONS };
        const record = { ...unsigned, signature: signNativeObservation(writer.projectRoot, schema, discoveryDigest(canonicalJson(unsigned))) };
        const bytes = `${JSON.stringify(record, null, 2)}\n`; const sha256 = discoveryDigest(bytes);
        const capture = { path: `.omd/discovery/domain/observations/${sha256}.json`, sha256 };
        options.scope?.assertLive(); writer.writeContentAddressed(capture.path, bytes);
        return { url, capture };
      }
      if (!image) throw new Error('OMD Browser screenshot unavailable');
      const directory = `.omd/discovery/design/${entry === undefined ? 'navigation' : 'entries'}`;
      const imageSha256 = discoveryDigest(image.buffer); const imagePath = `${directory}/${imageSha256}.png`;
      const schema = entry === undefined ? 'reference-navigation-capture-v7' as const : 'reference-discovery-entry-v6' as const;
      const unsigned = { schema, source: url, researchLane: 'design' as const, kind: 'page' as const, capturedAt, imagePath,
        acquisition: { requestedUrl: url, finalUrl: before.url, ...USER_BROWSER_PROVENANCE, links: before.links,
          imageSha256, captureMethod: 'viewport' as const, imageDimensions: { width: image.width, height: image.height } },
        limitations: USER_BROWSER_LIMITATIONS, imageCandidates: images, observedText: before.visibleText.slice(0, 4096).trim(),
        taskText: before.taskText.slice(0, 4096).trim(), linkLabels: before.linkLabels,
        ...(entry === undefined ? {} : { method: 'direct-public' as const, entry: 'free-gallery' as const, scroll: null }) };
      const record = { ...unsigned, signature: signNativeObservation(writer.projectRoot, schema, discoveryDigest(canonicalJson(unsigned))) };
      const bytes = `${JSON.stringify(record, null, 2)}\n`; const sha256 = discoveryDigest(bytes);
      const capture = { path: `${directory}/${sha256}.json`, sha256 };
      options.scope?.assertLive();
      writer.writeContentAddressed(imagePath, image.buffer);
      writer.writeContentAddressed(capture.path, bytes);
      const receipt = { url, evidence: { path: imagePath, sha256: imageSha256 }, capture };
      return entry === undefined ? receipt : { ...receipt, method: 'direct-public', entry: 'free-gallery' };
    }
    throw new Error('OMD Browser rendering changed during both bounded captures');
  });
}
