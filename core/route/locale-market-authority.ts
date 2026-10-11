import type { EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import type { LocaleDesignRoute } from '../locale/design-context.ts';
import { join } from 'node:path';
import { isVerifiedJudgment, knownFields, normalizeQuoteWhitespace, readSignedJudgmentInput,
  type JudgmentInput, type JudgmentPolicy, type JudgmentReceipt, type VerifiedJudgment } from '../judgment/index.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { readPiRequest } from '../../extensions/omd-request-source.ts';
import { failAdaptiveRoute } from './adaptive-flow-domain.ts';

export const TARGET_MARKET_POLICY: JudgmentPolicy = Object.freeze({
  purpose: 'target-market', decisions: ['explicit', 'unspecified', 'excluded'], authorRoles: ['coordinator'],
  sourceKinds: ['route-request'], fields: ['request'], requiredSourceKinds: ['route-request'], mode: 'advisory',
  parsePayload(value: unknown) {
    const { value: fields } = knownFields(value, [], ['region'], 'target-market');
    if (fields.region !== undefined && (typeof fields.region !== 'string' || !fields.region.trim())) {
      throw new Error('AI_JUDGMENT_INVALID: region');
    }
    return fields;
  },
} satisfies JudgmentPolicy);

function marketClaim(locale: LocaleDesignRoute, publication: EvidenceClaimPublication, judgment: JudgmentInput): boolean {
  const id = locale.context.marketAuthorityClaimId;
  const claim = publication.claims.find(claim => claim.id === id);
  return id !== null && publication.userFacts.includes(id)
    && claim?.status === 'confirmed'
    && claim.userEvidence.some(evidence => evidence.source === 'user-message'
      && judgment.quotes.some(quote => quote.source.kind === 'route-request' && quote.field === 'request'
        && normalizeQuoteWhitespace(quote.text).includes(normalizeQuoteWhitespace(evidence.excerpt))));
}
function marketDecision(locale: LocaleDesignRoute, judgment: JudgmentInput): boolean {
  return locale.context.marketRegion !== null && judgment.purpose === 'target-market' && judgment.subjectId === 'request'
    && judgment.decision === 'explicit'
    && typeof judgment.payload === 'object' && judgment.payload !== null
    && Reflect.get(judgment.payload, 'region') === locale.context.marketRegion
    && judgment.quotes.some(quote => quote.source.kind === 'route-request');
}

/** A confirmed claim alone cannot establish what the user meant by a market name. */
export function hasLocaleMarketAuthority(locale: LocaleDesignRoute, publication: EvidenceClaimPublication,
  judgment?: VerifiedJudgment): boolean {
  return isVerifiedJudgment(judgment) && marketClaim(locale, publication, judgment.judgment)
    && marketDecision(locale, judgment.judgment);
}

export function requirePersistedMarketAuthority(root: string, receipt: JudgmentReceipt | undefined,
  requestText: string, locale: LocaleDesignRoute, publication: EvidenceClaimPublication): void {
  if (!receipt) return failAdaptiveRoute('LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED');
  const request = readPiRequest(root);
  const input = readSignedJudgmentInput(readContainedRegularFile(root, join(root, receipt.path), 'market authority judgment'),
    receipt, TARGET_MARKET_POLICY, (digest, signature) => verifyNativeObservation(root, 'ai-judgment-record-v1', digest, signature));
  if (!request || request.request !== requestText || input.context.requestSha256 !== request.requestSha256
    || input.context.sourceContractSha256 !== null || input.context.questionDigest !== null || input.context.documentSha256 !== null
    || !marketClaim(locale, publication, input) || !marketDecision(locale, input)
    || input.quotes.some(quote => quote.source.kind !== 'route-request' || quote.field !== 'request'
      || quote.source.requestSourceSha256 !== request.recordSha256 || quote.source.requestSha256 !== request.requestSha256
      || !normalizeQuoteWhitespace(request.request).includes(normalizeQuoteWhitespace(quote.text)))) {
    return failAdaptiveRoute('LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED');
  }
}
