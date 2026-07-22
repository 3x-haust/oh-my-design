import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { referenceHandoffPayloadSha256 } from '../ref/reference-handoff.ts';
import { materializeSettledReferenceSelection, motionResolutionProjectionSha256, referenceSelectionV2Sha256, resolveMotionProjection } from '../ref/reference-selection.ts';
import type { ReferenceHandoffReceipt } from '../ref/reference-handoff.ts';
import type { MotionResolutionProjection, ReferenceSelectionV2 } from '../ref/reference-selection.ts';
import type { IntentLock } from '../runtime/intent.ts';
import {
  ART_DIRECTION_SCHEMA_VERSION,
  ArtDirectionValidationError,
  type ArtDirectionAlternative,
  type ArtDirectionDecision,
  type ArtDirectionReference,
  isMotionDecision,
  isRegister,
  type MotionDecision,
  type Register,
} from './schema.ts';

export type DecisionQualityGates = {
  readonly blindSignatureGreen: boolean;
  readonly narrativeGreen: boolean;
  readonly motionFitGreen: boolean;
  readonly fidelityDecisionFitGreen: boolean;
  readonly macroLandingScore: number;
  readonly motionInfluenceScore?: number;
  readonly staticReferenceInfluenceScore?: number;
  readonly templateBreakingLandingScore?: number;
};

export type ApprovedMotionRecipeReceipt = {
  readonly recipeId: string;
  /** Exact approved recipe bytes; their digest is the authority bound into the settlement. */
  readonly recipeBytes: string;
  readonly recipeSha256: string;
  readonly activationSha256: string;
  readonly buildSha256: string;
  /** Evaluator-authored decision receipt, deliberately outside the recipe/settlement hash cycle. */
  readonly decisionSha256: string;
};
export type RecipeDecisionProjection = {
  readonly alternativesSha256: string;
  readonly winner: Register;
  readonly motionDecision: MotionDecision;
  readonly slots: readonly Pick<MotionResolutionProjection['slots'][number], 'slotId' | 'obligationDisposition'>[];
  readonly approvedRecipe: {
    readonly recipeId: string;
    readonly recipeSha256: string;
  };
};

export function recipeDecisionProjectionSha256(projection: RecipeDecisionProjection): string {
  return createHash('sha256').update(canonicalJson({
    alternativesSha256: projection.alternativesSha256,
    winner: projection.winner,
    motionDecision: projection.motionDecision,
    slots: projection.slots
      .map((slot) => ({ slotId: slot.slotId, obligationDisposition: slot.obligationDisposition }))
      .sort((left, right) => left.slotId.localeCompare(right.slotId)),
    approvedRecipe: {
      recipeId: projection.approvedRecipe.recipeId,
      recipeSha256: projection.approvedRecipe.recipeSha256,
    },
  })).digest('hex');
}


export type ArtDirectionEligibility = {
  readonly sceneRoles: readonly string[];
  readonly buildSha256?: string;
  readonly selectedMotionReferenceSlotId?: string;
  /** Legacy caller booleans are rejected at runtime; only a receipt authorizes a recipe. */
  readonly approvedMotionRecipe?: ApprovedMotionRecipeReceipt | boolean;
  readonly fallbackAttempted: boolean;
  /** Publication evidence belongs to post-render review and is never a resolution prerequisite. */
  readonly qualityGates?: DecisionQualityGates;
};

export type EvaluatorAuthoredResolutionEvidence = {
  /** Hashes emitted by the evaluator that assessed all alternatives, never by a choice caller. */
  readonly invocationSha256: string;
  readonly payloadSha256: string;
  readonly resultSha256: string;
  readonly assessments: readonly {
    readonly register: Register;
    readonly score: number;
    readonly subjectIdentityRationale: string;
    readonly conceptRoleRationale: string;
    readonly uxAccessibilityPerformanceRationale: string;
    readonly lawfulFeasibilityRationale: string;
    readonly referenceEvidenceRationale: string;
    readonly rejectionRationale: string;
  }[];
};

export type CanonicalReferenceBindings = {
  readonly canonicalSelectionSha256: string;
  readonly canonicalHandoffSha256: string;
  readonly selection: ReferenceSelectionV2;
  readonly handoff: ReferenceHandoffReceipt;
};

