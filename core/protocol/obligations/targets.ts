export interface ExecutableObligationTestCase {
  readonly id: string;
  readonly file: string;
  readonly title: string;
  readonly applicableTo: readonly string[];
}

export interface ObligationProjectionDefinition {
  readonly id: string;
  readonly file: string;
  readonly definition: string;
  readonly applicableTo: readonly string[];
}

/** Fixed declarations of the focused executable cases that establish each obligation. */
export const EXECUTABLE_OBLIGATION_TEST_CASES = [
  { id: 'art-direction-motion-lock', file: 'test/art-direction-decision.test.ts', title: 'explicit current-user register and motion locks win before composition', applicableTo: ['explicit-user-motion-lock'] },
  { id: 'art-direction-three-directions', file: 'test/art-direction-decision.test.ts', title: 'silent marketing selects the uniquely highest evaluator score', applicableTo: ['silent-marketing-three-direction-comparison'] },
  { id: 'art-direction-motion-eligibility', file: 'test/art-direction-decision.test.ts', title: 'one requires exactly one scene and none requires a lawful fallback', applicableTo: ['none-one-motion-eligibility'] },
  { id: 'prompt-pre-composition-decision', file: 'test/art-direction-decision.test.ts', title: 'art direction rejects non-current handoff role and artifact bindings', applicableTo: ['pre-composition-decision-timing'] },
  { id: 'prompt-no-user-prompt', file: 'test/art-direction-decision.test.ts', title: 'explicit current-user register and motion locks win before composition', applicableTo: ['no-user-prompt'] },
  { id: 'harness-v2-critical-floors', file: 'test/harness-v2-quality.test.ts', title: 'critical score two never averages away', applicableTo: ['critical-floors'] },
  { id: 'final-evidence-v2-cardinality', file: 'test/final-evidence-v2.test.ts', title: 'motion evidence accepts one observed scene and rejects empty or multi-scene branches', applicableTo: ['exact-final-artifact-cardinality'] },
  { id: 'art-direction-activation', file: 'test/runtime-isolation.test.ts', title: 'activation rejects caller-supplied authority fields', applicableTo: ['activation'] },
  { id: 'final-evidence-v2-guarded-writes', file: 'test/runtime-isolation.test.ts', title: 'guarded writes reject missing and stale activation before mutating', applicableTo: ['guarded-writes'] },
  { id: 'prompt-isolated-lanes', file: 'test/prompt-contract.test.ts', title: 'copy is an isolated writer-editor boundary before sketches', applicableTo: ['isolated-lanes'] },
  { id: 'final-evidence-v2-sole-publisher', file: 'test/final-evidence-v2.test.ts', title: 'v2 publishes only a complete receipt graph and checker revalidates backing artifacts', applicableTo: ['sole-v2-publication'] },
] as const satisfies readonly ExecutableObligationTestCase[];

/** Fixed declarations of implementation projections exercised by the focused cases. */
export const OBLIGATION_PROJECTION_DEFINITIONS = [
  { id: 'art-direction-motion-lock', file: 'core/art-direction/decision.ts', definition: 'resolveMarketingArtDirection', applicableTo: ['explicit-user-motion-lock'] },
  { id: 'art-direction-three-directions', file: 'core/art-direction/decision.ts', definition: 'resolveMarketingArtDirection', applicableTo: ['silent-marketing-three-direction-comparison'] },
  { id: 'art-direction-motion-eligibility', file: 'core/art-direction/decision.ts', definition: 'resolveMarketingArtDirection', applicableTo: ['none-one-motion-eligibility'] },
  { id: 'human-design-loop-pre-composition', file: 'core/ref/reference-handoff.ts', definition: 'writeReferenceHandoffReceipt', applicableTo: ['pre-composition-decision-timing'] },
  { id: 'human-design-loop-no-prompt', file: 'core/art-direction/decision.ts', definition: 'resolveMarketingArtDirection', applicableTo: ['no-user-prompt'] },
  { id: 'harness-v2-quality-floors', file: 'core/eval-harness/index.ts', definition: 'evaluateHarnessV2Quality', applicableTo: ['critical-floors'] },
  { id: 'final-evidence-v2-cardinality', file: 'core/evidence/final-v2.ts', definition: 'validateFinalEvidenceV2Manifest', applicableTo: ['exact-final-artifact-cardinality'] },
  { id: 'art-direction-activation', file: 'core/runtime/activation.ts', definition: 'validateActivationContext', applicableTo: ['activation'] },
  { id: 'final-evidence-v2-guarded-writes', file: 'core/runtime/project-write.ts', definition: 'writeProjectFile', applicableTo: ['guarded-writes'] },
  { id: 'human-design-loop-isolated-lanes', file: 'core/protocol/human-design-loop.md', definition: '## Blindness and isolation', applicableTo: ['isolated-lanes'] },
  { id: 'final-evidence-v2-sole-publisher', file: 'core/evidence/final-v2.ts', definition: 'publishFinalEvidenceV2', applicableTo: ['sole-v2-publication'] },
] as const satisfies readonly ObligationProjectionDefinition[];
