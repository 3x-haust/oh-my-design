
import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';

export async function assessSourceLanguage(sourceUrl: string, binding?: ReferenceJudgmentBinding) {
  if (binding && binding.subjectId !== sourceUrl) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
  return referenceDecision('source-language', binding);
}

export type KoreanServiceTextClassification = 'korean' | 'non-korean' | 'undetermined';

export function measureVisibleScript(visibleText: string): Readonly<{ hangul: number; letters: number }> {
  return { hangul: visibleText.match(/[가-힣]/gu)?.length ?? 0, letters: visibleText.match(/\p{L}/gu)?.length ?? 0 };
}

/** Legacy script measurement for historical capture metadata; never market authority. */
export function classifyKoreanServiceText(visibleText: string): KoreanServiceTextClassification {
  const { hangul, letters } = measureVisibleScript(visibleText);
  if (letters < 8) return 'undetermined';
  return hangul >= 8 && hangul / letters >= 0.5 ? 'korean' : 'non-korean';
}

export function isKoreanLanguageServiceText(visibleText: string): boolean {
  return classifyKoreanServiceText(visibleText) === 'korean';
}

export function inferredKoreanReferenceMarket(request: string): 'KR' | null {
  // Market is user authority, not an inference from the language of their request.
  void request;
  return null;
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

export function marketDesignQueries(marketRegion: string, surfaceLocale: string, domain: string,
  base: string, marketing: boolean, translatedKeywords: readonly string[] = []): readonly string[] {
  const labels = marketSearchLabels(marketRegion, surfaceLocale);
  const subject = `${domain} ${base}${translatedKeywords.length ? ` ${translatedKeywords.join(' ')}` : ''}`;
  void marketing;
  return Object.freeze(labels.map(label => `${label} ${subject}`));
}

export function isMarketQualifiedQuery(query: string, labels: readonly string[]): boolean {
  return labels.some(label => query === label || query.startsWith(`${label} `));
}
