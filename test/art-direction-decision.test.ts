import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { beatBudgetForRegister, exceedsCanonicalBeatBudget, NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256, recipeDecisionProjectionSha256, resolveMarketingArtDirection } from '../core/art-direction/decision.ts';
import type { ResolveMarketingArtDirectionInput } from '../core/art-direction/decision.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { referenceHandoffPayloadSha256 } from '../core/ref/reference-handoff.ts';
import {
  materializeSettledReferenceSelection,
  motionResolutionProjectionSha256,
  parseReferenceSelectionV2,
  referenceSelectionV2Sha256,
} from '../core/ref/reference-selection.ts';
import type { MotionResolutionProjection } from '../core/ref/reference-selection.ts';
import type { ArtDirectionAlternative, ArtDirectionReference } from '../core/art-direction/schema.ts';

const hash = (char: string): string => char.repeat(64);

const references: readonly ArtDirectionReference[] = [
  { slotId: 'static', signal: 'high-visual-system', positive: true, lawful: true, motionObligation: 'none' },
  { slotId: 'motion', signal: 'high-motion', positive: true, lawful: true, motionObligation: 'none' },
];
const selection = {
  schemaVersion: 'reference-selection-v2' as const,
  captureSha256: hash('a'),
  assemblySha256: hash('b'),
  projectionSha256: hash('c'),
  candidateId: 'candidate',
  slots: [
    { slotId: 'static', rights: 'lawful' as const, signal: 'high-visual-system' as const, staticAxis: 'available' as const, motionAxis: 'absent' as const, obligationDisposition: 'used' as const, obligationReason: 'lawful static evidence selected' },
    { slotId: 'motion', rights: 'lawful' as const, signal: 'high-motion' as const, staticAxis: 'absent' as const, motionAxis: 'available' as const, obligationDisposition: 'not-applicable' as const, obligationReason: 'evaluator-pending: lawful available motion awaits evaluator resolution' },
  ],
};
const selectionSha256 = referenceSelectionV2Sha256(selection);
const handoffWithoutHash = {
  schemaVersion: 'reference-handoff-v2' as const,
  role: 'art-direction' as const,
  captureSha256: hash('a'),
  assemblySha256: hash('b'),
  projectionSha256: hash('c'),
  preSelectionSha256: selectionSha256,
  positiveMotion: { slots: [{ slotId: 'motion', disposition: 'not-applicable' as const, reason: 'evaluator-pending: lawful available motion awaits evaluator resolution' }] },
};
const handoff = { ...handoffWithoutHash, payloadSha256: referenceHandoffPayloadSha256(handoffWithoutHash) };
const referenceBindings = { canonicalSelectionSha256: selectionSha256, canonicalHandoffSha256: handoff.payloadSha256, selection, handoff };
function alternative(register: 'quiet' | 'confident' | 'showpiece', motionHypothesis: 'none' | 'one'): ArtDirectionAlternative {
  return {
    register,
    subjectIdentityFit: `${register} fits the subject`,
    staticReferenceSlotIds: ['static'],
    motionReferenceSlotIds: motionHypothesis === 'one' ? ['motion'] : [],
    conceptRole: `${register} concept role`,
    macroCompositionHypothesis: register === 'quiet' ? 'template-breaking asymmetrical editorial departure' : 'layered promotional composition',
    motionHypothesis,
    uxAccessibilityPerformanceRisks: ['reduced motion remains available'],
    lawfulImplementationPath: 'CSS and SVG implementation',
    rejectionCondition: 'Selected positive evidence better supports another direction.',
  };
}

