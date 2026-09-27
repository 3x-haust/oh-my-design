import assert from 'node:assert/strict';
import test from 'node:test';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { parseProcessPolicy } from '../core/route/process-policy.ts';
import { buildRoleBrief } from '../core/brief/role.ts';
import { fixture, pack } from './helpers/phase6-process.ts';

test('current route starters declare interactive direction; legacy omission is not autonomy', () => {
  for (const name of ['route-input', 'product-route-input', 'design-route-input']) {
    const input = inputSkeleton(name).skeleton as { processPolicy: unknown };
    assert.equal(parseProcessPolicy(input.processPolicy).interactionMode, 'interactive');
  }
  assert.throws(() => parseProcessPolicy({ schema: 'human-design-process-v1', interactionMode: 'autonomous', autonomyGrant: null }));
});

test('preproduction and production Eye profiles do not receive raw coordinator evidence or assert isolation', t => {
  const f = fixture(t);
  for (const mode of ['visual-study', 'concept-selection', 'typography-proof', 'copy-editor', 'production-visual']) {
    const result = buildRoleBrief(f.root, 'independent-review', { role: 'omd-eye', mode }, pack, f.invocation);
    assert.equal(result.delivery, 'isolated-host-packet-required');
    assert.deepEqual(result.inputs, []); assert.deepEqual(result.images, []);
    assert.equal(result.profile?.mode, mode);
    assert.equal('references' in result, false);
    assert.equal('scope' in result, false);
  }
});
