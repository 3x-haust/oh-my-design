import type { ExpressiveDesignNeed } from './design-axis-routing.ts';
import type { AdaptiveStrategyDecision } from './adaptive-flow-domain.ts';
import { COPY_REPAIR_WORKFLOW } from './adaptive-copy-repair.ts';
import { adaptiveMotionContract, type AdaptiveMotionContract } from './adaptive-motion-ambition.ts';
import type { AdaptiveAttributionCategory } from './adaptive-attribution.ts';
import { DESIGN_QUALITY_AXIS_FLOORS } from '../evidence/final-v2-design-quality.ts';

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
    anchorCount: 'content-dependent', templateAssessment: 'visible-fit-not-family-name',
    nonShippingIsSkipReason: false,
    feasibilityEvidence: 'rendered-anchor-and-task-at-required-viewports',
    selectionMerit: 'rendered-concept-task-and-craft',
    costRole: 'explicit-budget-or-equivalent-candidate-tiebreak',
    chosenDraftShips: false, factualCarrierAllowed: false, distanceBlocksShipping: false,
  },
  visual: {
    registers: ['quiet', 'confident', 'showpiece'],
    registerDefaults: { marketing: 'confident', product: 'quiet' },
    productionBeforeFrameAndResearch: false, explicitStackRequestBuildAuthority: false,
    restrainedMarketingCarrier: ['scale', 'structure', 'display-type'], productDisplayExempt: true,
    marketingRequiresColourIdentity: true, marketingRequiresBuiltCarrier: true,
    textOnlyMarketingPasses: false, colourDistribution: 'surface-conditional',
    marketingColourDistribution: '60-30-10', productColourStrategy: 'semantic-action-state',
    colourlessMarketing: 'RED',
    carrierOptions: [
      'gradient-mesh', 'noise-grain-texture', 'svg-geometric-pattern',
      'css-illustration-primitives', 'expressive-theory', 'motion-recipe',
    ],
    carrierAbsenceClassification: 'surface-conditional', productCarrierRequired: false,
    carrierStackingAllowed: false,
    maximumSystematicDetailLayers: 1,
    directionCount: 'ambition-and-uncertainty', directionSelection: 'autonomous',
    directionCountCommitment: 'before-generation-with-evidence-reason',
    directionDifference: 'content-generator-and-macro-composition',
    sharedBrandColoursAllowed: true,
    userRegisterMotionLock: true, motionDefault: 'none', maximumTriggeredScenes: 1,
    motionOneRequiresTriggeredScene: true, motionNoneRequiresStaticBreak: false,
    marketingMotionNoneRequiresStaticBreak: true,
    scrollEvidenceAddsMotionObligation: false, criticalReviewFloor: 3,
    reviewVerdicts: ['signature-fit', 'narrative-fit', 'motion-fit', 'decision-fit', 'reality-fit'],
    allReviewVerdictsRequired: true, functionalElementIsSignature: false,
    quietProductExtraSignatureRequired: false,
    designQualityAxes: [
      'beautyDesirability', 'hierarchyComposition', 'domainSpecificity',
      'humanAuthorship', 'usability', 'responsiveCraft',
    ],
    designQualityFloor: 3,
    designQualityFloors: DESIGN_QUALITY_AXIS_FLOORS,
    designQualityAggregation: 'conjunctive',
    designQualityEvidence: 'localized-desktop-mobile',
    fidelityCanSubstituteDesignQuality: false,
    greenfield: {
      input: 'prompt-only',
      brand: 'supplied-or-explicitly-requested',
      facts: 'verified-or-labelled-demo',
      productDistinction: 'task-model-content-hierarchy-interaction',
      referenceStart: 'domain-product-screens',
      completion: 'desktop-mobile-reality-review',
    },
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
    designQuality: Readonly<{
      axes: readonly [
        'beautyDesirability',
        'hierarchyComposition',
        'domainSpecificity',
        'humanAuthorship',
        'usability',
        'responsiveCraft',
      ];
      floor: 3;
      floors: Readonly<{
        beautyDesirability: 4;
        hierarchyComposition: 4;
        domainSpecificity: 3;
        humanAuthorship: 3;
        usability: 3;
        responsiveCraft: 3;
      }>;
      aggregation: 'conjunctive';
      candidateMode: 'structural' | 'integrated-visual';
      evidence: 'localized-desktop-mobile';
      fidelityCanSubstitute: false;
    }>;
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
      designQuality: Object.freeze({
        axes: Object.freeze([
          ...ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityAxes,
        ]) as AdaptiveBehaviorContract['active']['designQuality']['axes'],
        floor: ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityFloor,
        floors: Object.freeze({
          ...ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityFloors,
        }),
        aggregation: ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityAggregation,
        candidateMode: expressiveDesignNeed === 'showpiece'
          ? 'integrated-visual'
          : 'structural',
        evidence: ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityEvidence,
        fidelityCanSubstitute:
          ADAPTIVE_BEHAVIOR_POLICY.visual.fidelityCanSubstituteDesignQuality,
      }),
    }),
  });
}
