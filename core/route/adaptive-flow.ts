import { routeModelCapabilityProbe } from '../runtime/model-capability-profile.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { checkUxPolicy, type RecommendedMethodDecision } from '../ux/policy.ts';
import { parseAdaptiveRouteInput } from './adaptive-flow-boundary.ts';
import {
  ADAPTIVE_ROLE_IDS,
  ADAPTIVE_ROUTE_RECORD_SCHEMA,
  ADAPTIVE_STAGE_IDS,
  FORBIDDEN_WITHOUT_REQUEST,
  MANDATORY_ADAPTIVE_GATES,
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
import { adaptiveBehaviorContract } from './adaptive-behavior-contract.ts';
import { adaptiveMotionContract } from './adaptive-motion-ambition.ts';
import { validateAdaptiveAiAssetSelection } from './adaptive-ai-assets.ts';
import { requiredAttributionCategories, validateAttributionCoverage } from './adaptive-attribution.ts';

function requiredMethod(strategy: AdaptiveStrategyDecision, id: string): void {
  if (!strategy.methods.includes(id)) return failAdaptiveRoute('REQUIRED_METHOD_MISSING');
}

function validateRecommendation(strategy: AdaptiveStrategyDecision, value: RecommendedMethodDecision): void {
  const skipped = strategy.skips.some((entry) => entry.id === value.id);
  if (value.status === 'selected') {
    if (skipped || !strategy.methods.includes(value.id)) return failAdaptiveRoute('REQUIRED_METHOD_MISSING');
    return;
  }
  if (!skipped) return failAdaptiveRoute('OPTIONAL_SKIP_REASON_REQUIRED');
}

export function validateAdaptiveStrategyRails(strategy: AdaptiveStrategyDecision): void {
  for (const role of strategy.roles) {
    if (!ADAPTIVE_ROLE_IDS.includes(role as never)) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_ROLE');
  }
  for (const stage of strategy.stages) {
    if (!ADAPTIVE_STAGE_IDS.includes(stage as never)) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
  }
  const skipped = new Set(strategy.skips.map((entry) => entry.id));
  if (MANDATORY_ADAPTIVE_GATES.some((gate) => skipped.has(gate))) return failAdaptiveRoute('HARD_GATE_CANNOT_SKIP');
  if (!strategy.roles.includes('omd-hand') || !strategy.stages.includes('production')) {
    return failAdaptiveRoute('PRODUCTION_REQUIRED');
  }
  if (!strategy.roles.includes('omd-eye') || !strategy.stages.includes('independent-review')) {
    return failAdaptiveRoute('INDEPENDENT_REVIEW_REQUIRED');
  }
  const evidence = strategy.stages.indexOf('browser-evidence');
  const review = strategy.stages.indexOf('independent-review');
  const production = strategy.stages.indexOf('production');
  if (evidence < 0 || evidence !== strategy.stages.length - 2 || review !== strategy.stages.length - 1 || production >= evidence) {
    return failAdaptiveRoute('FINAL_EVIDENCE_REQUIRED');
  }
  validateAdaptiveStageOrder(strategy);
  for (const stage of strategy.stages) {
    const known = ADAPTIVE_STAGE_IDS.find((candidate) => candidate === stage);
    if (known === undefined) return failAdaptiveRoute('UNKNOWN_ADAPTIVE_STAGE');
    const owner = ADAPTIVE_STAGE_OWNERS[known];
    if (owner.startsWith('omd-') && !strategy.roles.includes(owner)) return failAdaptiveRoute('MODEL_OWNER_REQUIRED');
  }
  validateAdaptiveExecutionWaves(strategy);
}

export function validateOptionalStageAccounting(strategy: AdaptiveStrategyDecision): void {
  for (const stage of OPTIONAL_STAGE_IDS) {
    const included = strategy.stages.includes(stage);
    const skipped = strategy.skips.some((entry) => entry.id === stage);
    if (!included && !skipped) return failAdaptiveRoute('OPTIONAL_SKIP_REASON_REQUIRED');
    if (included && skipped) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  for (const method of OPTIONAL_METHOD_IDS) {
    const included = strategy.methods.includes(method);
    const skipped = strategy.skips.some((entry) => entry.id === method);
    if (!included && !skipped) return failAdaptiveRoute('OPTIONAL_SKIP_REASON_REQUIRED');
    if (included && skipped) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
}

function validateReferenceWork(input: ValidatedAdaptiveRouteInput): void {
  const strategy = input.strategyDecision;
  validateRecommendation(strategy, input.referenceDiscovery.recommendation);
  if (input.referenceDiscovery.decision === 'discover') {
    if (!strategy.roles.includes('omd-scout') || !strategy.stages.includes('scout')
      || !strategy.methods.includes('reference-discovery')
      || !strategy.methods.includes('parallel-reference-acquisition')) {
      return failAdaptiveRoute('REFERENCE_WORK_MISMATCH');
    }
  } else if (strategy.methods.includes('reference-discovery') || strategy.methods.includes('reference-distance')) {
    return failAdaptiveRoute('REFERENCE_WORK_MISMATCH');
  }
}

function validateSafety(input: ValidatedAdaptiveRouteInput): void {
  if (input.designAxes.axes.failureRisk !== 'high') return;
  if (input.uxPolicy.enforcedRailIds.length === 0
    || !input.strategyDecision.stages.includes('safety-validation')
    || !input.strategyDecision.methods.includes('design-strategy-safety-recovery')
    || !input.strategyDecision.methods.includes('rigorous-task-accessibility-validation')) {
    return failAdaptiveRoute('SAFETY_WORK_REQUIRED');
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
  requiredMethod(strategy, 'evidence-claim-accounting');
  if (input.evidenceClaims.claims.some((claim) => claim.status === 'hypothesis')) {
    requiredMethod(strategy, 'hypothesis-validation');
  }
  requiredMethod(strategy, input.browserDecisionContext.status === 'pending'
    ? 'decision-linked-browser-observation'
    : 'reuse-linked-browser-evidence');
  if (input.validatedLearningContext.status === 'promoted') {
    for (const learningId of input.validatedLearningContext.learningIds) requiredMethod(strategy, `validated-learning:${learningId}`);
  }
}

function validated(value: unknown): ValidatedAdaptiveRouteInput {
  const input: AdaptiveRouteInput = parseAdaptiveRouteInput(value);
  const sourceContract = adaptiveSourceContract(input);
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
  });
}

export function routeAdaptiveFlow(
  value: unknown,
  authority?: Readonly<{ root: string; invocation: ProjectRunInvocation }>,
): AdaptiveRouteRecord {
  const input = validated(value);
  const strategy = input.strategyDecision;
  validateAdaptiveStrategyRails(strategy);
  validateSafety(input);
  validateOptionalStageAccounting(strategy);
  validateAdaptiveAiAssetSelection(strategy, authority);
  adaptiveMotionContract(input.designAxes.axes.expressiveDesignNeed, strategy);
  validateAttributionCoverage(strategy.attributionCategories, requiredAttributionCategories(strategy));
  validateReferenceWork(input);
  validateRecommendation(strategy, input.designAxes.strategy.recommendation);
  validateRecommendation(strategy, input.modelCapability.recommendation);
  for (const card of input.modelCapability.supportCards) validateRecommendation(strategy, card.recommendation);
  for (const recommendation of input.uxPolicy.recommendations) validateRecommendation(strategy, {
    id: recommendation.id, kind: 'recommended_method', status: recommendation.status, reason: recommendation.reason,
  });
  validateContextMethods(input);

  const policyGates = [
    ...input.uxPolicy.enforcedRailIds.map((id) => `hard-safety:${id}`),
    ...input.uxPolicy.requiredOutcomeIds.map((id) => `required-outcome:${id}`),
  ];
  return Object.freeze({
    schema: ADAPTIVE_ROUTE_RECORD_SCHEMA,
    route: 'adaptive',
    request: input.request,
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
    gates: Object.freeze([...MANDATORY_ADAPTIVE_GATES, ...policyGates]),
    namedDependencies: input.namedDependencies,
    allowedPaths: input.allowedPaths,
    forbiddenWithoutRequest: FORBIDDEN_WITHOUT_REQUEST,
  });
}