function defaultAlternatives(hasAcceptedPositiveMotion: boolean): readonly ArtDirectionAlternative[] {
  return [
    alternative('quiet', 'none'),
    { ...alternative('confident', 'one'), motionReferenceSlotIds: hasAcceptedPositiveMotion ? ['motion'] : [] },
    { ...alternative('showpiece', 'one'), motionReferenceSlotIds: hasAcceptedPositiveMotion ? ['motion'] : [] },
  ];
}
function evaluatorEvidence(scores: Readonly<Record<'quiet' | 'confident' | 'showpiece', number>> = {
  quiet: 2,
  confident: 4,
  showpiece: 8,
}) {
  return {
    invocationSha256: hash('d'),
    payloadSha256: hash('e'),
    resultSha256: hash('f'),
    assessments: (['quiet', 'confident', 'showpiece'] as const).map((register) => ({
      register,
      score: scores[register],
      subjectIdentityRationale: `${register} subject identity assessment.`,
      conceptRoleRationale: `${register} concept role assessment.`,
      uxAccessibilityPerformanceRationale: `${register} UX, accessibility, and performance assessment.`,
      lawfulFeasibilityRationale: `${register} lawful implementation assessment.`,
      referenceEvidenceRationale: `${register} canonical reference evidence assessment.`,
      rejectionRationale: `${register} is rejected when another assessment has a higher score.`,
    })),
  };
}

function motionResolutionFor(input: Pick<ResolveMarketingArtDirectionInput,
  'activationSha256' | 'alternatives' | 'evaluatorEvidence' | 'intent' | 'referenceBindings' | 'eligibility'
>): MotionResolutionProjection {
  const evaluatorWinner = [...input.evaluatorEvidence.assessments].sort((left, right) => (
    right.score - left.score || left.register.localeCompare(right.register)
  ))[0]!;
  const selected = input.alternatives.find((alternative) => (
    alternative.register === (input.intent.register ?? evaluatorWinner.register)
  ))!;
  const motionDecision = input.intent.motionDecision ?? selected.motionHypothesis;
  const recipeReceipt = motionDecision === 'one'
    && input.eligibility.selectedMotionReferenceSlotId === undefined
    && typeof input.eligibility.approvedMotionRecipe === 'object'
    ? input.eligibility.approvedMotionRecipe
    : undefined;
  const selectedSlotId = recipeReceipt === undefined
    ? input.eligibility.selectedMotionReferenceSlotId
    : undefined;
  const pendingSlots = input.referenceBindings.selection.slots.filter((slot) => (
    slot.rights === 'lawful'
    && slot.signal === 'high-motion'
    && slot.motionAxis === 'available'
    && slot.obligationDisposition === 'not-applicable'
  ));
  return {
    schemaVersion: 'motion-resolution-v1',
    activationSha256: input.activationSha256,
    alternativesSha256: createHash('sha256').update(canonicalJson(input.alternatives)).digest('hex'),
    selectionSha256: input.referenceBindings.canonicalSelectionSha256,
    handoffSha256: input.referenceBindings.canonicalHandoffSha256,
    evaluatorInvocationSha256: input.evaluatorEvidence.invocationSha256,
    evaluatorPayloadSha256: input.evaluatorEvidence.payloadSha256,
    evaluatorResultSha256: input.evaluatorEvidence.resultSha256,
    motionDecision,
    slots: pendingSlots.map((slot) => ({
      slotId: slot.slotId,
      obligationDisposition: motionDecision === 'one' && slot.slotId === selectedSlotId ? 'used' as const : 'rejected' as const,
      obligationReason: motionDecision === 'one' && slot.slotId === selectedSlotId
        ? 'The evaluator selected this canonical motion reference.'
        : 'The evaluator rejected this pending motion reference.',
    })),
    ...(recipeReceipt === undefined ? {} : {
      approvedRecipe: {
        recipeId: recipeReceipt.recipeId,
        recipeSha256: recipeReceipt.recipeSha256,
      },
    }),
  };
}

