import { designDiscoveryProvider } from './design-discovery-sources.ts';

export type ObservedSearchResult = Readonly<{ url: string; text: string }>;

const SEARCH_STOP_WORDS = new Set(['and', 'for', 'from', 'into', 'the', 'with', 'that', 'this', 'have', 'will', 'user', 'users',
  'create', 'build', 'make', 'find', 'service', 'services', 'website', 'design', 'application', 'app', 'safe', 'safely']);
const RELATED_TASK_TERMS = [
  { query: /복지|혜택|welfare|benefits?/iu, result: /복지|혜택|지원|정책|welfare|benefits?/iu },
  { query: /medication|medicine|dosage|prescription|pharmacy|refill|처방|약품|투약/iu,
    result: /medication|medicine|dosage|prescription|pharmacy|refill|처방|약품|투약/iu },
] as const;
export function actionableSearchTargets(execution: Readonly<{ lane: 'domain' | 'design'; query: string; provider: string;
  results?: readonly ObservedSearchResult[] }>): readonly string[] {
  const tokens = [...new Set((execution.query.toLowerCase().match(/[가-힣]{2,}|[a-z0-9]{3,}/gu) ?? [])
    .filter(token => !SEARCH_STOP_WORDS.has(token)))];
  const relatedTargets = new Set<string>();
  const otherServiceTargets = new Set<string>();
  for (const result of execution.results ?? []) {
    const label = result.text.toLowerCase();
    const related = tokens.some(token => label.includes(token));
    const relatedTask = RELATED_TASK_TERMS.some(group => group.query.test(execution.query) && group.result.test(label));
    const editorial = /\b(?:trending|news|article|blog|press release|opinion|story)\b|뉴스|기사|보도자료|블로그/iu.test(label);
    const editorialTask = /\b(?:news|media|article|blog|journalism)\b|뉴스|기사|언론|블로그/iu.test(execution.query);
    const genericChrome = /\b(?:settings|cookie|privacy|accessibility|terms|feedback)\b|쿠키|접근성|개인정보|설정|약관/iu.test(label);
    if (genericChrome || editorial && !editorialTask) continue;
    const substantive = (label.match(/[\p{L}\p{N}]{2,}/gu)?.length ?? 0) >= 2 && [...label].length >= 10;
    for (const target of observedSearchTargets({ links: [result.url] })) {
      let host: string;
      try { host = new URL(target).hostname.toLowerCase(); } catch { continue; }
      if (execution.lane === 'domain' && (host === execution.provider || host.endsWith(`.${execution.provider}`))) continue;
      if (execution.lane === 'design') {
        if (designDiscoveryProvider(target) !== null) relatedTargets.add(target);
      } else if (related || relatedTask) relatedTargets.add(target);
      else if (substantive) otherServiceTargets.add(target);
    }
  }
  return [...relatedTargets, ...[...otherServiceTargets].filter(target => !relatedTargets.has(target))];
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
