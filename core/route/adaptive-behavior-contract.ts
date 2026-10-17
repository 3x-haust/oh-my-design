import type { AdaptiveStrategyDecision } from './adaptive-flow-domain.ts';
import { DESIGN_QUALITY_AXIS_FLOORS } from '../evidence/final-v2-design-quality.ts';

export const ADAPTIVE_BEHAVIOR_SCHEMA = 'adaptive-behavior-contract-v1' as const;
export const ADAPTIVE_BEHAVIOR_RECORDED_BROWSE_SCHEMA = 'adaptive-behavior-contract-v2' as const;

const MODEL_LED_POLICY = Object.freeze({
  process: Object.freeze({
    owner: 'user-selected-model',
    production: 'ordinary-host-tools',
    firstRenderGate: 'omd-first-render-check',
    terminalGate: 'omd-lifecycle-finish',
    independentReviewer: 'omd-eye',
  }),
  references: Object.freeze({
    selection: 'model-directed',
    authority: 'current-capture-evidence',
    rawSourceInstructions: false,
  }),
  visual: Object.freeze({
    designQualityAxes: Object.freeze([
      'beautyDesirability',
      'hierarchyComposition',
      'domainSpecificity',
      'humanAuthorship',
      'usability',
      'responsiveCraft',
    ] as const),
    designQualityFloor: 3 as const,
    designQualityFloors: DESIGN_QUALITY_AXIS_FLOORS,
    designQualityAggregation: 'conjunctive' as const,
    designQualityEvidence: 'localized-desktop-mobile' as const,
    fidelityCanSubstituteDesignQuality: false as const,
  }),
  review: Object.freeze({
    evidenceRequired: true,
    deterministicFailuresRemainBlocking: true,
    reviewerMayInventAuthority: false,
  }),
});

const RECORDED_BROWSE_POLICY = Object.freeze({
  ...MODEL_LED_POLICY,
  references: Object.freeze({
    ...MODEL_LED_POLICY.references,
    acquisition: 'recorded-whole-screen-v1',
  }),
});

export const ADAPTIVE_BEHAVIOR_POLICY = MODEL_LED_POLICY;
export const ADAPTIVE_RECORDED_BROWSE_BEHAVIOR_POLICY = RECORDED_BROWSE_POLICY;

export type AdaptiveBehaviorContract = Readonly<{
  schema: typeof ADAPTIVE_BEHAVIOR_SCHEMA | typeof ADAPTIVE_BEHAVIOR_RECORDED_BROWSE_SCHEMA;
  policy: typeof ADAPTIVE_BEHAVIOR_POLICY | typeof ADAPTIVE_RECORDED_BROWSE_BEHAVIOR_POLICY;
  active: Readonly<{
    methods: readonly string[];
    designQuality: Readonly<{
      axes: typeof ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityAxes;
      floor: 3;
      floors: typeof DESIGN_QUALITY_AXIS_FLOORS;
      aggregation: 'conjunctive';
      candidateMode: 'integrated-visual';
      evidence: 'localized-desktop-mobile';
      fidelityCanSubstitute: false;
    }>;
  }>;
}>;

export function adaptiveBehaviorContract(
  strategy: AdaptiveStrategyDecision,
  _expressiveDesignNeed: unknown,
  referenceBehavior: 'legacy' | 'recorded-browse' = 'legacy',
): AdaptiveBehaviorContract {
  if (strategy.methods.length !== 0) {
    throw new Error('MODEL_LED_BEHAVIOR: structured workflow methods are unsupported');
  }
  const policy = referenceBehavior === 'recorded-browse'
    ? ADAPTIVE_RECORDED_BROWSE_BEHAVIOR_POLICY
    : ADAPTIVE_BEHAVIOR_POLICY;
  return Object.freeze({
    schema: referenceBehavior === 'recorded-browse'
      ? ADAPTIVE_BEHAVIOR_RECORDED_BROWSE_SCHEMA
      : ADAPTIVE_BEHAVIOR_SCHEMA,
    policy,
    active: Object.freeze({
      methods: Object.freeze([]),
      designQuality: Object.freeze({
        axes: ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityAxes,
        floor: ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityFloor,
        floors: ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityFloors,
        aggregation: ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityAggregation,
        candidateMode: 'integrated-visual',
        evidence: ADAPTIVE_BEHAVIOR_POLICY.visual.designQualityEvidence,
        fidelityCanSubstitute: ADAPTIVE_BEHAVIOR_POLICY.visual.fidelityCanSubstituteDesignQuality,
      }),
    }),
  });
}