function input(overrides: Partial<ResolveMarketingArtDirectionInput> = {}): ResolveMarketingArtDirectionInput {
  const bindings = overrides.referenceBindings ?? referenceBindings;
  const hasAvailablePositiveMotion = bindings.selection.slots.some((slot) => (
    slot.rights === 'lawful'
    && slot.signal === 'high-motion'
    && slot.motionAxis === 'available'
  ));
  const resolved = {
    activationSha256: overrides.activationSha256 ?? hash('a'),
    intentSha256: overrides.intentSha256 ?? hash('b'),
    boardSha256: overrides.boardSha256 ?? hash('a'),
    selectionSha256: overrides.selectionSha256 ?? bindings.canonicalSelectionSha256,
    route: overrides.route ?? '/launch',
    intent: overrides.intent ?? {},
    alternatives: overrides.alternatives ?? defaultAlternatives(hasAvailablePositiveMotion),
    references: overrides.references ?? references,
    referenceBindings: bindings,
    evaluatorEvidence: overrides.evaluatorEvidence ?? evaluatorEvidence(),
    eligibility: overrides.eligibility ?? {
      sceneRoles: ['launch transition'], selectedMotionReferenceSlotId: 'motion', fallbackAttempted: true,
      qualityGates: { blindSignatureGreen: true, narrativeGreen: true, motionFitGreen: true, fidelityDecisionFitGreen: true, macroLandingScore: 3, motionInfluenceScore: 3, staticReferenceInfluenceScore: 3, templateBreakingLandingScore: 3 },
    },
    implementationLane: overrides.implementationLane ?? 'browser',
    fallbackPath: overrides.fallbackPath ?? 'CSS/SVG static reduced-motion fallback',
    performanceAccessibilityBudget: overrides.performanceAccessibilityBudget ?? 'within declared budget',
  };
  return {
    ...resolved,
    motionResolution: overrides.motionResolution ?? motionResolutionFor(resolved),
  };
}

test('explicit current-user register and motion locks win before composition', () => {
  const resolved = input({
    intent: { register: 'quiet', motionDecision: 'none' },
    eligibility: {
      sceneRoles: [],
      fallbackAttempted: true,
      qualityGates: {
        blindSignatureGreen: true,
        narrativeGreen: true,
        motionFitGreen: true,
        fidelityDecisionFitGreen: true,
        macroLandingScore: 3,
        staticReferenceInfluenceScore: 3,
        templateBreakingLandingScore: 3,
      },
    },
  });
  const decision = resolveMarketingArtDirection(resolved);
  assert.equal(decision.source, 'explicit-user');
  assert.equal(decision.selectedRegister, 'quiet');
  assert.equal(decision.motionDecision, 'none');
  assert.equal(decision.consideredAlternatives.length, 3);
  assert.equal(decision.preSelectionSha256, selectionSha256);
  assert.equal(
    decision.motionResolutionProjectionSha256,
    motionResolutionProjectionSha256(resolved.motionResolution),
  );
  assert.notEqual(decision.motionResolutionProjectionSha256, hash('b'));
  assert.deepEqual(resolved.motionResolution.slots, [{
    slotId: 'motion',
    obligationDisposition: 'rejected',
    obligationReason: 'The evaluator rejected this pending motion reference.',
  }]);
  assert.equal(decision.currentUserBeatExceptionReceiptSha256, NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256);
  assert.equal('userPrompt' in decision, false);
});

test('silent marketing selects the uniquely highest evaluator score', () => {
  const decision = resolveMarketingArtDirection(input({
    evaluatorEvidence: evaluatorEvidence({ quiet: 2, confident: 9, showpiece: 8 }),
  }));
  assert.equal(decision.source, 'agent-evidence');
  assert.equal(decision.selectedRegister, 'confident');
  assert.equal(decision.motionDecision, 'one');
  assert.equal(decision.rejectedAlternatives.length, 2);
  assert.deepEqual(decision.selectedMotionReferenceSlotIds, ['motion']);
});

test('silent resolution rejects caller-selected labels as authority and selects from evaluator scores', () => {
  const evidenceWithCallerLabel = {
    ...evaluatorEvidence({ quiet: 2, confident: 4, showpiece: 8 }),
    selectedRegister: 'quiet' as const,
  };
  assert.throws(() => resolveMarketingArtDirection(input({ evaluatorEvidence: evidenceWithCallerLabel })), /invalid exact shape/);
});

