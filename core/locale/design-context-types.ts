export const LOCALE_DESIGN_CONTEXT_SCHEMA = 'locale-design-context-v1' as const;
export const LOCALE_DESIGN_ROUTE_SCHEMA = 'locale-design-route-v1' as const;
export const LOCALE_DESIGN_CONTEXT_KEYS = [
  'schema', 'conversationLanguage', 'surfaceLocale', 'marketRegion', 'marketAuthorityClaimId',
  'audience', 'domain', 'surface', 'desiredFit', 'brandInvariants',
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
  marketAuthorityClaimId: string | null;
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