export type ResolveMarketingArtDirectionInput = {
  readonly activationSha256: string;
  readonly intentSha256: string;
  readonly boardSha256: string;
  readonly selectionSha256: string;
  readonly route: string;
  readonly intent: IntentLock;
  readonly alternatives: readonly ArtDirectionAlternative[];
  readonly references: readonly ArtDirectionReference[];
  readonly referenceBindings: CanonicalReferenceBindings;
  readonly evaluatorEvidence: EvaluatorAuthoredResolutionEvidence;
  /** Evaluator-owned, content-addressed settlement of all pending motion slots. */
  readonly motionResolution: MotionResolutionProjection;
  readonly eligibility: ArtDirectionEligibility;
  readonly implementationLane: string;
  readonly fallbackPath: string;
  readonly performanceAccessibilityBudget: string;
  /** Null is the explicit no-exception state; a hash must be the exact host-authorized Beat-exception event receipt. */
  readonly beatExceptionReceiptSha256?: string | null;
};

const SHA256 = /^[a-f0-9]{64}$/;
/**
 * Canonical explicit absence marker. It is not an intent-ledger hash and can never authorize
 * an over-budget Beat set.
 */
export const NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256 = createHash('sha256')
  .update(canonicalJson({ kind: 'no-current-user-beat-exception' }))
  .digest('hex');
export function beatBudgetForRegister(register: Register): number {
  return register === 'quiet' ? 5 : 7;
}

export function exceedsCanonicalBeatBudget(
  register: Register,
  beatIds: readonly string[],
  currentUserBeatExceptionReceiptSha256: string,
): boolean {
  return beatIds.length > beatBudgetForRegister(register)
    && currentUserBeatExceptionReceiptSha256 === NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256;
}
const FORBIDDEN_NONE_RATIONALE = /\b(category|anti-reference|restraint|capability|fear of slop)\b|\bgeneric performance\b/i;
const DECISION_KEYS = [
  'schemaVersion', 'activationSha256', 'intentSha256', 'boardSha256', 'preSelectionSha256', 'route', 'source',
  'consideredAlternatives', 'alternativesSha256', 'selectedRegister', 'motionDecision', 'conceptRole',
  'selectedStaticReferenceSlotIds', 'selectedMotionReferenceSlotIds', 'implementationLane', 'fallbackPath',
  'performanceAccessibilityBudget', 'rejectedAlternatives', 'motionResolutionProjectionSha256', 'settledSelectionSha256',
  'authorInvocationSha256', 'authorPayloadSha256', 'authorResultSha256', 'currentUserBeatExceptionReceiptSha256',
] as const;

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requireText(value: string, field: string): void {
  if (value.trim().length === 0) throw new ArtDirectionValidationError(`${field} must not be empty`);
}

function requireHash(value: string, field: string): void {
  if (!SHA256.test(value)) throw new ArtDirectionValidationError(`${field} must be a lowercase SHA-256 hash`);
}

function resolveBeatExceptionReceipt(receipt: string | null | undefined): string {
  if (receipt === null || receipt === undefined) return NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256;
  requireHash(receipt, 'beat exception receipt');
  return receipt;
}

function byRegister(alternatives: readonly ArtDirectionAlternative[], register: Register): ArtDirectionAlternative {
  const alternative = alternatives.find((item) => item.register === register);
  if (alternative === undefined) throw new ArtDirectionValidationError(`missing ${register} alternative`);
  return alternative;
}

function citedReferences(slotIds: readonly string[], references: readonly ArtDirectionReference[]): ArtDirectionReference[] {
  const bySlot = new Map(references.map((reference) => [reference.slotId, reference]));
  return slotIds.map((slotId) => {
    const reference = bySlot.get(slotId);
    if (reference === undefined) throw new ArtDirectionValidationError(`unknown reference slot ${slotId}`);
    return reference;
  });
}
function canonicalReferences(bindings: CanonicalReferenceBindings): readonly ArtDirectionReference[] {
  return bindings.selection.slots.map((slot) => ({
    slotId: slot.slotId,
    signal: slot.signal,
    positive: slot.rights === 'lawful' && slot.signal !== 'anti-reference',
    lawful: slot.rights === 'lawful',
    motionObligation: 'none',
  }));
}

