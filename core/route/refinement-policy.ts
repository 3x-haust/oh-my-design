import { createHash } from 'node:crypto';
import type { MeasuredAxis } from '../measure/citations.ts';
import type { AdaptiveRouteRecord } from './adaptive-flow-domain.ts';

export const REFINEMENT_AXIS_FLOORS = { typography: 3, spacingRhythm: 3, contrastColorRoles: 3, density: 3,
  hierarchy: 4, composition: 4, beautyDesirability: 4, domainSpecificity: 3, humanAuthorship: 3,
  usability: 3, responsiveCraft: 3 } as const satisfies Record<MeasuredAxis, number>;

export function routeRefinementPolicy(route: Pick<AdaptiveRouteRecord, 'sourceContractSha256' | 'sourceContract'>) {
  const purpose = route.sourceContract.reviewPurpose ?? 'unmigrated';
  const failureRisk = route.sourceContract.designAxes.failureRisk;
  const qualityAcceptance = purpose !== 'ordinary' || route.sourceContract.designAxes.expressiveDesignNeed === 'showpiece'
    ? 'showcase' : failureRisk === 'high' ? 'high-risk' : 'standard';
  const policy = { schema: 'refinement-policy-v1', sourceContractSha256: route.sourceContractSha256,
    purpose, failureRisk, qualityAcceptance, allowance: 4,
    floors: Object.fromEntries(Object.entries(REFINEMENT_AXIS_FLOORS).map(([axis, floor]) => [axis, qualityAcceptance === 'standard' ? 3 : floor])) };
  return { ...policy, policySha256: createHash('sha256').update(JSON.stringify(policy)).digest('hex') };
}

export type RefinementIssue = Readonly<{ issueKey: string; criterionId: string; severity: 'advisory' | 'material' | 'task' | 'accessibility' | 'safety'; consequence: string }>;
export type RefinementOutcome = Readonly<{
  observationId: string; repairId: string | null; comparisonScope: string;
  unresolvedIssueKeys: readonly string[]; resolvedIssueKeys: readonly string[]; regressedIssueKeys: readonly string[];
  requiredEvidence: boolean;
}>;
export type RefinementPolicyInput = Readonly<{
  failureRisk: 'low' | 'moderate' | 'high'; purpose: 'ordinary' | 'benchmark' | 'release'; showpiece: boolean;
  requiredEvidence: boolean; requiredGatesGreen: boolean; scores: Readonly<Record<string, number>>;
  issues: readonly RefinementIssue[]; outcomes: readonly RefinementOutcome[];
  attemptedRepairIds: readonly string[]; allowance: number; differentRepairAvailable: boolean;
  regression: boolean; restoredCurrentSource: boolean;
}>;
export type RefinementPolicyDecision = Readonly<{
  action: 'continue' | 'accept' | 'rollback' | 'stop-blocked' | 'ask-user'; reason: string;
  releaseEligible: boolean; qualityAcceptance: 'standard' | 'high-risk' | 'showcase';
  acceptedAdvisoryIds: readonly string[]; unresolvedDefectIds: readonly string[];
  repeatedDefects: readonly { issueKey: string; observations: readonly string[]; repairs: readonly string[] }[];
  attemptsConsumed: number; reviewedPasses: number; allowance: number;
}>;

/** Correspondence excludes capture hashes and mutable finding prose. Native issueKey is preferred. */
export function stableRefinementIssueKey(input: Readonly<{ criterion: string; surface: string; state: string; component: string; role: string; consequenceCode: string }>): string {
  return createHash('sha256').update(JSON.stringify([input.criterion, input.surface, input.state, input.component, input.role, input.consequenceCode])).digest('hex');
}
export function repeatedRefinementDefects(outcomes: readonly RefinementOutcome[]) {
  const seenObservations = new Set<string>(), seenRepairs = new Set<string>();
  const active = new Map<string, { issueKey: string; observations: string[]; repairs: string[] }>();
  for (const outcome of outcomes) {
    if (seenObservations.has(outcome.observationId)) continue;
    seenObservations.add(outcome.observationId);
    if (!outcome.requiredEvidence) continue;
    for (const key of outcome.resolvedIssueKeys) {
      if (outcome.unresolvedIssueKeys.includes(key)) throw new Error('REFINEMENT_POLICY: one observation cannot both resolve and retain an issue');
      active.delete(key);
    }
    // Discovery, failed/no-evidence attempts and rechecking the same repair do not count as a failed repair observation.
    if (outcome.repairId === null || seenRepairs.has(outcome.repairId)) continue;
    seenRepairs.add(outcome.repairId);
    for (const key of new Set(outcome.unresolvedIssueKeys)) {
      const item = active.get(key) ?? { issueKey: key, observations: [], repairs: [] };
      item.observations.push(outcome.observationId); item.repairs.push(outcome.repairId); active.set(key, item);
    }
  }
  return [...active.values()].filter(item => item.observations.length >= 3);
}

