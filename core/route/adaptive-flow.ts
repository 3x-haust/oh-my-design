import { routeModelCapabilityProbe } from '../runtime/model-capability-profile.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { checkUxPolicy, type RecommendedMethodDecision } from '../ux/policy.ts';
import { diagnoseAdaptiveStrategyFields, parseAdaptiveRouteInput } from './adaptive-flow-boundary.ts';
import {
  ADAPTIVE_ROLE_IDS,
  ADAPTIVE_ROUTE_RECORD_SCHEMA,
  ADAPTIVE_STAGE_IDS,
  FORBIDDEN_WITHOUT_REQUEST,
  MANDATORY_ADAPTIVE_GATES,
  MANDATORY_STAGE_IDS,
  OPTIONAL_METHOD_IDS,
  OPTIONAL_STAGE_IDS,
  failAdaptiveRoute,
  type AdaptiveRouteInput,
  type AdaptiveRouteRecord,
  type AdaptiveStrategyDecision,
  type ValidatedAdaptiveRouteInput,
} from './adaptive-flow-domain.ts';
import { routeDesignAxes } from './design-axis-routing.ts';
import { routeReferenceDiscovery } from '../ref/reference-discovery-routing.ts';
import { routeTaskOutcome } from './task-outcome-routing.ts';
import { adaptiveSourceContract, adaptiveSourceContractSha256 } from './adaptive-source-contract.ts';
import { ADAPTIVE_STAGE_OWNERS, validateAdaptiveStageOrder } from './adaptive-stage-graph.ts';
import { validateAdaptiveExecutionWaves } from './adaptive-execution-waves.ts';
import { parseAdaptiveExecutionWaves } from './adaptive-execution-wave-boundary.ts';
import { adaptiveBehaviorContract } from './adaptive-behavior-contract.ts';
import { adaptiveMotionContract } from './adaptive-motion-ambition.ts';
import { validateAdaptiveAiAssetSelection } from './adaptive-ai-assets.ts';
import { requiredAttributionCategories, validateAttributionCoverage } from './adaptive-attribution.ts';
import { parseLocaleDesignRoute, type LocaleDesignRoute } from '../locale/design-context.ts';
import { hasLocaleMarketAuthority } from './locale-market-authority.ts';
import { diagnoseUxPolicy } from '../ux/policy.ts';
import { parseTaskOutcomeContract } from '../brief/task-outcome.ts';
import { parseEvidenceClaimPublication } from '../brief/evidence-claims.ts';
import { parseDesignAxisInput } from './design-axis-routing.ts';
import { parseAdaptiveBrowserContext, parseAdaptiveLearningContext } from './adaptive-flow-boundary.ts';
import { isVerifiedJudgment, type VerifiedJudgment } from '../judgment/index.ts';

function validateRecommendation(strategy: AdaptiveStrategyDecision, value: RecommendedMethodDecision): void {
  const skipped = strategy.skips.some((entry) => entry.id === value.id);
  if (value.status === 'selected') {
    if (skipped || !strategy.methods.includes(value.id)) return failAdaptiveRoute('REQUIRED_METHOD_MISSING', `selected method ${value.id} must appear in strategyDecision.methods and must not also appear in skips`);
    return;
  }
  if (!skipped) return failAdaptiveRoute('OPTIONAL_SKIP_REASON_REQUIRED', `skipped recommendation ${value.id} needs a non-empty strategyDecision.skips reason`);
}

