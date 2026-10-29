import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowseEvent, BrowseObservation } from './contract.ts';
import { galleryFamily } from '../component-references.ts';
import { loadRefs } from '../store.ts';

export const MEMORY_PICK_NOTE = 'This page did not appear in any reference search result of this project. Pages picked from memory repeat the '
  + 'same famous sites in every project. Leave it: searching for the site by its name, or through a web search engine, does not make it found. '
  + 'Search galleries in this brief\'s own words, look at many results, and keep the ones the results show; when a result really showed '
  + 'this site, open that result\'s gallery page first so the path is recorded. Ignore this when the user named the site.';

const WEB_SEARCH = new Set(['google', 'bing', 'duckduckgo', 'daum', 'naver']);

/** The registrable label of a host: i.pinimg.com -> pinimg, www.example.co.kr -> example. */
export function siteName(host: string): string {
  const labels = host.toLowerCase().split('.');
  const generic = new Set(['co', 'com', 'or', 'ne', 'go', 'ac', 'net', 'org']);
  const index = labels.length >= 3 && generic.has(labels.at(-2)!) ? labels.length - 3 : Math.max(0, labels.length - 2);
  return labels[index]!;
}

/** Full-size original behind an image-search thumbnail proxy (Naver: search.pstatic.net/sunny/?src=...). */
export function proxiedOriginal(mediaUrl: string | null): string | null {
  if (mediaUrl === null) return null;
  try {
    const url = new URL(mediaUrl), src = url.searchParams.get('src');
    return url.hostname === 'search.pstatic.net' && src !== null && /^https:\/\//.test(src) ? src : null;
  } catch { return null; }
}

/** True when an earlier search result in the session links to or names the destination's site. */
export function gotoFromSearchResults(url: string, events: readonly BrowseEvent[], observations: ReadonlyMap<string, BrowseObservation>): boolean {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, '');
  const name = siteName(host);
  // Only gallery browsing discovers a site. A web search engine, or any search whose query already names the
  // site, merely looks up something remembered.
  const discovered = (event: BrowseEvent): boolean => {
    const action = event.action as { provider?: unknown; query?: unknown };
    const provider = typeof action.provider === 'string' ? action.provider.toLowerCase() : '';
    const query = typeof action.query === 'string' ? action.query.toLowerCase() : '';
    return !WEB_SEARCH.has(provider) && !names(query, name) && !query.includes(host);
  };
  const searched = events.filter(event => event.action.verb === 'search' && discovered(event));
  if (!searched.length) return false;
  // Galleries tag their outbound links (?ref=onepagelove, utm_source=land-book); that tag names the search it came from.
  const tag = (parsed.searchParams.get('ref') ?? parsed.searchParams.get('utm_source') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (tag && searched.some(event => 'provider' in event.action && typeof event.action.provider === 'string'
    && tag.includes(event.action.provider.toLowerCase().replace(/[^a-z0-9]/g, '')))) return true;
  // Pinterest results list pins whose originals live on Pinterest's image host.
  if (/(?:^|\.)pinimg\.com$/.test(host) && searched.some(event => 'provider' in event.action && event.action.provider === 'pinterest')) return true;
  // A gallery's own work page is found by browsing that gallery or by a result that links to that very work. Its
  // name in another page's footer ("Follow us on Dribbble") says nothing about one shot opened from memory.
  if (galleryFamily(url) !== null) {
    const hostOf = (link: unknown): string | null => {
      try { return typeof link === 'string' ? new URL(link).hostname.replace(/^www\./, '') : null; } catch { return null; }
    };
    // A gallery's image CDN (cdn.dribbble.com) belongs to the gallery that was browsed (dribbble.com).
    const family = galleryFamily(url);
    const browsedGallery = searched.some(event => [event.finalUrl, event.url].some(link =>
      hostOf(link) === host || (typeof link === 'string' && galleryFamily(link) === family)));
    const path = parsed.pathname.replace(/\/$/, '');
    const linked = events.some(event => event.observation !== null
      && (observations.get(event.observation.sha256)?.linkClaims ?? []).some(link => {
        try { const target = new URL(link.url); return target.hostname.replace(/^www\./, '') === host && target.pathname.replace(/\/$/, '') === path; } catch { return false; }
      }));
    return browsedGallery || linked;
  }
  // A search result page, or a page reached from one by clicking through or by opening another page of the
  // searched gallery (its detail page for a result), that links to or names the site.
  const firstSearch = Math.min(...searched.map(event => event.seq));
  // Result cards cut off at the viewport edge carry no recorded link, so any page of a searched gallery counts as browsing it.
  const hostOf = (link: unknown): string | null => {
    try { return typeof link === 'string' ? new URL(link).hostname.replace(/^www\./, '') : null; } catch { return null; }
  };
  const galleries = new Set(searched.flatMap(event => [hostOf(event.finalUrl), hostOf(event.url)].filter((item): item is string => item !== null)));
  // A whole-site gallery's own page for one site (onepagelove.com/the-boat) is found by clicking it in that
  // gallery's results; the page names the work, not the gallery, so the name checks below cannot find it.
  const page = (link: unknown): string | null => {
    try { if (typeof link !== 'string') return null; const target = new URL(link); return `${target.hostname.replace(/^www\./, '')}${target.pathname.replace(/\/$/, '')}`; } catch { return null; }
  };
  const destination = page(url);
  // The results page a discovering search produced is the search itself (a card kept straight from it).
  if (searched.some(search => page(search.finalUrl) === destination && typeof search.finalUrl === 'string' && new URL(search.finalUrl).search === parsed.search)) return true;
  if (galleries.has(host) && events.some(event => ['click', 'similar'].includes(event.action.verb) && page(event.finalUrl) === destination
    && searched.some(search => search.seq < event.seq && [search.finalUrl, search.url].some(link => hostOf(link) === host)))) return true;
  return events.some(event => {
    const target = hostOf(event.action.verb === 'goto' ? event.action.url : null);
    const opened = target !== null && galleries.has(target);
    const reached = (event.action.verb === 'search' && discovered(event))
      || (event.seq > firstSearch && (['click', 'similar'].includes(event.action.verb) || opened));
    if (!reached || event.observation === null) return false;
    const seen = observations.get(event.observation.sha256);
    if (seen === undefined) return false;
    return seen.linkClaims.some(link => link.url.includes(host) || names(link.text, name)) || names(seen.text, name)
      || (event.action.verb !== 'search' && titledAfter(seen.title ?? '', name));
  });
}

