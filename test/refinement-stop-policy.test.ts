import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideRefinement, repeatedRefinementDefects, stableRefinementIssueKey, REFINEMENT_AXIS_FLOORS, type RefinementPolicyInput, type RefinementOutcome } from '../core/route/refinement-policy.ts';
import { adaptiveRefinementDisposition } from '../core/route/adaptive-refinement.ts';
const base: RefinementPolicyInput = { failureRisk: 'low', purpose: 'ordinary', showpiece: false, requiredEvidence: true, requiredGatesGreen: true,
  scores: Object.fromEntries(Object.keys(REFINEMENT_AXIS_FLOORS).map(axis => [axis, 3])), issues: [], outcomes: [], attemptedRepairIds: [], allowance: 4,
  differentRepairAvailable: true, regression: false, restoredCurrentSource: false };
const observation = (n: number): RefinementOutcome => ({ observationId: `render-${n}`, repairId: `repair-${n}`, comparisonScope: `scope-${n}`, unresolvedIssueKeys: ['clipped-control'], resolvedIssueKeys: [], regressedIssueKeys: [], requiredEvidence: true });

test('initial clean all-3 ordinary work accepts without a fabricated pair; stricter purpose/risk retain floors', () => {
  assert.equal(decideRefinement(base).action, 'accept');
  for (const input of [{ ...base, failureRisk: 'high' as const }, { ...base, purpose: 'release' as const }, { ...base, showpiece: true }]) assert.equal(decideRefinement(input).releaseEligible, false);
  assert.equal(decideRefinement({ ...base, failureRisk: 'high', scores: REFINEMENT_AXIS_FLOORS }).action, 'accept');
  assert.equal(adaptiveRefinementDisposition({ methods: ['evidence-driven-refinement'] }, 'green', true).action, 'stop');
  assert.equal(adaptiveRefinementDisposition({ methods: ['evidence-driven-refinement'] }, 'green').action, 'run');
});

test('budget never waives task/access/safety/stress/material failure or missing native evidence', () => {
  for (const severity of ['task', 'accessibility', 'safety', 'material'] as const) {
    const result = decideRefinement({ ...base, attemptedRepairIds: ['1', '2', '3', '4'], issues: [{ issueKey: 'stress', criterionId: 'overflow', severity, consequence: 'Required content unavailable.' }] });
    assert.equal(result.action, 'stop-blocked'); assert.equal(result.releaseEligible, false);
  }
  assert.equal(decideRefinement({ ...base, requiredEvidence: false }).action, 'stop-blocked');
  assert.equal(decideRefinement({ ...base, scores: {} }).releaseEligible, false);
});

test('third distinct failed repair asks, duplicate reads and scope changes do not reset correspondence', () => {
  const outcomes = [{ ...observation(0), repairId: null }, observation(1), observation(1), observation(2), observation(3)];
  const result = decideRefinement({ ...base, outcomes, issues: [{ issueKey: 'clipped-control', criterionId: 'clipping', severity: 'material', consequence: 'Reworded finding, same lost action.' }], attemptedRepairIds: ['repair-1', 'repair-2', 'repair-3'] });
  assert.equal(result.action, 'ask-user'); assert.equal(result.repeatedDefects[0]!.observations.length, 3);
  assert.deepEqual(repeatedRefinementDefects(JSON.parse(JSON.stringify(outcomes))), result.repeatedDefects);
  assert.deepEqual(repeatedRefinementDefects([...outcomes, { ...observation(4), unresolvedIssueKeys: [], resolvedIssueKeys: ['clipped-control'] }]), []);
});

test('rollback precedes release; optional advice is disclosed without changing actual scores', () => {
  assert.equal(decideRefinement({ ...base, regression: true }).action, 'rollback');
  assert.equal(decideRefinement({ ...base, regression: true, restoredCurrentSource: true }).action, 'accept');
  const result = decideRefinement({ ...base, issues: [{ issueKey: 'optical-polish', criterionId: 'rhythm', severity: 'advisory', consequence: 'Optional local spacing refinement.' }] });
  assert.deepEqual(result.acceptedAdvisoryIds, ['optical-polish']); assert.equal(result.releaseEligible, true);
  assert.equal(stableRefinementIssueKey({ criterion: 'clip', surface: 'main', state: 'error', component: 'form', role: 'button', consequenceCode: 'action-hidden' }).length, 64);
});
