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
  AdaptiveRouteError,
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
import { adaptiveStageOwners, validateAdaptiveStageOrder } from './adaptive-stage-graph.ts';
import { validateAdaptiveExecutionWaves } from './adaptive-execution-waves.ts';
import { parseAdaptiveExecutionWaves } from './adaptive-execution-wave-boundary.ts';
import { adaptiveBehaviorContract } from './adaptive-behavior-contract.ts';
import { adaptiveMotionContract } from './adaptive-motion-ambition.ts';
import { validateAdaptiveAiAssetSelection } from './adaptive-ai-assets.ts';
import { requiredAttributionCategories, validateAttributionCoverage } from './adaptive-attribution.ts';
import { parseLocaleDesignRoute, type LocaleDesignRoute } from '../locale/design-context.ts';
import { hasLocaleMarketAuthority, requirePersistedMarketAuthority } from './locale-market-authority.ts';
import { diagnoseUxPolicy } from '../ux/policy.ts';
import { parseTaskOutcomeContract } from '../brief/task-outcome.ts';
import { parseEvidenceClaimPublication } from '../brief/evidence-claims.ts';
import { parseDesignAxisInput } from './design-axis-routing.ts';
import { parseAdaptiveBrowserContext, parseAdaptiveLearningContext } from './adaptive-flow-boundary.ts';
import { isVerifiedJudgment, verifiedJudgmentReceipt, type VerifiedJudgment } from '../judgment/index.ts';
import { publishedRouteLearning } from './adaptive-learning.ts';
import { verifyDirectionAutonomyGrant } from '../brief/candidate-authority.ts';
import { verifyReviewPurposeAuthority } from './review-purpose-authority.ts';
import { bindNativeDesignRouteInput } from './native-design-policy.ts';
import { isModelLedProcess } from './process-policy.ts';
import { getNativePiRun, isNativePiInvocation } from '../runtime/native-pi-run.ts';

function validateRecommendation(strategy: AdaptiveStrategyDecision, value: RecommendedMethodDecision): void {
  const skipped = strategy.skips.some((entry) => entry.id === value.id);
  if (value.status === 'selected') {
    if (skipped || !strategy.methods.includes(value.id)) return failAdaptiveRoute('REQUIRED_METHOD_MISSING', `selected method ${value.id} must appear in strategyDecision.methods and must not also appear in skips`);
    return;
  }
  if (!skipped) return failAdaptiveRoute('OPTIONAL_SKIP_REASON_REQUIRED', `skipped recommendation ${value.id} needs a non-empty strategyDecision.skips reason`);
}