/** Pure policy only. Callers must authenticate measurements, reviews, outcomes and required scope
 * before passing them here; this function does not turn caller booleans into release authority. */
export function decideRefinement(input: RefinementPolicyInput): RefinementPolicyDecision {
  if (!Number.isSafeInteger(input.allowance) || input.allowance < 1 || input.allowance > 20) throw new Error('REFINEMENT_POLICY: finite allowance required');
  const attemptsConsumed = new Set(input.attemptedRepairIds).size;
  const reviewed = [...new Map(input.outcomes.filter(o => o.requiredEvidence).map(o => [o.observationId, o])).values()];
  const qualityAcceptance = input.showpiece || input.purpose !== 'ordinary' ? 'showcase' : input.failureRisk === 'high' ? 'high-risk' : 'standard';
  const defects = input.issues.filter(i => i.severity !== 'advisory');
  const repeatedDefects = repeatedRefinementDefects(input.outcomes).filter(item => defects.some(i => i.issueKey === item.issueKey));
  const common = { qualityAcceptance, unresolvedDefectIds: [...new Set(defects.map(i => i.issueKey))], repeatedDefects,
    attemptsConsumed, reviewedPasses: reviewed.length, allowance: input.allowance } as const;
  const result = (action: RefinementPolicyDecision['action'], reason: string): RefinementPolicyDecision => ({ ...common, action, reason,
    releaseEligible: action === 'accept', acceptedAdvisoryIds: action === 'accept' ? input.issues.filter(i => i.severity === 'advisory').map(i => i.issueKey) : [] });
  if (!input.requiredEvidence) return result('stop-blocked', 'required-evidence-missing-or-invalid');
  if (repeatedDefects.length) return result('ask-user', 'same-defect-three-failed-repairs');
  if (input.regression && !input.restoredCurrentSource) return result('rollback', 'regression-requires-trusted-restoration-and-observation');
  const scores = Object.entries(input.scores);
  const floors = scores.map(([axis]) => axis).sort().join(',') === Object.keys(REFINEMENT_AXIS_FLOORS).sort().join(',')
    && scores.every(([axis, score]) => Number.isInteger(score) && score <= 4
      && score >= (qualityAcceptance === 'standard' ? 3 : REFINEMENT_AXIS_FLOORS[axis as MeasuredAxis]));
  const requiredFailure = !input.requiredGatesGreen || defects.length > 0 || !floors;
  if (requiredFailure) return attemptsConsumed < input.allowance && input.differentRepairAvailable
    ? result('continue', 'required-defect-with-different-repair') : result('stop-blocked', 'required-defect-not-waived-by-budget');
  if (!input.issues.length) return result('accept', 'all-required-criteria-met');
  const last = reviewed.at(-1), previous = reviewed.at(-2);
  const plateau = last && previous && last.comparisonScope === previous.comparisonScope
    && !last.unresolvedIssueKeys.length && !previous.unresolvedIssueKeys.length
    && !last.regressedIssueKeys.length && !previous.regressedIssueKeys.length && !last.resolvedIssueKeys.length;
  if (qualityAcceptance === 'standard' && (plateau || attemptsConsumed >= input.allowance)) return result('accept', 'optional-polish-limit-disclosed');
  // Optional suggestions alone do not require work; stricter policies still use their exact floors.
  return result('accept', 'required-bar-met-with-optional-advice');
}
