import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readReferenceSelectionV2 } from '../core/ref/reference-selection.ts';

test('settled selection reads fail before settlement has persisted an authorized record', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-selection-v2-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  assert.throws(() => readReferenceSelectionV2(root));
});
