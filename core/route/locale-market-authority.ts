import type { EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import type { LocaleDesignRoute } from '../locale/design-context.ts';

export function hasLocaleMarketAuthority(
  locale: LocaleDesignRoute,
  publication: EvidenceClaimPublication,
): boolean {
  const authorityId = locale.context.marketAuthorityClaimId;
  const authority = publication.claims.find(claim => claim.id === authorityId);
  if (authorityId === null || !publication.userFacts.includes(authorityId) || authority?.status !== 'confirmed') return false;
  const authorityText = [authority.text, ...authority.userEvidence.map(evidence => evidence.excerpt)]
    .join(' ').normalize('NFKC').toLocaleLowerCase('und');
  const region = locale.context.marketRegion;
  if (region === null) return false;
  const labels = [region, new Intl.DisplayNames([locale.context.surfaceLocale], { type: 'region' }).of(region),
    new Intl.DisplayNames(['en'], { type: 'region' }).of(region), ...(region === 'KR' ? ['한국'] : [])]
    .filter((label): label is string => typeof label === 'string')
    .map(label => label.normalize('NFKC').toLocaleLowerCase('und'));
  return labels.some(label => authorityText.includes(label));
}
