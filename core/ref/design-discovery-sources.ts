/** Supported public discovery entry shapes, not quality endorsements or reuse licences.
 * Free access is checked at capture time; a provider may block or charge for other features.
 * Extend this catalogue deliberately rather than labelling arbitrary domain pages as galleries. */
export function designDiscoveryProvider(url: string): string | null {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname;
  if (/^(?:[a-z]{2}\.)?pinterest\.(?:com|co\.uk|ca|de|fr|jp|co\.kr|com\.au)$/.test(host) && /^\/pin\/[^/]+\/?$/.test(path)) return 'Pinterest';
  if (host === 'dribbble.com' && /^\/shots\/\d[^/]*\/?$/.test(path)) return 'Dribbble';
  if (host === 'behance.net' && /^\/gallery\/\d+(?:\/[^/]+)?\/?$/.test(path)) return 'Behance';
  if (host === 'siteinspire.com' && /^\/websites?\/\d[^/]*\/?$/.test(path)) return 'Siteinspire';
  if (host === 'land-book.com' && /^\/websites\/[^/]+\/?$/.test(path)) return 'Land-book';
  if (host === 'godly.website' && /^\/website\/[^/]+\/?$/.test(path)) return 'Godly';
  // UI Bowl public access is not its paid MCP. Only a real item path is accepted.
  if (host === 'uibowl.io' && /^\/(?:screens?|apps?|patterns?|components?)\/[^/]+(?:\/[^/]+)*\/?$/.test(path)) return 'UI Bowl';
  return null;
}

export function referenceServiceHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}
