import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { serveProjectEntry } from './serve.ts';
import { assertViewState, inspectionDeadline, pageRoute, performViewActions, type ViewState } from './stateful.ts';
export class ZoomUnsupportedError extends Error { override name = 'ZoomUnsupportedError'; }
/** Chrome resets automatic per-tab zoom on navigation; reapply it before the next action/capture. */
export async function ensureMeasuredLayoutZoom(page: Page, viewport: { width: number; height: number }): Promise<void> {
  const context = page.context(), origin = new URL(page.url()).origin;
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(error => { throw new ZoomUnsupportedError(`ZOOM_UNSUPPORTED: extension worker unavailable: ${String(error)}`); });
  const current = await worker.evaluate(async origin => {
    const api = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number; url?: string }[]>; getZoom(id: number): Promise<number> } } }).chrome;
    const tab = (await api.tabs.query({})).find(t => t.url?.startsWith(origin));
    if (!tab) throw new Error('capture tab missing');
    return api.tabs.getZoom(tab.id);
  }, origin);
  if (current !== 1 && current !== 2) throw new ZoomUnsupportedError('ZOOM_UNSUPPORTED: unexpected browser zoom setting');
  const before = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
  if (current !== 2) {
    await page.evaluate(() => {
      const host = globalThis as unknown as { __omdLayoutZoomSignal: Promise<void> };
      host.__omdLayoutZoomSignal = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('zoom resize signal missing')), 5000);
        window.addEventListener('resize', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    });
    const changed = page.evaluate(() => (globalThis as unknown as { __omdLayoutZoomSignal: Promise<void> }).__omdLayoutZoomSignal)
      .then(() => ({ ok: true as const }), error => ({ ok: false as const, error }));
    try {
      await worker.evaluate(async origin => {
        const api = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number; url?: string }[]>; setZoomSettings(id: number, s: object): Promise<void>; setZoom(id: number, zoom: number): Promise<void>; getZoom(id: number): Promise<number> } } }).chrome;
        const tab = (await api.tabs.query({})).find(t => t.url?.startsWith(origin));
        if (!tab) throw new Error('capture tab missing');
        await api.tabs.setZoomSettings(tab.id, { mode: 'automatic', scope: 'per-tab' });
        await api.tabs.setZoom(tab.id, 2);
        if (await api.tabs.getZoom(tab.id) !== 2) throw new Error('browser zoom setting did not apply');
      }, origin);
      const signal = await changed;
      if (!signal.ok) throw signal.error;
    } catch (error) { await changed; throw new ZoomUnsupportedError(`ZOOM_UNSUPPORTED: ${String(error)}`); }
  }
  const observed = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, pinch: visualViewport?.scale ?? 1, narrow: matchMedia('(max-width: 700px)').matches }));
  if (Math.abs(observed.width * 2 - viewport.width) > 2 || Math.abs(observed.height * 2 - viewport.height) > 2 || observed.dpr < 2
    || current === 1 && (Math.abs(observed.width * 2 - before.width) > 2 || Math.abs(observed.dpr / before.dpr - 2) > 0.01)
    || observed.pinch !== 1 || observed.narrow !== (observed.width <= 700)) throw new ZoomUnsupportedError(`ZOOM_UNSUPPORTED: browser did not demonstrate layout reflow: ${JSON.stringify(observed)}`);
}
/** A disposable extension owns automatic per-tab browser zoom. DPR, pinch and CSS zoom are not substitutes. */
export async function withZoomedLocalView<T>(root: string, entry: string, viewport: { width: number; height: number }, state: ViewState | undefined, inspect: (page: Page) => Promise<T>): Promise<T> {
  const profile = mkdtempSync(join(tmpdir(), 'omd-measure-zoom-'));
  try {
    return await inspectionDeadline(async own => {
      const extension = fileURLToPath(new URL('./zoom-extension', import.meta.url));
      const context = await own(chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport, serviceWorkers: 'allow', acceptDownloads: false, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] }));
      const served = await own(serveProjectEntry(root, entry, { spa: state !== undefined }));
      const origin = new URL(served.url).origin, blocked: string[] = [];
      await context.addInitScript(() => { Object.defineProperty(navigator, 'serviceWorker', { value: undefined }); });
      await context.route('**/*', route => { if (!['GET', 'HEAD'].includes(route.request().method()) || new URL(route.request().url()).origin !== origin) { blocked.push(route.request().url()); return route.abort(); } return route.continue(); });
      await context.routeWebSocket('**/*', socket => socket.close());
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(served.url, { waitUntil: 'load' });
      await ensureMeasuredLayoutZoom(page, viewport);
      if (state) {
        await page.goto(`${origin}${state.startRoute}`, { waitUntil: 'load' });
        await ensureMeasuredLayoutZoom(page, viewport);
        for (const action of state.actions) { await performViewActions(page, [action]); await ensureMeasuredLayoutZoom(page, viewport); }
        await assertViewState(page, state.assertions);
        if (pageRoute(page) !== state.route) throw new Error('zoom state route mismatch');
      }
      const result = await inspect(page);
      if (state) await assertViewState(page, state.assertions);
      if (blocked.length) throw new Error('zoom capture attempted external or write request');
      served.assertSourceCurrent(); return result;
    }, 30000);
  } finally { rmSync(profile, { recursive: true, force: true }); }
}