export function validateAdaptiveStrategyRails(strategy: AdaptiveStrategyDecision, deliveryMode?: 'design-only'): void {
  for (const role of strategy.roles) {
    if (!ADAPTIVE_ROLE_IDS.includes(role as never)) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_ROLE', `unknown role ${role}; allowed: ${ADAPTIVE_ROLE_IDS.join(', ')}`);
  }
  for (const stage of strategy.stages) {
    if (!ADAPTIVE_STAGE_IDS.includes(stage as never)) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE', `unknown stage ${stage}; allowed: ${ADAPTIVE_STAGE_IDS.join(', ')}`);
  }
  // A study makes provisional material for the selected design owners; it owns no stage publication.
  if (strategy.roles.includes('omd-study')
    && (!strategy.stages.includes('art-direction') || !strategy.stages.includes('composition'))) {
    return failAdaptiveRoute('REQUIRED_METHOD_MISSING', 'omd-study requires selected art-direction and composition stages');
  }
  const skipped = new Set(strategy.skips.map((entry) => entry.id));
  if (MANDATORY_ADAPTIVE_GATES.some((gate) => skipped.has(gate))) return failAdaptiveRoute('HARD_GATE_CANNOT_SKIP');
  // Domain analysis is the first loop step: a design built without knowing the domain's real
  // surfaces and objects is designed from the request's words alone, which is where the generic
  // average shape comes from. It cannot be skipped with a one-line reason.
  for (const stage of MANDATORY_STAGE_IDS) {
    if (skipped.has(stage)) return failAdaptiveRoute('DOMAIN_ANALYSIS_REQUIRED', `mandatory stage ${stage} must not appear in strategyDecision.skips`);
    if (!strategy.stages.includes(stage)) return failAdaptiveRoute('DOMAIN_ANALYSIS_REQUIRED', `mandatory stage ${stage} must be selected in strategyDecision.stages`);
  }
  const designOnly = deliveryMode === 'design-only';
  if (designOnly && (strategy.roles.includes('omd-hand') || strategy.stages.some((stage) => ['production', 'browser-evidence'].includes(stage)))) {
    return failAdaptiveRoute('DESIGN_ONLY_SCOPE_REQUIRED', 'design-only must omit omd-hand, production, and browser-evidence; finish with a design handoff review');
  }
  if (!designOnly && (!strategy.roles.includes('omd-hand') || !strategy.stages.includes('production'))) {
    return failAdaptiveRoute('PRODUCTION_REQUIRED');
  }
  if (!strategy.roles.includes('omd-eye') || !strategy.stages.includes('independent-review')) {
    return failAdaptiveRoute('INDEPENDENT_REVIEW_REQUIRED');
  }
  if (!designOnly && !strategy.stages.includes('browser-evidence')) return failAdaptiveRoute('FINAL_EVIDENCE_REQUIRED');
  for (const stage of strategy.stages) {
    const known = ADAPTIVE_STAGE_IDS.find((candidate) => candidate === stage);
    if (known === undefined) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
    const owner = ADAPTIVE_STAGE_OWNERS[known];
    if (owner.startsWith('omd-') && !strategy.roles.includes(owner)) return failAdaptiveRoute('MODEL_OWNER_REQUIRED');
  }
}

export function validateOptionalStageAccounting(strategy: AdaptiveStrategyDecision): void {
  for (const stage of OPTIONAL_STAGE_IDS) {
    const included = strategy.stages.includes(stage);
    const skipped = strategy.skips.some((entry) => entry.id === stage);
    if (included && skipped) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', `stage ${stage} is both selected and skipped; remove its contradictory strategyDecision.skips entry`);
  }
  for (const method of OPTIONAL_METHOD_IDS) {
    const included = strategy.methods.includes(method);
    const skipped = strategy.skips.some((entry) => entry.id === method);
    if (included && skipped) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', `method ${method} is both selected and skipped; remove its contradictory strategyDecision.skips entry`);
  }
}

function validateReferenceWork(input: ValidatedAdaptiveRouteInput): void {
  const strategy = input.strategyDecision;
  validateRecommendation(strategy, input.referenceDiscovery.recommendation);
  if (input.referenceDiscovery.decision === 'discover') {
    const missing = [
      ...(!strategy.roles.includes('omd-scout') ? ['roles: omd-scout'] : []),
      ...(!strategy.stages.includes('scout') ? ['stages: scout'] : []),
      ...['reference-discovery', 'parallel-reference-acquisition'].filter(id => !strategy.methods.includes(id)).map(id => `methods: ${id}`),
    ];
    if (missing.length) {
      return failAdaptiveRoute('REFERENCE_WORK_MISMATCH', `referenceDiscovery requires ${missing.join('; ')} in strategyDecision. Keep discovery selected; parallel-reference-acquisition also requires selected Scout and Writer in the same execution wave. Adding moodboard, acquisition, reference-selection or reference-assembly does not replace this method`);
    }
  } else if (strategy.methods.includes('reference-discovery') || strategy.methods.includes('reference-distance')) {
    return failAdaptiveRoute('REFERENCE_WORK_MISMATCH', 'referenceDiscovery is skipped but strategyDecision.methods selects reference-discovery or reference-distance; reconcile with actual evidence, not a fabricated discovery skip');
  }
}

