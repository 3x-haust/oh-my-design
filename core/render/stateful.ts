import type { Browser, BrowserContext, Page } from 'playwright';
import { serveProjectEntry } from './serve.ts';
import { waitForDocumentFonts, browserEvaluationExpression } from './index.ts';
import { extractInPage } from '../ir/dom.ts';
import { PREPARED_MEASUREMENT_COVERAGE } from '../ref/measurement-coverage.ts';
import type { RawIr } from '../types.ts';

export type ViewAction = { kind: 'click'; selector: string } | { kind: 'fill' | 'select' | 'press'; selector: string; value: string };
export type ViewAssertion = { selector: string; state: 'visible' | 'hidden'; text?: string };
export type ViewState = { name: string; route: string; startRoute: string; actions: ViewAction[]; assertions: ViewAssertion[] };
const fail = (message: string): never => { throw new Error(`BROWSER_STATE: ${message}`); };
export function stateObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('expected an object');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).sort().join() !== keys.sort().join()) return fail(`expected keys: ${keys.join(', ')}`);
  return object;
}
export function stateText(value: unknown): string {
  return typeof value === 'string' && value.trim() && value.length <= 2000 ? value : fail('missing/oversized text');
}
export function destinationRoute(value: unknown): string {
  const route = stateText(value), parsed = new URL(route, 'http://omd.invalid');
  if (!route.startsWith('/') || route.startsWith('//') || parsed.origin !== 'http://omd.invalid' || `${parsed.pathname}${parsed.search}${parsed.hash}` !== route) return fail('use a canonical destination-relative route');
  return route;
}
export function parseViewActions(value: unknown): ViewAction[] {
  if (!Array.isArray(value) || value.length > 24 || Object.keys(value).length !== value.length) return fail('actions need 0–24 entries');
  return value.map(value => {
    const kind = (value as { kind?: unknown } | null)?.kind;
    const row = stateObject(value, kind === 'click' ? ['kind', 'selector'] : ['kind', 'selector', 'value']);
    const selector = stateText(row.selector);
    if (kind === 'click') return { kind, selector };
    if (kind !== 'fill' && kind !== 'select' && kind !== 'press') return fail('actions support click, fill, select or press');
    if (typeof row.value !== 'string' || row.value.length > 2000) return fail('invalid action value');
    if (kind === 'press' && !['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(row.value)) return fail('press supports bounded navigation/activation keys only');
    return { kind, selector, value: row.value };
  });
}
export function parseViewAssertions(value: unknown): ViewAssertion[] {
  if (!Array.isArray(value) || !value.length || value.length > 24 || Object.keys(value).length !== value.length) return fail('assertions need 1–24 entries');
  return value.map(value => {
    const row = stateObject(value, ['selector', 'state', ...(value && typeof value === 'object' && Object.hasOwn(value, 'text') ? ['text'] : [])]);
    if (row.state !== 'visible' && row.state !== 'hidden') return fail('assertion state must be visible or hidden');
    return { selector: stateText(row.selector), state: row.state, ...(row.text === undefined ? {} : { text: stateText(row.text) }) };
  });
}
export function parseViewState(value: unknown): ViewState {
  const row = stateObject(value, ['name', 'route', 'startRoute', 'actions', 'assertions']);
  return { name: stateText(row.name), route: destinationRoute(row.route), startRoute: destinationRoute(row.startRoute), actions: parseViewActions(row.actions), assertions: parseViewAssertions(row.assertions) };
}
export async function performViewActions(page: Page, actions: readonly ViewAction[]): Promise<void> {
  for (const action of actions) {
    const target = page.locator(action.selector);
    await target.waitFor({ state: 'visible', timeout: 3000 });
    if (await target.count() !== 1) return fail(`action is ambiguous: ${action.selector}`);
    if (action.kind === 'click') await target.click({ timeout: 3000 });
    else if (action.kind === 'fill') await target.fill(action.value, { timeout: 3000 });
    else if (action.kind === 'select') await target.selectOption(action.value, { timeout: 3000 });
    else await target.press(action.value, { timeout: 3000 });
  }
}
export async function assertViewState(page: Page, assertions: readonly ViewAssertion[]): Promise<void> {
  for (const assertion of assertions) {
    const target = page.locator(assertion.selector);
    await target.waitFor({ state: 'attached', timeout: 3000 });
    if (await target.count() !== 1) return fail(`assertion is ambiguous: ${assertion.selector}`);
    await target.waitFor({ state: assertion.state, timeout: 3000 });
    if (assertion.text !== undefined && !(await target.innerText()).includes(assertion.text)) return fail(`expected text absent: ${assertion.selector}`);
  }
}
export function pageRoute(page: Page): string { const url = new URL(page.url()); return `${url.pathname}${url.search}${url.hash}`; }

type InspectionResource = { close(): Promise<void> };
/** One absolute budget owns acquisition, work and teardown. Late acquisitions are closed, never
 * used after expiry. A timeout allows at most two additional seconds for best-effort cleanup. */
export async function inspectionDeadline<T>(operation: (own: <R extends InspectionResource>(resource: Promise<R>) => Promise<R>) => Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) return fail('invalid browser deadline');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const endsAt = Date.now() + timeoutMs;
  const resources: InspectionResource[] = [];
  const closing = new Map<InspectionResource, Promise<void>>();
  const deadlineError = () => new Error(`BROWSER_DEADLINE: exceeded ${timeoutMs}ms; no completed observation published`);
  const close = (resource: InspectionResource): Promise<void> => {
    if (!closing.has(resource)) closing.set(resource, Promise.resolve().then(() => resource.close()));
    return closing.get(resource)!;
  };
  const own = async <R extends InspectionResource>(pending: Promise<R>): Promise<R> => {
    const resource = await pending;
    resources.push(resource);
    if (expired || Date.now() >= endsAt) { void close(resource).catch(() => {}); throw deadlineError(); }
    return resource;
  };
  const cleanup = () => Promise.all(resources.map(close)).then(() => {});
  try {
    return await Promise.race([Promise.resolve().then(async () => {
      try { const result = await operation(own); if (Date.now() >= endsAt) throw deadlineError(); return result; }
      finally { await cleanup(); }
    }), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; void cleanup().catch(() => {}); reject(deadlineError()); }, timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
    if (expired) {
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([cleanup().catch(() => {}), new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, 2000); })]); }
      finally { clearTimeout(cleanupTimer); }
    }
  }
}
export async function browserDeadline<T>(context: BrowserContext, operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  return inspectionDeadline(async own => { await own(Promise.resolve(context)); return operation(); }, timeoutMs);
}

