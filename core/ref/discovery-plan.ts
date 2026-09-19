import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFrame } from '../frame/index.ts';
import { validateDomainBrief, type DomainReferenceQueries } from '../domain/domain-brief.ts';
import { validateAcquisitionPlan, type AcquisitionPlan, type AcquisitionZoneV2 } from '../deliberation/contracts.ts';
import type { RouteRecord } from '../route/index.ts';
import type { CraftRefSignal } from './craft-usage.ts';
import { querySeeds } from './reference-query.ts';

export const REFERENCE_DISCOVERY_PLAN_SCHEMA = 'reference-discovery-plan-v1' as const;
export type DiscoveryLane = 'domain-reference' | 'design-reference' | 'motion';

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
  expressiveNeed: RouteRecord['sourceContract']['designAxes']['expressiveDesignNeed'];
  lanes: readonly Readonly<{
    id: DiscoveryLane;
    purpose: string;
    querySeeds: readonly string[];
    evidence: readonly string[];
  }>[];
  galleryDirectories: readonly string[];
  decisions: readonly Readonly<{
    zoneId: string;
    question: string;
    axes: readonly string[];
    state: string | null;
    viewports: readonly Readonly<{ width: number; height: number }>[];
  }>[];
  motionEvidenceRequired: boolean;
  sourcePolicy: 'current-search-then-live-inspection';
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
  // Visual reference gathering is the DEFAULT discovery path, not a showpiece-only reward.
  //
  // A real run gathered only similar services (a welfare portal, gov.uk, two benefit screeners) and
  // never opened a visual board at all, because this lane required `expressiveDesignNeed ===
  // 'showpiece'`. The design that came out could only be a product survey. Every design has a visual
  // direction to find; only `restrained` work declares that it has none to explore.
  const visualCraft = discovering && expressiveNeed !== 'restrained';
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
      purpose: 'Find similar services and task flows: information architecture, domain vocabulary, states, and actionable sequence.',
      querySeeds: [...querySeeds('component', queries.component), ...decisions.map(decision => decision.question)],
      evidence: ['live similar-service task flow', 'domain objects and states', 'paired-viewport anatomy', 'zone-bound native capture'],
    });
    lanes.push({
      id: 'design-reference',
      purpose: 'Find visual direction across many sites: layout rhythm, density, type, colour, material, and component craft.',
      querySeeds: querySeeds('mood', [...queries.mood, ...queries.component]),
      evidence: ['whole-page visual captures', 'several candidates before narrowing', 'measured layout and type parts'],
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
    expressiveNeed,
    lanes: Object.freeze(lanes.map(lane => Object.freeze(lane))),
    galleryDirectories: Object.freeze(visualCraft ? ['Awwwards', 'FWA', 'GDWEB'] : []),
    decisions: Object.freeze(decisions),
    motionEvidenceRequired,
    sourcePolicy: 'current-search-then-live-inspection',
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
