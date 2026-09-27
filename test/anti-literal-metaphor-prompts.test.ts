import assert from 'node:assert/strict';
import test from 'node:test';
import { readBuildAgents } from '../adapters/build-identity.ts';
import { promptRoot, assertRoleDelivery } from './helpers/prompt-delivery.ts';
import { selectedArtCopyProjection, type SelectedArtRecord } from '../core/art-direction/selected.ts';

test('machine-consumed metaphor router and role sentinels survive source-to-host emission', () => {
  const agents = readBuildAgents(promptRoot);
  for (const [role, sentinel] of [['composer', 'visual-consumer'], ['hand', 'visual-consumer'], ['eye', 'literal-rejection-review'], ['writer', 'copy-excluded']]) {
    assert.ok(agents.find(a => a.name === `omd-${role}`)!.instructions.includes(`[metaphor-contract:${sentinel}]`));
    assertRoleDelivery(role!);
  }
});

test('copy-safe selected direction projection excludes private metaphor and rejection fields', () => {
  const record = { decision: { selectedId: 'A', candidateSelection: { path: 'choice.json', sha256: 'a'.repeat(64) }, register: 'content-led', motion: { decision: 'none' }, beatIds: [], metaphorQualities: ['private-quality'], literalPropsToReject: ['private-prop'] } } as unknown as SelectedArtRecord;
  assert.deepEqual(Object.keys(selectedArtCopyProjection(record)).sort(), ['schema', 'selectedId', 'candidateSelection', 'register', 'motionDecision', 'beatIds'].sort());
});
