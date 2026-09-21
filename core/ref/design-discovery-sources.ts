function decodedPath(url: URL): string | null {
  let path: string;
  try { path = decodeURIComponent(url.pathname).normalize('NFC'); }
  catch { return null; }
  if (/%[0-9a-f]{2}/i.test(path)) return null;
  return path;
}

function canonicalItem(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return /^\d+$/.test(value) ? BigInt(value).toString() : value.toLowerCase();
}

/** Supported public discovery entry shapes, not quality endorsements or reuse licences.
 * Free access is checked at capture time; a provider may block or charge for other features.
 * Extend this catalogue deliberately rather than labelling arbitrary domain pages as galleries. */
export function designDiscoveryProvider(url: string): string | null {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = decodedPath(parsed);
  if (path === null) return null;
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

export function designDiscoveryItemIdentity(url: string): string | null {
  const provider = designDiscoveryProvider(url);
  if (provider === null) return null;
  const decoded = decodedPath(new URL(url));
  if (decoded === null) return null;
  const path = decoded.replace(/\/+$/, '');
  const item = provider === 'Pinterest' ? canonicalItem(/^\/pin\/([^/]+)/.exec(path)?.[1])
    : provider === 'Dribbble' ? canonicalItem(/^\/shots\/(\d+)/.exec(path)?.[1])
      : provider === 'Behance' ? canonicalItem(/^\/gallery\/(\d+)/.exec(path)?.[1])
        : provider === 'Siteinspire' ? canonicalItem(/^\/websites?\/(\d+)/.exec(path)?.[1])
          : provider === 'UI Bowl'
            ? path.replace(/^\/(screens?|apps?|patterns?|components?)\//, (_match, kind: string) => `/${kind.replace(/s$/, '')}/`)
            : path;
  return item === undefined ? null : `${provider}:${item.toLowerCase()}`;
}

export function designDiscoveryIdentity(url: string): string | null {
  const item = designDiscoveryItemIdentity(url);
  if (item !== null) return item;
  const parsed = new URL(url);
  const decoded = decodedPath(parsed);
  if (decoded === null) return null;
  const path = decoded.replace(/\/+$/, '') || '/';
  return `URL:${parsed.origin}${path}`;
}

export function referenceServiceHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

export function referenceServiceFamily(url: string): string {
  const host = referenceServiceHost(url);
  const labels = host.split('.');
  if (labels.length < 3) return host;
  const suffix = labels.slice(-2).join('.');
  if (['gov.uk', 'nhs.uk', 'gov.au', 'gc.ca'].includes(suffix)) return suffix;
  const [secondLevel, country] = labels.slice(-2);
  if (country?.length === 2 && secondLevel && ['gov', 'gob', 'gc'].includes(secondLevel)) return suffix;
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
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
import { getDomain } from 'tldts';
