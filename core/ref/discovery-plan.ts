import { existsSync, readFileSync } from 'node:fs';
import { projection } from '../design-language/index.ts';
import { join } from 'node:path';
import { readFrame } from '../frame/index.ts';
import { validateDomainBrief, type DomainReferenceQueries } from '../domain/domain-brief.ts';
import { validateAcquisitionPlan, type AcquisitionPlan, type AcquisitionZoneV2 } from '../deliberation/contracts.ts';
import type { RouteRecord } from '../route/index.ts';
import type { CraftRefSignal } from './craft-usage.ts';
import { querySeeds } from './reference-query.ts';
import { gallerySearchInputs, type GallerySearchInput } from './gallery-search.ts';
import { inferredKoreanReferenceMarket, marketDesignQueries, marketDomainQueries, marketSearchLabels } from './market-reference.ts';

export const REFERENCE_DISCOVERY_PLAN_SCHEMA = 'reference-discovery-plan-v2' as const;
export type DiscoveryLane = 'domain-reference' | 'design-reference' | 'motion';
type DomainSearchInput = Readonly<{ lane: 'domain'; query: string; url: string; queryParam: 'q' }>;
type DomainEntryInput = Readonly<{ lane: 'domain'; entry: 'public-directory'; url: string }>;

/** Read-only acquisition input, not a search receipt or a design prescription. */
export type ReferenceDiscoveryPlan = Readonly<{
  schema: typeof REFERENCE_DISCOVERY_PLAN_SCHEMA;
  decision: 'discover' | 'skip';
  sourceContractSha256: string;
  userUrlsRequired: false;
  browse: Readonly<{ command: string; defaultMode: 'headless'; optInModes: readonly string[]; budgetActions: number; budgetMinutes: number;
    referenceUnit: 'whole-screen'; cropUse: 'attached-zoom-only'; catalogueRole: 'legacy-transport-and-optional-seeds'; stop: 'confidence-debt-not-production-blocker' }>;
  request: string;
  task: string;
  surface: string | null;
  locale: Readonly<{
    surfaceLocale: string | null;
    explicitMarket: string | null;
    culturalDecision: string | null;
  }>;
  marketReferencePolicy: Readonly<{
    mode: 'target-market-first' | 'unscoped';
    marketRegion: string | null;
    marketLabel: string | null;
    marketSearchLabels: readonly string[];
    audience: string | null;
    targetMarketCoverage: 'required-in-domain-and-design' | 'not-required';
    domainSearchInputs: readonly DomainSearchInput[];
    domainEntryInputs: readonly DomainEntryInput[];
    fallback: 'global-equivalent-only-after-documented-target-market-gap' | 'ordinary-reference-discovery';
    styleInference: 'forbidden';
  }>;
  expressiveNeed: RouteRecord['sourceContract']['designAxes']['expressiveDesignNeed'];
  lanes: readonly Readonly<{
    id: DiscoveryLane;
    purpose: string;
    querySeeds: readonly string[];
    evidence: readonly string[];
  }>[];
  galleryDirectories: readonly string[];
  designSourcePolicy: Readonly<{
    access: 'free-only-verify-at-inspection';
    domainOutput: '.omd/refs/domain/research.json';
    designOutput: '.omd/refs/design/research.json';
    candidates: readonly Readonly<{ name: string; url: string; purpose: string }>[];
    searchQueries: readonly string[];
    nativeSearchInputs: readonly GallerySearchInput[];
    nativeEntryInputs: readonly Readonly<{ lane: 'design'; entry: 'free-gallery'; url: string }>[];
    domainEntryCommand: string | null;
    fallback: string;
  }>;
  decisions: readonly Readonly<{
    zoneId: string;
    question: string;
    axes: readonly string[];
    state: string | null;
    viewports: readonly Readonly<{ width: number; height: number }>[];
  }>[];
  motionEvidenceRequired: boolean;
  sourcePolicy: 'recorded-browse-or-legacy-native-discovery';
  queryPolicy: 'derive-from-explicit-request-and-decisions-not-locale-stereotypes';
  transferPolicy: 'selected-whole-screens-and-analysis-for-makers';
  skipReason: string | null;
}>;

function acquisition(root: string): AcquisitionPlan | null {
  const path = join(root, '.omd/acquisition-plan.json');
  if (!existsSync(path)) return null;
  const checked = validateAcquisitionPlan(JSON.parse(readFileSync(path, 'utf8')));
  if (checked.value === undefined) {
    throw new Error(`reference discovery needs Framer's valid acquisition plan: ${checked.findings.map(f => f.message).join('; ')}`);
  }
  return checked.value;
}

