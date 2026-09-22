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
      ? 'Siteinspire' : null;
  const terms = url.searchParams.getAll(input.queryParam);
  return provider !== null && terms.length === 1 && terms[0] === input.query ? provider : null;
}

export function gallerySearchHasItems(input: SearchRequest, links: readonly string[]): boolean {
  const provider = gallerySearchProvider(input);
  return provider !== null && links.some(link => designDiscoveryProvider(link) === provider
    && referenceServiceHost(link) === referenceServiceHost(input.url));
}

export function gallerySearchInputs(query: string, surface: 'marketing' | 'product'): readonly GallerySearchInput[] {
  const queryText = query.trim();
  if (!queryText) return [];
  const pinterest = new URL('https://www.pinterest.com/search/pins/'); pinterest.searchParams.set('q', queryText);
  const siteinspire = new URL('https://www.siteinspire.com/search'); siteinspire.searchParams.set('query', queryText);
  return [
    { lane: 'design', query: queryText, url: pinterest.href, queryParam: 'q' },
    surface === 'marketing'
      ? { lane: 'design', query: queryText, url: siteinspire.href, queryParam: 'query' }
      : { lane: 'design', query: queryText, url: `https://dribbble.com/search/${encodeURIComponent(queryText.toLowerCase().replace(/\s+/g, '-'))}`, queryParam: 'path' },
  ];
}
