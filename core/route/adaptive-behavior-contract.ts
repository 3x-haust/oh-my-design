import type { ExpressiveDesignNeed } from './design-axis-routing.ts';
import type { AdaptiveStrategyDecision } from './adaptive-flow-domain.ts';
import { COPY_REPAIR_WORKFLOW } from './adaptive-copy-repair.ts';
import { adaptiveMotionContract, type AdaptiveMotionContract } from './adaptive-motion-ambition.ts';
import type { AdaptiveAttributionCategory } from './adaptive-attribution.ts';

export const ADAPTIVE_BEHAVIOR_SCHEMA = 'adaptive-behavior-contract-v1' as const;

const POLICY = {
  process: {
    artifactOwners: {
      copyDeck: 'omd-writer', typeProof: 'omd-typesetter', composition: 'omd-composer',
      candidates: 'omd-sketch', production: 'omd-hand', review: 'omd-eye', squint: 'omd-glance',
    },
    checkpointSequence: ['semantic-render-change', 'typography-reproof', 'visual-render-change'],
    checkpointNone: 'no-human-approval-wait', squintBeforeSharp: true, showpieceLensCount: 1,
    preferenceOrder: ['current-brief', 'current-user-feedback', 'project-taste', 'model-judgment'],
    reviewIsolation: {
      blindAllowed: ['role-brief', 'opaque-renders', 'deterministic-findings'],
      blindDenied: ['frame', 'decisions', 'references', 'source-rationale', 'prior-verdicts'],
      fidelityAllowed: ['selected-projections', 'handoff-receipts'],
      glanceAllowed: ['squint-renders'],
    },
    typeProof: {
      viewports: ['1280x900', '390x844'], scope: 'typography-only',
      reject: ['fallback', 'tofu', 'faux', 'invented-type-scale'],
    },
    immutableInputs: ['frame', 'copy-deck', 'type-proof', 'scout-summary'],
    roleCapabilities: {
      packReaders: [
        'omd-framer', 'omd-scout', 'omd-sketch', 'omd-hand', 'omd-eye',
        'omd-writer', 'omd-typesetter', 'omd-composer',
      ],
      requiredTools: [
        'Bash(omd pack:*)', 'Bash(omd copy:*)', 'Bash(omd composition:*)',
        'Bash(shasum:*)', 'Bash(omd source:*)',
      ],
    },
    evidenceChecks: [
      'copy-check', 'motion-spec-before-code', 'attribution', 'finish-pass', 'design-check',
      'reference-distance-advisory', 'target-diff', 'site-check', 'sharp-desktop-mobile',
      'filmstrip-when-applicable', 'humanize-review', 'declared-probes', 'non-deterministic-craft-review',
    ],
  },
  references: {
    coverage: ['domain', 'competitors', 'audience-language', 'typography', 'voice', 'motion', 'components'],
    handoff: 'sanitized-summary-only', rawHandoff: false, localPartImages: true,
    fidelityTarget: 'high', distanceBlocksShipping: false, blueprintSeedAllowed: true,
  },
  imageGeneration: {
    sequence: ['generate', 'analyze', 'implement'], owner: 'coordinator', selection: 'blind',
    requiresHostCapability: true,
    concurrency: 'independent-drafts', cacheOwner: 'coordinator', composerRole: 'selected-draft-consumer',
    composerForbidden: ['provider-prompt', 'generation', 'cache-management', 'draft-selection'],
    seedInputs: ['selected-references', 'skin-abstracted-blueprints', 'project-owned-inputs'],
    minimumDistinctAnchors: 3, rejectPattern: 'left-text-right-image-default',
    chosenDraftShips: false, factualCarrierAllowed: false, distanceBlocksShipping: false,
  },
  visual: {
    registers: ['quiet', 'confident', 'showpiece'],
    registerDefaults: { marketing: 'confident', product: 'quiet' },
    productionBeforeFrameAndResearch: false, explicitStackRequestBuildAuthority: false,
    restrainedMarketingCarrier: ['scale', 'structure', 'display-type'], productDisplayExempt: true,
    marketingRequiresColourIdentity: true, marketingRequiresBuiltCarrier: true,
    textOnlyMarketingPasses: false, colourDistribution: '60-30-10', colourlessMarketing: 'RED',
    carrierOptions: [
      'gradient-mesh', 'noise-grain-texture', 'svg-geometric-pattern',
      'css-illustration-primitives', 'expressive-theory', 'motion-recipe',
    ],
    carrierAbsenceClassification: 'hierarchy-defect', carrierStackingAllowed: false,
    maximumSystematicDetailLayers: 1,
    autonomousMarketingDirectionCount: 3, directionSelection: 'autonomous',
    directionsRequireDistinctColourAndGenerator: true,
    userRegisterMotionLock: true, motionDefault: 'none', maximumTriggeredScenes: 1,
    motionOneRequiresTriggeredScene: true, motionNoneRequiresStaticBreak: true,
    scrollEvidenceAddsMotionObligation: false, criticalReviewFloor: 3,
    reviewVerdicts: ['signature-fit', 'narrative-fit', 'motion-fit', 'decision-fit'],
    allReviewVerdictsRequired: true, functionalElementIsSignature: false,
    quietProductExtraSignatureRequired: false,
  },
  assets: {
    dependencyPolicy: 'named-only', fabricateFactsOrAssets: false, mandatePhoto: false,
    sourcePrecedence: ['user-asset', 'free-license-photo', 'conditional-ai', 'additive-webgl'],
    factualCarrierAiAllowed: false, aiZones: ['abstract', 'atmospheric'],
    aiProvenance: [
      'prompt', 'provider', 'trusted-project-current-omd-decision',
      'host-ai-asset-decision-authority',
    ], freePhotoProvenance: ['source', 'license', 'attribution'],
    moodBoardUse: 'study-only', sourcingOverridesCarrierDecision: false,
    webglRequires: ['hand-precedence', 'performance-budget', 'semantic-fallback'],
    fallback: ['user-asset', 'css-svg'], placeholderFinalAllowed: false,
  },
  refinement: {
    producer: 'omd-hand', reviewer: 'omd-eye', evidenceRequired: true,
    redAction: 'continue', greenAction: 'complete', missingEvidenceCounts: false,
    fixedRoundTable: false, overridesMandatoryGates: false,
  },
} as const;

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value);
  }
  Object.freeze(value);
}
deepFreeze(POLICY);
export const ADAPTIVE_BEHAVIOR_POLICY = POLICY;