function validateCanonicalSelectionSlots(selection: ReferenceSelectionV2): void {
  for (const slot of selection.slots) {
    if (slot.signal === 'anti-reference' && slot.obligationDisposition === 'used') throw new ArtDirectionValidationError(`anti-reference slot ${slot.slotId} cannot support art direction`);
    if (slot.rights !== 'lawful' && slot.obligationDisposition === 'used') throw new ArtDirectionValidationError(`non-lawful slot ${slot.slotId} cannot support art direction`);
    if (slot.signal === 'high-motion' && slot.motionAxis === 'absent' && slot.obligationDisposition === 'used') throw new ArtDirectionValidationError(`absent motion slot ${slot.slotId} cannot support art direction`);
    if (slot.signal === 'high-motion' && slot.motionAxis === 'available' && slot.obligationDisposition !== 'not-applicable') throw new ArtDirectionValidationError(`available motion slot ${slot.slotId} must remain pending until evaluator resolution`);
  }
}

function validateReferenceBindings(bindings: CanonicalReferenceBindings): readonly ArtDirectionReference[] {
  requireHash(bindings.canonicalSelectionSha256, 'canonicalSelectionSha256');
  requireHash(bindings.canonicalHandoffSha256, 'canonicalHandoffSha256');
  if (bindings.canonicalSelectionSha256 !== referenceSelectionV2Sha256(bindings.selection)) throw new ArtDirectionValidationError('canonical selection hash is stale');
  validateCanonicalSelectionSlots(bindings.selection);
  const { payloadSha256, ...receipt } = bindings.handoff;
  if (payloadSha256 !== referenceHandoffPayloadSha256(receipt) || bindings.canonicalHandoffSha256 !== payloadSha256) throw new ArtDirectionValidationError('canonical handoff hash is stale');
  if (bindings.handoff.role !== 'art-direction' || bindings.handoff.artDirectionSha256 !== undefined) throw new ArtDirectionValidationError('canonical handoff must be the current pre-composition art-direction handoff');
  if (bindings.handoff.preSelectionSha256 !== bindings.canonicalSelectionSha256) throw new ArtDirectionValidationError('handoff does not bind the canonical pre-selection');
  if (bindings.handoff.captureSha256 !== bindings.selection.captureSha256 || bindings.handoff.assemblySha256 !== bindings.selection.assemblySha256 || bindings.handoff.projectionSha256 !== bindings.selection.projectionSha256) {
    throw new ArtDirectionValidationError('handoff does not bind the current canonical selection artifacts');
  }
  const motion = bindings.selection.slots
    .filter((slot) => slot.signal === 'high-motion' && slot.motionAxis === 'available')
    .map((slot) => ({ slotId: slot.slotId, disposition: slot.obligationDisposition, reason: slot.obligationReason }))
    .sort((left, right) => left.slotId.localeCompare(right.slotId));
  if (canonicalJson(bindings.handoff.positiveMotion.slots) !== canonicalJson(motion)) throw new ArtDirectionValidationError('handoff motion obligations do not match canonical selection');
  return canonicalReferences(bindings);
}

function requireCanonicalReferences(references: readonly ArtDirectionReference[], canonical: readonly ArtDirectionReference[]): void {
  if (canonicalJson(references) !== canonicalJson(canonical)) throw new ArtDirectionValidationError('references do not match canonical selected alternatives');
}

