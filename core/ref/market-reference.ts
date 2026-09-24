export function inferredKoreanReferenceMarket(request: string): 'KR' | null {
  if (!/[가-힣]{2,}/u.test(request)) return null;
  if (/미국|영국|일본|중국|캐나다|호주|독일|프랑스|대만|싱가포르|베트남|해외|글로벌|국제|다국가/u.test(request)
    && !/한국(?!어)|대한민국|국내/u.test(request)) return null;
  return 'KR';
}

export function marketSearchLabels(marketRegion: string, surfaceLocale: string): readonly string[] {
  const english = new Intl.DisplayNames(['en'], { type: 'region' }).of(marketRegion) ?? marketRegion;
  const native = new Intl.DisplayNames([surfaceLocale], { type: 'region' }).of(marketRegion) ?? marketRegion;
  const localAliases = marketRegion === 'KR' ? ['한국'] : [];
  return Object.freeze([...new Set([native, ...localAliases, english])]);
}

export function marketDomainQueries(marketRegion: string, surfaceLocale: string, domain: string): readonly string[] {
  const labels = marketSearchLabels(marketRegion, surfaceLocale);
  const english = labels.at(-1);
  return Object.freeze(labels.map((label, index) => `${label} ${domain}${label === english ? ' service' : index === 0 ? '' : ' 서비스'}`));
}

export function isMarketQualifiedQuery(query: string, labels: readonly string[]): boolean {
  return labels.some(label => query === label || query.startsWith(`${label} `));
}
