import { createHash } from 'node:crypto';

export const LOCALE_DESIGN_CONTEXT_SCHEMA = 'locale-design-context-v1' as const;
export const LOCALE_DESIGN_ROUTE_SCHEMA = 'locale-design-route-v1' as const;
export const LOCALE_DESIGN_CONTEXT_KEYS = [
  'schema', 'conversationLanguage', 'surfaceLocale', 'marketRegion', 'audience', 'domain',
  'surface', 'desiredFit', 'brandInvariants',
] as const;
export const LOCALE_DESIGN_SURFACES = ['product', 'marketing', 'editorial', 'mixed'] as const;
export const LOCALE_DESIGN_FITS = ['market-grounded', 'locale-mechanics-only'] as const;

export type LocaleDesignSurface = (typeof LOCALE_DESIGN_SURFACES)[number];
export type LocaleDesignFit = (typeof LOCALE_DESIGN_FITS)[number];
export type LocaleDesignContext = Readonly<{
  schema: typeof LOCALE_DESIGN_CONTEXT_SCHEMA;
  conversationLanguage: string | null;
  surfaceLocale: string;
  marketRegion: string | null;
  audience: string | null;
  domain: string;
  surface: LocaleDesignSurface;
  desiredFit: LocaleDesignFit;
  brandInvariants: readonly string[];
}>;
export type LocaleDesignMechanics = Readonly<{
  surfaceLocale: string;
  language: string;
  explicitScript: string | null;
  explicitRegion: string | null;
  likelyScript: string | null;
  scriptSource: 'explicit' | 'likely-subtag' | 'unavailable';
}>;
export type LocaleDesignQuestion = Readonly<{
  id: 'market-region' | 'target-audience';
  field: 'marketRegion' | 'audience';
  prompt: string;
}>;
export type LocaleDesignRoute = Readonly<{
  schema: typeof LOCALE_DESIGN_ROUTE_SCHEMA;
  decision: 'ask' | 'mechanics-only' | 'research';
  contextSha256: string;
  context: LocaleDesignContext;
  mechanics: LocaleDesignMechanics;
  requiredEvidence: readonly string[];
  question: LocaleDesignQuestion | null;
  marketFitClaim: 'withheld' | 'evidence-required';
  reason: string;
}>;
export type LocaleDesignFinding = Readonly<{
  id: 'LOCALE_DESIGN_MARKET_REQUIRED' | 'LOCALE_DESIGN_AUDIENCE_REQUIRED';
  message: string;
}>;

export class LocaleDesignContextError extends Error {
  override readonly name = 'LocaleDesignContextError';
  readonly code = 'LOCALE_DESIGN_CONTEXT_INVALID' as const;
  constructor(message: string) { super(`LOCALE_DESIGN_CONTEXT_INVALID: ${message}`); }
}

const INVISIBLE = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
const REGION = /^(?:[A-Z]{2}|\d{3})$/;
const DOMAIN_TEXT_LIMIT = 512;

function fail(message: string): never { throw new LocaleDesignContextError(message); }

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

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

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
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return fail('brandInvariants must be a plain array');
  }
  const keys = Reflect.ownKeys(value);
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
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