export type AdaptiveBehaviorContract = Readonly<{
  schema: typeof ADAPTIVE_BEHAVIOR_SCHEMA;
  policy: typeof ADAPTIVE_BEHAVIOR_POLICY;
  active: Readonly<{
    imageGeneration: boolean;
    reflectionCheckpoints: boolean;
    referenceDistance: boolean;
    parallelReferenceAcquisition: boolean;
    copyRepairWorkflow: Readonly<
      | { status: 'selected'; steps: typeof COPY_REPAIR_WORKFLOW }
      | { status: 'skipped'; reason: string }
    >;
    motion: AdaptiveMotionContract;
    attributionCategories: readonly AdaptiveAttributionCategory[];
    aiAssetDecisionIds: readonly string[];
  }>;
}>;

export function adaptiveBehaviorContract(
  strategy: AdaptiveStrategyDecision,
  expressiveDesignNeed: ExpressiveDesignNeed,
): AdaptiveBehaviorContract {
  const copyRepair = strategy.methods.includes('copy-repair-workflow')
    ? Object.freeze({ status: 'selected' as const, steps: COPY_REPAIR_WORKFLOW })
    : Object.freeze({
      status: 'skipped' as const,
      reason: strategy.skips.find((entry) => entry.id === 'copy-repair-workflow')?.reason ?? '',
    });
  return Object.freeze({
    schema: ADAPTIVE_BEHAVIOR_SCHEMA,
    policy: ADAPTIVE_BEHAVIOR_POLICY,
    active: Object.freeze({
      imageGeneration: strategy.methods.includes('image-first-draft'),
      reflectionCheckpoints: strategy.methods.includes('reflection-in-action'),
      referenceDistance: strategy.methods.includes('reference-distance'),
      parallelReferenceAcquisition: strategy.methods.includes('parallel-reference-acquisition'),
      copyRepairWorkflow: copyRepair,
      motion: adaptiveMotionContract(expressiveDesignNeed, strategy),
      attributionCategories: strategy.attributionCategories,
      aiAssetDecisionIds: Object.freeze(strategy.aiAssets.map((asset) => asset.decision.decisionId)),
    }),
  });
}
