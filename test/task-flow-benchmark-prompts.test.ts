import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readBuildAgents } from '../adapters/build-identity.ts';
import { assertRoleDelivery, promptRoot } from './helpers/prompt-delivery.ts';
import { parseSurfacePlan, requiredSurfaceCells } from '../core/frame/process-plan.ts';
import { surfacePlan } from './helpers/phase6-process.ts';

test('selected roles preserve the machine task-flow benchmark ABI through host emission', () => {
  const agents = readBuildAgents(promptRoot);
  for (const role of ['scout', 'composer', 'sketch', 'hand', 'eye']) {
    assert.ok(agents.find(a => a.name === `omd-${role}`)!.instructions.includes('TASK_FLOW_BENCHMARK_ABI_V2'));
    assertRoleDelivery(role);
  }
});

test('marketing surfaces retain real view coverage without fabricated product task rows', () => {
  const plan = parseSurfacePlan(surfacePlan);
  assert.deepEqual(plan.surfaces.flatMap(s => s.taskIds), []);
  assert.equal(requiredSurfaceCells(plan).length, 3);
  assert.ok(requiredSurfaceCells(plan).some(c => c.surfaceId === 'details'));
});
