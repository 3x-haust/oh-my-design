export type ObservedSearchResult = Readonly<{ url: string; text: string }>;

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
