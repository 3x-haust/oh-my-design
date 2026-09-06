import type { BrowserObservationDecisionRef } from '../runtime/browser-observation.ts';
import type { StableProjectFileSystem } from '../runtime/stable-project-file.ts';

export const LEARNING_PROMOTION_INPUT_SCHEMA = 'validated-learning-promotion-input-v1';
export const LEARNING_RESULT_SCHEMA = 'validated-learning-result-v1';
export const REUSABLE_SCOPED_RULE_SCHEMA = 'reusable-scoped-rule-v1';

export type LearningScope = Readonly<{
  surface: string;
  route: string;
  testedState: string;
  viewport: Readonly<{ width: number; height: number }>;
}>;
export type LearningProposition = Readonly<{
  id: string;
  statement: string;
  scope: LearningScope;
}>;
export type LearningValidation = Readonly<{
  runId: string;
  contextId: string;
  outcome: 'validated' | 'contradicted';
  observedAt: string;
  decisionGraphPath: string;
  browserEvidence: unknown;
}>;
export type LearningPromotionInput = Readonly<{
  schema: typeof LEARNING_PROMOTION_INPUT_SCHEMA;
  proposition: LearningProposition;
  validations: readonly LearningValidation[];
}>;
export type LearningProvenance = Readonly<{
  runId: string;
  contextId: string;
  outcome: LearningValidation['outcome'];
  observedAt: string;
  decisionGraphPath: string;
  decisionGraphSha256: string;
  observationSha256: string;
  capture: Readonly<{ path: string; sha256: string }>;
  decisionRefs: readonly BrowserObservationDecisionRef[];
}>;
type LearningResultBase = Readonly<{
  schema: typeof LEARNING_RESULT_SCHEMA;
  id: string;
  propositionSha256: string;
  proposition: LearningProposition;
  provenance: readonly LearningProvenance[];
  blockers: readonly string[];
  evaluatedAt: string;
}>;
export type ReusableScopedRule = Readonly<{
  schema: typeof REUSABLE_SCOPED_RULE_SCHEMA;
  id: string;
  statement: string;
  scope: LearningScope;
  applicability: 'advisory';
  authority: 'browser-validated-design-learning';
  cannotOverride: readonly ['hard-safety-rails', 'model-or-system-instructions', 'user-facts'];
  provenance: readonly LearningProvenance[];
  promotedAt: string;
}>;
export type CandidateLearningResult = LearningResultBase & Readonly<{
  status: 'candidate';
}>;
export type PromotedLearningResult = LearningResultBase & Readonly<{
  status: 'promoted';
  rule: ReusableScopedRule;
}>;
export type LearningPromotionResult = CandidateLearningResult | PromotedLearningResult;
export type LearningPromotionDependencies = Readonly<{
  now: string;
  projectRoot: string;
  fs: StableProjectFileSystem;
  idFor: (propositionSha256: string) => string;
}>;
export type LearningPublicationReceipt = Readonly<{
  status: LearningPromotionResult['status'];
  statePath: string;
  rulePath?: string;
}>;

export type LearningPromotionErrorCode =
  | 'MALFORMED_INPUT'
  | 'MUTABLE_INPUT'
  | 'MALFORMED_ID'
  | 'MALFORMED_SCOPE'
  | 'MALFORMED_TIMESTAMP'
  | 'INVALID_BROWSER_EVIDENCE'
  | 'DUPLICATE_EVIDENCE'
  | 'UNSAFE_PROPOSITION';

export class LearningPromotionError extends Error {
  override readonly name = 'LearningPromotionError';
  readonly code: LearningPromotionErrorCode;
  constructor(code: LearningPromotionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
