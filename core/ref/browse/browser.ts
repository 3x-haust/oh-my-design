import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright';
import { createPublicNetworkProxy } from '../public-network.ts';
import { disableUnproxiedRealtimeTransports } from '../browser-security.ts';
import { observeDocumentResponses, type DocumentObserver } from '../document-observation.ts';
import { authorizeBrowseDestination, browseUrl, cdpEndpoint } from './safety.ts';
import { browseFail, type Binding } from './contract.ts';
import { canonicalJson, sha256 } from './json.ts';

/** Only transport and clock may be injected by API tests. No CLI/env localhost bypass exists. */
export type BrowseBrowserDependencies = Readonly<{ transport?: (route: Route) => Promise<void>; profilePath?: string; clock?: () => number }>;
export type BrowseBrowser = Readonly<{ context: BrowserContext; page: Page; document: DocumentObserver;
  violations: string[]; retryAfter: ReadonlyMap<string, number>; media: ReadonlyMap<string, Promise<{ bytes: Buffer; mime: string } | null>>; close(): Promise<void> }>;
async function cdpWebsocket(endpoint: string): Promise<string> {
  const url = new URL(cdpEndpoint(endpoint)); if (url.protocol === 'ws:') return url.href;
  const response = await fetch(new URL('/json/version', url), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) browseFail('BROWSE_CDP_CAPABILITY', 'Chrome debugging endpoint unavailable');
  const value: unknown = await response.json();
  const ws = cdpEndpoint(typeof value === 'object' && value !== null && 'webSocketDebuggerUrl' in value ? String(value.webSocketDebuggerUrl) : '');
  const target = new URL(ws);
  if (target.hostname !== url.hostname || target.port !== url.port || target.protocol !== 'ws:') browseFail('BROWSE_CDP_CAPABILITY', 'Chrome websocket left approved loopback endpoint');
  return ws;
}
export async function openBrowseBrowser(binding: Binding, dependencies: BrowseBrowserDependencies = {}): Promise<BrowseBrowser> {
  const { start, consent } = binding;
  if (start.mode !== 'headless' && (!start.userOptIn || !consent || consent.mode !== start.mode
    || consent.sourceContractSha256 !== binding.sourceContractSha256 || Date.parse(consent.expiresAt) <= Date.now()
    || consent.headed !== start.headed || consent.allowPricing !== start.allowPricing
    || canonicalJson(consent.allowAuthOrigins) !== canonicalJson(start.allowAuthOrigins)
    || consent.cdpEndpointSha256 !== (start.cdpUrl ? sha256(start.cdpUrl) : null))) browseFail('BROWSE_CONSENT_REQUIRED', 'missing or expired request-bound consent', 2);
  const proxy = await createPublicNetworkProxy();
  const options = { viewport: start.viewport, deviceScaleFactor: 1, serviceWorkers: 'block' as const,
    acceptDownloads: false, proxy: { server: proxy.server, bypass: '<-loopback>' } };
  let browser: Browser | undefined, context: BrowserContext | undefined;
  try {
    if (start.mode === 'profile') {
      // Only this opt-in reference launcher can be headed. Render verification remains headless.
      context = await chromium.launchPersistentContext(dependencies.profilePath ?? join(homedir(), '.omd/browser-profile'), {
        ...options, headless: !start.headed, args: ['--proxy-bypass-list=<-loopback>'] });
    } else {
      browser = start.mode === 'cdp' ? await chromium.connectOverCDP(await cdpWebsocket(start.cdpUrl!))
        : await chromium.launch({ headless: true, args: ['--proxy-bypass-list=<-loopback>'] });
      const original = start.mode === 'cdp' ? browser.contexts()[0] : undefined;
      context = await browser.newContext(options);
      if (original && start.allowAuthOrigins.length) {
        // Cookie import is in memory, origin-scoped; no tab enumeration or storage export.
        const cookies = await original.cookies([...start.allowAuthOrigins]);
        await context.addCookies(cookies);
      }
    }
    await disableUnproxiedRealtimeTransports(context);
    const violations: string[] = [];
    await context.route('**/*', async route => {
      const request = route.request();
      try {
        browseUrl(request.url());
        if (!['GET', 'HEAD'].includes(request.method())) browseFail('BROWSE_METHOD', 'only GET/HEAD allowed; manual credential submission is not recorded');
        authorizeBrowseDestination(request.url(), start);
      } catch (error) { violations.push(error instanceof Error ? error.message.split(':')[0]! : 'BROWSE_REQUEST'); await route.abort('blockedbyclient'); return; }
      if (dependencies.transport) await dependencies.transport(route); else await route.continue();
    });
    await context.routeWebSocket('**/*', socket => { violations.push('BROWSE_WEBSOCKET'); socket.close(); });
    // Close only startup tabs inside the owned context, never the user's original CDP context.
    for (const old of context.pages()) await old.close();
    const page = await context.newPage();
    const media = new Map<string, Promise<{ bytes: Buffer; mime: string } | null>>(), retryAfter = new Map<string, number>();
    page.on('response', response => {
      if ([429, 503].includes(response.status())) {
        const value = response.headers()['retry-after'], now = dependencies.clock?.() ?? Date.now();
        const until = value && /^\d+$/.test(value) ? now + Number(value) * 1000 : value ? Date.parse(value) : now;
        if (Number.isFinite(until) && until > now) retryAfter.set(new URL(response.url()).origin, until);
      }
      if (response.request().resourceType() !== 'image') return;
      media.set(response.url(), (async () => {
        if (!response.ok() || Number(response.headers()['content-length'] ?? 0) > 50 * 1024 * 1024) return null;
        const bytes = await response.body();
        return bytes.length <= 50 * 1024 * 1024 ? { bytes, mime: response.headers()['content-type']?.split(';')[0] ?? 'application/octet-stream' } : null;
      })().catch(() => { violations.push('BROWSE_MEDIA_UNAVAILABLE'); return null; }));
    });
    page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(15_000);
    page.on('dialog', dialog => { violations.push('BROWSE_DIALOG'); void dialog.dismiss(); });
    page.on('download', download => { violations.push('BROWSE_DOWNLOAD'); void download.cancel(); });
    page.on('filechooser', () => { violations.push('BROWSE_FILE_CHOOSER'); });
    context.on('page', popup => { if (popup !== page) { violations.push('BROWSE_POPUP_EXCLUDED'); void popup.close(); } });
    const document = await observeDocumentResponses(page);
    let closed = false;
    return { context, page, document, violations, media, retryAfter, async close() {
      if (closed) return; closed = true;
      try { await document.close(); } finally { try { await context!.close(); } finally { try { await browser?.close(); } finally { await proxy.close(); } } }
    } };
  } catch (error) {
    try { await context?.close(); } finally { try { await browser?.close(); } finally { await proxy.close(); } }
    throw error;
  }
}
