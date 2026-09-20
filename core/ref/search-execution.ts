import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Browser } from 'playwright';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { decodePng } from '../motion/energy.ts';
import { gallerySearchHasItems, gallerySearchProvider } from './gallery-search.ts';

export const SEARCH_EXECUTION_SCHEMA = 'reference-search-execution-v1';
type Lane = 'domain' | 'design';
type Receipt = Readonly<{ path: string; sha256: string }>;
type SearchInput = Readonly<{ lane: Lane; query: string; url: string; queryParam: string }>;
type SearchExecution = Readonly<{
  schema: typeof SEARCH_EXECUTION_SCHEMA; lane: Lane; query: string; queryParam: string;
  requestedUrl: string; finalUrl: string | null; provider: string;
  observedAt: string; status: 'page-observed' | 'gallery-observed' | 'blocked' | 'http-error' | 'navigation-error'; httpStatus: number | null;
  links: readonly string[]; capture: Receipt | null; error: string | null;
  limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested';
}>;
const LIMITATIONS: SearchExecution['limitations'] = 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested';
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fail = (message: string): never => { throw new Error(`REFERENCE_SEARCH: ${message}`); };
function object(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('expected plain data');
  const desc = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !desc[key]?.enumerable || !('value' in desc[key]!))) return fail(`expected exactly ${keys.join(', ')}`);
  return value as Record<string, unknown>;
}
function text(value: unknown): string { return typeof value === 'string' && value.trim() && value.length <= 4096 ? value.trim() : fail('missing/oversized text'); }
function url(value: unknown): string {
  const result = text(value);
  let parsed: URL;
  try { parsed = new URL(result); } catch { return fail('invalid URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.href !== result) return fail('use canonical HTTPS URLs without credentials/fragment');
  return result;
}
function digest(value: unknown): string { const result = text(value); return /^[a-f0-9]{64}$/.test(result) ? result : fail('invalid digest'); }
// Public browser search surfaces only; no paid API or arbitrary page with a made-up ?q field.
// Endpoint availability is observed at runtime, never promised by this catalogue.
const SEARCH_ENDPOINTS = new Set(['https://www.google.com/search', 'https://www.bing.com/search', 'https://duckduckgo.com/',
  'https://html.duckduckgo.com/html/', 'https://lite.duckduckgo.com/lite/']);
export function parseSearchInput(value: unknown): SearchInput {
  const row = object(value, ['lane', 'query', 'url', 'queryParam']);
  if (row.lane !== 'domain' && row.lane !== 'design') return fail('lane must be domain or design');
  const input: SearchInput = { lane: row.lane, query: text(row.query), url: url(row.url), queryParam: text(row.queryParam) };
  const parsed = new URL(input.url);
  if (gallerySearchProvider(input) !== null) return input;
  if (input.queryParam !== 'q' || !SEARCH_ENDPOINTS.has(`${parsed.origin}${parsed.pathname}`)) return fail('unsupported or mismatched query endpoint; use Google/Bing/DuckDuckGo with q, or the exact design-only gallery input from ref discover-plan');
  const terms = parsed.searchParams.getAll(input.queryParam);
  if (terms.length !== 1 || terms[0] !== input.query) return fail('URL must submit the exact query once under queryParam');
  return input;
}
function parseReceipt(value: unknown, lane: Lane, extension: string): Receipt {
  const row = object(value, ['path', 'sha256']);
  const path = text(row.path);
  const sha256 = digest(row.sha256);
  if (path !== `.omd/discovery/${lane}/search-${sha256}.${extension}`
    && path !== `.omd/refs/${lane}/search-${sha256}.${extension}`) return fail('search receipt must use its exact content-addressed lane path');
  return { path, sha256 };
}
function parseExecution(value: unknown): SearchExecution {
  const row = object(value, ['schema', 'lane', 'query', 'queryParam', 'requestedUrl', 'finalUrl', 'provider', 'observedAt', 'status', 'httpStatus', 'links', 'capture', 'error', 'limitations']);
  const input = parseSearchInput({ lane: row.lane, query: row.query, queryParam: row.queryParam, url: row.requestedUrl });
  if (row.schema !== SEARCH_EXECUTION_SCHEMA || row.limitations !== LIMITATIONS || row.provider !== new URL(input.url).hostname
    || !['page-observed', 'gallery-observed', 'blocked', 'http-error', 'navigation-error'].includes(row.status as string)
    || typeof row.observedAt !== 'string' || !Number.isFinite(Date.parse(row.observedAt))) return fail('invalid execution record');
  if (row.httpStatus !== null && (!Number.isInteger(row.httpStatus) || (row.httpStatus as number) < 100 || (row.httpStatus as number) > 599)) return fail('invalid HTTP status');
  if (!Array.isArray(row.links) || row.links.length > 2000 || Object.keys(row.links).length !== row.links.length) return fail('invalid observed links');
  const links = row.links.map(url);
  if (new Set(links).size !== links.length) return fail('duplicate links');
  if (row.status === 'page-observed' && (row.httpStatus !== 200 || row.capture === null || row.finalUrl === null || row.error !== null)) return fail('observed page needs HTTP 200 and capture');
  if (row.status === 'gallery-observed' && (row.httpStatus !== 200
    || row.capture === null || row.finalUrl === null || row.error !== null || !gallerySearchHasItems(input, links))) return fail('observed gallery needs successful HTTP, capture and actual gallery-item links');
  if (row.status === 'page-observed' && gallerySearchProvider(input) !== null) return fail('gallery searches require observed item evidence');
  if (row.status === 'page-observed' || row.status === 'gallery-observed') {
    const finalInput = parseSearchInput({ ...input, url: row.finalUrl });
    if (gallerySearchProvider(finalInput) !== gallerySearchProvider(input)) return fail('search redirected to another provider');
  }
  if (row.status !== 'page-observed' && row.status !== 'gallery-observed' && row.error === null) return fail('failed attempt needs a reason');
  if (row.status === 'navigation-error' && (links.length || row.capture !== null)) return fail('failed navigation cannot assert observed results');
  return { schema: SEARCH_EXECUTION_SCHEMA, lane: input.lane, query: input.query, queryParam: input.queryParam, requestedUrl: input.url, provider: row.provider as string,
    finalUrl: row.finalUrl === null ? null : url(row.finalUrl), observedAt: row.observedAt,
    status: row.status as SearchExecution['status'], httpStatus: row.httpStatus as number | null, links,
    capture: row.capture === null ? null : parseReceipt(row.capture, input.lane, 'png'),
    error: row.error === null ? null : text(row.error), limitations: LIMITATIONS };
}

/** Fresh browser context, no user session, clicks, form fills, payment, or login. This records
 * an actual GET and its visible page; a 200 response does NOT establish a useful search or quality. */
export async function executeReferenceSearch(browser: Browser, value: unknown, writer: ProjectWriteAdapter): Promise<Receipt> {
  const input = parseSearchInput(value);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
  await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage();
  let capture: Receipt | null = null;
  let finalUrl: string | null = null;
  let httpStatus: number | null = null;
  let status: SearchExecution['status'] = 'navigation-error';
  let error: string | null = null;
  let links: string[] = [];
  try {
    const response = await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    httpStatus = response?.status() ?? null;
    finalUrl = url(page.url());
    const bytes = await page.screenshot({ timeout: 10000 });
    capture = { path: `.omd/discovery/${input.lane}/search-${hash(bytes)}.png`, sha256: hash(bytes) };
    links = await page.locator('a[href]').evaluateAll(elements => [...new Set(elements.map(el => (el as HTMLAnchorElement).href))].filter(value => {
      try { const link = new URL(value); return link.protocol === 'https:' && !link.username && !link.password && !link.hash; } catch { return false; }
    }).slice(0, 2000));
    const challenge = searchChallengeReason(await page.locator('body').innerText());
    const gallery = gallerySearchProvider(input) !== null;
    const httpOk = httpStatus === 200;
    status = challenge !== null ? 'blocked' : gallery && httpOk
      ? gallerySearchHasItems(input, links) ? 'gallery-observed' : 'blocked'
      : httpStatus === 200 ? 'page-observed' : 'http-error';
    if (challenge !== null) error = challenge;
    else if (status === 'blocked') error = 'No gallery item links observed; inspect for login, empty results or blocking, then try another public gallery. Do not invent item URLs.';
    if (status === 'http-error') error = `HTTP ${httpStatus ?? 'unknown'}; inspect the capture and use a public alternative`;
    if (status === 'page-observed' || status === 'gallery-observed') {
      try {
        const finalInput = parseSearchInput({ ...input, url: finalUrl });
        if (gallerySearchProvider(finalInput) !== gallerySearchProvider(input)) throw new Error('provider changed');
      }
      catch { status = 'http-error'; error = 'Redirected away from the exact search query; inspect the capture and use a public alternative'; }
    }
    writer.write(capture.path, bytes);
  } catch (caught) {
    // Do not present a partial navigation or old blank-page screenshot as search evidence.
    status = 'navigation-error'; capture = null; links = [];
    error = (caught instanceof Error ? caught.message : String(caught)).slice(0, 4096);
  } finally { await context.close(); }
  const execution: SearchExecution = { schema: SEARCH_EXECUTION_SCHEMA, lane: input.lane, query: input.query, queryParam: input.queryParam,
    requestedUrl: input.url, finalUrl, provider: new URL(input.url).hostname, observedAt: new Date().toISOString(),
    status, httpStatus, links, capture, error, limitations: LIMITATIONS };
  const bytes = `${JSON.stringify(execution, null, 2)}\n`;
  const receipt = { path: `.omd/discovery/${input.lane}/search-${hash(bytes)}.json`, sha256: hash(bytes) };
  writer.write(receipt.path, bytes);
  return receipt;
}

/** Narrow observed challenge wording, not a general content-quality or bot classifier. */
export function searchChallengeReason(body: string): string | null {
  return /Unfortunately, bots use DuckDuckGo too|complete the following challenge to confirm this search was made by a human|Our systems have detected unusual traffic from your computer network/i.test(body.slice(0, 4000))
    ? 'Search challenge observed; no CAPTCHA solving or login bypass. Use another public source.' : null;
}

export function readSearchExecution(root: string, value: unknown, lane: Lane): SearchExecution {
  const receipt = parseReceipt(value, lane, 'json');
  const read = (item: Receipt): Buffer => {
    const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, item.path), label: item.path, fs: nodeStableProjectFileSystem() });
    if (hash(bytes) !== item.sha256) return fail('search evidence changed');
    return bytes;
  };
  const execution = parseExecution(JSON.parse(read(receipt).toString('utf8')));
  if (execution.lane !== lane) return fail('wrong research lane');
  if (execution.capture) {
    const image = decodePng(read(execution.capture));
    if (image.width !== 1280 || image.height !== 900) return fail('search capture viewport differs');
  }
  return execution;
}