/** Exact local build bytes; fresh context; no account cookies, remote API writes or navigation. */
export async function withLocalView<T>(browser: Browser, root: string, view: { page: string; viewport: { width: number; height: number }; state?: ViewState }, inspect: (page: Page) => Promise<T>): Promise<T> {
  return inspectionDeadline(async own => {
    const served = await own(serveProjectEntry(root, view.page, { spa: view.state !== undefined }));
    const origin = new URL(served.url).origin;
    const context = await own(browser.newContext({ viewport: view.viewport, serviceWorkers: 'block', acceptDownloads: false }));
    const blocked: string[] = [];
    await context.route('**/*', route => {
      const request = route.request();
      if (!['GET', 'HEAD'].includes(request.method()) || new URL(request.url()).origin !== origin) {
        blocked.push(`${request.method()} ${request.url()}`); return route.abort();
      }
      return route.continue();
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    const response = await page.goto(view.state ? `${origin}${view.state.startRoute}` : served.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (response?.status() !== 200) return fail('local entry did not return HTTP 200');
    await waitForDocumentFonts(page);
    if (view.state) {
      await performViewActions(page, view.state.actions);
      await assertViewState(page, view.state.assertions);
      if (pageRoute(page) !== view.state.route) return fail(`expected route ${view.state.route}, observed ${pageRoute(page)}`);
    }
    if (blocked.length) return fail('local view attempted external networking or a non-read-only request; use a bundled local fixture, not production APIs');
    const result = await inspect(page);
    if (view.state) {
      await assertViewState(page, view.state.assertions);
      if (pageRoute(page) !== view.state.route) return fail('state changed during capture');
    }
    if (blocked.length) return fail('blocked network request during capture');
    served.assertSourceCurrent();
    return result;
  }, 30000);
}

/** No hover/tab probes: they would disturb the exact opened modal/tab state. */
export async function statefulIr(page: Page): Promise<RawIr> {
  const raw = await page.evaluate(browserEvaluationExpression(extractInPage.toString(), '4000, null')) as RawIr;
  return { ...raw, meta: { ...raw.meta, interaction: null, motion: null, measurementCoverage: { ...PREPARED_MEASUREMENT_COVERAGE } } };
}