function validateSafety(input: ValidatedAdaptiveRouteInput): void {
  if (input.designAxes.axes.failureRisk !== 'high') return;
  if (input.uxPolicy.enforcedRailIds.length === 0) {
    return failAdaptiveRoute('SAFETY_WORK_REQUIRED', 'high failureRisk requires an enforced uxPolicy hard_safety_rail, stage safety-validation (owner omd-writer), and methods design-strategy-safety-recovery and rigorous-task-accessibility-validation; inspect omd brief safety-validation --json; do not lower risk to bypass safety');
  }
}

function validateContextMethods(input: ValidatedAdaptiveRouteInput): void {
  const strategy = input.strategyDecision;
  if (strategy.methods.includes('copy-repair-workflow')
    && (!strategy.roles.includes('omd-writer') || !strategy.stages.includes('copy'))) {
    return failAdaptiveRoute('COPY_REPAIR_WORKFLOW_INVALID');
  }
  if (strategy.methods.includes('image-first-draft')
    && (!strategy.roles.includes('omd-composer') || !strategy.stages.includes('composition'))) {
    return failAdaptiveRoute('REQUIRED_METHOD_MISSING');
  }
  const required = ['evidence-claim-accounting'];
  if (input.evidenceClaims.claims.some((claim) => claim.status === 'hypothesis')) {
    required.push('hypothesis-validation');
  }
  required.push(input.deliveryMode === 'design-only' ? 'design-handoff-review' : input.browserDecisionContext.status === 'pending'
    ? 'decision-linked-browser-observation'
    : 'reuse-linked-browser-evidence');
  if (input.validatedLearningContext.status === 'promoted') {
    for (const learningId of input.validatedLearningContext.learningIds) required.push(`validated-learning:${learningId}`);
  }
  const missing = required.filter(id => !strategy.methods.includes(id));
  if (missing.length) return failAdaptiveRoute('REQUIRED_METHOD_MISSING', `strategyDecision.methods must include ${missing.join(', ')}; these follow from the current claims, delivery mode, browser and learning contexts`);
}

function requiresTaskFlowBenchmark(
  input: ValidatedAdaptiveRouteInput,
): boolean {
  return (
    input.projectMode === 'greenfield' &&
    input.referenceDiscovery.taskNeed === 'new-product'
  );
}

function validateTaskFlowBenchmarkRoute(
  input: ValidatedAdaptiveRouteInput,
): void {
  if (!requiresTaskFlowBenchmark(input)) return;
  for (const stage of [
    'scout',
    'reference-board',
    'reference-selection',
    'composition',
    'candidate-generation',
  ] as const) {
    if (!input.strategyDecision.stages.includes(stage)) {
      failAdaptiveRoute('GREENFIELD_TASK_FLOW_STAGE_REQUIRED', `greenfield new-product requires selected stage ${stage}`);
    }
  }
  for (const role of ['omd-scout', 'omd-composer', 'omd-sketch'] as const) {
    if (!input.strategyDecision.roles.includes(role)) {
      failAdaptiveRoute('GREENFIELD_TASK_FLOW_ROLE_REQUIRED');
    }
  }
}

function validated(value: unknown, localeDesign?: LocaleDesignRoute): ValidatedAdaptiveRouteInput {
  const input: AdaptiveRouteInput = parseAdaptiveRouteInput(value);
  const parsedLocaleDesign = localeDesign === undefined ? undefined : parseLocaleDesignRoute(localeDesign);
  const sourceContract = adaptiveSourceContract(input, parsedLocaleDesign);
  return Object.freeze({
    ...input,
    sourceContract,
    taskOutcome: routeTaskOutcome(sourceContract.taskOutcome),
    uxPolicy: checkUxPolicy(sourceContract.uxPolicy),
    evidenceClaims: sourceContract.evidenceClaims,
    referenceDiscovery: routeReferenceDiscovery(sourceContract.referenceDiscovery),
    designAxes: routeDesignAxes(sourceContract.designAxes),
    modelCapability: routeModelCapabilityProbe(
      sourceContract.modelCapability.routingInput,
      sourceContract.modelCapability.now,
    ),
    ...(parsedLocaleDesign === undefined ? {} : { localeDesign: parsedLocaleDesign }),
  });
}

