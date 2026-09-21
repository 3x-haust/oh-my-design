import {
  LOCALE_DESIGN_CONTEXT_KEYS, LOCALE_DESIGN_CONTEXT_SCHEMA, LOCALE_DESIGN_FITS, LOCALE_DESIGN_SURFACES,
  LocaleDesignContextError, type LocaleDesignContext, type LocaleDesignFit, type LocaleDesignSurface,
} from './design-context-types.ts';

const INVISIBLE = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
const REGION = /^(?:[A-Z]{2}|\d{3})$/;
const DOMAIN_TEXT_LIMIT = 512;
const fail = (message: string): never => { throw new LocaleDesignContextError(message); };

function fields(value: unknown): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) return fail('context must be a plain JSON object');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== LOCALE_DESIGN_CONTEXT_KEYS.length
    || keys.some((key) => typeof key !== 'string' || !LOCALE_DESIGN_CONTEXT_KEYS.includes(key as never))) {
    return fail(`context must contain exactly ${LOCALE_DESIGN_CONTEXT_KEYS.join(', ')}`);
  }
  const result = new Map<string, unknown>();
  for (const key of LOCALE_DESIGN_CONTEXT_KEYS) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`context field ${key} must be an enumerable data property`);
    }
    result.set(key, descriptor.value);
  }
  return result;
}

function text(value: unknown, label: string, limit = Number.POSITIVE_INFINITY): string {
  if (typeof value !== 'string') return fail(`${label} must be text`);
  const normalized = value.trim();
  if (normalized.replace(INVISIBLE, '').length === 0) return fail(`${label} must contain visible text`);
  if (normalized.length > limit) return fail(`${label} must be at most ${limit} UTF-16 code units`);
  if (Array.from(normalized).some(character => {
    const point = character.codePointAt(0) ?? 0;
    return point >= 0xd800 && point <= 0xdfff;
  })) return fail(`${label} must contain well-formed Unicode`);
  return normalized;
}

const nullableText = (value: unknown, label: string): string | null => value === null ? null : text(value, label);

function locale(value: unknown, label: string): string {
  const candidate = text(value, label);
  try {
    const parsed = new Intl.Locale(candidate);
    if (parsed.language === undefined || parsed.language === 'und') return fail(`${label} must identify a language`);
    return parsed.toString();
  } catch (error) {
    if (error instanceof LocaleDesignContextError) throw error;
    return fail(`${label} must be a valid BCP 47 language tag`);
  }
}

function invariants(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return fail('brandInvariants must be a plain array');
  const keys = Reflect.ownKeys(value);
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return fail('brandInvariants must contain only indexed data values');
  }
  const result = Array.from({ length: value.length }, (_, index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`brandInvariants[${index}] must be an enumerable data value`);
    }
    return text(descriptor.value, `brandInvariants[${index}]`);
  });
  if (new Set(result).size !== result.length) return fail('brandInvariants must be unique');
  return Object.freeze(result);
}

export function parseLocaleDesignContext(value: unknown): LocaleDesignContext {
  const item = fields(value);
  if (item.get('schema') !== LOCALE_DESIGN_CONTEXT_SCHEMA) return fail(`schema must be ${LOCALE_DESIGN_CONTEXT_SCHEMA}`);
  const surface = item.get('surface');
  if (!LOCALE_DESIGN_SURFACES.includes(surface as never)) return fail(`surface must be one of ${LOCALE_DESIGN_SURFACES.join(', ')}`);
  const desiredFit = item.get('desiredFit');
  if (!LOCALE_DESIGN_FITS.includes(desiredFit as never)) return fail(`desiredFit must be one of ${LOCALE_DESIGN_FITS.join(', ')}`);
  const marketValue = item.get('marketRegion');
  let marketRegion: string | null = null;
  if (marketValue !== null) {
    if (typeof marketValue !== 'string') return fail('marketRegion must be a region subtag or null');
    const normalized = marketValue.trim().toUpperCase();
    if (!REGION.test(normalized)) return fail('marketRegion must be a two-letter or three-digit region subtag');
    const displayName = new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized);
    if (displayName === undefined || displayName === normalized || displayName === 'Unknown Region'
      || normalized === 'XA' || normalized === 'XB') return fail('marketRegion must identify a recognized region');
    marketRegion = normalized;
  }
  const conversationValue = item.get('conversationLanguage');
  const marketAuthorityClaimId = nullableText(item.get('marketAuthorityClaimId'), 'marketAuthorityClaimId');
  if (marketRegion === null && marketAuthorityClaimId !== null) return fail('marketAuthorityClaimId requires an explicit marketRegion');
  if (marketRegion !== null && desiredFit === 'market-grounded' && marketAuthorityClaimId === null) {
    return fail('market-grounded marketRegion requires marketAuthorityClaimId from a confirmed user fact');
  }
  return Object.freeze({
    schema: LOCALE_DESIGN_CONTEXT_SCHEMA,
    conversationLanguage: conversationValue === null ? null : locale(conversationValue, 'conversationLanguage'),
    surfaceLocale: locale(item.get('surfaceLocale'), 'surfaceLocale'),
    marketRegion,
    marketAuthorityClaimId,
    audience: nullableText(item.get('audience'), 'audience'),
    domain: text(item.get('domain'), 'domain', DOMAIN_TEXT_LIMIT),
    surface: surface as LocaleDesignSurface,
    desiredFit: desiredFit as LocaleDesignFit,
    brandInvariants: invariants(item.get('brandInvariants')),
  });
}
