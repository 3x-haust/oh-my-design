export type MarketLaneCoverage = Readonly<{
  localSources: readonly Readonly<{
    sourceId: string;
    evidenceSha256: string;
    scope: 'service' | 'product' | 'gallery' | 'audience';
    basis: 'market-search-result' | 'market-direct-result';
    provenanceReceiptSha256: string;
  }>[];
  globalFallback: Readonly<{
    sourceIds: readonly string[];
    gap: Readonly<{
      marketRegion: string;
      kind: 'availability' | 'access' | 'coverage';
      attemptedQueries: readonly string[];
      attemptedRoots: readonly string[];
    }>;
  }> | null;
}>;
export type MarketReferenceCoverage = Readonly<{
  marketRegion: string;
  domain: MarketLaneCoverage;
  design: MarketLaneCoverage;
}>;
export type MarketSourceIdentity = Readonly<{
  id: string;
  url: string;
  evidence: Readonly<{ sha256: string }>;
  discovery?: Readonly<{ url: string }>;
}>;

const INVISIBLE = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
export const marketReject = (code: string): never => { throw new Error(code); };
export function marketObject(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return marketReject(code);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) marketReject(code);
}
export function marketText(value: unknown, code: string): string {
  if (typeof value !== 'string') return marketReject(code);
  const result = value.trim();
  if (!result || result.length > 4096 || !result.replace(INVISIBLE, '') || Array.from(result).some(character => {
    const point = character.codePointAt(0) ?? 0;
    return point >= 0xd800 && point <= 0xdfff;
  })) return marketReject(code);
  return result;
}
export function marketTexts(value: unknown, code: string, allowEmpty = false): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || Object.keys(value).length !== value.length) return marketReject(code);
  const result = value.map(item => marketText(item, code));
  if (new Set(result).size !== result.length) return marketReject(`${code}_DUPLICATE`);
  return Object.freeze(result);
}
function lane(value: unknown, sources: readonly MarketSourceIdentity[], label: string): MarketLaneCoverage {
  const code = `REFERENCE_RESEARCH_MARKET_${label.toUpperCase()}`;
  const input = marketObject(value, code);
  exact(input, ['localSources', 'globalFallback'], `${code}_KEYS`);
  if (!Array.isArray(input.localSources) || !input.localSources.length
    || Object.keys(input.localSources).length !== input.localSources.length) return marketReject(`${code}_LOCAL`);
  const localSources = Object.freeze(input.localSources.map(value => {
    const source = marketObject(value, `${code}_LOCAL`);
    exact(source, ['sourceId', 'evidenceSha256', 'scope', 'basis', 'provenanceReceiptSha256'], `${code}_LOCAL_KEYS`);
    const sourceId = marketText(source.sourceId, `${code}_LOCAL_ID`);
    const retained = sources.find(candidate => candidate.id === sourceId);
    if (retained === undefined || source.evidenceSha256 !== retained.evidence.sha256) return marketReject(`${code}_LOCAL_EVIDENCE`);
    const scopes = label === 'domain' ? ['service', 'audience'] : ['product', 'gallery', 'audience'];
    if (!scopes.includes(source.scope as string)) return marketReject(`${code}_LOCAL_SCOPE`);
    if (source.basis !== 'market-search-result' && source.basis !== 'market-direct-result') return marketReject(`${code}_LOCAL_BASIS`);
    const provenanceReceiptSha256 = marketText(source.provenanceReceiptSha256, `${code}_LOCAL_RECEIPT`);
    if (!/^[a-f0-9]{64}$/.test(provenanceReceiptSha256)) return marketReject(`${code}_LOCAL_RECEIPT`);
    return Object.freeze({ sourceId, evidenceSha256: retained.evidence.sha256,
      scope: source.scope as MarketLaneCoverage['localSources'][number]['scope'],
      basis: source.basis, provenanceReceiptSha256 });
  }));
  let globalFallback: MarketLaneCoverage['globalFallback'] = null;
  if (input.globalFallback !== null) {
    const fallback = marketObject(input.globalFallback, `${code}_FALLBACK`);
    exact(fallback, ['sourceIds', 'gap'], `${code}_FALLBACK_KEYS`);
    const gap = marketObject(fallback.gap, `${code}_FALLBACK_GAP`);
    exact(gap, ['marketRegion', 'kind', 'attemptedQueries', 'attemptedRoots'], `${code}_FALLBACK_GAP_KEYS`);
    const marketRegion = marketText(gap.marketRegion, `${code}_FALLBACK_MARKET`).toUpperCase();
    if (!/^(?:[A-Z]{2}|\d{3})$/.test(marketRegion)
      || !['availability', 'access', 'coverage'].includes(gap.kind as string)) return marketReject(`${code}_FALLBACK_GAP`);
    const attemptedQueries = marketTexts(gap.attemptedQueries, `${code}_FALLBACK_QUERIES`, true);
    const attemptedRoots = marketTexts(gap.attemptedRoots, `${code}_FALLBACK_ROOTS`, true);
    if (!attemptedQueries.length && !attemptedRoots.length) return marketReject(`${code}_FALLBACK_ATTEMPTS`);
    globalFallback = Object.freeze({ sourceIds: marketTexts(fallback.sourceIds, `${code}_FALLBACK_SOURCES`),
      gap: Object.freeze({ marketRegion, kind: gap.kind as 'availability' | 'access' | 'coverage', attemptedQueries, attemptedRoots }) });
  }
  const classified = [...localSources.map(source => source.sourceId), ...globalFallback?.sourceIds ?? []];
  const sourceIds = sources.map(source => source.id);
  if (new Set(classified).size !== classified.length || classified.length !== sourceIds.length
    || classified.some(id => !sourceIds.includes(id))) return marketReject(`${code}_COVERAGE`);
  return Object.freeze({ localSources, globalFallback });
}

export function parseMarketReferenceCoverage(
  value: unknown,
  domainSources: readonly MarketSourceIdentity[],
  designSources: readonly MarketSourceIdentity[],
): MarketReferenceCoverage | null {
  if (value === null) return null;
  const input = marketObject(value, 'REFERENCE_RESEARCH_MARKET_COVERAGE');
  exact(input, ['marketRegion', 'domain', 'design'], 'REFERENCE_RESEARCH_MARKET_COVERAGE_KEYS');
  const marketRegion = marketText(input.marketRegion, 'REFERENCE_RESEARCH_MARKET_REGION').toUpperCase();
  if (!/^(?:[A-Z]{2}|\d{3})$/.test(marketRegion)) return marketReject('REFERENCE_RESEARCH_MARKET_REGION');
  return Object.freeze({ marketRegion,
    domain: lane(input.domain, domainSources, 'domain'), design: lane(input.design, designSources, 'design') });
}
