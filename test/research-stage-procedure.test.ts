import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildBrief } from '../core/brief/index.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';

test('the reference-board repair owner receives authoring schemas for all selected research prerequisites', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-research-procedure-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  const invocation = publishTestAdaptiveRoute(root, input);
  const brief = buildBrief(root, 'reference-board', undefined, invocation);
  for (const name of ['reference-search', 'reference-research', 'reference-flow-input', 'task-flow-benchmark']) {
    assert.ok(brief.schemas.some(schema => schema.name === name), `missing repair authoring schema ${name}`);
    assert.ok(inputSkeleton(name).path.startsWith('.omd/'));
  }
});