function validateAlternative(alternative: ArtDirectionAlternative, references: readonly ArtDirectionReference[]): void {
  if (typeof alternative !== 'object' || alternative === null || !hasExactKeys(alternative, [
    'register', 'subjectIdentityFit', 'staticReferenceSlotIds', 'motionReferenceSlotIds', 'conceptRole',
    'macroCompositionHypothesis', 'motionHypothesis', 'uxAccessibilityPerformanceRisks',
    'lawfulImplementationPath', 'rejectionCondition',
  ]) || !isRegister(alternative.register) || !isMotionDecision(alternative.motionHypothesis)
    || !Array.isArray(alternative.staticReferenceSlotIds) || !Array.isArray(alternative.motionReferenceSlotIds)
    || !Array.isArray(alternative.uxAccessibilityPerformanceRisks)
    || !['subjectIdentityFit', 'conceptRole', 'macroCompositionHypothesis', 'lawfulImplementationPath', 'rejectionCondition']
      .every((field) => typeof alternative[field as keyof ArtDirectionAlternative] === 'string')
    || !alternative.staticReferenceSlotIds.every((slotId) => typeof slotId === 'string' && slotId.trim() !== '')
    || !alternative.motionReferenceSlotIds.every((slotId) => typeof slotId === 'string' && slotId.trim() !== '')
    || !alternative.uxAccessibilityPerformanceRisks.every((risk) => typeof risk === 'string' && risk.trim() !== '')) {
    throw new ArtDirectionValidationError('alternative has an invalid exact shape');
  }
  for (const [field, value] of Object.entries({
    subjectIdentityFit: alternative.subjectIdentityFit,
    conceptRole: alternative.conceptRole,
    macroCompositionHypothesis: alternative.macroCompositionHypothesis,
    lawfulImplementationPath: alternative.lawfulImplementationPath,
    rejectionCondition: alternative.rejectionCondition,
  })) requireText(value, field);
  if (alternative.staticReferenceSlotIds.length === 0) throw new ArtDirectionValidationError(`${alternative.register} must cite a static/layout reference`);
  citedReferences([...alternative.staticReferenceSlotIds, ...alternative.motionReferenceSlotIds], references).forEach((reference) => {
    if (!reference.lawful || !reference.positive || reference.signal === 'anti-reference') {
      throw new ArtDirectionValidationError(`${alternative.register} cites non-positive or unlawful evidence`);
    }
  });
}

function resolveEvaluatorChoice(
  evidence: EvaluatorAuthoredResolutionEvidence,
  alternatives: readonly ArtDirectionAlternative[],
): ArtDirectionAlternative {
  if (typeof evidence !== 'object' || evidence === null || !hasExactKeys(evidence, ['assessments', 'invocationSha256', 'payloadSha256', 'resultSha256'])
    || !Array.isArray(evidence.assessments)) {
    throw new ArtDirectionValidationError('evaluator evidence has an invalid exact shape');
  }
  [evidence.invocationSha256, evidence.payloadSha256, evidence.resultSha256].forEach((value, index) => requireHash(value, `evaluator provenance ${index}`));
  if (evidence.assessments.length !== alternatives.length
    || new Set(evidence.assessments.map((assessment) => assessment.register)).size !== alternatives.length) {
    throw new ArtDirectionValidationError('evaluator evidence must assess every alternative exactly once');
  }
  const byAssessment = new Map(evidence.assessments.map((assessment) => [assessment.register, assessment]));
  for (const alternative of alternatives) {
    const assessment = byAssessment.get(alternative.register);
    if (assessment === undefined || typeof assessment !== 'object' || assessment === null
      || !hasExactKeys(assessment, ['conceptRoleRationale', 'lawfulFeasibilityRationale', 'rejectionRationale', 'referenceEvidenceRationale', 'register', 'score', 'subjectIdentityRationale', 'uxAccessibilityPerformanceRationale'])
      || !isRegister(assessment.register) || !Number.isFinite(assessment.score)) {
      throw new ArtDirectionValidationError(`evaluator evidence is missing a finite score for ${alternative.register}`);
    }
    for (const [field, value] of Object.entries({
      subjectIdentityRationale: assessment.subjectIdentityRationale,
      conceptRoleRationale: assessment.conceptRoleRationale,
      uxAccessibilityPerformanceRationale: assessment.uxAccessibilityPerformanceRationale,
      lawfulFeasibilityRationale: assessment.lawfulFeasibilityRationale,
      referenceEvidenceRationale: assessment.referenceEvidenceRationale,
      rejectionRationale: assessment.rejectionRationale,
    })) requireText(value, `evaluator.${field}`);
  }
  const ranked = [...alternatives].sort((left, right) => {
    const difference = byAssessment.get(right.register)!.score - byAssessment.get(left.register)!.score;
    return difference === 0 ? left.register.localeCompare(right.register) : difference;
  });
  if (byAssessment.get(ranked[0]!.register)!.score === byAssessment.get(ranked[1]!.register)!.score) {
    throw new ArtDirectionValidationError('evaluator evidence must produce one unambiguous winning alternative');
  }
  if (ranked[0]!.uxAccessibilityPerformanceRisks.length === 0) throw new ArtDirectionValidationError('selected alternative must state UX, accessibility, and performance risks');
  return ranked[0]!;
}