/**
 * A gallery's page for one work is titled with that work's name ("Flint – nook"), which is often only the first
 * part of its domain (flintsystem.design). Only the title of a page opened from the results counts, so a common
 * word in body copy cannot admit an unrelated site.
 */
function titledAfter(title: string, name: string): boolean {
  const first = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).find(Boolean) ?? '';
  return first.length >= 4 && name.startsWith(first);
}

/** "Contra Labs" names contralabs.com; spacing and punctuation are ignored once the name is long enough not to collide. */
function names(text: string, name: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes(name) || (name.length >= 4 && lower.replace(/[^\p{L}\p{N}]/gu, '').includes(name));
}

/** The same check across every browse session already recorded in the project, for `omd ref add`. */
export function projectSearchFound(root: string, url: string): boolean {
  if (sessionSearchFound(root, url)) return true;
  // Another page of a site this project already found by searching (its compare or pricing page) is the same
  // discovery, not a pick from memory.
  const host = hostOf(url);
  return host !== null && loadRefs(root).some(reference => reference.researchLane === 'design' && hostOf(reference.source) === host
    && reference.source !== url && sessionSearchFound(root, reference.source));
}

const hostOf = (url: string): string | null => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
};

function sessionSearchFound(root: string, url: string): boolean {
  const directory = join(root, '.omd/discovery/browse');
  if (!existsSync(directory)) return false;
  // One discovery can span sessions (a gallery searched in one, its detail page opened in the next), so every
  // session's events are read as one history in the order the sessions started.
  const sessions = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => join(directory, entry.name)).filter(session => existsSync(join(session, 'trace.jsonl')))
    .sort((left, right) => statSync(join(left, 'trace.jsonl')).birthtimeMs - statSync(join(right, 'trace.jsonl')).birthtimeMs);
  const events: BrowseEvent[] = [];
  const observations = new Map<string, BrowseObservation>();
  for (const session of sessions) {
    for (const line of readFileSync(join(session, 'trace.jsonl'), 'utf8').split('\n').filter(Boolean)) {
      let event: BrowseEvent;
      try { event = JSON.parse(line) as BrowseEvent; } catch { continue; }
      events.push({ ...event, seq: events.length });
      const sha = event.observation?.sha256;
      const path = sha === undefined ? '' : join(session, 'observations', `${sha}.json`);
      if (sha !== undefined && !observations.has(sha) && existsSync(path)) {
        try { observations.set(sha, JSON.parse(readFileSync(path, 'utf8')) as BrowseObservation); } catch { /* unreadable: not found */ }
      }
    }
  }
  return gotoFromSearchResults(url, events, observations);
}

/** True when the user's own request or a later user turn names the site, which makes it the user's pick. */
export function userNamedSite(root: string, url: string): boolean {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (projectMaterialNames(root, host)) return true;
  return ['.omd/request-sources', '.omd/user-turns'].some(relative => {
    const directory = join(root, relative);
    return existsSync(directory) && readdirSync(directory).some(name => {
      try { return readFileSync(join(directory, name), 'utf8').includes(host); } catch { return false; }
    });
  });
}

/**
 * True when the project's own material (a README at the root or one folder down) links the site: the product's
 * existing page or docs are its material, not a site remembered from elsewhere.
 */
export function projectMaterialNames(root: string, host: string): boolean {
  const skip = new Set(['node_modules', '.omd', '.git', 'dist', 'build', '.omc']);
  const readmes = (directory: string): string[] => {
    try { return readdirSync(directory).filter(name => /^readme(?:\.[a-z-]+)?\.md$/i.test(name)).map(name => join(directory, name)); } catch { return []; }
  };
  let folders: string[] = [];
  try { folders = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && !skip.has(entry.name)).map(entry => join(root, entry.name)); } catch { /* unreadable root */ }
  return [root, ...folders].flatMap(readmes).some(path => {
    try { return readFileSync(path, 'utf8').includes(host); } catch { return false; }
  });
}

/** A shot of a UI or graphic gallery's page (header, comments, related shots) rather than of the work's own image. */
export function galleryPageInsteadOfWork(shot: Pick<BrowseObservation, 'url' | 'wholeImage'>): boolean {
  return shot.wholeImage === null && galleryFamily(shot.url) !== null;
}
