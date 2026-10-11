import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inventoryProjectRunMutations } from '../core/runtime/project-write-inventory.ts';
test('zoom profile exception admits only its fixed private temp lifecycle', () => {
  const path = 'core/render/browser-zoom.ts', source = readFileSync(new URL('../core/render/browser-zoom.ts', import.meta.url), 'utf8');
  for (const changed of [false, true]) {
    // Distinct paths avoid depending on asynchronous compiler file-watch invalidation.
    const root = mkdtempSync(join(tmpdir(), 'omd-zoom-inventory-test-'));
    try {
      mkdirSync(join(root, 'core/render'), { recursive: true });
      writeFileSync(join(root, path), changed ? source.replace('rmSync(profile,', "rmSync('/unapproved-target',") : source);
      assert.equal(inventoryProjectRunMutations(root, path).unguardedMutations.length > 0, changed);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