function validateRecipeReceipt(receipt: ApprovedMotionRecipeReceipt | boolean, decision: ArtDirectionDecision, buildSha256: string | undefined, resolution: MotionResolutionProjection): void {
  if (typeof receipt === 'boolean' || buildSha256 === undefined
    || !hasExactKeys(receipt, ['activationSha256', 'buildSha256', 'decisionSha256', 'recipeBytes', 'recipeId', 'recipeSha256'])
    || receipt.recipeId.trim() === '' || receipt.recipeBytes === '') {
    throw new ArtDirectionValidationError('approved motion recipe receipt has an invalid shape');
  }
  [receipt.recipeSha256, receipt.activationSha256, receipt.buildSha256, receipt.decisionSha256, buildSha256].forEach((value, index) => requireHash(value, `recipe hash ${index}`));
  if (createHash('sha256').update(receipt.recipeBytes).digest('hex') !== receipt.recipeSha256) {
    throw new ArtDirectionValidationError('approved motion recipe receipt does not bind exact recipe bytes');
  }
  if (receipt.activationSha256 !== decision.activationSha256 || receipt.buildSha256 !== buildSha256) {
    throw new ArtDirectionValidationError('approved motion recipe receipt is not bound to the current activation and build');
  }
  if (receipt.decisionSha256 !== recipeDecisionProjectionSha256({
    alternativesSha256: decision.alternativesSha256,
    winner: decision.selectedRegister,
    motionDecision: decision.motionDecision,
    slots: resolution.slots,
    approvedRecipe: receipt,
  })) {
    throw new ArtDirectionValidationError('approved motion recipe receipt is not bound to the canonical recipe decision projection');
  }
}