export function validateAdaptiveStrategyRails(strategy: AdaptiveStrategyDecision, deliveryMode?: 'design-only', currentProcess = false): void {
  if (currentProcess) {
    if (strategy.stages.includes('candidate-generation') !== strategy.methods.includes('concept-exploration')) {
      return failAdaptiveRoute('REQUIRED_METHOD_MISSING', 'candidate-generation and concept-exploration must be selected together');
    }
    if (strategy.stages.includes('candidate-generation') && !strategy.roles.includes('omd-sketch')) return failAdaptiveRoute('MODEL_OWNER_REQUIRED', 'Sketch exclusively owns each candidate source');
  } else if (strategy.methods.includes('concept-exploration') || strategy.roles.includes('omd-art-director')) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', 'early concepts require processPolicy human-design-process-v1; migrate using the unchanged original request');
  }
  for (const role of strategy.roles) {
    if (!ADAPTIVE_ROLE_IDS.includes(role as never)) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_ROLE', `unknown role ${role}; allowed: ${ADAPTIVE_ROLE_IDS.join(', ')}`);
  }
  const requiredRoles = new Set<string>();
  for (const stage of strategy.stages) {
    if (!ADAPTIVE_STAGE_IDS.includes(stage as never)) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE', `unknown stage ${stage}; allowed: ${ADAPTIVE_STAGE_IDS.join(', ')}`);
  }
  // A study makes provisional material for the selected design owners; it owns no stage publication.
  if (strategy.roles.includes('omd-study')
    && ((!strategy.methods.includes('provisional-source-study') && !strategy.stages.includes('art-direction'))
      || !strategy.stages.includes('composition'))) {
    return failAdaptiveRoute('REQUIRED_METHOD_MISSING', 'omd-study requires composition; studies without provisional-source-study also require art-direction');
  }
  if (strategy.methods.includes('provisional-source-study')
    && (!strategy.roles.includes('omd-study')
      || ['reference-selection', 'composition'].some(stage => !strategy.stages.includes(stage)))) {
    return failAdaptiveRoute('REQUIRED_METHOD_MISSING', 'provisional-source-study requires omd-study, reference-selection and composition');
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
  if (currentProcess) {
    const evidence = strategy.stages.indexOf('browser-evidence');
    const review = strategy.stages.indexOf('independent-review');
    const production = strategy.stages.indexOf('production');
    if (review !== strategy.stages.length - 1 || (!designOnly && (evidence < 0 || evidence !== strategy.stages.length - 2 || production >= evidence))) {
      return failAdaptiveRoute('FINAL_EVIDENCE_REQUIRED', designOnly
        ? 'independent-review must be the final strategyDecision.stages entry'
        : 'strategyDecision.stages must end with browser-evidence, independent-review, after production; final-evidence-v2 is a gate, not a stage');
    }
  }
  for (const stage of strategy.stages) {
    const known = ADAPTIVE_STAGE_IDS.find((candidate) => candidate === stage);
    if (known === undefined) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
    const owner = adaptiveStageOwners(currentProcess)[known];
    if (owner.startsWith('omd-') && !strategy.roles.includes(owner)) requiredRoles.add(owner);
  }
  if (requiredRoles.size > 0) throw new AdaptiveRouteError('MODEL_OWNER_REQUIRED',
    `Add the missing selected-stage owners to strategyDecision.roles and executionWaves: ${[...requiredRoles].join(', ')}. Preserve selected stages; removing them is not this repair.`,
    [...requiredRoles]);
  validateAdaptiveStageOrder(strategy, deliveryMode, currentProcess);
  validateAdaptiveExecutionWaves(strategy, deliveryMode, currentProcess);
}

export function validateOptionalStageAccounting(strategy: AdaptiveStrategyDecision, currentProcess = false): void {
  for (const stage of OPTIONAL_STAGE_IDS) {
    const included = strategy.stages.includes(stage);
    const skipped = strategy.skips.some((entry) => entry.id === stage);
    if (included && skipped) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', `stage ${stage} is both selected and skipped; remove its contradictory strategyDecision.skips entry`);
  }
  for (const method of OPTIONAL_METHOD_IDS) {
    if (method === 'concept-exploration' && !currentProcess) continue;
    const included = strategy.methods.includes(method);
    const skipped = strategy.skips.some((entry) => entry.id === method);
    if (included && skipped) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', `method ${method} is both selected and skipped; remove its contradictory strategyDecision.skips entry`);
  }
}

function validateReferenceWork(input: ValidatedAdaptiveRouteInput): void {
  const strategy = input.strategyDecision;
  if (input.referenceDiscovery.decision === 'discover') {
    const missing = [
      ...(!strategy.roles.includes('omd-scout') ? ['roles: omd-scout'] : []),
      ...(!strategy.stages.includes('scout') ? ['stages: scout'] : []),
      ...['reference-discovery'].filter(id => !strategy.methods.includes(id)).map(id => `methods: ${id}`),
    ];
    if (missing.length) {
      return failAdaptiveRoute('REFERENCE_WORK_MISMATCH', `referenceDiscovery requires ${missing.join('; ')} in strategyDecision. Keep discovery selected; parallel-reference-acquisition also requires selected Scout and Writer in the same execution wave. Adding moodboard, acquisition, reference-selection or reference-assembly does not replace this method`);
    }
  } else if (strategy.methods.includes('reference-discovery')) {
    return failAdaptiveRoute('REFERENCE_WORK_MISMATCH', 'referenceDiscovery is skipped but strategyDecision.methods selects reference-discovery; reconcile with actual evidence, not a fabricated discovery skip');
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

}

function requiresTaskFlowBenchmark(
  input: ValidatedAdaptiveRouteInput,
): boolean {
  return (
    !isModelLedProcess(input) &&
    input.projectMode === 'greenfield' &&
    input.referenceDiscovery.taskNeed === 'new-product'
  );
}

function validateTaskFlowBenchmarkRoute(
  input: ValidatedAdaptiveRouteInput,
): void {
  if (!requiresTaskFlowBenchmark(input)) return;
  // Selection assigns owners, not an infinite acquisition prerequisite. Entry keeps a current
  // minimal composition; Scout/selection/candidate evidence can yield as typed confidence debt.
  // Terminal product/browser/review gates remain selected and cannot be paid with that debt.
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
    referenceDiscovery: routeReferenceDiscovery(isModelLedProcess(sourceContract)
      && !input.strategyDecision.stages.some(stage => ['scout', 'acquisition', 'reference-board'].includes(stage))
      && !input.strategyDecision.methods.includes('reference-discovery')
      ? { ...sourceContract.referenceDiscovery, skipReason: 'Reference-discovery method not selected for this model-led pass; no external-reference or fidelity claim is authorized.' }
      : sourceContract.referenceDiscovery),
    designAxes: routeDesignAxes(sourceContract.designAxes),
    modelCapability: routeModelCapabilityProbe(
      sourceContract.modelCapability.routingInput,
      sourceContract.modelCapability.now,
    ),
    ...(parsedLocaleDesign === undefined ? {} : { localeDesign: parsedLocaleDesign }),
  });
}

