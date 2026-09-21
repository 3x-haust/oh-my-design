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
  return new URL(url).hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

export function referenceServiceFamily(url: string): string {
  const host = referenceServiceHost(url);
  const labels = host.split('.');
  if (labels.length < 3) return host;
  const suffix = labels.slice(-2).join('.');
  if (['gov.uk', 'nhs.uk', 'go.kr', 'gov.au', 'gc.ca'].includes(suffix)) return suffix;
  const [secondLevel, country] = labels.slice(-2);
  if (country?.length === 2 && secondLevel && ['gov', 'gob', 'go', 'gc'].includes(secondLevel)) return suffix;
  if (country?.length === 2 && secondLevel && ['ac', 'co', 'com', 'edu', 'net', 'org'].includes(secondLevel)) return labels.slice(-3).join('.');
  return suffix;
}

export function designDiscoveryDirectoryProvider(url: string): string | null {
  if (designDiscoveryProvider(url) !== null) return null;
  const parsed = new URL(url);
  const host = referenceServiceHost(url);
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  if (/\/(?:login|signin|sign-in|signup|sign-up|pricing|plans|checkout|subscribe)(?:\/|$)/i.test(path)) return null;
  if (host === 'siteinspire.com' && (path === '/' || /^\/(?:websites|styles|types|subjects)(?:\/[a-z][a-z0-9-]*)?$/.test(path)
    || /^\/websites\/category\/[a-z][a-z0-9-]*$/.test(path))) return 'Siteinspire';
  if (host === 'dribbble.com' && (path === '/' || /^\/(?:shots|tags)(?:\/[a-z][a-z0-9-]*)?$/.test(path))) return 'Dribbble';
  if (host === 'behance.net' && ['/', '/galleries', '/for_you'].includes(path)) return 'Behance';
  if (/^(?:[a-z]{2}\.)?pinterest\.(?:com|co\.uk|ca|de|fr|jp|co\.kr|com\.au)$/.test(host)
    && (path === '/' || /^\/ideas(?:\/[a-z][a-z0-9-]*\/\d+)?$/.test(path))) return 'Pinterest';
  if (host === 'land-book.com' && (path === '/' || /^\/(?:websites|categories)(?:\/[a-z][a-z0-9-]*)?$/.test(path))) return 'Land-book';
  if (host === 'godly.website' && (path === '/' || /^\/(?:websites|collections)(?:\/[a-z][a-z0-9-]*)?$/.test(path))) return 'Godly';
  if (host === 'uibowl.io' && ['/', '/screens', '/apps', '/patterns', '/components'].includes(path)) return 'UI Bowl';
  return null;
}
