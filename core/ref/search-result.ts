import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';

export type ObservedSearchResult = Readonly<{ url: string; text: string }>;

export async function judgedObservedLinkTargets(links: readonly ObservedSearchResult[],
  bindingFor?: (url: string) => ReferenceJudgmentBinding | undefined) {
  const targets: string[] = [], limitations: string[] = [];
  for (const link of links) {
    const binding = bindingFor?.(link.url);
    if (binding && binding.subjectId !== link.url) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
    const role = await referenceDecision('link-role', binding);
    if (role.limitation) limitations.push(`${link.url}: ${role.limitation}`);
    if (role.decision === 'task-source' || role.decision === 'design-source')
      targets.push(...observedSearchTargets({ links: [link.url] }));
  }
  return { targets: [...new Set(targets)], limitations };
}

export async function judgedSearchTargets(results: readonly ObservedSearchResult[],
  bindingFor?: (url: string) => ReferenceJudgmentBinding | undefined): Promise<Readonly<{ targets: readonly string[]; limitations: readonly string[] }>> {
  const targets: string[] = [], limitations: string[] = [];
  for (const result of results) {
    const binding = bindingFor?.(result.url);
    if (binding && binding.subjectId !== result.url) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
    const role = await referenceDecision('search-result-role', binding);
    if (role.limitation) limitations.push(`${result.url}: ${role.limitation}`);
    if (role.decision === 'task-source' || role.decision === 'design-source')
      targets.push(...observedSearchTargets({ links: [result.url] }));
  }
  return { targets: [...new Set(targets)], limitations };
}

/** Query/result relevance belongs to a cited search-result-role judgment. This projection
 * preserves every mechanically valid observed target for the agent to assess. */
export function actionableSearchTargets(execution: Readonly<{ lane: 'domain' | 'design'; query: string; provider: string;
  results?: readonly ObservedSearchResult[]; allowUnmatched?: boolean | undefined }>): readonly string[] {
  return [...new Set((execution.results ?? []).flatMap(result => observedSearchTargets({ links: [result.url] })))];
}

/** Legacy helper retained for readers of historical search records, never for authorization. */
export function taskRelatedText(_query: string, _label: string): boolean { return false; }

function canonicalUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash
      && parsed.href === value ? value : null;
  } catch { return null; }
}

export function observedSearchTargets(execution: Readonly<{ links: readonly string[] }>): string[] {
  const targets = new Set(execution.links.filter(link => canonicalUrl(link) !== null));
  for (const link of targets) {
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
