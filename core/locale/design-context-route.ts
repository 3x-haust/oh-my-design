import {
  LOCALE_DESIGN_ROUTE_SCHEMA, type LocaleDesignContext, type LocaleDesignFinding,
  type LocaleDesignMechanics, type LocaleDesignRoute,
} from './design-context-types.ts';

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

export function deriveLocaleDesignRoute(context: LocaleDesignContext, contextSha256: string): LocaleDesignRoute {
  const base = { schema: LOCALE_DESIGN_ROUTE_SCHEMA, contextSha256, context, mechanics: mechanics(context) } as const;
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
      question: Object.freeze({ id: 'market-region', field: 'marketRegion', prompt: 'Which market or region is this surface for?' }),
      marketFitClaim: 'withheld',
      reason: 'Market-grounded design cannot infer a market from the surface language or locale.',
    });
  }
  if (context.audience === null) {
    return Object.freeze({
      ...base, decision: 'ask', requiredEvidence: Object.freeze([]),
      question: Object.freeze({ id: 'target-audience', field: 'audience', prompt: 'Who is the target audience, and what task are they trying to complete?' }),
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
