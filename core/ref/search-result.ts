import { designDiscoveryProvider, referenceServiceFamily } from './design-discovery-sources.ts';

export type ObservedSearchResult = Readonly<{ url: string; text: string }>;

const SEARCH_STOP_WORDS = new Set(['and', 'for', 'from', 'into', 'the', 'with', 'that', 'this', 'have', 'will', 'user', 'users',
  'create', 'build', 'make', 'find', 'service', 'services', 'website', 'design', 'application', 'app', 'safe', 'safely']);
const GENERIC_RESULT_LABEL = /^(?:바로가기|사이트 방문|visit site|open site|official website)$/iu;

export function actionableSearchTargets(execution: Readonly<{ lane: 'domain' | 'design'; query: string; provider: string;
  results?: readonly ObservedSearchResult[] }>, genericServiceFamilies: ReadonlySet<string> = new Set()): readonly string[] {
  const tokens = [...new Set((execution.query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter(token => !SEARCH_STOP_WORDS.has(token)))];
  const targets = new Set<string>();
  for (const result of execution.results ?? []) {
    const label = result.text.toLowerCase();
    const related = tokens.some(token => label.includes(token));
    for (const target of observedSearchTargets({ links: [result.url] })) {
      let host: string;
      try { host = new URL(target).hostname.toLowerCase(); } catch { continue; }
      if (execution.lane === 'domain' && (host === execution.provider || host.endsWith(`.${execution.provider}`))) continue;
      const koreanWelfare = /복지|혜택/u.test(execution.query)
        && /복지|혜택/u.test(label) && host.endsWith('.kr');
      if (execution.lane === 'design' ? designDiscoveryProvider(target) !== null
        : related || koreanWelfare || (GENERIC_RESULT_LABEL.test(result.text.trim())
          && genericServiceFamilies.has(referenceServiceFamily(target)))) targets.add(target);
    }
  }
  return [...targets];
}

function canonicalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash
      && parsed.href === value ? value : null;
  } catch { return null; }
}

export function observedSearchTargets(execution: Readonly<{ links: readonly string[] }>): string[] {
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
    if (target) {
      const canonical = canonicalUrl(target);
      if (canonical !== null) targets.add(canonical);
    }
  }
  return [...targets];
}

export function resultReaches(result: ObservedSearchResult, destinations: readonly string[]): boolean {
  return observedSearchTargets({ links: [result.url] }).some(target => destinations.includes(target));
}