test('autonomous none accepts an evidence-backed rejected motion observation', () => {
  const resolved = input({
    evaluatorEvidence: evaluatorEvidence({ quiet: 9, confident: 4, showpiece: 2 }),
    eligibility: {
      sceneRoles: [],
      fallbackAttempted: true,
      qualityGates: {
        blindSignatureGreen: true,
        narrativeGreen: true,
        motionFitGreen: true,
        fidelityDecisionFitGreen: true,
        macroLandingScore: 3,
        staticReferenceInfluenceScore: 3,
        templateBreakingLandingScore: 3,
      },
    },
  });
  const decision = resolveMarketingArtDirection(resolved);
  assert.equal(decision.source, 'agent-evidence');
  assert.equal(decision.selectedRegister, 'quiet');
  assert.equal(decision.motionDecision, 'none');
  assert.deepEqual(decision.selectedMotionReferenceSlotIds, []);
  assert.deepEqual(resolved.motionResolution.slots, [{
    slotId: 'motion',
    obligationDisposition: 'rejected',
    obligationReason: 'The evaluator rejected this pending motion reference.',
  }]);
  const settledSelection = materializeSettledReferenceSelection(selection, {
    ...resolved.motionResolution,
    selection,
  });
  assert.equal(decision.motionResolutionProjectionSha256, motionResolutionProjectionSha256(resolved.motionResolution));
  assert.equal(decision.settledSelectionSha256, referenceSelectionV2Sha256(settledSelection));
});

test('art direction rejects non-current handoff role and artifact bindings', () => {
  const composerHandoffWithoutHash = {
    ...handoffWithoutHash,
    role: 'composer' as const,
    artDirectionSha256: hash('d'),
    motionResolutionProjectionSha256: hash('e'),
    settledSelectionSha256: hash('f'),
  };
  const composerHandoff = { ...composerHandoffWithoutHash, payloadSha256: referenceHandoffPayloadSha256(composerHandoffWithoutHash) };
  assert.throws(() => resolveMarketingArtDirection(input({
    referenceBindings: {
      ...referenceBindings,
      canonicalHandoffSha256: composerHandoff.payloadSha256,
      handoff: composerHandoff,
    },
  })), /pre-composition art-direction handoff/);
  assert.throws(() => resolveMarketingArtDirection(input({
    referenceBindings: {
      ...referenceBindings,
      handoff: { ...handoff, projectionSha256: hash('d') },
    },
  })), /handoff hash is stale|current canonical selection artifacts/);
});

test('anti-reference and rejected motion slots stay canonical but cannot become positive evidence', () => {
  const antiReferenceSelection = {
    ...selection,
    slots: [
      selection.slots[0]!,
      { slotId: 'anti', rights: 'lawful' as const, signal: 'anti-reference' as const, staticAxis: 'available' as const, motionAxis: 'absent' as const, obligationDisposition: 'rejected' as const, obligationReason: 'The observed pattern is explicitly excluded from the direction.' },
    ],
  };
  assert.equal(parseReferenceSelectionV2(antiReferenceSelection).slots[1]!.signal, 'anti-reference');
  assert.throws(() => parseReferenceSelectionV2({
    ...antiReferenceSelection,
    slots: [{ ...antiReferenceSelection.slots[0]! }, { ...antiReferenceSelection.slots[1]!, obligationDisposition: 'used' }],
  }), /anti-reference evidence and cannot be used/);
  assert.equal(handoff.positiveMotion.slots[0]?.disposition, 'not-applicable');
});

test('none rejects generic restraint, capability, category, and performance rationales', () => {
  for (const reason of ['category convention', 'anti-reference avoids motion', 'restraint', 'capability unavailable', 'generic performance concern']) {
    assert.throws(() => resolveMarketingArtDirection(input({
      intent: { register: 'quiet', motionDecision: 'none' },
      alternatives: [
        alternative('quiet', 'none'),
        { ...alternative('confident', 'one'), motionReferenceSlotIds: [], rejectionCondition: reason },
        { ...alternative('showpiece', 'one'), motionReferenceSlotIds: [] },
      ],
      eligibility: { sceneRoles: [], fallbackAttempted: true, qualityGates: { blindSignatureGreen: true, narrativeGreen: true, motionFitGreen: true, fidelityDecisionFitGreen: true, macroLandingScore: 3, staticReferenceInfluenceScore: 3, templateBreakingLandingScore: 3 } },
    })), /forbidden generic rationale/);
  }
});

