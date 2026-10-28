import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { designDiscoveryProvider } from './design-discovery-sources.ts';
import { loadRefs } from './store.ts';

const GALLERIES = new Set(['Pinterest', 'Dribbble', 'Behance', 'Notefolio', 'Cosmos', 'Component Gallery', '21st.dev', 'Refero']);
const GALLERY_MEDIA = /^(?:i\.pinimg\.com|cdn\.dribbble\.com|mir-s3-cdn-cf\.behance\.net|cdn-bastani\.stunning\.kr)$/;
const GALLERY_PROVIDER = /"provider":"(?:pinterest|dribbble|behance|notefolio|cosmos|componentgallery|21st|refero|inspora)"/;

/** A designer original found on a component gallery: the work page or the gallery's own image host. */
export function isComponentGallerySource(url: string): boolean {
  try {
    const parsed = new URL(url);
    return GALLERIES.has(designDiscoveryProvider(url) ?? '') || GALLERY_MEDIA.test(parsed.hostname);
  } catch { return false; }
}

/** True once any browse session in this project searched a component gallery, even if nothing was kept. */
export function componentGallerySearched(root: string): boolean {
  const directory = join(root, '.omd/discovery/browse');
  if (!existsSync(directory)) return false;
  return readdirSync(directory, { withFileTypes: true }).some(entry => {
    const trace = join(directory, entry.name, 'trace.jsonl');
    return entry.isDirectory() && existsSync(trace) && readFileSync(trace, 'utf8').split('\n')
      .some(line => line.includes('"verb":"search"') && GALLERY_PROVIDER.test(line));
  });
}

export const COMPONENT_REFERENCE_GUIDANCE = 'Look at many references before committing, as designers do: they open dozens and keep ten '
  + 'to twenty; two or three pages is not looking. Keep finished sites from the whole-site galleries (landbook, onepagelove, awwwards, nook, lapaninja) '
  + 'and UI and graphic shots from several galleries (pinterest, dribbble, behance, cosmos, notefolio, refero). '
  + 'Work component by component: for each element that needs a decision (hero, navigation, install block, feature graphic, FAQ), '
  + 'run omd ref browse start --lane design, then omd ref browse search dribbble|behance|notefolio|cosmos|refero "<component> ui design" '
  + '(componentgallery <component-name> for real design-system examples, 21st for coded React components; pinterest searches public image results: shot one result img, then open the full-size original that shot names), '
  + 'and where result cards are not links (Cosmos), keep the item from the results with omd ref browse shot --selector <that item\'s img> instead of clicking, '
  + 'open and keep the candidates that fit the current direction, compare them with omd ref browse contact-sheet, and record each kept '
  + 'original in omd ref context as a supplemental image whose component names the element and what was taken (spacing, hierarchy, anatomy). '
  + 'Before choosing the primary, run omd ref direction-review --json: an isolated reviewer marks each kept page direction, support or reject, '
  + 'and the primary must be one it marks direction.';

const GALLERY_HOSTS: readonly (readonly [RegExp, string])[] = [
  [/(?:^|\.)dribbble\.com$/, 'dribbble'], [/(?:^|\.)behance\.net$/, 'behance'],
  [/(?:^|\.)pinterest\.[a-z.]+$|^i\.pinimg\.com$/, 'pinterest'], [/(?:^|\.)notefolio\.net$|^cdn-bastani\.stunning\.kr$/, 'notefolio'],
  [/(?:^|\.)cosmos\.so$/, 'cosmos'], [/(?:^|\.)refero\.design$/, 'refero'], [/^component\.gallery$/, 'componentgallery'],
  [/(?:^|\.)21st\.dev$/, '21st'], [/(?:^|\.)inspora\.design$/, 'inspora'], [/(?:^|\.)60fps\.design$/, '60fps'],
];

/** The UI and graphic gallery a kept image came from; Pinterest pins are reached through Naver image search. */
export function galleryFamily(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'search.naver.com' && parsed.searchParams.get('where') === 'image'
      && /pinterest/i.test(parsed.searchParams.get('query') ?? '')) return 'pinterest';
    return GALLERY_HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? null;
  } catch { return null; }
}

/** What has been kept so far, said back to the maker so a narrow look is visible; it is not a quota. */
export function referenceBreadth(root: string): string {
  const sites = new Set<string>(), galleries = new Map<string, number>();
  for (const reference of loadRefs(root, { includeDomain: true })) {
    const url = reference.sourceUrl ?? reference.source;
    const family = galleryFamily(url);
    if (family !== null) { galleries.set(family, (galleries.get(family) ?? 0) + 1); continue; }
    try { sites.add(new URL(url).hostname.toLowerCase().replace(/^www\./, '')); } catch { /* not a web source */ }
  }
  const shots = [...galleries.values()].reduce((sum, count) => sum + count, 0);
  return `References kept so far: ${sites.size} finished site${sites.size === 1 ? '' : 's'}${sites.size ? ` (${[...sites].sort().join(', ')})` : ''}, `
    + `${shots} UI or graphic shot${shots === 1 ? '' : 's'}${shots ? ` (${[...galleries].map(([family, count]) => `${family} ${count}`).join(', ')})` : ''}.`;
}
