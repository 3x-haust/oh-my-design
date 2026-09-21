import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFrame } from '../frame/index.ts';
import { validateDomainBrief, type DomainReferenceQueries } from '../domain/domain-brief.ts';
import { validateAcquisitionPlan, type AcquisitionPlan, type AcquisitionZoneV2 } from '../deliberation/contracts.ts';
import type { RouteRecord } from '../route/index.ts';
import type { CraftRefSignal } from './craft-usage.ts';
import { querySeeds } from './reference-query.ts';
import { gallerySearchInputs, type GallerySearchInput } from './gallery-search.ts';
import { marketDomainQueries, marketSearchLabels } from './market-reference.ts';
import { parseSearchInput } from './search-execution.ts';

export const REFERENCE_DISCOVERY_PLAN_SCHEMA = 'reference-discovery-plan-v2' as const;
export type DiscoveryLane = 'domain-reference' | 'design-reference' | 'motion';
type DomainSearchInput = Readonly<{ lane: 'domain'; query: string; url: string; queryParam: 'q' }>;

/** Read-only acquisition input, not a search receipt or a design prescription. */
export type ReferenceDiscoveryPlan = Readonly<{
  schema: typeof REFERENCE_DISCOVERY_PLAN_SCHEMA;
  decision: 'discover' | 'skip';
  sourceContractSha256: string;
  userUrlsRequired: false;
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
  sourcePolicy: 'current-search-or-direct-public-then-live-inspection';
  queryPolicy: 'derive-from-explicit-request-and-decisions-not-locale-stereotypes';
  transferPolicy: 'measured-parts-and-motion-parameters-through-source-free-selection';
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

function currentDomainQueries(root: string, request: string): DomainReferenceQueries {
  const path = join(root, '.omd/domain-brief.json');
  if (!existsSync(path)) return { component: [], craft: [], mood: [] };
  const brief = validateDomainBrief(JSON.parse(readFileSync(path, 'utf8')));
  if (brief.request !== request.trim()) {
    throw new Error('reference discovery domain queries describe an earlier request; refresh the selected domain record');
  }
  return brief.referenceQueries;
}

/**
 * Domain analysis is a mandatory stage, so a missing brief is a contract gap rather than a lawful
 * absence; the empty-query fallback stays only for records published before the stage became required.
 */
export function buildReferenceDiscoveryPlan(root: string, route: RouteRecord): ReferenceDiscoveryPlan {
  const discovering = route.references.decision === 'discover';
  const locale = route.sourceContract.localeDesign;
  const plan = discovering ? acquisition(root) : null;
  const queries = discovering ? currentDomainQueries(root, route.request) : { component: [], craft: [], mood: [] };
  const expressiveNeed = route.sourceContract.designAxes.expressiveDesignNeed;
  const surface = readFrame(root)?.uxSurface ?? null;
  const marketing = surface === 'marketing' || route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing';
  const motionEvidenceRequired = discovering && route.strategy.methods.includes('motion-one');
  const marketRegion = discovering ? locale?.context.marketRegion ?? null : null;
  const searchLabels = marketRegion === null || locale === undefined
    ? []
    : marketSearchLabels(marketRegion, locale.context.surfaceLocale);
  const marketLabel = searchLabels.at(-1) ?? null;
  const nativeMarketLabel = searchLabels[0] ?? null;
  const domainQueries = locale === undefined
    ? []
    : marketRegion === null ? [] : [...marketDomainQueries(marketRegion, locale.context.surfaceLocale, locale.context.domain)];
  const baseDesignQuery = [...queries.mood, ...queries.component][0] ?? (marketing ? 'typography' : 'app interface');
  const designSubject = locale === undefined ? baseDesignQuery : `${locale.context.domain} ${baseDesignQuery}`;
  const designQueries = searchLabels.map(label => `${label} ${designSubject}`);
  const designQuery = designQueries[0] ?? baseDesignQuery;
  const domainSearchInputs: DomainSearchInput[] = [];
  for (const query of domainQueries) {
    const url = new URL('https://www.bing.com/search');
    url.searchParams.set('q', query);
    const input = Object.freeze({ lane: 'domain' as const, query, url: url.href, queryParam: 'q' as const });
    parseSearchInput(input);
    domainSearchInputs.push(input);
  }
  // Restrained work still needs a visual reference. Gallery names are leads, never quality proof
  // or a promise that a provider's entire catalogue/API is free.
  const galleryCandidates = !discovering ? [] : marketing ? [
    { name: 'Siteinspire', url: 'https://www.siteinspire.com/', purpose: 'Website composition, typography, rhythm; follow the entry to the live site.' },
    { name: 'Pinterest', url: 'https://www.pinterest.com/', purpose: 'Visual-direction discovery; open the pin and trace its original, not just a thumbnail.' },
  ] : [
    { name: 'Pinterest', url: 'https://www.pinterest.com/', purpose: 'App UI/component discovery; verify screen provenance and target viewport before retaining.' },
    { name: 'Dribbble', url: 'https://dribbble.com/', purpose: 'Public app UI shots by pattern; distinguish concepts from released screens, no paid download needed.' },
    { name: 'Behance', url: 'https://www.behance.net/', purpose: 'Public product case-study screen sequences; inspect actual screen images, not only presentation covers.' },
    { name: 'UI Bowl', url: 'https://uibowl.io/', purpose: 'Optional public app screens only; do not require or purchase the paid MCP.' },
    { name: 'Siteinspire', url: 'https://www.siteinspire.com/', purpose: 'Complementary web typography/layout; not a substitute for product-screen anatomy.' },
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
      purpose: 'Find at least three comparable services from independent operator families and inspect their task flows: information architecture, domain vocabulary, states, and actionable sequence. Multiple pages or subdomains under one operator count once.',
      querySeeds: [...domainQueries, ...querySeeds('component', queries.component), ...decisions.map(decision => decision.question)],
      evidence: [...(marketLabel === null ? [] : [`comparable services actively serving ${marketLabel}`]), 'three independent service families', 'live similar-service task flows', 'domain objects and states', 'paired-viewport anatomy', 'zone-bound native capture'],
    });
    lanes.push({
      id: 'design-reference',
      purpose: 'Find visual direction across many sites: layout rhythm, density, type, colour, material, and component craft.',
      querySeeds: [...designQueries, ...querySeeds('mood', [...queries.mood, ...queries.component])],
      evidence: [...(marketLabel === null ? [] : [`visual direction from products or design sources serving ${marketLabel}`]), 'whole-page visual captures', 'several candidates before narrowing', 'measured layout and type parts'],
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
      audience: marketLabel === null ? null : locale?.context.audience ?? null,
      targetMarketCoverage: marketLabel === null ? 'not-required' : 'required-in-domain-and-design',
      domainSearchInputs: Object.freeze(domainSearchInputs),
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
      searchQueries: Object.freeze(!discovering ? [] : (designQueries.length === 0 ? [designQuery] : designQueries).flatMap(query => [
        `site:pinterest.com/pin/ ${query}`,
        `${marketing ? 'site:siteinspire.com/websites/' : 'site:dribbble.com/shots/'} ${query}`,
        ...(!marketing ? [`site:behance.net/gallery/ ${query}`] : []),
      ])),
      nativeSearchInputs: Object.freeze(!discovering ? [] : (designQueries.length === 0 ? [designQuery] : designQueries).flatMap(gallerySearchInputs).map(input => {
        parseSearchInput(input);
        return input;
      })),
      nativeEntryInputs: Object.freeze(galleryCandidates.map(candidate => Object.freeze({ lane: 'design' as const, entry: 'free-gallery' as const, url: candidate.url }))),
      domainEntryCommand: discovering ? 'omd ref navigate <public-comparable-service-directory-url> --lane domain --entry public-directory --json' : null,
      fallback: 'Use actual search results OR explicitly enter a public gallery list with ref navigate <url> --lane design --entry free-gallery --json. In v6 research put the native root plus your reason in discoveryRoots, follow observed links using ref navigate, then capture the concrete gallery item with --lane design (or import-image for native app screenshots). A list is never retained visual direction. Check free access per entry. If login/payment/blocking prevents inspection, record the failed URL and try another public gallery. Component documentation alone is not a visual-direction substitute. Do not purchase, start a trial, install an MCP, bypass access controls, or claim a blocked source was inspected. Free viewing does not grant reuse rights.',
    }),
    decisions: Object.freeze(decisions),
    motionEvidenceRequired,
    sourcePolicy: 'current-search-or-direct-public-then-live-inspection',
    queryPolicy: 'derive-from-explicit-request-and-decisions-not-locale-stereotypes',
    transferPolicy: 'measured-parts-and-motion-parameters-through-source-free-selection',
    skipReason: discovering ? null : route.sourceContract.referenceDiscovery.skipReason,
  });
}

/** A selected positive-motion route cannot evade collection by skipping/removing the domain stage. */
export function missingDiscoveryMotionEvidence(plan: ReferenceDiscoveryPlan, signals: readonly CraftRefSignal[]): boolean {
  return plan.motionEvidenceRequired && !signals.some(signal =>
    signal.scrollFired || signal.animatedShare > 0 || signal.peakEnergy > 0);
}