export function canonicalLocaleDesignJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalLocaleDesignJson).join(',')}]`;
  if (typeof value === 'object' && Reflect.getPrototypeOf(value) === Object.prototype) {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalLocaleDesignJson(record[key])}`).join(',')}}`;
  }
  return fail('context hash accepts plain JSON data only');
}

export function localeDesignContextSha256(context: LocaleDesignContext): string {
  return createHash('sha256').update(`${canonicalLocaleDesignJson(context)}\n`).digest('hex');
}

export function localeDesignContextJsonSha256(bytes: string | Uint8Array): string {
  let value: unknown;
  try {
    const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch {
    return fail('context file must contain valid JSON');
  }
  return localeDesignContextSha256(parseLocaleDesignContext(value));
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
      || normalized === 'XA' || normalized === 'XB') {
      return fail('marketRegion must identify a recognized region');
    }
    marketRegion = normalized;
  }
  const conversationValue = item.get('conversationLanguage');
  return Object.freeze({
    schema: LOCALE_DESIGN_CONTEXT_SCHEMA,
    conversationLanguage: conversationValue === null ? null : locale(conversationValue, 'conversationLanguage'),
    surfaceLocale: locale(item.get('surfaceLocale'), 'surfaceLocale'),
    marketRegion,
    audience: nullableText(item.get('audience'), 'audience'),
    domain: text(item.get('domain'), 'domain', DOMAIN_TEXT_LIMIT),
    surface: surface as LocaleDesignSurface,
    desiredFit: desiredFit as LocaleDesignFit,
    brandInvariants: invariants(item.get('brandInvariants')),
  });
}

function mechanics(context: LocaleDesignContext): LocaleDesignMechanics {
  const parsed = new Intl.Locale(context.surfaceLocale);
  const likelyScript = parsed.script ?? parsed.maximize().script ?? null;
  return Object.freeze({
    surfaceLocale: context.surfaceLocale,
    language: parsed.language,
    explicitScript: parsed.script ?? null,
    explicitRegion: parsed.region ?? null,
    likelyScript,
    scriptSource: parsed.script !== undefined ? 'explicit' : likelyScript === null ? 'unavailable' : 'likely-subtag',
  });
}

export function routeLocaleDesignContext(value: unknown): LocaleDesignRoute {
  const context = parseLocaleDesignContext(value);
  const base = {
    schema: LOCALE_DESIGN_ROUTE_SCHEMA,
    contextSha256: localeDesignContextSha256(context),
    context,
    mechanics: mechanics(context),
  } as const;
  if (context.desiredFit === 'locale-mechanics-only') {
    return Object.freeze({
      ...base, decision: 'mechanics-only',
      requiredEvidence: Object.freeze(['script-mechanics', 'target-language-type-proof']),
      question: null, marketFitClaim: 'withheld',
      reason: 'The user requested language and script mechanics without a market-aesthetic claim.',
    });
  }
  if (context.marketRegion === null) {
    return Object.freeze({
      ...base, decision: 'ask', requiredEvidence: Object.freeze([]),
      question: Object.freeze({
        id: 'market-region', field: 'marketRegion',
        prompt: 'Which market or region is this surface for?',
      }),
      marketFitClaim: 'withheld',
      reason: 'Market-grounded design cannot infer a market from the surface language or locale.',
    });
  }
  if (context.audience === null) {
    return Object.freeze({
      ...base, decision: 'ask', requiredEvidence: Object.freeze([]),
      question: Object.freeze({
        id: 'target-audience', field: 'audience',
        prompt: 'Who is the target audience, and what task are they trying to complete?',
      }),
      marketFitClaim: 'withheld',
      reason: 'Market-grounded design needs an audience and task before it can interpret market evidence.',
    });
  }
  return Object.freeze({
    ...base, decision: 'research',
    requiredEvidence: Object.freeze([
      'script-mechanics', 'global-equivalent-or-unavailable', 'native-category-first-party',
      'counterexample', 'target-language-type-proof', 'cultural-design-profile',
    ]),
    question: null, marketFitClaim: 'evidence-required',
    reason: 'Explicit market and audience context require current, decision-bound locale research.',
  });
}

export function localeDesignRouteFindings(route: LocaleDesignRoute): readonly LocaleDesignFinding[] {
  if (route.question?.id === 'market-region') {
    return Object.freeze([{ id: 'LOCALE_DESIGN_MARKET_REQUIRED', message: route.question.prompt }]);
  }
  if (route.question?.id === 'target-audience') {
    return Object.freeze([{ id: 'LOCALE_DESIGN_AUDIENCE_REQUIRED', message: route.question.prompt }]);
  }
  return Object.freeze([]);
}

export function parseLocaleDesignRoute(value: unknown): LocaleDesignRoute {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || Reflect.getPrototypeOf(value) !== Object.prototype) return fail('route must be a plain JSON object');
    const descriptor = Reflect.getOwnPropertyDescriptor(value, 'context');
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail('route must contain an enumerable context data property');
    }
    const expected = routeLocaleDesignContext(descriptor.value);
    if (canonicalLocaleDesignJson(value) !== canonicalLocaleDesignJson(expected)) {
      return fail('route must be the exact derived locale-design route');
    }
    return expected;
  } catch (error) {
    if (error instanceof LocaleDesignContextError) throw error;
    return fail('route must be the exact derived locale-design route');
  }
}
