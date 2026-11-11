import { ThinError } from './state.ts';

/**
 * Sites say in robots.txt what automated agents may open. The design loop opens remote pages and images on a person's
 * behalf, so before it opens one it reads that file and stays out of what an AI agent is told to stay out of.
 *
 * Which group speaks to us: a group naming an agent that fetches for a person (Claude-User, ChatGPT-User, ...) when the
 * site has one; otherwise any group naming an AI crawler (the site's word on AI in general); otherwise `*`. When several
 * groups apply, every one of them must allow the path. Rules follow RFC 9309: the longest matching pattern wins, Allow
 * wins a tie, `*` and `$` are wildcards. A missing file (4xx) allows everything; an unreachable one (5xx or no answer)
 * allows nothing.
 */
const PERSON_AGENTS = ['claude-user', 'chatgpt-user', 'perplexity-user'];
const AI_CRAWLERS = ['claudebot', 'claude-web', 'claude-searchbot', 'anthropic-ai', 'gptbot', 'oai-searchbot', 'ccbot',
  'google-extended', 'perplexitybot'];

type Rule = { allow: boolean; pattern: string };
type Group = { agents: string[]; rules: Rule[] };

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let collectingAgents = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === 'user-agent') {
      if (!collectingAgents || current === null) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
    } else if ((key === 'allow' || key === 'disallow') && current !== null) {
      collectingAgents = false;
      if (value !== '') current.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      collectingAgents = false;
    }
  }
  return groups;
}

function matchLength(pattern: string, path: string): number {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path) ? pattern.length : -1;
}

function groupAllows(group: Group, path: string): boolean {
  let best: Rule | null = null;
  let bestLength = -1;
  for (const rule of group.rules) {
    const length = matchLength(rule.pattern, path);
    if (length > bestLength || (length === bestLength && length >= 0 && rule.allow)) { best = rule; bestLength = length; }
  }
  return best === null || bestLength < 0 || best.allow;
}

/** Whether these robots.txt groups let an AI agent fetching for a person open `path` (path plus query). */
export function robotsAllow(groups: readonly Group[], path: string): boolean {
  const naming = (names: readonly string[]) => groups.filter(group => group.agents.some(agent => names.includes(agent)));
  const person = naming(PERSON_AGENTS);
  const speaking = person.length > 0 ? person : naming(AI_CRAWLERS).length > 0 ? naming(AI_CRAWLERS) : naming(['*']);
  return speaking.every(group => groupAllows(group, path));
}

type Fetcher = (url: string) => Promise<{ status: number; text: string } | null>;
const defaultFetch: Fetcher = async url => {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    return { status: response.status, text: response.ok ? await response.text() : '' };
  } catch { return null; }
};

const cache = new Map<string, Promise<Group[] | 'none'>>();

/** Throws unless the site's robots.txt lets an AI agent open this URL. Loopback and local files are never checked. */
export async function assertRobotsAllow(url: string, fetcher: Fetcher = defaultFetch): Promise<void> {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol) || /^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(parsed.hostname)) return;
  const origin = parsed.origin;
  if (!cache.has(origin)) {
    cache.set(origin, fetcher(`${origin}/robots.txt`).then(answer => {
      if (answer === null || answer.status >= 500) return 'none';
      return answer.status >= 400 ? [] : parseRobots(answer.text);
    }));
  }
  const groups = await cache.get(origin)!;
  const path = `${parsed.pathname}${parsed.search}`;
  if (groups === 'none') throw new ThinError(`${origin}/robots.txt could not be read, so ${url} stays closed; use another source`);
  if (!robotsAllow(groups, path)) {
    throw new ThinError(`${origin}/robots.txt asks AI agents not to open ${path}; use another source (a real product's own site, or images the human adds)`);
  }
}

export const clearRobotsCache = (): void => cache.clear();