/** Query strings are intent only. Each non-user source must trace to an actually observed link;
 * source/entry native captures (validated by research-check) then prove the separate visit. */
export type ObservedNavigation = Readonly<{ url: string; finalUrl: string; links: readonly string[] }>;
export const searchObserved = (execution: Pick<SearchExecution, 'status'>): boolean => execution.status === 'page-observed' || execution.status === 'gallery-observed';
/** navigation is derived only from separately hash/image/lane-validated native captures. */
export function validateSearchCoverage(root: string, lane: Lane, queries: readonly string[], receipts: readonly Receipt[], sourceUrls: readonly string[], navigation: readonly ObservedNavigation[] = []) {
  const records = receipts.map(item => readSearchExecution(root, item, lane));
  if (new Set(receipts.map(item => item.sha256)).size !== receipts.length) return fail('duplicate search receipts');
  if (queries.some(query => !records.some(item => item.query === query)) || records.some(item => !queries.includes(item.query))) return fail('declared queries do not match executed queries');
  const reached = new Set(records.filter(searchObserved).flatMap(observedSearchTargets));
  const pending = new Set(navigation);
  for (let changed = true; changed;) {
    changed = false;
    for (const hop of pending) {
      if (!reached.has(hop.url)) continue;
      reached.add(hop.finalUrl);
      for (const link of hop.links) reached.add(link);
      pending.delete(hop); changed = true;
    }
  }
  for (const source of sourceUrls) if (!reached.has(source)) return fail(`retained source was not an observed search link or captured navigation descendant: ${source}; capture every hop from a usable public search result`);
  return { executed: records.length, failed: records.filter(item => !searchObserved(item)).length, searchQuality: 'not-automatically-judged' as const };
}

/** Decode only known search redirect links that were actually present in the DOM. Decoding is
 * discovery, not a visit: research-check still requires the destination's native capture. */
export function observedSearchTargets(execution: Pick<SearchExecution, 'links'>): string[] {
  const targets = new Set(execution.links);
  for (const link of execution.links) {
    const parsed = new URL(link);
    let target = parsed.hostname === 'www.google.com' && parsed.pathname === '/url'
      ? parsed.searchParams.get('q') ?? parsed.searchParams.get('url')
      : ['duckduckgo.com', 'html.duckduckgo.com', 'lite.duckduckgo.com'].includes(parsed.hostname) && parsed.pathname === '/l/'
        ? parsed.searchParams.get('uddg') : null;
    if (parsed.hostname === 'www.bing.com' && parsed.pathname === '/ck/a') {
      const encoded = parsed.searchParams.get('u');
      if (encoded?.startsWith('a1')) target = Buffer.from(encoded.slice(2), 'base64url').toString('utf8');
    }
    if (target) { try { targets.add(url(target)); } catch { /* not a public canonical target */ } }
  }
  return [...targets];
}
