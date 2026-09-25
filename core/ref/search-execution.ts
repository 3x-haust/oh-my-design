import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Browser } from 'playwright';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { decodePng } from '../motion/energy.ts';
import { canonicalJson } from './board-artifacts.ts';
import { gallerySearchHasItems, gallerySearchProvider } from './gallery-search.ts';
import { captureSearchObservation } from './reference-capture-observation.ts';
import { observeDocumentResponses, type DocumentObserver } from './document-observation.ts';
import { createPublicNetworkProxy } from './public-network.ts';
import { disableUnproxiedRealtimeTransports } from './browser-security.ts';
import { actionableSearchTargets, observedSearchTargets, type ObservedSearchResult } from './search-result.ts';
import { currentReferenceEvidenceAfter } from './discovery-record.ts';

export { observedSearchTargets } from './search-result.ts';

export const SEARCH_EXECUTION_SCHEMA = 'reference-search-execution-v3';
const HISTORICAL_SIGNED_SEARCH_EXECUTION_SCHEMA = 'reference-search-execution-v2';
const HISTORICAL_SEARCH_EXECUTION_SCHEMA = 'reference-search-execution-v1';
type Lane = 'domain' | 'design';
type Receipt = Readonly<{ path: string; sha256: string }>;
type SearchInput = Readonly<{ lane: Lane; query: string; url: string; queryParam: string }>;
export type SearchExecution = Readonly<{
  schema: typeof SEARCH_EXECUTION_SCHEMA | typeof HISTORICAL_SIGNED_SEARCH_EXECUTION_SCHEMA | typeof HISTORICAL_SEARCH_EXECUTION_SCHEMA;
  lane: Lane; query: string; queryParam: string;
  requestedUrl: string; finalUrl: string | null; provider: string;
  observedAt: string; status: 'page-observed' | 'gallery-observed' | 'empty-observation' | 'blocked' | 'http-error' | 'navigation-error'; httpStatus: number | null;
  links: readonly string[]; capture: Receipt | null; error: string | null;
  results?: readonly ObservedSearchResult[];
  limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested';
  signature?: string;
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
function reason(value: unknown): string { return typeof value === 'string' && value.trim() && value.length <= 4096 ? value : fail('missing/oversized text'); }
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
  'https://html.duckduckgo.com/html/', 'https://lite.duckduckgo.com/lite/', 'https://search.daum.net/search']);
