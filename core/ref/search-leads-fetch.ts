import { createPublicNetworkProxy } from './public-network.ts';
import { publicDiscoveryUrl, type DiscoveryLane } from './discovery-record.ts';
import { SEARCH_LEADS_SCHEMA, type SearchLeadsInput } from './search-leads.ts';

const unavailable = (reason: string): never => { throw new Error(`REFERENCE_SEARCH_UNAVAILABLE: ${reason}`); };
export type LeadQuery = Readonly<{ lane: DiscoveryLane; query: string }>;
export function extractDuckDuckGoLeadUrls(html: string): readonly string[] {
  const url = new URL('https://html.duckduckgo.com/html/');
  const candidates = [...html.matchAll(/<a\b[^>]*\bclass\s*=\s*["'][^"']*\bresult__a\b[^"']*["'][^>]*>/giu)]
    .flatMap(match => /\bhref\s*=\s*["']([^"']+)["']/iu.exec(match[0])?.[1] ?? []);
  return [...new Set(candidates.flatMap(candidate => {
    try {
      const decoded = candidate.replace(/&amp;/gu, '&');
      const link = new URL(decoded, url);
      const target = link.hostname.endsWith('duckduckgo.com') && link.searchParams.has('uddg')
        ? link.searchParams.get('uddg')! : link.href;
      const parsed = publicDiscoveryUrl(target);
      if (new URL(parsed).hostname.endsWith('duckduckgo.com') || new URL(parsed).port) return [];
      return [parsed];
    } catch { return []; }
  }))].slice(0, 30);
}
export function parseLeadQuery(value: unknown): LeadQuery {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== 'lane,query')
    return unavailable('expected {lane,query}');
  const row = value as Record<string, unknown>;
  if (row.lane !== 'domain' && row.lane !== 'design' || typeof row.query !== 'string'
    || !row.query.trim() || row.query.length > 512) return unavailable('invalid lane or query');
  return { lane: row.lane, query: row.query.trim() };
}
/** DuckDuckGo HTML is a fallback lead source, never a signed observation of destinations. */
export async function searchLeads(value: unknown): Promise<SearchLeadsInput> {
  const { lane, query } = parseLeadQuery(value);
  const { fetch, ProxyAgent } = await import('undici');
  const proxy = await createPublicNetworkProxy();
  const dispatcher = new ProxyAgent(proxy.server);
  try {
    const url = new URL('https://html.duckduckgo.com/html/');
    url.searchParams.set('q', query);
    const response = await fetch(url, { dispatcher, redirect: 'manual', signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' } });
    if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().includes('text/html'))
      return unavailable(`search HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 1024 * 1024) return unavailable('oversized search HTML');
    const reader = response.body?.getReader();
    if (!reader) return unavailable('missing response body');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); return unavailable('oversized search HTML'); }
      chunks.push(chunk);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    if (/captcha|unusual traffic|bots use DuckDuckGo|verify you are human/iu.test(html)) return unavailable('search challenge');
    const urls = extractDuckDuckGoLeadUrls(html);
    return { schema: SEARCH_LEADS_SCHEMA, lane, query, urls, provider: 'DuckDuckGo HTML', tool: 'omd-http-search', observedAt: new Date().toISOString() };
  } finally { await dispatcher.close(); await proxy.close(); }
}
