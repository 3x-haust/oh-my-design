export function marketSearchLabels(marketRegion: string, surfaceLocale: string): readonly string[] {
  const english = new Intl.DisplayNames(['en'], { type: 'region' }).of(marketRegion) ?? marketRegion;
  const native = new Intl.DisplayNames([surfaceLocale], { type: 'region' }).of(marketRegion) ?? marketRegion;
  return Object.freeze([...new Set([native, english])]);
}

export function marketDomainQueries(marketRegion: string, surfaceLocale: string, domain: string): readonly string[] {
  const labels = marketSearchLabels(marketRegion, surfaceLocale);
  const english = labels.at(-1);
  return Object.freeze(labels.map((label, index) => `${label} ${domain}${index === 0 && label !== english ? '' : ' service'}`));
}

export function isMarketQualifiedQuery(query: string, labels: readonly string[]): boolean {
  return labels.some(label => query === label || query.startsWith(`${label} `));
}