export function parseSearchInput(value: unknown): SearchInput {
  const row = object(value, ['lane', 'query', 'url', 'queryParam']);
  if (row.lane !== 'domain' && row.lane !== 'design') return fail('lane must be domain or design');
  const input: SearchInput = { lane: row.lane, query: text(row.query), url: url(row.url), queryParam: text(row.queryParam) };
  const parsed = new URL(input.url);
  if (gallerySearchProvider(input) !== null) return input;
  if (input.queryParam !== 'q' || !SEARCH_ENDPOINTS.has(`${parsed.origin}${parsed.pathname}`)) return fail('unsupported or mismatched query endpoint; use Google/Bing/DuckDuckGo/Daum with q, or the exact design-only gallery input from ref discover-plan');
  if (parsed.hostname === 'search.daum.net' && (parsed.searchParams.get('w') !== 'tot'
    || [...parsed.searchParams.keys()].sort().join(',') !== 'q,w')) return fail('Daum search requires exactly w=tot and one q parameter');
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
  const schema = typeof value === 'object' && value !== null
    ? Object.getOwnPropertyDescriptor(value, 'schema') : undefined;
  const current = schema !== undefined && 'value' in schema && schema.value === SEARCH_EXECUTION_SCHEMA;
  const signed = current || (schema !== undefined && 'value' in schema && schema.value === HISTORICAL_SIGNED_SEARCH_EXECUTION_SCHEMA);
  const keys = ['schema', 'lane', 'query', 'queryParam', 'requestedUrl', 'finalUrl', 'provider', 'observedAt', 'status', 'httpStatus', 'links', 'capture', 'error', 'limitations'];
  const row = object(value, signed ? [...keys, 'results', 'signature'] : keys);
  const input = parseSearchInput({ lane: row.lane, query: row.query, queryParam: row.queryParam, url: row.requestedUrl });
  if (![SEARCH_EXECUTION_SCHEMA, HISTORICAL_SIGNED_SEARCH_EXECUTION_SCHEMA, HISTORICAL_SEARCH_EXECUTION_SCHEMA].includes(row.schema as string)
    || row.limitations !== LIMITATIONS || row.provider !== new URL(input.url).hostname
    || !['page-observed', 'gallery-observed', 'empty-observation', 'blocked', 'http-error', 'navigation-error'].includes(row.status as string)
    || typeof row.observedAt !== 'string' || !Number.isFinite(Date.parse(row.observedAt))) return fail('invalid execution record');
  if (row.httpStatus !== null && (!Number.isInteger(row.httpStatus) || (row.httpStatus as number) < 100 || (row.httpStatus as number) > 599)) return fail('invalid HTTP status');
  if (!Array.isArray(row.links) || row.links.length > 2000 || Object.keys(row.links).length !== row.links.length) return fail('invalid observed links');
  const links = row.links.map(url);
  if (new Set(links).size !== links.length) return fail('duplicate links');
  const results = signed ? parseResults(row.results, links) : undefined;
  if (row.status === 'page-observed' && (row.httpStatus !== 200 || row.capture === null || row.finalUrl === null || row.error !== null)) return fail('observed page needs HTTP 200 and capture');
  if (row.status === 'gallery-observed' && (row.httpStatus !== 200
    || row.capture === null || row.finalUrl === null || row.error !== null || !gallerySearchHasItems(input, links))) return fail('observed gallery needs successful HTTP, capture and actual gallery-item links');
  if (row.status === 'empty-observation' && (row.httpStatus !== 200 || row.capture === null
    || row.finalUrl === null || row.error === null || hasSearchDestination(input, links))) return fail('empty observation needs a successful captured page without destination links');
  if (row.status === 'page-observed' && gallerySearchProvider(input) !== null) return fail('gallery searches require observed item evidence');
  if (row.status === 'page-observed' || row.status === 'gallery-observed' || row.status === 'empty-observation') {
    const finalInput = parseSearchInput({ ...input, url: row.finalUrl });
    if (gallerySearchProvider(finalInput) !== gallerySearchProvider(input)) return fail('search redirected to another provider');
  }
  if (row.status !== 'page-observed' && row.status !== 'gallery-observed' && row.error === null) return fail('failed attempt needs a reason');
  if (row.status === 'navigation-error' && (links.length || row.capture !== null)) return fail('failed navigation cannot assert observed results');
  const parsed = { schema: row.schema as SearchExecution['schema'], lane: input.lane, query: input.query, queryParam: input.queryParam, requestedUrl: input.url, provider: row.provider as string,
    finalUrl: row.finalUrl === null ? null : url(row.finalUrl), observedAt: row.observedAt,
    status: row.status as SearchExecution['status'], httpStatus: row.httpStatus as number | null, links,
    capture: row.capture === null ? null : parseReceipt(row.capture, input.lane, 'png'),
    error: row.error === null ? null : reason(row.error), limitations: LIMITATIONS };
  return signed ? { ...parsed, results: results ?? [], signature: text(row.signature) } : parsed;
}

function parseResults(value: unknown, links: readonly string[]): readonly ObservedSearchResult[] {
  if (!Array.isArray(value) || value.length > 2000 || Object.keys(value).length !== value.length) return fail('invalid observed results');
  const results = value.map(item => {
    const row = object(item, ['url', 'text']);
    const result = { url: url(row.url), text: text(row.text) };
    if (!links.includes(result.url)) return fail('observed result must bind an observed link');
    return Object.freeze(result);
  });
  if (new Set(results.map(result => result.url)).size !== results.length) return fail('duplicate observed results');
  return Object.freeze(results);
}

/** Fresh browser context, no user session, clicks, form fills, payment, or login. This records
 * an actual GET and its visible page; a 200 response does NOT establish a useful search or quality. */
