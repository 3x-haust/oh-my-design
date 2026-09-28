import { fetch, ProxyAgent } from 'undici';
import { createPublicNetworkProxy } from './public-network.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';
import { extractStaticHtml } from './html-observation.ts';

export type DomainFetchResult = Readonly<{ kind: 'observation'; finalUrl: string; status: number; observation: ReturnType<typeof extractStaticHtml> }
  | { kind: 'fallback'; reason: string }>;
export type DomainFetchTransport = (url: string, signal: AbortSignal) => Promise<DomainFetchResult>;

export const fetchDomainHtml: DomainFetchTransport = async (source, signal) => {
  const proxy = await createPublicNetworkProxy();
  const dispatcher = new ProxyAgent(proxy.server);
  let url = publicDiscoveryUrl(source);
  if (new URL(url).port) throw new Error('domain fetch requires canonical HTTPS port 443');
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetch(url, { dispatcher, signal, redirect: 'manual', headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
      } });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 5) throw new Error('unsafe or excessive domain redirect');
        url = publicDiscoveryUrl(new URL(location, url).href);
        if (new URL(url).port) throw new Error('domain redirect requires canonical HTTPS port 443');
        continue;
      }
      if (response.status < 200 || response.status >= 300) { await response.body?.cancel(); throw new Error(`domain HTTP ${response.status}`); }
      if (!/html/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); throw new Error('domain response is not HTML'); }
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        if (response.body) for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 1_048_576) throw new Error('domain HTML exceeds size limit');
          chunks.push(chunk);
        }
      } finally { if (!response.bodyUsed) await response.body?.cancel(); }
      const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(response.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
      let html: string;
      try { html = new TextDecoder(charset, { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { throw new Error('unsupported or invalid domain HTML charset'); }
      if (/<input[^>]*type\s*=\s*["']?password/i.test(html)) throw new Error('login form blocked domain acquisition');
      const observation = extractStaticHtml(html, url);
      if (observation.observedText.replace(/\s/g, '').length < 200
        || (observation.taskText.length < 80 && observation.shell)) return { kind: 'fallback', reason: 'JS-rendered app shell or insufficient static text' };
      return { kind: 'observation', finalUrl: url, status: response.status, observation };
    }
    throw new Error('domain redirect limit exceeded');
  } finally { await dispatcher.close(); await proxy.close(); }
};
