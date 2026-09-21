import type { Browser, BrowserContext, Page } from 'playwright';
import { detectBlockReason } from '../render/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import { canonicalJson } from './board-artifacts.ts';
import { designDiscoveryDirectoryProvider } from './design-discovery-sources.ts';
import { captureDiscoveryObservation } from './reference-capture-observation.ts';
import { observeDocumentResponses, type DocumentObserver } from './document-observation.ts';
import { createPublicNetworkProxy, publicIpAddress } from './public-network.ts';
import { disableUnproxiedRealtimeTransports } from './browser-security.ts';
import { searchChallengeReason } from './search-execution.ts';
import { DISCOVERY_LIMITATIONS, ReferenceDiscoveryError, directDiscoveryEntry, discoveryDigest, discoveryLane, publicDiscoveryUrl, validateDirectDiscoveryLinks,
  type DirectDiscoveryEntry, type DirectDiscoveryReceipt, type DiscoveryCaptureRecord, type DiscoveryNavigationReceipt } from './discovery-record.ts';

export class ReferenceNavigationError extends ReferenceDiscoveryError {
  override readonly name = 'ReferenceNavigationError';
}
async function loginOccludes(page: Page): Promise<boolean> {
  return page.evaluate(() => Array.from(document.querySelectorAll('input[type="password"]')).some(input => {
    const box = input.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || getComputedStyle(input).visibility === 'hidden') return false;
    const form = input.closest('form, [role="dialog"], [aria-modal="true"]');
    const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return form !== null && centre !== null && form.contains(centre);
  }));
}
async function closeContext(context: BrowserContext): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([context.close(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ReferenceNavigationError('context cleanup timed out after 2000ms')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter): Promise<DiscoveryNavigationReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter, entry: DirectDiscoveryEntry): Promise<DirectDiscoveryReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter, entry: unknown): Promise<DiscoveryNavigationReceipt | DirectDiscoveryReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter, requestedEntry?: unknown): Promise<DiscoveryNavigationReceipt | DirectDiscoveryReceipt> {
  const lane = discoveryLane(requestedLane);
  const url = publicDiscoveryUrl(source);
  const entry = requestedEntry === undefined ? undefined : directDiscoveryEntry(requestedEntry, lane);
  if (entry === 'free-gallery' && designDiscoveryDirectoryProvider(url) === null) throw new ReferenceNavigationError('free-gallery entry requires a supported public list URL');
  const networkProxy = await createPublicNetworkProxy();
  let context: BrowserContext | undefined;
  let documents: DocumentObserver | undefined;
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false,
      proxy: { server: networkProxy.server } });
    await disableUnproxiedRealtimeTransports(context);
    await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    context.setDefaultTimeout(10000);
    const page = await context.newPage();
    documents = await observeDocumentResponses(page);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!response?.ok()) throw new ReferenceNavigationError('a successful native HTTP capture is required');
    const server = await response.serverAddr();
    if (server !== null && !publicIpAddress(server.ipAddress)) throw new ReferenceNavigationError('native HTTP capture reached a non-public network');
    if (lane === 'design' && await loginOccludes(page)) throw new ReferenceNavigationError('login form obscures the public discovery list');
    const observation = await captureDiscoveryObservation(page, documents);
    const status = observation.httpStatus;
    if (status < 200 || status >= 300) throw new ReferenceNavigationError('a successful native HTTP capture is required');
    const finalUrl = publicDiscoveryUrl(observation.url);
    const links = observation.links.filter(link => {
      try { publicDiscoveryUrl(link); return true; }
      catch (error) { if (error instanceof ReferenceDiscoveryError) return false; throw error; }
    });
    const blocked = searchChallengeReason(observation.body)
      ?? detectBlockReason(await page.title(), observation.body.trim().length, status, links.length > 0);
    if (blocked) throw new ReferenceNavigationError(blocked);
    if (lane === 'design' && await loginOccludes(page)) throw new ReferenceNavigationError('login form obscures the public discovery list');
    if (entry !== undefined) validateDirectDiscoveryLinks(entry, { url, finalUrl, links });
    const directory = `.omd/discovery/${lane}/${entry === undefined ? 'navigation' : 'entries'}`;
    const imageSha256 = discoveryDigest(observation.bytes);
    const imagePath = `${directory}/${imageSha256}.png`;
    const common = {
      source: url, researchLane: lane, kind: 'page', capturedAt: new Date().toISOString(), imagePath,
      acquisition: { requestedUrl: url, finalUrl, httpStatus: status, links, imageSha256 },
      limitations: DISCOVERY_LIMITATIONS,
    } as const;
    const record: DiscoveryCaptureRecord = entry === undefined
      ? { schema: 'reference-navigation-capture-v2', ...common }
      : (() => {
        const unsigned = { schema: 'reference-discovery-entry-v3' as const, method: 'direct-public' as const, entry,
          ...common, observedText: observation.visibleText, linkLabels: observation.results };
        return { ...unsigned, signature: signNativeObservation(writer.projectRoot, unsigned.schema,
          discoveryDigest(canonicalJson(unsigned))) };
      })();
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    const sha256 = discoveryDigest(bytes);
    const capture = { path: `${directory}/${sha256}.json`, sha256 };
    writer.writeContentAddressed(imagePath, observation.bytes);
    writer.writeContentAddressed(capture.path, bytes);
    const receipt = { url, evidence: { path: imagePath, sha256: imageSha256 }, capture };
    return entry === undefined ? receipt : { method: 'direct-public', entry, ...receipt };
  } finally {
    try { await documents?.close(); }
    finally {
      try { if (context !== undefined) await closeContext(context); }
      finally { await networkProxy.close(); }
    }
  }
}