function validateLocaleDesignRoute(input: ValidatedAdaptiveRouteInput, marketJudgment?: VerifiedJudgment, requireMarketAuthority = false): void {
  const locale = input.localeDesign;
  if (locale === undefined) return;
  if (locale.decision === 'ask') return failAdaptiveRoute('LOCALE_DESIGN_CLARIFICATION_REQUIRED');
  const strategy = input.strategyDecision;
  if (locale.decision === 'research' && (requireMarketAuthority || marketJudgment !== undefined)) {
    if (!isVerifiedJudgment(marketJudgment)
      || !hasLocaleMarketAuthority(locale, input.evidenceClaims, marketJudgment)) {
      return failAdaptiveRoute('LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED',
        'Publish a current target-market judgment from the authenticated request, or select mechanics-only grounding and withhold market-fit claims; no design interview is required.');
    }
    return;
  }

}

type RouteCheck = (path: string, check: () => void) => void;

/** The same checks serve fail-fast publication and read-only, grouped diagnostics. */
function checkAdaptiveInput(
  input: ValidatedAdaptiveRouteInput,
  check: RouteCheck,
  authority?: Readonly<{ root: string; invocation: ProjectRunInvocation; marketJudgment?: VerifiedJudgment }>,
  replay = false,
): void {
  const strategy = input.strategyDecision;
  check('strategyDecision', () => validateOptionalStageAccounting(strategy, input.processPolicy !== undefined));
  check('referenceDiscovery', () => validateReferenceWork(input));
  check('uxPolicy', () => validateSafety(input));
  check('strategyDecision.methods', () => validateContextMethods(input));
  if (authority && input.processPolicy?.interactionMode === 'autonomous') check('processPolicy.autonomyGrant', () => {
    try {
      const grant = verifyDirectionAutonomyGrant(authority.root, input.processPolicy!.autonomyGrant!, input.request);
      if (isModelLedProcess(input)
        && (grant.source !== 'native-host-policy' || !isNativePiInvocation(authority.invocation)
          || getNativePiRun(authority.invocation, authority.root).designPolicy?.criteriaVersion !== 'model-led-design-v1'
          || input.reviewPurpose !== 'ordinary')) {
        failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', 'model-led execution requires the matching native host policy and ordinary review purpose');
      }
    }
    catch (error) { failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', error instanceof Error ? error.message : String(error)); }
  });
  const reviewPurpose = input.reviewPurpose;
  if (reviewPurpose !== undefined) check('reviewPurposeAuthority', () => {
    const receipt = input.reviewPurposeAuthority ?? null;
    if (receipt === null && authority !== undefined) {
      failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', `${reviewPurpose} review requires an actual host/user purpose origin receipt`);
    }
    if ((reviewPurpose === 'benchmark' || reviewPurpose === 'release') && receipt === null) {
      failAdaptiveRoute('ROUTE_AUTHORITY_REQUIRED', `${reviewPurpose} review requires an actual host/user purpose origin receipt`);
    }
    // Read-only ordinary-purpose validation may inspect an unmaterialized starter. Publication and
    // persisted replay always supply project authority and therefore require and verify the origin.
    if (receipt !== null && authority !== undefined) {
      verifyReviewPurposeAuthority(authority.root, receipt, reviewPurpose, input.request);
    }
  });
  check('strategyDecision.stages', () => {
    if (strategy.stages.includes('reference-board')) {
      validateAdaptiveStageOrder({
        ...strategy,
        stages: strategy.stages.filter(stage => ['domain', 'frame', 'acquisition', 'scout', 'reference-board'].includes(stage)),
      }, input.deliveryMode, input.processPolicy !== undefined);
    }
  });
  check('strategyDecision', () => validateAdaptiveStrategyRails(strategy, input.deliveryMode, input.processPolicy !== undefined));
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
  check('strategyDecision.skips', () => validateOptionalStageAccounting(strategy, input.processPolicy !== undefined));
  check('strategyDecision.aiAssets', () => validateAdaptiveAiAssetSelection(strategy, authority));





  check('localeDesign', () => validateLocaleDesignRoute(input, authority?.marketJudgment, authority !== undefined && !replay));
}

export type AdaptiveRouteDiagnostic = Readonly<{ path: string; code: string; message: string; requiredRoles?: readonly string[] }>;

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
      if (code === 'CONTRADICTORY_DESIGN_AXIS_STATE') {
        diagnostics.push({ path: 'designAxes.uxNeed', code,
          message: `${code}: failureRisk=high requires uxNeed=rigorous; preserve the risk assessment and set designAxes.uxNeed to rigorous.` });
        return;
      }
      diagnostics.push({ path, code, ...(error instanceof AdaptiveRouteError && error.requiredRoles !== undefined
        ? { requiredRoles: error.requiredRoles } : {}), message: error.message === code
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
    const policy = Reflect.get(value, 'processPolicy');
    diagnostics.push(...diagnoseAdaptiveStrategyFields(raw, typeof policy === 'object' && policy !== null
      && Reflect.get(policy, 'schema') === 'model-led-design-process-v1'));
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
  options: Readonly<{ replay?: boolean }> = {},
): AdaptiveRouteRecord {
  const bound = authority && !options.replay ? bindNativeDesignRouteInput(authority.root, authority.invocation, value) : value;
  const input = validated(bound, localeDesign);
  const strategy = input.strategyDecision;
  checkAdaptiveInput(input, (_path, check) => check(), authority, options.replay ?? false);
  const marketAuthority = input.localeDesign?.decision === 'research' && authority?.marketJudgment
    ? verifiedJudgmentReceipt(authority.marketJudgment) : undefined;
  if (authority && !options.replay && input.localeDesign?.decision === 'research' && !marketAuthority) {
    return failAdaptiveRoute('LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED', 'Publish the verified market judgment before binding the route.');
  }
  if (authority && !options.replay && input.localeDesign?.decision === 'research') {
    requirePersistedMarketAuthority(authority.root, marketAuthority, input.request,
      input.localeDesign, input.sourceContract.evidenceClaims);
  }

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
    ...(marketAuthority === undefined ? {} : { marketAuthority }),
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
    behavior: adaptiveBehaviorContract(strategy, input.designAxes.axes.expressiveDesignNeed,
      input.reviewPurpose === undefined ? 'legacy' : 'recorded-browse'),
    references: Object.freeze({ decision: input.referenceDiscovery.decision, ...input.referenceDiscovery.references }),
    claims: Object.freeze({ userFacts: input.evidenceClaims.userFacts, workingContext: input.evidenceClaims.workingContext }),
    browserDecisions: input.browserDecisionContext,
    validatedLearning: authority !== undefined && !options.replay
      ? publishedRouteLearning(authority.root, input.sourceContract.learningScope) : input.validatedLearningContext,
    gates: Object.freeze([...(input.deliveryMode === 'design-only'
      ? [...MANDATORY_ADAPTIVE_GATES.filter((gate) => gate !== 'source-seal' && gate !== 'final-evidence-v2'), 'design-handoff']
      : MANDATORY_ADAPTIVE_GATES), ...policyGates]),
    namedDependencies: input.namedDependencies,
    allowedPaths: input.allowedPaths,
    forbiddenWithoutRequest: FORBIDDEN_WITHOUT_REQUEST,
  });
}