function validateLocaleDesignRoute(input: ValidatedAdaptiveRouteInput, marketJudgment?: VerifiedJudgment): void {
  const locale = input.localeDesign;
  if (locale === undefined) return;
  if (locale.decision === 'ask') return failAdaptiveRoute('LOCALE_DESIGN_CLARIFICATION_REQUIRED');
  const strategy = input.strategyDecision;
  if (locale.decision === 'research') {
    // Missing interpretation is an unspecified market, not a reason to refuse a build.
    // A submitted judgment, however, must genuinely authorize the asserted region.
    if (marketJudgment !== undefined && (!isVerifiedJudgment(marketJudgment)
      || !hasLocaleMarketAuthority(locale, input.evidenceClaims, marketJudgment)))
      return failAdaptiveRoute('LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED');
    return;
  }

}

type RouteCheck = (path: string, check: () => void) => void;

/** The same checks serve fail-fast publication and read-only, grouped diagnostics. */
function checkAdaptiveInput(
  input: ValidatedAdaptiveRouteInput,
  check: RouteCheck,
  authority?: Readonly<{ root: string; invocation: ProjectRunInvocation; marketJudgment?: VerifiedJudgment }>,
): void {
  const strategy = input.strategyDecision;
  check('strategyDecision', () => validateAdaptiveStrategyRails(strategy, input.deliveryMode));
  check('deliveryMode', () => { if (input.deliveryMode === 'design-only') {
    if (input.allowedPaths.length !== 1 || input.allowedPaths[0] !== '.omd/**' || input.namedDependencies.length > 0 || strategy.aiAssets.length > 0) {
      failAdaptiveRoute('DESIGN_ONLY_SCOPE_REQUIRED', 'design-only allows only .omd/** and no application dependencies or shipped assets');
    }
    const reviewWave = strategy.executionWaves.findIndex((wave) => wave.roles.includes('omd-eye'));
    if (reviewWave !== strategy.executionWaves.length - 1 || strategy.executionWaves[reviewWave]?.roles.length !== 1) {
      failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID', 'design handoff review must run after all design owners in its own final wave');
    }
  } });
  check('uxPolicy', () => validateSafety(input));
  check('strategyDecision.skips', () => validateOptionalStageAccounting(strategy));
  check('strategyDecision.aiAssets', () => validateAdaptiveAiAssetSelection(strategy, authority));





  check('localeDesign', () => validateLocaleDesignRoute(input, authority?.marketJudgment));
}

export type AdaptiveRouteDiagnostic = Readonly<{ path: string; code: string; message: string }>;

/** Never edits the input, publishes a route, creates authority, or relaxes a failed check. */
export function diagnoseAdaptiveRouteInput(value: unknown, localeDesign?: LocaleDesignRoute): readonly AdaptiveRouteDiagnostic[] {
  const diagnostics: AdaptiveRouteDiagnostic[] = [];
  const check: RouteCheck = (path, run) => {
    try { run(); } catch (error) {
      if (!(error instanceof Error)) throw error;
      const code = 'code' in error && typeof error.code === 'string'
        ? error.code
        : (error.message.split(':')[0] ?? 'MALFORMED_ADAPTIVE_ROUTE');
      // Unexpected exceptions are bugs, not model-repairable input diagnostics.
      if (!/^[A-Z][A-Z0-9_]+$/.test(code)) throw error;
      diagnostics.push({ path, code, message: error.message === code
        ? `${code}: ${path} has an invalid required shape or enum; run omd schema route-input for its field contract`
        : error.message });
    }
  };
  let input: ValidatedAdaptiveRouteInput | undefined;
  check('input', () => { input = validated(value, localeDesign); });
  if (input === undefined && typeof value === 'object' && value !== null && 'uxPolicy' in value) {
    const policyIssues = diagnoseUxPolicy(value.uxPolicy);
    if (policyIssues.length) {
      if (diagnostics[0]?.path === 'input' && policyIssues.some(issue => diagnostics[0]?.code === issue.code)) diagnostics.shift();
      diagnostics.push(...policyIssues);
    }
  }
  if (input === undefined && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const rawFields = value as Record<string, unknown>;
    const independent: readonly [string, (raw: unknown) => unknown][] = [
      ['taskOutcome', parseTaskOutcomeContract], ['evidenceClaims', parseEvidenceClaimPublication],
      ['referenceDiscovery', routeReferenceDiscovery], ['designAxes', parseDesignAxisInput],
      ['browserDecisionContext', parseAdaptiveBrowserContext], ['validatedLearningContext', parseAdaptiveLearningContext],
    ];
    for (const [path, parse] of independent) if (Object.hasOwn(rawFields, path)) check(path, () => { parse(rawFields[path]); });
    if (diagnostics.length > 1 && diagnostics[0]?.path === 'input'
      && diagnostics.slice(1).some(issue => issue.code === diagnostics[0]?.code)) diagnostics.shift();
  }
  if (input === undefined && typeof value === 'object' && value !== null && 'strategyDecision' in value) {
    const raw = value.strategyDecision;
    diagnostics.push(...diagnoseAdaptiveStrategyFields(raw));
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const strategy = raw as Record<string, unknown>;
      const lists = [strategy.roles, strategy.stages, strategy.methods];
      if (lists.every(list => Array.isArray(list) && list.every(item => typeof item === 'string'))
        && !diagnostics.some(d => d.path === 'strategyDecision.executionWaves')) {
        check('strategyDecision.executionWaves', () => validateAdaptiveExecutionWaves({
          roles: strategy.roles as string[], stages: strategy.stages as string[], methods: strategy.methods as string[],
          executionWaves: parseAdaptiveExecutionWaves(strategy.executionWaves),
        }, 'deliveryMode' in value && value.deliveryMode === 'design-only' ? 'design-only' : undefined));
      }
    }
  }
  if (input !== undefined) {
    const currentInput = input;
    checkAdaptiveInput(currentInput, check);
  }
  return diagnostics.filter((entry, index) => diagnostics.findIndex(other => other.path === entry.path && other.code === entry.code && other.message === entry.message) === index);
}