function validateEligibility(decision: ArtDirectionDecision, references: readonly ArtDirectionReference[], eligibility: ArtDirectionEligibility, resolution: MotionResolutionProjection): void {
  const selected = byRegister(decision.consideredAlternatives, decision.selectedRegister);
  const selectedReferences = citedReferences([...decision.selectedStaticReferenceSlotIds, ...decision.selectedMotionReferenceSlotIds], references);
  const slotId = eligibility.selectedMotionReferenceSlotId;
  const recipe = eligibility.approvedMotionRecipe;
  if (slotId !== undefined && recipe !== undefined) throw new ArtDirectionValidationError('one accepts either a selected reference slot or an approved recipe receipt, never both');
  if (decision.motionDecision === 'one') {
    if (eligibility.sceneRoles.length !== 1 || eligibility.sceneRoles[0]?.trim().length === 0) throw new ArtDirectionValidationError('one requires exactly one declared concept-bearing scene');
    if (!selectedReferences.some((reference) => reference.signal === 'high-visual-system' && reference.positive && reference.lawful)) throw new ArtDirectionValidationError('one requires a lawful high-visual-system reference');
    if (slotId !== undefined) {
      if (decision.selectedMotionReferenceSlotIds.length !== 1 || decision.selectedMotionReferenceSlotIds[0] !== slotId
        || !selectedReferences.some((reference) => reference.slotId === slotId && reference.signal === 'high-motion' && reference.positive && reference.lawful)) {
        throw new ArtDirectionValidationError('one requires exactly one lawful evaluator-selected motion reference slot');
      }
    } else if (recipe !== undefined) {
      if (decision.selectedMotionReferenceSlotIds.length !== 0) throw new ArtDirectionValidationError('a recipe-backed one cannot retain a reference motion slot');
      validateRecipeReceipt(recipe, decision, eligibility.buildSha256, resolution);
    } else {
      throw new ArtDirectionValidationError('one requires either a lawful selected motion reference slot or an approved recipe receipt');
    }
    return;
  }
  if (slotId !== undefined || recipe !== undefined) throw new ArtDirectionValidationError('none cannot select motion influence');
  if (eligibility.sceneRoles.length !== 0) throw new ArtDirectionValidationError('none cannot declare a signature scene');
  if (!selectedReferences.some((reference) => reference.signal === 'high-visual-system' && reference.positive && reference.lawful)) throw new ArtDirectionValidationError('none requires a lawful selected high-visual-system static reference');
  const staticMinimum: Record<Register, number> = { quiet: 1, confident: 2, showpiece: 3 };
  if (decision.selectedStaticReferenceSlotIds.length < staticMinimum[decision.selectedRegister]) {
    throw new ArtDirectionValidationError(`none ${decision.selectedRegister} requires ${staticMinimum[decision.selectedRegister]} selected static references`);
  }
  if (!eligibility.fallbackAttempted || !/\b(css|svg|static|reduced.motion)\b/i.test(decision.fallbackPath)) throw new ArtDirectionValidationError('none requires a tried lawful CSS/SVG/static or reduced-motion fallback');
  if (!/\b(template|departure|break)\b/i.test(selected.macroCompositionHypothesis)) throw new ArtDirectionValidationError('none requires a declared template-breaking macro departure');
  for (const rejected of decision.rejectedAlternatives) {
    if (FORBIDDEN_NONE_RATIONALE.test(rejected.reason)) throw new ArtDirectionValidationError('none rejection reason uses a forbidden generic rationale');
  }
  if (decision.selectedMotionReferenceSlotIds.length !== 0) throw new ArtDirectionValidationError('none cannot retain a selected motion slot');
  for (const rejection of resolution.slots) {
    if (rejection.obligationDisposition !== 'rejected' || FORBIDDEN_NONE_RATIONALE.test(rejection.obligationReason)) {
      throw new ArtDirectionValidationError('none motion rejection must come from the authorized resolution with a specific rationale');
    }
  }
}
function validateMotionResolution(resolution: MotionResolutionProjection, input: ResolveMarketingArtDirectionInput, motionDecision: MotionDecision): { readonly digest: string; readonly settledSelectionSha256: string; readonly projection: MotionResolutionProjection } {
  const alternativesSha256 = createHash('sha256').update(canonicalJson(input.alternatives)).digest('hex');
  const settled = resolveMotionProjection({ ...resolution, selection: input.referenceBindings.selection });
  if (settled.activationSha256 !== input.activationSha256 || settled.alternativesSha256 !== alternativesSha256
    || settled.selectionSha256 !== input.referenceBindings.canonicalSelectionSha256 || settled.handoffSha256 !== input.referenceBindings.canonicalHandoffSha256
    || settled.evaluatorInvocationSha256 !== input.evaluatorEvidence.invocationSha256 || settled.evaluatorPayloadSha256 !== input.evaluatorEvidence.payloadSha256
    || settled.evaluatorResultSha256 !== input.evaluatorEvidence.resultSha256 || settled.motionDecision !== motionDecision) {
    throw new ArtDirectionValidationError('motion resolution is not bound to the current alternatives, activation, selection, handoff, and evaluator evidence');
  }
  if (motionDecision === 'one') {
    const slotId = input.eligibility.selectedMotionReferenceSlotId;
    if ((settled.approvedRecipe === undefined && slotId !== settled.slots.find((slot) => slot.obligationDisposition === 'used')?.slotId)
      || (settled.approvedRecipe !== undefined && (slotId !== undefined || input.eligibility.approvedMotionRecipe === undefined
        || typeof input.eligibility.approvedMotionRecipe === 'boolean'
        || input.eligibility.approvedMotionRecipe.recipeId !== settled.approvedRecipe.recipeId
        || input.eligibility.approvedMotionRecipe.recipeSha256 !== settled.approvedRecipe.recipeSha256))) {
      throw new ArtDirectionValidationError('motion resolution does not bind the selected slot or approved recipe');
    }
  }
  const settledSelection = materializeSettledReferenceSelection(input.referenceBindings.selection, { ...settled, selection: input.referenceBindings.selection });
  return { digest: motionResolutionProjectionSha256(settled), settledSelectionSha256: referenceSelectionV2Sha256(settledSelection), projection: settled };
}