function currentDomainResearch(root: string, request: string): Readonly<{ queries: DomainReferenceQueries; domain: string | null; audience: string | null }> {
  const path = join(root, '.omd/domain-brief.json');
  if (!existsSync(path)) return { queries: { component: [], craft: [], mood: [] }, domain: null, audience: null };
  const brief = validateDomainBrief(JSON.parse(readFileSync(path, 'utf8')));
  if (brief.request !== request) {
    throw new Error('reference discovery domain queries describe an earlier request; refresh the selected domain record');
  }
  return { queries: brief.referenceQueries, domain: brief.domain, audience: brief.audience.description };
}

/**
 * Domain analysis is a mandatory stage, so a missing brief is a contract gap rather than a lawful
 * absence; the empty-query fallback stays only for records published before the stage became required.
 */
export function buildReferenceDiscoveryPlan(root: string, route: RouteRecord): ReferenceDiscoveryPlan {
  const discovering = route.references.decision === 'discover';
  const locale = route.sourceContract.localeDesign;
  const plan = discovering ? acquisition(root) : null;
  const domainResearch = discovering ? currentDomainResearch(root, route.request) : { queries: { component: [], craft: [], mood: [] }, domain: null, audience: null };
  const queries = domainResearch.queries;
  const translated = projection(root, route);
  const mechanisms = translated?.keywords ?? [];
  const expressiveNeed = route.sourceContract.designAxes.expressiveDesignNeed;
  const surface = readFrame(root)?.uxSurface ?? null;
  const marketing = surface === 'marketing' || route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing';
  const motionEvidenceRequired = discovering && route.strategy.methods.includes('motion-one');
  const marketRegion = discovering ? locale?.context.marketRegion ?? inferredKoreanReferenceMarket(route.request) : null;
  const surfaceLocale = locale?.context.surfaceLocale ?? 'ko';
  const searchLabels = marketRegion === null
    ? []
    : marketSearchLabels(marketRegion, surfaceLocale);
  const marketLabel = searchLabels.at(-1) ?? null;
  const domain = locale?.context.domain ?? domainResearch.domain ?? route.sourceContract.taskOutcome.goal;
  const domainQueries = marketRegion === null
    ? (domainResearch.domain === null ? [] : [domain])
    : [...marketDomainQueries(marketRegion, surfaceLocale, domain)];
  const comparableLeads: string[] = []; // Domain-specific sources are agent-selected after observation.
  const designParts = [...new Set([
    ...queries.component.toSorted((left, right) => left.trim().split(/\s+/u).length - right.trim().split(/\s+/u).length),
    ...queries.mood,
  ])];
  const baseDesignQuery = designParts[0] ?? (marketing ? 'typography' : 'app interface');
  const designQueries = marketRegion === null ? designParts
    : (designParts.length ? designParts : [baseDesignQuery])
      .flatMap(part => marketDesignQueries(marketRegion, surfaceLocale, domain, part, marketing));
  const translatedDesignQueries = marketRegion === null ? mechanisms.map(keyword => `${baseDesignQuery} ${keyword}`)
    : marketDesignQueries(marketRegion, surfaceLocale, domain, baseDesignQuery, marketing, mechanisms);
  const designQuery = designQueries[0] ?? baseDesignQuery;
  const finishedQuery = (query: string): string => `${query} finished ${marketing ? 'website' : 'product app'}`;
  const domainSearchInputs: DomainSearchInput[] = [];
  for (const query of domainQueries) {
    const url = new URL('https://www.google.com/search');
    url.searchParams.set('q', query);
    const input = Object.freeze({ lane: 'domain' as const, query, url: url.href, queryParam: 'q' as const });
    domainSearchInputs.push(input);
  }
  const domainEntryInputs: DomainEntryInput[] = [];
  // Restrained work still needs a visual reference. Gallery names are leads, never quality proof
  // or a promise that a provider's entire catalogue/API is free.
  const galleryCandidates = !discovering ? [] : marketing ? [
    { name: 'Siteinspire', url: 'https://www.siteinspire.com/', purpose: 'Website composition, typography, rhythm; follow the entry to the live site.' },
    { name: 'Pinterest', url: 'https://www.pinterest.com/', purpose: 'Visual-direction discovery; open the pin and trace its original, not just a thumbnail.' },
  ] : [
    { name: 'Siteinspire', url: 'https://www.siteinspire.com/', purpose: 'Visually excellent finished websites; inspect the full original live site and select its actual visual character.' },
    { name: 'Mobbin', url: 'https://mobbin.com/explore/screens', purpose: 'Finished released app flows; inspect multiple distinct real screens from the same product, not a pattern list or one confirmation state.' },
    { name: 'Page Flows', url: 'https://pageflows.com/screens/', purpose: 'Public product screens and flow steps; retain a concrete screen and inspect surrounding flow context.' },
    { name: 'Pinterest', url: 'https://www.pinterest.com/', purpose: 'Discover finished websites and released app flows; trace each pin to original full-size screens, not a mood thumbnail.' },
    { name: 'Behance', url: 'https://www.behance.net/', purpose: 'Discover visually exceptional shipped-product case studies; inspect multiple actual app screens and original product where available.' },
  ];
  const motionDiscovery = motionEvidenceRequired;
  const decisions = (plan?.zones ?? []).filter(zone => zone.required).map(zone => {
    const bound = plan?.schema === 'reference-acquisition-plan-v2' ? zone as AcquisitionZoneV2 : null;
    return Object.freeze({
      zoneId: zone.id,
      question: bound?.question ?? zone.job,
      axes: bound?.axes ?? [],
      state: bound?.requiredState ?? null,
      viewports: bound?.viewports ?? [],
    });
  });
  const lanes: ReferenceDiscoveryPlan['lanes'][number][] = [];
  // Every discovery route answers two independent questions: how the domain task is solved, and how
  // the product should feel. Similar services cannot satisfy the second; visual references cannot satisfy the first.
  if (discovering) {
    lanes.push({
      id: 'domain-reference',
      purpose: 'Compare real services from independent operators serving the requested task: audience, eligibility/prerequisites, content and data objects, end-to-end steps across online/offline/support channels, recovery, limits and friction. Contrast what works and fails against exact user-requested outcomes; propose specialization as a hypothesis until user/task evidence validates it. Multiple pages under one operator count once.',
      querySeeds: [...domainQueries, ...comparableLeads],
      evidence: [...(marketLabel === null ? [] : [`comparable services actively serving ${marketLabel}`]), 'independent operator comparisons', 'signed current visible task text and links', 'audience, eligibility and data objects', 'end-to-end online/offline/support/recovery steps and observed limits', 'request-quoted adopt/avoid and uncertain differentiation'],
    });
    lanes.push({
      id: 'design-reference',
      purpose: 'Inspect real aesthetically beautiful finished websites and released multi-screen app flows for hierarchy, density, interactions and desktop/mobile usability appropriate to the requested task. Select a visual character after judging beauty AND task/UX fit independently of domain similarity; never copy source pixels. Documentation, catalogues, one-off confirmations and functional relevance alone are not visual direction.',
      querySeeds: [...new Set([...(marketRegion === null ? [...queries.mood, ...queries.component] : designQueries),
        ...translatedDesignQueries, ...mechanisms, ...querySeeds('mood', [...queries.mood, ...queries.component])])],
      evidence: [...(marketLabel === null ? [] : [`visual direction from finished products serving ${marketLabel}`]), 'full finished website or multiple screens from a released app', 'separate aesthetic and task/UX-fit acceptance/rejection', 'selected visual character and composition for desktop/mobile destination', 'several visually distinct candidates before narrowing'],
    });
  }
  if (discovering && motionDiscovery) lanes.push({
    id: 'motion',
    purpose: motionEvidenceRequired
      ? 'Observe the selected interaction or scroll mechanism in motion, then measure how it is built.'
      : 'Investigate a relevant motion candidate before art direction settles; observation does not select a production scene.',
    querySeeds: querySeeds('craft', queries.craft),
    evidence: ['actual trigger and changing state', 'timing or scroll progress', 'native craft capture', 'reduced-motion consequence'],
  });
  return Object.freeze({
    schema: REFERENCE_DISCOVERY_PLAN_SCHEMA,
    decision: route.references.decision,
    sourceContractSha256: route.sourceContractSha256,
    userUrlsRequired: false,
    browse: { command: 'omd ref browse start --lane design --mode headless --json', defaultMode: 'headless' as const,
      optInModes: ['profile', 'cdp'], budgetActions: 60, budgetMinutes: 10, referenceUnit: 'whole-screen' as const,
      cropUse: 'attached-zoom-only' as const, catalogueRole: 'legacy-transport-and-optional-seeds' as const, stop: 'confidence-debt-not-production-blocker' as const },
    request: route.request,
    task: route.sourceContract.taskOutcome.goal,
    surface,
    locale: Object.freeze({
      surfaceLocale: locale?.context.surfaceLocale ?? null,
      explicitMarket: locale?.context.marketRegion ?? null,
      culturalDecision: locale?.decision ?? null,
    }),
    marketReferencePolicy: Object.freeze({
      mode: marketLabel === null ? 'unscoped' : 'target-market-first',
      marketRegion,
      marketLabel,
      marketSearchLabels: searchLabels,
      audience: marketLabel === null ? null : locale?.context.audience ?? domainResearch.audience,
      targetMarketCoverage: marketLabel === null ? 'not-required' : 'required-in-domain-and-design',
      domainSearchInputs: Object.freeze(domainSearchInputs),
      domainEntryInputs: Object.freeze(domainEntryInputs),
      fallback: marketLabel === null ? 'ordinary-reference-discovery' : 'global-equivalent-only-after-documented-target-market-gap',
      styleInference: 'forbidden',
    }),
    expressiveNeed,
    lanes: Object.freeze(lanes.map(lane => Object.freeze(lane))),
    galleryDirectories: Object.freeze(galleryCandidates.map(source => source.name)),
    designSourcePolicy: Object.freeze({
      access: 'free-only-verify-at-inspection',
      domainOutput: '.omd/refs/domain/research.json',
      designOutput: '.omd/refs/design/research.json',
      candidates: Object.freeze(galleryCandidates),
      searchQueries: Object.freeze(!discovering ? [] : [...new Set([...(designQueries.length === 0 ? [designQuery] : designQueries), ...translatedDesignQueries])].flatMap(query => [
        finishedQuery(query),
        ...(marketing ? [`site:pinterest.com/pin/ ${query}`, `site:siteinspire.com/websites/ ${query}`] : []),
      ])),
      nativeSearchInputs: Object.freeze(!discovering ? [] : [...new Set([...(designQueries.length === 0 ? [designQuery] : designQueries), ...translatedDesignQueries])]
        .flatMap(query => {
          const search = new URL('https://www.google.com/search');
          search.searchParams.set('q', finishedQuery(query));
          return [{ lane: 'design' as const, query: finishedQuery(query), url: search.href, queryParam: 'q' as const },
            ...(marketing ? gallerySearchInputs(query, 'marketing') : [])];
        })),
      nativeEntryInputs: Object.freeze(marketing ? galleryCandidates.map(candidate =>
        Object.freeze({ lane: 'design' as const, entry: 'free-gallery' as const, url: candidate.url })) : []),
      domainEntryCommand: discovering ? 'omd ref navigate <public-comparable-service-directory-url> --lane domain --entry public-directory --json' : null,
      fallback: marketing
        ? 'Use actual search results or inspect a public gallery list only to find an original finished website. Retain the whole original at native resolution, never a list thumbnail or cropped screenshot. Use the OMD-owned browser for permitted login or challenge. Do not purchase, start a trial, install an MCP, or claim a blocked source was inspected.'
        : 'Search several finished-product sites with public task content, then open their original product URLs and inspect populated desktop/mobile states. A gallery is optional lead discovery only after direct products fail, never a retained design reference. Stage whole 2x captures for independent Eye review; only approved directions are retained. Use the OMD-owned browser for permitted login or challenge. Do not purchase, start a trial, install an MCP, or claim a blocked source was inspected.',
    }),
    decisions: Object.freeze(decisions),
    motionEvidenceRequired,
    sourcePolicy: 'recorded-browse-or-legacy-native-discovery',
    queryPolicy: 'derive-from-explicit-request-and-decisions-not-locale-stereotypes',
    transferPolicy: 'selected-whole-screens-and-analysis-for-makers',
    skipReason: discovering ? null : route.sourceContract.referenceDiscovery.skipReason,
  });
}

/** A selected positive-motion route cannot evade collection by skipping/removing the domain stage. */
export function missingDiscoveryMotionEvidence(plan: ReferenceDiscoveryPlan, signals: readonly CraftRefSignal[]): boolean {
  return plan.motionEvidenceRequired && !signals.some(signal =>
    signal.scrollFired || signal.animatedShare > 0 || signal.peakEnergy > 0);
}
