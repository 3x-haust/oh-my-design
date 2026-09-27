import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptiveStageOwners } from '../core/route/adaptive-stage-graph.ts';
import { SELECTED_ART_REGISTERS, parseSelectedArtDirectionInput } from '../core/art-direction/selected.ts';
import { assertRoleDelivery } from './helpers/prompt-delivery.ts';

test('chosen-direction author and consumers are registered without changing historical owner replay', () => {
  assert.equal(adaptiveStageOwners(true)['art-direction'], 'omd-art-director');
  assert.equal(adaptiveStageOwners(false)['art-direction'], 'coordinator');
  for (const role of ['art-director', 'composer', 'writer', 'hand', 'eye']) assertRoleDelivery(role);
});

test('candidate-bound art schema admits content-led static work and refuses an author-only motion pass', () => {
  assert.ok(SELECTED_ART_REGISTERS.includes('content-led'));
  assert.throws(() => parseSelectedArtDirectionInput({ schema: 'art-direction-input-v3', selectedId: 'A', motion: { decision: 'one', pass: true } }));
});
