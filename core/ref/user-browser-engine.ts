import { connectUserBrowser } from '../browser/driver.ts';
import type { UserBrowserDriver, UserBrowserSession } from '../browser/contracts.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';
import { browserExpression } from './browser-evaluation.ts';
import { assertPublicNetworkUrl, type PublicHostLookup } from './public-network.ts';
import type { AcquisitionPage } from './acquisition-engine.ts';

export async function openUserBrowserPage(options: Readonly<{
  driver?: UserBrowserDriver; lookup?: PublicHostLookup; name?: string; signal?: AbortSignal;
}> = {}): Promise<AcquisitionPage> {
  const session: UserBrowserSession = await connectUserBrowser(options.name ?? 'OMD reference acquisition', options.driver);
  let stopped = false;
  const live = () => { if (stopped || options.signal?.aborted) throw new Error('OMD Browser session is closed'); };
  const close = async () => {
    if (stopped) return;
    stopped = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([session.stop(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('OMD Browser session cleanup timed out')), 2000);
      })]);
    } finally { clearTimeout(timer); }
  };
  return {
    engine: 'user-browser',
    async resize(width, height) { live(); await session.resize(width, height); },
    async navigate(url) {
      live();
      const requested = publicDiscoveryUrl(url);
      await assertPublicNetworkUrl(requested, options.lookup);
      await session.navigate(requested, { waitUntil: 'domcontentloaded', timeoutMs: 20_000 });
      const reply = await session.evaluate(browserExpression('() => location.href'), { awaitPromise: true, returnByValue: true });
      if (reply?.ok !== true || typeof reply.value !== 'string') throw new Error('OMD Browser URL observation failed');
      const observed = reply.value;
      const finalUrl = publicDiscoveryUrl(observed);
      await assertPublicNetworkUrl(finalUrl, options.lookup);
      return { url: finalUrl, httpStatus: null, httpStatusSource: 'unobserved' };
    },
    async evaluate<T>(expression: string): Promise<T> {
      live();
      const result = await session.evaluate(browserExpression(`() => (${expression})`), { awaitPromise: true, returnByValue: true, timeoutMs: 10_000 });
      if (!result || result.ok !== true) throw new Error('OMD Browser page evaluation failed');
      return result.value as T;
    },
    async screenshot(fullPage = false) {
      live();
      const image = await session.screenshot(fullPage ? { fullPage: true } : {});
      const bytes = Buffer.from(image.buffer);
      if (image.captureUnavailable || (image.format && image.format !== 'png') || bytes.length < 24
        || bytes.length > 32_000_000 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        || bytes.readUInt32BE(16) !== image.width || bytes.readUInt32BE(20) !== image.height
        || image.width > 8192 || image.height > 32768)
        throw new Error('OMD Browser PNG screenshot unavailable');
      return { buffer: bytes, width: image.width, height: image.height };
    },
    async requestHelp(request) { live(); return (await session.requestHelp(request)).outcome; },
    close,
  };
}

/** Keep shutdown paired with every acquisition, including failed navigation and cancellation. */
export async function withUserBrowserPage<T>(options: Parameters<typeof openUserBrowserPage>[0],
  capture: (page: AcquisitionPage) => Promise<T>): Promise<T> {
  const configured = options ?? {};
  const page = await openUserBrowserPage(configured);
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const cancel = () => rejectAbort?.(configured.signal?.reason ?? new Error('OMD Browser acquisition cancelled'));
  configured.signal?.addEventListener('abort', cancel, { once: true });
  if (configured.signal?.aborted) cancel();
  try { return await Promise.race([capture(page), aborted]); }
  finally { configured.signal?.removeEventListener('abort', cancel); await page.close(); }
}