export function validateArtDirectionDecision(decision: ArtDirectionDecision, references: readonly ArtDirectionReference[], eligibility: ArtDirectionEligibility, referenceBindings?: CanonicalReferenceBindings, motionResolution?: MotionResolutionProjection): ArtDirectionDecision {
  const canonical = referenceBindings === undefined ? references : validateReferenceBindings(referenceBindings);
  if (referenceBindings !== undefined) {
    if (decision.preSelectionSha256 !== referenceBindings.canonicalSelectionSha256) throw new ArtDirectionValidationError('decision pre-selection hash does not bind the canonical selection');
    if (decision.boardSha256 !== referenceBindings.selection.captureSha256) throw new ArtDirectionValidationError('decision board hash does not bind the current canonical selection');
    requireCanonicalReferences(references, canonical);
  }
  if (!hasExactKeys(decision, DECISION_KEYS) || decision.schemaVersion !== ART_DIRECTION_SCHEMA_VERSION || !decision.route || decision.compositionSha256 !== undefined || decision.userPrompt !== undefined) throw new ArtDirectionValidationError('decision has an invalid pre-composition shape');
  [decision.activationSha256, decision.intentSha256, decision.boardSha256, decision.preSelectionSha256, decision.alternativesSha256, decision.motionResolutionProjectionSha256, decision.settledSelectionSha256, decision.authorInvocationSha256, decision.authorPayloadSha256, decision.authorResultSha256, decision.currentUserBeatExceptionReceiptSha256].forEach((value, index) => requireHash(value, `hash ${index}`));
  if (decision.consideredAlternatives.length !== 3 || new Set(decision.consideredAlternatives.map((alternative) => alternative.register)).size !== 3) throw new ArtDirectionValidationError('decision must compare exactly quiet, confident, and showpiece');
  decision.consideredAlternatives.forEach((alternative) => validateAlternative(alternative, canonical));
  if (decision.alternativesSha256 !== createHash('sha256').update(canonicalJson(decision.consideredAlternatives)).digest('hex')) throw new ArtDirectionValidationError('decision alternatives hash is stale');
  const selected = byRegister(decision.consideredAlternatives, decision.selectedRegister);
  if (selected.motionHypothesis !== decision.motionDecision || selected.conceptRole !== decision.conceptRole) throw new ArtDirectionValidationError('selection must preserve the chosen alternative');
  if (decision.rejectedAlternatives.length !== 2
    || new Set(decision.rejectedAlternatives.map((rejected) => rejected.register)).size !== 2
    || decision.rejectedAlternatives.some((rejected) => rejected.register === decision.selectedRegister
      || rejected.reason.trim().length === 0 || rejected.citedReferenceSlotIds.length === 0)) {
    throw new ArtDirectionValidationError('decision must record two distinct evidenced rejected alternatives');
  }
  for (const rejected of decision.rejectedAlternatives) {
    const alternative = byRegister(decision.consideredAlternatives, rejected.register);
    if (rejected.reason !== alternative.rejectionCondition
      || canonicalJson(rejected.citedReferenceSlotIds) !== canonicalJson([...alternative.staticReferenceSlotIds, ...alternative.motionReferenceSlotIds])) {
      throw new ArtDirectionValidationError('rejected alternative does not preserve its evaluated evidence');
    }
    citedReferences(rejected.citedReferenceSlotIds, canonical);
  }
  if (motionResolution === undefined) throw new ArtDirectionValidationError('decision validation requires an authorized motion resolution');
  const settledSelection = materializeSettledReferenceSelection(referenceBindings?.selection ?? (() => {
    throw new ArtDirectionValidationError('decision validation requires pre-selection lineage');
  })(), { ...motionResolution, selection: referenceBindings!.selection });
  if (motionResolutionProjectionSha256(motionResolution) !== decision.motionResolutionProjectionSha256
    || motionResolution.selectionSha256 !== decision.preSelectionSha256
    || motionResolution.motionDecision !== decision.motionDecision
    || motionResolution.evaluatorInvocationSha256 !== decision.authorInvocationSha256
    || motionResolution.evaluatorPayloadSha256 !== decision.authorPayloadSha256
    || motionResolution.evaluatorResultSha256 !== decision.authorResultSha256
    || referenceSelectionV2Sha256(settledSelection) !== decision.settledSelectionSha256) {
    throw new ArtDirectionValidationError('decision does not bind the exact authorized motion settlement');
  }
  validateEligibility(decision, canonical, eligibility, motionResolution);
  return decision;
}

