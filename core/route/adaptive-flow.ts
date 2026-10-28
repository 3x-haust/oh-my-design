import { routeModelCapabilityProbe } from '../runtime/model-capability-profile.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { checkUxPolicy } from '../ux/policy.ts';
import { diagnoseAdaptiveStrategyFields, parseAdaptiveRouteInput } from './adaptive-flow-boundary.ts';
import {
  ADAPTIVE_ROUTE_RECORD_SCHEMA,
  FORBIDDEN_WITHOUT_REQUEST,
  MANDATORY_ADAPTIVE_GATES,
  AdaptiveRouteError,
  failAdaptiveRoute,
  type AdaptiveRouteInput,
  type AdaptiveRouteRecord,
  type AdaptiveStrategyDecision,
  type ValidatedAdaptiveRouteInput,
  MODEL_LED_STRATEGY_DECISION,
} from './adaptive-flow-domain.ts';
import { routeDesignAxes } from './design-axis-routing.ts';
import { routeReferenceDiscovery } from '../ref/reference-discovery-routing.ts';
import { routeTaskOutcome } from './task-outcome-routing.ts';
import { adaptiveSourceContract, adaptiveSourceContractSha256 } from './adaptive-source-contract.ts';
import { validateAdaptiveExecutionWaves } from './adaptive-execution-waves.ts';
import { parseAdaptiveExecutionWaves } from './adaptive-execution-wave-boundary.ts';
import { adaptiveBehaviorContract } from './adaptive-behavior-contract.ts';
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

export function validateAdaptiveStrategyRails(strategy: AdaptiveStrategyDecision, deliveryMode?: 'design-only', currentProcess = false): void {
  if (deliveryMode !== undefined
    || JSON.stringify(strategy) !== JSON.stringify(MODEL_LED_STRATEGY_DECISION)) {
    failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE', 'only the canonical model-led production strategy is supported');
  }
}

function validateReferenceWork(input: ValidatedAdaptiveRouteInput): void {
  if (!['discover', 'skip'].includes(input.referenceDiscovery.decision)) failAdaptiveRoute('REFERENCE_WORK_MISMATCH');
}

function validateSafety(input: ValidatedAdaptiveRouteInput): void {
  if (input.designAxes.axes.failureRisk !== 'high') return;
  if (input.uxPolicy.enforcedRailIds.length === 0) {
    return failAdaptiveRoute('SAFETY_WORK_REQUIRED', 'high failureRisk requires an enforced uxPolicy hard_safety_rail; do not lower risk to bypass safety');
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
  check('referenceDiscovery', () => validateReferenceWork(input));
  check('uxPolicy', () => validateSafety(input));
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
  check('strategyDecision', () => validateAdaptiveStrategyRails(strategy, input.deliveryMode, input.processPolicy !== undefined));
  check('deliveryMode', () => { if (input.deliveryMode !== undefined) failAdaptiveRoute('DESIGN_ONLY_SCOPE_REQUIRED'); });
  check('uxPolicy', () => validateSafety(input));





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