export async function executeReferenceSearch(browser: Browser, value: unknown, writer: ProjectWriteAdapter): Promise<Receipt> {
  const input = parseSearchInput(value);
  const networkProxy = await createPublicNetworkProxy();
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
  let documents: DocumentObserver | undefined;
  let capture: Receipt | null = null;
  let captureBytes: Buffer | null = null;
  let finalUrl: string | null = null;
  let httpStatus: number | null = null;
  let status: SearchExecution['status'] = 'navigation-error';
  let error: string | null = null;
  let links: string[] = [];
  let results: ObservedSearchResult[] = [];
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false,
      proxy: { server: networkProxy.server } });
    await disableUnproxiedRealtimeTransports(context);
    await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    const page = await context.newPage();
    documents = await observeDocumentResponses(page);
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    const observation = await captureSearchObservation(page, documents);
    httpStatus = observation.httpStatus;
    finalUrl = url(observation.url);
    captureBytes = observation.bytes;
    capture = { path: `.omd/discovery/${input.lane}/search-${hash(captureBytes)}.png`, sha256: hash(captureBytes) };
    links = observation.links;
    results = observation.results;
    const challenge = searchChallengeReason(observation.body);
    const gallery = gallerySearchProvider(input) !== null;
    const httpOk = httpStatus === 200;
    status = challenge !== null ? 'blocked' : !httpOk ? 'http-error'
      : !hasSearchDestination(input, links) ? 'empty-observation' : gallery ? 'gallery-observed' : 'page-observed';
    if (challenge !== null) error = challenge;
    else if (status === 'empty-observation') error = 'No rendered destination links were observed in the captured viewport. Results may be offscreen, absent or unavailable; inspect the capture or use another public source.';
    if (status === 'http-error') error = `HTTP ${httpStatus ?? 'unknown'}; inspect the capture and use a public alternative`;
    if (status === 'page-observed' || status === 'gallery-observed' || status === 'empty-observation') {
      try {
        const finalInput = parseSearchInput({ ...input, url: finalUrl });
        if (gallerySearchProvider(finalInput) !== gallerySearchProvider(input)) throw new Error('provider changed');
      }
      catch { status = 'http-error'; error = 'Redirected away from the exact search query; inspect the capture and use a public alternative'; }
    }
  } catch (caught) {
    // Do not present a partial navigation or old blank-page screenshot as search evidence.
    status = 'navigation-error'; capture = null; captureBytes = null; links = []; results = []; httpStatus = null;
    error = (caught instanceof Error ? caught.message : String(caught)).slice(0, 4096);
  } finally {
    try { await documents?.close(); }
    finally {
      try { await context?.close(); }
      finally { await networkProxy.close(); }
    }
  }
  const unsigned = { schema: SEARCH_EXECUTION_SCHEMA, lane: input.lane, query: input.query, queryParam: input.queryParam,
    requestedUrl: input.url, finalUrl, provider: new URL(input.url).hostname, observedAt: new Date().toISOString(),
    status, httpStatus, links, results, capture, error, limitations: LIMITATIONS } as const;
  const execution: SearchExecution = { ...unsigned,
    signature: signNativeObservation(writer.projectRoot, SEARCH_EXECUTION_SCHEMA, hash(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(execution, null, 2)}\n`;
  const receipt = { path: `.omd/discovery/${input.lane}/search-${hash(bytes)}.json`, sha256: hash(bytes) };
  if (capture !== null && captureBytes !== null) writer.write(capture.path, captureBytes);
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
  if (execution.schema === SEARCH_EXECUTION_SCHEMA || execution.schema === HISTORICAL_SIGNED_SEARCH_EXECUTION_SCHEMA) {
    const { signature, ...unsigned } = execution;
    if (signature === undefined || !verifyNativeObservation(root, execution.schema,
      hash(canonicalJson(unsigned)), signature)) return fail('native search execution signature invalid');
  }
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
function hasSearchDestination(input: SearchInput, links: readonly string[]): boolean {
  if (gallerySearchProvider(input) !== null) return gallerySearchHasItems(input, links);
  const service = new URL(input.url).hostname.split('.').slice(-2).join('.');
  return observedSearchTargets({ links }).some(target => {
    const host = new URL(target).hostname;
    return host !== service && !host.endsWith(`.${service}`);
  });
}
/** navigation is derived only from separately hash/image/lane-validated native captures. */
export function validateSearchCoverage(root: string, lane: Lane, queries: readonly string[], receipts: readonly Receipt[], sourceUrls: readonly string[], navigation: readonly ObservedNavigation[] = [], allowUnmatched = true) {
  const search = readSearchCoverage(root, { lane, queries, receipts, allowUnmatched });
  const reached = observedNavigationTargets(search.targets, navigation);
  for (const source of sourceUrls) if (!reached.has(source)) return fail(`retained source was not an observed search link or captured navigation descendant: ${source}; capture every hop from a usable public search result`);
  return search.summary;
}

export function readSearchCoverage(root: string, input: Readonly<{ lane: Lane; queries: readonly string[]; receipts: readonly Receipt[];
  allowUnmatched?: boolean | undefined }>) {
  const records = input.receipts.map(item => readSearchExecution(root, item, input.lane));
  if (new Set(input.receipts.map(item => item.sha256)).size !== input.receipts.length) return fail('duplicate search receipts');
  if (input.queries.some(query => !records.some(item => item.query === query)) || records.some(item => !input.queries.includes(item.query))) return fail('declared queries do not match executed queries');
  const after = currentReferenceEvidenceAfter(root);
  if (records.some(record => record.schema !== SEARCH_EXECUTION_SCHEMA
    || Date.parse(record.observedAt) < after || Date.parse(record.observedAt) > Date.now() + 5 * 60 * 1000)) {
    return fail('current signed search execution after the route publication is required');
  }
  return { targets: records.filter(searchObserved).flatMap(record => actionableSearchTargets({ ...record,
    allowUnmatched: input.allowUnmatched })),
    summary: { executed: records.length, failed: records.filter(item => !searchObserved(item)).length, searchQuality: 'not-automatically-judged' as const } };
}

export function observedNavigationTargets(targets: readonly string[], navigation: readonly ObservedNavigation[]): ReadonlySet<string> {
  const reached = new Set(targets);
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
  return reached;
}
