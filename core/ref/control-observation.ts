import { createHash } from 'node:crypto';
import type { Browser, Page } from 'playwright';
import { canonicalJson } from './board-artifacts.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';
import { createPublicNetworkProxy } from './public-network.ts';
import { disableUnproxiedRealtimeTransports } from './browser-security.ts';
import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const REFERENCE_CONTROL_OBSERVATION_SCHEMA = 'reference-control-observation-v1';

/** Observe only: this never clicks, dismisses, submits, or grants action authority. */
export async function captureReferenceControlObservation(browser: Browser, root: string, input: { url: string; selector: string }, writer: ProjectWriteAdapter) {
  requireProjectWriteAdapter(root, writer);
  const url = publicDiscoveryUrl(input.url);
  if (typeof input.selector !== 'string' || !input.selector.trim() || input.selector.length > 512) throw new Error('REFERENCE_CONTROL_SELECTOR_INVALID');
  const proxy = await createPublicNetworkProxy();
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false,
      proxy: { server: proxy.server } });
    await disableUnproxiedRealtimeTransports(context);
    await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    const page: Page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    if (page.url() !== url) throw new Error('REFERENCE_CONTROL_DOCUMENT_CHANGED: inspect the redirected URL separately');
    const target = page.locator(input.selector);
    if (await target.count() !== 1 || !await target.isVisible()) throw new Error('REFERENCE_CONTROL_TARGET_INVALID');
    const text = (await target.innerText()).trim();
    if (!text) throw new Error('REFERENCE_CONTROL_TEXT_REQUIRED');
    const documentSha256 = hash(await page.content());
    const body = { schema: REFERENCE_CONTROL_OBSERVATION_SCHEMA, url, capturedAt: new Date().toISOString(), documentSha256,
      controls: [{ url, selector: input.selector, text }] };
    const signature = signNativeObservation(root, REFERENCE_CONTROL_OBSERVATION_SCHEMA, hash(canonicalJson(body)));
    const bytes = `${canonicalJson({ ...body, signature })}\n`;
    const sha256 = hash(bytes);
    const path = `.omd/discovery/domain/controls/sha256-${sha256}.json`;
    writer.writeContentAddressed(path, bytes);
    return { receipt: { path, sha256, schema: REFERENCE_CONTROL_OBSERVATION_SCHEMA }, url, selector: input.selector,
      documentSha256, field: '/controls/0/text', itemId: input.selector, text };
  } finally {
    try { await context?.close(); } finally { await proxy.close(); }
  }
}
