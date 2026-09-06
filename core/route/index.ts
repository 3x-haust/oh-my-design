export {
  routeTaskOutcome,
  type TaskOutcomeRouting,
} from './task-outcome-routing.ts';

export {
  MODEL_CAPABILITY_PROBE_RESULT_INPUT_SCHEMA,
  MODEL_CAPABILITY_PROBE_ROUTING_INPUT_SCHEMA,
  MODEL_CAPABILITY_PROBE_ROUTING_SCHEMA,
  MODEL_CAPABILITY_PROFILE_SCHEMA,
  REPEATED_RELEVANT_FAILURE_COUNT,
  ModelCapabilityProfileError,
  applyModelCapabilityProbeResult,
  parseModelCapabilityProfile,
  routeModelCapabilityProbe,
  type ModelCapability,
  type ModelCapabilityFailure,
  type ModelCapabilityFailureKind,
  type ModelCapabilityObservation,
  type ModelCapabilityProbeDecision,
  type ModelCapabilityProbeReason,
  type ModelCapabilityProbeRouting,
  type ModelCapabilityProfile,
  type ModelCapabilityProfileErrorCode,
  type ModelCapabilityStatus,
  type ModelCapabilitySupportCard,
  type ModelSupportNeed,
  type SelectedModelIdentity,
} from '../runtime/model-capability-profile.ts';

export {
  DESIGN_AXIS_INPUT_SCHEMA,
  DESIGN_AXIS_ROUTING_SCHEMA,
  DesignAxisRoutingError,
  parseDesignAxisInput,
  routeDesignAxes,
  type DesignAxisInput,
  type DesignAxisRouting,
  type DesignAxisRoutingErrorCode,
  type DesignStrategyMethod,
  type ExpressiveDesignNeed,
  type ExpressiveDirectionStrategy,
  type FailureHandlingStrategy,
  type FailureRisk,
  type TaskExecutionStrategy,
  type TaskSize,
  type UxNeed,
  type UxRigorStrategy,
} from './design-axis-routing.ts';

export {
  REFERENCE_DISCOVERY_INPUT_SCHEMA,
  REFERENCE_DISCOVERY_ROUTING_SCHEMA,
  ReferenceDiscoveryRoutingError,
  routeReferenceDiscovery,
  type ReferenceDiscoveryActualUse,
  type ReferenceDiscoveryDecision,
  type ReferenceDiscoveryEvidence,
  type ReferenceDiscoveryInput,
  type ReferenceDiscoveryRouting,
  type ReferenceDiscoveryRoutingErrorCode,
  type ReferenceDiscoveryTaskNeed,
  type ReferenceDiscoveryUncertainty,
} from '../ref/reference-discovery-routing.ts';

