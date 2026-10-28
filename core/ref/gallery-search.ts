import { designDiscoveryProvider, referenceServiceHost } from './design-discovery-sources.ts';

export type GallerySearchInput = Readonly<{ lane: 'design'; query: string; url: string; queryParam: string }>;
type SearchRequest = Readonly<{ lane: string; query: string; url: string; queryParam: string }>;

export function gallerySearchProvider(input: SearchRequest): string | null {
  if (input.lane !== 'design') return null;
  const url = new URL(input.url);
  if (url.origin === 'https://dribbble.com' && input.queryParam === 'path' && !url.search
    && url.pathname === `/search/${encodeURIComponent(input.query.toLowerCase().replace(/\s+/g, '-'))}`) return 'Dribbble';
  const provider = url.origin === 'https://www.pinterest.com' && url.pathname === '/search/pins/' && input.queryParam === 'q'
    ? 'Pinterest' : url.origin === 'https://www.siteinspire.com' && url.pathname === '/search' && input.queryParam === 'query'
      ? 'Siteinspire' : url.origin === 'https://notefolio.net' && url.pathname === '/search' && input.queryParam === 'search'
        ? 'Notefolio' : url.origin === 'https://www.behance.net' && url.pathname === '/search/projects' && input.queryParam === 'search'
          ? 'Behance' : null;
  const terms = url.searchParams.getAll(input.queryParam);
  return provider !== null && terms.length === 1 && terms[0] === input.query ? provider : null;
}

export function gallerySearchHasItems(input: SearchRequest, links: readonly string[]): boolean {
  const provider = gallerySearchProvider(input);
  return provider !== null && links.some(link => designDiscoveryProvider(link) === provider
    && referenceServiceHost(link) === referenceServiceHost(input.url));
}

/**
 * Component searches go where designers look for one element at a time — "filter ui design" on
 * Pinterest, Dribbble, Behance and Notefolio — and lay many candidates side by side before choosing.
 * Siteinspire stays for whole marketing pages.
 */
export function gallerySearchInputs(query: string, surface: 'marketing' | 'product'): readonly GallerySearchInput[] {
  const queryText = query.trim();
  if (!queryText) return [];
  const pinterest = new URL('https://www.pinterest.com/search/pins/'); pinterest.searchParams.set('q', queryText);
  const siteinspire = new URL('https://www.siteinspire.com/search'); siteinspire.searchParams.set('query', queryText);
  const notefolio = new URL('https://notefolio.net/search'); notefolio.searchParams.set('search', queryText);
  // Behance answers the path form with 403; its own search box submits ?search=.
  const behance = new URL('https://www.behance.net/search/projects'); behance.searchParams.set('search', queryText);
  return [
    { lane: 'design', query: queryText, url: pinterest.href, queryParam: 'q' },
    { lane: 'design', query: queryText, url: `https://dribbble.com/search/${encodeURIComponent(queryText.toLowerCase().replace(/\s+/g, '-'))}`, queryParam: 'path' },
    { lane: 'design', query: queryText, url: behance.href, queryParam: 'search' },
    { lane: 'design', query: queryText, url: notefolio.href, queryParam: 'search' },
    ...(surface === 'marketing' ? [{ lane: 'design' as const, query: queryText, url: siteinspire.href, queryParam: 'query' }] : []),
  ];
}

/** "filter" becomes "filter ui design"; a query that already names the medium is kept as written. */
export function componentGalleryQuery(component: string): string {
  const text = component.trim();
  return /\b(?:ui|ux|design|web|app|landing|website)\b|디자인/i.test(text) ? text : `${text} ui design`;
}
