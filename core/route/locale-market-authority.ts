import type { EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import type { LocaleDesignRoute } from '../locale/design-context.ts';

const POSITIVE_MARKET_INTENT = /\b(?:target|targeting|serve|serving|market|marketed|audience|users?|residents?|customers?|for)\b|대상|사용자|거주자|고객|시장|기반|맞춰|서비스/iu;
const NEGATED_MARKET_INTENT = /\b(?:do\s+not|don't|does\s+not|doesn't|not|never)\s+(?:(?:our\s+)?target|for|serve|support|market)|\b(?:exclude|excluding|excluded|avoid|without|out\s+of\s+scope)\b|대상(?:으로)?\s*하지\s*마|대상(?:이)?\s*아니|제외|피해|지원하지\s*않|서비스하지\s*않/iu;

function containsMarketLabel(value: string, label: string): boolean {
  let offset = value.indexOf(label);
  while (offset >= 0) {
    const before = value.slice(0, offset).at(-1);
    const after = value.slice(offset + label.length).at(0);
    if ((before === undefined || !/[\p{L}\p{N}]/u.test(before))
      && (after === undefined || !/[\p{L}\p{N}]/u.test(after))) return true;
    offset = value.indexOf(label, offset + label.length);
  }
  return false;
}

export function hasLocaleMarketAuthority(
  locale: LocaleDesignRoute,
  publication: EvidenceClaimPublication,
): boolean {
  const authorityId = locale.context.marketAuthorityClaimId;
  const authority = publication.claims.find(claim => claim.id === authorityId);
  if (authorityId === null || !publication.userFacts.includes(authorityId) || authority?.status !== 'confirmed') return false;
  const region = locale.context.marketRegion;
  if (region === null) return false;
  const labels = [region, new Intl.DisplayNames([locale.context.surfaceLocale], { type: 'region' }).of(region),
    new Intl.DisplayNames(['en'], { type: 'region' }).of(region), ...(region === 'KR' ? ['한국'] : [])]
    .filter((label): label is string => typeof label === 'string')
    .map(label => label.normalize('NFKC').toLocaleLowerCase('und'));
  return authority.userEvidence.some(evidence => {
    const excerpt = evidence.excerpt.normalize('NFKC').toLocaleLowerCase('und');
    return labels.some(label => containsMarketLabel(excerpt, label))
      && POSITIVE_MARKET_INTENT.test(excerpt) && !NEGATED_MARKET_INTENT.test(excerpt);
  });
}