export function routeAdaptiveFlow(
  value: unknown,
  authority?: Readonly<{ root: string; invocation: ProjectRunInvocation; marketJudgment?: VerifiedJudgment }>,
  localeDesign?: LocaleDesignRoute,
): AdaptiveRouteRecord {
  const input = validated(value, localeDesign);
  const strategy = input.strategyDecision;
  checkAdaptiveInput(input, (_path, check) => check(), authority);

  const policyGates = [
    ...(input.referenceDiscovery.decision === 'discover'
      ? ['dual-reference-research']
      : []),
    ...(requiresTaskFlowBenchmark(input)
      ? ['greenfield-task-flow-benchmark']
      : []),
    ...(input.localeDesign === undefined
      ? []
      : [`locale-design:${input.localeDesign.decision}:${input.localeDesign.contextSha256}`]),
    ...input.uxPolicy.enforcedRailIds.map((id) => `hard-safety:${id}`),
    ...input.uxPolicy.requiredOutcomeIds.map((id) => `required-outcome:${id}`),
  ];
  return Object.freeze({
    schema: ADAPTIVE_ROUTE_RECORD_SCHEMA,
    ...(input.deliveryMode === undefined ? {} : { deliveryMode: input.deliveryMode }),
    route: 'adaptive',
    request: input.request,
    projectMode: input.projectMode,
    requiredOutcomes: input.taskOutcome.requiredOutcomes,
    prohibitedOutcomes: input.taskOutcome.prohibitedOutcomes,
    evidenceRequired: input.taskOutcome.evidenceRequired,
    selectedModel: input.modelCapability.selectedModel,
    sourceContract: input.sourceContract,
    sourceContractSha256: adaptiveSourceContractSha256(input.sourceContract),
    strategy,
    behavior: adaptiveBehaviorContract(strategy, input.designAxes.axes.expressiveDesignNeed),
    references: Object.freeze({ decision: input.referenceDiscovery.decision, ...input.referenceDiscovery.references }),
    claims: Object.freeze({ userFacts: input.evidenceClaims.userFacts, workingContext: input.evidenceClaims.workingContext }),
    browserDecisions: input.browserDecisionContext,
    validatedLearning: input.validatedLearningContext,
    gates: Object.freeze([...(input.deliveryMode === 'design-only'
      ? [...MANDATORY_ADAPTIVE_GATES.filter((gate) => gate !== 'source-seal' && gate !== 'final-evidence-v2'), 'design-handoff']
      : MANDATORY_ADAPTIVE_GATES), ...policyGates]),
    namedDependencies: input.namedDependencies,
    allowedPaths: input.allowedPaths,
    forbiddenWithoutRequest: FORBIDDEN_WITHOUT_REQUEST,
  });
}
