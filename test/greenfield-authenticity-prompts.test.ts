import assert from 'node:assert/strict';
import test from 'node:test';
import { readBuildAgents } from '../adapters/build-identity.ts';
import { ADAPTIVE_BEHAVIOR_POLICY } from '../core/route/index.ts';
import { assertRoleDelivery, promptRoot } from './helpers/prompt-delivery.ts';
import { parseValidationPlan } from '../core/frame/process-plan.ts';

test('reality owner/consumer ABI survives prompt emission', () => {
  const agents = readBuildAgents(promptRoot);
  for (const [role, sentinel] of [['framer', 'reality-owner'], ['composer', 'composition-consumer'], ['sketch', 'sketch-consumer'], ['hand', 'production-consumer'], ['eye', 'review-gate']]) {
    assert.ok(agents.find(a => a.name === `omd-${role}`)!.instructions.includes(`[greenfield-authenticity:${sentinel}]`));
    assertRoleDelivery(role!);
  }
});

test('historical product visual policy remains semantic rather than a marketing carrier requirement', () => {
  const visual = ADAPTIVE_BEHAVIOR_POLICY.visual;
  assert.equal(visual.colourDistribution, 'surface-conditional');
  assert.equal(visual.productColourStrategy, 'semantic-action-state');
  assert.equal(visual.productCarrierRequired, false);
  assert.equal(visual.motionNoneRequiresStaticBreak, false);
  assert.ok(visual.reviewVerdicts.includes('reality-fit'));
  assert.equal(visual.greenfield.facts, 'verified-or-labelled-demo');
});

test('planned participant prose cannot impersonate observed human validation', () => {
  assert.throws(() => parseValidationPlan({ schema: 'validation-plan-v1', items: [{ id: 'research', status: 'observed', evidence: [] }] }));
  assert.deepEqual(parseValidationPlan({ schema: 'validation-plan-v1', items: [] }).items, []);
});
