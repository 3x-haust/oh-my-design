import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inventoryProjectRunMutations } from '../core/runtime/project-write-inventory.ts';
test('project CLI mutation inventory has no unclassified writers', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const inventory = inventoryProjectRunMutations(root);
  assert.deepEqual(inventory.unguardedMutations, []);
});
