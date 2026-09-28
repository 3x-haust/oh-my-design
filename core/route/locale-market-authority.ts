import type { EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import type { LocaleDesignRoute } from '../locale/design-context.ts';
import { isVerifiedJudgment, type VerifiedJudgment } from '../judgment/index.ts';

/** A confirmed claim alone cannot establish what the user meant by a market name. */
export function hasLocaleMarketAuthority(locale: LocaleDesignRoute, publication: EvidenceClaimPublication,
  judgment?: VerifiedJudgment): boolean {
  const authorityId = locale.context.marketAuthorityClaimId;
  const authority = publication.claims.find(claim => claim.id === authorityId);
  return authorityId !== null && publication.userFacts.includes(authorityId) && authority?.status === 'confirmed'
    && locale.context.marketRegion !== null && isVerifiedJudgment(judgment)
    && judgment.judgment.purpose === 'target-market' && judgment.judgment.decision === 'explicit'
    && typeof judgment.judgment.payload === 'object' && judgment.judgment.payload !== null
    && Reflect.get(judgment.judgment.payload, 'region') === locale.context.marketRegion
    && judgment.judgment.quotes.some(quote => quote.source.kind === 'route-request' || quote.source.kind === 'user-turn');
}