export function resolveMarketingArtDirection(input: ResolveMarketingArtDirectionInput): ArtDirectionDecision {
  if (input.route.trim().length === 0) throw new ArtDirectionValidationError('route must not be empty');
  if (input.alternatives.length !== 3 || new Set(input.alternatives.map((alternative) => alternative.register)).size !== 3) throw new ArtDirectionValidationError('silent marketing requires exactly three alternatives');
  const canonical = validateReferenceBindings(input.referenceBindings);
  if (input.selectionSha256 !== input.referenceBindings.canonicalSelectionSha256) throw new ArtDirectionValidationError('selection hash does not bind the canonical selection');
  if (input.boardSha256 !== input.referenceBindings.selection.captureSha256) throw new ArtDirectionValidationError('board hash does not bind the current canonical selection');
  requireCanonicalReferences(input.references, canonical);
  input.alternatives.forEach((alternative) => validateAlternative(alternative, canonical));
  const lock = input.intent;
  const evaluatorSelected = resolveEvaluatorChoice(input.evaluatorEvidence, input.alternatives);
  const selected = lock.register === undefined
    ? evaluatorSelected
    : byRegister(input.alternatives, lock.register);
  const motionDecision: MotionDecision = lock.motionDecision ?? selected.motionHypothesis;
  if (lock.register !== undefined && lock.motionDecision !== undefined && selected.motionHypothesis !== lock.motionDecision) throw new ArtDirectionValidationError('explicit current-user motion lock conflicts with its selected register alternative');
  if (lock.register === undefined && lock.motionDecision !== undefined && evaluatorSelected.motionHypothesis !== lock.motionDecision) throw new ArtDirectionValidationError('explicit current-user motion lock conflicts with evaluator evidence');
  if (motionDecision === 'one' && input.eligibility.selectedMotionReferenceSlotId !== undefined
    && !selected.motionReferenceSlotIds.includes(input.eligibility.selectedMotionReferenceSlotId)) {
    throw new ArtDirectionValidationError('evaluator-selected motion slot must be cited by the selected alternative');
  }
  const motionResolution = validateMotionResolution(input.motionResolution, input, motionDecision);
  const rejectedAlternatives = input.alternatives.filter((alternative) => alternative.register !== selected.register).map((alternative) => ({ register: alternative.register, reason: alternative.rejectionCondition, citedReferenceSlotIds: [...alternative.staticReferenceSlotIds, ...alternative.motionReferenceSlotIds] }));
  const decision: ArtDirectionDecision = {
    schemaVersion: ART_DIRECTION_SCHEMA_VERSION,
    activationSha256: input.activationSha256,
    intentSha256: input.intentSha256,
    boardSha256: input.boardSha256,
    preSelectionSha256: input.selectionSha256,
    route: input.route,
    source: lock.register !== undefined || lock.motionDecision !== undefined ? 'explicit-user' : 'agent-evidence',
    consideredAlternatives: input.alternatives,
    alternativesSha256: createHash('sha256').update(canonicalJson(input.alternatives)).digest('hex'),
    selectedRegister: selected.register,
    motionDecision,
    conceptRole: selected.conceptRole,
    selectedStaticReferenceSlotIds: selected.staticReferenceSlotIds,
    selectedMotionReferenceSlotIds: motionDecision === 'one' && input.eligibility.selectedMotionReferenceSlotId !== undefined
      ? [input.eligibility.selectedMotionReferenceSlotId]
      : [],
    motionResolutionProjectionSha256: motionResolution.digest,
    settledSelectionSha256: motionResolution.settledSelectionSha256,
    implementationLane: input.implementationLane,
    fallbackPath: input.fallbackPath,
    performanceAccessibilityBudget: input.performanceAccessibilityBudget,
    rejectedAlternatives,
    authorInvocationSha256: input.evaluatorEvidence.invocationSha256,
    authorPayloadSha256: input.evaluatorEvidence.payloadSha256,
    authorResultSha256: input.evaluatorEvidence.resultSha256,
    currentUserBeatExceptionReceiptSha256: resolveBeatExceptionReceipt(input.beatExceptionReceiptSha256),
  };
  return validateArtDirectionDecision(decision, canonical, input.eligibility, input.referenceBindings, motionResolution.projection);
}
