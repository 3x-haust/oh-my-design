import type { EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import type { TaskOutcomeContract } from '../brief/task-outcome.ts';
import type { TaskOutcomeRouting } from './task-outcome-routing.ts';
import type { DesignAxisInput, DesignAxisRouting } from './design-axis-routing.ts';
import type { ReferenceDiscoveryInput, ReferenceDiscoveryRouting } from '../ref/reference-discovery-routing.ts';
import type { ModelCapabilityProbeRouting, ModelCapabilityRoutingSource, SelectedModelIdentity } from '../runtime/model-capability-profile.ts';
import type { UxPolicy, UxPolicyCheck } from '../ux/policy.ts';
import type { AdaptiveBehaviorContract } from './adaptive-behavior-contract.ts';
import type { AdaptiveAiAsset } from './adaptive-ai-assets.ts';
import type { AdaptiveAttributionCategory } from './adaptive-attribution.ts';
import type { LocaleDesignRoute } from '../locale/design-context.ts';

export const ADAPTIVE_ROUTE_INPUT_SCHEMA = 'adaptive-design-route-input-v1' as const;
export const ADAPTIVE_ROUTE_RECORD_SCHEMA = 'adaptive-design-route-v1' as const;
export const ADAPTIVE_STRATEGY_DECISION_SCHEMA = 'adaptive-strategy-decision-v1' as const;
export const ADAPTIVE_BROWSER_CONTEXT_SCHEMA = 'adaptive-browser-decision-context-v1' as const;
export const ADAPTIVE_LEARNING_CONTEXT_SCHEMA = 'adaptive-learning-context-v1' as const;
export const ADAPTIVE_SOURCE_CONTRACT_SCHEMA = 'adaptive-route-source-contract-v1' as const;

export const ADAPTIVE_ROUTE_INPUT_KEYS = [
  'schema', 'request', 'projectMode', 'namedDependencies', 'allowedPaths', 'taskOutcome', 'uxPolicy',
  'evidenceClaims', 'referenceDiscovery', 'designAxes', 'modelCapability',
  'browserDecisionContext', 'validatedLearningContext', 'strategyDecision',
] as const;

export const MANDATORY_ADAPTIVE_GATES = Object.freeze([
  'scope-lock',
  'required-outcomes',
  'project-write-boundary',
  'activation',
  'source-seal',
  'final-evidence-v2',
  'independent-review',
  'user-selected-model-ownership',
] as const);

export const OPTIONAL_STAGE_IDS = Object.freeze([
  'domain', 'depth', 'frame', 'content-grain', 'acquisition', 'scout', 'reference-board',
  'reference-selection', 'art-direction', 'copy', 'type-proof', 'composition',
  'candidate-generation', 'safety-validation',
] as const);
export const OPTIONAL_METHOD_IDS = Object.freeze([
  'reflection-in-action', 'reference-distance', 'image-first-draft',
  'evidence-driven-refinement', 'copy-repair-workflow', 'motion-one',
  'ai-shipped-asset',
] as const);
export const ADAPTIVE_STAGE_IDS = Object.freeze([
  ...OPTIONAL_STAGE_IDS, 'production', 'browser-evidence', 'independent-review',
] as const);
export const ADAPTIVE_ROLE_IDS = Object.freeze([
  'omd-framer', 'omd-scout', 'omd-writer', 'omd-typesetter', 'omd-composer',
  'omd-sketch', 'omd-hand', 'omd-eye', 'omd-glance', 'omd-study',
] as const);

export type AdaptiveRouteErrorCode =
  | 'MALFORMED_ADAPTIVE_ROUTE'
  | 'UNEXPECTED_ADAPTIVE_ROUTE_FIELD'
  | 'ADAPTIVE_SKIP_REASON_REQUIRED'
  | 'OPTIONAL_SKIP_REASON_REQUIRED'
  | 'HARD_GATE_CANNOT_SKIP'
  | 'MODEL_OWNER_REQUIRED'
  | 'PRODUCTION_REQUIRED'
  | 'FINAL_EVIDENCE_REQUIRED'
  | 'INDEPENDENT_REVIEW_REQUIRED'
  | 'SAFETY_WORK_REQUIRED'
  | 'REQUIRED_METHOD_MISSING'
  | 'REFERENCE_WORK_MISMATCH'
  | 'UNKNOWN_ADAPTIVE_STAGE'
  | 'UNKNOWN_ADAPTIVE_ROLE'
  | 'ADAPTIVE_STRATEGY_DUPLICATE'
  | 'ADAPTIVE_STAGE_ORDER_INVALID'
  | 'ADAPTIVE_EXECUTION_WAVE_INVALID'
  | 'SOURCE_CONTRACT_MISMATCH'
  | 'ROUTE_AUTHORITY_REQUIRED'
  | 'MODEL_IDENTITY_MISMATCH'
  | 'COPY_REPAIR_WORKFLOW_INVALID'
  | 'SHOWPIECE_MOTION_AMBITION_INVALID'
  | 'AI_ASSET_DECISION_INVALID'
  | 'ATTRIBUTION_COVERAGE_INVALID'
  | 'GREENFIELD_FRAME_REQUIRED'
  | 'GREENFIELD_TASK_FLOW_STAGE_REQUIRED'
  | 'GREENFIELD_TASK_FLOW_ROLE_REQUIRED'
  | 'LOCALE_DESIGN_CLARIFICATION_REQUIRED'
  | 'LOCALE_DESIGN_RESEARCH_REQUIRED'
  | 'LOCALE_DESIGN_TYPE_PROOF_REQUIRED';

export class AdaptiveRouteError extends Error {
  override readonly name = 'AdaptiveRouteError';
  readonly code: AdaptiveRouteErrorCode;
  constructor(code: AdaptiveRouteErrorCode, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.code = code;
  }
}

export type AdaptiveSkip = Readonly<{ id: string; reason: string }>;
export type AdaptiveExecutionWave = Readonly<{
  id: string;
  mode: 'concurrent';
  roles: readonly string[];
}>;
export type AdaptiveStrategyDecision = Readonly<{
  schema: typeof ADAPTIVE_STRATEGY_DECISION_SCHEMA;
  owner: 'user-selected-model';
  roles: readonly string[];
  stages: readonly string[];
  executionWaves: readonly AdaptiveExecutionWave[];
  methods: readonly string[];
  aiAssets: readonly AdaptiveAiAsset[];
  attributionCategories: readonly AdaptiveAttributionCategory[];
  skips: readonly AdaptiveSkip[];
  rationale: string;
}>;
export type AdaptiveBrowserDecisionContext = Readonly<{
  schema: typeof ADAPTIVE_BROWSER_CONTEXT_SCHEMA;
  status: 'pending' | 'validated';
  decisionIds: readonly string[];
  reason: string;
}>;
export type AdaptiveLearningContext = Readonly<{
  schema: typeof ADAPTIVE_LEARNING_CONTEXT_SCHEMA;
  status: 'none' | 'candidate' | 'promoted';
  learningIds: readonly string[];
  reason: string;
}>;
export type ModelCapabilityRouteInput = Readonly<{ now: number; routingInput: unknown }>;
export type AdaptiveRouteInput = Readonly<{
  schema: typeof ADAPTIVE_ROUTE_INPUT_SCHEMA;
  request: string;
  projectMode: 'greenfield' | 'existing';
  namedDependencies: readonly string[];
  allowedPaths: readonly string[];
  taskOutcome: unknown;
  uxPolicy: unknown;
  evidenceClaims: unknown;
  referenceDiscovery: unknown;
  designAxes: unknown;
  modelCapability: ModelCapabilityRouteInput;
  browserDecisionContext: AdaptiveBrowserDecisionContext;
  validatedLearningContext: AdaptiveLearningContext;
  strategyDecision: AdaptiveStrategyDecision;
}>;
export type AdaptiveSourceContract = Readonly<{
  schema: typeof ADAPTIVE_SOURCE_CONTRACT_SCHEMA;
  request: string;
  projectMode: 'greenfield' | 'existing';
  namedDependencies: readonly string[];
  allowedPaths: readonly string[];
  taskOutcome: TaskOutcomeContract;
  uxPolicy: UxPolicy;
  evidenceClaims: EvidenceClaimPublication;
  referenceDiscovery: ReferenceDiscoveryInput;
  designAxes: DesignAxisInput;
  modelCapability: Readonly<{ now: number; routingInput: ModelCapabilityRoutingSource }>;
  browserDecisionContext: AdaptiveBrowserDecisionContext;
  validatedLearningContext: AdaptiveLearningContext;
  strategyDecision: AdaptiveStrategyDecision;
  localeDesign?: LocaleDesignRoute;
}>;

export type ValidatedAdaptiveRouteInput = Omit<AdaptiveRouteInput,
  'taskOutcome' | 'uxPolicy' | 'evidenceClaims' | 'referenceDiscovery' | 'designAxes' | 'modelCapability'> & Readonly<{
  taskOutcome: TaskOutcomeRouting;
  uxPolicy: UxPolicyCheck;
  sourceContract: AdaptiveSourceContract;
  evidenceClaims: EvidenceClaimPublication;
  referenceDiscovery: ReferenceDiscoveryRouting;
  designAxes: DesignAxisRouting;
  modelCapability: ModelCapabilityProbeRouting;
  localeDesign?: LocaleDesignRoute;
}>;
export type AdaptiveRouteRecord = Readonly<{
  schema: typeof ADAPTIVE_ROUTE_RECORD_SCHEMA;
  route: 'adaptive';
  request: string;
  projectMode: 'greenfield' | 'existing';
  requiredOutcomes: readonly string[];
  prohibitedOutcomes: readonly string[];
  evidenceRequired: readonly string[];
  selectedModel: SelectedModelIdentity;
  sourceContract: AdaptiveSourceContract;
  sourceContractSha256: string;
  strategy: AdaptiveStrategyDecision;
  behavior: AdaptiveBehaviorContract;
  references: ReferenceDiscoveryRouting['references'] & Readonly<{ decision: ReferenceDiscoveryRouting['decision'] }>;
  claims: Readonly<{ userFacts: readonly string[]; workingContext: readonly string[] }>;
  browserDecisions: AdaptiveBrowserDecisionContext;
  validatedLearning: AdaptiveLearningContext;
  gates: readonly string[];
  namedDependencies: readonly string[];
  allowedPaths: readonly string[];
  forbiddenWithoutRequest: readonly string[];
}>;

export const FORBIDDEN_WITHOUT_REQUEST = Object.freeze([
  'creating, publishing, or changing the visibility of a repository',
  'creating, merging, or closing a branch, PR, or release',
  'adding licence, governance, or funding files',
  'adding a dependency the request did not name',
  'adding a feature the request did not ask for',
  'redesigning a surface the request did not name',
] as const);

export function failAdaptiveRoute(code: AdaptiveRouteErrorCode, detail?: string): never {
  throw new AdaptiveRouteError(code, detail);
}