test('one requires exactly one scene and none requires a lawful fallback', () => {
  assert.throws(() => resolveMarketingArtDirection(input({ eligibility: { sceneRoles: ['a', 'b'], fallbackAttempted: true, qualityGates: { blindSignatureGreen: true, narrativeGreen: true, motionFitGreen: true, fidelityDecisionFitGreen: true, macroLandingScore: 3, motionInfluenceScore: 3 } } })), /exactly one/);
  assert.throws(() => resolveMarketingArtDirection(input({ intent: { register: 'quiet', motionDecision: 'none' }, eligibility: { sceneRoles: [], fallbackAttempted: false, qualityGates: { blindSignatureGreen: true, narrativeGreen: true, motionFitGreen: true, fidelityDecisionFitGreen: true, macroLandingScore: 3, staticReferenceInfluenceScore: 3, templateBreakingLandingScore: 3 } } })), /fallback/);
});
test('art direction rejects substituted reference attributes and stale canonical selection or handoff hashes', () => {
  assert.throws(() => resolveMarketingArtDirection(input({
    references: [{ ...references[0]!, signal: 'supporting-content' }, references[1]!],
  })), /canonical selected alternatives/);
  assert.throws(() => resolveMarketingArtDirection(input({
    referenceBindings: { ...referenceBindings, canonicalSelectionSha256: hash('d') },
  })), /selection hash is stale/);
  assert.throws(() => resolveMarketingArtDirection(input({
    referenceBindings: { ...referenceBindings, canonicalHandoffSha256: hash('e') },
  })), /handoff hash is stale/);
});
test('recipe authorization binds exact bytes and the canonical decision projection without a SHA fixed point', () => {
  const recipeBytes = '{"recipe":"fade-in"}';
  const recipeSha256 = createHash('sha256').update(recipeBytes).digest('hex');
  const decisionSha256 = recipeDecisionProjectionSha256({
    alternativesSha256: createHash('sha256').update(canonicalJson(defaultAlternatives(true))).digest('hex'),
    winner: 'showpiece',
    motionDecision: 'one',
    slots: [{ slotId: 'motion', obligationDisposition: 'rejected' }],
    approvedRecipe: { recipeId: 'fade-in', recipeSha256 },
  });
  const receipt = {
    recipeId: 'fade-in',
    recipeBytes,
    recipeSha256,
    activationSha256: hash('a'),
    buildSha256: hash('b'),
    decisionSha256,
  };
  const eligibility = {
    sceneRoles: ['launch transition'],
    buildSha256: hash('b'),
    approvedMotionRecipe: receipt,
    fallbackAttempted: true,
  };
  assert.equal(resolveMarketingArtDirection(input({ eligibility })).motionDecision, 'one');
  assert.throws(() => resolveMarketingArtDirection(input({
    eligibility: { ...eligibility, approvedMotionRecipe: { ...receipt, decisionSha256: hash('e') } },
  })), /canonical recipe decision projection/);
  assert.throws(() => resolveMarketingArtDirection(input({
    eligibility: { ...eligibility, approvedMotionRecipe: { ...receipt, recipeBytes: '{"recipe":"stale"}' } },
  })), /exact recipe bytes/);
  assert.throws(() => resolveMarketingArtDirection(input({
    eligibility: { ...eligibility, approvedMotionRecipe: { ...receipt, activationSha256: hash('e') } },
  })), /current activation and build/);
  assert.throws(() => resolveMarketingArtDirection(input({
    eligibility: { ...eligibility, approvedMotionRecipe: { ...receipt, buildSha256: hash('e') } },
  })), /current activation and build/);
});
test('canonical Beat budgets require a non-canonical current-user exception receipt to exceed them', () => {
  assert.equal(beatBudgetForRegister('quiet'), 5);
  assert.equal(beatBudgetForRegister('confident'), 7);
  assert.equal(beatBudgetForRegister('showpiece'), 7);
  assert.equal(exceedsCanonicalBeatBudget('quiet', ['B-1', 'B-2', 'B-3', 'B-4', 'B-5', 'B-6'], NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256), true);
  assert.equal(exceedsCanonicalBeatBudget('confident', ['B-1', 'B-2', 'B-3', 'B-4', 'B-5', 'B-6', 'B-7', 'B-8'], hash('e')), false);
});