export {
  ADAPTIVE_BROWSER_CONTEXT_SCHEMA,
  ADAPTIVE_LEARNING_CONTEXT_SCHEMA,
  ADAPTIVE_ROLE_IDS,
  ADAPTIVE_ROUTE_INPUT_KEYS,
  ADAPTIVE_ROUTE_INPUT_SCHEMA,
  ADAPTIVE_ROUTE_RECORD_SCHEMA,
  ADAPTIVE_SOURCE_CONTRACT_SCHEMA,
  ADAPTIVE_STAGE_IDS,
  ADAPTIVE_STRATEGY_DECISION_SCHEMA,
  FORBIDDEN_WITHOUT_REQUEST,
  MANDATORY_ADAPTIVE_GATES,
  OPTIONAL_METHOD_IDS,
  OPTIONAL_STAGE_IDS,
  AdaptiveRouteError,
  type AdaptiveBrowserDecisionContext,
  type AdaptiveExecutionWave,
  type AdaptiveLearningContext,
  type AdaptiveRouteErrorCode,
  type AdaptiveRouteInput,
  type AdaptiveRouteRecord,
  type AdaptiveSourceContract,
  type AdaptiveSkip,
  type AdaptiveStrategyDecision,
} from './adaptive-flow-domain.ts';
export { parseAdaptiveRouteInput } from './adaptive-flow-boundary.ts';
export {
  canonicalLocaleDesignJson,
  localeDesignContextSha256,
  localeDesignRouteFindings,
  parseLocaleDesignContext,
  parseLocaleDesignRoute,
  routeLocaleDesignContext,
  type LocaleDesignContext,
  type LocaleDesignRoute,
} from '../locale/design-context.ts';
export {
  ADAPTIVE_BEHAVIOR_POLICY,
  ADAPTIVE_BEHAVIOR_SCHEMA,
  adaptiveBehaviorContract,
  type AdaptiveBehaviorContract,
} from './adaptive-behavior-contract.ts';
export { validateAdaptiveExecutionWaves } from './adaptive-execution-waves.ts';
export {
  COPY_REPAIR_WORKFLOW,
  validateCopyRepairWorkflow,
  type CopyRepairStep,
} from './adaptive-copy-repair.ts';
export {
  adaptiveMotionContract,
  type AdaptiveMotionContract,
  type MotionAmbition,
} from './adaptive-motion-ambition.ts';
export {
  ADAPTIVE_ATTRIBUTION_CATEGORIES,
  requiredAttributionCategories,
  validateAttributionCoverage,
  type AdaptiveAttributionCategory,
} from './adaptive-attribution.ts';
export {
  AI_ASSET_DECISION_AUTHORITY_SCHEMA,
  AI_ASSET_DECISION_RECORD_SCHEMA,
  AI_ASSET_DECISION_REFERENCE_SCHEMA,
  AiAssetDecisionError,
  aiAssetDecisionAuthorityBytes,
  commitAiAssetDecision,
  requireCommittedAiAssetDecision,
  type AiAssetDecisionBinding,
  type AiAssetDecisionInput,
  type AiAssetDecisionRecord,
  type AiAssetDecisionReference,
} from '../asset-sourcing/ai-decision.ts';
export { routeAdaptiveFlow, validateAdaptiveStrategyRails } from './adaptive-flow.ts';
export {
  adaptiveRefinementCheckpoint,
  adaptiveRefinementDisposition,
  type AdaptiveRefinementCheckpoint,
  type AdaptiveRefinementDisposition,
  type RequiredGateStatus,
} from './adaptive-refinement.ts';
export {
  ADAPTIVE_STAGE_GRAPH,
  ADAPTIVE_STAGE_OWNERS,
  validateAdaptiveStageGraph,
  validateAdaptiveStageOrder,
  type AdaptiveStageGraph,
  type AdaptiveStageId,
  type AdaptiveStageNode,
} from './adaptive-stage-graph.ts';
export { parseRouteRecord, pathsOutsideScope } from './adaptive-route-record.ts';
export {
  ADAPTIVE_ROUTE_SCOPE_EVIDENCE_SCHEMA,
  ADAPTIVE_ROUTE_SCOPE_POINTER_SCHEMA,
  AdaptiveRouteScopeError,
  changedPathsForAdaptiveRoute,
} from './adaptive-route-scope.ts';
export {
  ADAPTIVE_ROUTE_AUTHORITY_SCHEMA,
  adaptiveRouteAuthority,
  adaptiveRouteAuthorityBytes,
  adaptiveRouteAuthorityPath,
  type AdaptiveRouteAuthority,
} from './adaptive-route-authority.ts';
export {
  ADAPTIVE_ROUTE_POINTER_SCHEMA,
  ADAPTIVE_ROUTE_SOURCE_POINTER_SCHEMA,
  adaptiveRouteRecordSha256,
  publishAdaptiveRoute,
  readPersistedRoute,
} from './adaptive-route-persistence.ts';

import { ADAPTIVE_ROUTE_INPUT_KEYS, ADAPTIVE_ROUTE_INPUT_SCHEMA } from './adaptive-flow-domain.ts';
import { parseAdaptiveRouteInput } from './adaptive-flow-boundary.ts';
import { routeAdaptiveFlow } from './adaptive-flow.ts';

/** Backward command names now point at the adaptive typed-contract route. */
export const ROUTE_INPUT_SCHEMA = ADAPTIVE_ROUTE_INPUT_SCHEMA;
export const ROUTE_INPUT_KEYS = ADAPTIVE_ROUTE_INPUT_KEYS;
export const validateRouteInput = parseAdaptiveRouteInput;
export const classifyRoute = routeAdaptiveFlow;
export const routeRecord = routeAdaptiveFlow;
export type RouteInput = import('./adaptive-flow-domain.ts').AdaptiveRouteInput;
export type RouteRecord = import('./adaptive-flow-domain.ts').AdaptiveRouteRecord;
